import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { districts } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  const session = await requireSession(req, "admin");
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { districtId } = (await req.json()) as { districtId?: unknown };
  if (typeof districtId !== "number") {
    return NextResponse.json({ error: "districtId is required" }, { status: 400 });
  }

  const db = getDb();
  await db.update(districts).set({ lockStatus: 0 }).where(eq(districts.id, districtId));

  return NextResponse.json({ ok: true });
}
