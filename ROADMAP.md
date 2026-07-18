# Excise Revenue Recovery Portal — Roadmap

| Field | Value |
|---|---|
| **Prepared By** | Subhan Raj |
| **Consulting For** | Department of Excise, Government of Uttar Pradesh |
| **Status** | Live in production — 75 districts onboarded, DEO submissions ongoing |

> **Authority note:** This document is the project's plan and business context — objectives,
> constraints, and the milestone-by-milestone progress log. For the authoritative **current
> implementation state** — schema, app flow, and exact conventions — see
> [README.md](./README.md) (reference) and [CLAUDE.md](./CLAUDE.md) (AI-agent instructions),
> both updated on every change. This file explains *what the department needs and why*; those
> two explain *how the system currently meets it*.

## 1. Objectives

The Department of Excise, Government of Uttar Pradesh, needs a single authoritative record of
Recovery Certificate (RC) arrears — money owed by defaulters that the department has pursued
via PAC (Public Accounts Committee) recovery certificates — across all 75 districts, for the
5-year window FY 2021-22 through FY 2025-26. Before this portal, that data lived in scattered
district-level spreadsheets with no consolidated view, no audit trail, and no way for HQ to see
which districts had actually reported.

| # | Objective | Success criterion |
|---|---|---|
| O-1 | **Universal coverage** | All 75 districts submit complete, locked 5-year PAC/RC data. |
| O-2 | **Financial accuracy** | Six figures per district-year (Gross Arrears, RC count/amount, Recovered Amount, Stay count/amount), each independently validated — no field silently defaults to zero. |
| O-3 | **Auditability** | Every submission is locked and attributed to a named DEO; every unlock requires a stated reason and is logged. HQ can always answer "who submitted this, when, and who touched it since." |
| O-4 | **Zero infrastructure cost** | Runs entirely on Cloudflare's free tier (Pages + Workers + D1) — no server provisioning, no paid plan, for a portal used by ~90 people (75 DEOs + a handful of admins). |
| O-5 | **Field-safe data entry** | A DEO's in-progress entry survives connectivity loss, accidental refresh, or tab closure — nothing is sent to the server (and nothing can be lost) until the DEO explicitly reviews and locks. |
| O-6 | **HQ-usable output** | An Admin can view, filter, and export (Excel or SQL) the full dataset without needing database access. |

## 2. Business rules (department-facing)

These are operational requirements from the department, not implementation choices — see
CLAUDE.md's "Validation rules" and "Data model" sections for how each is enforced in code.

- **One submission per district is final.** A DEO locks their district's 5-year data in a
  single atomic action; it cannot be edited afterward without an Admin unlock. This mirrors the
  department's own sign-off process — a DEO's submission is treated as an official record, not a
  draft that can be silently revised.
- **No field is ever assumed to be zero.** A due or recovery a DEO hasn't entered yet must stay
  visibly blank, never silently treated as ₹0 — a blank Gross Arrears figure and a confirmed-₹0
  Gross Arrears figure mean different things to an auditor.
- **A recovery can never exceed what was ever owed.** Recovered Amount for a given year is
  capped at that year's Opening Balance (carried forward) plus that year's fresh Gross Arrears —
  the schema-level backstop against overstating recovery.
- **Data must stay within its financial year.** A DEO enters only dues/recoveries that arose
  within that specific FY (1 April–31 March) — never pre-2021-22 arrears, never post-2025-26
  activity, and never a recovery of a pre-window due even if the recovery itself happens inside
  the window. This is a data-entry instruction to DEOs (see the in-app scope banner), not a
  system-enforced rule, since the system has no way to distinguish an in-scope figure from an
  out-of-scope one.
- **Unlock requires a reason.** An Admin can reverse a district's lock, but only after entering a
  reason, which is stored and shown on that district's detail page — an unlock is a deviation
  from the normal one-shot submission flow and must be accountable.
- **Every login, lock, and unlock is audited.** 30-day rolling retention is sufficient — this is
  an operational trail for catching mistakes shortly after they happen, not a permanent legal
  record.

## 3. Scope

**In scope:** the six PAC/RC fields per district per financial year (Gross Arrears, RC
count/amount, Recovered Amount, Stay count/amount), for FY 2021-22 through FY 2025-26, across
all 75 UP districts, plus the derived Opening Balance/Net Recoverable running balance.

