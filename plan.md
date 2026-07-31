# Migration Plan — Collapse `frontend` + `api` into one Next.js/OpenNext Worker (SRO-style)

Status: **proposed, not started**. This document is for review — no code changes have been made.
Nothing here should be executed until you say go.

## 0. TL;DR

Two independent Next.js apps (`frontend`: static export on Cloudflare Pages; `api`: OpenNext
Worker) collapse into **one** Next.js app, built with `@opennextjs/cloudflare`, deployed as
**one** Cloudflare Worker — same shape as `up-excise-spatial-revenue-optimizer/apps/web`. The
Worker serves the UI pages (SSR shell + client-hydrated, "SPA-like" behavior — not a real SPA,
but the same practical effect: React takes over after first paint, Dexie-backed client state
unchanged), the `/api/*` route handlers, and the D1 binding, all from one deploy.

**D1 is never touched by this migration.** No schema change, no migration file, no data
read/write of any kind. This is purely an application-hosting/build-topology change. Section 6
below is the explicit safety checklist for that guarantee.

## 1. Why now, and why this shape

- The only reason for the two-app split was the lack of a shared domain (see CLAUDE.md's Auth
  section, Milestone 21/35/36 history). That's resolved — `excisebakaya.exciseup.in` already
  fronts both apps today via Pages (frontend) + a path-scoped Worker Route (`api`, `/api/*`).
- SRO already proved this shape works in production for a sibling app on the same Cloudflare
  account: one `@opennextjs/cloudflare` app, one `wrangler.jsonc`, one D1 binding, one Worker
  Route matching the **whole** domain (not path-scoped).
- Collapsing removes: two CI jobs → one, two `package.json`/lockfiles → one, the path-filtered
  `deploy.yml` split, the Pages project entirely, and the biggest latent bug source in this
  repo — `frontend/lib/pac-fields.ts` and `api/lib/net-recoverable.ts`/`api/lib/rc-details.ts`
  being **hand-mirrored duplicates** that must be kept in sync by discipline alone (CLAUDE.md
  says this explicitly). One app means one set of these files, no mirroring, no drift risk.

## 2. Current vs target shape

| | Today | After migration |
|---|---|---|
| Apps | `frontend` (Next static export) + `api` (OpenNext Worker) | one Next app (OpenNext Worker) |
| Frontend hosting | Cloudflare Pages, `output: "export"`, static HTML/JS in `out/` | served as Worker assets by the same Worker that runs `/api/*` |
| API hosting | Separate Worker, route `excisebakaya.exciseup.in/api/*` | same Worker, route `excisebakaya.exciseup.in/*` |
| Deploy | 2 GH Actions jobs (path-filtered) | 1 job |
| Shared code (`pac-fields.ts` mirror) | duplicated by hand in 2 files | one file, imported by both UI and route handlers |
| CDN libs (Tailwind, SweetAlert2, ExcelJS, Chart.js, Tabler Icons, Google Fonts) | loaded via `<script>`/`<link>` tags in `frontend/app/layout.tsx` | unchanged — CDN stays preferred per your instruction; layout markup moves as-is into the merged app's root layout |
| D1 | 1 binding, `excise-revenue-recovery-db`, on `api`'s Worker | same binding, same database, same Worker (now serving everything) |
| Auth | HttpOnly cookie, same-origin already | unchanged — same-origin gets *simpler* (no path-split at all) |

## 3. What does NOT change

- No database schema change, no new migration, no data touched (see Section 6).
- No auth model change — cookie-based session auth (`api/lib/session.ts`) is already
  same-origin-correct and needs no rework.
- CDN-loaded libraries stay CDN-loaded (Tailwind Play CDN, SweetAlert2, ExcelJS, Chart.js,
  Tabler Icons, Google Fonts) — your instruction was "CDN is preferred still," so
  `frontend/app/layout.tsx`'s `<script>`/`<link>` tags move into the merged app's root layout
  essentially verbatim. (SRO's own pattern of "can also serve from root if needed" is noted as
  an option below in case any one of these CDNs ever becomes unreliable, but nothing forces
  that change now.)
- All business logic, validation rules, UI components, Dexie offline flow, SweetAlert2 dialogs,
  Excel export — copied over, not rewritten. This is a hosting/build-topology migration, not a
  feature rewrite.
- `next dev`/`wrangler dev` local cross-origin gap (documented in CLAUDE.md) actually
  **disappears** — there's only one dev server to run.

## 4. Detailed steps

### Step A — New app skeleton (base: `api/`, since it's already OpenNext)
1. In `api/app/`, delete the placeholder `page.tsx`/`page.module.css` (create-next-app
   boilerplate, never used) — keep `app/api/**` exactly as-is.
