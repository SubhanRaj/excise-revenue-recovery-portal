import { NextResponse } from "next/server";
import { destroySessionCookie } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", destroySessionCookie());
  return res;
}
