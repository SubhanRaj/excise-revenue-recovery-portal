# CLAUDE.md — Excise Revenue Recovery Portal

Instructions for AI agents working in this repo. Each subdirectory has its own `CLAUDE.md`
(`@AGENTS.md`) with a Next.js-version warning — read those too. See
[ROADMAP.md](./ROADMAP.md) for what's shipped and what's left; this file documents how the
shipped system works, not its build history.

## What this is

Government portal (Excise Dept., Uttar Pradesh) for District Excise Officers (DEOs) to submit
5 years of PAC/RC recovery data, and for Admins to review/export/unlock it. One submission per
district is final: once a DEO locks, it cannot be re-edited without an Admin unlock.

## Repo shape

`/frontend` and `/api` are two independent Next.js apps — separate `package.json`,
`node_modules`, deployments. No shared package. Constants present in both (financial years,
PAC field order/labels) are duplicated by design: `frontend/lib/pac-fields.ts` mirrors
`api/db/schema.ts`. When you change field names, units, or validation rules, change both and
keep them in sync by hand.

The two apps talk only over cross-origin HTTP; session auth is a Bearer token, not a cookie —
see Auth below for why.

## Data model

See [README.md](./README.md)'s Data model section for the full table/column/migration
reference. Rules an agent must preserve when touching `pac_data` or its computed fields:

- `POST /api/pac-data/submit` must delete existing rows for the district before inserting the
  new 5, inside one atomic `db.batch()` — an Admin unlock never clears `pac_data`, so a second
  submit for the same district would otherwise collide with the `(district_id, financial_year)`
  unique index.
- `opening_balance`/`net_recoverable` are computed and written server-side only
  (`api/lib/net-recoverable.ts`'s `computeNetRecoverableSeries()`, mirrored byte-for-byte in
  `frontend/lib/pac-fields.ts`) — never trust these from the client payload. The formula uses
  `recoveredAmount`, never `rcAmount` (an issued RC amount is not a recovered amount).
- Every view of a district's per-FY PAC figures must show both `opening_balance` and
  `net_recoverable` alongside them (`YearStepForm.tsx`, `MasterView.tsx`, the admin district
  detail table, the admin districts table, the Excel export) — add both when adding a new such
  view. Only the DEO's own not-yet-submitted draft is computed live client-side; every
  submitted-district view reads the two values straight from the synced `pac_data` row.
- **The Admin Dashboard KPI card and the Excel Summary sheet's "Net Recoverable" total sum each
  district's FY 2025-26 `net_recoverable` only** — never sum across all 5 years, since each FY's
  value already includes prior years' carried-forward balance. Gross Arrears and Recovered
  Amount totals stay legitimately summed across all 5 years (fresh per-year figures).
- Always write `locked_at`/`created_at` timestamps as `new Date().toISOString()` from JS, never
  a SQL `CURRENT_TIMESTAMP` default (SQLite stores that without a timezone marker). `formatIST()`
  (`frontend/lib/format.ts`) is the only place that converts to IST for display; storage stays
  UTC always.
- `pac_data.rc_details` is a JSON-stringified `RcDetail[]` (per-RC number/amount/stayed
  breakdown behind the aggregate `rcCount`/`rcAmount` fields), validated by
  `api/lib/rc-details.ts`'s `validateRcDetails()` (mirrored in `frontend/lib/pac-fields.ts`) —
  row count must equal `rcCount`, and every entry's `rcAmount` must sum to the aggregate
  `rcAmount`. It does **not** feed into `recoveredAmount`/`stayAmount`/`openingBalance`/
  `netRecoverable` — an RC's own detail is independent of what's actually recovered (see
  Validation rules below). Only the admin district detail page (a small disclosure next to the
  RC Amount cell) and the Excel export's dedicated "RC Details" sheet surface it; the admin
  districts table stays summary-only.

## Validation rules — enforce on both client and server

1. **Anti-Blank Rule**: an empty field is never coerced to `0`. The frontend tracks field values
   as raw strings in Dexie so `""` (never typed) stays distinguishable from `"0"` (explicit
   zero) until submit; the API rejects non-numeric/missing values outright.