2. Move every non-`/api` route from `frontend/app/**` into `api/app/**`:
   `admin/*`, `deo-data-entry/*`, `login/*`, `verify/*`, `layout.tsx`, `globals.css`, `icon.svg`,
   `opengraph-image.tsx`, `page.tsx` (frontend's real landing/redirect page, not the boilerplate
   one above).
3. Move `frontend/components/**` → `api/components/**`, `frontend/lib/**` → `api/lib/**`
   (careful: `api/lib/**` already has server-only files like `net-recoverable.ts`,
   `with-error-handling.ts`, `session.ts`, `auth-guard.ts`, `rate-limit.ts`, `hash.ts`,
   `audit.ts`, `rc-details.ts`, `email.ts` — these stay; frontend's `lib/*` files are additive,
   no name collisions found in the current tree except **`pac-fields.ts` vs
   `net-recoverable.ts`/`rc-details.ts`**, see Step B).
4. Move `frontend/public/**` → `api/public/**` (merge; `api/public` currently only has
   whatever create-next-app shipped — check for filename collisions before copying, e.g.
   `next.svg`/`vercel.svg` placeholders can just be deleted, they're unused boilerplate).
5. Move `frontend/e2e/**` and `playwright.config.ts` → `api/` (single e2e suite going forward).

### Step B — Fold the mirrored constants into one file (optional, but the actual point of doing this)
- `frontend/lib/pac-fields.ts` mirrors `api/lib/net-recoverable.ts`'s
  `computeNetRecoverableSeries()` and `api/lib/rc-details.ts`'s `validateRcDetails()`
  byte-for-byte, per CLAUDE.md. Once both live in the same app, there is no reason to keep two
  copies — client components and server route handlers can both `import` the same
  `lib/net-recoverable.ts`/`lib/rc-details.ts`. Recommend doing this fold in a **separate,
  later commit** after the plain move is verified working — don't fold logic and move hosting
  in the same change, that's two risks stacked into one diff.

### Step C — `next.config.ts`
- Drop `output: "export"` and `images: { unoptimized: true }` entirely — the merged app is a
  normal OpenNext app (matches SRO's `next.config.ts`, which has no special `output` setting).
- Every page currently under `frontend/app/**` is already `"use client"`-heavy with no
  server-side data fetching at the page level (data comes from Dexie + `apiFetch()` calls at
  runtime, not `getServerSideProps`/server components pulling from D1 directly) — so removing
  static export should be **behaviorally invisible**: Next.js still pre-renders a minimal HTML
  shell per route and hydrates client-side, same "loads fast, then JS takes over" feel as
  today's static export. This is the "SSR with SPA-like behavior" you described — exactly
  what SRO already does, nothing new to build.
- Recommend spot-checking each moved page after the config change for any accidental
  server-only assumption (there shouldn't be any, since none of these pages currently import
  server-only modules), by running `pnpm run build` locally and eyeballing the route list Next
  prints (`○ Static` vs `ƒ Dynamic` per route) to confirm nothing unexpectedly became
  server-rendered-per-request in a way that would hit D1 on every page load instead of only via
  `/api/*` — none should, but this is the one-line check that catches it early.

### Step D — `package.json` merge
- Base: `api/package.json`. Add `frontend`'s deps: `@tanstack/react-table`, `cleave.js`,
  `dexie`, `chart.js`, `exceljs`, `sweetalert2`, plus dev deps `@types/cleave.js`,
  `@playwright/test`.
- `exceljs` is currently a **frontend devDependency loaded via CDN** in the browser
  (`window.ExcelJS`) — confirm which one is actually used at runtime (the layout.tsx comment
  suggests CDN is authoritative; the npm package may only exist for TS types). Keep whichever
  the current frontend build actually relies on; don't silently drop the CDN `<Script>` tag
  without checking `export.ts` doesn't assume `window.ExcelJS` first.
- One `pnpm-lock.yaml`, one `pnpm-workspace.yaml` (carry over api's `allowBuilds` list per
  CLAUDE.md's pnpm section, adding any new native postinstall triggers if `pnpm install`
  reports `ERR_PNPM_IGNORED_BUILDS`).
- Drop `frontend/package.json`, `frontend/pnpm-lock.yaml` entirely once merged.

### Step E — `wrangler.jsonc`
```jsonc
{
  "main": ".open-next/worker.js",
  "name": "excise-revenue-recovery-api",       // keep existing Worker name — no need to rename
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "workers_dev": false,
  "routes": [
    { "pattern": "excisebakaya.exciseup.in/*", "zone_name": "exciseup.in" }  // was /api/* only
  ],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "excise-revenue-recovery-db",
      "database_id": "4f3e37fd-006a-4bce-b2d3-4bfb8bb16248"   // UNCHANGED — same database
    }
  ]
}
```
- Only real change from today's `api/wrangler.jsonc`: the route pattern widens from `/api/*` to
  `/*`. Database binding, name, and ID are **byte-identical** to what's already in production —
  this is the guarantee that no new/different D1 database gets created or pointed at.

### Step F — CI/CD (`deploy.yml`, `ci.yml`)
- Delete the `changes`/path-filter job and the `deploy-frontend` job entirely.
- Single job: checkout → pnpm install → `tsc --noEmit` → `pnpm run deploy` (existing
  `opennextjs-cloudflare build && opennextjs-cloudflare deploy` script, unchanged).
- `ci.yml` likely has a matrix or two separate jobs for `frontend`/`api` today — collapse to one
  (will confirm exact current shape before writing the diff, not guessing here).

### Step G — Cloudflare-side cutover (the one production-facing step)
1. Deploy the merged Worker to a **temporary preview route** first if possible (e.g. keep the
   existing `/api/*`-scoped route live and untouched, deploy the new merged Worker under a
   throwaway `workers.dev` subdomain or a staging hostname) to verify pages render and API calls
   work before touching the real domain.
2. Once verified: add the merged Worker's `excisebakaya.exciseup.in/*` route.
3. Remove the Cloudflare Pages project's custom-domain hostname binding (per your note, "CF
   Pages removal is ok").
4. Remove the old `api` Worker's now-redundant `/api/*`-scoped route (or just let the new `/*`
   route supersede it — Cloudflare resolves by most-specific pattern, so leaving the old
   `/api/*` route in place briefly as a safety net causes no conflict; remove it only after the
   `/*` route is confirmed stable for a day or two).
5. Do this during low-traffic hours; have the rollback ready (Section 7).

## 5. File-by-file move map

| From | To | Notes |
|---|---|---|
| `frontend/app/{admin,deo-data-entry,login,verify}/**` | `api/app/**` | direct move |
| `frontend/app/layout.tsx` | `api/app/layout.tsx` | replaces api's current layout; keep api's `<head>` additions if any (check for `metadataBase`/favicon differences first) |
| `frontend/app/page.tsx` | `api/app/page.tsx` | replaces api's create-next-app boilerplate |
| `frontend/app/globals.css` | `api/app/globals.css` | replaces api's boilerplate CSS; **preserve the "unlayered, not `@layer`-wrapped" rule from CLAUDE.md's Visual language section** |
| `frontend/app/opengraph-image.tsx`, `icon.svg` | `api/app/` | direct move |
| `frontend/components/**` | `api/components/**` | direct move, new directory in api |
| `frontend/lib/*.ts` (session.ts, alerts.ts, api.ts, config.ts, crypto.ts, db.ts, export.ts, format.ts, site.ts, theme.ts, useAdminData.ts, adminNav.ts, globals.d.ts) | `api/lib/**` | additive; `pac-fields.ts` handled separately (Step B) |
| `frontend/public/**` | `api/public/**` | merge, drop unused create-next-app SVGs, keep `robots.txt`, `_headers` (see note below) |
| `frontend/e2e/**`, `playwright.config.ts` | `api/` | direct move |
| `frontend/package.json`, `pnpm-lock.yaml` | deleted | folded into `api/package.json` |
| `frontend/next.config.ts` | deleted | folded into `api/next.config.ts` (minus `output`/`images`) |

**`_headers` note**: `frontend/public/_headers` is a **Cloudflare Pages-specific** file
(security headers + the opengraph-image content-type fix) — Pages reads this file natively;
a Worker does not. These headers need to be re-applied either via `next.config.ts`'s `headers()`
function (Next-native, works under OpenNext) or the Worker's own response handling. This is a
real, non-optional piece of the migration — don't drop these headers silently (SECURITY.md
documents why they exist).

