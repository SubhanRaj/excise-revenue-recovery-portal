import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { districts, pacData, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-guard";

// Full dump of all 75 districts + their PAC rows, for the Admin dashboard's Dexie.js cache/sync.
export async function GET(req: NextRequest) {
  const session = await requireSession(req, "admin");
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [allDistricts, allPacData] = await Promise.all([
    db.select({
      id: districts.id,
      districtName: districts.districtName,
      lockStatus: districts.lockStatus,
      unlockedAt: districts.unlockedAt,
      unlockReason: districts.unlockReason,
      unlockedBy: districts.unlockedBy,
      deoEmail: users.email,
    })
    .from(districts)
    .leftJoin(users, eq(districts.id, users.districtId)),
    db.select().from(pacData),
  ]);

  return NextResponse.json({ districts: allDistricts, pacData: allPacData });
}
