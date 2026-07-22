// api/ is a separate deployment (Cloudflare Worker) from this static SPA, but in production
// both are served from excisebakaya.exciseup.in (Pages custom domain + a path-scoped Worker
// Route for /api/*) — same origin, so "" resolves relative to whatever host served the page.
// Override for local dev via .env.local (genuinely cross-origin ports there).
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
