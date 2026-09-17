import type { Entry } from "./db";
import type { RacePhoto } from "./types";

// Pairs a photo with the finishers who crossed around the time it was taken.
// See docs/photo-companion-design.md "Matching".

// Wide enough to cover the gap between the shutter and the operator's
// keystroke plus the slop in two clocks. In a pack finish it returns several
// riders on purpose — this ranks, the operator picks.
export const PHOTO_MATCH_WINDOW_MS = 20_000;

export interface PhotoCandidate {
  entry: Entry;
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
  entries: Entry[],
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
