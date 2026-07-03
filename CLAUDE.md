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
  `users.cug_hash`.
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
  trust boundary).
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

The Admin dashboard caches all districts + PAC rows in Dexie (`adminDistricts`,
`adminPacData`) for instant load, with an explicit "Sync" button to refetch from D1.
Export re-syncs first, then builds the `.xlsx` from the freshly-synced cache.

## UI conventions

- **Language**: UI chrome (buttons, nav, labels, error/success messages) is English only.
  The only Hindi in the app is the 6 PAC field labels (bilingual, `PAC_FIELD_LABELS` in
  `frontend/lib/pac-fields.ts`) and the department name in a couple of headers/the page
  title — because those mirror the actual government form and department name, not because
  "Hindi UI" is a general goal. Don't add Hindi to new chrome text.
- **Feedback is inline SPA state, not popups.** Each page keeps local `useState` for
  error/success and renders `components/ui/Banner.tsx` next to the relevant control —
  modeled on the `sent`/`error` state pattern in the sibling `up-excise-spatial-revenue-optimizer`
  project's login form. `window.Swal` (SweetAlert2, CDN) is reserved for exactly one thing:
  `confirmFinalSubmit()` in `frontend/lib/alerts.ts`, the blocking "are you sure" before an
  irreversible DEO submit-and-lock. Don't reach for a new SweetAlert popup for routine
  errors/success messages — add a `Banner` instead.
- No emojis anywhere in the UI — Tabler Icons (CDN webfont, `<link>` in `layout.tsx`)
  instead. Don't put a Tabler `<i>` icon directly inside/overlapping live input text —
  the glyph renders via a CSS `::before` that loads async, so it can flash a fallback tofu
  box on top of the text before the font loads (this happened once; `TextField` has no
  icon slot as a result). Icons on buttons/badges next to static short label text are fine.
- **Tailwind is a CDN script (`@tailwindcss/browser@4`), not a build step** — see
  `frontend/app/layout.tsx`. It must be a plain `<script src=...>` tag, not `next/script`.
  `next/script`'s `beforeInteractive` strategy injects the tag via a JS runtime hook rather
  than blocking HTML parsing, so the static export's raw HTML can paint fully unstyled
  before it runs. A native blocking `<script>` in `<head>` is also literally what Tailwind's
  own CDN docs say to do (it installs a MutationObserver and expects to load before
  `<body>`). Don't "fix" a styling flash by switching this back to `next/script`.
- Money inputs use Cleave.js with `numeralThousandsGroupStyle: "lakh"` for native
  Indian-numeral (Lakh/Crore) grouping and a `₹` prefix — don't hand-roll this formatting.
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

## Known gaps / intentionally out of scope

- No admin UI to provision new DEO users (add `cug_hash`/`email` rows) — currently a
  manual DB operation. Add an endpoint if that becomes a real workflow, not speculatively.
- No password/OTP fallback if Resend or a DEO's CUG number changes — re-seed manually.
