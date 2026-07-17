import { NextRequest } from "next/server";
import { verifySession, SessionPayload } from "@/lib/session";

// Reads the session from the Authorization header (`Bearer <jwt>`), not a cookie — see
// session.ts for why: cross-site cookies between two different domains get blocked by
// Safari ITP and by Chrome whenever third-party cookies are off (Incognito, a locked-down
// profile, or the browser's own privacy setting), which broke real DEO logins in production.
// A bearer token isn't a cookie, so no browser's cross-site-cookie policy applies to it.
export async function requireSession(req: NextRequest, role: "deo" | "admin"): Promise<SessionPayload | null> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session || session.role !== role) return null;
  return session;
}
