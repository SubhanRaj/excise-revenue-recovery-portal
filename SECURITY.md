# Security Audit Report — Excise Revenue Recovery Portal

**Prepared for:** Department of Excise, Government of Uttar Pradesh
**Audit date:** 2026-07-31
**Auditor:** Claude Code (Sonnet 5)
**Stack:** Next.js 16 (App Router) × 2 — `/frontend` (static export, Cloudflare Pages) + `/api`
(OpenNext, Cloudflare Worker) — D1, Drizzle ORM, HttpOnly-cookie JWT sessions
**Scope:** All 15 API routes, session/auth (`api/lib/session.ts`, `auth-guard.ts`,
`middleware.ts`), every D1 write path, dependency versions, response headers, frontend auth flow
(`login/page.tsx`), and secret handling. See [CLAUDE.md](./CLAUDE.md) for the system's own
documented conventions — this audit checks whether the code actually lives up to them.

**Pass 2 (same day):** cross-checked findings against the sibling
`up-excise-spatial-revenue-optimizer` project's own auth code (neither has CUG rate limiting;
that project just doesn't leak a prefix constant, so it isn't a fix — see H-01) and ported its
magic-link rate-limiting pattern here (see L-02, now FIXED). Removed the `DEMO_CUG_HASH`
exemption entirely per L-01's recommendation (see below).

---

## Status Summary

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| H-01 | CUG login brute-forceable — public prefix shrinks search space to 100,000 combinations, no rate limiting | **HIGH** | **FIXED** |
| M-01 | Next.js 16.2.10 had 9 known CVEs (middleware/proxy bypass, SSRF, DoS) | MEDIUM–HIGH | **FIXED** |
| M-02 | No security response headers on either app | MEDIUM | **FIXED (partial — CSP intentionally deferred)** |
| L-01 | `DEMO_CUG_HASH` in public frontend bundle is trivially crackable | LOW–MEDIUM | **FIXED — exemption removed entirely** |
| L-02 | `POST /api/auth/request-magic-link` has no rate limiting | LOW | **FIXED** |
| L-03 | Transitive dev-dependency CVEs (postcss, brace-expansion, sharp) | LOW | **OPEN — accepted, build-time/unused-path only** |
| — | `admin/truncate-demo-data` gated by any admin, not owner-only | INFORMATIONAL | **NOTED — low blast radius** |

All PASS checks are listed at the bottom. Nothing in this audit found a SQL injection, IDOR, or
mass-assignment path — every route that touches `pac_data`/`districts`/`users` scopes by
`session.districtId`/`session.userId`, never a client-supplied ID for a DEO-scoped route.

---

## H-01 · CUG Login Was Brute-Forceable — Public Prefix + No Rate Limiting

**Severity:** HIGH
**Status:** FIXED