2. `rcAmount` and `recoveredAmount` have no parity requirement — enter each as its own real
   figure. An RC can be issued for more or less than what's recovered against it, and money can
   be recovered in a year with no RC issued at all.
3. **Zero-trust on submit**: `POST /api/pac-data/submit` re-validates every field itself
   (`validateRow()`), regardless of client-side checks. Mirror any new client-side rule there.
4. **Recovered Amount is capped** at that FY's Opening Balance + Gross Arrears — a DEO cannot
   recover more than was ever owed within the 5-year window. Enforced client-side in
   `deo-data-entry/page.tsx`'s `saveAndContinue()` and server-side in the submit route, as a
   separate loop after `computeNetRecoverableSeries()` (it needs the computed `openingBalance`,
   which only exists once every row has passed `validateRow()`), placed before the `db.batch()`.
5. **A non-zero `rcAmount`/`stayAmount` requires a non-zero `rcCount`/`stayCount`** — an RC
   issued or a stay order granted for money implies at least one RC/order exists; a DEO can't
   enter an amount against a count of 0. Enforced in `api/lib/net-recoverable.ts`'s sibling
   `validateRow()` (`api/app/api/pac-data/submit/route.ts`) and mirrored client-side as an
   inline, bold, bilingual, blur-triggered field error under the count field
   (`YearStepForm.tsx`'s `countAmountErrors()`, also blocking `saveAndContinue()` in
   `deo-data-entry/page.tsx` for the case a DEO never blurs the offending field).
6. **The per-RC breakdown's own amounts must sum to the aggregate RC Amount field, and its row
   count must equal RC Count.** Enforced in `api/lib/rc-details.ts`'s `validateRcDetails()`
   (mirrored in `frontend/lib/pac-fields.ts`), called from the submit route's `validateRow()`
   and from `YearStepForm.tsx`'s `rcDetailsError()` (blocks `saveAndContinue()`, shows a
   bilingual toast, same pattern as rule 4 above). Each entry's `rcNumber` is subject to the
   Anti-Blank Rule too (non-blank, ≤ 50 chars) — see the Data model section above for the column
   itself and why it's independent of Recovered Amount/Stay Amount.

Every DEO-facing view of the six PAC fields carries a scope-of-data-period notice: a DEO must
enter only dues/recoveries that arose within that specific financial year — never arrears from
before 1 April 2021 or after 31 March 2026, and never a recovery of a pre-2021-22 due. Nothing in
the schema enforces this; it is a data-entry instruction, not a validation rule.

## Auth (`api/lib/session.ts`, `api/lib/auth-guard.ts`, `api/middleware.ts`, `frontend/lib/session.ts`)

See [README.md](./README.md)'s App flow → Auth for the CUG/magic-link flow overview. Session
auth is a **Bearer token, not a cookie** — this was a deliberate migration away from cookies
(see "Why not cookies" below); don't reintroduce `Set-Cookie`/`req.cookies` for session auth
without re-reading that section first. Rules an agent must preserve:

