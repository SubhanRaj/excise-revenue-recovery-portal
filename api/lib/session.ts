import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "__session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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
export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

// Set alongside a 200 response when a DEO locks their data: instantly kills the cookie.
export function destroySessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
}

export { COOKIE_NAME };
