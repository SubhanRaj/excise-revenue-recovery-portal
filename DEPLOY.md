# Deploying the Excise Revenue Recovery Portal

One Cloudflare Worker (`/api`, via OpenNext — serves both the UI and `/api/*`) plus one D1
database. This doc is the source of truth for current production state and the exact commands
to redeploy or rebuild from scratch. See [ROADMAP.md](./ROADMAP.md) for what's shipped (each
deploy-affecting milestone is logged there) and [CLAUDE.md](./CLAUDE.md) for how the system
itself works.

**This reflects the current live state — Milestone 41's app merge and production cutover are
both done.** `excisebakaya.exciseup.in` is served entirely by the single merged Worker; the old
`excise-revenue-recovery-portal` Pages project (and its `*.pages.dev` URL) no longer exist. See
"How the cutover happened" below for how this went, kept for reference in case a future
migration needs a similar runbook.

## Current production deployment

| Resource        | Value                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Cloudflare account | `Subhan` (`4d93d751987b8d9ff101445570e72711`)                       |
| Custom domain (primary) | https://excisebakaya.exciseup.in — a Worker Route matching the whole domain (`/*`), not path-scoped to `/api/*` anymore (see ROADMAP.md's Milestone 41) |
| Worker            | `excise-revenue-recovery-api` — serves the UI and `/api/*` both. Name kept from before the merge (see CLAUDE.md's Repo shape); its `*.workers.dev` URL is **retired** (`workers_dev: false` in `api/wrangler.jsonc`, see ROADMAP.md's Milestone 39) |
| Pages project      | **retired** (Milestone 41) — the old `/frontend` static-export app and its Pages project no longer exist; there is no `*.pages.dev` URL to worry about anymore |
| D1 database        | `excise-revenue-recovery-db` (id `4f3e37fd-006a-4bce-b2d3-4bfb8bb16248`), region APAC — unchanged by the Milestone 41 app merge, same database, same binding |
| Superadmin         | `shubhanraj2002@gmail.com` (role `admin`, signs in via Magic Link)   |

Auth to Cloudflare: `pnpm exec wrangler whoami` (already logged in via OAuth on this machine).
Re-auth elsewhere with `pnpm exec wrangler login`.

## CI/CD — GitHub Actions is the primary deploy path

