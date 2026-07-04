import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { users, districts } from "@/db/schema";

// The frontend is a static SPA with no server, so it can't inspect the HttpOnly
// __session cookie itself — it calls this on load to learn role/districtId and gate routes.
// Also doubles as the source for the header's profile menu (district/email), so it joins
// districts here rather than making the frontend fetch a second endpoint just for that.
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [row] = await db
    .select({ email: users.email, districtName: districts.districtName })
    .from(users)
    .leftJoin(districts, eq(users.districtId, districts.id))
    .where(eq(users.id, session.userId))
    .limit(1);

  return NextResponse.json({ ...session, email: row?.email ?? null, districtName: row?.districtName ?? null });
}
