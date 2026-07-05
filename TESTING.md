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
   `__admin_session` cookie is present. This test exists because that exact bounce-with-no-error
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
DEO-role account, since none is seeded by default. As of the bulk-provisioning feature (see
CLAUDE.md's "Bulk DEO provisioning" section) this is done through the Admin dashboard, not a
manual DB insert:

1. Sign in as Admin, click **Download DEO Template**, open the `.xlsx` — column A has all 75
   district names pre-filled.
2. Fill in the demo CUG (see the `DEMO_CUG` Worker secret, not written here) in the "DEO CUG
   Mobile" column for `Lucknow`, save, and **Upload DEO Data** the same file back. A toast
   confirms `1 added, 0 updated`.
3. (Manual DB insert is still available as a fallback — same `INSERT INTO users (role,
   cug_hash, district_id) VALUES ('deo', '<sha256 of the demo CUG>', (SELECT id FROM
   districts WHERE district_name = 'Lucknow'));` as before — but the template round trip
   above is now the intended path and exercises the feature.)

Then:

1. **Admin**: `/login` → Email tab → `shubhanraj2002@gmail.com` → check inbox for the
   styled login-link email (`api/lib/email.ts`) → Verify & Continue → `/admin` shows the
   Dashboard — colored, clickable KPI cards (click Districts/Locked/Unlocked/Gross
   Arrears/Net Recoverable, and a top-5-dues row, to confirm each link goes somewhere useful),
   the locked/unlocked Chart.js donut. Every number here is a total across all 5 FYs (FY
   2021-22 – FY 2025-26), not filtered by year — there's no year selector on this page. Note
   the "Synced: <IST timestamp>" text next to the Sync button in the header — it should already
   show a time (from the Dexie cache, even before you click Sync on this visit) and update the
   instant you do click Sync.
   Then **Districts** (top nav) for the sortable/searchable table, its own per-year `FY`
   selector, the Locked/Unlocked/All status filter (all now sleek rounded-full pills, matching
   the toolbar buttons beside them), Sync (same "Synced:" indicator here too), **Export as Excel
   Workbook** (button shows "Exporting..." while it re-syncs and builds the file — it should
   never look frozen; check the sheet tabs are named `FY 2021-22` etc, each with a
   title/data-period banner row above the table), and the new **Export as SQL** (same
   "Exporting..." feedback; downloads a `.sql` file — open it and confirm it's plain
   `DELETE`/`INSERT` statements for `districts` and `pac_data` matching `api/db/schema.ts`'s
   column names). On a 22"/24" monitor, confirm the table now uses noticeably more of the
   screen width (less side padding) and the table grows to fill the vertical space instead of
   leaving blank space below it with its own inner scrollbar cutting off early.
   **Audit Log** (top nav): confirm it now has the same header as the other two pages (Sync
   button, "Synced:" timestamp, "Jump to district" search) — this used to be missing here. Use
   the **Filter by event** dropdown to narrow to one event type, and the sort button to flip
   between "Newest first"/"Oldest first"; both should apply instantly with no network request.
2. **DEO**: `/login` → CUG tab → the demo CUG → lands on `/deo-data-entry`. Note the title bar
   above the year pills (RC title + data period, bilingual) and that the pills read `FY
   2021-22` etc, not "Year 1". Since this is a *separate* session cookie from the admin one
   above (see CLAUDE.md's Auth section), the admin tab/session stays logged in the whole time
   — no need to re-request a magic link just to switch back and forth. Walk FY 2021-22 → FY
   2025-26: leave a field blank and hit "Save & Continue" (a corner toast, not a popup or
   banner — bilingual, closeable, doesn't wrap), make Recovered Amount ≠ RC Amount and blur the
   field (bold inline bilingual message under Recovered Amount, "Save & Continue" disabled),
   watch Net Recoverable update live, try "Previous Year" to go back a step, try the per-year
   "Clear" button and the nav bar's "Clear All" (both prompt a confirm first). On FY 2025-26,
   reach Master View (title now shows the district name, English + smaller Hindi line), hit
   the big "Submit & Lock" button — this triggers two SweetAlert2 dialogs: first a "verify the
   data is correct" confirm, then a name-entry prompt with a liability disclaimer (try typing
   digits or "DEO Lucknow" to see the validator reject it). Confirming both locks the district,
   kills the DEO session, redirects to `/login`.
3. **Re-login as the locked DEO**: CUG tab → the demo CUG again → should land on a read-only
   "Data Already Locked" screen (locked timestamp in IST, bilingual contact-Admin message), not
   a blank form — this is the fix for a real bug where a re-login after locking showed an empty
   form. The card should be noticeably wide (not a narrow column forcing the message onto many
   short lines) and the Hindi text should be the same size as the English body text, not smaller
   fine print. Click the card's own **Logout** button — it should log out immediately with no
   confirmation popup (logout is the only thing to do here, unlike the profile menu's Logout
   elsewhere, which does still confirm).
4. **Back to Admin → Districts** → Sync → the district now shows "Locked" with real numbers.
   Click the row to open its detail page (who locked it, when, in IST) → **Back to Districts**
   → **Unlock** now prompts for a reason (blank is rejected) before reversing it — check the
   detail page again to see "Last unlocked by / on / Reason", and check **Audit Log** (top
   nav) to see the lock and unlock events recorded, newest first — try filtering to just
   "District locked"/"District unlocked" with the event dropdown to confirm both show up.
5. **Re-login as the now-unlocked DEO**: CUG tab → the demo CUG → should land on the Master
   View with the previously submitted figures already filled in (re-fetched from D1, not
   blank), not a fresh empty Year 1. Editing and hitting "Submit & Lock" again should succeed
   (the submit route now deletes-then-inserts, so a second submit for the same district doesn't
   fail the unique index).

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

**2026-07-04 — demo CUG login returned "Invalid user"; admin magic-link login redirected
back to `/login` after clicking Verify & Continue.**

Two unrelated causes surfaced together:

- The demo CUG: the manual demo script below had only ever been *documentation* — nobody
  had actually run the `INSERT INTO users` command against remote D1 in this environment,
  so the row genuinely didn't exist. Confirmed via `SELECT * FROM users` remotely (only the
  superadmin row was present), fixed by running the insert. Not a code bug — see CLAUDE.md's
  "Known gaps" for the standing reminder to check this before assuming a regression.
- The magic-link redirect: reproduced the exact API sequence with `curl` and a cookie jar
  (`request-magic-link` → `verify-magic-link` → `/api/auth/me`) and it worked end to end,
  then ran `frontend/e2e/login.spec.ts` against production in real Chrome and it passed
  cleanly too. So this wasn't a regression — it was the "Open risk, not yet hit" cross-site
  cookie issue CLAUDE.md's Auth section already documents, hit for the first time on Safari.
  No code change; the real fix is still the same one already on file (collapse both apps
  onto one zone once a custom domain exists).

Also fixed while investigating (unrelated to the above, found by visual review): disabled
DEO nav buttons showed a normal pointer cursor instead of "not-allowed" — Tailwind's
preflight in this version sets `button { cursor: pointer }` unconditionally, beating the
`disabled:cursor-not-allowed` utility (see CLAUDE.md's UI conventions for the fix pattern).

**2026-07-05 — icon+label buttons repeatedly reported as "icon below, text above"/misaligned,
with extra blank space under the button text — an earlier pass had already investigated a
similar-sounding "thick button" complaint and concluded the flex layout was fine, so this
second report needed an actual empirical re-check, not another guess.**

Built a temporary route (`frontend/app/debugbuttons/page.tsx`, mounting the real `Button.tsx`)
and rendered it with `npm run dev` + Playwright — a real render of the actual app, not a
synthetic classes-only snippet like the earlier "thick button" check used. Screenshotted with
and without the fix (`git stash` on just `globals.css`) to compare directly. Root cause:
`frontend/app/globals.css`'s `input, select, button { font: inherit }` (deliberately unlayered,
see CLAUDE.md's dark-mode section) inherits Tailwind preflight's `line-height: 1.5` for button
text, while Tabler's icon webfont CSS hardcodes `line-height: 1` on every `.ti` icon — two
different-height line boxes inside one flex row, each correctly centered *on its own* by
`items-center` but not matching each other. Fixed with one line (`line-height: 1` added to that
same `globals.css` rule) rather than touching every button/icon call site; since `select` is in
the same rule, every dropdown's text is now tightened the same way for free. Deleted the debug
route afterward. See CLAUDE.md's `Button.tsx` section for the full writeup — if this is ever
reported a third time, check `globals.css`'s line-height before touching flex/alignment classes
again.
