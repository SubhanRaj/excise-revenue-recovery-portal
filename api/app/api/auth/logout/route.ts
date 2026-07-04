import { NextRequest, NextResponse } from "next/server";
import { destroySessionCookie } from "@/lib/session";

// ?role= says which of the two session cookies to destroy — logging out of /admin must not
// also kill a /deo-data-entry session (or vice versa) sitting in the same browser.
export async function POST(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role");
  if (role !== "admin" && role !== "deo") {
    return NextResponse.json({ error: "role query param must be admin or deo" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", destroySessionCookie(role));
  return res;
}
