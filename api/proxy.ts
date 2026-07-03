import { NextRequest, NextResponse } from "next/server";

// Frontend (Pages) and API (Worker) are deployed as separate origins, so every
// /api/* response needs explicit CORS — credentials mode forbids the "*" wildcard.
function withCors(res: NextResponse, origin: string | null) {
  if (origin && origin === process.env.FRONTEND_URL) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return res;
}

export function proxy(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return withCors(new NextResponse(null, { status: 204 }), origin);
  }
  return withCors(NextResponse.next(), origin);
}

export const config = { matcher: "/api/:path*" };
