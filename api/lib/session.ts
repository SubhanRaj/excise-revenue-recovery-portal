import { SignJWT, jwtVerify } from "jose";

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
