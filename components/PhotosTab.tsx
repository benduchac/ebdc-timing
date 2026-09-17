"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredPassphrase } from "./OperatorGate";
import {
  findCandidates,
  nearestEntry,
  describeGap,
  DIFFERENT_DAY_MS,
  type PhotoCandidate,
} from "@/lib/photoMatch";
import { normalizeBib } from "@/lib/utils";
import type { Entry } from "@/lib/db";
import type { RacePhoto } from "@/lib/types";

// The operator's review queue for finish-line photos. Each one arrives with
// the time it was taken; this pairs it with the riders who crossed around
// then and lets the operator pick, or throw the photo away.
//
// This tab owns its own data, which every other tab deliberately does not
// (see CLAUDE.md — app/operator/page.tsx owns all state). Photos are not
// part of the race snapshot and never touch IndexedDB: they exist only in
// the cloud, they are worthless offline, and nothing in the timing path
// reads them. Hoisting the fetching and polling into page.tsx would put
// network machinery in the one file that has to stay dependable on race
// day, and buy nothing.
//
// See docs/photo-companion-design.md "Review".

// Only while the tab is open. Photo review is a post-race job; a background
// poll would be spending a hotspot the scoring needs.
const REFRESH_MS = 20_000;

// How many search results to draw at once. The list is for recognising a
// rider, not for scrolling a field of two hundred.
const PICKER_LIMIT = 12;

interface PhotosTabProps {
  raceId: string;
  entries: Entry[];
}

export default function PhotosTab({ raceId, entries }: PhotosTabProps) {
  const [photos, setPhotos] = useState<RacePhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const passphrase = getStoredPassphrase();
    if (!passphrase) {
      setError("Locked — unlock the operator app to review photos.");
      return;
    }
    try {
      const res = await fetch(
        `/api/photos?raceId=${encodeURIComponent(raceId)}`,
        { headers: { Authorization: `Bearer ${passphrase}` } }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Couldn't load photos (${res.status}).`);
        return;
      }
      setPhotos(data.photos);
      setError(null);
    } catch {
      setError("Can't reach the photo queue — this tab needs a connection.");
    }
  }, [raceId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const decide = async (photoId: string, entryId: number | null) => {
    const passphrase = getStoredPassphrase();
    if (!passphrase) return;
    setBusyId(photoId);
    try {
      const res = await fetch("/api/photos", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${passphrase}`,
        },
        body: JSON.stringify({ raceId, photoId, entryId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error ?? "Couldn't save that.");
        return;
      }
      setPhotos((prev) =>
        prev
          ? prev.map((p) => (p.id === photoId ? (data.photo as RacePhoto) : p))
          : prev
      );
    } catch {
      alert("Couldn't reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (photo: RacePhoto) => {
    // Deleting the image is the point — the store is public, so leaving the
    // file behind would leave it reachable by anyone holding its URL.
    if (
      !confirm(
        "Delete this photo for good? It's removed from storage, not just hidden."
      )
    ) {
      return;
    }
    const passphrase = getStoredPassphrase();
    if (!passphrase) return;
    setBusyId(photo.id);
    try {
      const res = await fetch(
        `/api/photos?raceId=${encodeURIComponent(
          raceId
        )}&photoId=${encodeURIComponent(photo.id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${passphrase}` } }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error ?? "Couldn't delete that.");
        return;
      }
      setPhotos((prev) => (prev ? prev.filter((p) => p.id !== photo.id) : prev));
    } catch {
      alert("Couldn't reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  const entryById = new Map(entries.map((e) => [e.id, e]));
  const pending = photos?.filter((p) => p.status === "pending") ?? [];
  const approved = photos?.filter((p) => p.status === "approved") ?? [];

  // A rider who already has a photo drops out of every other photo's
  // options. One rider, one photo — so the list of who's left shrinks as the
  // operator works through the queue, and the same person can't quietly be
  // picked twice a hundred photos apart. Swapping in a better shot means
  // unapproving the first, which puts that rider back in the list.
  const spokenFor = new Set(
    approved
      .map((p) => p.entryId)
      .filter((id): id is number => id !== null)
  );
  const available = entries.filter((e) => !spokenFor.has(e.id));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-display uppercase tracking-tight text-xl text-moss-dark">
          Photos ({pending.length} to review)
        </h2>
        <button
          onClick={load}
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
          No photos yet. Share the upload link from Settings with whoever is
          shooting the finish line.
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
              spokenForCount={spokenFor.size}
              busy={busyId === photo.id}
              onApprove={(entryId) => decide(photo.id, entryId)}
              onReject={() => reject(photo)}
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
                    onClick={() => decide(photo.id, null)}
                    disabled={busyId === photo.id}
                    className="text-sm underline text-ink-soft shrink-0 disabled:opacity-50"
                  >
                    Unapprove
                  </button>
                  <button
                    onClick={() => reject(photo)}
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
  // Only riders still without a photo — see spokenFor in PhotosTab.
  entries: Entry[];
  spokenForCount: number;
  busy: boolean;
  onApprove: (entryId: number) => void;
  onReject: () => void;
}

function PhotoCard({
  photo,
  candidates,
  entries,
  spokenForCount,
  busy,
  onApprove,
  onReject,
}: PhotoCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  // Most recent first — a photo just uploaded is far likelier to belong to a
  // rider who finished a minute ago than one from the first wave.
  const allFinishers = [...entries].sort(
    (a, b) => b.finishTimeMs - a.finishTimeMs
  );

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
                    No rider without a photo matches that.
                  </div>
                ) : (
                  matches.slice(0, PICKER_LIMIT).map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => onApprove(entry.id)}
                      disabled={busy}
                      className="w-full text-left p-2 text-sm hover:bg-sand disabled:opacity-50"
                    >
                      <span className="font-semibold">#{entry.bib}</span>{" "}
                      {entry.name}
                      <span className="text-ink-soft">
                        {" "}
                        — {entry.finishTime}
                      </span>
                    </button>
                  ))
                )}
              </div>
              {matches.length > PICKER_LIMIT && (
                <div className="text-xs text-ink-soft mt-1">
                  {matches.length - PICKER_LIMIT} more — keep typing to narrow
                  it down.
                </div>
              )}
              {spokenForCount > 0 && (
                <div className="text-xs text-ink-soft mt-1">
                  {spokenForCount} rider{spokenForCount === 1 ? "" : "s"}{" "}
                  already {spokenForCount === 1 ? "has" : "have"} a photo and
                  aren&apos;t listed.
                </div>
              )}
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
