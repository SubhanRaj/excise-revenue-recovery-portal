# Roadmap

## Milestone 1 — Foundation (done)

- [x] Monorepo scaffold: `/frontend` (Next.js static export) + `/api` (Next.js API routes, OpenNext/Cloudflare)
- [x] CDN wiring: Tailwind v4, SweetAlert2, SheetJS, Tabler Icons, Google Fonts
- [x] Drizzle schema: `districts`, `users`, `pac_data`, `magic_link_tokens`
- [x] D1 migration generated, seed script for 75 UP districts + bootstrap admin
- [x] Root docs: README, CLAUDE.md, ROADMAP

## Milestone 2 — Auth (done)

- [x] CUG mobile hash flow (`/api/auth/verify-cug`)
- [x] Magic link flow (`/api/auth/request-magic-link`, `/api/auth/verify-magic-link`)
- [x] Unified `__session` JWT cookie, cross-origin CORS (`api/middleware.ts`)
- [x] `/api/auth/me` session check + `/api/auth/logout`
- [x] Frontend `/login` and `/verify` pages

## Milestone 3 — DEO data entry (done)

- [x] Dexie local staging (`draftYears`), no D1 writes until final submit
- [x] 5-step year-wise form, sequential unlock, Master View
- [x] Anti-Blank Rule, parity check, reactive Net Recoverable calc
- [x] Atomic submit (`db.batch`) + lock flip + session revocation
- [x] Cleave.js Indian-numeral money inputs

## Milestone 4 — Admin dashboard (done)

- [x] TanStack Table grid: search, sort, pinned district column
- [x] Dexie cache + manual Sync
- [x] SheetJS export: Indian Rupee format, TOTAL row (frozen header not supported by
      SheetJS Community — see CLAUDE.md)
- [x] Unlock endpoint + UI action

## Milestone 5 — Deploy (done)

- [x] Production D1 database created, `database_id` wired into `api/wrangler.jsonc`
- [x] API deployed to Cloudflare Workers: https://excise-revenue-recovery-api.shubhanraj2002.workers.dev
- [x] Frontend deployed to Cloudflare Pages: https://excise-revenue-recovery-portal.pages.dev
- [x] Production secrets set via `wrangler secret put` (`JWT_SECRET`, `RESEND_API_KEY`,
      `FRONTEND_URL`); `NEXT_PUBLIC_API_URL` passed at frontend build time
- [x] Remote migration + seed applied (75 districts + superadmin
      `shubhanraj2002@gmail.com`, sign in via Magic Link)
- Note: OpenNext Cloudflare 1.20.1 doesn't yet support Next 16's Node-runtime `proxy.ts`
  convention — the CORS gate stayed on the legacy `api/middleware.ts` (Edge runtime), which
  still works and only emits a deprecation warning on build.

## Milestone 6 — UI/UX pass (done)

- [x] Fixed unstyled-flash bug: Tailwind CDN script moved off `next/script` (JS-hook
      injection) onto a plain blocking `<script>` tag — the actual bug behind a report that
      the CUG login field was effectively invisible on first paint
- [x] Design system: indigo palette, `Button`/`TextField`/`Banner`/`AppHeader` components,
      applied to login, verify, DEO entry, and admin
- [x] Removed decorative icons from inside text inputs (Tabler webfont FOUT could flash a
      fallback glyph over live input text — see CLAUDE.md)
- [x] Replaced per-message SweetAlert popups with inline `Banner` SPA state everywhere
      except the one genuinely irreversible confirm (final submit & lock)
- [x] UI chrome anglicized; Hindi now scoped to the 6 PAC field labels + department name
- [x] Styled HTML magic-link email (`api/lib/email.ts`) instead of bare `<p>` tags

## Milestone 7 — Testing + production incident (done)

- [x] Playwright e2e suite (`frontend/e2e/login.spec.ts`) driving real installed Chrome
      against live production — see TESTING.md
- [x] Regression tests for: unstyled-flash bug, popup-vs-inline-Banner pattern, and the
      full magic-link verify round trip against live D1
- [x] Diagnosed and fixed a production incident where the frontend intermittently served
      Cloudflare's generic "Node.JS Compatibility Error" page instead of the app, which
      also explained an earlier report of magic-link verify silently bouncing to `/login`
      — root cause was a stale/inconsistent Pages deployment (multiple simultaneously
      `Production`-tagged deployments from earlier `--branch` flakiness), not a code
      defect; fixed by a clean redeploy. Full writeup in TESTING.md's Incidents section.
- [x] TESTING.md: e2e docs, manual DEO+Admin demo script, incident notes

## Backlog / not started

- [ ] Admin UI to provision DEO users (currently manual DB insert — see CLAUDE.md "Known gaps")
- [ ] Real domain + DNS, and (optional) collapse `/frontend` + `/api` onto one zone via a
      Worker route so the cross-origin cookie dance in CLAUDE.md's Auth section can be dropped
- [ ] Verify `mail.upexciseonline.co` (or chosen domain) in Resend and switch `FROM_EMAIL`
      off the shared sandbox sender
