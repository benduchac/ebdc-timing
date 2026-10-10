"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredPassphrase } from "./OperatorGate";
import PhotoReview from "./PhotoReview";
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
      // The photo itself, plus any the finisher had before, now pending.
      const updated = new Map<string, RacePhoto>(
        [data.photo as RacePhoto, ...((data.displaced ?? []) as RacePhoto[])].map(
          (p) => [p.id, p]
        )
      );
      setPhotos((prev) =>
        prev ? prev.map((p) => updated.get(p.id) ?? p) : prev
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

  return (
    <PhotoReview
      photos={photos}
      finishers={entries}
      error={error}
      busyId={busyId}
      emptyText="No photos yet. Share the upload link from Settings with whoever is shooting the finish line."
      onRefresh={load}
      onDecide={decide}
      onReject={reject}
    />
  );
}
