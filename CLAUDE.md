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
  index. Six fields per year, in this fixed order (matches the Hindi form the DEOs see):

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
  untouched (separate cookie, see above).

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

## Frontend offline flow (`frontend/lib/db.ts`, Dexie)

DEO data entry is 5 sequential year steps + a Master View, gated so year `N+1` unlocks
only once year `N` is marked `completed`. Every keystroke persists to Dexie
(`draftYears` table) — **no network call happens until final submit**, which sends all 5
years in one atomic payload (`db.batch()` on the API side: 5 inserts + lock flip + user
audit stamp, all-or-nothing).

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

The Year 1–5 / Master View nav pills in `deo-data-entry/page.tsx` are `sticky top-16` (just below the
also-`sticky` `AppHeader`) so they stay reachable while scrolling down a long year form,
matching the `AdminDashboard`'s always-visible toolbar. The nav is `flex-col` below `sm` (Master
View drops to its own full-width row under the 5 year pills) and `sm:flex-row` above it (single
row, Master View right-aligned via `sm:ml-auto`) — they used to be split by a `flex-1` divider
`<span>` in one always-`flex-wrap` row, which forced an ugly full-width empty line whenever the
pills wrapped on a narrow/mobile viewport. The year pills themselves also shrink on mobile
(`px-2 py-1 text-xs`, each `flex-1` so all 5 share one row evenly) and return to their normal
size/padding at `sm`. Don't reintroduce a flex-growing spacer between the two groups. The page
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
  shades. `<head>` also declares `<meta name="color-scheme" content="light dark" />` — without
  it, Chrome's Android "force dark" feature doesn't know the site already handles its own
  theming and layers its own auto-darken/invert heuristic on top of our `.dark` class, which
  showed up as input borders rendering with a wrong greenish tint and, on some elements, text
  forced to a near-black that was unreadable against our own dark background. This isn't a
  Tailwind/CSS bug on our side — it only reproduces on Chrome for Android with that OS-level
  setting on — so don't try to chase it by re-tuning our own `dark:` colors; the meta tag is
  the actual fix and must stay in `<head>`.

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
  routine errors/success — use `notifyToast()` or a `Banner` instead.
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
  never visually stack even on a very wide (`size="lg" className="w-full"`) button.
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
  (`grid-cols-1 sm:grid-cols-[11rem_1fr]`) — below that, each field gets its own row, since the
  narrow count column has no room to breathe on a phone-width form. If the six-field schema
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
- **`/admin/districts`** — the sortable/searchable/pinned-column table with pagination
  (`getPaginationRowModel`, Rows-per-page 25/50/75/100, Prev/Next), a Locked/Unlocked/All
  status filter, plus Lock/Unlock, Download DEO Template (`variant="blue"`), Upload DEO Data
  (`variant="amber"`), and Export to Excel — all the *actions* live here now, not on the
  Dashboard. Numeric column headers show the short English label only, with the full bilingual
  label as a `title` tooltip (`header: () => <span title={...}>`) — using the full bilingual
  string as the header text was forcing every column to auto-size to its longest label rather
  than its much-shorter numeric values, which is what was bloating the table width. Container
  uses `lg:px-[15%]` instead of a fixed `max-w-*`, so the table gets most of the viewport on
  large monitors without stretching edge-to-edge. Clicking anywhere on a district row navigates
  to that district's detail page; the Unlock button inside the row calls `e.stopPropagation()`
  so it doesn't also trigger that navigation (pattern borrowed from the sibling
  `up-excise-spatial-revenue-optimizer` project's districts table, which does the same for its
  own row-click-to-detail behavior). Unlock asks for a reason first (`promptUnlockReason()` in
  `lib/alerts.ts`, a blocking SweetAlert2 textarea prompt) — see Data model below for where
  that's stored. The Locked/Unlocked status badge in this table's Status column must carry the
  same `dark:bg-red-950 dark:text-red-300` / `dark:bg-emerald-950 dark:text-emerald-300` pair as
  the identical badge on `/admin/districts/detail` — it was missed once during the dark-mode
  rebrand (the `bg-red-100`/`bg-emerald-100` light-mode classes don't change with the theme on
  their own, so the badge just looked like a mismatched light patch sitting in an otherwise-dark
  table, not literally invisible, but still wrong). If you add another status badge, copy the
  color pair from one of these two rather than inventing a new light-only one.
- **`/admin/districts/detail`** — one district's PAC figures across all 5 years as a small
  field × year table (with its own value/field search box, separate from the Districts table's
  by-name one), a lock-status badge, who locked it and when (`formatIST(lockedAt)`), and — if
  it's currently unlocked — who last unlocked it, when, and why.
- **`/admin/audit`** — a paginated (100/page), newest-first table of every login/logout,
  district lock/unlock, and DEO provisioning batch, auto-pruned to the last 30 days on read
  (see Data model below). Modeled on the sibling `up-excise-spatial-revenue-optimizer`
  project's `/admin/audit` page and its `audit_log` table.

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
page). Everything on the right side of the header — nav links, the district search, Sync, the
theme toggle, and the profile menu — lives in one `ml-auto` group, deliberately not spread
across the header's full width (that read as cluttered once several of these needed a home).
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
— not one sheet with all 5 years' columns side by side like the original version.

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
