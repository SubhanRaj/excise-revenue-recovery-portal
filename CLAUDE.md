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

**Package manager is pnpm, not npm** (`pnpm-lock.yaml` in each app, no `package-lock.json`) —
matches every sibling project in this workspace. `pnpm install`/`pnpm run <script>`/`pnpm exec
<bin>`, and CI (`ci.yml`/`deploy.yml`) uses `pnpm/action-setup@v4` + `pnpm install
--frozen-lockfile`. Each app's `pnpm-workspace.yaml` sets `allowBuilds` for the native
postinstall scripts pnpm blocks by default (`esbuild`, `sharp`, `unrs-resolver`, `workerd` —
all needed by `wrangler`/`opennextjs-cloudflare`/Next itself); if `pnpm install` ever reports
`ERR_PNPM_IGNORED_BUILDS` again after adding a new dependency, add its name to that file's
list rather than running `pnpm approve-builds` interactively (that doesn't persist for CI).

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
  districts table stays summary-only. `stayed` is still a plain `boolean` in the schema/
  validation — `YearStepForm.tsx`'s entry row renders it as a bilingual "No / नहीं" (default) /
  "Yes / हाँ" `Select` dropdown rather than a checkbox (a DEO could tick a checkbox by accident;
  a dropdown forces a deliberate choice), not a new field or type.

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

## API error handling (`api/lib/with-error-handling.ts`)

**Every route handler must be wrapped in `withErrorHandling(routeName, handler)`** —
`export const GET = withErrorHandling("admin/districts", async (req) => { ... })`, not
`export async function GET(req) { ... }`. This is the standard for every route in this repo, no
exceptions; when adding a new route, wrap it from the start rather than adding this later.

- The wrapper only catches what a route's own validation didn't anticipate (a D1 blip, a thrown
  exception from a third-party call like Resend) and turns it into a clean `{ error: "..." }`
  JSON 500. A route's own expected-error responses (400/401/404/409, ...) are ordinary early
  `return`s from inside the handler and pass through completely untouched — never move that
  validation logic inside a `try` block expecting the wrapper to handle it; keep returning those
  directly, same as before this existed.
- `admin/provision-deos`'s per-row `try/catch` inside its bulk-upload loop is a **different,
  deliberate** thing, not replaced by the outer wrapper: it exists so one row hitting a unique
  constraint doesn't abort the other 74 (partial success is the intended behavior there). Don't
  remove it thinking the outer wrapper makes it redundant — they catch different things.
- Multi-write atomicity is handled separately, by `db.batch()` (Drizzle/D1's equivalent of
  Laravel's `DB::transaction()` — all-or-nothing) — see the Data model section's `pac_data`
  rules for where that's required. `withErrorHandling` is about the *response shape* on failure,
  not about making writes atomic; use both together where a route does a multi-step write.

## Auth (`api/lib/session.ts`, `api/lib/auth-guard.ts`, `api/middleware.ts`, `frontend/lib/session.ts`)

See [README.md](./README.md)'s App flow → Auth for the CUG/magic-link flow overview. Session
auth is an **`HttpOnly`/`Secure`/`SameSite=Lax` cookie, not a Bearer token** — this is the
result of Rollout 2 in ROADMAP.md's Milestone 36, reverting a Milestone-21-era
Bearer-token detour once `excisebakaya.exciseup.in` made frontend and API a true single origin
(see "Why cookies again" below for the full history of both migrations). Rules an agent must
preserve:

- **Two separate cookies**, keyed by role (`__admin_session` / `__deo_session`, named in
  `api/lib/session.ts`'s `cookieName()`) — never merge back into one shared cookie.
  `POST /api/auth/verify-cug` and `POST /api/auth/verify-magic-link` return `{ role,
  districtId }` in the JSON body (no `token` field) and set the cookie via
  `setSessionCookie()` on the response (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
  matching `SESSION_TTL_SECONDS`, no `Domain=` attribute so it can't leak to sibling subdomains
  like `sro.exciseup.in`). Every API route that needs a session calls
  `requireSession(req, "admin" | "deo")` (`api/lib/auth-guard.ts`), which reads
  `req.cookies.get(cookieName(role))?.value` — **never add an `Authorization`/Bearer-header read
  back into `requireSession`**. The frontend still passes `?role=admin`/`?role=deo` on `GET
  /api/auth/me` and `POST /api/auth/logout` (the query param picks which role's cookie to
  check/clear; the browser attaches whichever cookies exist automatically, same-origin).
- Real CUG numbers start with `94544`; `app/login/page.tsx` gates on this prefix before
  hashing/sending, and the error is the same generic "Invalid user" a real auth failure shows —
  never name the prefix rule in the message. The one demo account is matched against a
  precomputed `DEMO_CUG_HASH` constant, not raw digits — the real demo number lives only in the
  `DEMO_CUG` Cloudflare Worker secret; never add it to source or docs.
- `frontend/app/verify/page.tsx` requires an explicit button click (POST, not GET) so email
  prefetchers can't burn the magic-link token.
- `GET /api/auth/me?role=admin|deo` is the source of truth for `{role, districtId}` on every
  gated page load — call it directly, never gate a page on the `excise-portal:last-role` hint in
  `frontend/lib/session.ts` (`getLastRole()`/`markLastRole()`/`clearLastRole()` — that hint is
  shared across the whole browser and only exists for `/`'s first-paint redirect guess; it goes
  stale the instant the other role logs in on any tab, and it isn't the credential — the cookie
  is, and frontend JS can't read it by design). A 401 here means "not logged in as this role,"
  full stop — an expired cookie and a missing one look identical to the frontend, which is
  correct: there's no server-side revocation list to consult either way (see below). `GET
  /api/auth/me?role=deo` also returns `lockStatus`/`lockedAt`/`submittedByName`, re-asked on
  every load (never cached) since an Admin unlock can happen at any time.
- Session tokens are **stateless JWTs with no server-side revocation** — logout and "lock kills
  the session" both just clear the cookie client-side (there is no `denylist`/`revoked_tokens`
  table, and adding one would be a real feature, not a bug fix — don't add it speculatively).
  `POST /api/auth/logout?role=` records an audit-log event and calls `clearSessionCookie()` on
  the response; the frontend also calls `clearLastRole()` right after
  (`AppHeader.logout()`, `deo-data-entry/page.tsx`'s `logoutLocked()`). Submitting a DEO's final
  payload atomically locks the district in D1; the frontend then calls `clearLastRole("deo")`
  right after a successful submit (an Admin session in the same browser is untouched, since it's
  a different cookie) — the underlying JWT is still technically valid until it expires (7 days)
  since there's no revocation list, same residual-validity trade-off any stateless-JWT design
  accepts; the district lock itself, not the cookie, is what actually stops re-entry.
- **`api/middleware.ts` is now a no-op** — same-origin means no CORS preflight/OPTIONS handling
  is needed. Kept as an empty passthrough file, not deleted, only because `api/middleware.ts`
  (not `proxy.ts`) is a load-bearing filename under this Next.js version (see DEPLOY.md's
  redeploy section).
- **Known local-dev gap**: `next dev` (`:3000`) and `wrangler dev` (`:8787`) are genuinely
  cross-origin ports. `SameSite=Lax` cookies aren't sent on the `fetch()` calls between them
  (`Lax` only covers top-level navigations cross-site), so a manual local login will appear to
  succeed and then 401 on the next `/api/auth/me` call. Not solved (a local single-origin dev
  proxy is more setup than warranted) — the e2e suite exercises the real deployed domain instead
  (`playwright.config.ts`'s default `baseURL`), unaffected by this gap.

### Why cookies again

Two migrations happened here, in opposite directions, each correct for its own constraint at
the time:

**Cookies → Bearer token (Milestone 21).** The original design used two `HttpOnly; Secure;
SameSite=None` cookies, which is the standard secure pattern for a session — but only when the
browser cooperates. `/frontend` (Pages, `*.pages.dev`) and `/api` (Worker, `*.workers.dev`) were
different public-suffix domains at the time, so that cookie was a **third-party cookie** by
definition, and this repeatedly broke real logins: Safari ITP blocked it outright, and it
started intermittently failing in plain **Chrome** too (Incognito blocks third-party cookies by
default; a locked-down/managed profile can too) — reproduced live during a demo as "enter CUG,
page just reloads back to the login screen." No CORS header fixes that — it's enforced entirely
by the browser's own cookie policy before any response header is even read. A Bearer token isn't
a cookie, so no browser's cross-site-cookie policy applied to it at all — that was the actual
fix for that era, not a workaround. Trade-off accepted at the time: a token in `localStorage` is
readable by same-origin JS, so an XSS bug in the frontend could steal it (unlike an `HttpOnly`
cookie) — assessed as acceptable because there was (and still is) no path where DEO-entered or
admin-entered data is rendered as raw HTML anywhere (the only `dangerouslySetInnerHTML` in the
frontend is a static, hardcoded dark-mode bootstrap script in `app/layout.tsx`, not user data).

**Bearer token → cookies (Milestone 35, Rollout 2).** `excisebakaya.exciseup.in` (Milestone 35,
Rollout 1) put frontend and API on a true single origin — a path-scoped Worker Route for
`/api/*` alongside Pages serving everything else, not a domain merge (see ROADMAP.md's Milestone 35).
That removes the third-party-cookie problem entirely: same-origin requests always carry
same-origin cookies regardless of `SameSite`, and `SameSite=Lax` is real CSRF hardening the old
cross-origin design could never use. `HttpOnly` also closes the XSS-token-theft trade-off
Milestone 21 had explicitly accepted as a concession, not a preference. This is why the switch
back happened now and not speculatively — the exact condition CLAUDE.md had flagged ("if this
app ever gets a custom domain, switch back to cookies") was met.

If a future infra change ever reintroduces a genuine cross-origin split between frontend and
API (e.g. reverting the custom domain, or serving one of the two apps from a different zone),
re-read this whole section before touching auth — that's exactly the condition that made
Milestone 21's Bearer-token detour necessary the first time.

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
  `max-w-2xl`, no data-entry form) with a bilingual **Request Unlock** flow instead of a plain
  "contact the Admin" message — see the "DEO self-service unlock requests" section below. Its
  own full-width Logout button skips the blocking confirm (`logoutLocked()`, not the shared
  `AppHeader.logout()`), since logout is one of only two actions available there. Unlocked-after-
  a-previous-submission calls `GET
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
  touch it. This rule is unlayered, so no Tailwind `leading-*` utility can override it for a
  specific `<select>` that needs more vertical room (e.g. Devanagari मात्राएँ visually clipping
  at `line-height: 1`) — only an inline `style` has enough cascade precedence. `Select.tsx`
  already does this by default (`style={{ lineHeight: "1.4", ...style }}`, overridable via its
  own `style` prop) so every dropdown in the app gets it for free; don't re-solve this per call
  site.

## UI conventions

- **Language**: UI chrome is English only. The only Hindi is the 6 PAC field labels, the
  department name, the RC Details section's "Stayed by Court?" column (mirrors the existing
  Stay Amount field's Hindi phrasing, since it's the same concept applied per-RC), the
  DEO entry page's Help panel (see below), and the locked-DEO-page messaging (the "Data Already
  Locked" paragraphs, the Request Unlock form's reason label, the pending-status text, and
  `confirmUnlockRequest()`'s SweetAlert2 dialog) — because all of these mirror the actual
  government form or exist specifically to help a DEO who reads Hindi more comfortably. Don't
  add Hindi elsewhere without a similarly concrete reason.
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
  the button's unread dot — never hide the button itself. Optional `childrenHi` prop: when
  passed, an English/हिंदी toggle appears above the content and switches which one renders
  (local `useState`, not persisted — resets to English on next open). Only the DEO entry page's
  instance passes it; Admin pages' instances don't, so they stay English-only chrome with no
  toggle shown at all. Add a Hindi translation here only for a page where the audience
  genuinely benefits (i.e. DEO-facing), not reflexively on every `HelpPanel` usage.
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
  fallback. **Exception**: `YearStepForm.tsx`'s RC Details entry table uses `table-fixed`
  deliberately — every cell holds an `<input>`, not raw money text, so there's nothing for a
  large value to clip (the input scrolls its own content instead); `table-fixed` there is what
  makes the RC Number/RC Amount columns share width equally instead of RC Number eating all the
  leftover space under auto-layout. Don't extend this exception to a read-only money table.
- **Sticky/pinned table rows and columns need an opaque background** (`bg-white`, alternating
  stripe `bg-slate-50`, not `/50` alpha) on every `tbody tr` — a `sticky left-0` pinned cell using
  `bg-inherit` needs an opaque ancestor to resolve to, or scrolled content bleeds through it.
- `disabled:cursor-not-allowed` does not work on `<button>` under this Tailwind version (preflight
  sets `button { cursor: pointer }` unconditionally). Set `style={{ cursor: "not-allowed" }}`
  directly from the disabled condition instead; `disabled:opacity-*` still works normally.
- **A `!ready` skeleton must roughly match its page's real loaded height**, not just exist — a
  short mismatch (or `return null` and popping in the whole page at once, which several admin
  pages did before this was caught) reads as the page visibly shrinking/growing on every load.
  Give the real content's scrollable table wrapper a `min-h-[...]` that roughly matches the
  skeleton's placeholder height (see `/admin/unlock-requests`, `/admin/audit`) so the
  skeleton → loading → loaded sequence doesn't jump twice (once when the real `AppHeader`/toolbar
  swaps in, once when a short results list collapses a tall empty table down). Mirror the real
  page's toolbar row in the skeleton too (a same-sized pulse block per real control), not just
  the big content block below it.
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

## Admin pages: Dashboard / Districts / district detail / DEO Provisioning / Audit Log

See [README.md](./README.md)'s App flow → Admin for a one-line summary of each page. Five
separate routes, not an in-page toggle:

- **`/admin`** (`AdminDashboard.tsx`) — colorful clickable KPI cards (Districts/Locked/Unlocked/
  Gross Arrears/Net Recoverable, each its own accent color), a top-15-districts Chart.js bar
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
  figures per district there is a legitimate, different use case. **Mobile sizing**: the bar
  chart's canvas wrapper is `h-56 sm:h-72` with `overflow-hidden` (Chart.js's own responsive
  resize can't shrink below a fixed-height parent, so the parent has to be the one that shrinks
  first); the lock-status donut + its legend go `flex-col` below `sm` (`sm:flex-row` above it) so
  the fixed-width `h-44 w-44` donut doesn't force the legend into a too-narrow remainder and
  overflow; KPI card values are `break-words` (a long ₹ figure has no natural wrap point
  otherwise, which can force the whole grid past the viewport width); the "All fields" `dl` is
  `grid-cols-1 sm:grid-cols-2` for the same reason, stacking on phones instead of squeezing two
  money columns into half the width each. The **Locked**/**Unlocked** KPI cards navigate via an
  `onClick` (`setNavStatusFilter()` + `router.push()`), not a plain `href`, since this app's
  cross-page filter state is `sessionStorage`-only (`adminNav.ts`) and never a URL query string —
  a `?status=locked` `href` here would be dead weight the destination page never reads. The other
  three cards (Districts/Gross Arrears/Net Recoverable) have no filter to carry, so they stay
  plain `href="/admin/districts"` links.
- **`/admin/audit`**'s `describeMetadata()` renders each `audit_log.metadata` JSON key through
  `METADATA_KEY_LABELS` (e.g. `submittedByName` → "Locked by") instead of the raw camelCase key —
  add a new entry there whenever a route starts writing a new metadata key, so it doesn't show up
  unlabeled in the log.
- **`/admin/districts`** — sortable/searchable/pinned-column table (`getPaginationRowModel`,
  25/50/75/100 rows/page), a Locked/Unlocked/All status filter, Lock/Unlock, and two export
  buttons. Column headers use `englishLabel()` only, no bilingual tooltip. Container padding
  shrinks progressively at wider breakpoints (`lg:px-[10%] xl:px-[5%] 2xl:px-[3%]`). The table's
  scroll container is capped at `max-h-[70vh]` at every breakpoint (not `flex-1`/`lg:max-h-none`)
  — an uncapped container has no scrolling ancestor for its `sticky top-0` header to freeze
  within. Row click navigates to the district's detail page; Unlock's button calls
  `e.stopPropagation()` to not also trigger that navigation, and prompts for a reason first
  (`promptUnlockReason()`) before calling the unlock endpoint. All `<select>`s across admin pages
  go through `components/ui/Select.tsx` (never a bare `<select>`) for consistent sizing/chevron;
  it carries a `min-w-[8rem]` floor, overridable via `className` for options with longer text.
  **Export as Excel Workbook** and **Export as SQL** both re-sync first (via `sync()`'s return
  value, not the pre-sync closure), then build the file, showing a disabled `animate-pulse`
  "Exporting..." state on their own button while running. **Export as SQL**
  (`exportDistrictsToSql()`) writes a plain `.sql` `DELETE`+`INSERT` file for `districts`+
  `pac_data` only (the two tables cached client-side) via a native `Blob`/anchor download. The
  toolbar's search box (`max-w-[13rem]`) filters the on-page table only — it's a plain `<input>`
  distinct from `AppHeader`'s global district-jump `DistrictSearch` autocomplete.
- **`/admin/districts/detail`** — one district's PAC figures across all 5 years as a field × year
  table, with its own value/field search box, lock-status badge, who locked it/when, and (if
  unlocked) who last unlocked it/when/why. `max-w-7xl`, table has no `w-full` (auto-layout, see
  Visual language above). The table's scroll wrapper is `max-h-[70vh] overflow-auto` (both axes)
  with `sticky top-0` header cells. Unlock is a small hand-styled pill matching the badges beside
  it, not a full `Button.tsx` instance.
- **`/admin/districts/provisioning`** — Download DEO Template / Upload DEO Data, split out of
  `/admin/districts`'s toolbar (it was crowding the export/filter buttons there and reads as an
  occasional bulk-ops task, not something an admin needs on every visit to the districts table).
  Not on the flat Dashboard/Districts/Audit Log nav — reached via `ProfileMenu`'s "Admin"
  dropdown (a new `Link` there, admin-role-only) instead, alongside Logout.
- **Admin identity display** — `users.name`/`users.designation` (nullable) let `ProfileMenu.tsx`
  show a real name and job title (e.g. "Excise Commissioner") everywhere an admin's identity
  appears: the dropdown's role label, the collapsed pill badge, the email row (name shown
  instead, raw email moved to a `title` hover tooltip), the post-login welcome toast, the
  `/admin/audit` Actor column (`audit_log.actor_name`/`actor_designation`, captured at write
  time — see the Audit Log entry below), and `districts.unlocked_by`. Both fields are
  admin-only in practice — DEOs don't have them set, so their own identity display (name via
  `submitted_by_name`, "DEO {district}" everywhere else) is unchanged. Provisioning an
  additional admin (beyond the original bootstrap account) is still a direct D1 insert
  (`role: 'admin'`, plus `name`/`designation` if wanted) — no self-service UI yet.
- **DEO Provisioning is owner-only.** `OWNER_EMAIL` Worker secret + `GET /api/auth/me`'s
  `isOwner` gate which admin account can see/use `/admin/districts/provisioning` — every other
  admin (the department officials above) has the link hidden in `ProfileMenu` and gets a 403
  from `POST /api/admin/provision-deos` directly. The downloadable DEO template only lists
  districts with no DEO yet (`GET /api/admin/districts`'s `deoUserId`, distinct from
  `deoEmail` since a CUG-only DEO has no email) — a routine download-fill-upload can't
  accidentally overwrite an existing DEO's login.
- **`/admin/audit`** — paginated (100/page), newest-first, auto-pruned to 30 days on read. A
  "Filter by event" `<select>` and a separate sort button (`ti-sort-descending`/`ti-sort-
  ascending`) both apply only to the currently-loaded page in memory — no extra request. Uses the
  same `useAdminData()` hook as the other admin pages (Sync, district search, "Synced:"
  timestamp), even though it has no districts/pacData of its own to render.

**Which district/status to show travels via `sessionStorage`** (`frontend/lib/adminNav.ts`),
never a `?id=`/`?status=` URL query string — this app is a static export
(`next.config.ts`: `output: "export"`) with no server to resolve dynamic paths at request time.
`setNavDistrictId()`/`getNavDistrictId()` are not consume-on-read (a detail-page reload should
keep showing the same district). `setNavStatusFilter()`/`consumeNavStatusFilter()` are
consume-on-read — landing on `/admin/districts` via the regular nav link should default to "all".

All admin pages share `frontend/lib/useAdminData.ts` (session guard, Dexie cache, `sync()`,
`unlock()`). `AppHeader` takes `navLinks`, `onSync`/`syncing`, `lastSyncedAt` (persisted to
`localStorage` as `excise-portal:admin-last-sync`), and an optional `districts` prop that renders
a global "jump to a district" search. `AppHeader.navLinks` is still just Dashboard/Districts/
Unlock Requests/Audit Log — DEO Provisioning isn't in it, by design (see above).

**Mobile nav is a left-side drawer, not an inline row.** Whenever `navLinks` is passed
(`hasDrawer = Boolean(navLinks)`, i.e. every admin page — DEO pages pass none), the entire
right-aligned header group (nav links, `DistrictSearch`, Sync, `ThemeToggle`, `ProfileMenu`) is
`hidden sm:flex` — below `sm` the header shrinks to just a hamburger (`ti-menu-2`, left of the
brand square) and the page title, with the "Excise Revenue Recovery Portal" subtitle line also
hidden (`hidden sm:block`) to save the row's height. The hamburger opens a `fixed inset-y-0
left-0 w-72` drawer (dark `bg-black/40` backdrop, click to close) holding all of the above
stacked vertically — `ProfileMenu` rendered a second time inside it (not moved, since the
desktop copy needs to stay for `sm:flex`), `DistrictSearch` passed `mobile` (drops its desktop
`hidden lg:block, w-44` sizing for `w-full`), and Sync/`ThemeToggle` as full-width rows. This is
the *only* mobile entry point to any of these — don't remove it as "redundant" with the desktop
row, the two are mutually exclusive by breakpoint. **The backdrop + drawer render as siblings of
`<header>`, not children of it** — `<header>` has `backdrop-blur` (`backdrop-filter`), which
per spec makes it a CSS containing block for `position: fixed` descendants, so a fixed drawer
nested inside it sizes against the header's own ~60px height instead of the viewport (verified
empirically: computed height came back `60px`, not `812px`, before this was caught). If
`AppHeader` is ever restructured, keep the drawer/backdrop outside the `<header>` tag or
re-verify this against a real render first. Logout lives inside
`ProfileMenu`'s dropdown, not as a top-level header button, for both Admin and DEO headers.
`ProfileMenu`'s `NavLink`/`{ label, href }` shape has no dropdown/submenu concept — the "DEO
Provisioning" entry is a one-off `Link` in that menu's JSX, not a reusable nav-dropdown
component; if a second item like this shows up, that's the point to build one instead of adding
a third one-off.

Admin pages favor a compact toolbar (`Button size="sm"`, no large page-title heading) —
deliberately different from the DEO side, which stays verbose/hand-holding on purpose.

### Excel export

`exportDistrictsToXlsx()` (`frontend/lib/export.ts`, ExcelJS) is one workbook, **ten** sheets: a
**Summary** cover sheet, a **Master** sheet, a **Lock Status** sheet, one sheet per financial year
(districts × the 6 PAC fields plus Opening Balance/Net Recoverable, read straight off the synced
`pac_data` row), and a trailing **RC Details** sheet. FY sheets are named `FY 2021-22`, etc. Each FY sheet carries two
merged banner rows (`SITE_TITLE_EN`, that sheet's own `dataPeriodForFY(fy)`) above the header row
— `TITLE_ROWS` in `export.ts` is the single source of truth for how many rows that offsets the
header/data/freeze-pane/print-titles math; update it, not individual call sites, if another
banner row is added. Every column header is English-only (`englishLabel()`).

**Master** is one row per district, covering the full 5-year data period (1 April 2021 – 31 March
2026) in a single view: District, then each of the 6 PAC fields **summed across all 5
`FINANCIAL_YEARS`** (these are fresh per-year figures, so summing is legitimate — same convention
as the Summary sheet's Gross Arrears/Recovered Amount totals), then a trailing Net Recoverable
column. Net Recoverable is **not** summed across years here either — same rule as everywhere else
in this workbook/the Admin Dashboard (see the Data model section above): each FY's value already
carries forward every prior year's balance, so this column instead carries each district's FY
2025-26 value only. Has its own TOTAL footer row (`styleTotalCell()`), same pattern as the FY
sheets. Listed in the Summary sheet's "Sheets in this workbook" row.

**Lock Status** lists which of the 75 districts have locked (submitted final data) and which
haven't, for an Admin sending reminders. Two stacked tables in one sheet: **Locked Districts**
(District, Locked At, Locked By — the DEO name, read off any of that district's `pac_data` rows'
`submittedByName`/`lockedAt`, identical across all 5 since they're written once at final lock) and
**Unlocked Districts — Not Yet Submitted** (District, Last Unlocked At/Reason/Unlocked By, off
`districts.unlockedAt`/`unlockReason`/`unlockedBy` — blank for a district that's never been
locked at all). Filtered purely off `districts.lockStatus` and the already-synced `pacData`
argument — no separate audit-log fetch, since `pac_data` already carries who/when locked.

Each FY sheet also shows that year's own per-RC breakdown in place: every district row is
immediately followed by one sub-row per RC it has in that FY (indented `↳ RC number — Stayed` in
the District column, the amount under the same RC Amount column, parsed via `parseRcDetails()`,
styled italic/gray to read as a nested detail rather than another district). `rcAmountCol0`
(computed once, shared by every FY sheet) is the single source of truth for which column a
sub-row's amount lines up under — update it, not each FY-sheet call site, if the field order ever
changes.

**RC Details** is one flat sheet across every district/FY (not per-FY, unlike the 5 sheets
above) — District, Financial Year, RC Number, RC Amount, Stayed (Yes/No), parsed from each
`pac_data` row's `rc_details` JSON string — for an auditor who needs a cross-year view of one
district's RCs (or every stayed RC portfolio-wide) without opening all 5 FY sheets. Rows are
grouped per district (a bold `District — "N RC(s)"` summary row, same `styleTotalCell()` used for
FY sheets' TOTAL row, applied via `eachCell({ includeEmpty: true }, ...)` so the tint spans every
column even where a cell has no value, followed by that district's own RC rows) — a flat
75-district table with no structure would run to hundreds of unusable rows. `rcWs.autoFilter`
spans the header row through the last data row so District/Financial Year/Stayed can be filtered
directly. This sheet's title/subtitle banner is deliberately **not** `mergeCells`'d, unlike every
other sheet in this workbook — ExcelJS has a documented bug (exceljs/exceljs#970) where a merged
cell anywhere on a sheet that also carries an `autoFilter` corrupts the file (Excel's own repair
silently strips both features on open); the banner text sits left-aligned in column A instead.
Same `TITLE_ROWS`/frozen-header/print-titles treatment as the FY sheets otherwise.

**Neither sheet uses Excel's row `outlineLevel`/`hidden`/`collapsed` grouping** (no
"click `+` to expand a district's RCs") even though that would visually compact both of the above
further — multiple open ExcelJS issues (exceljs/exceljs#550, #2814) document that feature writing
outline XML Excel doesn't reliably accept, which is what caused the "problem with some content"
repair prompt the first two attempts at this feature hit. Don't reintroduce
`row.outlineLevel`/`row.hidden`/`worksheet.properties.outlineProperties` on these sheets without
re-verifying against a real Excel install first (`xmllint`/openpyxl/SheetJS all happily accepted
the broken files — none of them catch what Excel's own stricter loader rejects).

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

## DEO self-service unlock requests (`unlock_requests` table)

A locked-out DEO can request an unlock in-app instead of only contacting an Admin outside the
portal — see ROADMAP.md's Milestone 28 for the full design rationale/security analysis; this
section documents the shipped shape.

- **Schema**: `unlock_requests` (`api/db/schema.ts`) — `districtId` FK, plaintext `reason`,
  optional `attachmentKey`/`attachmentFilename` (R2), `status` (`pending`/`approved`/`denied`),
  `requestedAt`/`resolvedAt`/`resolvedBy`/`adminNote`. "Only one pending request per district" is
  an application-level check-then-insert in the route (no partial unique index), not a DB
  constraint — same posture as everything else in this schema that isn't safety-critical.
- **`POST /api/deo/request-unlock` is the first multipart/`FormData` route in this codebase** —
  every other route reads `req.json()`. Don't copy this pattern for a route with no actual file
  upload. Magic-byte check (`%PDF-` header, not the client-reported `Content-Type`) and a 2MB
  size cap are both re-verified server-side, zero-trust per the Validation rules section above.
  The R2 object key is always server-generated (`unlock-requests/{districtId}/{timestamp}.pdf`)
  — the client's original filename is stored only as a display string, never used to build the
  key or a path.
- **R2 bucket** `excise-revenue-recovery-attachments`, meant to bind as `ATTACHMENTS` in
  `api/wrangler.jsonc` — private, no public access/CORS/`R2.dev` URL. The only read path is
  `GET /api/admin/unlock-requests/attachment?id=`, which takes the request `id` (never a raw R2
  key from the client) and looks up `attachmentKey` server-side. **That binding is currently
  commented out in `api/wrangler.jsonc`** — `wrangler deploy` hard-fails the entire Worker
  deploy with `[code: 10042]` if it's present while the bucket doesn't exist (R2 needs a payment
  method enabled on the Cloudflare account, not done yet). See
  [R2_PDF_ATTACHMENT_REPROVISIONING.md](./R2_PDF_ATTACHMENT_REPROVISIONING.md) before touching
  this binding.
- **`GET /api/auth/me?role=deo`** (not a separate polling endpoint) also returns
  `pendingUnlockRequest: { requestedAt, reason } | null` — this route is already the DEO page's
  single source of truth for lock state, re-fetched on every load, so the pending-request flag
  belongs there.
- **`POST /api/admin/unlock-requests/resolve`** requires a `note: string` on both `approve` and
  `deny` — the admin always types their own reason; the DEO's submitted `reason` is shown for
  context but never auto-copied into `adminNote`/`districts.unlockReason`. Re-checks the row is
  still `"pending"` before writing, to avoid a double-resolve race. Approve mirrors the existing
  `POST /api/admin/unlock/route.ts` district update, batched with the `unlock_requests` row
  update and an audit-log insert.
- **In-browser PDF preview, not a forced download — built, not currently wired up**:
  `components/ui/PdfPreviewModal.tsx` fetches the attachment as a blob via `apiFetchBlob()` (this
  app has no cookies — see Auth above — so a plain `<iframe src="...">` can't attach the Bearer
  token itself) and renders it through the **browser's own native PDF viewer** via
  `URL.createObjectURL()`. Any script embedded in the PDF runs inside that native viewer's own
  sandbox, not as page-level JS — this is why the attachment route sets `Content-Disposition:
  inline` (not `attachment`) plus `X-Content-Type-Options: nosniff`. Revoke the object URL on
  modal close. First non-SweetAlert2 modal in the app — an `<iframe>` doesn't fit Swal's
  HTML-string API, same reasoning as the DEO-side form below. **The component is untouched, but
  `/admin/unlock-requests/page.tsx` no longer imports or renders it** — the Attachment
  column/"View" button/`previewFor` state were removed since nothing could ever populate an
  attachment while the DEO-side upload is disabled, and a permanently-empty column read as dead
  UI. Re-adding both sides is covered step-by-step in
  [R2_PDF_ATTACHMENT_REPROVISIONING.md](./R2_PDF_ATTACHMENT_REPROVISIONING.md).
- **DEO-side UI**: a plain inline form on the existing "Data Already Locked" card
  (`deo-data-entry/page.tsx`), not SweetAlert2 — a `<textarea>` (+ eventually `<input
  type="file">`) doesn't fit Swal's API either. **Reason-only for now — no PDF attachment field
  is rendered.** R2 (its storage backend) needs a payment method on file to enable, even on the
  free tier, and D1 was ruled out as a fallback (its 2MB per-row/BLOB cap sits right at this
  feature's size limit, and a scanned letter can realistically exceed it). The server-side
  provision stays fully live — `POST /api/deo/request-unlock` still accepts an optional
  `attachment` field with magic-byte/size validation, the `ATTACHMENTS` R2 binding is in
  `api/wrangler.jsonc`, and the admin attachment route + `PdfPreviewModal.tsx` both still work —
  so re-enabling this is a **frontend-only** change (re-add the file input; see the comment on
  `submitUnlockRequest()`) once R2 is actually provisioned — see
  [R2_PDF_ATTACHMENT_REPROVISIONING.md](./R2_PDF_ATTACHMENT_REPROVISIONING.md) for the exact,
  copy-paste-ready steps and code. The "Data Already Locked" card's English/Hindi paragraphs
  point at the **Request Unlock** button rather than telling the DEO to contact the Admin
  outside the app. Submitting goes through `confirmUnlockRequest()` (`lib/alerts.ts`) — a
  blocking SweetAlert2 confirm, same "irreversible-ish action" pattern as
  `confirmFinalSubmit()`/`confirmClearYear()` — before the actual `POST` fires. The Submit
  Request button uses `Button`'s `primary` variant (not `dark`, unlike the rest of this card) so
  it reads as the clear next action, shows a `ti-loader animate-spin` icon while
  `requestSubmitting` is true, and stays `disabled` for the same duration to block a double-
  submit from a second click.
- **Admin-side UI**: new top-level nav page `/admin/unlock-requests` (added to every
  `AppHeader.navLinks` array — Dashboard/Districts/**Unlock Requests**/Audit Log, duplicated
  per-page same as the other three links), reusing the `promptUnlockReason()`-style single-
  textarea SweetAlert2 pattern for the required approve/deny note.
- **Audit events**: `unlock_requested`, `unlock_request_approved`, `unlock_request_denied`,
  following the existing `noun_pastverb` convention.
- **`AppHeader`'s "Synced: <time>" text moved into `ProfileMenu`'s dropdown** (beneath "DEO
  Provisioning", admin-only, plain text not a link) to free up header width for the added nav
  link — `ProfileMenu` now takes an optional `lastSyncedAt` prop for this.

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
- ~~`mail.upexciseonline.co` (or the chosen domain) is not yet verified in Resend~~ — resolved:
  `mail.exciseup.in` is verified, `FROM_EMAIL` is `noreply@mail.exciseup.in` (same domain/address
  shared with the sibling `up-excise-spatial-revenue-optimizer` project — see DEPLOY.md). This is
  only the email-sending domain — the "no real domain/DNS yet" gap above, about this project's own
  frontend/api hosting and the Bearer-token-vs-cookie tradeoff, is unrelated and still open.
