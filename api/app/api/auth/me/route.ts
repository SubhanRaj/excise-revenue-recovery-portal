import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";

// The frontend is a static SPA with no server, so it can't inspect the HttpOnly
// __session cookie itself — it calls this on load to learn role/districtId and gate routes.
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(session);
}
