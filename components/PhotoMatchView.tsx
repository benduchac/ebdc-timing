"use client";

import { useCallback, useEffect, useState } from "react";
import PhotoReview from "./PhotoReview";
import type { PhotoFinisher } from "@/lib/photoMatch";
import type { RacePhoto } from "@/lib/types";

// The photographer's Match view: the same review cards as the operator's
// Photos tab, run from the photo link instead of the passphrase, so the
// person shooting the finish line can match their own photos on their phone
// and nobody has to leave the scoring laptop for it. Finishers come from the
// race snapshot the laptop syncs, so a rider appears a moment after the
// laptop records them.
//
// See docs/photo-companion-design.md "Review".

// Same cadence as the operator tab, and only while this view is showing:
// the phone is on the same cell service the laptop's sync needs.
const REFRESH_MS = 20_000;

interface PhotoMatchViewProps {
  token: string;
  // False while the Upload view is showing. The view stays mounted either way,
  // so a half-typed search survives a trip to the Upload view.
  active: boolean;
}

export default function PhotoMatchView({ token, active }: PhotoMatchViewProps) {
  const [photos, setPhotos] = useState<RacePhoto[] | null>(null);
  const [finishers, setFinishers] = useState<PhotoFinisher[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/photos?token=${encodeURIComponent(token)}&finishers=1`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Couldn't load photos (${res.status}).`);
        return;
      }
      setPhotos(data.photos);
      setFinishers(data.finishers ?? []);
      setError(null);
    } catch {
      setError("Can't reach the server. Matching needs a connection.");
    }
  }, [token]);

  useEffect(() => {
    if (!active) return;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const decide = async (photoId: string, entryId: number | null) => {
    setBusyId(photoId);
    try {
      const res = await fetch("/api/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, photoId, entryId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't save that.");
        return;
      }
      setError(null);
      setPhotos((prev) =>
        prev
          ? prev.map((p) => (p.id === photoId ? (data.photo as RacePhoto) : p))
          : prev
      );
    } catch {
      setError("Couldn't reach the server, so that wasn't saved.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (photo: RacePhoto) => {
    // Deleting the image is the point: the store is public, so leaving the
    // file behind would leave it reachable by anyone holding its URL.
    if (
      !confirm(
        "Delete this photo for good? It's removed from storage, not just hidden."
      )
    ) {
      return;
    }
    setBusyId(photo.id);
    try {
      const res = await fetch(
        `/api/photos?token=${encodeURIComponent(
          token
        )}&photoId=${encodeURIComponent(photo.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't delete that.");
        return;
      }
      setError(null);
      setPhotos((prev) => (prev ? prev.filter((p) => p.id !== photo.id) : prev));
    } catch {
      setError("Couldn't reach the server, so that wasn't deleted.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 pb-8">
      <div className="bg-chalk rounded-lg p-3">
        <PhotoReview
          photos={photos}
          finishers={finishers}
          error={error}
          busyId={busyId}
          emptyText="No photos yet. Upload some from the Upload view."
          onRefresh={load}
          onDecide={decide}
          onReject={reject}
        />
      </div>
    </div>
  );
}
