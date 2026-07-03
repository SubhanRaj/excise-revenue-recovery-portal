# Deploying the Excise Revenue Recovery Portal

Two independent Cloudflare deployments — an API Worker (`/api`, via OpenNext) and a Pages
static site (`/frontend`) — plus one D1 database. This doc is the source of truth for
current production state and the exact commands to redeploy or rebuild from scratch.

## Current production deployment

| Resource        | Value                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Cloudflare account | `Subhan` (`4d93d751987b8d9ff101445570e72711`)                       |
| API Worker        | `excise-revenue-recovery-api` — https://excise-revenue-recovery-api.shubhanraj2002.workers.dev |
| Pages project      | `excise-revenue-recovery-portal` — https://excise-revenue-recovery-portal.pages.dev |
| D1 database        | `excise-revenue-recovery-db` (id `4f3e37fd-006a-4bce-b2d3-4bfb8bb16248`), region APAC |
| Superadmin         | `shubhanraj2002@gmail.com` (role `admin`, signs in via Magic Link)   |

Auth to Cloudflare: `npx wrangler whoami` (already logged in via OAuth on this machine).
Re-auth elsewhere with `npx wrangler login`.

## One-time setup (already done — for reference / disaster recovery)

```bash
cd api
npx wrangler d1 create excise-revenue-recovery-db
# → paste the printed database_id into api/wrangler.jsonc's d1_databases[0].database_id

npm run db:generate           # drizzle-kit generate, only needed after schema.ts changes
npm run db:migrate:remote     # applies drizzle/[0-9]*.sql to remote D1
npm run db:seed:remote        # inserts 75 districts + bootstrap admin (drizzle/seed.sql)

cd ../frontend
npx wrangler pages project create excise-revenue-recovery-portal --production-branch main
```

If you ever need to point the bootstrap admin at a different email, either edit
`api/drizzle/seed.sql` before a fresh seed, or patch it live:

```bash
npx wrangler d1 execute excise-revenue-recovery-db --remote \
  --command "UPDATE users SET email = 'someone@example.com' WHERE role = 'admin';"
```

## Secrets

Set once per Worker via `wrangler secret put <NAME>` (reads the value from stdin — pipe it,
don't type it into a prompt that ends up in shell history):

```bash
cd api
openssl rand -base64 48 | npx wrangler secret put JWT_SECRET
echo "re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" | npx wrangler secret put RESEND_API_KEY
echo "https://excise-revenue-recovery-portal.pages.dev" | npx wrangler secret put FRONTEND_URL
```

- `JWT_SECRET` — signs the `__session` cookie (`api/lib/session.ts`). Rotating it
  invalidates every active session.
- `RESEND_API_KEY` — sends magic-link emails (`api/app/api/auth/request-magic-link/route.ts`).
- `FRONTEND_URL` — must exactly match the Pages production origin. Used both as the
  magic-link redirect target and as the sole allowed CORS origin in `api/middleware.ts` —
  get this wrong and every `/api/*` call from the frontend fails CORS, not just auth.

List what's set (values are never shown) with `npx wrangler secret list`. There is no
`db:seed`-equivalent "put a secret for every DEO" step — DEO accounts (`cug_hash`, one row
per district in `users`) are provisioned by hand via `wrangler d1 execute --remote`; see
CLAUDE.md's "Known gaps" section.

Local dev uses `api/.dev.vars` (copy from `.dev.vars.example`) instead — never commit that
file; it's gitignored.

## Redeploying the API (after code changes)

```bash
cd api
npm run deploy    # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

**Do not rename `api/middleware.ts` to `proxy.ts`.** Next 16 renamed the middleware
convention to `proxy.ts` and defaults it to the Node.js runtime, but
`@opennextjs/cloudflare@1.20.1` hard-fails the build on Node middleware
("Node.js middleware is not currently supported. Consider switching to Edge Middleware.").
The legacy `middleware.ts` convention still works (Edge runtime, just a deprecation
warning) and is what's deployed. Re-check this constraint before upgrading
`@opennextjs/cloudflare`.

If `api/db/schema.ts` changed:

```bash
npm run db:generate
npm run db:migrate:remote   # and db:migrate:local for your local D1 too
```

## Redeploying the frontend (after code changes)

```bash
cd frontend
NEXT_PUBLIC_API_URL="https://excise-revenue-recovery-api.shubhanraj2002.workers.dev" npm run build
npm run pages:deploy   # = wrangler pages deploy out --project-name ... --branch master
```

A `--branch` matching the Pages project's production branch is required for a *Production*
deployment with the stable `https://excise-revenue-recovery-portal.pages.dev` URL — anything
else lands as a *Preview* on a random per-deploy subdomain (harmless to try, but not what
users will see). The project was created with `--production-branch main`, but this is a
direct-upload project with no Git integration, and in practice `--branch master` (this
repo's actual local branch) is what reliably produces a `Production` deployment — confirm
with `npx wrangler pages deployment list --project-name excise-revenue-recovery-portal`
after any deploy rather than trusting the `--branch` value blindly.

`NEXT_PUBLIC_API_URL` is baked in at build time (`frontend/lib/config.ts`) since this is a
static export with no server to read env vars at request time. Changing it means rebuilding
and redeploying, not just changing a Cloudflare dashboard setting.

## Verifying a deployment

```bash
API=https://excise-revenue-recovery-api.shubhanraj2002.workers.dev
FRONT=https://excise-revenue-recovery-portal.pages.dev

curl -s -o /dev/null -w "%{http_code}\n" "$API/api/auth/me"   # expect 401, no cookie sent

curl -s -i -X OPTIONS "$API/api/auth/request-magic-link" \
  -H "Origin: $FRONT" -H "Access-Control-Request-Method: POST" \
  | grep -i access-control                                    # expect the Pages origin echoed back

curl -s -o /dev/null -w "%{http_code}\n" "$FRONT/login"        # expect 200
```

Then in a real browser: sign in at `$FRONT/login` with the superadmin email, confirm the
Magic Link email arrives, click through, and confirm `/admin` loads the 75 districts.

## Known deployment constraints

- **Frontend/API are cross-origin in production** (`*.pages.dev` vs `*.workers.dev`), so
  the `__session` cookie is `SameSite=None; Secure` and every `/api/*` response carries
  explicit CORS headers gated on `FRONTEND_URL` (`api/middleware.ts`). If you later put a
  custom domain in front of both under one zone (e.g. a Worker route for
  `example.com/api/*`), this whole cross-origin setup — and `middleware.ts` — becomes
  unnecessary. Don't do that migration speculatively; only if a real custom domain shows up.
- **SheetJS export can't freeze panes** on the free CDN build used in `frontend/app/layout.tsx`
  — that's a SheetJS Pro feature. Not a deployment issue, just don't expect the exported
  `.xlsx` header row to actually freeze; see `frontend/lib/export.ts`.
- D1 database region is APAC (set at creation, `wrangler d1 create` doesn't currently
  expose a region flag — Cloudflare places it near where you ran the command).
