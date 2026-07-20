import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { users, districts, unlockRequests } from "@/db/schema";
import { withErrorHandling } from "@/lib/with-error-handling";

// The frontend is a static SPA with no server, so it can't inspect the HttpOnly session
// cookies itself — it calls this on load to learn role/districtId and gate routes. Every
// gated page passes ?role= for the cookie it expects (admin pages ask for "admin",
// /deo-data-entry asks for "deo") — see lib/session.ts for why there are two separate
// cookies instead of one shared __session. Also doubles as the source for the header's
// profile menu (district/email), so it joins districts here rather than making the frontend
// fetch a second endpoint just for that.
export const GET = withErrorHandling("auth/me", async (req: NextRequest) => {
  const role = req.nextUrl.searchParams.get("role");
  if (role !== "admin" && role !== "deo") {
    return NextResponse.json({ error: "role query param must be admin or deo" }, { status: 400 });
  }

  const session = await requireSession(req, role);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  // lockStatus/lockedAt/submittedByName let the DEO page distinguish a still-locked district
  // (show a read-only "you've locked your data" screen) from a freshly-unlocked one (fetch
  // /api/pac-data/mine and let them re-edit) right after login, instead of re-deriving it from
  // a blank local Dexie cache that a prior submit already cleared — see CLAUDE.md.
  const [row] = await db
    .select({
      email: users.email,
      name: users.name,
      designation: users.designation,
      districtName: districts.districtName,
      lockStatus: districts.lockStatus,
      lockedAt: users.lockedAt,
      submittedByName: users.submittedByName,
    })
    .from(users)
    .leftJoin(districts, eq(users.districtId, districts.id))
    .where(eq(users.id, session.userId))
    .limit(1);

  // Re-fetched on every load per CLAUDE.md's Auth section — a pending unlock request belongs
  // here rather than a second polling endpoint, since this route is already the DEO page's
  // single source of truth for lock state.
  let pendingUnlockRequest: { requestedAt: string; reason: string } | null = null;
  if (role === "deo" && session.districtId) {
    const [pending] = await db
      .select({ requestedAt: unlockRequests.requestedAt, reason: unlockRequests.reason })
      .from(unlockRequests)
      .where(and(eq(unlockRequests.districtId, session.districtId), eq(unlockRequests.status, "pending")))
      .limit(1);
    pendingUnlockRequest = pending ?? null;
  }

  return NextResponse.json({
    ...session,
    email: row?.email ?? null,
    name: row?.name ?? null,
    designation: row?.designation ?? null,
    districtName: row?.districtName ?? null,
    lockStatus: row?.lockStatus ?? null,
    lockedAt: row?.lockedAt ?? null,
    submittedByName: row?.submittedByName ?? null,
    pendingUnlockRequest,
  });
});
