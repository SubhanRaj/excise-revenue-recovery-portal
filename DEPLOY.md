# Deploying the Excise Revenue Recovery Portal

Two independent Cloudflare deployments — an API Worker (`/api`, via OpenNext) and a Pages
static site (`/frontend`) — plus one D1 database. This doc is the source of truth for
current production state and the exact commands to redeploy or rebuild from scratch. See
[ROADMAP.md](./ROADMAP.md) for what's shipped (each deploy-affecting milestone is logged
there) and [CLAUDE.md](./CLAUDE.md) for how the system itself works.

## Current production deployment

| Resource        | Value                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Cloudflare account | `Subhan` (`4d93d751987b8d9ff101445570e72711`)                       |
| API Worker        | `excise-revenue-recovery-api` — https://excise-revenue-recovery-api.shubhanraj2002.workers.dev |
| Pages project      | `excise-revenue-recovery-portal` — https://excise-revenue-recovery-portal.pages.dev |
| D1 database        | `excise-revenue-recovery-db` (id `4f3e37fd-006a-4bce-b2d3-4bfb8bb16248`), region APAC |
| Superadmin         | `shubhanraj2002@gmail.com` (role `admin`, signs in via Magic Link)   |

Auth to Cloudflare: `pnpm exec wrangler whoami` (already logged in via OAuth on this machine).
Re-auth elsewhere with `pnpm exec wrangler login`.

## CI/CD — GitHub Actions is the primary deploy path

`.github/workflows/ci.yml` and `deploy.yml` typecheck/build/deploy `api/` and `frontend/`
independently, path-filtered so a docs-only commit doesn't trigger anything. Deploys run
automatically on push to `master` when `api/**` or `frontend/**` actually changed, and can
always be triggered manually regardless of what changed:

```bash
gh workflow run deploy.yml -f target=both     # or target=api / target=frontend
gh run watch <run-id> --exit-status           # follow it live
```

Secrets used by the workflows (`gh secret list --repo SubhanRaj/excise-revenue-recovery-portal`):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Manual `wrangler` commands below still work
for local development and emergency redeploys, but treat GitHub Actions as the source of
truth for what's actually live — see TESTING.md's Incidents section for why: this Pages
project used to also have a **Cloudflare Git integration** silently auto-building on every
push with a completely wrong config, racing every manual deploy. That's been disconnected;
these two workflows are the only thing that deploys this project now. If production ever
looks fixed after a manual `wrangler` deploy but reverts a few minutes later, suspect a
competing deploy path before re-diagnosing the app (see TESTING.md).

## One-time setup (already done — for reference / disaster recovery)

```bash
cd api
pnpm exec wrangler d1 create excise-revenue-recovery-db
# → paste the printed database_id into api/wrangler.jsonc's d1_databases[0].database_id

pnpm run db:generate           # drizzle-kit generate, only needed after schema.ts changes
pnpm run db:migrate:remote     # applies drizzle/[0-9]*.sql to remote D1
pnpm run db:seed:remote        # inserts 75 districts + bootstrap admin (drizzle/seed.sql)

cd ../frontend
pnpm exec wrangler pages project create excise-revenue-recovery-portal --production-branch main
```

If you ever need to point the bootstrap admin at a different email, either edit
`api/drizzle/seed.sql` before a fresh seed, or patch it live:

```bash
pnpm exec wrangler d1 execute excise-revenue-recovery-db --remote \
  --command "UPDATE users SET email = 'someone@example.com' WHERE role = 'admin';"
```

## Secrets

