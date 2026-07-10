import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getRedis, kvKeys } from "@/lib/kv";
import type { RaceIndexEntry, RaceSnapshot } from "@/lib/types";

// Capped rolling history so a corrupt or accidental overwrite can be rolled
// back — see docs/race-readiness-design.md "Storage".
const MAX_HISTORY = 20;

function isValidSnapshotBody(body: unknown): body is RaceSnapshot {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.raceId === "string" &&
    b.raceId.length > 0 &&
    typeof b.label === "string" &&
    typeof b.createdAt === "string" &&
    !!b.waveStartTimes &&
    typeof b.waveStartTimes === "object" &&
    Array.isArray(b.registrants) &&
    Array.isArray(b.entries) &&
    typeof b.entryCounter === "number"
  );
}

// Best-effort write from the operator app on every state change. Only an
// HTTP 200 here means the client's sync badge may turn green — see "Backup
// sync behavior" in the design doc.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 }
    );
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { ok: false, error: "Backup storage is not configured yet." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 }
    );
  }

  if (!isValidSnapshotBody(body)) {
    return NextResponse.json(
      { ok: false, error: "Malformed snapshot." },
      { status: 400 }
    );
  }

  const snapshot: RaceSnapshot = { ...body, lastSaved: new Date().toISOString() };

  await redis.set(kvKeys.raceLatest(snapshot.raceId), snapshot);
  await redis.lpush(kvKeys.raceHistory(snapshot.raceId), snapshot);
  await redis.ltrim(kvKeys.raceHistory(snapshot.raceId), 0, MAX_HISTORY - 1);

  // Registry read-modify-write isn't atomic; acceptable for the single-active-
  // operator model this app assumes (see "Honest limitations").
  const index =
    (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
  const nextIndex = index.filter((r) => r.id !== snapshot.raceId);
  nextIndex.push({
    id: snapshot.raceId,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
    lastSaved: snapshot.lastSaved,
    entryCount: snapshot.entries.length,
  });
  await redis.set(kvKeys.racesIndex, nextIndex);

  return NextResponse.json({ ok: true, lastSaved: snapshot.lastSaved });
}

// Private restore read — pulls a race's latest snapshot back down (recovery
// path when a machine is lost/cleared/replaced).
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 }
    );
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { ok: false, error: "Backup storage is not configured yet." },
      { status: 503 }
    );
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing id." },
      { status: 400 }
    );
  }

  const snapshot = await redis.get<RaceSnapshot>(kvKeys.raceLatest(id));
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "No backup found for that race." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, snapshot });
}
