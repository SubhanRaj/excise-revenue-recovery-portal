import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { auditLogInsert } from "@/lib/audit";
import { districts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withErrorHandling } from "@/lib/with-error-handling";

// Session tokens are stateless JWTs with no server-side revocation list, so there's nothing
// to invalidate here — this endpoint just records the audit-log event; the frontend discards
// its own stored token right after calling this. ?role= says which role's token that is, so
// logging out of /admin doesn't touch a /deo-data-entry session in the same browser.
export const POST = withErrorHandling("auth/logout", async (req: NextRequest) => {
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

  return NextResponse.json({ ok: true });
});
