import type { Entry } from "./db";
import type { RacePhoto } from "./types";

// What matching and the review card need to know about a finisher. The
// operator tab has whole Entry records; the photographer's phone is sent only
// these fields (never age or anything from the registrant list), and both go
// through the same code.
export type PhotoFinisher = Pick<
  Entry,
  "id" | "bib" | "name" | "finishTime" | "finishTimeMs"
>;

// Pairs a photo with the finishers who crossed around the time it was taken.
// See docs/photo-companion-design.md "Matching".

// Wide enough to cover the gap between the shutter and the operator's
// keystroke plus the slop in two clocks. In a pack finish it returns several
// riders on purpose — this ranks, the operator picks.
export const PHOTO_MATCH_WINDOW_MS = 20_000;

export interface PhotoCandidate {
  entry: PhotoFinisher;
  // Signed: negative means the photo was taken before the finish was
  // recorded, which is the normal direction (the operator types after the
  // rider crosses).
  deltaMs: number;
}

// The phone's clock error, measured at upload, taken back off the capture
// time. Measured then rather than at capture — over one race morning that's
// close enough, and every match is confirmed by hand anyway.
export function correctedCaptureMs(
  photo: Pick<RacePhoto, "capturedAtMs" | "clockOffsetMs">
): number {
  return photo.capturedAtMs - photo.clockOffsetMs;
}

export function findCandidates(
  photo: Pick<RacePhoto, "capturedAtMs" | "clockOffsetMs">,
  entries: PhotoFinisher[],
  windowMs: number = PHOTO_MATCH_WINDOW_MS
): PhotoCandidate[] {
  const captured = correctedCaptureMs(photo);

  return entries
    .filter((entry) => Number.isFinite(entry.finishTimeMs))
    .map((entry) => ({ entry, deltaMs: captured - entry.finishTimeMs }))
    .filter((candidate) => Math.abs(candidate.deltaMs) <= windowMs)
    .sort(
      (a, b) =>
        Math.abs(a.deltaMs) - Math.abs(b.deltaMs) ||
        // Stable order for two finishers the same distance either side, so
        // the review card doesn't reshuffle between renders.
        a.entry.finishTimeMs - b.entry.finishTimeMs ||
        a.entry.id - b.entry.id
    );
}

// Beyond this, a photo and a finish aren't a near miss — they're from
// different days, which is nearly always a wrong device clock or a photo
// picked from an earlier shoot.
export const DIFFERENT_DAY_MS = 12 * 60 * 60 * 1000;

// The closest finisher regardless of the window. The review card falls back
// to this when nothing matched, so "no match" can say how far off it was
// rather than leaving the operator to guess whether the problem is seconds
// or days.
export function nearestEntry(
  photo: Pick<RacePhoto, "capturedAtMs" | "clockOffsetMs">,
  entries: PhotoFinisher[]
): PhotoCandidate | null {
  const captured = correctedCaptureMs(photo);
  let best: PhotoCandidate | null = null;
  for (const entry of entries) {
    if (!Number.isFinite(entry.finishTimeMs)) continue;
    const deltaMs = captured - entry.finishTimeMs;
    if (!best || Math.abs(deltaMs) < Math.abs(best.deltaMs)) {
      best = { entry, deltaMs };
    }
  }
  return best;
}

// A coarse description of how far a photo sits from a finish. Deliberately
// not formatDurationHMS, which renders a race duration: "144h 0m 0s" is a
// worse answer to "why did nothing match?" than "about 6 days".
export function describeGap(ms: number): string {
  const seconds = Math.round(Math.abs(ms) / 1000);
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

// The records a matching decision writes. entryId attaches the photo to a
// finisher; null puts it back to pending. Attaching also sends any other
// photo already approved for that finisher back to pending, so a rider
// never ends up with two: the review card offers a swap, and the laptop and
// the photographer's phone can each pick the same rider at once. The caller
// writes every record returned in one HSET, so the swap can't half-happen.
// Returns null when the photo isn't in the list.
export function decidePhoto(
  photos: RacePhoto[],
  photoId: string,
  entryId: number | null
): { photo: RacePhoto; displaced: RacePhoto[] } | null {
  const existing = photos.find((p) => p.id === photoId);
  if (!existing) return null;

  const photo: RacePhoto = {
    ...existing,
    status: entryId === null ? "pending" : "approved",
    entryId,
  };
  const displaced =
    entryId === null
      ? []
      : photos
          .filter(
            (p) =>
              p.id !== photoId &&
              p.status === "approved" &&
              p.entryId === entryId
          )
          .map((p) => ({ ...p, status: "pending" as const, entryId: null }));
  return { photo, displaced };
}