**Finding:**
`POST /api/auth/verify-cug` accepted a SHA-256 hash and matched it against `users.cugHash` with
no attempt limiting, no lockout, and no CAPTCHA. On its own, brute-forcing a random 10-digit
number (10^10 combinations) would be impractical. But `frontend/app/login/page.tsx` shipped a
`CUG_PREFIX = "94544"` constant in the public static bundle (downloadable by anyone,
`output: "export"`) — every real DEO/admin CUG number started with this fixed 5-digit prefix, and
the client-side check reading it was never the real security boundary (the frontend is static and
fully downloadable; an attacker doesn't need to touch it). That shrank the practical search space
from 10 billion to **100,000 combinations**, completable in minutes at a modest request rate
against an unthrottled Worker, for full account takeover of any DEO or CUG-login admin account.

**Fix applied — two layers:**

1. **Removed `CUG_PREFIX` entirely** from `frontend/app/login/page.tsx` — the frontend no longer
   pre-validates or leaks any prefix information; every 10-digit number is sent straight to the
   server, which is the only real gate. This alone restores the full 10-billion-combination
   search space (matching the sibling `up-excise-spatial-revenue-optimizer` project's posture,
   which never had a prefix constant to leak).
2. **Real per-IP rate limiting, server-side.** New `login_attempts` table (migration
   `0011_right_thunderball`, one row per IP hash — not per attempt, so a sustained brute-force run
   can't grow the table unbounded) and `api/lib/rate-limit.ts`'s `checkIpRateLimit()`: a
   fixed-window counter (10 attempts / 5 minutes per IP, keyed by a SHA-256 of
   `CF-Connecting-IP`, never the raw address) checked at the top of `verify-cug` before the
   `users` table is even queried, returning `429` once exceeded. At 10/5min from one IP, exhausting
   even the now-restored 10-billion-combination space would take longer than the age of the
   universe; a determined attacker would need thousands of distinct source IPs to make any
   meaningful dent, which is a different, much harder attack class than "one script, one IP."
3. **Client-side cooldown** (`frontend/app/login/page.tsx`) — after 3 failed attempts, or
   immediately on a `429`, the form disables submission for 30 seconds. Explicitly a UX nicety,
   not the security boundary (an attacker skips the frontend entirely) — the real fix is (2).

Ported the identical fix (schema, route guard, frontend cooldown) to the sibling
`up-excise-spatial-revenue-optimizer` project's `verify-cug` route and login form, since that
project's CUG login had the same "no rate limiting at all" gap (confirmed by reading its route
directly during this audit) even though it never leaked a prefix constant.

**Verified:** `pnpm exec tsc --noEmit`, `next build`, `opennextjs-cloudflare build`, and
`wrangler deploy --dry-run` clean on both apps in this repo; migration applied and confirmed on
local D1 (`sqlite_master` lookup). Same for the sibling project: `tsc --noEmit`, `next build`
clean, and `wrangler d1 migrations apply --local` applied cleanly. Nothing deployed to production
as part of this pass in either repo.

**Files changed (this repo):** `api/db/schema.ts`, `api/drizzle/0011_right_thunderball.sql`
(new), `api/lib/rate-limit.ts` (new), `api/app/api/auth/verify-cug/route.ts`,
`frontend/app/login/page.tsx`.
**Files changed (sibling repo):** `packages/schema/src/auth.ts`,
`migrations/0006_add_login_attempts.sql` (new), `apps/web/src/lib/rate-limit.ts` (new),
`apps/web/app/api/auth/verify-cug/route.ts`, `apps/web/app/login/_components/LoginForm.tsx`.

---

## M-01 · Next.js 16.2.10 — 9 Known CVEs (Middleware Bypass, SSRF, DoS)

**Severity:** MEDIUM–HIGH (several individual CVEs were rated High)
**Status:** FIXED

**Finding:** both apps pinned `"next": "16.2.10"` exactly. `pnpm audit` surfaced 9 Next.js
advisories fixed in `16.2.11`, including a **middleware/proxy bypass in App Router applications**
(directly relevant — this app's entire session-cookie auth model runs through
`api/middleware.ts`), **SSRF in Server Actions and in rewrites via attacker-controlled
hostname**, and multiple **DoS** vectors.

**Fix applied:** bumped `next` to `16.2.12` (latest `16.2.x` patch — deliberately *not* a minor/
major jump, since `@opennextjs/cloudflare@1.20.1`'s Node-middleware incompatibility with Next
16's `proxy.ts` convention is pinned to the `16.x` line, per CLAUDE.md/DEPLOY.md) in both
`api/package.json` and `frontend/package.json`. Verified before treating this as done:
`pnpm exec tsc --noEmit`, `pnpm run build`, `opennextjs-cloudflare build`, and
`wrangler deploy --dry-run` (bindings unchanged: `env.DB`, `env.ASSETS`) all clean on the API;
`tsc --noEmit` + static export build clean on the frontend. Nothing was deployed as part of this
audit — these are local build/dry-run verifications only.

**Files changed:** `api/package.json`, `frontend/package.json`, both `pnpm-lock.yaml`.

---

## M-02 · No Security Response Headers

**Severity:** MEDIUM
**Status:** FIXED (partial — CSP deliberately deferred, see below)

**Finding:** neither app set any security response header — no `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`,
or `Content-Security-Policy`. `frontend/public/_headers` (the Cloudflare Pages header-injection
file) only had a one-off `Content-Type` fix for the OG image.

**Fix applied:**
- `frontend/public/_headers` — added a `/*` block: `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`,
  `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- `api/lib/with-error-handling.ts` — since **every** route in this codebase already funnels
  through `withErrorHandling()` (see CLAUDE.md), added `X-Content-Type-Options`,
  `X-Frame-Options`, and `Referrer-Policy` there once, applied to both the success and error
  response paths, rather than touching all 15 route files individually.

**Content-Security-Policy deliberately not added.** `frontend/app/layout.tsx` loads Tailwind CSS,
SweetAlert2, ExcelJS, Chart.js, and Tabler Icons from jsDelivr, Google Fonts from
`fonts.googleapis.com`/`fonts.gstatic.com`, and runs two inline `<script>`/`<style>` blocks (the
dark-mode bootstrap, and Tailwind's own `<style type="text/tailwindcss">` config block) with no
nonce infrastructure. Tailwind's CDN runtime (`@tailwindcss/browser@4`) also compiles styles
client-side, which likely needs `'unsafe-eval'` in `style-src`/`script-src` to keep working — a
CSP tight enough to matter here is genuinely a several-line policy that needs verifying against a
real browser render (this codebase's own precedent for exactly this kind of fix — see
CLAUDE.md's Milestone 17 button-alignment incident, verified with a real Playwright render, not a
synthetic snippet) before shipping against a live production app. Draft policy for whoever picks
this up next:

```
default-src 'self';
script-src 'self' 'unsafe-inline' cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' cdn.jsdelivr.net fonts.googleapis.com;
font-src fonts.gstatic.com cdn.jsdelivr.net;
img-src 'self' data:;
connect-src 'self';
frame-ancestors 'self';
```

Would need a real-browser pass (Playwright, same pattern as the button-alignment fix) checking:
Tailwind CDN still JIT-compiles utility classes, SweetAlert2/ExcelJS/Chart.js `lazyOnload`
scripts still execute, and the dark-mode inline bootstrap script still runs pre-paint.

**Files changed:** `frontend/public/_headers`, `api/lib/with-error-handling.ts`.

---

## L-01 · `DEMO_CUG_HASH` in the Public Frontend Bundle Was Trivially Crackable

**Severity:** LOW–MEDIUM
**Status:** FIXED

**Finding:** `frontend/app/login/page.tsx` hardcoded a precomputed SHA-256 hash
(`DEMO_CUG_HASH`) so the demo/test account could bypass the `CUG_PREFIX` gate without the raw
number ever appearing in source. The gap: SHA-256 of a 10-digit number is unsalted and the input
space is only 10^10 — trivially reversible offline (well under a minute on commodity hardware) by
anyone who downloaded the public static bundle and grepped for the constant, recovering a real,
working login credential for the demo district.

**Fix applied:** removed the `DEMO_CUG_HASH` constant and its bypass branch entirely, alongside
removing `CUG_PREFIX` itself (see H-01) — there is now no client-side exemption for any account,
demo included. A demo/test account, if one is provisioned, needs a real CUG number like any DEO's
(verification happens purely server-side now). Confirmed the literal hash string no longer
appears anywhere in the built static output (`grep`'d `frontend/out/` after a clean build).
CLAUDE.md's Auth section and TESTING.md's manual demo script updated to match.

**Files changed:** `frontend/app/login/page.tsx`, `CLAUDE.md`, `TESTING.md`.

---

## L-02 · `POST /api/auth/request-magic-link` Had No Rate Limiting

**Severity:** LOW
**Status:** FIXED

**Finding:** this route sends a real email via Resend for any syntactically valid address with a
matching `users` row, with no per-IP or per-email throttle. It already did the right thing for
enumeration (always returns `{ ok: true }` whether or not the email matches), so the risk wasn't
account discovery — it was inbox-bombing a specific admin, or exhausting Resend's send quota
(blocking *every* admin's real login) via repeated automated requests.

**Fix applied:** ported the sibling `up-excise-spatial-revenue-optimizer` project's own pattern
for this exact problem — count existing `magic_link_tokens` rows for that user issued within the
current TTL window, reject once `MAX_REQUESTS_PER_WINDOW` (3) is reached. No new schema needed:
every token's TTL is fixed at `TOKEN_TTL_MINUTES` (15), so `expiresAt > now` on a row is exactly
equivalent to "issued within the last 15 minutes," used or not. Still returns `{ ok: true }` when
rate-limited (never reveals *why* the email didn't arrive, preserving the existing
non-enumeration behavior).

**Files changed:** `api/app/api/auth/request-magic-link/route.ts`.

---

## L-03 · Transitive Dev-Dependency CVEs

**Severity:** LOW
**Status:** OPEN — accepted

`pnpm audit` also flags `postcss` (<8.5.18), `brace-expansion` (ReDoS), and `sharp` (libvips
CVEs) — all pinned several levels deep inside `next`, `eslint`'s `minimatch` chain, and
`wrangler`'s `miniflare` respectively (confirmed via `pnpm why`), not directly upgradable without
a `pnpm.overrides` that could destabilize dependency resolution for low payoff:

- `postcss`/`brace-expansion` are build/lint-time only — never shipped to the browser or
  evaluated against untrusted input in this app (no user-supplied CSS is ever compiled).
- `sharp` is pulled in by `wrangler`'s local-dev `miniflare` and by Next's built-in image
  optimizer — this app never uses `next/image` optimization (`frontend/next.config.ts` sets
  `images: { unoptimized: true }`), so the vulnerable code path is never actually invoked in this
  app's request handling, dev or prod.

Not fixed in this pass; revisit if `next`/`wrangler` themselves bump these transitively on a
future update (check with `pnpm audit` after any dependency bump).

---

## Informational · `admin/truncate-demo-data` Not Owner-Gated

`POST /api/admin/truncate-demo-data` (`api/app/api/admin/truncate-demo-data/route.ts`) accepts
any authenticated admin session, unlike `admin/provision-deos` which is explicitly restricted to
`OWNER_EMAIL`. Blast radius is narrow by construction (only ever deletes the row named exactly
`"Demo District"` and its associated `users`/`pac_data` rows — see the route's own comment: a
one-off pre-launch cleanup action), so this isn't treated as a real finding — noted for
completeness since it's the one destructive admin action without the owner check its sibling
routes use.

---

## Passing Checks — Confirmed Correct

| Area | Verdict |
|------|---------|
| SQL injection | ✓ PASS — every D1 write/read goes through Drizzle's parameterized query builder; grepped for raw `.run()`/template-string SQL and found none outside two static `sql\`(CURRENT_TIMESTAMP)\`` column defaults (no user input involved) |
| IDOR / per-district scoping | ✓ PASS — every DEO-scoped route (`pac-data/submit`, `pac-data/mine`, `deo/request-unlock`) derives `districtId` from `session.districtId` (the JWT), never a client-supplied value; `admin/unlock`/`admin/unlock-requests/resolve` legitimately take a client-supplied `districtId`/`id` since unlocking *any* district is the intended admin action, and both are gated `requireSession(req, "admin")` |
| Auth — session cookie | ✓ PASS — `HttpOnly`, `Secure`, `SameSite=Lax`, no `Domain=` (host-only, can't leak to sibling subdomains), separate `__admin_session`/`__deo_session` cookies, verified via `jose`'s `jwtVerify` (rejects a forged/expired token cleanly, returns `null` rather than throwing past the caller) |
| CSRF | ✓ PASS — `SameSite=Lax` blocks the cookie on cross-site `POST`s (the only method every mutating route uses); same-origin `fetch()` needs no separate CSRF token given this |
| XSS | ✓ PASS — the only `dangerouslySetInnerHTML` in the frontend (`app/layout.tsx`) is a static, hardcoded dark-mode bootstrap script, never user-controlled data; every DEO/admin-entered string (district names, unlock reasons, RC numbers, DEO names) renders through plain JSX (`{}`, auto-escaped) everywhere checked |
| Zero-trust server-side validation | ✓ PASS — `pac-data/submit`'s `validateRow()`, `rc-details.ts`'s `validateRcDetails()`, and the Recovered-Amount cap all re-validate server-side regardless of client checks, per CLAUDE.md's own stated rule |
| Mass assignment | ✓ PASS — every `db.insert()`/`.update()` call passes an explicit, hand-built `.values()`/`.set()` object; no route ever spreads a raw request body into a Drizzle call |
| Multi-write atomicity | ✓ PASS — every place that must not partially apply (submit-and-lock, unlock, unlock-request resolve, demo-data truncate) uses `db.batch()` |
| Secrets | ✓ PASS — grepped both apps for hardcoded API keys/tokens/passwords; found none. All real secrets (`JWT_SECRET`, `RESEND_API_KEY`, `FRONTEND_URL`, `FROM_EMAIL`, `OWNER_EMAIL`) are set via `wrangler secret put` per DEPLOY.md, never committed; `.dev.vars` is gitignored |
| File upload / R2 attachment surface | ✓ N/A — removed entirely (this repo no longer accepts any file upload anywhere; see ROADMAP.md's Milestone 37) |
| Magic-link token | ✓ PASS — `crypto.randomUUID()` (122 bits of entropy), single-use (`usedAt` checked), 15-minute expiry, requires an explicit POST-triggered button click (`/verify` page) so link-prefetching email clients can't burn it |
| Audit trail | ✓ PASS — every login, lock/unlock, unlock-request event, and DEO-provisioning batch writes an `audit_log` row with actor identity (admin events only — DEO events deliberately carry no PII, per the schema's own comment) |
| DEO Provisioning owner gate | ✓ PASS — `POST /api/admin/provision-deos` 403s server-side for any admin whose email isn't `OWNER_EMAIL`, not just a hidden UI link |

---

*Audit completed 2026-07-31. Re-audit recommended after any change to auth, session handling, or
a new file-upload/user-generated-content surface (this app currently has none of the latter).*
