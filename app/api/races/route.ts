import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getRedis, kvKeys } from "@/lib/kv";
import type { RaceIndexEntry } from "@/lib/types";

// Cheap registry listing for the operator race menu — no full snapshots.
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

  const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
  const races = [...index].sort((a, b) => b.lastSaved.localeCompare(a.lastSaved));

  return NextResponse.json({ ok: true, races });
}
