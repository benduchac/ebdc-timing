import { getRedis, kvKeys } from "./kv";
import { approvedPhotosByEntry } from "./publicPhotos";
import type {
  PhotosByEntry,
  RaceIndexEntry,
  RacePhoto,
  RaceSnapshot,
} from "./types";

// Server-side reads for the public pages: the leaderboard (/[slug]) and its
// TV view (/[slug]/tv).

// Throws on an actual storage problem (Redis unreachable/unconfigured) so
// the page can tell that apart from a genuine bad slug — both used to
// collapse into the same "race not found," which reads as a bad URL when
// it might be a quota or outage the operator needs to know about instead.
export async function loadRaceBySlug(slug: string): Promise<RaceSnapshot | null> {
  const redis = getRedis();
  if (!redis) throw new Error("Backup storage is not configured.");

  const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
  const entry = index.find((r) => r.slug === slug);
  if (!entry) return null;

  return (await redis.get<RaceSnapshot>(kvKeys.raceLatest(entry.id))) ?? null;
}

// Approved photos for the finishers on the page, keyed by entry id. A photo
// problem must never take the results down with it, so any failure here is an
// empty set: the board simply shows no pictures.
export async function loadApprovedPhotos(
  raceId: string,
  shownEntryIds: Set<number>
): Promise<PhotosByEntry> {
  try {
    const redis = getRedis();
    if (!redis) return {};
    const hash =
      (await redis.hgetall<Record<string, RacePhoto>>(
        kvKeys.racePhotos(raceId)
      )) ?? {};
    return approvedPhotosByEntry(Object.values(hash), shownEntryIds);
  } catch {
    return {};
  }
}
