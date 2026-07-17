export type Role = "deo" | "admin";

// Real session lives here now — a Bearer token per role, in localStorage. Keyed by role (not
// one shared slot) so a DEO login and an Admin login can coexist in the same browser without
// clobbering each other, same intent as the API's old two-cookie split. This IS the actual
// credential now (not just a UI hint) — see api/lib/session.ts for why cookies were dropped:
// SameSite=None cross-site cookies between *.pages.dev and *.workers.dev get silently blocked
// by Safari ITP and by Chrome whenever third-party cookies are off (Incognito, a locked-down
// profile), which broke real DEO logins in production. Every gated page still calls
// GET /api/auth/me before trusting this — an expired/invalid token looks the same as a
// missing one from the frontend's perspective.
export type ClientSession = { role: Role; districtId: number | null; token: string };

function key(role: Role): string {
  return `excise-portal:session:${role}`;
}

// Only for the root page's first-paint redirect guess (which of /admin or /deo-data-entry to
// send a bare "/" visit to) — not a source of truth for anything gated.
const LAST_ROLE_KEY = "excise-portal:last-role";

export function saveClientSession(session: ClientSession) {
  localStorage.setItem(key(session.role), JSON.stringify(session));
  localStorage.setItem(LAST_ROLE_KEY, session.role);
}

export function readClientSession(role?: Role): ClientSession | null {
  const r = role ?? (localStorage.getItem(LAST_ROLE_KEY) as Role | null);
  if (!r) return null;
  const raw = localStorage.getItem(key(r));
  return raw ? (JSON.parse(raw) as ClientSession) : null;
}

export function getToken(role: Role): string | null {
  return readClientSession(role)?.token ?? null;
}

export function clearClientSession(role: Role) {
  localStorage.removeItem(key(role));
}

// One-shot flag set right before redirecting away from /login or /verify, so the destination
// page can show a "Welcome" toast exactly once per sign-in rather than on every reload.
const JUST_AUTHED_KEY = "excise-portal:just-authed";

export function markJustAuthed() {
  sessionStorage.setItem(JUST_AUTHED_KEY, "1");
}

export function consumeJustAuthed(): boolean {
  const flagged = sessionStorage.getItem(JUST_AUTHED_KEY) === "1";
  if (flagged) sessionStorage.removeItem(JUST_AUTHED_KEY);
  return flagged;
}