## 6. D1 safety — explicit guarantees

Per your instruction, this section is the checklist that nothing in D1 is touched:

1. **No new database is created.** `wrangler.jsonc`'s `d1_databases[0].database_id` stays
   `4f3e37fd-006a-4bce-b2d3-4bfb8bb16248` — copy-pasted, never regenerated.
2. **No migration runs as part of this work.** `api/drizzle/*.sql` (0000–0011) stay exactly as
   they are; nothing in this plan adds a new one. `db:migrate:remote`/`db:migrate:local` scripts
   are not invoked at any point in this migration.
3. **No `DROP`/`DELETE`/`TRUNCATE` anywhere in this plan.** The existing
   `api/app/api/admin/truncate-demo-data` route is untouched (moved with the rest of `app/api`,
   not modified, not called).
4. **The Worker *name* stays the same** (`excise-revenue-recovery-api`) unless you decide
   otherwise — a Worker rename has no effect on D1 bindings either way (the binding is
   database-ID-scoped, not Worker-name-scoped), but keeping the name avoids any Cloudflare
   dashboard confusion during the cutover.
5. **`audit_log` keeps recording as normal** — every route handler moves file-for-file, no
   route logic changes, so `withErrorHandling`/`auditLogInsert` call sites are untouched.
6. **Rollback path (Section 7) requires no D1 restore** — because nothing in D1 changes, rolling
   back is purely "point the domain's route back at the old Worker/Pages project," not a data
   recovery operation.
