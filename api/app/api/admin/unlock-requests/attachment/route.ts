import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { unlockRequests } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { withErrorHandling } from "@/lib/with-error-handling";

// Takes the request `id`, never a raw R2 key from the client — attachmentKey is looked up
// server-side, so an admin can't probe for objects outside what a real request row points at
// (see CLAUDE.md's Security section). The bucket itself has no public access/CORS, so this
// route is the only path to an object.
export const GET = withErrorHandling("admin/unlock-requests/attachment", async (req: NextRequest) => {
  const session = await requireSession(req, "admin");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({ attachmentKey: unlockRequests.attachmentKey, attachmentFilename: unlockRequests.attachmentFilename })
    .from(unlockRequests)
    .where(eq(unlockRequests.id, id))
    .limit(1);
  if (!row?.attachmentKey) {
    return NextResponse.json({ error: "No attachment for this request" }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  const object = await env.ATTACHMENTS.get(row.attachmentKey);
  if (!object) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const filename = (row.attachmentFilename ?? "attachment.pdf").replace(/["\\]/g, "");
  return new NextResponse(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
