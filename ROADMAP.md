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

## Milestone 13 — Admin dashboard/districts split, district detail page, global search (done)

- [x] Fixed the actual dark-mode bug: the `@custom-variant dark` `<style>` block was written
      *after* the blocking Tailwind CDN `<script>` tag in `layout.tsx`'s `<head>`, so it wasn't
      in the DOM yet when the CDN runtime initialized — `dark:` utilities were silently only
      ever following the OS `prefers-color-scheme`, never the manual toggle. Reordered the
      `<style>` above the `<script>`.
- [x] Removed `ThemeToggle` from `/login` and `/verify` — those pages already inherit whatever
      the blocking script resolved (stored choice, else OS default); a manual toggle pre-login
      wasn't needed
- [x] Renamed the DEO route from `/entry` to `/deo-data-entry` (folder rename + the 3 places
      that redirected to it: root `page.tsx`, `login/page.tsx`, `verify/page.tsx`)
- [x] Split the single `/admin` page into three: `/admin` (Dashboard only), `/admin/districts`
      (the sortable/paginated table + Lock/Unlock + DEO template download/upload + Excel
      export — all the toolbar actions moved here off the Dashboard), and
      `/admin/districts/detail?id=` (one district's revenue across all 5 years, reached by
      clicking a table row). The detail page is a query-string route, not a `/districts/[id]`
      dynamic segment, since the app is a static export with no server to resolve arbitrary
      paths at request time.
- [x] `frontend/lib/useAdminData.ts` — new shared hook (session guard, Dexie cache, `sync()`,
      `unlock()`) so the three admin routes don't each re-implement the same fetch/cache dance
- [x] `AppHeader` gained `navLinks` (Dashboard/Districts pill nav) and `onSync`/`syncing`
      props — the Sync button moved out of each page's own toolbar into the shared header so
      it's reachable from any admin page
- [x] Added a real Chart.js donut (`LockStatusDonut` in `AdminDashboard.tsx`, CDN-loaded via
      `layout.tsx`'s `lazyOnload` script, `chart.js` added as a types-only devDependency) next
      to the existing locked/unlocked bar — the one chart actually requested, not a wholesale
      swap of every stat card to a charting library
- [x] `pac_data.locked_at` (migration `0002_jittery_viper.sql`, applied to remote D1) mirrors
      `users.locked_at` the same way `submitted_by_name` already did, so the district detail
      page can show "locked by X on Y" without a join. New `frontend/lib/format.ts`'s
      `formatIST()` is the one place that converts the stored UTC ISO string to IST
      (`Asia/Kolkata`) for display — storage stays UTC always.
- [x] `AppHeader`'s new `districts` prop renders a global "jump to a district" autocomplete
      search reachable from every admin page, separate from the Districts table's own
      by-name filter box
- [x] District detail page has its own search box filtering the field × year table by raw
      number or formatted value across any year
- [x] Split the single `__session` cookie into `__admin_session` + `__deo_session` — a CUG
      (DEO) login and a magic-link (Admin) login in the same browser no longer clobber each
      other, so testing the demo DEO flow doesn't cost a fresh magic-link email (and doesn't
      burn Resend's daily quota) just to get back into `/admin`. `requireSession(req, role)`
      now takes the expected role explicitly; `/api/auth/me` and `/api/auth/logout` take a
      `?role=` query param
- [x] Fixed the real cause of the `/admin` ↔ `/deo-data-entry` login bounce: pages were
      pre-checking a single shared localStorage "last role" hint before ever calling
      `/api/auth/me`, so it went stale whenever the *other* role logged in anywhere in the
      same browser. Pages now call the server directly and trust its answer.

## Milestone 14 — Colorful clickable KPI cards, header decluttering, unlock reasons, audit log (done)

- [x] Admin Dashboard KPI cards recolored (blue/red/emerald/amber/violet per card, not five
      identical white cards) and made clickable — Districts/Gross Arrears/Net Recoverable go
      to `/admin/districts`, Locked/Unlocked go there pre-filtered by status, top-5-dues list
      rows link straight to that district's detail page
- [x] `/admin/districts` gained a Locked/Unlocked/All status filter, shortened its numeric
      column headers to just the English label (full bilingual label moved to a `title`
      tooltip) since the long bilingual headers were forcing every column to auto-size to the
      header text instead of the much-shorter numeric values, widened its container to
      `lg:px-[15%]` instead of a fixed max-width, and gave the DEO Template/Upload DEO Data
      buttons actual color (`Button` variants `blue`/`amber`) instead of a plain gray outline
- [x] Replaced every `?id=`/`?status=` URL query string with `sessionStorage` state
      (`frontend/lib/adminNav.ts`) — district id and status filter now travel between admin
      pages without ever touching the URL
- [x] `AppHeader` decluttered: nav links, district search, Sync, theme toggle, and the profile
      menu now live in one right-aligned group instead of spreading across the header;
      Logout moved out of its own top-level button into the profile dropdown (`ProfileMenu`'s
      `onLogout`) for both Admin and DEO; the header's district-search input dropped its
      leading icon (same live-text/async-glyph overlap bug as `TextField`)
- [x] Admin can now unlock a district only after entering a reason (`promptUnlockReason()`,
      SweetAlert2 textarea) — stored on `districts.unlock_reason`/`unlocked_at`/`unlocked_by`
      (migration `0003_overjoyed_malcolm_colcord.sql`) and shown on that district's detail page
- [x] New `audit_log` table (migration `0004_white_songbird.sql`) and `/admin/audit` page —
      every login/logout, lock/unlock, and DEO-provisioning batch, newest first, auto-pruned
      to the last 30 days on read. Modeled on the sibling
      `up-excise-spatial-revenue-optimizer` project's audit log.

## Milestone 15 — DEO entry mobile pass + parity error readability (done)

- [x] `Submit & Lock` button's `dark` variant switched from a solid near-black fill
      (`bg-slate-800`) to the same light-toned pattern every other `Button` variant already
      uses (soft `bg-slate-100` + border) — it read as unreadable/too heavy next to the rest
      of the light-mode-first UI
- [x] `YearStepForm.tsx`'s RC count/amount and stay count/amount pairs now stack one field per
      row below the `sm` breakpoint (`grid-cols-1 sm:grid-cols-[11rem_1fr]`) instead of staying
      two-up on phone-width screens
- [x] DEO entry Year 1–5 / Master View nav pills: removed the `flex-1` divider `<span>` that
      forced an ugly full-width empty line when the pills wrapped on mobile; year pills now
      wrap together in their own group, Master View right-aligns via `sm:ml-auto`
- [x] Added `pb-24 sm:pb-8` to the DEO entry page container so the fixed `HelpPanel` button no
      longer overlaps the full-width Master View submit button on mobile
- [x] Parity error under Recovered Amount no longer interleaves English/Hindi mid-sentence —
      split into separate per-language name constants so each line is single-language

## Backlog / not started

- [ ] Real domain + DNS, and (optional) collapse `/frontend` + `/api` onto one zone via a
      Worker route so the cross-origin cookie dance in CLAUDE.md's Auth section can be dropped
- [ ] Verify `mail.upexciseonline.co` (or chosen domain) in Resend and switch `FROM_EMAIL`
      off the shared sandbox sender
