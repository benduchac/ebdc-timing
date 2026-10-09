import type { PhotosByEntry, RacePhoto } from "./types";

// Which photos the public leaderboard shows: approved ones, attached to a
// finisher who is on the page. A photo hangs off an entry that is already
// public, so nothing new is exposed. Pending photos never are.
// See docs/photo-companion-design.md "Publishing".
export function approvedPhotosByEntry(
  photos: RacePhoto[],
  shownEntryIds: Set<number>
): PhotosByEntry {
  const byEntry: PhotosByEntry = {};
  // Oldest first, so if two approved photos ever share a finisher the most
  // recent upload wins.
  const approved = photos
    .filter((p) => p.status === "approved" && p.entryId !== null)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  for (const p of approved) {
    if (p.entryId !== null && shownEntryIds.has(p.entryId)) {
      byEntry[p.entryId] = { thumbUrl: p.thumbUrl, url: p.url };
    }
  }
  return byEntry;
}
