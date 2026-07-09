import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Validates the shared operator passphrase against PUBLISH_SECRET. This is
// the only place the secret is compared — the client never sees it, only a
// pass/fail. See docs/race-readiness-design.md "Auth model": this endpoint
// is the client-side gate's bootstrap check; the real boundary is every
// privileged write/read validating the same secret server-side.
export async function POST(request: NextRequest) {
  const secret = process.env.PUBLISH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Operator access is not configured yet." },
      { status: 503 }
    );
  }

  let passphrase: unknown;
  try {
    const body = await request.json();
    passphrase = body?.passphrase;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 }
    );
  }

  if (typeof passphrase !== "string" || !safeCompare(passphrase, secret)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect passphrase." },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}

// Constant-time compare so response timing doesn't leak how many leading
// characters of a guess were correct.
function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
