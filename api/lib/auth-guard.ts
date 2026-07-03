import { NextRequest } from "next/server";
import { COOKIE_NAME, verifySession, SessionPayload } from "@/lib/session";

export async function requireSession(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}
