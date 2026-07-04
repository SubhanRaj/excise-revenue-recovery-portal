import { NextRequest, NextResponse } from "next/server";
import { destroySessionCookie } from "@/lib/session";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { auditLogInsert } from "@/lib/audit";

// ?role= says which of the two session cookies to destroy — logging out of /admin must not
// also kill a /deo-data-entry session (or vice versa) sitting in the same browser.
export async function POST(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role");
  if (role !== "admin" && role !== "deo") {
    return NextResponse.json({ error: "role query param must be admin or deo" }, { status: 400 });
  }

  const session = await requireSession(req, role);
  if (session) {
    await auditLogInsert(getDb(), { eventType: "logout", actorRole: role }).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", destroySessionCookie(role));
  return res;
}
