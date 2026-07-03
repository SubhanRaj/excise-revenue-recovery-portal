// api/ is a separate deployment (Cloudflare Worker) from this static SPA — see root README
// for the same-zone routing setup. Override for local dev via .env.local.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
