"use client";

import FinisherPhoto from "./FinisherPhoto";
import { findDuplicateGroups } from "@/lib/photoHash";
import type { PhotoFinisher } from "@/lib/photoMatch";
import type { RacePhoto } from "@/lib/types";

// The duplicate sweep at the top of the review queue: groups of photos that
// look like copies of one frame, side by side, with a Keep button under each.
// Keeping one deletes the rest of its group. Deleting is per group and only
// after the operator has seen the photos, because a "same shot" group can be
// two real frames from a burst. See findDuplicateGroups.

interface PhotoDuplicatesProps {
  photos: RacePhoto[];
  entryById: Map<number, PhotoFinisher>;
  busy: boolean;
  // The rest of a group, once the operator has picked the one to keep.
  onDeleteCopies: (extras: RacePhoto[]) => void;
}

export default function PhotoDuplicates({
  photos,
  entryById,
  busy,
  onDeleteCopies,
}: PhotoDuplicatesProps) {
  const groups = findDuplicateGroups(photos);

  if (groups.length === 0) {
    return (
      <div
        aria-label="Duplicate photos"
        className="border-2 border-ink/10 rounded-lg p-3 mb-4 text-sm text-ink-soft"
      >
        No duplicates among {photos.length} photo
        {photos.length === 1 ? "" : "s"}.
      </div>
    );
  }

  const extraCount = groups.reduce((n, g) => n + g.photos.length - 1, 0);

  return (
    <div aria-label="Duplicate photos" className="mb-6 space-y-3">
      <div className="text-sm text-ink">
        <strong>
          {groups.length} group{groups.length === 1 ? "" : "s"}
        </strong>{" "}
        of likely copies, {extraCount} extra photo
        {extraCount === 1 ? "" : "s"} in all. Tap a photo to see it full size,
        then keep one from each group; the others are deleted.
      </div>
      {groups.map((group) => (
        <div
          key={group.photos[0].id}
          className="border-2 border-clay-dark/40 rounded-lg p-3 bg-sand"
        >
          <div className="text-sm font-semibold text-ink">
            {group.kind === "file"
              ? "The same file, uploaded more than once."
              : "Taken in the same second, at the same size. Check they're the same shot."}
          </div>
          {group.conflict && (
            <div className="text-sm text-danger font-semibold mt-1">
              Approved to more than one rider. Keeping one takes the photo off
              the others.
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {group.photos.map((photo, i) => {
              const entry =
                photo.entryId !== null ? entryById.get(photo.entryId) : null;
              const suggested = i === 0 && !group.conflict;
              return (
                <div key={photo.id} className="text-xs text-ink-soft">
                  <FinisherPhoto
                    photo={photo}
                    className="w-full aspect-[4/3] block"
                    buttonClassName="block w-full"
                  />
                  <div className="mt-1">
                    {photo.status === "approved"
                      ? entry
                        ? `Approved: #${entry.bib} ${entry.name}`
                        : "Approved"
                      : "Pending"}
                  </div>
                  <div>Uploaded {formatClock(photo.uploadedAt)}</div>
                  <button
                    onClick={() =>
                      onDeleteCopies(
                        group.photos.filter((p) => p.id !== photo.id)
                      )
                    }
                    disabled={busy}
                    className={`mt-1 px-3 py-1.5 text-sm rounded-lg font-semibold disabled:opacity-50 ${
                      suggested
                        ? "bg-moss-dark text-chalk hover:bg-moss"
                        : "border-2 border-ink/10 text-ink"
                    }`}
                  >
                    {suggested ? "Keep this one (suggested)" : "Keep this one"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour12: true });
