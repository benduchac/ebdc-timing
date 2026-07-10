import { NextRequest, NextResponse } from "next/server";
import { checkSecret } from "@/lib/auth";

// Bootstrap check for OperatorGate: validates the passphrase once so the
// client knows it's safe to cache. Ongoing privileged requests (backup,
// races) send the same passphrase as a Bearer token instead — see
// docs/race-readiness-design.md "Auth model".
export async function POST(request: NextRequest) {
  if (!process.env.PUBLISH_SECRET) {
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

  if (typeof passphrase !== "string" || !checkSecret(passphrase)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect passphrase." },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
