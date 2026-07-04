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
  `lock_status` (0/1) gates whether a DEO can still submit.
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

Unified 7-day HttpOnly JWT cookie (`__session`, via `jose`), issued by either flow:

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
- `GET /api/auth/me` — the SPA has no server, so it can't read the HttpOnly cookie itself;
  every gated page calls this on load to learn `{role, districtId}` before trusting the
  cached copy in `frontend/lib/session.ts` (localStorage — UI routing hint only, never a
  trust boundary). Also joins `districts`/`users` to return `email`/`districtName`, purely
  so the header's profile dropdown (`frontend/components/ui/ProfileMenu.tsx`) has something
  to show — it's not part of the trust boundary, just avoids a second round trip for display
  data the guard check was already making a DB call for.
- **Revocation**: submitting a DEO's final payload atomically locks the district *and*
  destroys that session cookie server-side (`destroySessionCookie()`), since there's
  nothing left for that DEO to do.

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
   confirm — `entry/page.tsx`'s `submitAll()` bails out on either step returning falsy.

Both dialogs are bilingual (English + Hindi). `app/layout.tsx` adds a small global
`.swal2-container { backdrop-filter: blur(3px) }` rule so every SweetAlert2 modal in the app
(not just this one) blurs the page behind it rather than just dimming it.

The Admin dashboard caches all districts + PAC rows in Dexie (`adminDistricts`,
`adminPacData`) for instant load, with an explicit "Sync" button to refetch from D1.
Export re-syncs first, then builds the `.xlsx` from the freshly-synced cache.

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
  message under — see `saveAndContinue()` in `entry/page.tsx`. Page-level success/failure
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
  `/login` or `/verify` page redirects to `/entry`/`/admin`; the destination page's existing
  `/api/auth/me` guard call checks and clears it. If you add another place that lands a user
  on those pages after auth, call `markJustAuthed()` there too or the toast won't show.
- **Help button** (`frontend/components/ui/HelpPanel.tsx`) is a `position: fixed` round
  button pinned just below the header (`right-6 top-24`, stays put while the page scrolls) —
  originally ported from the sibling `up-excise-spatial-revenue-optimizer` project's
  `HelpPanel` (which uses DaisyUI — this repo has no DaisyUI or shadcn, so it's restyled onto
  plain Tailwind/indigo classes), then redesigned off that project's inline-button pattern
  into a floating one so it doesn't compete for space in a page header/nav. It never opens on
  its own — only on click — and has two independent dismiss actions: the balloon's `×` just
  closes it for that moment (button stays, reopenable anytime), while "Don't show this again"
  additionally persists a per-`pageKey` `localStorage` flag that only clears the small unread
  dot on the button — it never hides or disables the button itself. One `HelpPanel` is mounted
  once per page (`entry/page.tsx`, `admin/page.tsx`), not per sub-view, since it's fixed
  positioning anyway. If you add a new gated page, add one there too rather than leaving help
  DEO/Admin-page-specific and inconsistent.
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
  reliably "the last one written." `components/ui/Button.tsx` has a `size?: "md" | "lg"` prop
  specifically so padding/text-size never has two candidate utilities active at once — add a
  new size there instead of overriding padding/text size through `className`.
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
  government form. If the six-field schema ever changes, update this layout by hand, same as
  every other place `PAC_FIELD_ORDER` is deliberately duplicated instead of derived. Recovered
  Amount auto-fills from RC Amount as the DEO types it, until they edit Recovered Amount
  directly — then it stops following (it's never locked/read-only, just pre-filled).
- **Tables must stay auto-layout (not `table-fixed`) wherever a cell can hold a large money
  value.** A district's Gross Arrears can be in the crores (`₹10,00,00,000.00` is a realistic
  value, not an edge case); a fixed-width column can't grow for it and the text
  overlaps/clips. `MasterView.tsx`'s summary table and the admin dashboard's table
  (`admin/page.tsx`) both rely on natural auto-layout sizing plus `whitespace-nowrap` on money
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

## Bulk DEO provisioning (Admin dashboard)

Admin can now add/update DEO logins for all 75 districts via an Excel round trip instead of
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
