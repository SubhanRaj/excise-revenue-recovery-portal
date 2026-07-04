import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { users, districts } from "@/db/schema";

// The frontend is a static SPA with no server, so it can't inspect the HttpOnly session
// cookies itself — it calls this on load to learn role/districtId and gate routes. Every
// gated page passes ?role= for the cookie it expects (admin pages ask for "admin",
// /deo-data-entry asks for "deo") — see lib/session.ts for why there are two separate
// cookies instead of one shared __session. Also doubles as the source for the header's
// profile menu (district/email), so it joins districts here rather than making the frontend
// fetch a second endpoint just for that.
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role");
  if (role !== "admin" && role !== "deo") {
    return NextResponse.json({ error: "role query param must be admin or deo" }, { status: 400 });
  }

  const session = await requireSession(req, role);
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
