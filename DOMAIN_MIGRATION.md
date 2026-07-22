# Custom domain (`excisebakaya.exciseup.in`) + Bearer→Cookie auth switch — plan

Standalone plan doc, same pattern as [R2_PDF_ATTACHMENT_REPROVISIONING.md](./R2_PDF_ATTACHMENT_REPROVISIONING.md)
— not started yet, kept here so the reasoning doesn't need to be re-derived when picked up.
Once executed, fold the outcome into CLAUDE.md/DEPLOY.md/ROADMAP.md per the "Docs to update"
section below and this file can be deleted.

## Context

`exciseup.in`'s nameservers are already delegated to Cloudflare (done for the sibling
`sro.exciseup.in`/`docsrepo.exciseup.in` subdomains) — Squarespace is now just the registrar,
DNS lives entirely in the Cloudflare zone. No Squarespace subdomain work is needed for this
project either; the new subdomain is created directly in Cloudflare.

Decision already made: **keep `/frontend` (Pages) and `/api` (Worker) as two separate
deployments** — do not merge into a single Worker like `sro`. That project was built
single-Worker from day one; this one was retrofitted, is more complex, has real production data
and only one e2e test as a safety net, and merging buys zero UX benefit (the "no full-page-reload"
navigation is Next App Router client-side routing, which this app already has regardless of
static-export vs SSR hosting).

The actual goal — a **true single origin** so Bearer-token-in-localStorage can revert to
`HttpOnly`/`SameSite` cookies (the more secure option, per CLAUDE.md's "Why not cookies" section,
which was always framed as "revisit this once a custom domain exists") — is fully achievable
without merging: one hostname, Pages serves everything except `/api/*`, and a zone-level
path-scoped Worker Route sends `/api/*` to the existing API Worker. Cloudflare officially
supports Workers Routes and Pages coexisting this way on one zone (a route pattern with a path
segment takes precedence over Pages for matching requests only).

No new errors/data-corruption risk to the live system: D1 data and audit logs are completely
untouched by everything below — this is deploy-config, routing, and auth-transport changes only.
DEO OTP work stays out of scope, untouched.

## Two separate rollouts, not one

Splitting into two independent deploys keeps the blast radius small and isolates variables if
something goes wrong:

- **Rollout 1 — Custom domain, no auth change.** Frontend and API both become reachable at
  `excisebakaya.exciseup.in` (same-origin), Bearer/localStorage auth keeps working exactly as
  today. Fully additive — old `*.pages.dev`/`*.workers.dev` URLs keep working unchanged
  throughout (a path-scoped Worker Route does **not** auto-disable `workers.dev`, unlike
  `custom_domain: true`). Reversible with zero session/user impact.
- **Rollout 2 — Bearer → Cookie auth switch.** Only done once Rollout 1 has been live and
  verified stable. This one *is* a hard cutover: since it's the same Worker deployment serving
  every hostname, the moment this code deploys, **every currently-logged-in admin's localStorage
  token stops being accepted everywhere** (old and new URLs alike) and they must log in again.
  Downtime/re-login here is accepted as fine — just pick a low-traffic window and expect to tell
  admins to re-login once.

---

## Rollout 1 — Custom domain

### What needs to happen on the user's end (Cloudflare dashboard — no CLI support for this exists in Wrangler)

1. **Workers & Pages → `excise-revenue-recovery-portal` (Pages project) → Custom domains → Add
   `excisebakaya.exciseup.in`.** Cloudflare auto-creates the DNS record on the zone since it's
   already on the account — no separate DNS step. `*.pages.dev` keeps serving in parallel.
2. Confirm the domain shows **Active** in the dashboard before redeploying anything against it.

### Implementation

3. `api/wrangler.jsonc` — add a path-scoped route (not `custom_domain: true`, which would claim
   the whole hostname exclusively for the Worker and break Pages serving the UI on it):
   ```jsonc
   "routes": [
     { "pattern": "excisebakaya.exciseup.in/api/*", "zone_name": "exciseup.in" }
   ]
   ```
   Deploy via the existing `pnpm run deploy` — Wrangler auto-provisions the route on the zone.
4. `frontend/lib/config.ts` / `.github/workflows/deploy.yml` — `NEXT_PUBLIC_API_URL` becomes `""`
   for the production build (frontend and API now share an origin, so `apiFetch` resolves
   `/api/...` relative to whatever host served the page — no domain to hardcode, and it stays
   correct even if the domain changes again later). Local dev keeps its `http://localhost:8787`
   fallback, unchanged.
5. `api` Worker secret `FRONTEND_URL` → `https://excisebakaya.exciseup.in` (feeds the magic-link
   email's `/verify?token=` URL) via `wrangler secret put`.
6. Redeploy both apps (`gh workflow run deploy.yml -f target=both`), verify per DEPLOY.md's
   existing checklist against the **new** domain: `/login` loads, CUG login round-trip,
   magic-link round-trip, `/admin` loads districts. Old `*.pages.dev`/`*.workers.dev` re-verified
   untouched too.
7. Docs: DEPLOY.md's production-deployment table gets the new domain as the primary URL (old ones
   kept, annotated as still-live); ROADMAP.md gets a new milestone entry.

Nothing about `pac_data`, sessions, or auth code changes in this rollout — nothing for a
currently-logged-in admin to notice.

---

## Rollout 2 — Bearer token → cookies

Once Rollout 1 has soaked. This is the part that actually needs the same-origin win.

### Cookie design (restores the pre-Milestone-21 two-cookie shape, on the fixed foundation)

