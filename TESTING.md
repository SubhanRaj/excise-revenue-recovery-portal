# Testing

## End-to-end (Playwright, real Chrome)

`frontend/e2e/login.spec.ts` drives the actual installed Chrome browser (not Playwright's
bundled Chromium) against the **live production deployment** by default — not a local dev
server. This is deliberate: the bug this suite exists to catch (cross-origin cookies
between Pages and the Worker) only reproduces against the real deployed origins, not
`localhost`.

```bash
cd frontend
npm run e2e                    # headless, against production
HEADED=1 npm run e2e           # watch it run in a real window (needs a display)
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:8787 npm run e2e   # local
```

Config: `frontend/playwright.config.ts`. Runs headless by default because this repo is
often driven from a sandboxed/non-interactive environment with no window server — set
`HEADED=1` locally if you want to watch the browser.

### What's covered

1. **Login page renders correctly** — CUG tab is the default, the mobile number field is
   visible and editable. This is a direct regression test for a real incident: the
   Tailwind CDN script was loaded via `next/script`'s `beforeInteractive` strategy, which
   injects it through a JS runtime hook instead of blocking HTML parsing, so the static
   page could paint fully unstyled — the CUG field was technically present but invisible.
   Fixed by loading Tailwind's CDN script as a plain blocking `<script>` tag (see
   `frontend/app/layout.tsx` and CLAUDE.md).
2. **Inline validation, no popup** — a malformed mobile number shows an inline `Banner`
   error and asserts zero `.swal2-popup` elements exist. Regression guard for the
   SweetAlert-popups-for-everything pattern that was intentionally removed (SweetAlert2 is
   now reserved for exactly one confirm dialog — see CLAUDE.md's UI conventions).
3. **Magic-link request → inline success card** — submitting the admin email tab shows
   "Check your email" inline instead of a popup.
4. **Full magic-link round trip against live D1** — the important one. It POSTs
   `/api/auth/request-magic-link` for the real superadmin, reads the freshly issued token
   straight out of production D1 (`wrangler d1 execute --remote`, read-only `SELECT`), then
   drives the browser through `/verify?token=...` → click "Verify & Continue" → asserts
   the browser actually lands on `/admin` (not bounced back to `/login`) and that the
   `__session` cookie is present. This test exists because that exact bounce-with-no-error
   was reported as a live bug — see "Incidents" below for what it actually was.

### Why this needs `api/` sibling access

The token-lookup helper in `login.spec.ts` shells out to `wrangler d1 execute` from
`../api` (this repo's `api/` project, which owns the D1 binding). If you're running the
suite from a checkout where `frontend/` and `api/` aren't siblings in the same repo, adjust
`API_DIR` in `e2e/login.spec.ts`.

### Adding new e2e coverage

Only add a Playwright test for something that broke in production and needs a regression
guard, or a flow genuinely risky enough to warrant automated verification (auth, money
calculations, the lock/unlock flow). Don't write a full e2e suite for every page — that's
what `npx tsc --noEmit` and manual review are for on routine UI changes.

## Manual demo script (DEO + Admin, using the superadmin account)

There's exactly one seeded account right now: `shubhanraj2002@gmail.com` (role `admin`,
signs in via Magic Link — see DEPLOY.md). To demo the full DEO flow you need a second,
DEO-role account, since none is seeded by default (DEO provisioning is a manual DB
operation — see CLAUDE.md's "Known gaps"). To add a disposable one:

```bash
MOBILE="9999999999"
HASH=$(printf '%s' "$MOBILE" | shasum -a 256 | cut -d' ' -f1)
cd api
npx wrangler d1 execute excise-revenue-recovery-db --remote --command \
  "INSERT INTO users (role, cug_hash, district_id) VALUES ('deo', '$HASH', (SELECT id FROM districts WHERE district_name = 'Lucknow'));"
```

Then:

1. **Admin**: `/login` → Email tab → `shubhanraj2002@gmail.com` → check inbox for the
   styled login-link email (`api/lib/email.ts`) → Verify & Continue → `/admin` shows all
   75 districts. Try Sync, switching financial years, Export to Excel.
2. **DEO**: `/login` → CUG tab → `9999999999` → lands on `/entry`. Walk Year 1 → 5: leave
   a field blank and hit "Save & Continue" (inline anti-blank Banner, no popup), make
   Recovered Amount ≠ RC Amount (inline parity Banner, button disabled), watch Net
   Recoverable update live. On Year 5, reach Master View, type a name, hit "Final Submit &
   Lock" — this is the one remaining SweetAlert2 confirm dialog (intentional: it's the only
   irreversible action in the app). Confirms → locks the district, kills the DEO session,
   redirects to `/login`.
3. **Back to Admin** → Sync → the district now shows "Locked" with real numbers → "Unlock"
   reverses it for retesting.

Reset for another pass:

```bash
npx wrangler d1 execute excise-revenue-recovery-db --remote --command \
  "UPDATE districts SET lock_status = 0 WHERE district_name = 'Lucknow'; \
   DELETE FROM pac_data WHERE district_id = (SELECT id FROM districts WHERE district_name = 'Lucknow');"
```

## Incidents (what actually broke, for future reference)

**2026-07-03/04 — production repeatedly reverted to a "Node.JS Compatibility Error"
(`no nodejs_compat compatibility flag set`) minutes after every manual redeploy, and a
magic-link verify would silently bounce back to `/login` with no error shown.**

First diagnosis (wrong, but left in git history — see below for the real one): initially
attributed to stale Cloudflare edge cache from earlier `--branch main` vs `master` deploy
flakiness. A clean `wrangler pages deploy` made `curl` return 200 immediately each time —
but the error kept coming back a short while later, which the edge-cache theory didn't
actually explain.

**Real root cause**, found by querying the Cloudflare API directly for the Pages project's
config (`GET /accounts/:id/pages/projects/excise-revenue-recovery-portal`): the project had
a **GitHub Git integration connected** (`source.type: "github"`, set up in an earlier,
interrupted session before this one — never mentioned or intentionally configured in this
session's work). Its `build_config` was `build_command: "npx @cloudflare/next-on-pages@1"`,
`destination_dir: ".vercel/output/static"` — a completely different, Vercel-community Next
adapter that this app has never used (this app is `output: "export"`, deployed via plain
`wrangler pages deploy` of the static `out/` directory) — with `compatibility_flags: []`.
Every `git push` silently triggered Cloudflare's own auto-build with that broken config,
which raced and overwrote each manual `wrangler pages deploy`, producing exactly this error
a few minutes after every fix looked confirmed.

Fix: disconnected the GitHub repo from the Pages project in the Cloudflare dashboard
(no more competing auto-build), and replaced it with the two GitHub Actions workflows in
`.github/workflows/` (`ci.yml`, `deploy.yml`) that run the *correct* build/deploy commands
this repo actually uses. Verified with `gh workflow run deploy.yml -f target=both` end to
end, plus repeated `curl` checks staying at 200 afterward (no more reverting).

**Lesson for next time a Cloudflare deployment looks fixed but un-fixes itself:** check for
a competing deploy path before re-diagnosing the app. `GET .../pages/projects/<name>`
(`source`/`build_config` fields) for Pages Git integration, or a Worker's
`.../workers/scripts/<name>/settings` `annotations["workers/triggered_by"]` (should say
`version_upload` for a CLI/Action deploy, not something implying a separate build service)
for Workers Builds.
