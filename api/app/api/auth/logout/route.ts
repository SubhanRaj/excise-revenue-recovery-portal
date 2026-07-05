import { NextRequest, NextResponse } from "next/server";
import { destroySessionCookie } from "@/lib/session";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { auditLogInsert } from "@/lib/audit";
import { districts } from "@/db/schema";
import { eq } from "drizzle-orm";

// ?role= says which of the two session cookies to destroy — logging out of /admin must not
// also kill a /deo-data-entry session (or vice versa) sitting in the same browser.
export async function POST(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role");
  if (role !== "admin" && role !== "deo") {
    return NextResponse.json({ error: "role query param must be admin or deo" }, { status: 400 });
  }

  const session = await requireSession(req, role);
  if (session) {
    let districtName = null;
    const db = getDb();
    if (session.role === "deo" && session.districtId) {
      const [d] = await db.select().from(districts).where(eq(districts.id, session.districtId)).limit(1);
      districtName = d?.districtName ?? null;
    }
    await auditLogInsert(db, { eventType: "logout", actorRole: role, districtName }).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", destroySessionCookie(role));
  return res;
}
