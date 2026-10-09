import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getRedis, kvKeys } from "@/lib/kv";
import { assignSlug } from "@/lib/slug";
import { isWriteAllowed } from "@/lib/syncGuard";
import type { RaceIndexEntry, RaceSnapshot } from "@/lib/types";

// Capped rolling history so a corrupt or accidental overwrite can be rolled
// back — see docs/race-readiness-design.md "Storage". A snapshot is pushed on
// every change, so during scoring the cap is measured in finishers, not hours:
// at 20 it covered about 20 riders, a few minutes, which is shorter than it
// takes to notice a bad overwrite. 200 covers a whole race at roughly 35KB a
// snapshot.
const MAX_HISTORY = 200;

// What the client actually sends — slug, the two tokens, and lastSaved are
// always server-assigned, never trusted from the client (see lib/slug.ts).
type SnapshotPayload = Omit<
  RaceSnapshot,
  "slug" | "startToken" | "photoToken" | "lastSaved"
> & {
  // Sent for the write check only; baseSavedAt is never stored.
  baseSavedAt?: string | null;
};

function isValidSnapshotBody(body: unknown): body is SnapshotPayload {
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

  // Every sync must say which device it is from. Without it the write check
  // has nothing to compare, and storing an empty id would leave the race
  // looking "written before devices were tracked", which lets any device
  // overwrite it (lib/syncGuard.ts). The app always sends one, so what lands
  // here is a copy of the app from before the check, still cached on a
  // laptop; the message tells the operator how to fix it.
  if (typeof body.writerId !== "string" || body.writerId.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This copy of the app is out of date. Reload the page while online, then it will sync.",
      },
      { status: 400 }
    );
  }

  // Registry read-modify-write isn't atomic; acceptable for the single-active-
  // operator model this app assumes (see "Honest limitations").
  const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
  const existing = index.find((r) => r.id === body.raceId);
  // Slug and both tokens are each assigned once, on first sync, and never
  // recomputed — a later label edit (not currently possible in the UI, but
  // just in case) must not silently change a race's public URL, and a
  // start-line or photo link already handed to a volunteer must keep
  // working. A race that predates the photo token picks one up here on its
  // next sync, so nothing needs migrating.
  const slug =
    existing?.slug ??
    assignSlug(
      body.label,
      new Set(index.map((r) => r.slug))
    );
  const startToken = existing?.startToken ?? crypto.randomUUID();
  const photoToken = existing?.photoToken ?? crypto.randomUUID();

  // Refuse a write from a device that has not seen the copy now in the cloud.
  // Checked against the registry entry, which carries the same lastSaved and
  // writerId as the snapshot, so it costs no extra read. Nothing is written,
  // so a refused write never reaches the history list either.
  if (!isWriteAllowed(existing, body)) {
    return NextResponse.json(
      {
        ok: false,
        conflict: true,
        error:
          "Another computer has newer results for this race. Syncing is stopped so nothing is overwritten.",
        lastSaved: existing?.lastSaved,
      },
      { status: 409 }
    );
  }

  const { baseSavedAt: _baseSavedAt, ...snapshotBody } = body;
  void _baseSavedAt;
  const snapshot: RaceSnapshot = {
    ...snapshotBody,
    slug,
    startToken,
    photoToken,
    lastSaved: new Date().toISOString(),
  };

  await redis.set(kvKeys.raceLatest(snapshot.raceId), snapshot);
  await redis.lpush(kvKeys.raceHistory(snapshot.raceId), snapshot);
  await redis.ltrim(kvKeys.raceHistory(snapshot.raceId), 0, MAX_HISTORY - 1);

  const nextIndex = index.filter((r) => r.id !== snapshot.raceId);
  nextIndex.push({
    id: snapshot.raceId,
    label: snapshot.label,
    slug: snapshot.slug,
    startToken: snapshot.startToken,
    photoToken: snapshot.photoToken,
    createdAt: snapshot.createdAt,
    lastSaved: snapshot.lastSaved,
    entryCount: snapshot.entries.length,
    writerId: snapshot.writerId,
  });
  await redis.set(kvKeys.racesIndex, nextIndex);

  return NextResponse.json({
    ok: true,
    lastSaved: snapshot.lastSaved,
    slug: snapshot.slug,
    startToken: snapshot.startToken,
    photoToken: snapshot.photoToken,
  });
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