Set once per Worker via `wrangler secret put <NAME>` (reads the value from stdin — pipe it,
don't type it into a prompt that ends up in shell history):

```bash
cd api
openssl rand -base64 48 | pnpm exec wrangler secret put JWT_SECRET
echo "re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" | pnpm exec wrangler secret put RESEND_API_KEY
echo "https://excise-revenue-recovery-portal.pages.dev" | pnpm exec wrangler secret put FRONTEND_URL
echo "noreply@mail.exciseup.in" | pnpm exec wrangler secret put FROM_EMAIL
echo "the-owners-actual-login-email@example.com" | pnpm exec wrangler secret put OWNER_EMAIL
```

- `JWT_SECRET` — signs both the admin and DEO session tokens (`api/lib/session.ts`), returned in
  the verify response body and sent back as `Authorization: Bearer <token>` (not a cookie — see
  CLAUDE.md's Auth section for why). Rotating it invalidates every active session.
- `RESEND_API_KEY` — sends magic-link emails (`api/app/api/auth/request-magic-link/route.ts`).
- `FRONTEND_URL` — must exactly match the Pages production origin. Used both as the
  magic-link redirect target and as the sole allowed CORS origin in `api/middleware.ts` —
  get this wrong and every `/api/*` call from the frontend fails CORS, not just auth.
- `FROM_EMAIL` — sender address for magic-link email, `noreply@mail.exciseup.in`. `mail.exciseup.in`
  is verified in Resend and this same address is reused across all UP Excise projects on the same
  Resend account (see the sibling `up-excise-spatial-revenue-optimizer` project's DEPLOY.md, which
  uses the same domain under its own `RESEND_FROM_EMAIL` secret name). Falls back to Resend's
  shared sandbox sender (`onboarding@resend.dev`) in code if this secret is ever unset — see
  `api/app/api/auth/request-magic-link/route.ts`.
- `OWNER_EMAIL` — the one admin account allowed to run DEO Provisioning
  (`/admin/districts/provisioning`; see `api/app/api/auth/me/route.ts`'s `isOwner` and
  `api/app/api/admin/provision-deos/route.ts`'s server-side check). Every other admin account
  (department officials) has the link hidden and gets a 403 if they hit the API route directly.

List what's set (values are never shown) with `pnpm exec wrangler secret list`. There is no
`db:seed`-equivalent "put a secret for every DEO" step — DEO accounts (`cug_hash`, one row
per district in `users`) are provisioned by hand via `wrangler d1 execute --remote`; see
CLAUDE.md's "Known gaps" section.

Local dev uses `api/.dev.vars` (copy from `.dev.vars.example`) instead — never commit that
file; it's gitignored.

## Redeploying the API (after code changes)

```bash
cd api
pnpm run deploy    # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
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
pnpm run db:generate
pnpm run db:migrate:remote   # and db:migrate:local for your local D1 too
```

## Redeploying the frontend (after code changes)

```bash
cd frontend
NEXT_PUBLIC_API_URL="https://excise-revenue-recovery-api.shubhanraj2002.workers.dev" pnpm run build
pnpm run pages:deploy   # = wrangler pages deploy out --project-name ... --branch master
```

A `--branch` matching the Pages project's production branch is required for a *Production*
deployment with the stable `https://excise-revenue-recovery-portal.pages.dev` URL — anything
else lands as a *Preview* on a random per-deploy subdomain (harmless to try, but not what
users will see). The project was created with `--production-branch main`, but this repo's actual branch is
`master`, and in practice `--branch master` is what reliably produces a `Production`
deployment — confirm with
`pnpm exec wrangler pages deployment list --project-name excise-revenue-recovery-portal` after
any deploy rather than trusting the `--branch` value blindly. This is now a direct-upload
project with no Git integration (see the CI/CD section above for why that matters) — all
deploys are either the GitHub Actions workflows or a manual `wrangler`/`pnpm run` command.

`NEXT_PUBLIC_API_URL` is baked in at build time (`frontend/lib/config.ts`) since this is a
static export with no server to read env vars at request time. Changing it means rebuilding
and redeploying, not just changing a Cloudflare dashboard setting.

## Verifying a deployment

```bash
API=https://excise-revenue-recovery-api.shubhanraj2002.workers.dev
FRONT=https://excise-revenue-recovery-portal.pages.dev

curl -s -o /dev/null -w "%{http_code}\n" "$API/api/auth/me"   # expect 401, no Authorization header sent

curl -s -i -X OPTIONS "$API/api/auth/request-magic-link" \
  -H "Origin: $FRONT" -H "Access-Control-Request-Method: POST" \
  | grep -i access-control                                    # expect the Pages origin echoed back

curl -s -i "$FRONT/login" | head -1                            # expect HTTP/2 200, not 503
```

A `503` with title "Node.JS Compatibility Error" on `$FRONT` means you're looking at a
stale/broken Pages deployment, not a real code issue — see TESTING.md's Incidents section.
Redeploy (`pnpm run pages:deploy` in `frontend/`) and recheck before assuming it's a defect.

Then in a real browser (or run `pnpm run e2e` in `frontend/` — see TESTING.md): sign in at
`$FRONT/login` with the superadmin email, confirm the Magic Link email arrives, click
through, and confirm `/admin` loads the 75 districts.

**`gh run list` showing the latest run as `success` is not enough** — `deploy.yml`'s two jobs
are path-filtered (`api/**` / `frontend/**`), so a run that only touched one app shows the
other job as `skipped`, and a *skipped* job on a green run can be hiding a *failed* job on an
earlier run for that same path (see TESTING.md's 2026-07-18 incident, where the API Worker ran
stale code in production for several commits this way). Whenever `api/` changed, check the run
that actually touched it:

```bash
gh run list --workflow=deploy.yml --limit 5 --json databaseId,headSha,conclusion
gh run view <databaseId> --json jobs -q '.jobs[] | {name, status, conclusion}'
```

and cross-check the Worker itself redeployed (not just that Actions reports green):

```bash
cd api && pnpm exec wrangler deployments list   # latest "Created:" should match the push time
```

A quick live route check (200/401 is fine, 500 is not) is worth running after any `api/**`
deploy too — a `500` here on a route that should just be an auth check means the Worker itself
is broken, not merely unauthenticated:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/auth/me?role=admin"       # expect 401
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/admin/unlock-requests"    # expect 401
```

## Known deployment constraints

- **Frontend/API are cross-origin in production** (`*.pages.dev` vs `*.workers.dev`). Session
  auth used to be two `SameSite=None; Secure` cookies, which is exactly the shape of cookie
  Safari ITP blocks and Chrome blocks under common conditions (Incognito, a locked-down
  profile) — this broke real logins in production (see TESTING.md's Incidents section), so auth
  was migrated to a Bearer token instead (`api/lib/session.ts`, `frontend/lib/session.ts` — see
  CLAUDE.md's Auth section for the full writeup). `api/middleware.ts` now sends
  `Access-Control-Allow-Origin: *` with no credentials mode, since a Bearer token carries no
  ambient browser credential for a wildcard origin to expose. If you later put a custom domain
  in front of both under one zone (e.g. a Worker Route or Pages Function for
  `example.com/api/*` — no separate server needed, just the domain + that routing), **switch
  auth back to `HttpOnly` cookies** at that point; same-site cookies are the more secure option
  and the only reason this app is on Bearer tokens is the two-origins constraint. Don't do
  either migration speculatively; only if a real custom domain shows up.
- **SheetJS export can't freeze panes** on the free CDN build used in `frontend/app/layout.tsx`
  — that's a SheetJS Pro feature. Not a deployment issue, just don't expect the exported
  `.xlsx` header row to actually freeze; see `frontend/lib/export.ts`.
- D1 database region is APAC (set at creation, `wrangler d1 create` doesn't currently
  expose a region flag — Cloudflare places it near where you ran the command).
- **A deploy that lands as `Preview` instead of `Production`** (wrong `--branch`, see the
  redeploy section above) doesn't just miss the stable URL — it can leave multiple
  deployments simultaneously tagged `Production` in Cloudflare's history, and different
  edges have been observed serving different (including stale) ones inconsistently until a
  clean redeploy settles it. Always confirm with
  `pnpm exec wrangler pages deployment list --project-name excise-revenue-recovery-portal` and a
  `curl -i` status-code check after deploying, not just "the command exited 0."
