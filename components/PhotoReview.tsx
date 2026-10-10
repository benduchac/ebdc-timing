"use client";

import { useState } from "react";
import {
  findCandidates,
  nearestEntry,
  describeGap,
  DIFFERENT_DAY_MS,
  type PhotoCandidate,
  type PhotoFinisher,
} from "@/lib/photoMatch";
import { normalizeBib } from "@/lib/utils";
import type { RacePhoto } from "@/lib/types";

// The review queue itself: each photo with the riders who crossed around the
// time it was taken, to pick from or throw away. Pure display. It fetches
// nothing, so the same cards serve the operator's Photos tab (passphrase) and
// the photographer's phone (photo link): see PhotosTab and PhotoMatchView.
//
// See docs/photo-companion-design.md "Review".

// How many search results to draw at once. The list is for recognising a
// rider, not for scrolling a field of two hundred.
const PICKER_LIMIT = 12;

interface PhotoReviewProps {
  // null while the first load is in flight.
  photos: RacePhoto[] | null;
  finishers: PhotoFinisher[];
  error: string | null;
  busyId: string | null;
  emptyText: string;
  onRefresh: () => void;
  // entryId null puts the photo back to pending.
  onDecide: (photoId: string, entryId: number | null) => void;
  onReject: (photo: RacePhoto) => void;
}

