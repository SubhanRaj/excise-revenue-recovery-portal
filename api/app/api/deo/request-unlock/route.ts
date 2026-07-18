import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { districts, unlockRequests, users } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { auditLogInsert } from "@/lib/audit";
import { withErrorHandling } from "@/lib/with-error-handling";

const REASON_MAX_LENGTH = 2000;
const PDF_MAX_BYTES = 2 * 1024 * 1024;
// %PDF- magic bytes — the client-reported Content-Type is trivially spoofed, so the actual
// file header is what's trusted (CLAUDE.md's Validation rules zero-trust posture).
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

async function isPdf(buf: ArrayBuffer): Promise<boolean> {
  const head = new Uint8Array(buf.slice(0, PDF_MAGIC.length));
  return PDF_MAGIC.every((b, i) => head[i] === b);
}

// First multipart/FormData endpoint in this codebase — every other route reads req.json(). See
// CLAUDE.md for why this is a deliberate one-off precedent, not a pattern to copy elsewhere
// without a similar file-upload reason.
export const POST = withErrorHandling("deo/request-unlock", async (req: NextRequest) => {
  const session = await requireSession(req, "deo");
  if (!session || !session.districtId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [district] = await db
    .select({ id: districts.id, districtName: districts.districtName, lockStatus: districts.lockStatus })
    .from(districts)
    .where(eq(districts.id, session.districtId))
    .limit(1);
  if (!district) {
    return NextResponse.json({ error: "District not found" }, { status: 404 });
  }
  if (district.lockStatus !== 1) {
    return NextResponse.json({ error: "Your district isn't locked — nothing to request unlocking for" }, { status: 409 });
  }

  const [existingPending] = await db
    .select({ id: unlockRequests.id })
    .from(unlockRequests)
    .where(and(eq(unlockRequests.districtId, district.id), eq(unlockRequests.status, "pending")))
    .limit(1);
  if (existingPending) {
    return NextResponse.json({ error: "You already have a pending unlock request" }, { status: 409 });
  }

  const form = await req.formData();
  const reasonRaw = form.get("reason");
  if (typeof reasonRaw !== "string" || reasonRaw.trim().length === 0) {
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  }
  const reason = reasonRaw.trim();
  if (reason.length > REASON_MAX_LENGTH) {
    return NextResponse.json({ error: `Reason must be ${REASON_MAX_LENGTH} characters or fewer` }, { status: 400 });
  }

  let attachmentKey: string | null = null;
  let attachmentFilename: string | null = null;
  const file = form.get("attachment");
  if (file instanceof File && file.size > 0) {
    if (file.size > PDF_MAX_BYTES) {
      return NextResponse.json({ error: "Attachment must be 2MB or smaller" }, { status: 400 });
    }
    const buf = await file.arrayBuffer();
    if (!(await isPdf(buf))) {
      return NextResponse.json({ error: "Attachment must be a valid PDF file" }, { status: 400 });
    }
    // Server-generated key, never built from the client-supplied filename — see CLAUDE.md's
    // Security section (path traversal / key injection).
    const requestedAt = Date.now();
    attachmentKey = `unlock-requests/${district.id}/${requestedAt}.pdf`;
    attachmentFilename = file.name.slice(0, 200);
    const { env } = getCloudflareContext();
    await env.ATTACHMENTS.put(attachmentKey, buf, { httpMetadata: { contentType: "application/pdf" } });
  }

  const [deo] = await db.select({ email: users.email }).from(users).where(eq(users.id, session.userId)).limit(1);

  await db.batch([
    db.insert(unlockRequests).values({
      districtId: district.id,
      reason,
      attachmentKey,
      attachmentFilename,
      status: "pending",
      requestedAt: new Date().toISOString(),
    }),
    auditLogInsert(db, {
      eventType: "unlock_requested",
      actorRole: "deo",
      actorEmail: deo?.email,
      districtName: district.districtName,
      metadata: { reason },
    }),
  ] as unknown as Parameters<typeof db.batch>[0]);

  return NextResponse.json({ ok: true });
});
