import { NextRequest, NextResponse } from "next/server";

// Session auth travels as a Bearer token (Authorization header), not a cookie — see
// lib/session.ts / lib/auth-guard.ts — so requests carry no ambient browser credential and
// CORS has nothing sensitive to gate: a wildcard origin can't be used to steal a token that's
// never automatically attached. This also sidesteps the old origin-echo dance breaking on
// browsers/profiles that block third-party cookies (Safari ITP, Chrome Incognito, etc.),
// which is what motivated dropping cookies in the first place. If this app ever moves to a
// custom domain fronting both apps on one zone, cookies (HttpOnly, SameSite=Lax/Strict) would
// become the more secure option again — see CLAUDE.md's Auth section.
function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return withCors(new NextResponse(null, { status: 204 }));
  }
  return withCors(NextResponse.next());
}

export const config = { matcher: "/api/:path*" };