`.github/workflows/ci.yml` and `deploy.yml` each have a single job now (Milestone 41 collapsed
the old path-filtered `api`/`frontend` split — there's only one app to typecheck/build/deploy).
Deploys run automatically on push to `master` when `api/**` actually changed, and can always be
triggered manually regardless:

```bash
gh workflow run deploy.yml
gh run watch <run-id> --exit-status           # follow it live
```

Secrets used by the workflow (`gh secret list --repo SubhanRaj/excise-revenue-recovery-portal`):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Manual `wrangler` commands below still work
for local development and emergency redeploys, but treat GitHub Actions as the source of
truth for what's actually live — see TESTING.md's Incidents section for why: this project used
to also have a **Cloudflare Pages Git integration** silently auto-building on every push with a
completely wrong config, racing every manual deploy, back when a Pages project existed at all.
That's long gone along with the Pages project itself; this one workflow is the only thing that
deploys this project now. If production ever looks fixed after a manual `wrangler` deploy but
reverts a few minutes later, suspect a competing deploy path before re-diagnosing the app (see
TESTING.md).

## One-time setup (already done — for reference / disaster recovery)

```bash
cd api
pnpm exec wrangler d1 create excise-revenue-recovery-db
# → paste the printed database_id into api/wrangler.jsonc's d1_databases[0].database_id

pnpm run db:generate           # drizzle-kit generate, only needed after schema.ts changes
pnpm run db:migrate:remote     # applies drizzle/[0-9]*.sql to remote D1
pnpm run db:seed:remote        # inserts 75 districts + bootstrap admin (drizzle/seed.sql)
```

(There is no separate frontend setup step anymore — one app, one `wrangler.jsonc`, one deploy.)

If you ever need to point the bootstrap admin at a different email, either edit
`api/drizzle/seed.sql` before a fresh seed, or patch it live:

```bash
pnpm exec wrangler d1 execute excise-revenue-recovery-db --remote \
  --command "UPDATE users SET email = 'someone@example.com' WHERE role = 'admin';"
```

## Secrets

Set once for the Worker via `wrangler secret put <NAME>` (reads the value from stdin — pipe it,
don't type it into a prompt that ends up in shell history):

```bash
cd api
openssl rand -base64 48 | pnpm exec wrangler secret put JWT_SECRET
echo "re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" | pnpm exec wrangler secret put RESEND_API_KEY
echo "https://excisebakaya.exciseup.in" | pnpm exec wrangler secret put FRONTEND_URL
echo "noreply@mail.exciseup.in" | pnpm exec wrangler secret put FROM_EMAIL
echo "the-owners-actual-login-email@example.com" | pnpm exec wrangler secret put OWNER_EMAIL
```

- `JWT_SECRET` — signs both the admin and DEO session tokens (`api/lib/session.ts`), set as an
  `HttpOnly`/`Secure`/`SameSite=Lax` cookie on the verify response (`__admin_session`/
  `__deo_session` — see CLAUDE.md's Auth section). Rotating it invalidates every active session.
- `RESEND_API_KEY` — sends magic-link emails (`api/app/api/auth/request-magic-link/route.ts`).
- `FRONTEND_URL` — the magic-link redirect target, `https://excisebakaya.exciseup.in` (same
  domain the app itself is served from, now that it's one app — this secret name predates the
  Milestone 41 merge and was kept as-is rather than renamed, since renaming a Worker secret in
  place is just as disruptive as adding a new one).
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

## Redeploying (after code changes)

```bash
cd api
pnpm run deploy    # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

One command, one deploy — there is no separate frontend redeploy step anymore.

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

## Verifying a deployment

```bash
API=https://excisebakaya.exciseup.in

curl -s -o /dev/null -w "%{http_code}\n" "$API/api/auth/me?role=admin"   # expect 401, no cookie sent
curl -s -i "$API/login" | head -1                                       # expect HTTP/2 200
```

Then in a real browser (or run `pnpm run e2e` in `api/` — see TESTING.md): sign in at
`$API/login` with the superadmin email, confirm the Magic Link email arrives, click
through, and confirm `/admin` loads the 75 districts.

**`gh run list` showing the latest run as `success` is confirmation enough now** — with a
single job (Milestone 41), there's no longer a path-filtered job that can silently show
`skipped` while hiding a stale deploy the way the old two-job `deploy.yml` could (see TESTING.md's
2026-07-18 incident, from that era). Still worth cross-checking the Worker itself actually
redeployed, not just that Actions reports green:

```bash
cd api && pnpm exec wrangler deployments list   # latest "Created:" should match the push time
```

A quick live route check (200/401 is fine, 500 is not) is worth running after any deploy too —
a `500` here on a route that should just be an auth check means the Worker itself is broken, not
merely unauthenticated:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/auth/me?role=admin"       # expect 401
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/admin/unlock-requests"    # expect 401
```

## How the cutover happened

Kept for reference — a similar runbook may be useful for a future Cloudflare routing change.
`plan.md`'s Section 4.G laid out the planned steps; here's what actually happened when
`migrate/single-worker-app` merged (PR #1) and `deploy.yml` deployed it:

1. **Merging to `master` and deploying was the cutover itself, not a step before it.** The
   plan's assumption — that the still-live Pages custom domain would keep serving traffic until
   manually removed — was wrong. `api/wrangler.jsonc`'s route had already been widened from
   `/api/*` to `/*` in the merged branch, and **a Cloudflare Worker Route takes priority over a
   Pages custom domain for the same hostname the instant it's deployed** — there's no grace
   period or manual switch-over needed. This was confirmed, not assumed: right after the
   deploy, `curl -sI` against `excisebakaya.exciseup.in/login` showed `x-opennext: 1`,
   `x-nextjs-prerender: 1`, and `x-powered-by: Next.js` — headers only the OpenNext Worker adds,
   never Pages' static-asset serving path — which is a more reliable signal than a `200` status
   code, since both the old and new setups would return `200` for the same paths.
2. Cleanup, done after confirming the Worker was correctly serving everything: detached
   `excisebakaya.exciseup.in` from the `excise-revenue-recovery-portal` Pages project via the
   Cloudflare API directly (`DELETE .../pages/projects/<project>/domains/<domain>` — `wrangler`
   has no CLI subcommand for removing a Pages custom domain, only for creating a project).
3. Deleting the Pages project outright (`wrangler pages project delete`) failed twice in a row
   with more specific errors each time: first "too many deployments to be deleted" (the project
   had 25), then — once all but the currently-marked-"active" one were deleted individually via
   `wrangler pages deployment delete <id>` — "you cannot delete the active production
   deployment" for that last one. Neither blocked the actual project delete once the custom
   domain was detached first; the project delete succeeded immediately after that, with the one
   remaining "active" deployment going with it.
4. Re-verified the live domain after every destructive step (domain detach, each deployment
   delete, and the final project delete) — no interruption at any point.
5. **No D1 step anywhere in this cutover** — the database, its binding, and its data were
   completely unaffected throughout; only HTTP routing and the now-defunct Pages project
   changed.

If a future infra change needs to roll back to a two-deployment setup for some reason, there is
no Pages project left to reattach a domain to — it would need to be recreated from scratch
(`wrangler pages project create`), which is a bigger step than the simple "re-add the domain"
rollback this plan originally anticipated. In practice this is unlikely to matter: the whole
point of Milestone 41 was that the two-deployment setup no longer serves any purpose now that
both apps are one.

## Known deployment constraints

- **Custom domain + cookie auth are both live, and the app is now a single Worker** (ROADMAP.md's
  Milestones 35, 36, and 41). Session auth is an `HttpOnly`/`Secure`/`SameSite=Lax` cookie, not a
  Bearer token — see CLAUDE.md's Auth section ("Why cookies again") for the full history.
  `api/middleware.ts` is now a no-op (no cross-origin request ever reaches this Worker, so no
  CORS/OPTIONS handling is needed) — kept as an empty passthrough file only because
  `api/middleware.ts` (not `proxy.ts`) is a load-bearing filename under this Next.js version (see
  the redeploy section above). The old local cross-origin dev gap (`next dev`/`wrangler dev` on
  different ports) is gone too — one process serves everything now, in every environment.
- D1 database region is APAC (set at creation, `wrangler d1 create` doesn't currently
  expose a region flag — Cloudflare places it near where you ran the command).
- **A deploy that lands as a Cloudflare `Preview` deployment instead of `Production`** can leave
  multiple deployments simultaneously tagged in Cloudflare's history, and different edges have
  been observed serving different (including stale) ones inconsistently until a clean redeploy
  settles it. Always confirm with `pnpm exec wrangler deployments list` and a `curl -i`
  status-code check after deploying, not just "the command exited 0."