**Out of scope:** anything the six fields don't cover — there is no separate interest field
(Gross Arrears is already principal + interest combined), no per-vend or sub-district
breakdown, and no data outside the 1 April 2021 – 31 March 2026 window. A future phase could
extend the window or add fields, but that would need new migrations on both apps (see
CLAUDE.md's Repo shape section) — not an in-place repurposing of an existing field.

## 4. Milestones

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

## Milestone 16 — Clear buttons, FY labeling, sleeker toolbar buttons, dashboard totals, re-login lock bug (done)

- [x] Per-year "Clear" (`YearStepForm.tsx`) and "Clear All" (`deo-data-entry/page.tsx` nav bar)
      buttons, both behind a blocking confirm (`confirmClearYear()`/`confirmClearAll()`) —
      client-only, only reachable pre-lock, never touches D1
      Widened toast (`showCloseButton`, responsive `width`) so bilingual validation text
      stops wrapping and can be dismissed manually instead of only auto-timing out
- [x] Every year label in the UI and Excel export changed from an ordinal "Year 1"/"Year 2"
      (or a bare `2021-22`) to explicit `FY 2021-22` — DEO nav pills, `YearStepForm` heading,
      Admin year selectors/column headers, `MasterView`'s table, Excel sheet names
- [x] New `frontend/lib/site.ts`: shared portal title ("Recovery Certificates (RCs) Issued
      for Recovery of Excise Revenue Arrears") and data period (1 April 2021 – 31 March
      2026), surfaced in the meta description, login page, a new DEO title bar above the year
      pills, and Excel banner rows — Hindi copy uses "आबकारी" (state excise/Abkari), not
      "उत्पाद शुल्क" (the Central Excise/GoI term)
- [x] `Button.tsx`: new `dangerSoft` variant (soft red, matches `blue`/`amber`/`dark`) for the
      Clear buttons instead of solid `danger` red; `rounded-md`/`shadow-sm`/`font-semibold`
      moved out of the shared base string into per-`size`, so `xs`/`sm` toolbar-chip buttons
      (Clear, Clear All, DEO Template, Upload, Export) render as sleek borderless pills
      matching the nav pills beside them, while `md`/`lg` primary buttons keep their original
      bolder look
- [x] Admin Dashboard KPI cards/charts changed from filtered-by-one-FY to summed across all 5
      financial years — a district's lock/submission is one atomic action across all years,
      so a per-year lock-status filter had nothing real to filter; Gross Arrears/Net
      Recoverable now reflect each district's cumulative position as of 31 March 2026.
      `/admin/districts`' own per-year filter is unrelated and unchanged.
- [x] Fixed a real bug: a DEO who submitted & locked could still log back in afterward (only
      the session cookie is destroyed at submit, not the CUG login), and saw a blank form
      because the local Dexie draft is wiped on submit with no fallback. `GET
      /api/auth/me?role=deo` now also returns `lockStatus`/`lockedAt`/`submittedByName`; a
      still-locked DEO now sees a read-only "Data Already Locked" screen instead of a form; an
      Admin-unlocked DEO gets their real submitted figures re-fetched from D1 (new `GET
      /api/pac-data/mine`) instead of a blank draft. Also fixed `POST /api/pac-data/submit` to
      delete-then-insert instead of plain insert, since a second submit after an unlock would
      otherwise fail the `(district_id, financial_year)` unique index (an unlock never clears
      `pac_data`).
- [x] Mobile: "Clear All"/Master View buttons now split their row edge-to-edge
      (`flex-1 sm:flex-none`) instead of sitting compact/left-aligned with dead space on the
      right

## Milestone 17 — Admin table polish, export feedback + SQL backup, audit log filter/sort, DEO locked-screen fixes (done)

- [x] Audit Log: "Filter by event" dropdown + a dedicated sort button ("Newest first"/"Oldest
      first"), replacing the old clickable-column-header sort arrows; header row is now
      `sticky top-0` (frozen), matching the Districts table
- [x] Districts table: side padding now shrinks progressively at `xl`/`2xl` breakpoints
      (`10% -> 5% -> 3%`) instead of a flat `15%`, so 22"/24" FHD admin monitors get real extra
      table width instead of horizontal scroll; the table's scroll container is `flex-1` in a
      `flex-col` page instead of a fixed `max-h-[65vh]`, so it fills the blank space at the
      bottom of tall viewports
- [x] All `<select>` dropdowns (status/FY/rows-per-page filters) and pagination Prev/Next
      buttons across Districts and Audit Log are now `rounded-full` pills matching
      `Button.tsx`'s `xs`/`sm` shape, instead of a mismatched `rounded-md` square
- [x] Export button clicks no longer freeze the page with no feedback: both "Export as Excel
      Workbook" and the new "Export as SQL" show a disabled "Exporting..." state on their own
      button while re-syncing + building the file (same pattern as "Upload DEO Data"'s
      "Uploading..." state)
- [x] New **Export as SQL** (`exportDistrictsToSql()`): a plain `.sql` `DELETE`+`INSERT` backup
      script for `districts`+`pac_data` (the two tables the admin panel caches client-side),
      downloaded via a native `Blob` — no new dependency
- [x] `useAdminData.ts`'s `sync()` now returns the freshly-fetched rows instead of only setting
      state, so Export reads genuinely fresh data instead of the pre-sync render's stale closure
- [x] New "Synced: <IST timestamp>" indicator in `AppHeader`, backed by a `localStorage`-persisted
      `lastSyncedAt` in `useAdminData.ts` — visible on every admin page that uses the Dexie
      cache, so an admin knows how stale the numbers on screen are without clicking Sync first
- [x] Audit Log page now shares the same `useAdminData()`-backed header as the other three admin
      pages (Sync button, district-jump search, Synced timestamp) instead of its own bare
      `/api/auth/me`-only guard with a visibly different (search-less, Sync-less) header
- [x] DEO "Data Already Locked" screen: widened to `max-w-2xl` (from `max-w-md`) so the
      English/Hindi messages wrap across one or two natural lines instead of a narrow column;
      Hindi paragraph bumped to `text-sm` to match the English body text; added a direct
      full-width **Logout** button on the card itself that skips the blocking confirm dialog
      (`confirmLogout()`) since logout is the only action available on this screen
- [x] Fixed the real root cause of a repeatedly-reported icon/text misalignment on every
      icon+label button and `<select>` dropdown app-wide: `globals.css`'s `font: inherit` on
      `input, select, button` was pulling in Tailwind's `line-height: 1.5` for button text while
      Tabler's icon webfont hardcodes `line-height: 1` — one added `line-height: 1` declaration
      on that same rule fixes every button and dropdown at once. Verified with an actual
      Playwright render of `Button.tsx` (temporary `/debugbuttons` route, deleted after), not a
      synthetic snippet, since an earlier "thick button" investigation had already (correctly,
      for a different complaint) concluded the flex layout itself was fine.
- [x] Small (`size="xs"`) button icons bumped from `text-xs` to `text-sm` (one step larger than
      the label) — they read as visually cramped at the same size as the text they sit next to.

## Milestone 18 — DEO CUG population & profile UI enhancements (done)

- [x] Processed raw `contact.csv` and `emails.csv` to map district names, map them against `districts` DB IDs, hash the CUG mobile numbers via SHA-256, and generate a batch of 75 `INSERT` statements to pre-provision all 75 DEOs into the `users` table.
- [x] Executed the generated batch SQL on the remote D1 production database, successfully provisioning all DEO CUG and email credentials.
- [x] `auditLogInsert` updated to correctly capture and log the `districtName` whenever a DEO logs in, fixing an omission where `login_cug` events previously left the district column blank.
- [x] Updated the Audit Log table UI to explicitly render the actor as `DEO <District Name>` rather than a bare `(deo)` if the district is known.
- [x] Profile menu button (`AppHeader`) enhanced to show a pill-shaped `DEO <District Name>` label instead of a simple circular `D` icon.
- [x] The admin District Detail page now includes the DEO's email address natively alongside the lock status badge (enabled by joining the `users` table over to the Admin Dexie `CachedDistrict` store).

## Milestone 19 — Decouple RC Amount/Recovered Amount, field-label corrections, Net Recoverable fix (done)

- [x] Removed the parity rule that forced `recoveredAmount === rcAmount` (client-side disabled
      "Save & Continue" + inline error, and server-side rejection in `validateRow()`). An RC's
      issued amount and what's actually recovered against it are independent real-world figures
      — an RC can be issued for more or less than what's recovered, and recoveries can happen in
      a year with no RC issued at all (e.g. clearing a prior year's dues). Also removed the
      Recovered-Amount-auto-fills-from-RC-Amount behavior in `YearStepForm.tsx`, which existed
      only to make the (now-removed) parity rule easy to satisfy.
- [x] `YearStepForm.tsx` no longer holds any local component state (no `followRc`/
      `parityTouched`) — it's now a fully controlled component reading/writing straight through
      `onFieldChange`. This also made the `clearVersion`-keyed forced-remount trick in
      `deo-data-entry/page.tsx` unnecessary (it existed solely to reset that now-gone internal
      state on Clear/Clear All), so it was removed too.
- [x] `grossArrears`'s bilingual label now reads "Gross Arrears (Principal + Interest) / सकल
      बकाया धनराशि (मूल धन + ब्याज)" — the field is the DEO's combined total, not principal
      alone, and DEOs were at risk of entering only the principal and expecting interest to be
      tracked separately (there is no separate interest field anywhere in this schema).
- [x] `rcCount`'s English label changed from "RCs Sent" to "No. of RCs Issued" (Hindi: जारी
      आर.सी. (R.C.) की संख्या, replacing प्रेषित/"sent") — "issued" is the accurate term for RC
      generation, and now that RC Amount/Recovered Amount are decoupled, "sent" read as
      conflating RC issuance with the recovery/dispatch process itself.
- [x] `stayCount`'s English label changed from "Stay Orders" to "No. of Stay Orders", for
      parallel wording with the RC count field.
- [x] Confirmed (no code change needed) that `netRecoverable()` already computed
      `grossArrears - recoveredAmount - stayAmount` — i.e. `1 - (3 + 4.ii)` in the form's own
      numbering — using `recoveredAmount`, not `rcAmount`. Before this milestone the parity rule
      made that choice invisible (the two fields were always equal); documented explicitly in
      CLAUDE.md now that they can diverge, since using `rcAmount` here would overstate what's
      still recoverable whenever an RC is issued for more than what actually gets recovered.
- [x] No database schema change — all six `pac_data` columns are unchanged; this was a
      validation-rule and label change only, so no migration was needed. Updated the Hindi-label
      code comments in `api/db/schema.ts` to match.
- [x] Documented all of the above in `CLAUDE.md` (Data model, Validation rules, UI conventions)
      and updated `TESTING.md`'s manual demo script, which previously exercised the parity-error
      path as its DEO-side validation demo step.

## Milestone 20 — Cumulative Net Recoverable, persisted per FY (done)

- [x] Net Recoverable changed from an isolated per-year figure to a running balance: each FY's
      `net_recoverable` now carries the previous FY's `net_recoverable` forward as its
      `opening_balance` before applying that year's own `grossArrears - recoveredAmount -
      stayAmount`. FY 2021-22 (the first FY) is unchanged — `opening_balance` is always 0.
- [x] New `pac_data.opening_balance`/`pac_data.net_recoverable` columns (migration
      `0005_married_landau.sql`), computed and written server-side by `POST
      /api/pac-data/submit` (never trusted from the client) — a reversal of the previous
      "Net Recoverable is never persisted" design, now that a per-year value needs to be
      auditable/queryable directly rather than recomputed from raw fields every time.
- [x] `frontend/lib/pac-fields.ts` gained `computeNetRecoverableSeries()`, mirrored server-side
      in `api/lib/net-recoverable.ts` — the one place the carry-forward formula lives on each side.
- [x] Every admin-facing view that shows a submitted district's PAC figures (districts table,
      district detail page, Excel export) now reads `openingBalance`/`netRecoverable` straight off
      the synced `pac_data` row instead of recomputing; only the DEO's own not-yet-submitted
      Dexie draft is still computed live in the browser (`YearStepForm`, `MasterView`).
- [x] Admin Dashboard KPI card and the Excel Summary sheet's Net Recoverable total switched from
      "summed across all 5 years" (which would now double-count carried-forward balances) to
      "each district's FY 2025-26 value, summed across districts" — the true outstanding balance
      as of 31 March 2026. Gross Arrears/Recovered Amount totals are unchanged (still legitimately
      summed across years, since those are each year's own fresh figures).

## Milestone 21 — Session auth: cookies → Bearer token (done)

- [x] Real production incident: a DEO login during a live demo entered their CUG number and the
      app just reloaded back to `/login` — reproduced as the two-cookie session
      (`__admin_session`/`__deo_session`, `SameSite=None; Secure`) silently getting blocked as a
      third-party cookie. Previously documented as an "open risk" specific to Safari ITP; this
      confirmed it also hits plain Chrome (Incognito, or any profile with third-party cookies
      off) — not a Safari-only edge case.
- [x] Switched session auth from cookies to a Bearer token: `POST /api/auth/verify-cug` and
      `POST /api/auth/verify-magic-link` return the JWT in the JSON body instead of a
      `Set-Cookie` header; `frontend/lib/session.ts` stores it in `localStorage`, keyed per role
      (`excise-portal:session:admin` / `:deo`) so an Admin and a DEO session still coexist in one
      browser the same way the two separate cookies used to; `frontend/lib/api.ts`'s
      `apiFetch(path, init, role)` attaches it as `Authorization: Bearer <token>`.
      `api/lib/auth-guard.ts`'s `requireSession()` now reads that header instead of
      `req.cookies`. No cookie in play means no browser cross-site-cookie policy applies, on any
      browser, in any privacy mode.
- [x] `api/middleware.ts`'s CORS narrowed to a single-origin echo replaced with
      `Access-Control-Allow-Origin: *` (no `Access-Control-Allow-Credentials`) — safe now
      specifically because there's no ambient cookie credential a third-party page could
      piggyback on.
- [x] Logout and "lock kills the session" both moved from server-enforced (`Set-Cookie` with
      `Max-Age=0`) to purely client-side (`clearClientSession(role)` right after the API call
      succeeds) — a stateless JWT has no server-side revocation list to update either way.
- [x] Accepted trade-off, assessed rather than assumed: a token in `localStorage` is readable by
      same-origin JS (unlike an `HttpOnly` cookie), so an XSS bug could steal it. Checked the
      actual attack surface before accepting this — the only `dangerouslySetInnerHTML` in the
      frontend is a static, hardcoded dark-mode bootstrap script (`app/layout.tsx`), not
      user-controlled data; no DEO/admin-entered value is ever rendered as raw HTML anywhere in
      the app today.
- [x] `frontend/e2e/login.spec.ts`'s magic-link round-trip test updated to assert a stored
      `localStorage` session token instead of a `__admin_session` cookie.
- [x] Documented in CLAUDE.md (new "Why not cookies" subsection under Auth), README.md's Auth
      section, DEPLOY.md's known constraints, and TESTING.md's Incidents log.

## Milestone 22 — Per-RC detail breakdown (done)

Currently `pac_data` captures only the *aggregate* RC figures per FY: `rcCount` (how many RCs
issued) and `rcAmount` (their combined value). The department needs the individual RCs behind
that count/total: RC Number, that specific RC's amount, and whether any court has stayed it.

**Scope boundary (explicitly confirmed with the department):** this is a detail capture only.
It does not change `recoveredAmount`, `stayAmount`, `openingBalance`, or `netRecoverable` — an
RC is issued to inform a defaulter what they owe and can be for any amount, independent of what's
actually recovered (same reasoning as the existing RC Amount/Recovered Amount decoupling from
Milestone 19). The per-RC "stayed" checkbox is a new, separate signal, **confirmed independent** of the
existing aggregate Stay Count/Stay Amount fields (order 5.i/5.ii) — the two concepts are
genuinely different: Stay Count/Stay Amount (order 5) is a court staying *recovery of an
amount* (subtracted from Net Recoverable); the per-RC "stayed" checkbox is a court staying the
*RC itself* — i.e. even the demand notice/order to pay is suspended, independent of whether any
money against it was ever going to be pursued. No cross-check or roll-up between the two.

### Data model

New column, one per `pac_data` row (i.e. per district per FY), migration
`0006_numerous_marten_broadcloak`:

```sql
ALTER TABLE `pac_data` ADD `rc_details` text DEFAULT '[]' NOT NULL;
```

```ts
// duplicated in api/lib/rc-details.ts and frontend/lib/pac-fields.ts, same as every other
// cross-app shape in this repo (no shared package — see CLAUDE.md's Repo shape section)
type RcDetail = {
  rcNumber: string;  // freeform (letters/digits/punctuation), trimmed, 1–50 chars
  rcAmount: number;  // this specific RC's amount, >= 0
  stayed: boolean;   // has any court stayed this specific RC? default false
};
```

Stored as a JSON string in one column (per the department's ask) rather than a child table —
consistent with `audit_log.metadata`'s existing JSON-string-column precedent in this schema.
Applied to local D1; **not yet applied to remote/production D1** (`pnpm run db:migrate:remote`) —
that's a deliberate hold pending a final go-ahead, since the API worker cannot deploy ahead of
this migration without breaking every live DEO submission (`pac_data` insert would reference a
column remote D1 doesn't have yet).

### Validation (zero-trust, mirrored client + server)

`validateRcDetails(rcCount, rcAmount, rcDetails)` lives in `api/lib/rc-details.ts` (new file) and
is mirrored byte-for-byte in `frontend/lib/pac-fields.ts`. Called from
`api/app/api/pac-data/submit/route.ts`'s `validateRow()` server-side, and from
`YearStepForm.tsx`'s exported `rcDetailsError()` (client-side, used both for the live inline
total shown in the form and to block `saveAndContinue()` in `deo-data-entry/page.tsx`):

1. `rcDetails.length === rcCount` exactly.
2. Every entry's `rcNumber`: non-blank after trim, ≤ 50 chars (Anti-Blank Rule extends here).
3. Every entry's `rcAmount`: a valid finite number ≥ 0.
4. **`sum(entry.rcAmount for entry in rcDetails) === rcAmount`** (the aggregate "3.(ii)" field),
   compared with a small epsilon (`Math.abs(sum - rcAmount) < 0.01`, not strict `===`) since
   these are floating-point rupee amounts.
5. `entry.stayed` must be boolean.

The existing rule "`rcAmount > 0` requires `rcCount > 0`" is unaffected and still enforced first.

### Frontend

- `frontend/lib/db.ts`'s `DraftYear` gains `rcDetails: DraftRcDetail[]` (raw string amount,
  matching the Anti-Blank Rule's string-until-submit pattern). **No Dexie version bump needed** —
  Dexie's `.stores()` schema string only declares the primary key/indexes, not every property, so
  a new non-indexed field needs no migration; a pre-existing IndexedDB row from before this field
  existed just won't have it, so every read site falls back to `year.rcDetails ?? []`.
- `YearStepForm.tsx`: a collapsible "RC Details (N)" section (English-only label — not one of the
  original 6 government-form fields, so no Hindi under the "UI chrome is English only" rule)
  appears under the RC Amount field whenever `rcCount > 0`, open by default. Inside: exactly
  `rcCount` numbered rows, each an RC Number text input (`maxLength={50}`, placeholder `"RC
  Number"`, genuinely freeform), an RC Amount money input (Cleave.js), and an unchecked-by-default
  "Stayed by court?" checkbox. `syncRcDetailsToCount()` (exported) keeps the row count in sync
  with `rcCount` as the DEO edits it — growing appends blank rows, shrinking truncates trailing
  rows, no confirm dialog. A live "Entered: ₹X / Required: ₹Y" line turns bold red (bilingual
  Hindi line added) once any RC field has been blurred and the total doesn't match.
- `deo-data-entry/page.tsx`: `updateField()` calls `syncRcDetailsToCount()` the moment `rcCount`
  changes; new `updateRcDetail()` handles per-row edits; `saveAndContinue()`'s blank check now
  also covers every RC Detail row, plus a new `rcDetailsError()` check (bilingual toast) mirroring
  the recovered-amount-cap pattern; `submitAll()`'s payload includes each year's `rcDetails`
  (trimmed, numeric); the `GET /api/pac-data/mine` remote-merge path parses the stored JSON string
  back into the draft shape for a re-editing DEO (`parseRemoteRcDetails()`, lenient — this is a
  re-fetch of the DEO's own already-validated data, not a fresh zero-trust boundary).

### Backend

- `api/app/api/pac-data/submit/route.ts`: `YearRow.rcDetails: RcDetail[]`; `validateRow()` calls
  `validateRcDetails()`; the insert stores `JSON.stringify(row.rcDetails)`. The whole DB-touching
  portion of the handler is now wrapped in `try/catch` (this app's first — see the Backlog item
  below on retrofitting the rest of the API the same way) returning a clean `{ error }` JSON 500
  instead of an uncaught throw.
- `GET /api/pac-data/mine` and `GET /api/admin/districts` needed **no code changes** — both
  already do a bare `db.select().from(pacData)`, so the new column flows through automatically as
  a raw JSON-string field; consumers parse it on demand.

### Admin-facing views (shipped)

- **Admin district detail page**: a small "N RCs" pill next to that FY's RC Amount cell (only
  when RCs exist), opening a lightweight absolutely-positioned dropdown panel listing every RC's
  number, amount, and a stayed check/dash — one panel open at a time, toggled by clicking the pill
  again.
- **Excel export**: a new **"RC Details"** sheet (not per-FY — one flat sheet across every
  district/FY, since a district's RC count varies per FY and a flat table sorts/filters better
  than five sparse per-FY sheets): District, Financial Year, RC Number, RC Amount, Stayed
  (Yes/No), one row per RC. `exportDistrictsToSql()`'s `pac_data` INSERT also gained the
  `rc_details` column.
- The admin districts table stays summary-only, unchanged, as planned.

### Follow-up UI refinements (done)

- RC Details entry table: RC Number/RC Amount columns switched to equal width (`table-fixed`,
  see CLAUDE.md's UI conventions for why that's safe here specifically) instead of RC Number
  eating all the leftover space under the default auto-layout.
- The "Stayed?" checkbox column relabeled to a bilingual "Stayed by Court? / सक्षम न्यायालय
  द्वारा स्थगित?" — mirrors the existing Stay Amount field's Hindi phrasing exactly, since it's
  the same underlying concept (a competent court staying something) applied per-RC instead of
  in aggregate.
- `HelpPanel.tsx` gained an optional `childrenHi` prop: an English/हिंदी toggle appears above
  the help content when passed, switching which language renders. Only the DEO entry page's
  instance uses it (a full Hindi translation of its help text, including a new paragraph
  explaining the RC Details section) — Admin pages' instances are unaffected, no toggle shown.

## Milestone 23 — try/catch error handling across every API route (done)

Retrofits the item Milestone 22 deliberately deferred: 11 of 12 routes had no try/catch at all
(only `admin/provision-deos` did, per-row, for expected unique-constraint failures during bulk
upload) — an unexpected DB error anywhere else bubbled up uncaught to the framework's default
response instead of this app's own `{ error: "..." }` JSON shape.

- New `api/lib/with-error-handling.ts`: `withErrorHandling(routeName, handler)` — a small
  higher-order wrapper (not a copy-pasted try/catch in every file) that catches anything a
  route's own validation didn't anticipate, logs it server-side (`routeName` is just a log
  label, never shown to the client), and returns a clean `{ error: "Something went wrong —
  please try again." }` JSON 500. A route's own expected-error responses (400/401/404/409, ...)
  are ordinary early `return`s from inside the handler and pass through completely untouched —
  verified locally: a bad CUG hash still 400s, no session still 401s, and only genuinely
  malformed input (unparseable JSON body) now gets the clean 500 instead of an uncaught
  exception.
- Every route's `export async function GET/POST` became `export const GET/POST =
  withErrorHandling("route/name", async (req) => { ... })` — all 12 routes across
  `auth/*`, `admin/*`, and `pac-data/*`.
- `admin/provision-deos`'s existing per-row try/catch is untouched and still does its own,
  different job (expected unique-constraint hits, one bad row shouldn't abort the other 74) —
  the outer wrapper only catches what neither that loop nor the route's validation anticipated.
- `pac-data/submit`'s own bespoke inline try/catch (added in Milestone 22, ahead of this pass)
  was removed in favor of the shared wrapper, for one consistent pattern across the whole API
  instead of one route doing it its own way.
- Transactions were already correct going into this (see Milestone 22's audit note) — `db.batch()`
  is used everywhere a multi-write genuinely needs atomicity; nothing changed there.

## Milestone 24 — Switched to pnpm (done)

Every other project in this workspace (`excise-bakaya-record`, `up-excise-spatial-revenue-
optimizer`) already uses pnpm; this repo was the odd one out on npm. No functional change —
tooling only.

- `api/package-lock.json` and `frontend/package-lock.json` replaced with `pnpm-lock.yaml`
  (`pnpm import` from the existing npm lockfile, so resolved versions carried over exactly,
  then a clean `rm -rf node_modules && pnpm install` in each app).
- Each app gained a `pnpm-workspace.yaml` with `allowBuilds: { esbuild, sharp, unrs-resolver,
  workerd }` — pnpm blocks native postinstall scripts by default
  (`ERR_PNPM_IGNORED_BUILDS`), and these four are needed by `wrangler`/`opennextjs-cloudflare`/
  Next itself. See CLAUDE.md's Repo shape section for what to do if a new dependency needs this
  too.
- `.github/workflows/ci.yml` and `deploy.yml`: `actions/setup-node@v4`'s npm cache replaced
  with `pnpm/action-setup@v4` + `cache: pnpm`; every `npm ci` → `pnpm install
  --frozen-lockfile`; every `npm run <script>` → `pnpm run <script>`.
- `frontend/e2e/login.spec.ts`'s `execFileSync("npx", ["wrangler", ...])` → `execFileSync("pnpm",
  ["exec", "wrangler", ...])`, and every `npx wrangler`/`npx tsc` command across README.md,
  DEPLOY.md, and TESTING.md updated to `pnpm exec`.
- Verified before pushing: both apps typecheck and build clean under pnpm (`pnpm exec tsc
  --noEmit`, `pnpm run build`, plus `opennextjs-cloudflare build` for the API), confirming
  pnpm's stricter (non-flat, symlinked) `node_modules` didn't surface a phantom-dependency bug
  that npm's flat hoisting had been silently papering over.

## Milestone 25 — RC Details contrast fix, stayed dropdown, production rollout (done)

- [x] `YearStepForm.tsx`'s RC Details table had several light-mode text elements (`slate-400`/
      `slate-500` on white) that were hard to read — header cells, the Hindi sub-label under
      "Stayed by Court?", the row-number column, and the "Entered / Required" total line all
      bumped one shade darker (`slate-500`/`slate-600`) in light mode; dark mode unchanged.
- [x] The per-RC "Stayed by Court?" checkbox replaced with a bilingual `Select` dropdown
      ("No / नहीं", defaulting to No; "Yes / हाँ") — a checkbox risked an accidental/unintentional
      tick, a dropdown forces a deliberate choice. `RcDetail.stayed` is still a plain `boolean`
      in the schema, `api/lib/rc-details.ts`'s `validateRcDetails()`, and
      `frontend/lib/pac-fields.ts` — this was a UI-widget change only, no type/schema/migration
      change needed.
- [x] DEO entry Help panel (English + Hindi) updated to describe the dropdown and its No-default
      instead of the old "mark whether it has been stayed" checkbox wording.
- [x] Deployed to production: confirmed migration `0006_numerous_marten_broadcloak` (`rc_details`)
      was already applied to remote D1 (checked via `wrangler d1 execute --remote`, so no
      migration run was needed this time); `api` redeployed (`pnpm run deploy`); `frontend`
      rebuilt and redeployed (`pnpm run pages:deploy`), confirmed landing as a real `Production`
      deployment (not a stray Preview) via `wrangler pages deployment list`; verified CORS
      headers and `/login`/`/deo-data-entry` both 200 post-deploy. Portal is now ready for DEOs
      to enter real (non-demo) data.

## Milestone 26 — DEO Provisioning split out, app-wide dropdown-clipping fix (done)

- [x] New `/admin/districts/provisioning` page: Download DEO Template / Upload DEO Data moved
      off the `/admin/districts` toolbar, which was crowded next to the status/FY filters and
      the two export buttons. Reached via `ProfileMenu`'s "Admin" dropdown (a new admin-only
      `Link`, not the flat Dashboard/Districts/Audit Log nav) since it's an occasional bulk-ops
      task, not a page an admin needs on every visit.
- [x] `/admin/districts` toolbar: search box narrowed (`max-w-xs` → `max-w-[13rem]`) and its row
      gap widened (`gap-3` → `gap-6`) so it reads as clearly left-aligned against the
      now-shorter right-aligned filter/export button group.
- [x] Root-caused the recurring "dropdown text clipped at the top" complaint (previously patched
      once, per-instance, on the RC Details "Stayed by Court?" dropdown in Milestone 25) instead
      of patching each new occurrence: `Select.tsx` now sets `style={{ lineHeight: "1.4", ...style
      }}` by default on every dropdown app-wide (overridable per call site via its own `style`
      prop). `globals.css`'s `select { line-height: 1 }` is an unlayered rule no Tailwind
      `leading-*` utility can outrank (see CLAUDE.md) — only an inline style has enough cascade
      precedence, and padding alone (the FY selector's earlier `py-2` → `py-2.5` fix) was never
      going to fully fix it. Removed the now-redundant one-off inline style this replaced from
      `YearStepForm.tsx`.
- [x] Deployed to production and verified: new route returns 200, existing `/admin/districts`
      unaffected.

## Milestone 27 — RC Details grouped into the Excel export (done)

- [x] Each FY sheet in `exportDistrictsToXlsx()` now shows that year's own per-RC breakdown
      in place: every district row is immediately followed by a collapsed sub-row per RC it has
      that FY (indented `↳ RC number — Stayed`, amount under the same RC Amount column),
      collapsed by default via Excel's outline `+`/`-` group control on the district row
      (`ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false }`).
      Previously a district's RC breakdown for a given year wasn't visible on that year's own
      sheet at all — only the aggregate `rcAmount` total.
- [x] The trailing **RC Details** sheet — previously one flat, unstructured row-per-RC table
      across all 75 districts × 5 years — is now grouped per district (a bold `District — "N
      RC(s)"` summary row, its RCs collapsed underneath, same outline convention as the FY
      sheets) with an `autoFilter` on the header row so District/Financial Year/Stayed can be
      filtered directly. Un-grouped, an admin/auditor had to scroll a table that could run to
      hundreds of rows with no structure to find one district's RCs.
- [x] No schema/migration change — this is entirely `frontend/lib/export.ts`, reading the same
      `rc_details` JSON already synced client-side.

## Backlog / not started

- [ ] Real domain + DNS, and (optional) collapse `/frontend` + `/api` onto one zone via a
      Worker Route or Pages Function — **at that point, switch auth back from a Bearer token to
      `HttpOnly` cookies** (`SameSite=Lax`/`Strict` becomes possible once same-site), since
      cookies are the more secure option whenever same-site is actually achievable. This does
      not require standing up a separate server — a Worker Route/Pages Function on the same zone
      as a purchased domain is enough to make both apps same-site.
- [ ] Verify `mail.upexciseonline.co` (or chosen domain) in Resend and switch `FROM_EMAIL`
      off the shared sandbox sender
- [ ] **SMS OTP login for DEOs**, replacing (or added alongside) the current CUG-hash login —
      the department already has an SMS API procured for other portals; vendor can provide
      access, and DoT template approval for a simple login-OTP text is described as routine, not
      a blocker. Two shapes to choose between when this is scoped: (a) real OTP-based auth —
      send OTP → verify OTP → issue the same JWT, needs a new `otp`/`otp_expires_at` column plus
      per-number rate-limiting, closer to the existing magic-link flow than the CUG flow; or (b)
      keep CUG-hash as the identity check and use SMS only for notifications, no new auth flow.
      (a) is the stronger login (today's CUG hash is effectively a shared static secret); (b) is
      the smaller diff. Needs its own scoping pass — new migration, vendor API key as a new
      Worker secret, and a rate-limiting story — not a drop-in addition to the current flow.
