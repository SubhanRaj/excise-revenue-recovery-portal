import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "@/lib/db";
import { users, magicLinkTokens } from "@/db/schema";

const TOKEN_TTL_MINUTES = 15;

export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email?: unknown };

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Always return 200 regardless of match — do not leak which emails are registered.
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();
  await db.insert(magicLinkTokens).values({ userId: user.id, token, expiresAt });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const verifyUrl = `${process.env.FRONTEND_URL}/verify?token=${token}`;

  await resend.emails.send({
    // ponytail: mail.upexciseonline.co isn't a verified Resend domain yet, so this falls
    // back to Resend's shared sandbox sender — switch FROM_EMAIL once the domain is verified.
    from: process.env.FROM_EMAIL ?? "onboarding@resend.dev",
    to: email,
    subject: "Excise Revenue Recovery Portal — Login Link",
    html: `
      <p>Click the link below to sign in. It expires in ${TOKEN_TTL_MINUTES} minutes.</p>
      <p><a href="${verifyUrl}">Verify &amp; Continue</a></p>
    `,
  });

  return NextResponse.json({ ok: true });
}
