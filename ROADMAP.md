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

## Backlog / not started

- [ ] Admin UI to provision DEO users (currently manual DB insert — see CLAUDE.md "Known gaps")
- [ ] Real domain + DNS, and (optional) collapse `/frontend` + `/api` onto one zone via a
      Worker route so the cross-origin cookie dance in CLAUDE.md's Auth section can be dropped
