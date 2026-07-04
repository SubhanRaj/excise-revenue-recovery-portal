import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pacData, districts, users, FINANCIAL_YEARS } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { destroySessionCookie } from "@/lib/session";

type YearRow = {
  financialYear: string;
  grossArrears: number;
  rcCount: number;
  rcAmount: number;
  recoveredAmount: number;
  stayCount: number;
  stayAmount: number;
};

const NUMERIC_FIELDS = [
  "grossArrears",
  "rcCount",
  "rcAmount",
  "recoveredAmount",
  "stayCount",
  "stayAmount",
] as const;

function validateRow(row: YearRow): string | null {
  if (!FINANCIAL_YEARS.includes(row.financialYear as (typeof FINANCIAL_YEARS)[number])) {
    return `Invalid financial year: ${row.financialYear}`;
  }
  for (const field of NUMERIC_FIELDS) {
    const value = row[field];
    // Zero-trust: reject missing/non-numeric values outright. The client must send an
    // explicit 0, never an empty string coerced to 0 — enforced identically here.
    if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
      return `Field "${field}" for ${row.financialYear} must be a non-negative number`;
    }
  }
  if (row.recoveredAmount !== row.rcAmount) {
    return `Parity check failed for ${row.financialYear}: recovered_amount must equal rc_amount`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session || session.role !== "deo" || !session.districtId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { years, submittedByName } = (await req.json()) as {
    years: YearRow[];
    submittedByName: string;
  };

  if (!Array.isArray(years) || years.length !== FINANCIAL_YEARS.length) {
    return NextResponse.json(
      { error: `Payload must contain exactly ${FINANCIAL_YEARS.length} years` },
      { status: 400 }
    );
  }
  if (typeof submittedByName !== "string" || submittedByName.trim().length === 0) {
    return NextResponse.json({ error: "submittedByName is required" }, { status: 400 });
  }

  for (const row of years) {
    const error = validateRow(row);
    if (error) return NextResponse.json({ error }, { status: 400 });
  }

  const db = getDb();
  const [district] = await db
    .select()
    .from(districts)
    .where(eq(districts.id, session.districtId))
    .limit(1);

  if (!district) {
    return NextResponse.json({ error: "District not found" }, { status: 404 });
  }
  if (district.lockStatus === 1) {
    return NextResponse.json({ error: "District data is already locked" }, { status: 409 });
  }

  const now = new Date().toISOString();

  // D1 batch = atomic: all 5 year rows + lock flip + user audit fields, or nothing.
  await db.batch([
    ...years.map((row) =>
      db.insert(pacData).values({
        districtId: session.districtId!,
        financialYear: row.financialYear,
        grossArrears: row.grossArrears,
        rcCount: row.rcCount,
        rcAmount: row.rcAmount,
        recoveredAmount: row.recoveredAmount,
        stayCount: row.stayCount,
        stayAmount: row.stayAmount,
        submittedByName: submittedByName.trim(),
      })
    ),
    db.update(districts).set({ lockStatus: 1 }).where(eq(districts.id, session.districtId!)),
    db
      .update(users)
      .set({ lockedAt: now, submittedByName: submittedByName.trim() })
      .where(eq(users.id, session.userId)),
  ] as unknown as Parameters<typeof db.batch>[0]);

  const res = NextResponse.json({ ok: true });
  // Data is locked — instantly destroy this DEO's session, no further access needed.
  res.headers.set("Set-Cookie", destroySessionCookie());
  return res;
}
