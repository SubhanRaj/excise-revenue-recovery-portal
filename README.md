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

They talk over plain `fetch`, credentialed cross-origin (see [CLAUDE.md](./CLAUDE.md) for the
CORS/cookie setup). There is no shared package — types that overlap (financial years, PAC
field order) are intentionally duplicated in each app.

Client-side libraries (SweetAlert2, SheetJS, Tabler Icons, Google Fonts, Tailwind CSS v4,
Chart.js) load from the jsDelivr CDN in `frontend/app/layout.tsx` rather than being bundled —
see that file. SweetAlert2/SheetJS/Chart.js are still listed as npm `devDependencies` purely
for their TypeScript types (`frontend/lib/globals.d.ts`'s `window.Swal`/`XLSX`/`Chart`), not
because they're actually bundled. Cleave.js and TanStack Table are real npm dependencies,
since they need to hook into React render/event cycles rather than run as passive globals.

## Getting started

```bash
# Frontend
cd frontend
npm install
npm run dev          # http://localhost:3000

# API
cd api
npm install
cp .dev.vars.example .dev.vars   # fill in JWT_SECRET, RESEND_API_KEY, FRONTEND_URL
npm run db:generate               # regenerate drizzle/*.sql after schema.ts changes
npm run db:migrate:local          # apply migrations to the local D1 (miniflare) instance
npm run db:seed:local             # seed the 75 UP districts + bootstrap admin
npm run dev                       # http://localhost:8787 (default Next dev port; adjust as needed)
```

## Deploying

Live at: API `https://excise-revenue-recovery-api.shubhanraj2002.workers.dev`, frontend
`https://excise-revenue-recovery-portal.pages.dev`. Full deploy/redeploy commands,
required secrets, and the OpenNext/Next-16-middleware gotcha that blocks a naive deploy
are in [DEPLOY.md](./DEPLOY.md).

## Documentation

- [CLAUDE.md](./CLAUDE.md) — data model, auth flows, validation rules, and conventions for AI agents working in this repo.
- [DEPLOY.md](./DEPLOY.md) — production deployment state, secrets, and redeploy commands.
- [TESTING.md](./TESTING.md) — Playwright e2e suite (real Chrome, against live production), manual demo script, and incident notes.
- [ROADMAP.md](./ROADMAP.md) — milestones and progress tracking.