export default function PhotoReview({
  photos,
  finishers,
  error,
  busyId,
  emptyText,
  onRefresh,
  onDecide,
  onReject,
}: PhotoReviewProps) {
  const entryById = new Map(finishers.map((e) => [e.id, e]));
  const pending = photos?.filter((p) => p.status === "pending") ?? [];
  const approved = photos?.filter((p) => p.status === "approved") ?? [];

  // A rider who already has a photo drops out of every other photo's
  // options. One rider, one photo — so the list of who's left shrinks as the
  // operator works through the queue, and the same person can't quietly be
  // picked twice a hundred photos apart. The search still finds them, so a
  // photo matched to the wrong rider can be swapped for the right one.
  const photoByEntry = new Map<number, RacePhoto>();
  for (const p of approved) {
    if (p.entryId !== null) photoByEntry.set(p.entryId, p);
  }
  const available = finishers.filter((e) => !photoByEntry.has(e.id));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-display uppercase tracking-tight text-xl text-moss-dark">
          Photos ({pending.length} to review)
        </h2>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 text-sm bg-moss-dark text-chalk rounded-lg font-semibold hover:bg-moss"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/40 text-danger rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {photos === null && !error && (
        <p className="text-ink-soft">Loading photos...</p>
      )}

      {photos !== null && photos.length === 0 && !error && (
        <p className="text-ink-soft">
          {emptyText}
        </p>
      )}

      {pending.length > 0 && (
        <div className="space-y-4">
          {pending.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              candidates={findCandidates(photo, available)}
              entries={available}
              finishers={finishers}
              photoByEntry={photoByEntry}
              busy={busyId === photo.id}
              onApprove={(entryId) => onDecide(photo.id, entryId)}
              onReject={() => onReject(photo)}
            />
          ))}
        </div>
      )}

      {approved.length > 0 && (
        <div className="mt-8">
          <h3 className="font-bold text-ink mb-3">
            Approved ({approved.length})
          </h3>
          <div className="space-y-2">
            {approved.map((photo) => {
              const entry =
                photo.entryId !== null ? entryById.get(photo.entryId) : null;
              return (
                <div
                  key={photo.id}
                  className="bg-success-soft border-2 border-success rounded-lg p-2 flex items-center gap-3"
                >
                  {/* The thumbnail, not the full frame — this list can run
                      to hundreds of rows. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbUrl}
                    alt=""
                    loading="lazy"
                    className="w-16 h-16 object-cover rounded shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-moss-dark truncate">
                      {entry
                        ? `#${entry.bib} ${entry.name}`
                        : "Attached to a finisher that no longer exists"}
                    </div>
                    <div className="text-xs text-ink-soft">
                      Taken {formatClock(photo.capturedAtMs)}
                    </div>
                  </div>
                  <button
                    onClick={() => onDecide(photo.id, null)}
                    disabled={busyId === photo.id}
                    className="text-sm underline text-ink-soft shrink-0 disabled:opacity-50"
                  >
                    Unapprove
                  </button>
                  <button
                    onClick={() => onReject(photo)}
                    disabled={busyId === photo.id}
                    className="text-sm underline text-danger shrink-0 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface PhotoCardProps {
  photo: RacePhoto;
  candidates: PhotoCandidate[];
  // Only riders still without a photo, for the time-based suggestions — see
  // photoByEntry above.
  entries: PhotoFinisher[];
  // Everyone, for the search.
  finishers: PhotoFinisher[];
  photoByEntry: Map<number, RacePhoto>;
  busy: boolean;
  onApprove: (entryId: number) => void;
  onReject: () => void;
}

function PhotoCard({
  photo,
  candidates,
  entries,
  finishers,
  photoByEntry,
  busy,
  onApprove,
  onReject,
}: PhotoCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  // A rider picked from the search who already has a photo, waiting on the
  // operator to compare the two.
  const [swapFor, setSwapFor] = useState<PhotoFinisher | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);

  // Riders without a photo first, since they're the usual answer; then the
  // ones who have one, for fixing a wrong match. Within each, most recent
  // first — a photo just uploaded is far likelier to belong to a rider who
  // finished a minute ago than one from the first wave.
  const allFinishers = [...finishers].sort(
    (a, b) =>
      Number(photoByEntry.has(a.id)) - Number(photoByEntry.has(b.id)) ||
      b.finishTimeMs - a.finishTimeMs
  );
  const currentPhoto = swapFor ? photoByEntry.get(swapFor.id) : undefined;

  const pick = (entry: PhotoFinisher) => {
    if (photoByEntry.has(entry.id)) {
      setShowCurrent(false);
      setSwapFor(entry);
    } else {
      onApprove(entry.id);
    }
  };

  const nearest = candidates.length === 0 ? nearestEntry(photo, entries) : null;

  const q = query.trim().toLowerCase();
  // normalizeBib so "057" finds bib 57 — entries store the stripped form,
  // and the operator is reading a number off a packet, not a database.
  const asBib = query.trim() ? normalizeBib(query) : "";
  const matches = q
    ? allFinishers.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.bib.toLowerCase().includes(q) ||
          e.bib === asBib
      )
    : allFinishers;

  return (
    <div className="border-2 border-ink/10 rounded-lg p-3 bg-chalk">
      {expanded && (
        // The full frame, fetched only once the operator asks for it — at
        // 112px they couldn't read a bib off it anyway, so loading it by
        // default spent the whole transfer for none of the detail.
        <button
          onClick={() => setExpanded(false)}
          className="block w-full mb-3"
          title="Shrink"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt=""
            className="w-full max-h-96 object-contain rounded bg-ink/5"
          />
        </button>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0"
          title={expanded ? "Shrink" : "Enlarge to read a bib"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.thumbUrl}
            alt=""
            loading="lazy"
            className="w-28 h-28 object-cover rounded"
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink">
            Taken <strong>{formatClock(photo.capturedAtMs)}</strong>
          </div>
          {photo.capturedSource !== "exif" && (
            <div className="text-xs text-clay-dark font-semibold mt-1">
              The photo carried no time of its own, so this is the file&apos;s
              date — treat the suggestions below with suspicion.
            </div>
          )}
          {Math.abs(photo.clockOffsetMs) >= 5000 && (
            <div className="text-xs text-clay-dark mt-1">
              Shot on a phone running {formatOffset(photo.clockOffsetMs)};
              already corrected for.
            </div>
          )}

          <div className="mt-2">
            {candidates.length === 0 ? (
              // Say how far off it was. "Nothing matched" on its own sends
              // the operator hunting for a bug when the answer is usually
              // that the photo is from another day, or that no finish has
              // been recorded anywhere near it yet.
              <div className="text-sm text-ink-soft">
                {!nearest ? (
                  "No finishers recorded yet, so there's nothing to match against."
                ) : (
                  <>
                    No finisher within 20 seconds. The nearest is{" "}
                    <strong>
                      #{nearest.entry.bib} {nearest.entry.name}
                    </strong>
                    , {describeGap(nearest.deltaMs)} away
                    {Math.abs(nearest.deltaMs) > DIFFERENT_DAY_MS
                      ? " — so this photo was taken on a different day, or a clock is wrong."
                      : "."}
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {candidates.map(({ entry, deltaMs }) => (
                  <button
                    key={entry.id}
                    onClick={() => onApprove(entry.id)}
                    disabled={busy}
                    className="px-3 py-1.5 text-sm bg-moss-dark text-chalk rounded-lg font-semibold hover:bg-moss disabled:opacity-50"
                  >
                    #{entry.bib} {entry.name}
                    <span className="opacity-80 font-normal">
                      {" "}
                      · {formatDelta(deltaMs)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-sm underline text-ink-soft"
            >
              {showAll ? "Hide the search" : "Someone else"}
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="text-sm underline text-danger disabled:opacity-50"
            >
              Delete photo
            </button>
          </div>

          {showAll && (
            // A dropdown of two hundred riders is unusable; typing a bib off
            // a packet, or the part of a name the operator can remember, is
            // how anyone actually finds someone.
            <div className="mt-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by bib or name"
                disabled={busy}
                autoFocus
                className="w-full border-2 border-ink/10 rounded-lg p-2 text-sm bg-chalk"
              />
              <div
                aria-label="Finisher search results"
                className="mt-1 max-h-48 overflow-y-auto border-2 border-ink/10 rounded-lg divide-y divide-ink/10"
              >
                {matches.length === 0 ? (
                  <div className="p-2 text-sm text-ink-soft">
                    No finisher matches that.
                  </div>
                ) : (
                  matches.slice(0, PICKER_LIMIT).map((entry) => {
                    const has = photoByEntry.get(entry.id);
                    return (
                      <button
                        key={entry.id}
                        onClick={() => pick(entry)}
                        disabled={busy}
                        className="w-full text-left p-2 text-sm hover:bg-sand disabled:opacity-50 flex items-center gap-2"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold">#{entry.bib}</span>{" "}
                          {entry.name}
                          <span className="text-ink-soft">
                            {" "}
                            — {entry.finishTime}
                          </span>
                          {has && (
                            <span className="block text-xs text-clay-dark font-semibold">
                              Has a photo
                            </span>
                          )}
                        </span>
                        {has && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={has.thumbUrl}
                            alt=""
                            loading="lazy"
                            className="w-10 h-10 object-cover rounded shrink-0"
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              {matches.length > PICKER_LIMIT && (
                <div className="text-xs text-ink-soft mt-1">
                  {matches.length - PICKER_LIMIT} more — keep typing to narrow
                  it down.
                </div>
              )}
            </div>
          )}

          {swapFor && currentPhoto && (
            <div
              aria-label="Swap photo"
              className="mt-2 border-2 border-clay-dark/40 rounded-lg p-2 bg-sand"
            >
              <div className="text-sm text-ink">
                <strong>
                  #{swapFor.bib} {swapFor.name}
                </strong>{" "}
                already has a photo. Use this one instead? Their current one
                goes back to the queue to be matched to someone else.
              </div>
              <div className="mt-2 flex gap-3">
                <div className="text-xs text-ink-soft text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbUrl}
                    alt=""
                    className="w-24 h-24 object-cover rounded mb-1"
                  />
                  This photo
                </div>
                <button
                  onClick={() => setShowCurrent((v) => !v)}
                  className="text-xs text-ink-soft text-center"
                  title={showCurrent ? "Shrink" : "Enlarge to read a bib"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentPhoto.thumbUrl}
                    alt=""
                    className="w-24 h-24 object-cover rounded mb-1"
                  />
                  Current photo
                </button>
              </div>
              {showCurrent && (
                // Full frame on request only, as with this card's own photo.
                <button
                  onClick={() => setShowCurrent(false)}
                  className="block w-full mt-2"
                  title="Shrink"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentPhoto.url}
                    alt=""
                    className="w-full max-h-96 object-contain rounded bg-ink/5"
                  />
                </button>
              )}
              <div className="mt-2 flex gap-2 flex-wrap">
                <button
                  onClick={() => onApprove(swapFor.id)}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm bg-moss-dark text-chalk rounded-lg font-semibold hover:bg-moss disabled:opacity-50"
                >
                  Use this one
                </button>
                <button
                  onClick={() => setSwapFor(null)}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm border-2 border-ink/10 rounded-lg font-semibold disabled:opacity-50"
                >
                  Keep current
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const formatClock = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { hour12: true });

// deltaMs is the photo's time minus the finish's. Negative is the ordinary
// direction: the shutter goes before the operator's keystroke.
const formatDelta = (deltaMs: number) => {
  const seconds = Math.abs(deltaMs / 1000).toFixed(1);
  return deltaMs <= 0 ? `${seconds}s before` : `${seconds}s after`;
};

const formatOffset = (offsetMs: number) => {
  const seconds = Math.round(Math.abs(offsetMs) / 1000);
  return offsetMs > 0 ? `${seconds}s fast` : `${seconds}s slow`;
};
