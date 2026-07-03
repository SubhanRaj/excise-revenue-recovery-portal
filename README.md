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

Client-side libraries (SweetAlert2, SheetJS, Tabler Icons, Google Fonts, Tailwind CSS v4) load
from the jsDelivr CDN in `frontend/app/layout.tsx` rather than being bundled — see that file.
Cleave.js and TanStack Table are npm dependencies instead, since they need to hook into React
render/event cycles rather than run as passive globals.

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

```bash
cd api
wrangler d1 create excise-revenue-recovery-db   # once — paste the returned database_id into wrangler.jsonc
npm run db:migrate:remote
npm run db:seed:remote
npm run deploy                                   # builds with OpenNext, deploys the Worker

cd ../frontend
npm run build                                    # static export to frontend/out
npx wrangler pages deploy out --project-name excise-revenue-recovery-portal
```

Set `FRONTEND_URL` (api) and `NEXT_PUBLIC_API_URL` (frontend, at build time) to each other's
deployed origin, and set the same secrets in `wrangler.jsonc` / the Cloudflare dashboard as in
`.dev.vars`.

## Documentation

- [CLAUDE.md](./CLAUDE.md) — data model, auth flows, validation rules, and conventions for AI agents working in this repo.
- [ROADMAP.md](./ROADMAP.md) — milestones and progress tracking.
