import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { districts, users, pacData } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

// Matches the district_name inserted for the demo DEO/district (see CLAUDE.md's "Demo
// district" section) — kept as a name match, not a dedicated column/flag, since this is the
// only place that needs to distinguish it and a whole schema column would be overkill for one
// admin-only cleanup action.
const DEMO_DISTRICT_NAME = "Demo District";

// One-off admin housekeeping action, meant to be run exactly once right before the real launch
// (see CLAUDE.md) — permanently deletes the Demo District row, its pac_data, and the demo DEO's
// users row. Deliberately does NOT touch the DEMO_CUG Worker secret or the frontend's
// prefix-exemption logic for it (app/login/page.tsx) — those are the *mechanism* for a demo
// login, reusable if a new Demo District is ever seeded again later; this endpoint only clears
// the *data* left over from the most recent demo run.
export const POST = withErrorHandling("admin/truncate-demo-data", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [demo] = await db
    .select()
    .from(districts)
    .where(eq(districts.districtName, DEMO_DISTRICT_NAME))
    .limit(1);

  if (!demo) {
    return NextResponse.json({ error: "No Demo District found — nothing to truncate." }, { status: 404 });
  }

  const [admin] = await db
    .select({ email: users.email, name: users.name, designation: users.designation })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  await db.batch([
    db.delete(pacData).where(eq(pacData.districtId, demo.id)),
    db.delete(users).where(eq(users.districtId, demo.id)),
    db.delete(districts).where(eq(districts.id, demo.id)),
    auditLogInsert(db, {
      eventType: "demo_data_truncated",
      actorRole: "admin",
      actorEmail: admin?.email,
      actorName: admin?.name,
      actorDesignation: admin?.designation,
      districtName: DEMO_DISTRICT_NAME,
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