- **Two cookies, `__admin_session` / `__deo_session`** (same names/split as the original design
  in CLAUDE.md's history) — keeps an Admin and DEO session coexisting in one browser, same as
  today's two localStorage keys.
- `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` (7 days, matches
  `SESSION_TTL_SECONDS`). **No `Domain=` attribute** — frontend and API are the *exact same
  hostname* now (not sibling subdomains), so a plain host-only cookie is correct and strictly
  safer (can't leak to `sro.exciseup.in`/`docsrepo.exciseup.in`).
- `SameSite=Lax` (not `None`) is deliberate: true same-origin means `SameSite` doesn't affect
  whether the cookie is *sent* in production (same-origin requests always include it regardless
  of the attribute), but `Lax` is real CSRF hardening the old cross-origin design couldn't use.
  `None` would reopen a CSRF gap for zero benefit now that same-origin is real.

### Files touched

- `api/lib/session.ts` — JWT signing unchanged; add the cookie name/attribute helpers here.
- `api/lib/auth-guard.ts` — `requireSession()` reads `req.cookies.get(cookieName(role))?.value`
  instead of the `Authorization` header.
- `api/app/api/auth/verify-cug/route.ts`, `verify-magic-link/route.ts` — set the cookie on the
  response (`res.cookies.set(...)`) instead of returning `token` in the JSON body.
- `api/app/api/auth/logout/route.ts` — clear the cookie on response, in addition to the existing
  audit-log write.
- `api/app/api/auth/me/route.ts` — no logic change (still reads via `requireSession`); its comment
  already (accidentally, left over from before Milestone 21) describes cookie behavior — it
  becomes accurate again.
- `api/middleware.ts` — same-origin means no CORS preflight ever fires; drop the now-dead
  `withCors`/OPTIONS handling, replace the comment explaining why. (This is a code cleanup, not a
  deployment-resource deletion — nothing about the old Pages/Worker deployments is touched.)
- `frontend/lib/session.ts` — drop the localStorage `token`/`ClientSession` shape entirely
  (nothing left to store client-side — the cookie is the credential now); keep the existing
  `LAST_ROLE_KEY` first-paint hint and `markJustAuthed`/`consumeJustAuthed` one-shot toast
  mechanism as-is.
- `frontend/lib/api.ts` — `apiFetch`/`apiFetchForm`/`apiFetchBlob` drop the `Authorization`
  header entirely; same-origin `fetch()` already includes cookies by default (no
  `credentials: "include"` needed).
- `frontend/app/login/page.tsx`, `verify/page.tsx` — drop token handling from the verify
  response; the `Set-Cookie` header is applied by the browser automatically, nothing for the
  page to store before redirecting.
- `frontend/e2e/login.spec.ts` — swap the localStorage-token assertion for a cookie-presence/
  authenticated-state assertion.

### Known trade-off, flagged rather than solved: local `next dev` cross-origin testing

Local dev runs frontend (`:3000`) and API (`:8787`) on different ports — genuinely cross-origin.
`SameSite=Lax` cookies won't be sent on the `fetch()` calls between them (Lax only allows
top-level navigations cross-site), so a manual local click-through of login would appear to
"log in" but then 401 on the next `/api/auth/me` call — the same bug class Milestone 21 fixed,
now scoped to local dev only, not production. Not solving this now (a local single-origin dev
proxy is more setup than warranted) — documenting it as a known gap in CLAUDE.md. The existing
e2e suite already exercises the real deployed environment (`wrangler d1 execute --remote`), so
it's unaffected either way.

### Rollout mechanics

1. Deploy `api` + `frontend` together in one release window (they must move in lockstep — cookie
   support in the API and no-more-Bearer-header in the frontend are not independently useful).
2. Everyone currently signed in (admins) gets logged out the instant this deploys and must log in
   again — announce the window beforehand.
3. Full manual regression pass per TESTING.md's existing demo script: CUG login, magic-link
   login, DEO locked screen + unlock request, admin dashboard/districts/audit/unlock-requests/
   provisioning (owner-only), Excel export.
4. If anything's wrong: revert the commit, redeploy — this restores Bearer behavior for everyone
   (another forced re-login, same low-stakes trade-off).

### Docs to update

- **CLAUDE.md** — rewrite the "Why not cookies" subsection (it becomes "why cookies, now that a
  custom domain exists"); rewrite the whole Auth section's mechanics (two cookie names, no
  localStorage token, `requireSession` reads cookies); note the local-dev cross-origin
  limitation.
- **DEPLOY.md** — Known Deployment Constraints section (currently says "if you get a custom
  domain, switch to cookies" — mark done, describe the actual setup); secrets section
  (`FRONTEND_URL` new value); redeploy commands (`NEXT_PUBLIC_API_URL=""`); verification curl
  examples pointed at the new domain.
- **README.md** — Auth flow overview paragraph.
- **TESTING.md** — e2e assertion change; a written incident/migration note (matches this repo's
  existing convention of writing up infra migrations here).
- **ROADMAP.md** — one new milestone entry covering both rollouts (matches the existing
  per-infra-change milestone convention).

## Verification

- Rollout 1: DEPLOY.md's existing "Verifying a deployment" curl checklist, run against
  `https://excisebakaya.exciseup.in` in addition to the existing URLs; confirm both old and new
  URLs serve identically.
- Rollout 2: the manual demo script in TESTING.md, run end-to-end against the live new domain
  post-deploy (CUG + magic-link login, DEO entry/lock, every admin page, export). No automated
  test covers cookie auth today beyond `login.spec.ts`'s updated assertion — flagging that as the
  actual regression-coverage limit for this change, not something this plan silently papers over.