7. **Recommended extra safety net, not required by the plan but cheap**: take a
   `wrangler d1 export excise-revenue-recovery-db --remote` backup immediately before the
   Section 4.G cutover step, purely as a belt-and-suspenders snapshot given this is a live
   government-data portal — even though nothing in this plan writes to D1.

## 7. Rollback plan

Because the D1 database and its binding never change, rollback is a pure routing revert:
1. Re-add/restore the Cloudflare Pages project's custom-domain hostname (if removed).
2. Re-scope (or restore) the old `api` Worker's route to `excisebakaya.exciseup.in/api/*`.
3. Remove the merged Worker's `/*` route.
4. No data migration, no D1 restore, no user-facing data loss risk at any point — the rollback
   is a Cloudflare dashboard/`wrangler` routing change only, reversible in minutes.

## 8. Verification checklist before + after cutover

- `pnpm exec tsc --noEmit` clean in the merged app.
- `pnpm run build` clean, route list reviewed (static vs dynamic per route, as noted in Step C).
- Local `wrangler dev`/OpenNext preview: login (CUG + magic link), verify page, DEO data entry
  (all 5 years, save/continue, RC details sub-form, submit & lock), Admin Dashboard, Districts
  table + Excel export + SQL export, district detail page, DEO Provisioning (owner-only),
  Admin Users (owner-only, the drawer just shipped), Unlock Requests, Audit Log, dark mode
  toggle, mobile drawer nav.
- Playwright e2e suite (`login.spec.ts` at minimum) green against the preview/staging URL.
- Cookie auth specifically: confirm `__admin_session`/`__deo_session` cookies still set/read
  correctly now that literally everything is one Worker (this should if anything become more
  reliable, not less, since there's no cross-Worker/Pages boundary left at all).
- Response headers: confirm the `_headers` → `next.config.ts` `headers()` port (Section 5 note)
  actually produces the same `X-Frame-Options`/CSP-adjacent headers on a real deployed response.
- After the real cutover: manually load `excisebakaya.exciseup.in` end-to-end once as both a
  DEO and an Admin account before considering it done.

## 9. Suggested sequencing / commit breakdown

1. Commit 1: move files (Step A, D, E per the map above), update `next.config.ts`, merge
   `package.json` — get it building locally and passing typecheck. No CI/deploy changes yet.
2. Commit 2: port `_headers` → `next.config.ts` `headers()`, verify headers present in a local
   preview build.
3. Commit 3: collapse `ci.yml`/`deploy.yml` to one job. Deploy to a **non-production** route/
   preview first (Section 4.G.1).
4. Commit 4 (separate from the above, after 1–3 are verified stable): fold
   `pac-fields.ts`/`net-recoverable.ts`/`rc-details.ts` duplication into one shared module
   (Step B) — deliberately last, since it's the one step that touches shared validation logic
   rather than just moving files.
5. Cutover (Section 4.G.2–5) only after 1–4 are verified — this is the only step with any
   production blast radius, and per Section 6/7 it carries zero D1 risk and a clean rollback.
6. Update CLAUDE.md/README.md/ROADMAP.md/DEPLOY.md to describe the new one-app shape, retiring
   the old "two independent Next.js apps" framing throughout.

## 10. Open questions for you before implementation starts

- Keep the Worker's existing name (`excise-revenue-recovery-api`) or rename now that it serves
  everything (e.g. `excise-revenue-recovery-portal`)? Cosmetic only, no functional effect.
- Any preference on how long to leave the old `/api/*`-scoped route alive in parallel with the
  new `/*` route during cutover (Section 4.G.4)?
- Do you want the `pac-fields.ts` duplication fold (Section 4, Step B) done as part of this same
  effort, or deferred to a later, separate task? Recommendation above is to do it, but last.
