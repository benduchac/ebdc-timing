"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PublicPhoto } from "@/lib/types";

interface FinisherPhotoProps {
  photo: PublicPhoto;
  className?: string;
}

// An approved finish-line photo on the public leaderboard: the thumbnail,
// loaded lazily, and the full frame in a lightbox only when a viewer taps it.
// A lightbox rather than a new tab, because on a phone a new tab takes the
// viewer off the leaderboard and they have to find their way back.
//
// The full frame is requested only once the lightbox is open. Vercel Blob
// stops serving for 30 days if the month's transfer runs out, and a 200-rider
// board at full size would spend it in an afternoon, so `photo.url` must never
// be rendered outside the open branch below. See
// docs/photo-companion-design.md "Publishing".
export default function FinisherPhoto({ photo, className = "" }: FinisherPhotoProps) {
  const [open, setOpen] = useState(false);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while the photo is up.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const thumb = thumbRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      thumb?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={thumbRef}
        type="button"
        onClick={() => setOpen(true)}
        title="Open the full photo"
        aria-label="Open the full photo"
        className="shrink-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.thumbUrl}
          alt=""
          loading="lazy"
          className={`object-cover rounded ${className}`}
        />
      </button>
      {open &&
        createPortal(
          // Above the brand sticker (z-40). Tapping the dark area closes it;
          // tapping the photo does not, so a pinch to zoom can't dismiss it.
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Finish-line photo"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center p-3"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close photo"
              className="absolute top-3 right-3 w-11 h-11 rounded-full bg-chalk text-ink text-2xl leading-none font-bold shadow-lg"
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt=""
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded"
            />
          </div>,
          document.body
        )}
    </>
  );
}
