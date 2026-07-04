import { NextRequest } from "next/server";
import { cookieName, verifySession, SessionPayload } from "@/lib/session";

// Every caller now says which role's cookie it needs — see session.ts for why there are two
// separate cookies instead of one shared __session.
export async function requireSession(req: NextRequest, role: "deo" | "admin"): Promise<SessionPayload | null> {
  const token = req.cookies.get(cookieName(role))?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session || session.role !== role) return null;
  return session;
}
