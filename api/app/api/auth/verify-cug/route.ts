import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/db/schema";
import { signSession, sessionCookie } from "@/lib/session";

// Frontend hashes the 10-digit CUG mobile number via Web Crypto SHA-256 before sending it here.
// The server never sees or stores the raw mobile number.
export async function POST(req: NextRequest) {
  const { cugHash } = (await req.json()) as { cugHash?: unknown };

  if (typeof cugHash !== "string" || !/^[a-f0-9]{64}$/.test(cugHash)) {
    return NextResponse.json({ error: "Invalid CUG hash" }, { status: 400 });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.cugHash, cugHash)).limit(1);

  if (!user) {
    return NextResponse.json({ error: "Invalid CUG number" }, { status: 401 });
  }

  const token = await signSession({
    userId: user.id,
    role: user.role as "deo" | "admin",
    districtId: user.districtId,
  });

  const res = NextResponse.json({ ok: true, role: user.role, districtId: user.districtId });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
}
