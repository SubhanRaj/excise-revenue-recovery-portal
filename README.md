# Excise Revenue Recovery Portal

Internal portal for the Department of Excise, Government of Uttar Pradesh, to collect
5 years of historical PAC (Recovery Certificate) data — FY 2021-22 to FY 2025-26 — across
all 75 districts.

## Architecture

Two completely decoupled apps, deployed as separate Cloudflare resources:

| Directory   | What it is                                                              | Deploys to              |
| ----------- | ------------------------------------------------------------------------ | ------------------------ |
| `/frontend` | Next.js App Router, `output: "export"` — behaves as a static SPA        | Cloudflare Pages         |
| `/api`      | Next.js App Router, native `app/api/**/route.ts` only (no Hono/Express) | Cloudflare Worker (via [OpenNext](https://opennext.js.org/cloudflare)) + D1 |

They talk over plain `fetch`, same-origin in production (`excisebakaya.exciseup.in`, a Pages
custom domain plus a path-scoped Worker Route for `/api/*`), authenticated via an `HttpOnly`
cookie (see [CLAUDE.md](./CLAUDE.md)'s Auth section for the setup and its history). There is no
shared package — types that overlap (financial years, PAC field order) are intentionally
duplicated in each app.

Client-side libraries (SweetAlert2, SheetJS, Tabler Icons, Google Fonts, Tailwind CSS v4,
Chart.js) load from the jsDelivr CDN in `frontend/app/layout.tsx` rather than being bundled —
see that file. SweetAlert2/SheetJS/Chart.js are still listed as npm `devDependencies` purely
for their TypeScript types (`frontend/lib/globals.d.ts`'s `window.Swal`/`XLSX`/`Chart`), not
because they're actually bundled. Cleave.js and TanStack Table are real npm dependencies,
since they need to hook into React render/event cycles rather than run as passive globals.

## Data model (`api/db/schema.ts`)

- **`districts`** — one row per district (75 total, seeded from `api/drizzle/seed.sql`):
  `id`, `district_name`, `lock_status` (0/1), `unlocked_at`, `unlock_reason`, `unlocked_by`
  (most recent unlock event only — full history is in `audit_log`).
- **`users`** — DEOs and Admins: `id`, `role` (`deo`/`admin`), `email`, `cug_hash` (SHA-256 of a
  10-digit CUG mobile number), `district_id`, `locked_at`, `submitted_by_name`, `created_at`.
- **`magic_link_tokens`** — Admin login tokens: `id`, `user_id`, `token`, `expires_at`,
  `used_at`. Never leaves the API — not cached client-side, not part of the SQL backup export.
- **`pac_data`** — one row per `(district_id, financial_year)`, unique-indexed. Six DEO-entered
  fields per year, in this order (numbered 2–5 to match the government form; Opening Balance is
  "1.", computed, and always shown first):

  | Field             | Hindi label                                                                 | Type    |
  | ----------------- | ---------------------------------------------------------------------------- | ------- |
  | `grossArrears`    | 2. सकल बकाया धनराशि — Gross Arrears                                          | money   |
  | `rcCount`         | 3. (i) जारी आर.सी. (R.C.) की संख्या — No. of RCs Issued                      | integer |
  | `rcAmount`        | 3. (ii) आर.सी. में निहित धनराशि                                              | money   |
  | `recoveredAmount` | 4. वसूल की गयी धनराशि                                                       | money   |
  | `stayCount`       | 5. (i) स्थगन आदेशों की संख्या — No. of Stay Orders                           | integer |
  | `stayAmount`      | 5. (ii) सक्षम न्यायालय द्वारा स्थगित धनराशि                                  | money   |

  Plus `rc_details` — a JSON-stringified array of `{ rcNumber, rcAmount, stayed }`, the per-RC
  breakdown behind `rcCount`/`rcAmount` above (row count must equal `rcCount`, entries must sum
  to `rcAmount` — see `api/lib/rc-details.ts`'s `validateRcDetails()`). Independent of
  `recoveredAmount`/`stayAmount`/the computed columns below — an RC informs a defaulter what
  they owe, for any amount, regardless of what's actually recovered; `stayed` (a court staying
  this specific RC) is a different concept from the aggregate Stay Count/Stay Amount fields (a
  court staying recovery of an amount). Two computed columns, `opening_balance` and
  `net_recoverable` (see "Net Recoverable" below), and `submitted_by_name`/`locked_at`,
  duplicated from `users` onto the row itself so Admin views can show "locked by X on Y" without
  a join. `financial_year` is one of `"2021-22" .. "2025-26"` (`FINANCIAL_YEARS`). Standard `id`
  primary key and a `created_at` (row-insert timestamp, not shown in any UI — distinct from
  `locked_at`) round out the table.
- **`audit_log`** — one row per login/logout, district lock/unlock, DEO-provisioning batch, or
  unlock-request event: `id`, `event_type`, `actor_role`, `actor_email`, `district_name`,
  `metadata` (JSON string), `created_at`. Pruned to the last 30 days on read.
- **`unlock_requests`** — a locked-out DEO's self-service request to be unlocked: `id`,
  `district_id`, `reason` (plaintext, no attachment), `status`
  (`pending`/`approved`/`denied`), `requested_at`, `resolved_at`/`resolved_by`/`admin_note`. An
  Admin resolving "approve" flips `districts.lock_status` the same way the existing manual
  Unlock button does; both approve and deny require the Admin to type their own note. See
  [CLAUDE.md](./CLAUDE.md)'s "DEO self-service unlock requests" section.
- **`login_attempts`** — per-IP brute-force counter for `POST /api/auth/verify-cug`: `ip_hash`
  (SHA-256 of `CF-Connecting-IP`, primary key — one row per IP, not per attempt),
  `window_start`, `count`. See [SECURITY.md](./SECURITY.md)'s H-01.

### Migrations (`api/drizzle/`)

| Migration | Adds |
| --- | --- |
| `0000_cynical_black_bird` | Initial schema: `districts`, `users`, `magic_link_tokens`, `pac_data` |
| `0001_nostalgic_stature` | `pac_data.submitted_by_name` |
| `0002_jittery_viper` | `pac_data.locked_at` |
| `0003_overjoyed_malcolm_colcord` | `districts.unlocked_at` / `unlock_reason` / `unlocked_by` |
| `0004_white_songbird` | `audit_log` table |
| `0005_married_landau` | `pac_data.opening_balance` / `net_recoverable` |
| `0006_numerous_marten_broadcloak` | `pac_data.rc_details` |
| `0007_woozy_maelstrom` | `unlock_requests` table |
| `0008_unknown_mentor` | `users.name` / `designation` |
| `0009_volatile_blink` | `audit_log.actor_name` / `actor_designation` |
| `0010_mixed_ultron` | Drops `unlock_requests.attachment_key` / `attachment_filename` (PDF attachment feature removed — reason-only requests, permanently) |
| `0011_right_thunderball` | `login_attempts` table (per-IP CUG brute-force counter, see SECURITY.md) |

### Net Recoverable (cumulative running balance)

`net_recoverable` is not an isolated per-year figure — each FY's value carries forward as the
next FY's `opening_balance`. For FY 2021-22, `opening_balance = 0` and `net_recoverable =
max(0, grossArrears - recoveredAmount - stayAmount)`. For every later FY, `opening_balance` =
the previous FY's `net_recoverable`, and `net_recoverable = max(0, opening_balance +
grossArrears - recoveredAmount - stayAmount)`. Both values are computed server-side at submit
time (`api/lib/net-recoverable.ts`'s `computeNetRecoverableSeries()`, mirrored in
`frontend/lib/pac-fields.ts`) and persisted — never recomputed from raw fields on read, except
for a DEO's own not-yet-submitted draft.

## App flow

### Auth

- **DEO (CUG)**: frontend hashes a 10-digit mobile number client-side (Web Crypto), server
  matches it against `users.cug_hash` — the raw number is never sent, except during bulk
  provisioning (see below). Session: an `HttpOnly` cookie, `__deo_session`.
- **Admin (magic link)**: Admin requests a link by email, clicks through a 15-minute token,
  server verifies and issues a session. Session: an `HttpOnly` cookie, `__admin_session`. The two
  cookies are independent, so a DEO and an Admin session can coexist in the same browser.
- Both are 7-day JWTs, set on the verify response as `HttpOnly; Secure; SameSite=Lax` cookies —
  the browser attaches them automatically on every subsequent same-origin request, no
  `Authorization` header needed. This app briefly ran a Bearer-token-in-localStorage design
  instead (Milestone 21) back when frontend and API were cross-origin (different public-suffix
  domains) in production, since a `SameSite=None` cookie there is a third-party cookie that
  Safari ITP blocks outright and that Chrome blocks too under common conditions — that broke
  real logins in production. Once a custom domain (`excisebakaya.exciseup.in`) made both apps a
  true single origin, the design reverted to `HttpOnly` cookies — the more secure option (immune
  to XSS token theft, unlike `localStorage`) — since the cross-origin constraint that justified
  Bearer tokens no longer applies. See [CLAUDE.md](./CLAUDE.md)'s Auth section ("Why cookies
  again") for the full history of both migrations.

### DEO data entry

Five sequential year steps (FY 2021-22 → FY 2025-26) plus a Master View, gated so year `N+1`
unlocks only once year `N` is complete. Every keystroke is saved locally (Dexie, no network
call) until the DEO reviews the Master View and hits **Submit & Lock** — a name-entry
confirmation, then one atomic API call that writes all 5 years, computes Opening
Balance/Net Recoverable, flips `lock_status`, and ends the session.

A returning DEO lands in one of three states, decided by the server's current lock status:

1. **Still locked** — read-only "Data Already Locked" screen, with a **Request Unlock** option
   (plaintext reason + optional PDF letter, `POST /api/deo/request-unlock`) if no request is
   already pending for that district.
2. **Unlocked after a previous submission** — Master View pre-filled with the real submitted
   figures (re-fetched from the API), ready to edit and resubmit.
3. **Unlocked, never submitted** — the ordinary 5-step form, resuming any local draft.

### Admin

Seven pages: **Dashboard** (KPI cards + charts, totals across all 5 years), **Districts**
(sortable/searchable table, lock/unlock, exports), **district detail** (one district's full
5-year figures), **Unlock Requests** (queue of DEO self-service unlock requests, approve/deny
with a required note), **DEO Provisioning** (bulk DEO
login upload/download, reached via the profile menu rather than the main nav), **Admin Users**
(add/edit/remove admin accounts, also profile-menu-only, owner-gated), **Audit Log**
(login/lock/unlock/unlock-request/admin-user history). All seven share one Dexie-backed cache
with a manual Sync button.

### Bulk DEO provisioning

Admin downloads an `.xlsx` template pre-filled with all 75 district names, fills in each
district's CUG mobile number and email, and re-uploads it (at `/admin/districts/provisioning`)
— the one flow where a raw CUG number does cross the network (from the Admin's browser), since
there's no DEO browser involved to hash it first. The server hashes it before storing.

## System flow

Auth (both routes), the DEO's five-year entry-to-lock journey, the self-service unlock-request
loop, and the Admin surface, down to the exact API route and D1 table each step touches.
Snapshot as of this build — regenerate by hand if the flow changes materially.

```mermaid
flowchart TD
    Start(["Visit portal"]) --> Login["/login"]

    Login -->|"CUG Mobile tab"| CugHash["Hash 10-digit CUG number<br/>(Web Crypto, client-side —<br/>raw number never sent)"]
    CugHash --> VerifyCug["POST /api/auth/verify-cug"]

    Login -->|"Email tab"| ReqLink["POST /api/auth/request-magic-link"]
    ReqLink --> EmailSent["Resend sends styled<br/>magic-link email"]
    EmailSent --> VerifyPage["/verify?token=...<br/>(explicit 'Verify &amp; Continue' click)"]
    VerifyPage --> VerifyMagic["POST /api/auth/verify-magic-link"]

    VerifyCug --> Token["{ role, districtId }<br/>+ Set-Cookie: __*_session<br/>(HttpOnly, 7-day JWT)"]
    VerifyMagic --> Token

    Token --> RoleCheck{"role"}
    RoleCheck -->|"deo"| DeoMe["GET /api/auth/me?role=deo<br/>cookie attached automatically"]
    RoleCheck -->|"admin"| AdminMe["GET /api/auth/me?role=admin"]

    subgraph DEO["DEO — /deo-data-entry"]
        direction TD
        DeoMe --> LockCheck{"lockStatus"}
        LockCheck -->|"locked"| LockedScreen["Data Already Locked<br/>(read-only)"]
        LockedScreen --> PendingCheck{"pendingUnlockRequest?"}
        PendingCheck -->|"yes"| PendingShown["Request pending since …<br/>(no resubmit until resolved)"]
        PendingCheck -->|"no"| RequestForm["Request Unlock form<br/>reason + optional PDF<br/>(magic-byte/size re-checked server-side)"]
        RequestForm --> RequestApi["POST /api/deo/request-unlock"]
        LockCheck -->|"unlocked, previously submitted"| FetchMine["GET /api/pac-data/mine"]
        FetchMine --> MasterViewPre["Master View<br/>(prefilled from D1)"]
        LockCheck -->|"unlocked, never submitted"| DraftResume["Resume local draft<br/>(Dexie draftYears)"]
        DraftResume --> YearSteps["FY 2021-22 → FY 2025-26<br/>YearStepForm · Save &amp; Continue<br/>(Anti-Blank, count/amount, cap, RC Details checks)"]
        YearSteps --> MasterView["Master View<br/>review all 5 years"]
        MasterViewPre --> MasterView
        MasterView --> Confirm1["confirmFinalSubmit()"]
        Confirm1 --> Confirm2["promptDeoNameAndLock()"]
        Confirm2 --> SubmitApi["POST /api/pac-data/submit"]
        SubmitApi --> LockedNow["Atomic: delete + insert 5 years,<br/>compute Opening Balance /<br/>Net Recoverable, lock_status = 1,<br/>clear last-role hint client-side"]
        LockedNow --> BackToLogin(["Redirect to /login"])
    end

    subgraph ADMIN["Admin"]
        direction TD
        AdminMe --> Dashboard["/admin — Dashboard<br/>KPI cards + charts<br/>(summed across all 5 FYs)"]
        Dashboard --> Districts["/admin/districts<br/>sortable table · FY filter ·<br/>lock-status filter"]
        Districts --> Detail["/admin/districts/detail<br/>field × year table, one district"]
        Districts --> UnlockAction["Unlock (reason required)<br/>POST /api/admin/unlock"]
        Districts --> ExportAction["Export Excel Workbook /<br/>Export SQL backup"]
        Dashboard --> UnlockQueue["/admin/unlock-requests<br/>GET /api/admin/unlock-requests"]
        UnlockQueue --> ResolveAction["Approve / Deny<br/>(note always required)<br/>POST .../resolve"]
        Dashboard --> AuditPage["/admin/audit<br/>login / lock / unlock /<br/>unlock-request history"]
        Dashboard -. "available on every admin page header" .-> ProfileMenu["Profile menu (Admin)"]
        ProfileMenu --> Provision["/admin/districts/provisioning<br/>Download Template /<br/>Upload DEO Data<br/>POST /api/admin/provision-deos"]
    end

    LockedNow -. "district_locked" .-> AuditLog[("audit_log")]
    UnlockAction -. "district_unlocked" .-> AuditLog
    VerifyCug -. "login_cug" .-> AuditLog
    VerifyMagic -. "login_magic_link" .-> AuditLog
    RequestApi -. "unlock_requested" .-> AuditLog
    ResolveAction -. "unlock_request_approved /<br/>unlock_request_denied" .-> AuditLog

    SubmitApi -. writes .-> PacData[("pac_data")]
    Detail -. reads .-> PacData
    Districts -. reads .-> PacData
    ExportAction -. reads .-> PacData
    Provision -. writes .-> Users[("users")]
    UnlockAction -. writes .-> DistrictsTbl[("districts")]
    Districts -. reads .-> DistrictsTbl
    RequestApi -. writes .-> UnlockReqTbl[("unlock_requests")]
    UnlockQueue -. reads .-> UnlockReqTbl
    ResolveAction -. writes .-> UnlockReqTbl
    ResolveAction -. "approve only" .-> DistrictsTbl
```

## Getting started

```bash
# Frontend
cd frontend
pnpm install
pnpm run dev          # http://localhost:3000

# API
cd api
pnpm install
cp .dev.vars.example .dev.vars   # fill in JWT_SECRET, RESEND_API_KEY, FRONTEND_URL
pnpm run db:generate               # regenerate drizzle/*.sql after schema.ts changes
pnpm run db:migrate:local          # apply migrations to the local D1 (miniflare) instance
pnpm run db:seed:local             # seed the 75 UP districts + bootstrap admin
pnpm run dev                       # http://localhost:8787 (default Next dev port; adjust as needed)
```

## Deploying

Live at `https://excisebakaya.exciseup.in` (custom domain, both apps). The API's old
`*.workers.dev` URL is retired; the frontend's `*.pages.dev` URL stays live as an unavoidable
Cloudflare Pages platform constraint (see DEPLOY.md). Full deploy/redeploy commands,
required secrets, and the OpenNext/Next-16-middleware gotcha that blocks a naive deploy
are in [DEPLOY.md](./DEPLOY.md).

## Documentation

- [CLAUDE.md](./CLAUDE.md) — data model, auth flows, validation rules, and conventions for AI agents working in this repo.
- [DEPLOY.md](./DEPLOY.md) — production deployment state, secrets, and redeploy commands.
- [TESTING.md](./TESTING.md) — Playwright e2e suite (real Chrome, against live production), manual demo script, and incident notes.
- [ROADMAP.md](./ROADMAP.md) — milestones and progress tracking.
- [SECURITY.md](./SECURITY.md) — security audit findings, fixes applied, and open items.
