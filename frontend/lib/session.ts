// UI-only session cache (role/districtId) so route guards can render without a network
// round-trip. The real session lives in the HttpOnly __session cookie the SPA can't read;
// every gated page still re-verifies via GET /api/auth/me before trusting this.
export type ClientSession = { role: "deo" | "admin"; districtId: number | null };

const KEY = "excise-portal:session";

export function saveClientSession(session: ClientSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function readClientSession(): ClientSession | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as ClientSession) : null;
}

export function clearClientSession() {
  localStorage.removeItem(KEY);
}
