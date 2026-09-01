import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getRedis, kvKeys } from "@/lib/kv";
import type { RaceIndexEntry, WaveStarts } from "@/lib/types";

const WAVES = new Set(["A", "B", "C"]);

// The start-line phone has no passphrase — the token in its URL is the only
// credential (see docs/race-readiness-design.md "Wave start line"). Looked
// up the same way app/[slug]/page.tsx looks up a race by public slug: a
// linear scan of the small races index, not a reverse-index key.
async function findRaceIdByToken(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  token: string
): Promise<string | null> {
  const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
  return index.find((r) => r.startToken === token)?.id ?? null;
}

// Posted by the start-line phone when a wave is released. No operator
// passphrase — the token is the credential. The timestamp is captured
// client-side, at the moment of the tap, and sent as-is: a server-side
// timestamp would be skewed by however long the request took to arrive on a
// mobile hotspot, which is exactly the imprecision this page exists to avoid.
export async function POST(request: NextRequest) {
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

  const { token, wave, timestampMs } = (body ?? {}) as Record<string, unknown>;
  if (typeof token !== "string" || !token) {
    return NextResponse.json(
      { ok: false, error: "Missing token." },
      { status: 400 }
    );
  }
  if (typeof wave !== "string" || !WAVES.has(wave)) {
    return NextResponse.json(
      { ok: false, error: "Wave must be A, B, or C." },
      { status: 400 }
    );
  }
  if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid timestamp." },
      { status: 400 }
    );
  }

  const raceId = await findRaceIdByToken(redis, token);
  if (!raceId) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired link." },
      { status: 404 }
    );
  }

  const startedAt = new Date(timestampMs).toISOString();
  // A hash field write, not a read-modify-write of a JSON blob — two waves
  // posted close together (or a retry racing a fresh tap) can't clobber each
  // other's field.
  await redis.hset(kvKeys.raceWaveStarts(raceId), { [wave]: startedAt });

  return NextResponse.json({ ok: true, wave, startedAt });
}

// Two callers: the start-line phone (?token=, no passphrase — same
// credential as POST) reading its own race's state on load, and the
// operator's page (?raceId=, passphrase-gated) polling for updates to adopt.
export async function GET(request: NextRequest) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { ok: false, error: "Backup storage is not configured yet." },
      { status: 503 }
    );
  }

  const raceIdParam = request.nextUrl.searchParams.get("raceId");
  const token = request.nextUrl.searchParams.get("token");

  let raceId: string;
  let label: string | undefined;

  if (raceIdParam) {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized." },
        { status: 401 }
      );
    }
    raceId = raceIdParam;
  } else if (token) {
    const found = await findRaceIdByToken(redis, token);
    if (!found) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired link." },
        { status: 404 }
      );
    }
    raceId = found;
    const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
    label = index.find((r) => r.id === raceId)?.label;
  } else {
    return NextResponse.json(
      { ok: false, error: "Missing raceId or token." },
      { status: 400 }
    );
  }

  const waveStarts =
    (await redis.hgetall<WaveStarts>(kvKeys.raceWaveStarts(raceId))) ?? {};

  return NextResponse.json({ ok: true, label, waveStarts });
}
