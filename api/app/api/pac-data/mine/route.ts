import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pacData } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { withErrorHandling } from "@/lib/with-error-handling";

// Lets a DEO who's already submitted re-fetch their own district's PAC data — needed once an
// Admin unlocks a district: the local Dexie draft was already cleared on the original submit
// (see pac-data/submit/route.ts), so without this the DEO would see a blank form despite D1
// already holding their real figures. Read-only; editing still only happens locally until the
// next submit re-locks. Returns [] for a district that's never submitted, same shape either way.
export const GET = withErrorHandling("pac-data/mine", async (req: NextRequest) => {
  const session = await requireSession(req, "deo");
  if (!session || !session.districtId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = await db.select().from(pacData).where(eq(pacData.districtId, session.districtId));

  return NextResponse.json({ years: rows });
});
