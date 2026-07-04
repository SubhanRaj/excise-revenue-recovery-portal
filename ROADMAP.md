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
- [x] Investigated a production incident where the frontend intermittently served
      Cloudflare's generic "Node.JS Compatibility Error" page instead of the app (also
      explained an earlier report of magic-link verify silently bouncing to `/login`) —
      root cause found in Milestone 8. Full writeup in TESTING.md's Incidents section.
- [x] TESTING.md: e2e docs, manual DEO+Admin demo script, incident notes

## Milestone 8 — CI/CD via GitHub Actions (done)

- [x] Found the real root cause of Milestone 7's incident: the Pages project had a
      Cloudflare **Git integration** (set up in an earlier, interrupted session) silently
      auto-building on every push with `@cloudflare/next-on-pages` and no `nodejs_compat`
      flag — completely wrong for this app's static-export setup — racing every manual
      `wrangler pages deploy` and re-breaking production a few minutes after each fix
- [x] Disconnected the Git integration via the Cloudflare dashboard; confirmed the API
      Worker had no equivalent Workers Builds integration (clean, `version_upload`-only)
- [x] `.github/workflows/ci.yml` + `deploy.yml`: path-filtered (only `api/**`/`frontend/**`
      changes trigger anything — a docs-only commit doesn't), `deploy.yml` also supports
      `workflow_dispatch` with a both/api/frontend target picker for on-demand deploys
- [x] `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` set as GitHub repo secrets; verified
      end-to-end via `gh workflow run deploy.yml -f target=both`, both jobs green
- [x] Docs updated (DEPLOY.md, TESTING.md) to make GitHub Actions the documented primary
      deploy path, manual `wrangler` commands kept as local-dev/fallback reference

## Milestone 9 — CUG hardening + UI bug pass (done)

- [x] Anglicized the two remaining Hindi API error messages (`verify-cug`, `verify-magic-link`)
- [x] Client-side CUG prefix validation (`94544`, real Excise Dept. numbers) — gated before
      hashing/sending, error message never names the rule (generic "Invalid user")
- [x] Demo/test CUG moved out of source and docs entirely: raw number lives only in the
      `DEMO_CUG` Cloudflare Worker secret; frontend bypass compares against a precomputed
      hash constant instead of the raw digits
- [x] Fixed disabled DEO-nav buttons showing a pointer cursor instead of not-allowed
      (Tailwind preflight `button { cursor: pointer }` conflict — see CLAUDE.md)
- [x] Admin table: fixed the sticky header (wasn't actually sticking), added a sticky
      totals row, removed the search-icon/input-text overlap, widened the page container
- [x] DEO year form: one field per row instead of two-per-row at the `sm` breakpoint
- [x] Diagnosed (not a regression, no code fix needed): demo CUG login failing was a
      missing DB row, not a bug; admin magic-link redirect-to-login was the pre-documented
      Safari cross-site-cookie risk, confirmed still working correctly in Chrome — see
      TESTING.md's Incidents section

## Milestone 10 — DEO form UX + profile menu + auth toasts (done)

- [x] DEO year form: parity error moved from a bottom banner to a bold inline message under
      the Recovered Amount field; RC and Stay count/amount fields paired two-up per row
      (narrow count column) instead of one field per row for every field
- [x] Added a per-year "Previous Year"/"Save & Continue" two-button nav (was a single button)
- [x] Added `HelpPanel` (ported from `up-excise-spatial-revenue-optimizer`, restyled off
      DaisyUI onto plain Tailwind) as a dismiss-once help balloon on the DEO year form
- [x] `GET /api/auth/me` now also returns `email`/`districtName`; new `ProfileMenu.tsx`
      dropdown in `AppHeader` shows role/district/email
- [x] Logout now requires a SweetAlert2 confirm (`confirmLogout()`); added `notifyToast()`
      (top-end SweetAlert2 toast, modeled on `excise-bakaya-record`) for a one-shot "Welcome,
      <district/email>" on login and "Logged out" on logout — see CLAUDE.md's UI conventions
      for the `markJustAuthed`/`consumeJustAuthed` one-shot mechanism

## Milestone 11 — Validation UX, help redesign, lock flow, bulk DEO provisioning (done)

- [x] Blank-field validation moved from a bottom `Banner` to a bilingual `notifyToast()`
      (not tied to one field); parity error stays inline under Recovered Amount but only
      shows after blur, in full bilingual field names with no "(3)"/"(2.ii)" numbering
- [x] Recovered Amount auto-fills from RC Amount as the DEO types, until they edit it
      directly — never locked/read-only, just pre-filled
- [x] `HelpPanel` redesigned from an inline text button into a `position: fixed` round
      button pinned below the header (stays put on scroll); removed the full-screen
      backdrop-blur; two independent dismiss actions (temporary `×` vs. persisted "Don't
      show this again"); mounted once per page (`entry`, `admin`) with tailored content
      for each, instead of per-form-step
- [x] Fixed sticky/frozen table rows (admin table + Master View) bleeding scrolled content
      through a transparent/alpha-striped row background; switched both tables back to
      auto-layout (not `table-fixed`) so crore-scale money values don't clip
- [x] Master View title centered, shows the district name, with a smaller bilingual Hindi
      line underneath
- [x] Lock flow reworked: `MasterView.tsx` has no inline DEO-name field anymore, just a big
      `Submit & Lock` button; clicking it runs `confirmFinalSubmit()` (data-correctness +
      irreversibility disclaimer) then `promptDeoNameAndLock()` (SweetAlert2 text-input
      prompt with a liability disclaimer and a regex validator blocking blank/numeric/
      designation-typed-as-name input) — modeled on the sibling `excise-bakaya-record`
      project's small-scale `Swal.fire({ input: "text" })` pattern
- [x] Global `.swal2-container { backdrop-filter: blur(3px) }` so every SweetAlert2 modal
      blurs the page behind it
- [x] `Button.tsx` gained a `size` prop (`md`/`lg`) instead of letting callers pass
      conflicting padding/text-size via `className` (unreliable with the Tailwind CDN's
      in-browser JIT — see CLAUDE.md)
- [x] Bulk DEO provisioning: Admin can download an `.xlsx` template pre-filled with all 75
      district names, fill in CUG mobile/email, and re-upload — `POST
      /api/admin/provision-deos` hashes the CUG server-side (the one deliberate exception to
      "server never sees a raw CUG," since there's no DEO browser in this flow to hash it
      first) and upserts by district name, no duplicates
- [x] `pac_data.submitted_by_name` (migration `0001_nostalgic_stature.sql`, applied to
      remote D1) — the DEO's lock-time name is now stored on the revenue row itself, keyed
      by `district_id`, not just on `users`

## Milestone 12 — Sober rebrand, dark mode, admin dashboard, help repositioning (done)

- [x] Rebranded the whole app (every component + the magic-link email) from `indigo-*` to
      `blue-*` — a professional-reading palette for a government portal, not purple
- [x] Dark mode: `frontend/lib/theme.ts` + `ThemeToggle.tsx`, persisted in `localStorage`,
      defaults to OS `prefers-color-scheme`, no flash on reload (blocking inline script in
      `layout.tsx` sets `.dark` before paint), toggle in `AppHeader` plus standalone on
      `/login`/`/verify`. Applied `dark:` variants across every component.
- [x] Help button redesigned: light `bg-blue-50` (darkens on hover/active, not solid),
      repositioned to `bottom-6 right-6` on every page (opens upward-left), dynamic
      width/height measured against actual available space so it only scrolls internally if
      the display genuinely can't fit it
- [x] Fixed `Submit & Lock`'s icon/label risk of stacking (`Button.tsx` now spells out
      `flex-row flex-nowrap whitespace-nowrap`); switched it from `variant="danger"` (red) to
      a new `dark` variant (serious without reading as an error)
- [x] Sticky Year 1–5 / Master View nav on the DEO entry page (was scrollable-away before)
- [x] Admin Dashboard default view (KPI cards + top-5-districts bar + lock-ratio bar, plain
      CSS, no charting dependency) with a toggle to the existing Districts Table; table
      pagination (25/50/75/100 page size); compact `size="sm"` toolbar buttons, no oversized
      page heading; removed the table's `w-full` (auto-sizes to content instead of stretching
      to fill the container) and added more container padding
- [x] Excel export rewritten to one workbook with 5 sheets (one per financial year), replacing
      the old single-sheet-many-columns layout
- [x] Fixed a real e2e regression caught while rebranding: `login.spec.ts` asserted
      `text-indigo-700`, updated to `text-blue-700`

## Backlog / not started

- [ ] Real domain + DNS, and (optional) collapse `/frontend` + `/api` onto one zone via a
      Worker route so the cross-origin cookie dance in CLAUDE.md's Auth section can be dropped
- [ ] Verify `mail.upexciseonline.co` (or chosen domain) in Resend and switch `FROM_EMAIL`
      off the shared sandbox sender
