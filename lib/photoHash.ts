import type { RacePhoto } from "./types";

// A photo's identity, for spotting one that's already been uploaded.
//
// The photographer is expected to re-pick the whole camera roll every time
// rather than remember which shots they already sent — that's the point of
// the dedupe, and it's what makes a 100-photo batch one swipe instead of a
// hundred taps. So this has to be right.
//
// The whole file, not a cheap prefix: a false positive means a photo is
// silently never uploaded, and losing a frame is worse than the second or
// two this costs. It's also cheaper than it looks, because a duplicate is
// skipped before the expensive part — decoding and resizing — ever runs.
export async function hashFile(file: File): Promise<string | null> {
  // Absent on an insecure origin. Dedupe turns off rather than blocking the
  // upload; the server checks again anyway.
  if (!globalThis.crypto?.subtle) return null;
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer()
    );
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

// Likely copies among photos already uploaded, for the review queue's
// duplicate sweep. Two ways to be a copy:
//
// - "file": the same contentHash. What the upload check above should have
//   caught, so these only exist if it was skipped (two uploads racing, or a
//   phone that couldn't hash).
// - "shot": the same capture second and the same width and height. Catches a
//   photo re-picked as different bytes — iOS converts HEIC to JPEG on each
//   pick, so the hash can differ for the same frame. Two real shots in one
//   second (a burst) match too, so these are for the operator to look at,
//   never to delete unseen.
//
// Upload-time captures are left out of "shot": that time is when the request
// landed, not when the shutter fired.
export type DuplicateKind = "file" | "shot";

export interface DuplicateGroup {
  kind: DuplicateKind;
  // Approved first, then by upload time — so photos[0] is the one to keep
  // unless the operator says otherwise.
  photos: RacePhoto[];
  // More than one rider holds a photo in this group: the same frame was
  // approved twice. No default keep then; someone has to look.
  conflict: boolean;
}

export function findDuplicateGroups(photos: RacePhoto[]): DuplicateGroup[] {
  // Union-find over photo ids, joined by either key.
  const parent = new Map<string, string>(photos.map((p) => [p.id, p.id]));
  const root = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(id, r);
    return r;
  };
  const join = (a: string, b: string) => parent.set(root(a), root(b));

  const firstByKey = new Map<string, string>();
  const link = (key: string, id: string) => {
    const seen = firstByKey.get(key);
    if (seen) join(id, seen);
    else firstByKey.set(key, id);
  };
  for (const p of photos) {
    if (p.contentHash) link(`hash:${p.contentHash}`, p.id);
    if (p.capturedSource !== "upload") {
      link(`shot:${p.capturedAtMs}:${p.width}x${p.height}`, p.id);
    }
  }

  const byRoot = new Map<string, RacePhoto[]>();
  for (const p of photos) {
    const r = root(p.id);
    byRoot.set(r, [...(byRoot.get(r) ?? []), p]);
  }

  return [...byRoot.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const sorted = [...group].sort(
        (a, b) =>
          Number(b.status === "approved") - Number(a.status === "approved") ||
          a.uploadedAt.localeCompare(b.uploadedAt)
      );
      const hashes = new Set(group.map((p) => p.contentHash));
      const riders = new Set(
        group.filter((p) => p.status === "approved").map((p) => p.entryId)
      );
      return {
        kind:
          hashes.size === 1 && !hashes.has("") ? ("file" as const) : ("shot" as const),
        photos: sorted,
        conflict: riders.size > 1,
      };
    })
    .sort((a, b) => a.photos[0].capturedAtMs - b.photos[0].capturedAtMs);
}
