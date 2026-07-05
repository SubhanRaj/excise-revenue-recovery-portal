# CLAUDE.md — Excise Revenue Recovery Portal

Instructions and domain context for AI agents working in this repo. Read this before
touching `/frontend` or `/api`. Each subdirectory also has its own `CLAUDE.md`
(`@AGENTS.md`) with Next.js-version-specific breaking-change warnings — read those too,
this Next.js release is not the one in your training data.

## What this is

A government portal (Excise Dept., Uttar Pradesh) for District Excise Officers (DEOs) to
submit 5 years of PAC/RC recovery data, and for Admins to review/export/unlock it. One
submission per district is final: once a DEO locks their data, it cannot be re-edited
without an Admin unlock.

## Repo shape — read this before assuming anything is shared

`/frontend` and `/api` are **two independent Next.js apps with separate `package.json`,
`node_modules`, and deployments.** There is no shared package. Constants that exist in
both (financial years, PAC field order/labels) are deliberately duplicated —
`frontend/lib/pac-fields.ts` mirrors `api/db/schema.ts`. If you change field names, units,
or the parity/validation rules, change both sides and keep them in sync by hand.

They communicate only over HTTP, cross-origin, with credentials (cookies) included. See
"Auth" below for why the cookie is `SameSite=None` and why `api/middleware.ts` exists.

## Data model (`api/db/schema.ts`)

- `districts` — one row per district (75 total, seeded from `api/drizzle/seed.sql`).
  `lock_status` (0/1) gates whether a DEO can still submit. `unlocked_at`/`unlock_reason`/
  `unlocked_by` (migration `0003_overjoyed_malcolm_colcord.sql`) are stamped on every admin
  unlock (`POST /api/admin/unlock`, which now requires a non-blank reason) — the district-level
  mirror of the lock-side audit trail below, since unlocking is a whole-district action rather
  than tied to one financial year's row. Only ever holds the *most recent* unlock event, not a
  full history — for that, see `audit_log` below.
- `users` — both DEOs and Admins. DEOs authenticate via `cug_hash` (SHA-256 of a 10-digit
  CUG mobile number — the server never sees the raw number). Admins authenticate via
  magic link (`email`). `locked_at` / `submitted_by_name` are stamped when a DEO locks.
- `pac_data` — exactly one row per `(district_id, financial_year)`, enforced by a unique
  index. `POST /api/pac-data/submit` deletes any existing rows for the district before
  inserting the new 5, all inside the same atomic `db.batch()` — needed because an Admin
  unlock never clears `pac_data` (see below), so a DEO who submits, gets unlocked, edits, and
  submits again is inserting into a district that already has rows for every financial year;
  without the delete, that second submit would fail the unique index instead of replacing the
  row. `GET /api/pac-data/mine` (role `deo`) is the read-side counterpart, letting the DEO
  frontend re-fetch its own district's rows after a login that follows an Admin unlock — see
  "Frontend offline flow" below. Six fields per year, in this fixed order (matches the Hindi
  form the DEOs see):

  | Field              | Hindi label                                      | Type    |
  | ------------------ | ------------------------------------------------- | ------- |
  | `grossArrears`      | 1. सकल बकाया धनराशि                                 | money   |
  | `rcCount`            | 2. (i) प्रेषित आर.सी. (R.C.) की संख्या                | integer |
  | `rcAmount`           | 2. (ii) आर.सी. में निहित धनराशि                       | money   |
  | `recoveredAmount`    | 3. वसूल की गयी धनराशि                               | money   |
  | `stayCount`          | 4. (i) स्थगन आदेशों की संख्या                        | integer |
  | `stayAmount`         | 4. (ii) सक्षम न्यायालय द्वारा स्थगित धनराशि            | money   |

  `financial_year` is one of `"2021-22" .. "2025-26"` (`FINANCIAL_YEARS` in both apps).

