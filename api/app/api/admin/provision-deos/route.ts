import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { districts, users } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { sha256Hex } from "@/lib/hash";
import { auditLogInsert } from "@/lib/audit";

type InputRow = { districtName?: unknown; cugMobile?: unknown; email?: unknown };
type RowResult = { districtName: string; status: "inserted" | "updated" | "skipped" | "error"; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Bulk DEO provisioning from the admin's uploaded template (frontend/app/admin/page.tsx).
// Unlike the DEO's own CUG login, where the browser hashes before ever sending it, here the
// admin supplies each DEO's raw 10-digit CUG number from a spreadsheet they filled in
// themselves — the server hashes it on ingest since there's no client-side DEO in this flow
// to have done it already.
export async function POST(req: NextRequest) {
  const session = await requireSession(req, "admin");
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rows } = (await req.json()) as { rows?: InputRow[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
  }

  const db = getDb();
  const results: RowResult[] = [];

  for (const raw of rows) {
    const districtName = typeof raw.districtName === "string" ? raw.districtName.trim() : "";
    const cugMobile = typeof raw.cugMobile === "string" ? raw.cugMobile.trim() : "";
    const email = typeof raw.email === "string" ? raw.email.trim() : "";

    if (!districtName) {
      results.push({ districtName: districtName || "(blank)", status: "error", message: "Missing district name" });
      continue;
    }
    if (!cugMobile && !email) {
      results.push({ districtName, status: "skipped" });
      continue;
    }
    if (cugMobile && !/^\d{10}$/.test(cugMobile)) {
      results.push({ districtName, status: "error", message: "CUG mobile must be exactly 10 digits" });
      continue;
    }
    if (email && !EMAIL_RE.test(email)) {
      results.push({ districtName, status: "error", message: "Invalid email address" });
      continue;
    }

    try {
      const [district] = await db
        .select()
        .from(districts)
        .where(eq(districts.districtName, districtName))
        .limit(1);
      if (!district) {
        results.push({ districtName, status: "error", message: "No matching district found" });
        continue;
      }

      const values: { cugHash?: string; email?: string } = {};
      if (cugMobile) values.cugHash = await sha256Hex(cugMobile);
      if (email) values.email = email;

      const [existing] = await db
        .select()
        .from(users)
        .where(and(eq(users.role, "deo"), eq(users.districtId, district.id)))
        .limit(1);

      if (existing) {
        await db.update(users).set(values).where(eq(users.id, existing.id));
        results.push({ districtName, status: "updated" });
      } else {
        await db.insert(users).values({ role: "deo", districtId: district.id, ...values });
        results.push({ districtName, status: "inserted" });
      }
    } catch {
      // Most likely a unique constraint hit (same CUG/email already used by another district).
      results.push({ districtName, status: "error", message: "Save failed — CUG or email may already be in use" });
    }
  }

  const [admin] = await db.select({ email: users.email }).from(users).where(eq(users.id, session.userId)).limit(1);
  const inserted = results.filter((r) => r.status === "inserted").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const errors = results.filter((r) => r.status === "error").length;
  await auditLogInsert(db, {
    eventType: "deo_provisioned",
    actorRole: "admin",
    actorEmail: admin?.email,
    metadata: { inserted, updated, errors, totalRows: rows.length },
  });

  return NextResponse.json({ results });
}
