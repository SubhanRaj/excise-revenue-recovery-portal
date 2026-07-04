import { SignJWT, jwtVerify } from "jose";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Separate cookie per role, not one shared __session, so a DEO login (CUG, free/unlimited)
// and an Admin login (magic link, rate-limited by Resend's daily email quota) can coexist in
// the same browser without one clobbering the other — switching between /admin and
// /deo-data-entry no longer requires a fresh magic-link email just to get the admin session
// back. Each cookie is scoped strictly to the role that created it (CUG login only ever
// yields "deo", magic link only ever yields whatever role that user row actually has) — this
// doesn't grant anything new, it just stops the two logins from sharing one slot.
function cookieName(role: "deo" | "admin"): string {
  return role === "admin" ? "__admin_session" : "__deo_session";
}

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export type SessionPayload = {
  userId: number;
  role: "deo" | "admin";
  districtId: number | null;
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// SameSite=None because the frontend (Pages) and this API (Worker) are separate origins —
// see middleware.ts for the matching CORS allowlist. Secure is required alongside None.
export function sessionCookie(token: string, role: "deo" | "admin"): string {
  return `${cookieName(role)}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

// Set alongside a 200 response when a DEO locks their data: instantly kills that DEO's cookie
// (and only that one — an admin session in the same browser, if any, is untouched).
export function destroySessionCookie(role: "deo" | "admin"): string {
  return `${cookieName(role)}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
}

export { cookieName };