- **Two separate token slots**, keyed by role in `frontend/lib/session.ts`'s `localStorage`
  (`excise-portal:session:admin` / `excise-portal:session:deo`) — never merge back into one.
  `POST /api/auth/verify-cug` and `POST /api/auth/verify-magic-link` return `{ role,
  districtId, token }` in the JSON body (not a `Set-Cookie` header); the frontend stores it via
  `saveClientSession()` and attaches it on every subsequent call via `apiFetch(path, init,
  role)`'s third argument, which reads `getToken(role)` and sets `Authorization: Bearer
  <token>`. Every API route that needs a session calls `requireSession(req, "admin" | "deo")`
  (`api/lib/auth-guard.ts`), which reads that header — **never add `req.cookies` back into
  `requireSession`**. The frontend still passes `?role=admin`/`?role=deo` on `GET
  /api/auth/me` and `POST /api/auth/logout` (the query param picks which role's session to
  check/log; the header carries which role's token actually gets sent).
- Real CUG numbers start with `94544`; `app/login/page.tsx` gates on this prefix before
  hashing/sending, and the error is the same generic "Invalid user" a real auth failure shows —
  never name the prefix rule in the message. The one demo account is matched against a
  precomputed `DEMO_CUG_HASH` constant, not raw digits — the real demo number lives only in the
  `DEMO_CUG` Cloudflare Worker secret; never add it to source or docs.
- `frontend/app/verify/page.tsx` requires an explicit button click (POST, not GET) so email
  prefetchers can't burn the magic-link token.
- `GET /api/auth/me?role=admin|deo` is the source of truth for `{role, districtId}` on every
  gated page load — call it directly (with that role's token attached), never gate a page on
  the `excise-portal:last-role` hint in `frontend/lib/session.ts` (that hint is shared across
  the whole browser and only exists for `/`'s first-paint redirect guess — it goes stale the
  instant the other role logs in on any tab, and carries no token of its own). A 401 here means
  "not logged in as this role," full stop — an expired token and a missing one look identical to
  the frontend, which is correct: there's no server-side revocation list to consult either way
  (see below). `GET /api/auth/me?role=deo` also returns `lockStatus`/`lockedAt`/
  `submittedByName`, re-asked on every load (never cached) since an Admin unlock can happen at
  any time.
- Session tokens are **stateless JWTs with no server-side revocation** — logout and "lock kills
  the session" are both purely client-side now (there is no `denylist`/`revoked_tokens` table,
  and adding one would be a real feature, not a bug fix — don't add it speculatively). `POST
  /api/auth/logout?role=` only records an audit-log event; the frontend discards its own stored
  token immediately after that call (`AppHeader.logout()`, `deo-data-entry/page.tsx`'s
  `logoutLocked()`). Submitting a DEO's final payload atomically locks the district in D1; the
  frontend then calls `clearClientSession("deo")` right after a successful submit (an Admin
  session in the same browser is untouched, since it's a different token slot) — the DEO can
  still technically use that same token until it expires (7 days) if they somehow kept a copy
  outside the app, same residual-validity trade-off any stateless-JWT design accepts.

### Why not cookies

The original design used two `HttpOnly; Secure; SameSite=None` cookies (`__admin_session`,
`__deo_session`), which is the standard secure pattern for a session — but only when the
browser cooperates. `/frontend` (Pages, `*.pages.dev`) and `/api` (Worker, `*.workers.dev`) are
different public-suffix domains in production, so that cookie is a **third-party cookie** by
definition, and this repeatedly broke real logins: Safari ITP blocks it outright, and it
started intermittently failing in plain **Chrome** too (Incognito blocks third-party cookies by
default; a locked-down/managed profile can too) — reproduced live during a demo as "enter CUG,
page just reloads back to the login screen" (the CUG POST succeeds, the cookie silently never
sticks, the next page's `/api/auth/me` 401s, and the app bounces back). No CORS header fixes
this — it's enforced entirely by the browser's own cookie policy before any response header is
even read.

A Bearer token isn't a cookie, so no browser's cross-site-cookie policy applies to it at all —
that's the actual fix, not a workaround. `api/middleware.ts` now sends
`Access-Control-Allow-Origin: *` (no `Access-Control-Allow-Credentials`, since there's no cookie
credential to protect) — this is safe specifically *because* there's no ambient credential a
malicious page could piggyback on; a wildcard origin can't make the browser attach a token that
was never automatically sent in the first place. Trade-off accepted deliberately: a token in
`localStorage` is readable by same-origin JS, so an XSS bug in the frontend could steal it
(unlike an `HttpOnly` cookie). Assessed as acceptable for this app because there is currently no
path where DEO-entered or admin-entered data is rendered as raw HTML anywhere (checked: the only
`dangerouslySetInnerHTML` in the frontend is a static, hardcoded dark-mode bootstrap script in
`app/layout.tsx`, not user data) — if that ever changes (someone adds a `dangerouslySetInnerHTML`
on user-controlled input), re-assess this trade-off before shipping it.

**If this app ever gets a custom domain — and it doesn't strictly need a separate server for
that, just a Cloudflare Worker Route or Pages Function on the same zone fronting both
`/frontend` and `/api` under one registrable domain — switch back to `HttpOnly` cookies
(`SameSite=Lax` or `Strict` becomes possible once same-site) instead of a Bearer token.**
Cookies are the more secure option (immune to XSS token theft) whenever same-site is actually
achievable; the Bearer-token design here is a deliberate concession to the two-separate-origins
constraint, not a general recommendation. See DEPLOY.md's "Known deployment constraints" and
ROADMAP.md's Backlog for the standing reminder to revisit this if a domain shows up.

## Portal identity strings (`frontend/lib/site.ts`)

`SITE_TITLE_EN`/`SITE_TITLE_HI` and `DATA_PERIOD_EN`/`DATA_PERIOD_HI` live in one file so the tab
meta description, login page, and DEO title bar can't drift out of sync. The Excel export's
per-sheet banner uses `SITE_TITLE_EN` but computes its own one-year `dataPeriodForFY()` instead
of `DATA_PERIOD_EN`, since each sheet covers a single FY. Not merged into `pac-fields.ts` — it
has no server-side equivalent to stay in sync with. If the 5-year window in `FINANCIAL_YEARS`
ever shifts, update these strings by hand.

`SITE_TITLE_HI` uses "आबकारी" (state excise/Abkari), never "उत्पाद शुल्क" (Central Excise/GoI
term) — this portal is UP state excise revenue, a different tax entirely. Use आबकारी in any new
Hindi copy referring to this revenue/department.

## Frontend offline flow (`frontend/lib/db.ts`, Dexie)

See [README.md](./README.md)'s App flow → DEO data entry for the three-state overview. Rules an
agent must preserve:

- Every keystroke persists to Dexie (`draftYears`) — no network call happens until final submit,
  which sends all 5 years in one atomic payload.
- The three-state branch on login must key off the **server's** current `lockStatus` (from `GET
  /api/auth/me?role=deo`), never a cached value — an Admin unlock can happen at any time between
  logins. Still-locked renders a read-only "Data Already Locked" screen (`formatIST(lockedAt)`,
  bilingual contact-Admin message, `max-w-2xl`, no form); its own full-width Logout button skips
  the blocking confirm (`logoutLocked()`, not the shared `AppHeader.logout()`), since logout is
  the only action available there. Unlocked-after-a-previous-submission calls `GET
  /api/pac-data/mine`, writes the result into Dexie via `bulkPut`, and marks every year
  `completed` before landing on the Master View.

Clearing a draft is client-only and only reachable pre-lock (nothing exists server-side until
submit). Both entry points sit behind a blocking confirm
(`confirmClearYear()`/`confirmClearAll()`):

- **Per-year "Clear"** resets that step via `clearYear()`; if the cleared year was `completed`,
  every later year it had unlocked locks again, and `step` drops back to the cleared year.
- **"Clear All"** calls `db.draftYears.clear()` and resets to FY 2021-22.

`YearStepForm` is a plain controlled component (no internal field state); every field reads/
writes through `onFieldChange` to the parent's `years`/Dexie state.

An Admin unlock (`districts.lock_status` → 0) only lets the DEO edit again — it never clears
`pac_data`, since an unlock is usually meant to correct existing figures, not restart from zero.

**The DEO's name is collected at lock time, not as a form field.** `MasterView.tsx` has no name
input — clicking "Submit & Lock" runs a two-step SweetAlert2 flow (`frontend/lib/alerts.ts`):

1. `confirmFinalSubmit()` — yes/no: verify the data, locking is irreversible without Admin help.
2. `promptDeoNameAndLock()` (only if step 1 confirmed) — a text input with a liability
   disclaimer, validated by `validateDeoName()`: rejects blank input, digits (guards against a
   pasted CUG number), and a designation typed as a name (whole-word regex for
   "deo"/"officer"/etc.). Returns `null` on cancel; `deo-data-entry/page.tsx`'s `submitAll()`
   bails on either step returning falsy.

Both dialogs are bilingual. `app/layout.tsx` sets a global
`.swal2-container { backdrop-filter: blur(3px) }` for every SweetAlert2 modal.

The Admin dashboard caches all districts + PAC rows in Dexie (`adminDistricts`, `adminPacData`)
for instant load, with an explicit Sync button to refetch from D1.

**Year labels always read "FY 2021-22"** — never "Year 1" or a bare "2021-22" — everywhere a
financial year appears: DEO nav pills, `YearStepForm` headings, Admin selectors/column headers
(`FY {fy}`), `MasterView`'s table, Excel sheet names (`` `FY ${fy}`.replace(/\//g, "-") ``).

## Visual language

- **Brand color is `blue-*` (Tailwind default), never `indigo-*`**, across every component
  including the magic-link email's inline hex colors. `frontend/e2e/login.spec.ts` asserts
  `text-blue-700` on the active login tab as a regression guard.
- **Dark mode** (`frontend/lib/theme.ts`, `ThemeToggle.tsx`): persisted in `localStorage`
  (`excise-portal:theme`), defaults to OS `prefers-color-scheme`. `app/layout.tsx`'s blocking
  inline `<script>` sets the `.dark` class on `<html>` before first paint. The `<style
  type="text/tailwindcss">` block that declares `@custom-variant dark
  (&:where(.dark, .dark *));` must appear **before** the Tailwind CDN `<script>` tag in `<head>`
  — the CDN script is a blocking `<script>`, so anything written after it in source is not yet in
  the DOM when it runs, and `dark:` utilities silently fall back to the OS media query instead of
  the manual toggle. `ThemeToggle` lives in `AppHeader` only (not on `/login`/`/verify`, which
  just inherit whatever the blocking script resolved). Use the existing `dark:bg-slate-900` /
  `dark:text-slate-100` / `dark:border-slate-800` pattern for new components. `<head>` also
  declares `<meta name="color-scheme" content="light dark" />`.
- **`frontend/app/globals.css` is a plain external stylesheet, not wrapped in a Tailwind
  `@layer`.** CSS Cascade Layers make any unlayered rule in this file outrank every
  `@layer`-wrapped Tailwind utility for the same property, regardless of specificity. Never add a
  bare `color`, `padding`, or other styling rule for `body`/`button`/`input`/`select` here — it
  will silently defeat every matching Tailwind utility class (including `dark:` variants) app-
  wide. Any fallback rule for these elements must be wrapped in `@layer base { ... }`. If a
  component's Tailwind spacing/color utility appears to have no effect, check this file for an
  unlayered rule on the same property before assuming the utility class is wrong.
- **Icon-vs-label vertical alignment**: `globals.css`'s `input, select, button { font: inherit;
  line-height: 1; }` keeps button/label text and Tabler's `.ti` icons (which hardcode
  `line-height: 1`) in matching line boxes. Keep both declarations together on this rule if you
  touch it.

## UI conventions

- **Language**: UI chrome is English only. The only Hindi is the 6 PAC field labels and the
  department name, because they mirror the actual government form. Don't add Hindi elsewhere.
- **Feedback**: a field-specific error renders inline under the field (bold, bilingual, only
  after blur). A generic error not tied to one field uses `notifyToast()`. Page-level
  success/failure (sync, submit) uses `components/ui/Banner.tsx`. `window.Swal` (SweetAlert2) is
  reserved for blocking confirms before an irreversible/session-ending action
  (`confirmFinalSubmit()`, `confirmLogout()`, `confirmClearYear()`/`confirmClearAll()`,
  `promptUnlockReason()`) and for toasts via `notifyToast()` (`showCloseButton: true`, responsive
  width). Don't call `window.Swal.fire({ toast: true, ... })` directly — always go through
  `notifyToast()`.
- **"Welcome" toast fires once per sign-in**: `frontend/lib/session.ts`'s
  `markJustAuthed()`/`consumeJustAuthed()` gate it via `sessionStorage`. Any new post-auth
  redirect destination must call `markJustAuthed()` before redirecting, or the toast won't show.
- **Help button** (`frontend/components/ui/HelpPanel.tsx`): `position: fixed`, `bottom-6
  right-6`, one instance per gated page (not per sub-view). Opens upward-left on click only,
  sized against actual available space before paint. The balloon's `×` closes it for that
  session; "Don't show this again" persists a per-`pageKey` `localStorage` flag that only clears
  the button's unread dot — never hide the button itself.
- No emojis in the UI — use Tabler Icons (webfont). Never place a Tabler `<i>` icon inside/
  overlapping live input text (the glyph loads async and can flash a fallback box over the text).
- **Size/padding utilities**: never pass two conflicting size utilities (e.g. a component's base
  `py-2.5` plus a `className` override `py-4`) — the Tailwind CDN's in-browser JIT does not
  reliably respect declaration order. Use `Button.tsx`'s `size` prop (`xs`/`sm`/`md`/`lg`) and
  `Select.tsx`'s `size` prop (`sm`/`md`) instead of overriding padding via `className`; add a new
  size entry there if a new padding value is needed. `Button.tsx` variants: `blue`/`amber` for
  primary actions, `dark` (soft, not solid) for serious-but-not-alarming actions like final lock,
  `dangerSoft` (soft red) for frequent destructive actions (Clear/Clear All), `danger` (solid
  red) reserved for genuine errors. All buttons are `rounded-md` except the DEO nav bar's "Clear
  All", which is hand-styled `rounded-full` to match the FY pills it sits beside.
- **Tables holding money values must stay auto-layout** (never `table-fixed`) — a Gross Arrears
  value can be crore-scale (`₹10,00,00,000.00`); a fixed column can't grow to fit it. Pair with
  `whitespace-nowrap` on money cells and `overflow-x-auto` on the wrapper as the narrow-viewport
  fallback.
- **Sticky/pinned table rows and columns need an opaque background** (`bg-white`, alternating
  stripe `bg-slate-50`, not `/50` alpha) on every `tbody tr` — a `sticky left-0` pinned cell using
  `bg-inherit` needs an opaque ancestor to resolve to, or scrolled content bleeds through it.
- `disabled:cursor-not-allowed` does not work on `<button>` under this Tailwind version (preflight
  sets `button { cursor: pointer }` unconditionally). Set `style={{ cursor: "not-allowed" }}`
  directly from the disabled condition instead; `disabled:opacity-*` still works normally.
- **Tailwind loads via CDN script** (`@tailwindcss/browser@4`), not a build step — it must stay a
  plain blocking `<script src=...>` tag in `frontend/app/layout.tsx`, not `next/script` (whose
  `beforeInteractive` strategy injects via a JS hook rather than blocking HTML parsing, letting
  the static export paint unstyled first).
- Money inputs use Cleave.js with `numeralThousandsGroupStyle: "lakh"` and a `₹` prefix — use
  this, don't hand-roll Indian-numeral formatting.
- `YearStepForm.tsx`'s field grid hardcodes the six PAC fields into four rows (gross arrears
  full-width; RC count+amount two-up; recovered amount full-width; stay count+amount two-up),
  matching the government form's "(i)/(ii)" pairing, rather than looping `PAC_FIELD_ORDER`. The
  two-up pairing applies from `sm` up only. If the six-field schema changes, update this layout
  by hand along with every other place `PAC_FIELD_ORDER` is duplicated.
- Excel export uses **ExcelJS** (`window.ExcelJS`), not SheetJS — the only library in this stack
  confirmed to emit real `<pane>` frozen-pane XML. It has no browser `writeFile()`; every export
  funnels through `downloadWorkbook()` in `export.ts` (`wb.xlsx.writeBuffer()` + Blob/anchor
  download), so export functions are `async`.
- Magic-link emails use a styled table-based HTML template (`api/lib/email.ts`,
  `magicLinkHtml()`) with inline styles only — email clients don't reliably support external
  stylesheets or `<style>` blocks.

## CI/CD

`.github/workflows/ci.yml` and `deploy.yml` are the only things that deploy this project (see
DEPLOY.md). **Never connect a Cloudflare Pages Git integration for this repo** — Cloudflare's own
auto-build uses the wrong adapter for this app's static-export setup and will race manual/Action
deploys. If the Cloudflare dashboard nudges you to "connect to Git," decline.

## Admin pages: Dashboard / Districts / district detail / Audit Log

See [README.md](./README.md)'s App flow → Admin for a one-line summary of each page. Four
separate routes, not an in-page toggle:

- **`/admin`** (`AdminDashboard.tsx`) — colorful clickable KPI cards (Districts/Locked/Unlocked/
  Gross Arrears/Net Recoverable, each its own accent color), a top-5-districts Chart.js bar
  chart, and a Chart.js lock-status donut, stacked as two full-width rows. **Locked is green,
  Unlocked is red** (`LOCKED_COLOR`/`UNLOCKED_COLOR` in `AdminDashboard.tsx`) — inverted from the
  usual convention, because the portal's goal is 100% locked, so unlocked is what needs
  attention. Chart.js loads from a CDN `<script lazyOnload>`; both chart components poll for
  `window.Chart` every 150ms until ready. Use `plainLabel()` (numbering stripped) for this page's
  "All fields" list; use `englishLabel()` (numbering kept, Hindi stripped) for table headers and
  the Excel export. **Every number on this page sums all 5 financial years — there is no
  year selector.** A district's lock is one atomic action across all 5 years, so a per-year lock
  filter has nothing to filter. Net Recoverable is the one exception: it carries each district's
  FY 2025-26 `net_recoverable` straight through, per the Data model section above.
  `/admin/districts`'s own FY selector is unrelated and correctly kept — viewing one year's
  figures per district there is a legitimate, different use case.
- **`/admin/districts`** — sortable/searchable/pinned-column table (`getPaginationRowModel`,
  25/50/75/100 rows/page), a Locked/Unlocked/All status filter, Lock/Unlock, Download DEO
  Template, Upload DEO Data, and two export buttons. Column headers use `englishLabel()` only, no
  bilingual tooltip. Container padding shrinks progressively at wider breakpoints
  (`lg:px-[10%] xl:px-[5%] 2xl:px-[3%]`). The table's scroll container is capped at
  `max-h-[70vh]` at every breakpoint (not `flex-1`/`lg:max-h-none`) — an uncapped container has
  no scrolling ancestor for its `sticky top-0` header to freeze within. Row click navigates to
  the district's detail page; Unlock's button calls `e.stopPropagation()` to not also trigger
  that navigation, and prompts for a reason first (`promptUnlockReason()`) before calling the
  unlock endpoint. All `<select>`s across admin pages go through `components/ui/Select.tsx`
  (never a bare `<select>`) for consistent sizing/chevron; it carries a `min-w-[8rem]` floor,
  overridable via `className` for options with longer text. **Export as Excel Workbook** and
  **Export as SQL** both re-sync first (via `sync()`'s return value, not the pre-sync closure),
  then build the file, showing a disabled `animate-pulse` "Exporting..." state on their own
  button while running. **Export as SQL** (`exportDistrictsToSql()`) writes a plain `.sql`
  `DELETE`+`INSERT` file for `districts`+`pac_data` only (the two tables cached client-side) via
  a native `Blob`/anchor download.
- **`/admin/districts/detail`** — one district's PAC figures across all 5 years as a field × year
  table, with its own value/field search box, lock-status badge, who locked it/when, and (if
  unlocked) who last unlocked it/when/why. `max-w-7xl`, table has no `w-full` (auto-layout, see
  Visual language above). The table's scroll wrapper is `max-h-[70vh] overflow-auto` (both axes)
  with `sticky top-0` header cells. Unlock is a small hand-styled pill matching the badges beside
  it, not a full `Button.tsx` instance.
- **`/admin/audit`** — paginated (100/page), newest-first, auto-pruned to 30 days on read. A
  "Filter by event" `<select>` and a separate sort button (`ti-sort-descending`/`ti-sort-
  ascending`) both apply only to the currently-loaded page in memory — no extra request. Uses the
  same `useAdminData()` hook as the other three pages (Sync, district search, "Synced:"
  timestamp), even though it has no districts/pacData of its own to render.

**Which district/status to show travels via `sessionStorage`** (`frontend/lib/adminNav.ts`),
never a `?id=`/`?status=` URL query string — this app is a static export
(`next.config.ts`: `output: "export"`) with no server to resolve dynamic paths at request time.
`setNavDistrictId()`/`getNavDistrictId()` are not consume-on-read (a detail-page reload should
keep showing the same district). `setNavStatusFilter()`/`consumeNavStatusFilter()` are
consume-on-read — landing on `/admin/districts` via the regular nav link should default to "all".

All four pages share `frontend/lib/useAdminData.ts` (session guard, Dexie cache, `sync()`,
`unlock()`). `AppHeader` takes `navLinks`, `onSync`/`syncing`, `lastSyncedAt` (persisted to
`localStorage` as `excise-portal:admin-last-sync`), and an optional `districts` prop that renders
a global "jump to a district" search. Logout lives inside `ProfileMenu`'s dropdown, not as a
top-level header button, for both Admin and DEO headers.

Admin pages favor a compact toolbar (`Button size="sm"`, no large page-title heading) —
deliberately different from the DEO side, which stays verbose/hand-holding on purpose.

### Excel export

`exportDistrictsToXlsx()` (`frontend/lib/export.ts`, ExcelJS) is one workbook, **eight** sheets: a
**Summary** cover sheet, one sheet per financial year (districts × the 6 PAC fields plus
Opening Balance/Net Recoverable, read straight off the synced `pac_data` row), and a trailing
**RC Details** sheet. FY sheets are named `FY 2021-22`, etc. Each FY sheet carries two merged
banner rows (`SITE_TITLE_EN`, that sheet's own `dataPeriodForFY(fy)`) above the header row —
`TITLE_ROWS` in `export.ts` is the single source of truth for how many rows that offsets the
header/data/freeze-pane/print-titles math; update it, not individual call sites, if another
banner row is added. Every column header is English-only (`englishLabel()`).

**RC Details** is one flat sheet across every district/FY (not per-FY, unlike the 5 sheets
above) — District, Financial Year, RC Number, RC Amount, Stayed (Yes/No), one row per RC, parsed
from each `pac_data` row's `rc_details` JSON string. Flat rather than split per-FY because a
district's RC count varies per FY, so a flat table sorts/filters more usefully than five sparse
per-FY sheets would. Same `TITLE_ROWS`/frozen-header/print-titles treatment as the FY sheets.

The Summary sheet is added first (`SITE_TITLE_EN`, portal-wide `DATA_PERIOD_EN`, a `Generated:
<formatIST(...)> IST` line, and a Metric/Value table: district counts, Gross Arrears/Recovered
Amount summed across all districts and years, Net Recoverable summed across districts' FY
2025-26 values only, labeled "(as of 31 March 2026)").

Every sheet shares one `PAGE_SETUP` object: **A4 landscape**, `fitToPage: true` with
`fitToWidth: 1, fitToHeight: 0` (fit all columns to one page width, rows spill across as many
pages as needed). Spread `PAGE_SETUP` into any new sheet's `pageSetup` option. Each FY sheet uses
`views: [{ state: "frozen", ySplit: TITLE_ROWS + 1 }]` and `printTitlesRow` for real frozen panes
and repeated print headers. Use ExcelJS's `argb` (8-digit, alpha first) for colors, not SheetJS's
6-digit `rgb`. Cell-style helpers (`styleTitleCell`, `styleSubtitleCell`, `styleHeaderCell`,
`styleTotalCell`) apply to `Cell` objects, not raw style props on plain data.

## Bulk DEO provisioning

See [README.md](./README.md)'s App flow → Bulk DEO provisioning for the overview. Implementation
rules:

- **Download DEO Template** (`downloadDeoTemplate()`) builds an `.xlsx` with column A pre-filled
  with all 75 district names, columns B/C blank for CUG mobile and email.
- **Upload DEO Data** reads the file back with `parseDeoTemplateFile()` — positional column
  A/B/C parsing, not header-name matching, so a re-worded header row still parses.
- `POST /api/admin/provision-deos` hashes the incoming plaintext CUG number on ingest
  (`api/lib/hash.ts`'s `sha256Hex`) and upserts by matching `district_name` — an existing DEO
  user for that district gets updated, never duplicated. Blank rows are silently skipped.

## Known gaps / intentionally out of scope

- No password/OTP fallback if Resend or a DEO's CUG number changes — re-seed manually.
- The seeded demo DEO account is a manual `wrangler d1 execute --remote` insert; it does not
  exist in remote D1 just because it's documented. If demo login fails with "Invalid user," check
  the `users` table remotely before assuming a regression.
- No real domain/DNS yet; collapsing `/frontend` + `/api` onto one zone (which would let auth
  switch back from a Bearer token to more-secure `HttpOnly` cookies — see CLAUDE.md's Auth
  section) is deferred until one exists.
- `mail.upexciseonline.co` (or the chosen domain) is not yet verified in Resend; `FROM_EMAIL`
  stays on the shared sandbox sender until it is.