- **Net Recoverable is never persisted.** It's `max(0, grossArrears - recoveredAmount -
  stayAmount)`, computed client-side for display only (`netRecoverable()` in
  `frontend/lib/pac-fields.ts`).
- `pac_data.submitted_by_name` duplicates `users.submitted_by_name` onto each revenue row
  itself (migration `0001_nostalgic_stature.sql`) — same value, written at the same time in
  the same submit-route batch, just keyed by `district_id` like the rest of `pac_data` so
  Admin can see who submitted a given year's numbers without joining `users`.
- `pac_data.locked_at` (migration `0002_jittery_viper.sql`) duplicates `users.locked_at` the
  same way, for the same reason — the Admin district detail page shows "locked by X on Y"
  without a join. Stored as a UTC ISO string (`new Date().toISOString()`, same as
  `users.locked_at`) — **never** convert to IST before writing. `frontend/lib/format.ts`'s
  `formatIST()` is the one and only place that converts, at display time, via
  `toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })`. Modeled on the sibling
  `excise-bakaya-record` project's `admin.html`, which does the same conversion for its own
  `locked_at` — but that project writes the timestamp via raw SQL `CURRENT_TIMESTAMP`, which
  SQLite stores as `"YYYY-MM-DD HH:MM:SS"` with **no timezone marker at all** (not even a `Z`),
  so before it can be parsed correctly as the UTC value it actually is, that project has to
  manually rewrite it (`row.locked_at.replace(' ', 'T') + 'Z'`) into real ISO 8601 first —
  skip that string surgery entirely by never writing `locked_at` via SQL `CURRENT_TIMESTAMP`;
  always write it from JS as `new Date().toISOString()` (already includes the `Z`), same as
  every other timestamp in this codebase. Plain `toLocaleString("en-IN")` alone only sets
  locale conventions (comma grouping etc.), not the timezone — omitting `timeZone` renders in
  whatever zone the browser happens to be in, not IST, which is why `formatIST()` always
  passes it explicitly.
- `audit_log` (migration `0004_white_songbird.sql`) — one row per login/logout, district
  lock/unlock, or DEO-provisioning batch (`event_type`, `actor_role`, `actor_email`,
  `district_name`, `metadata` as a JSON string, `created_at`). Written via
  `api/lib/audit.ts`'s `auditLogInsert()`, which returns an insert statement rather than
  awaiting it itself, so callers that already have a `db.batch()` (lock, unlock) can fold the
  audit row into the same atomic write instead of a separate round trip. `created_at` is always
  `new Date().toISOString()` from JS, **never** a SQL `CURRENT_TIMESTAMP` default — this table's
  timestamps are shown directly to admins (`/admin/audit`), so it can't afford the
  timezone-less-string bug described above for `locked_at`. Rows older than 30 days are pruned
  opportunistically inside `GET /api/admin/audit-log` (the only reader of this table) rather
  than via a separate Cloudflare Cron Trigger — simplest option for a table with exactly one
  consumer. Modeled on the sibling `up-excise-spatial-revenue-optimizer` project's `audit_log`
  table and `/admin/audit` page.

## Validation rules — enforce on both client and server, always

1. **Anti-Blank Rule**: an empty field is never silently coerced to `0`. The API
   (`api/app/api/pac-data/submit/route.ts`) rejects non-numeric/missing values outright;
   the frontend tracks field values as raw strings in Dexie specifically so `""` (never
   typed) stays distinguishable from `"0"` (explicit zero) until submit time.
2. **Parity check**: `recoveredAmount` must exactly equal `rcAmount`. Enforced client-side
   (disables the "next" button) and re-checked server-side (never trust the client).
3. **Zero-trust on submit**: the submit endpoint re-validates every field itself — it does
   not assume the frontend's validation ran. If you add a new client-side rule, mirror it
   in `validateRow()` in the submit route.

## Auth (`api/lib/session.ts`, `api/lib/auth-guard.ts`, `api/middleware.ts`)

7-day HttpOnly JWT cookies (`jose`), issued by either flow — **two separate cookies,
`__admin_session` and `__deo_session`, not one shared `__session`.** Every route that needs a
session says which one via `requireSession(req, "admin" | "deo")`
(`api/lib/auth-guard.ts`), and the frontend passes the matching `?role=admin`/`?role=deo` on
`GET /api/auth/me` and `POST /api/auth/logout`. This used to be a single cookie, which meant a
CUG (DEO) login and a magic-link (Admin) login in the same browser clobbered each other —
logging into the demo DEO account to test the entry flow would silently kill the admin
session, forcing a fresh magic-link email (and burning Resend's daily send quota) just to get
back into `/admin`. Splitting by cookie name means the two logins coexist: an Admin can keep
their magic-link session alive in one tab while testing `/deo-data-entry` with the demo
CUG number in another (or the same tab, since both cookies persist regardless of which URL is
open) without either login evicting the other. Signing/verifying still runs through the same
`signSession`/`verifySession`; only the cookie name and the guard's expected role changed.

- **CUG flow**: `POST /api/auth/verify-cug` — frontend hashes the mobile number with
  Web Crypto (`frontend/lib/crypto.ts`) before sending; server matches against
  `users.cug_hash`. Real Excise Dept. CUG numbers all start with `94544`; the frontend
  (`app/login/page.tsx`) gates on this prefix *before* hashing/sending, and the error is
  the same generic "Invalid user" a real auth failure would show — the prefix rule itself
  is never named in the message, so a wrong-prefix guess isn't distinguishable from an
  unregistered number. The one seeded demo/test account is exempt from the prefix gate;
  it's matched by comparing the computed hash against a precomputed constant
  (`DEMO_CUG_HASH`) rather than checking the raw digits, so the actual demo number never
  appears in shipped source. The number itself lives only in the `DEMO_CUG` Cloudflare
  Worker secret (`wrangler secret put`, not retrievable after set) — don't add it back to
  any doc or source file.
- **Magic link flow**: `POST /api/auth/request-magic-link` issues a 15-minute token,
  emailed via Resend (`api/lib/email.ts` for the HTML); `frontend/app/verify/page.tsx`
  requires an explicit button click (POST, not GET) so email-client link-prefetchers can't
  burn the token. Sender is `FROM_EMAIL` (env var, defaults to Resend's shared sandbox
  `onboarding@resend.dev`) since `mail.upexciseonline.co` isn't a verified Resend domain
  yet — the sandbox sender can only deliver to the Resend account owner's own address, so
  don't be surprised if a test to a different email silently doesn't arrive.
- `GET /api/auth/me?role=admin|deo` — the SPA has no server, so it can't read the HttpOnly
  cookie itself; every gated page calls this on load to learn `{role, districtId}`. Pages call
  it directly and treat a failure as "not logged in as that role" — they do **not**
  pre-check the cached hint in `frontend/lib/session.ts` (localStorage) before calling it. That
  hint is a single shared value across the whole browser, so it goes stale the instant the
  *other* role logs in on a different tab (or the same tab, later); short-circuiting on it
  before ever asking the server was the actual cause of being bounced to `/login` when
  switching between `/admin` and `/deo-data-entry` even with a perfectly valid cookie sitting
  right there — fixed by always asking the server first (`lib/useAdminData.ts`,
  `app/deo-data-entry/page.tsx`) and only using the localStorage hint for the root `/` page's
  first-paint redirect guess, never as a gate on a specific role's page. Also joins
  `districts`/`users` to return `email`/`districtName`, purely so the header's profile
  dropdown (`frontend/components/ui/ProfileMenu.tsx`) has something to show — it's not part of
  the trust boundary, just avoids a second round trip for display data the guard check was
  already making a DB call for.
- **Revocation**: submitting a DEO's final payload atomically locks the district *and*
  destroys that DEO's session cookie server-side (`destroySessionCookie("deo")`), since
  there's nothing left for that DEO to do — an Admin session in the same browser, if any, is
  untouched (separate cookie, see above). This only destroys the *cookie*, not the CUG login
  itself — nothing stops that DEO from logging back in later (e.g. days after locking, or after
  an Admin unlock). `GET /api/auth/me?role=deo` now also returns `lockStatus`/`lockedAt`/
  `submittedByName` (joined from `districts`/`users`) specifically so `deo-data-entry/page.tsx`
  can tell, on every fresh login, which of two states this is — see "Frontend offline flow"
  below for what each one renders. Don't cache this in `localStorage` the way `lib/session.ts`
  caches the role hint; it must be re-asked of the server every load since an Admin unlock can
  happen at any time and this value gates what the DEO can do next.

Because `/frontend` (Pages) and `/api` (Worker) are separate origins in production, the
cookie is `SameSite=None; Secure`, and `api/middleware.ts` adds matching CORS headers
(`Access-Control-Allow-Origin` echoed only when it equals `FRONTEND_URL`, plus
`Allow-Credentials: true` — never a wildcard origin with credentials). If you ever put
both apps behind one zone (e.g. `/api/*` routed to the Worker on the same domain), this
whole cross-origin dance becomes unnecessary — simplify it if that happens.

**Open risk, not yet hit:** `SameSite=None` cross-site cookies between two different public
suffix domains (`pages.dev`, `workers.dev`) are exactly what Safari's Intelligent Tracking
Prevention and Chrome's third-party-cookie deprecation target. `frontend/e2e/login.spec.ts`
verifies the full magic-link round trip in real Chrome and it currently works, but that's
not proof it works in Safari — if a user ever reports auth silently failing (verify
"succeeds" but every subsequent `/api/auth/me` call 401s) on Safari specifically, this is
the first thing to check, and the real fix is collapsing both apps onto one zone (see
above), not a cookie-flag workaround.

## Portal identity strings (`frontend/lib/site.ts`)

`SITE_TITLE_EN`/`SITE_TITLE_HI` ("Recovery Certificates (RCs) Issued for Recovery of Excise
Revenue Arrears" / its Hindi translation) and `DATA_PERIOD_EN`/`DATA_PERIOD_HI` ("Data Period:
1 April 2021 to 31 March 2026") live in this one file specifically so the four places that show
them can't drift out of sync: the browser tab's meta description (`app/layout.tsx`), the login
page's subtitle block, the DEO data-entry title bar (below, and see the FY nav-pill labeling
convention above), and the Excel export's per-sheet title/data-period banner rows
(`export.ts`). Deliberately **not** merged into `pac-fields.ts` — that file is the one
duplicated byte-for-byte against `api/db/schema.ts` (see top of this document), and this text
has no server-side equivalent to stay in sync with. `DATA_PERIOD_*` is written out by hand
rather than derived from `FINANCIAL_YEARS`' first/last entries — if the 5-year window in
`FINANCIAL_YEARS` ever shifts, update both `site.ts` strings by hand at the same time, same as
every other place that duplicates something derived from `FINANCIAL_YEARS`.

**`SITE_TITLE_HI` says "आबकारी" (Abkari/state excise), never "उत्पाद शुल्क" (Utpad Shulk).**
Utpad Shulk is the Central Excise duty term (GoI) — this portal is Uttar Pradesh *state* excise
revenue (Abkari/Aakari Bakaya), a different tax entirely, so using the central-government term
in the state portal's own Hindi title is a substantive terminology error, not just a stylistic
one. If you add more Hindi copy referring to this revenue/department, use आबकारी (as the
existing "आबकारी विभाग" department name and `PAC_FIELD_LABELS`' सकल बकाया धनराशि already do),
never उत्पाद शुल्क.

The login page's title/data-period block sits in its own `max-w-2xl` wrapper, sibling to (not
nested inside) the `max-w-sm` login-card wrapper — both are children of one `flex-col` centered
container. This is deliberate: `SITE_TITLE_EN` is long enough to wrap even on a real desktop
monitor if it's stuck inside the same narrow `max-w-sm` box the login form/tabs use, but the
login card itself is intentionally kept compact — so the title text gets its own wider budget
instead of forcing the whole card wider. `md:whitespace-nowrap` on the title/Hindi-title `<p>`s
keeps them on one line from that breakpoint up; below `md` they wrap normally to the mobile
viewport width like any other text. Don't merge these two wrappers back into one `max-w-sm` div.

The DEO title bar (`deo-data-entry/page.tsx`, a soft `bg-blue-50`/`border-blue-200` banner —
same light-toned pattern as other informational callouts, not an alarming solid fill) sits
below the sticky `AppHeader`/above the year nav pills, in the scrolling page body rather than
inside the sticky nav itself, so it scrolls away once a DEO is deep into a year's fields
instead of permanently eating sticky-bar height on every scroll position. It exists so a DEO
lands on this page already knowing what "PAC/RC data" concretely means before they see any
form fields — the six field labels alone (Gross Arrears, RC Amount, etc.) don't spell out that
this is specifically about Recovery Certificates for excise arrears recovery.

## Frontend offline flow (`frontend/lib/db.ts`, Dexie)

DEO data entry is 5 sequential year steps + a Master View, gated so year `N+1` unlocks
only once year `N` is marked `completed`. Every keystroke persists to Dexie
(`draftYears` table) — **no network call happens until final submit**, which sends all 5
years in one atomic payload (`db.batch()` on the API side: 5 inserts + lock flip + user
audit stamp, all-or-nothing).

**A returning DEO's login branches into one of three states**, decided in
`deo-data-entry/page.tsx`'s load effect off the *server's* current `lockStatus` (from `GET
/api/auth/me?role=deo`), never a cached/local value:
1. **Still locked** — nothing in the CUG flow stops a DEO from logging back in after locking
   (only the session *cookie* is destroyed at submit time, not the login itself), and the local
   Dexie draft is wiped on that same submit — so without this check, a returning locked DEO
   would just see a blank form and could be confused into thinking their submission vanished.
   Instead the page renders a dedicated read-only screen: "Data Already Locked", `formatIST()`
   of `lockedAt`, and a bilingual message to contact Admin/Excise HQ for any correction — no
   form, no Clear buttons. The card is `max-w-2xl` (not the tighter `max-w-sm`/`max-w-md` used
   elsewhere) specifically so the English/Hindi sentences wrap across one or two natural lines
   instead of a narrow column forcing them onto many short ones, and the Hindi paragraph is
   `text-sm` (matching the English body text size), not a smaller `text-xs` — this message is
   the DEO's only information on the page, so it shouldn't read as a secondary/fine-print note.
   The card has its own direct **Logout** button (`variant="dark"`, full-width) in addition to
   the profile menu's — since logging out is the *only* action left once a DEO is on this
   screen, that button skips `confirmLogout()`'s blocking "are you sure" SweetAlert2 entirely
   (`logoutLocked()` in `deo-data-entry/page.tsx`, not the shared `AppHeader.logout()`): a
   confirm dialog only earns its keep when there's a real alternative action being protected
   against, and here there isn't one.
2. **Unlocked, previously submitted** — an Admin unlock flips `lockStatus` back to 0 but never
   touches `pac_data` (see Data model above), so D1 still holds the real submitted figures.
   `GET /api/pac-data/mine` fetches them and they win over whatever's in the local Dexie draft
   per financial year (which may be blank/stale from the original submit's `db.draftYears.clear()`),
   are written back into Dexie via `bulkPut`, and every year is marked `completed` — landing the
   DEO on the Master View to review/edit already-real data instead of an empty Year 1.
3. **Unlocked, never submitted** — the original behavior: merge whatever's already in the local
   Dexie draft (or start every year blank).

**Clearing a draft is a client-only, pre-lock-only operation** — it never calls the API,
since there's nothing on the server yet to clear (that only exists after final submit, at
which point this whole page redirects away to `/login`). Two entry points, both behind a
blocking SweetAlert2 confirm (`confirmClearYear()`/`confirmClearAll()` in
`frontend/lib/alerts.ts`, same shape as `confirmFinalSubmit()`/`confirmLogout()`) so a stray
tap can't silently wipe entered data:
- **Per-year "Clear"** (`YearStepForm.tsx`, top-right of the year heading) resets just that
  step back to a blank `DraftYear` in both React state and Dexie via `clearYear()` in
  `deo-data-entry/page.tsx`. If the cleared year was already `completed`, every later year it
  had unlocked becomes locked again (the existing `years[i-1].completed` gate recomputes
  automatically), so `clearYear()` also drops `step` back to the cleared year if the DEO was
  currently viewing a later one.
- **"Clear All"** (sticky nav bar, next to Master View) calls `db.draftYears.clear()` and
  resets all 5 years to blank, back to the first financial year (FY 2021-22).

Both call sites bump a `clearVersion` counter that's folded into `YearStepForm`'s React `key`
(`` `${financialYear}-${clearVersion}` ``) to force a remount — the component's own
`followRc`/`parityTouched` state only initializes once per mount, so without the key change a
clear would reset the Dexie data but leave stale internal form state behind (e.g. Recovered
Amount no longer auto-filling from RC Amount even though both are freshly blank).

This is deliberately asymmetric with unlocking: an Admin unlock (`districts.lock_status` →
0, see Data model above) only lets the DEO edit again — it never clears any `pac_data` rows,
since the whole point of an unlock is usually to *correct* existing figures, not restart from
zero.

**The DEO's name is not a form field — it's collected in the lock confirmation itself.**
`MasterView.tsx` has no name input; it's just the table plus a big `size="lg"` "Submit &
Lock" button. Clicking it runs a two-step SweetAlert2 flow in `frontend/lib/alerts.ts`,
modeled on the sibling `excise-bakaya-record` project's single `Swal.fire({ input: "text",
inputValidator })` "Verify & Lock Record" prompt (same small-scale approach — a plain Swal
text input, not a custom form):
1. `confirmFinalSubmit()` — a plain yes/no: verify the data is correct, because locking is
   irreversible without contacting the Admin/Excise HQ.
2. `promptDeoNameAndLock()` — only if step 1 is confirmed. A second Swal with a text input
   for the officer's name, a liability disclaimer (wrong data is the submitting DEO's
   responsibility), and `inputValidator: validateDeoName()` which rejects: blank input,
   digits (guards against pasting a CUG number — this has actually happened), and the
   designation itself instead of a name (e.g. "DEO Shajapur" — also a real recurring
   mistake, caught via a whole-word regex for "deo"/"officer"/etc., not substring match, so
   it doesn't false-positive on real names). Returns `null` on cancel, name string on
   confirm — `deo-data-entry/page.tsx`'s `submitAll()` bails out on either step returning falsy.

Both dialogs are bilingual (English + Hindi). `app/layout.tsx` adds a small global
`.swal2-container { backdrop-filter: blur(3px) }` rule so every SweetAlert2 modal in the app
(not just this one) blurs the page behind it rather than just dimming it.

The Admin dashboard caches all districts + PAC rows in Dexie (`adminDistricts`,
`adminPacData`) for instant load, with an explicit "Sync" button to refetch from D1.

The pills read **"FY 2021-22"** etc, not "Year 1"/"Year 2" — a DEO shouldn't have to count
pills to know which financial year they're editing. This is the one convention that must be
kept consistent everywhere a year appears in the UI or an export: the DEO nav pills and
`YearStepForm.tsx`'s per-step heading, the Admin dashboard's/districts table's/district
detail's year `<select>`/column headers (`FY {fy}`, not bare `{fy}`), `MasterView.tsx`'s
summary table header row, and the Excel export's sheet names (`export.ts`:
`` `FY ${fy}`.replace(/\//g, "-") ``). If you add a new place a `FinancialYear` value is
rendered, prefix it with `FY ` the same way — don't introduce a bare `{fy}` or an ordinal
"Year N" label again.

FY 1–5 / Master View nav pills in `deo-data-entry/page.tsx` are `sticky top-16` (just below the
also-`sticky` `AppHeader`) so they stay reachable while scrolling down a long year form,
matching the `AdminDashboard`'s always-visible toolbar. The nav is `flex-col` below `sm` (Master
View drops to its own full-width row under the 5 year pills) and `sm:flex-row` above it (single
row, Master View right-aligned via `sm:ml-auto`) — they used to be split by a `flex-1` divider
`<span>` in one always-`flex-wrap` row, which forced an ugly full-width empty line whenever the
pills wrapped on a narrow/mobile viewport. The year pills themselves also shrink on mobile
(`px-2 py-1 text-xs`, each `flex-1` so all 5 share one row evenly) and return to their normal
size/padding at `sm`. Don't reintroduce a flex-growing spacer between the two groups. The
"Clear All"/Master View row (below the year pills on mobile) gets the same treatment — both
buttons carry `flex-1 sm:flex-none` so they split that row edge-to-edge on mobile instead of
sitting compact/left-aligned with dead space on the right, reverting to content-hugging width
at `sm` where Master View is pinned right via the parent's `sm:ml-auto` instead. The page
container also carries
`pb-24 sm:pb-8` (not equal top/bottom padding) so the fixed `HelpPanel` button doesn't sit on top
of the full-width Master View "Submit & Lock" button on mobile.
Export re-syncs first, then builds the `.xlsx` from the freshly-synced cache.

## Visual language: sober blue, not indigo/purple, and dark mode

- **Brand color is `blue` (Tailwind's default blue-600/700/800), not `indigo`.** The app
  originally used `indigo-*` throughout (buttons, header, tabs, focus rings, the magic-link
  email); it read as too purple/playful for a government portal and was rebranded to `blue`
  in one pass across every component, plus the magic-link email's inline hex colors
  (`api/lib/email.ts`: `#1d4ed8`/`#2563eb`, the hex equivalents of `blue-700`/`blue-600`).
  If you add new UI, use `blue-*` for primary/accent, never reach for `indigo-*` again —
  `frontend/e2e/login.spec.ts` asserts `text-blue-700` on the active login tab as a
  regression guard.
- **Dark mode** (`frontend/lib/theme.ts`, `components/ui/ThemeToggle.tsx`): persisted in
  `localStorage` (`excise-portal:theme`), defaults to the OS's `prefers-color-scheme` when
  nothing is stored yet. `app/layout.tsx` has a plain blocking inline `<script>` (same
  reasoning as the Tailwind CDN script — must run before first paint) that reads
  `localStorage` and adds the `.dark` class to `<html>` synchronously, so there's no
  flash-of-wrong-theme on reload. A `<style type="text/tailwindcss">` block sets
  `@custom-variant dark (&:where(.dark, .dark *));` so `dark:` utilities key off that class
  instead of Tailwind v4's default `prefers-color-scheme` media query — this is what lets the
  toggle override the OS setting rather than just mirroring it. **This `<style>` block must
  come *before* the `<script src=".../@tailwindcss/browser@4">` tag in `<head>`, not after** —
  the CDN script is a plain blocking `<script>` (see below), so it executes as soon as the
  parser reaches it; a config block written later in the source is simply not in the DOM yet
  when that happens, and the runtime falls back to the default media-query `dark:` variant.
  This was an actual bug (dark: utilities were only ever following the OS setting, not the
  manual toggle) fixed by moving the `@custom-variant` style above the CDN script tag. Don't
  reorder these two back. `ThemeToggle` lives in `AppHeader` (every gated admin/DEO page); it's
  **not** shown on `/login` or `/verify` — those pages have no explicit toggle, they just
  inherit whatever the blocking script already resolved (stored choice, else OS default),
  since a manual per-page toggle there isn't needed before the user is even signed in. When
  adding a new component, mirror the existing `dark:bg-slate-900` / `dark:text-slate-100` /
  `dark:border-slate-800` pattern already used throughout rather than inventing new dark-mode
  shades. `<head>` also declares `<meta name="color-scheme" content="light dark" />`, mainly to
  stop Chrome for Android's own "force dark" heuristic from also auto-darkening/inverting colors
  on top of our `.dark` class — real, but a secondary issue; see below for the actual cause of
  invisible dark-mode text.
- **`frontend/app/globals.css` must never set `color` on `body`, `button`, `input`, or
  `select`.** This file is a plain external stylesheet (a pre-Tailwind FOUC fallback, per its own
  comment) — it is **not** wrapped in a Tailwind `@layer`, and CSS Cascade Layers make any
  unlayered rule outrank *every* `@layer`-wrapped Tailwind utility for the same property on the
  same element, regardless of specificity or whether `.dark` is present. This file used to set
  `body { color: var(--foreground) }` plus `input, select, button { color: inherit }`, which
  permanently pinned every button/input/select's text to that one static, never-dark-aware value
  — it happened to equal Tailwind's own light-mode `text-slate-900`, so it went unnoticed for
  months, but in dark mode it silently defeated every `dark:text-*` class on every button/input
  app-wide (Login, the year-nav pills, Submit & Lock, Sync, Unlock, pagination, dropdown
  `<select>`s — all of it), rendering dark-on-dark, functionally invisible text. Confirmed with a
  headless Playwright render of the deployed site (`page.goto(..., { colorScheme: 'dark' })` +
  `getComputedStyle`) before and after removing those two `color` declarations. If you need a
  pre-Tailwind fallback color again, wrap it in `@layer base { ... }` instead of a bare rule —
  don't add a plain unlayered `color` rule back.

## UI conventions

- **Language**: UI chrome (buttons, nav, labels, error/success messages) is English only.
  The only Hindi in the app is the 6 PAC field labels (bilingual, `PAC_FIELD_LABELS` in
  `frontend/lib/pac-fields.ts`) and the department name in a couple of headers/the page
  title — because those mirror the actual government form and department name, not because
  "Hindi UI" is a general goal. Don't add Hindi to new chrome text.
- **Feedback is inline SPA state or a toast, never a page-bottom banner for validation.**
  Field-specific errors (the parity check knows exactly which two fields are wrong) render
  directly under the offending field, bold, bilingual, and only after the field is blurred —
  not on every keystroke — see `YearStepForm.tsx`'s Recovered Amount field. Generic errors
  that aren't tied to one specific field (e.g. "some field is blank" — could be any of six)
  use `notifyToast()` instead of a `Banner`, since there's no single field to anchor an inline
  message under — see `saveAndContinue()` in `deo-data-entry/page.tsx`. Page-level success/failure
  (sync failed, submit failed) still uses `components/ui/Banner.tsx`, modeled on the
  `sent`/`error` state pattern in the sibling `up-excise-spatial-revenue-optimizer` project's
  login form. `window.Swal` (SweetAlert2, CDN) is reserved for: blocking confirms before an
  irreversible or session-ending action (`confirmFinalSubmit()`, `confirmLogout()` in
  `frontend/lib/alerts.ts`) and toasts (`notifyToast()` — `toast: true, position: "top-end"`,
  modeled on the sibling `excise-bakaya-record` project's login/sync/unlock toasts) for
  login/logout and generic validation. Don't reach for a new blocking SweetAlert popup for
  routine errors/success — use `notifyToast()` or a `Banner` instead. `notifyToast()` sets
  `showCloseButton: true` (a manual ✕ next to the auto-dismiss timer, so a DEO doesn't have to
  wait it out) and a responsive `width` — `28rem` on desktop, `94vw` on mobile — since the
  default toast width was narrow enough that bilingual validation text (e.g. "Field left blank
  / फ़ील्ड खाली है") wrapped across several lines, costing more vertical space than a wider,
  shorter toast would. If you add a new toast call site, it inherits this from `notifyToast()`
  automatically — don't call `window.Swal.fire({ toast: true, ... })` directly.
- **"Welcome" toast fires once per sign-in, not per page load.** `frontend/lib/session.ts`'s
  `markJustAuthed()`/`consumeJustAuthed()` set/clear a `sessionStorage` flag right before the
  `/login` or `/verify` page redirects to `/deo-data-entry`/`/admin`; the destination page's existing
  `/api/auth/me` guard call checks and clears it. If you add another place that lands a user
  on those pages after auth, call `markJustAuthed()` there too or the toast won't show.
- **Help button** (`frontend/components/ui/HelpPanel.tsx`) is a `position: fixed` round
  button pinned bottom-right (`bottom-6 right-6`, stays put while the page scrolls) on every
  gated page — originally ported from the sibling `up-excise-spatial-revenue-optimizer`
  project's `HelpPanel` (which uses DaisyUI — this repo has no DaisyUI or shadcn, so it's
  restyled onto plain Tailwind/blue classes), then redesigned off that project's inline-button
  pattern into a floating one so it doesn't compete for space in a page header/nav. Colored
  light (`bg-blue-50`/`border-blue-200`) rather than solid, darkening on hover/active
  (`hover:bg-blue-100 active:bg-blue-200`) — deliberately not the same visual weight as a
  primary action button. It never opens on its own — only on click — and always opens
  upward-left of the button since it sits at the bottom of the viewport; its width/height are
  measured against actual available space (`useLayoutEffect` in `HelpPanel.tsx`) before paint,
  so it only scrolls internally if the display genuinely doesn't have room, not by default. Two
  independent dismiss actions: the balloon's `×` just closes it for that moment (button stays,
  reopenable anytime), while "Don't show this again" additionally persists a per-`pageKey`
  `localStorage` flag that only clears the small unread dot on the button — it never hides or
  disables the button itself. One `HelpPanel` is mounted once per page (`deo-data-entry/page.tsx`,
  `admin/page.tsx`), not per sub-view, since it's fixed positioning anyway. If you add a new
  gated page, add one there too rather than leaving help DEO/Admin-page-specific and
  inconsistent.
- No emojis anywhere in the UI — Tabler Icons (CDN webfont, `<link>` in `layout.tsx`)
  instead. Don't put a Tabler `<i>` icon directly inside/overlapping live input text —
  the glyph renders via a CSS `::before` that loads async, so it can flash a fallback tofu
  box on top of the text before the font loads (this happened once; `TextField` has no
  icon slot as a result, and the admin district search input had the same bug — fixed by
  dropping the icon rather than fighting the async font load). Icons on buttons/badges
  next to static short label text are fine.
- **Never pass two conflicting size utilities (e.g. `py-2.5` from a component's base classes
  and `py-4` via a `className` override) into the same class list** — the Tailwind CDN's
  in-browser JIT scans the whole document rather than respecting the order classes appear in
  one element's `className` string, so which of two same-property utilities wins is not
  reliably "the last one written." `components/ui/Button.tsx` has a `size?: "sm" | "md" | "lg"`
  prop specifically so padding/text-size never has two candidate utilities active at once —
  add a new size there instead of overriding padding/text size through `className`. It also
  has a `dark` variant (soft `bg-slate-100`/border, same light-toned pattern as `blue`/`amber`
  — not a solid near-black fill, which read as unreadable/alarming on the final lock button)
  for serious-but-not-alarming actions like the final lock — used instead of `danger` (red)
  because a red button reads as "something is wrong," not "this is a big deal, be sure."
  Icon + label are pinned onto one line via explicit
  `flex-row flex-nowrap whitespace-nowrap` (not left to `inline-flex`'s default) so they can
  never visually stack even on a very wide (`size="lg" className="w-full"`) button. It also has
  a `dangerSoft` variant (soft `bg-red-50`/border, same light-toned pattern as `blue`/`amber`/
  `dark` above) for *frequent* destructive actions the DEO reaches for often — the per-year
  "Clear" button (`YearStepForm.tsx`) and "Clear All" (`deo-data-entry/page.tsx`'s nav bar) — as
  opposed to `danger`'s solid red, which read as too heavy/thick sitting next to the slim pill
  nav buttons; the blocking confirm popup already carries the "are you sure" weight, so the
  button itself doesn't need to. For icons across all button sizes, we now use a global modifier
  on the button's base class (`[&_i.ti]:!text-[1.25em]`). This forces Tabler icons to always be
  exactly 25% larger than the button's text size, guaranteeing they are clearly distinguishable
  and never look cramped, without inflating the button's height.
- **Sleek, Uniform Styling**: All buttons in `Button.tsx` now uniformly use `rounded-md` with
  balanced padding (`px-3 py-1.5` for `xs` up to `px-6 py-3` for `lg`). The previous mix of
  pill shapes (`rounded-full`) and blocky rectangles made the UI feel inconsistent. The dropdowns
  (`<select>`) across the Admin Dashboard have also been updated from `rounded-full` pills to
  `rounded-md shadow-sm py-1.5` to perfectly match these sleek toolbar buttons. If you add a
  new utility button or dropdown, ensure it inherits this `rounded-md` look.
- **The icon-vs-label vertical misalignment (icon sitting low, extra blank space under the text,
  text nearly touching the button's top border) was a real, separate bug from the "thick"
  corner-radius one above — and the standalone-classes repro that cleared the flex layout
  didn't reproduce it**, because it didn't include this app's actual `frontend/app/globals.css`.
  That file has `input, select, button { font: inherit }` — deliberately unlayered (see the
  dark-mode section below for why an unlayered rule always beats a Tailwind `@layer` utility),
  originally added to stop buttons from using the browser's native UI font. `font: inherit`
  also inherits `line-height`, which pulls in Tailwind's preflight `line-height: 1.5` from
  `html`/`body`. Tabler's icon webfont CSS (`tabler-icons.min.css`) hardcodes `line-height: 1`
  on every `.ti` class. So inside one `inline-flex items-center` button, the icon `<i>` and the
  text sat in two differently-tall line boxes (1× vs 1.5× the font size) — `items-center`
  correctly centers each *as a flex item* within its own box, but the boxes themselves don't
  match, which is what actually produced the reported misalignment and the lopsided
  padding (all the slack lived under the text, since the button's own vertical padding is
  applied around that taller 1.5×-line-height box). Fixed with one added declaration —
  `line-height: 1` on the same `input, select, button` rule in `globals.css` — rather than
  touching every icon/button call site individually; verified by rendering the real app (a
  temporary `/debugbuttons` route mounting `Button.tsx` directly, deleted after) with Playwright
  before/after the change, not just a synthetic snippet. Since `select` is in the same rule,
  this fixed the same issue on every `<select>` dropdown too, for free. If a future report says
  "icon and text don't line up," reach for this file before touching flex classes — the flex
  layout itself has been correct throughout both rounds of this bug.
- **`disabled:cursor-not-allowed` doesn't work on `<button>` in this Tailwind version** —
  the CDN's preflight sets `button { cursor: pointer }` unconditionally, which beats the
  `disabled:` variant regardless of class order. If a disabled button needs to actually
  show a blocked cursor (e.g. `Button.tsx`, the DEO year-step nav pills), set
  `style={{ cursor: "not-allowed" }}` directly from the JS disabled condition instead of
  relying on the Tailwind utility — `disabled:opacity-*` still works fine, it's only
  `cursor` that's affected.
- **Tailwind is a CDN script (`@tailwindcss/browser@4`), not a build step** — see
  `frontend/app/layout.tsx`. It must be a plain `<script src=...>` tag, not `next/script`.
  `next/script`'s `beforeInteractive` strategy injects the tag via a JS runtime hook rather
  than blocking HTML parsing, so the static export's raw HTML can paint fully unstyled
  before it runs. A native blocking `<script>` in `<head>` is also literally what Tailwind's
  own CDN docs say to do (it installs a MutationObserver and expects to load before
  `<body>`). Don't "fix" a styling flash by switching this back to `next/script`.
- Money inputs use Cleave.js with `numeralThousandsGroupStyle: "lakh"` for native
  Indian-numeral (Lakh/Crore) grouping and a `₹` prefix — don't hand-roll this formatting.
- `YearStepForm.tsx`'s field grid hardcodes the six PAC fields into four rows (gross arrears
  full-width; RC count+amount paired two-up with a narrow count column; recovered amount
  full-width with the parity error inline beneath it; stay count+amount paired the same way
  as RC) rather than looping `PAC_FIELD_ORDER` — matches the "(i)/(ii)" pairing on the actual
  government form. The two-up pairing only applies from the `sm` breakpoint up
  (`grid-cols-1 sm:grid-cols-[16rem_1fr]`) — below that, each field gets its own row, since the
  count column has no room to breathe on a phone-width form. The count column was widened from
  an earlier `11rem` because the RC/Stay count field's bilingual label (e.g. "2. (i) प्रेषित
  आर.सी. (R.C.) की संख्या") wrapped onto multiple lines at that width, while the paired amount
  column had spare room to give up on desktop. If the six-field schema
  ever changes, update this layout by hand, same as every other place `PAC_FIELD_ORDER` is
  deliberately duplicated instead of derived. Recovered Amount auto-fills from RC Amount as the
  DEO types it, until they edit Recovered Amount directly — then it stops following (it's never
  locked/read-only, just pre-filled). The parity error message keeps English and Hindi on
  separate lines built from plain per-language field name constants
  (`RECOVERED_AMOUNT_EN`/`_HI`, `RC_AMOUNT_EN`/`_HI`) — don't go back to interpolating the
  combined bilingual `"English / हिन्दी"` label into one sentence, that mixes both languages
  mid-line instead of one clean line per language. The Previous Year / Save & Continue row is
  `flex-col-reverse` below `sm` (each button `w-full`) and `sm:flex-row` above it — `Button`'s
  base classes force `whitespace-nowrap`, so the longest label ("Save & View Summary") plus
  "Previous Year" side by side overflowed a phone-width container before this; `-reverse` keeps
  the primary action visually on top while `onBack`'s `<span />` placeholder only needs to exist
  at `sm`+ to hold the `justify-between` gap.
- **Tables must stay auto-layout (not `table-fixed`) wherever a cell can hold a large money
  value.** A district's Gross Arrears can be in the crores (`₹10,00,00,000.00` is a realistic
  value, not an edge case); a fixed-width column can't grow for it and the text
  overlaps/clips. `MasterView.tsx`'s summary table and the admin dashboard's table
  (`admin/districts/page.tsx`) both rely on natural auto-layout sizing plus `whitespace-nowrap` on money
  cells so columns widen to fit, with `overflow-x-auto` on the wrapper as the fallback once
  that exceeds a narrow viewport — don't switch either back to `table-fixed`.
- **Sticky/pinned table rows and columns need an *opaque* background, not `bg-inherit` off a
  transparent or alpha (`/50`) parent.** Both tables' body rows previously had no explicit
  background (or a semi-transparent stripe), so their `sticky left-0` first column — which
  uses `bg-inherit` to match whatever row it's in — inherited transparency too, letting
  content scrolled underneath show/bleed through the frozen header row and frozen first
  column. Fixed by giving every `tbody tr` a solid background (`bg-white`, with a solid
  `bg-slate-50` — not `bg-slate-50/50` — for the alternating stripe); `bg-inherit` on the
  pinned cell then correctly resolves to something opaque. If you add another sticky
  header/column, give its scrolling ancestor rows an opaque background from the start.
- SheetJS exports use the free/Community CDN build, which **cannot write frozen panes**
  (that's a SheetJS Pro feature) — see the `ponytail:` comment in `frontend/lib/export.ts`
  if you're asked to make the exported header row actually freeze.
- Magic-link emails use a styled table-based HTML template (`api/lib/email.ts`,
  `magicLinkHtml()`) — indigo header band, CTA button, plain-link fallback, footer — not a
  couple of bare `<p>` tags. Modeled on the sibling `up-excise-spatial-revenue-optimizer`
  project's `sendMagicLinkEmail`. Keep it a single self-contained inline-styled string;
  email clients don't reliably support external stylesheets or `<style>` blocks.

## CI/CD

`.github/workflows/ci.yml` and `deploy.yml` are the only things that deploy this project —
see DEPLOY.md. **Do not connect a Cloudflare Pages Git integration for this repo.** One was
briefly (accidentally, from an earlier session) configured with a wrong build command
(`@cloudflare/next-on-pages`, not this app's actual static-export build) and no
`nodejs_compat` flag; it silently auto-built on every push and raced/overwrote real
deploys, causing a real production incident — see TESTING.md's Incidents section. It's been
disconnected. If a Cloudflare dashboard nudges you to "connect to Git" for this Pages
project, don't.

## Admin pages: Dashboard / Districts / district detail / Audit Log

Admin is **four separate routes**, not one page with an in-page toggle — split apart because
the single-page toolbar (Sync, DEO Template, Upload, Export, year select, all in one row) got
visually cramped as features were added:

- **`/admin`** (`components/AdminDashboard.tsx`) — colorful, clickable KPI cards (Districts/
  Locked/Unlocked/Gross Arrears/Net Recoverable — each its own accent color: blue/red/emerald/
  amber/violet, via `KpiCard`'s `color` prop, not five identical white cards), a top-5-districts
  bar list, and a lock-status card. Every card links somewhere useful: Districts/Gross
  Arrears/Net Recoverable go to `/admin/districts`; Locked/Unlocked go there too but pre-filter
  by status (see sessionStorage nav below); each top-5 list row links straight to that
  district's detail page. Most of the lock-status card is still plain CSS divs/percentages
  (ladder rung 4/5 — no dependency for a bar list), but the locked-vs-unlocked ratio also gets
  an actual **Chart.js donut** (`LockStatusDonut` inside `AdminDashboard.tsx`) loaded from a CDN
  `<script lazyOnload>` in `layout.tsx` — the one chart the user actually asked to see, added
  alongside the existing bars rather than replacing them. Chart.js is a `devDependency` purely
  for its TS types (`window.Chart` in `lib/globals.d.ts`), same pattern as `xlsx`/`sweetalert2`
  — the real runtime script is CDN-only. Since the script loads lazily, `LockStatusDonut` polls
  for `window.Chart` every 150ms until it appears rather than assuming it's ready on mount.
  **Every number on this page is a total across all 5 financial years, never one FY at a
  time** — `admin/page.tsx` used to have its own FY `<select>` that filtered every stat down to
  one year, which was actively wrong for lock status: a district's PAC submission and lock are
  one atomic action covering all 5 years at once (see the submit route in Data model above), so
  "locked for FY 2023-24 but not FY 2024-25" can't happen — a per-year lock-status filter had
  nothing real to filter. `admin/page.tsx`'s `rows` now sums each PAC field across
  `FINANCIAL_YEARS` per district before handing rows to `AdminDashboard`, so Gross Arrears/Net
  Recoverable/the top-5 list reflect the district's cumulative position as of 31 March 2026 (the
  end of FY 2025-26), not a single year snapshot. `AdminDashboard`'s `PERIOD_LABEL` constant
  (`` `FY ${FINANCIAL_YEARS[0]} – ${FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1]}` ``) is what
  the "Total (...)" headings reference — don't reintroduce a year selector on this page.
  `/admin/districts`' own FY `<select>` is unrelated and correctly kept: viewing one year's
  figures per district in that table is a legitimate, different use case from this overview.
- **`/admin/districts`** — the sortable/searchable/pinned-column table with pagination
  (`getPaginationRowModel`, Rows-per-page 25/50/75/100, Prev/Next), a Locked/Unlocked/All
  status filter, plus Lock/Unlock, Download DEO Template (`variant="blue"`), Upload DEO Data
  (`variant="amber"`), and two export buttons ("Export as Excel Workbook" and "Export as SQL",
  see below) — all the *actions* live here now, not on the Dashboard. Numeric column headers
  show the short English label only, with the full bilingual label as a `title` tooltip
  (`header: () => <span title={...}>`) — using the full bilingual string as the header text was
  forcing every column to auto-size to its longest label rather than its much-shorter numeric
  values, which is what was bloating the table width. Container padding shrinks progressively at
  wider breakpoints (`lg:px-[10%] xl:px-[5%] 2xl:px-[3%]`, not a flat `lg:px-[15%]`) instead of a
  fixed `max-w-*`, so a 22"/24" FHD admin monitor gets meaningfully more usable table width rather
  than a large fixed side margin forcing horizontal scroll. The table's scroll container is
  `flex-1` inside a `flex-col` page body (not a fixed `max-h-[65vh]`), so it grows to fill
  whatever vertical space is left in the viewport instead of leaving dead blank space below it on
  a tall display — if you add another fixed-height table wrapper, prefer this pattern
  (`flex-1 min-h-[Xvh]` fallback) over a hardcoded viewport-height fraction. Clicking anywhere on
  a district row navigates to that district's detail page; the Unlock button inside the row calls
  `e.stopPropagation()` so it doesn't also trigger that navigation (pattern borrowed from the
  sibling `up-excise-spatial-revenue-optimizer` project's districts table, which does the same for
  its own row-click-to-detail behavior). Unlock asks for a reason first (`promptUnlockReason()` in
  `lib/alerts.ts`, a blocking SweetAlert2 textarea prompt) — see Data model below for where
  that's stored. The Locked/Unlocked status badge in this table's Status column must carry the
  same `dark:bg-red-950 dark:text-red-300` / `dark:bg-emerald-950 dark:text-emerald-300` pair as
  the identical badge on `/admin/districts/detail` — it was missed once during the dark-mode
  rebrand (the `bg-red-100`/`bg-emerald-100` light-mode classes don't change with the theme on
  their own, so the badge just looked like a mismatched light patch sitting in an otherwise-dark
  table, not literally invisible, but still wrong). If you add another status badge, copy the
  color pair from one of these two rather than inventing a new light-only one. Every `<select>` on
  this page (status filter, FY filter, rows-per-page) and the pagination Prev/Next icon buttons
  are `rounded-full` with the same border/hover treatment as `Button.tsx`'s `xs`/`sm` variants —
  they used to be `rounded-md`, which looked like a mismatched square sitting next to the pill-
  shaped toolbar buttons beside them. Keep new small controls on this page pill-shaped to match.
  **Export as Excel Workbook** and **Export as SQL** both re-sync first (so the export reflects
  the live server state, not a possibly-stale cache), then build their respective file; both show
  a disabled, `animate-pulse` "Exporting..." state on their own button while running (mirroring
  the existing "Uploading..." pattern on Upload DEO Data) instead of leaving the click with no
  visible feedback while the sync + file-build blocks the thread. `sync()`
  (`frontend/lib/useAdminData.ts`) now *returns* the freshly-fetched `{ districts, pacData }`
  rather than only setting state, and both export functions use that return value (falling back to
  the pre-sync closure only if `sync()` failed) — using the hook's `districts`/`pacData` directly
  right after `await sync()` would still read the pre-sync render's stale closure, since a
  `setState` call doesn't retroactively update a value already captured earlier in the same
  function. **Export as SQL** (`exportDistrictsToSql()` in `frontend/lib/export.ts`) writes a
  plain `.sql` file (`DELETE` + `INSERT` statements, column names matching `api/db/schema.ts`
  exactly) via a native `Blob`/anchor download — no new dependency, unlike the `.xlsx` export
  which genuinely needs SheetJS. It intentionally covers only `districts` and `pac_data` — the two
  tables the admin panel actually caches client-side (see `frontend/lib/db.ts`) — not `users`,
  `audit_log`, or `magic_link_tokens`, which never leave the API; it's a revenue-data backup aid,
  not a full database dump.
- **`/admin/districts/detail`** — one district's PAC figures across all 5 years as a small
  field × year table (with its own value/field search box, separate from the Districts table's
  by-name one), a lock-status badge, who locked it and when (`formatIST(lockedAt)`), and — if
  it's currently unlocked — who last unlocked it, when, and why.
- **`/admin/audit`** — a paginated (100/page), newest-first table of every login/logout,
  district lock/unlock, and DEO provisioning batch, auto-pruned to the last 30 days on read
  (see Data model below). Modeled on the sibling `up-excise-spatial-revenue-optimizer`
  project's `/admin/audit` page and its `audit_log` table. A **"Filter by event"** `<select>`
  (same rounded-full pill styling as the Districts table's status/FY filters) narrows the
  visible rows to one event type, and a separate **sort button** (`ti-sort-descending`/
  `ti-sort-ascending`, toggling "Newest first"/"Oldest first") flips the row order — both apply
  only to the *currently-loaded page's* rows in memory, no extra request, since the log is
  already newest-first from the server and server-paginated (a true global filter/sort would
  need a server-side query, not worth it for a 30-day-retention, single-reader table). This
  replaced an earlier version where the Event *column header itself* was the clickable
  sort control (arrows baked into the header text) — that read as dated/unclear next to a
  dedicated filter dropdown, and conflated "sort" with "filter" in one ambiguous click target;
  a plain labeled button plus a plain labeled dropdown says what each one does. The header row
  is still `sticky top-0` (frozen) the same way the Districts table's header already is, so it
  stays visible while scrolling a long page of entries. This page now also uses the same
  `useAdminData()` hook every other admin page uses (Sync button, district-jump search, "Synced:"
  timestamp — see below), instead of its own bare-bones `/api/auth/me` guard with no
  Sync/search — the previous exception (documented as intentional, since this page has no
  districts/pacData of its own to render) was actually the wrong tradeoff: it made this page's
  header visibly different from the other three admin pages (missing search box, missing Sync,
  missing "Synced:" timestamp) for a cost (one extra district+PAC sync call) that's effectively
  free once any other admin page has already populated the Dexie cache in the same session.

**Which district/status to show is passed via `sessionStorage`, never a `?id=`/`?status=` URL
query string** (`frontend/lib/adminNav.ts`) — this app is a fully static export
(`next.config.ts`: `output: "export"`) with no server to resolve arbitrary paths at request
time, so a `/districts/[id]` dynamic segment would need every district id enumerated via
`generateStaticParams`; sessionStorage sidesteps that without putting anything in the URL
either. `setNavDistrictId()`/`getNavDistrictId()` are **not** consume-on-read (a reload of the
detail page should keep showing the same district, like a URL param would); `setNavStatusFilter()`
/`consumeNavStatusFilter()` **are** consume-on-read, same shape as `markJustAuthed()`/
`consumeJustAuthed()` in `session.ts` — landing on `/admin/districts` via the regular nav link
after a KPI card set a filter on an earlier visit should default back to "all", not surprise
the admin with a still-filtered table.

All four pages share `frontend/lib/useAdminData.ts` — the admin-only session guard, the
Dexie-backed `districts`/`pacData` cache, `sync()`, and `unlock()` — so none of them
re-implements the same fetch/cache dance (the Audit Log page is the one exception: it doesn't
need districts/pacData at all, so it does its own lightweight `/api/auth/me?role=admin` guard
instead of pulling in a full district sync it would never use). `AppHeader` takes `navLinks`
(the Dashboard/Districts/Audit Log pill nav, in the header rather than an in-page toggle) and
`onSync`/`syncing` (the Sync button, also in the header so it's reachable from every admin
page). It also takes `lastSyncedAt` — `useAdminData()` persists the ISO timestamp of the last
successful `sync()` to `localStorage` (`excise-portal:admin-last-sync`, read back synchronously
on mount via `useState`'s lazy initializer) and shows it in the header as "Synced: <formatIST>"
next to the Sync button on the three pages that pass `onSync` (Dashboard, Districts, District
Detail — the pages that actually use the Dexie cache). This exists so an admin who opens a page
and gets the instant Dexie-cached render (see below) — with no network round trip, and therefore
no visual cue about freshness — can tell *when* that data was last pulled from the server without
needing to click Sync just to find out. Persisting to `localStorage` (not just component state)
matters here: the whole point is surviving page loads and even new sessions, the same reason the
Dexie cache itself persists. Everything on the right side of the header — nav links, the
district search, the Synced timestamp, Sync, the theme toggle, and the profile menu — lives in
one `ml-auto` group, deliberately not spread across the header's full width (that read as
cluttered once several of these needed a home).
Logout lives **inside the profile dropdown** (`ProfileMenu`'s `onLogout` prop), not as its own
top-level header button, for the same decluttering reason — same for both Admin and DEO
headers. `AppHeader` also takes an optional `districts` prop that, when passed, renders a
global "jump to a district" search box (`DistrictSearch` inside `AppHeader.tsx`, no leading
icon — see the icon/live-text overlap note in UI conventions below) that autocompletes district
names and navigates straight to that district's detail page — separate from, and in addition
to, the Districts table's own row-filtering search box.

Admins are IAS/senior officers already comfortable navigating dashboards, so these pages favor
a compact toolbar (`Button size="sm"`, no big page-title heading) — deliberately different
from the DEO side, which stays verbose/hand-holding on purpose (see the Help button and inline
validation throughout `deo-data-entry/page.tsx`). The districts `<table>` itself has no
`w-full` — letting it auto-size to its content (not stretch to fill the container) is what
fixed it looking oddly stretched-out after the auto-layout fix in "Tables must stay
auto-layout" below; `overflow-x-auto` on the wrapper is still the fallback for narrow
viewports.

Excel export (`exportDistrictsToXlsx()` in `frontend/lib/export.ts`) is **one workbook, five
sheets** — one per financial year, each sheet districts × the 6 PAC fields for just that year
— not one sheet with all 5 years' columns side by side like the original version. Sheets are
named `FY 2021-22`, etc (see the FY-labeling convention above). Each sheet also carries two
merged banner rows above the district/field header row — `SITE_TITLE_EN` (see Portal identity
strings above) and `DATA_PERIOD_EN` — so the exported file is self-describing if it's opened
outside the portal (e.g. emailed to Excise HQ). `TITLE_ROWS` in `export.ts` is the single
source of truth for how many rows that pushes the header/data/money-formatting/freeze-pane math
down by — update it, not the individual row-offset call sites, if another banner row is ever
added.

## Bulk DEO provisioning (Admin dashboard)

Admin can add/update DEO logins for all 75 districts via an Excel round trip instead of
a manual DB operation:

- **Download DEO Template** (`downloadDeoTemplate()` in `frontend/lib/export.ts`) builds an
  `.xlsx` with column A pre-filled with all 75 district names (alphabetical, straight from
  the synced `districts` cache — already Title Case from `api/drizzle/seed.sql`), columns B/C
  blank for CUG mobile and email.
- **Upload DEO Data** reads that file back (`parseDeoTemplateFile()` — positional
  column A/B/C parsing, not header-name matching, so it survives the admin re-wording the
  header row) and `POST`s the rows to `POST /api/admin/provision-deos`
  (`api/app/api/admin/provision-deos/route.ts`).
- That endpoint is the **one deliberate exception** to "the server never sees a raw CUG
  number": there's no DEO browser in this flow to hash it client-side like the login flow
  does, so the *admin's* browser sends the plaintext 10-digit number the admin typed, and the
  server hashes it on ingest (`api/lib/hash.ts`'s `sha256Hex`, a server-side port of
  `frontend/lib/crypto.ts`'s). Each row is upserted by matching `district_name`: an existing
  `role: "deo"` user for that district gets `cug_hash`/`email` updated, no existing one gets a
  new row inserted — never duplicated. Blank rows (admin hasn't filled in that district yet)
  are silently skipped, not errors.

## Known gaps / intentionally out of scope

- No password/OTP fallback if Resend or a DEO's CUG number changes — re-seed manually.
- The seeded demo DEO account (see TESTING.md) is a manual `wrangler d1 execute --remote`
  insert, same as any other DEO — it does **not** exist in remote D1 just because it's
  documented. If demo login ever starts failing with "Invalid user", check the `users`
  table remotely before assuming a code regression; the row may simply never have been
  (re-)inserted after a database reset/reseed.
