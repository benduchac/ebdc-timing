import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// Every privileged write/read validates the same shared passphrase against
// PUBLISH_SECRET — see docs/race-readiness-design.md "Auth model". This is
// the server-side boundary; the client-side OperatorGate is hygiene only.

export function checkSecret(candidate: string): boolean {
  const secret = process.env.PUBLISH_SECRET;
  if (!secret) return false;
  return safeCompare(candidate, secret);
}

// Privileged API routes expect the passphrase as a Bearer token — the same
// value OperatorGate cached in localStorage after the initial POST /api/auth
// check.
export function isAuthorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return checkSecret(header.slice("Bearer ".length));
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
