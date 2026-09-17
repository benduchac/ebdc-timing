"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveCaptureTime, type PhotoCaptureSource } from "@/lib/exif";
import { hashFile } from "@/lib/photoHash";
import { verifySystemClock, getClockSeverity } from "@/lib/utils";
import type { ClockCheckResult, RacePhoto } from "@/lib/types";
import { CheckIcon, WarningIcon } from "@/components/icons";

// Phone-first page for the photographer at the finish line: pick a batch of
// shots, watch them upload. The capture time comes out of each file's EXIF
// before the resize throws it away — never from when the upload landed,
// which on a hotspot says more about the signal than about the shutter.
// See docs/photo-companion-design.md.
//
// Built for someone with a hundred-odd photos and no memory of which ones
// they already sent. The iOS picker has no "select all", so the workable
// move is to swipe across the whole roll every time; that only works if
// re-picking something is free, which is what the dedupe is for. Everything
// already uploaded shows in a grid, so "did they make it?" is answerable
// without scrolling a list of a hundred rows.

// Every photo is sent twice, at two sizes, and both are made here while the
// phone still has the original decoded — going back for a second size later
// would mean re-uploading the whole race.
//
// The full frame: roughly 250-450KB against multi-megabyte originals, which
// is the difference between a batch that lands over a hotspot and one that
// doesn't. Shown when the operator reviews it, or when a viewer taps a
// thumbnail.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

// The thumbnail, ~20KB, and the only size the public leaderboard loads. Not
// an optimization: Vercel Blob's Hobby plan stops serving once a month's
// 10GB of transfer is spent, and full frames would burn that in an
// afternoon. See docs/photo-companion-design.md "Two sizes, not one".
const THUMB_EDGE = 320;
const THUMB_QUALITY = 0.72;

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;

type ItemStatus =
  | "preparing" // reading EXIF and resizing, on the phone
  | "queued"
  | "sending"
  | "retrying"
  | "failed"; // permanently — see sendItem

// Only work in progress. A photo that lands leaves this list and joins the
// grid below, which is what keeps the page readable at a hundred photos.
interface QueueItem {
  id: string; // becomes the photo id, so it must be a real randomUUID
  name: string;
  previewUrl: string | null;
  capturedAtMs: number | null;
  source: PhotoCaptureSource | null;
  contentHash: string;
  width: number;
  height: number;
  status: ItemStatus;
  error?: string;
}

interface PhotoUploadViewProps {
  token: string;
  raceLabel: string;
}

export default function PhotoUploadView({
  token,
  raceLabel,
}: PhotoUploadViewProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [uploaded, setUploaded] = useState<RacePhoto[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(
    null
  );
  const [clockCheck, setClockCheck] = useState<ClockCheckResult | null>(null);
  const [checkingClock, setCheckingClock] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobsRef = useRef(new Map<string, Blob>());
  const thumbsRef = useRef(new Map<string, Blob>());
  const attemptsRef = useRef(new Map<string, number>());
  const retryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const sendingRef = useRef(false);
  // A mirror of items for the send path, which needs the current row without
  // re-creating itself (and the pump effect) on every status change.
  const itemsRef = useRef<QueueItem[]>([]);
  const clockOffsetRef = useRef(0);
  // Every photo this race is known to hold, by content hash — seeded from
  // the server on load, and added to as uploads land and as files are
  // picked, so re-picking is free both across sessions and within one.
  const knownHashesRef = useRef(new Set<string>());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const runClockCheck = useCallback(async () => {
    setCheckingClock(true);
    const result = await verifySystemClock();
    setClockCheck(result);
    // Offline, this stays at whatever the last successful check measured —
    // which beats assuming zero on a phone already known to be off.
    if (typeof result.offsetMs === "number") {
      clockOffsetRef.current = result.offsetMs;
    }
    setCheckingClock(false);
  }, []);

  useEffect(() => {
    runClockCheck();
  }, [runClockCheck]);

  // What the race already has. Powers both the grid and the dedupe; if this
  // fails (offline, or storage not configured) the page still works, it just
  // re-uploads photos the server then recognises and refuses.
  useEffect(() => {
    fetch(`/api/photos?token=${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.ok) return;
        const photos: RacePhoto[] = data.photos ?? [];
        setUploaded(photos);
        photos.forEach((p) => {
          if (p.contentHash) knownHashesRef.current.add(p.contentHash);
        });
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    const timers = retryTimersRef.current;
    const blobs = blobsRef.current;
    const thumbs = thumbsRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      itemsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      blobs.clear();
      thumbs.clear();
    };
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const finishItem = useCallback((id: string, photo?: RacePhoto) => {
    blobsRef.current.delete(id);
    thumbsRef.current.delete(id);
    attemptsRef.current.delete(id);
    if (photo) {
      if (photo.contentHash) knownHashesRef.current.add(photo.contentHash);
      setUploaded((prev) =>
        prev.some((p) => p.id === photo.id) ? prev : [photo, ...prev]
      );
    }
    setItems((prev) => {
      const done = prev.find((i) => i.id === id);
      if (done?.previewUrl) URL.revokeObjectURL(done.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const sendItem = useCallback(
    async (id: string) => {
      const blob = blobsRef.current.get(id);
      const thumb = thumbsRef.current.get(id);
      const item = itemsRef.current.find((i) => i.id === id);

      if (!blob || !thumb || !item || item.capturedAtMs === null || !item.source) {
        patchItem(id, { status: "failed", error: "Couldn't read this photo." });
        sendingRef.current = false;
        return;
      }

      const query = new URLSearchParams({
        token,
        photoId: id,
        capturedAtMs: String(item.capturedAtMs),
        clockOffsetMs: String(Math.round(clockOffsetRef.current)),
        source: item.source,
        width: String(item.width),
        height: String(item.height),
        contentHash: item.contentHash,
      });

      // Both sizes in one request, so a photo is either fully stored or not
      // stored at all — two requests could leave a frame on the leaderboard
      // with no thumbnail, or a thumbnail with nothing behind it.
      const form = new FormData();
      form.append("full", blob);
      form.append("thumb", thumb);

      try {
        const res = await fetch(`/api/photos?${query}`, {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          // A bad link or a rejected file will never succeed, so retrying
          // just burns the battery and hides the reason. Only a server-side
          // or transport failure is worth coming back to.
          const permanent =
            res.status >= 400 &&
            res.status < 500 &&
            res.status !== 408 &&
            res.status !== 429;
          if (permanent) {
            const message = await res
              .json()
              .then((d) => d?.error)
              .catch(() => null);
            patchItem(id, {
              status: "failed",
              error: message || `Refused (${res.status}).`,
            });
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        // data.duplicate means the server already had this one — it comes
        // back with the stored record, so it lands in the grid either way.
        if (data.duplicate) setSkipped((prev) => prev + 1);
        finishItem(id, data.photo as RacePhoto | undefined);
      } catch {
        const attempt = attemptsRef.current.get(id) ?? 0;
        attemptsRef.current.set(id, attempt + 1);
        patchItem(id, { status: "retrying" });

        const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
        retryTimersRef.current.set(
          id,
          setTimeout(() => {
            retryTimersRef.current.delete(id);
            setItems((prev) =>
              prev.map((i) =>
                i.id === id && i.status === "retrying"
                  ? { ...i, status: "queued" }
                  : i
              )
            );
          }, delay)
        );
      } finally {
        sendingRef.current = false;
      }
    },
    [finishItem, patchItem, token]
  );

  // One upload at a time. A phone on a hotspot gets a whole photo through
  // faster in sequence than six of them fighting for the same trickle, and
  // the list reads as real progress instead of nine things at 40%.
  useEffect(() => {
    if (sendingRef.current) return;
    const next = items.find((i) => i.status === "queued");
    if (!next) return;

    sendingRef.current = true;
    patchItem(next.id, { status: "sending" });
    void sendItem(next.id);
  }, [items, patchItem, sendItem]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList);

    // Hash first, decide second. Everything already uploaded drops out here,
    // before the expensive part, so re-picking the whole roll costs a read
    // per photo rather than a decode, a resize and an upload.
    setChecking({ done: 0, total: files.length });
    const fresh: { file: File; hash: string }[] = [];
    let duplicates = 0;

    for (let i = 0; i < files.length; i++) {
      const hash = await hashFile(files[i]);
      if (hash && knownHashesRef.current.has(hash)) {
        duplicates++;
      } else {
        // Added now, not on success, so the same file picked twice in one
        // batch only goes up once.
        if (hash) knownHashesRef.current.add(hash);
        fresh.push({ file: files[i], hash: hash ?? "" });
      }
      setChecking({ done: i + 1, total: files.length });
    }
    setChecking(null);
    if (duplicates > 0) setSkipped((prev) => prev + duplicates);
    if (fresh.length === 0) return;

    const staged: QueueItem[] = fresh.map(({ file, hash }) => ({
      id: crypto.randomUUID(),
      name: file.name,
      previewUrl: null,
      capturedAtMs: null,
      source: null,
      contentHash: hash,
      width: 0,
      height: 0,
      status: "preparing",
    }));
    setItems((prev) => [...prev, ...staged]);

    // Sequential on purpose: decoding several full-size photos at once is
    // what makes a phone stutter or run out of memory mid-batch.
    for (let i = 0; i < fresh.length; i++) {
      const { file } = fresh[i];
      const { id } = staged[i];
      try {
        const capture = await resolveCaptureTime(file);
        const { full, thumb } = await downscale(file);
        blobsRef.current.set(id, full.blob);
        thumbsRef.current.set(id, thumb.blob);
        patchItem(id, {
          previewUrl: URL.createObjectURL(thumb.blob),
          capturedAtMs: capture.capturedAtMs,
          source: capture.source,
          width: full.width,
          height: full.height,
          status: "queued",
        });
      } catch {
        patchItem(id, {
          status: "failed",
          error: "Couldn't read this photo.",
        });
      }
    }
  };

  const retryFailed = (id: string) => {
    attemptsRef.current.set(id, 0);
    patchItem(id, { status: "queued", error: undefined });
  };

  const clockSeverity = getClockSeverity(clockCheck);
  const outstanding = items.filter((i) => i.status !== "failed").length;

  return (
    <div className="min-h-screen bg-moss-dark p-4 flex flex-col items-center">
      <div className="w-full max-w-md">
        <div className="text-center text-chalk pt-6 pb-4">
          <div className="font-mono text-xs tracking-[0.25em] uppercase opacity-80">
            C510
          </div>
          <h1 className="font-display uppercase tracking-tight text-2xl mt-1">
            {raceLabel}
          </h1>
          <div className="text-sm text-sand/90 mt-1">Finish line photos</div>
        </div>

        {/* The photo's own clock is what every match is built on, so a phone
            that's off gets caught here rather than in the results. */}
        <div
          className={`rounded-lg p-3 mb-4 text-sm flex items-center gap-2 ${
            clockSeverity === "fine"
              ? "bg-success-soft text-moss-dark"
              : clockSeverity === "caution"
              ? "bg-warning-soft text-clay-dark"
              : clockSeverity === "alert"
              ? "bg-danger-soft text-danger"
              : "bg-chalk/90 text-ink-soft"
          }`}
        >
          {clockSeverity === "fine" ? (
            <CheckIcon className="w-4 h-4 shrink-0" />
          ) : (
            <WarningIcon className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1">
            {checkingClock
              ? "Checking phone clock..."
              : clockSeverity === "fine"
              ? "Phone clock OK"
              : clockSeverity === "unknown"
              ? "Can't verify phone clock — offline?"
              : `Phone clock is off by ~${clockCheck?.diffSeconds}s — photos are corrected by this much`}
          </span>
          <button
            onClick={runClockCheck}
            disabled={checkingClock}
            className="underline text-xs shrink-0"
          >
            Recheck
          </button>
        </div>

        <input
          ref={fileInputRef}
          id="photoInput"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Cleared so picking the same file twice still fires a change.
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={checking !== null}
          className="w-full rounded-xl p-5 bg-chalk border-2 border-ink/10 active:border-clay text-center disabled:opacity-60"
        >
          <div className="font-display uppercase tracking-tight text-2xl text-moss-dark">
            Add photos
          </div>
          <div className="text-ink-soft mt-1">
            {checking
              ? `Checking ${checking.done} of ${checking.total}...`
              : "Select everything — anything already sent is skipped"}
          </div>
        </button>

        {skipped > 0 && (
          <div className="text-sand/80 text-sm text-center mt-3">
            Skipped {skipped} photo{skipped === 1 ? "" : "s"} already uploaded.
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-5 space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg p-2 flex items-center gap-3 border-2 ${
                  item.status === "failed"
                    ? "bg-danger-soft border-danger/60"
                    : item.status === "retrying"
                    ? "bg-danger-soft border-danger/40"
                    : "bg-chalk border-ink/10"
                }`}
              >
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="w-14 h-14 object-cover rounded shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded bg-sand shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{item.name}</div>
                  <div className="text-xs mt-0.5">
                    {item.status === "preparing" && (
                      <span className="text-ink-soft">Reading...</span>
                    )}
                    {item.status === "queued" && (
                      <span className="text-ink-soft">Waiting to send</span>
                    )}
                    {item.status === "sending" && (
                      <span className="text-ink-soft">Sending...</span>
                    )}
                    {item.status === "retrying" && (
                      <span className="text-danger font-semibold">
                        Not sent yet, retrying...
                      </span>
                    )}
                    {item.status === "failed" && (
                      <span className="text-danger font-semibold">
                        {item.error ?? "Failed."}
                      </span>
                    )}
                  </div>
                </div>

                {item.status === "failed" && (
                  <button
                    onClick={() => retryFailed(item.id)}
                    className="text-xs underline text-danger shrink-0"
                  >
                    Try again
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {uploaded.length > 0 && (
          <div className="mt-6">
            <div className="text-chalk text-sm mb-2">
              {uploaded.length} uploaded
            </div>
            {/* Thumbnails, not full frames — a hundred of these is about 2MB,
                a hundred of the originals would be 35. */}
            <div className="grid grid-cols-4 gap-1.5">
              {uploaded.map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.id}
                  src={photo.thumbUrl}
                  alt=""
                  loading="lazy"
                  className="w-full aspect-square object-cover rounded"
                />
              ))}
            </div>
          </div>
        )}

        <p className="text-sand/70 text-xs text-center mt-6 pb-6">
          {outstanding > 0
            ? "Keep this page open until the list above is empty — closing it loses whatever hasn't gone yet."
            : "Photos go to the operator, who matches each one to a rider before it appears anywhere."}
        </p>
      </div>
    </div>
  );
}

interface Resized {
  blob: Blob;
  width: number;
  height: number;
}

// Decodes the original once and draws it twice. Re-encoding also drops EXIF,
// and with it the GPS coordinates a phone writes into every shot — so
// location never reaches the server.
async function downscale(
  file: File
): Promise<{ full: Resized; thumb: Resized }> {
  // from-image so a photo shot in portrait doesn't arrive on its side; the
  // rotation lives in EXIF, which the canvas is about to discard.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    return {
      full: await render(bitmap, MAX_EDGE, JPEG_QUALITY),
      thumb: await render(bitmap, THUMB_EDGE, THUMB_QUALITY),
    };
  } finally {
    bitmap.close();
  }
}

async function render(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number
): Promise<Resized> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d canvas context");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Couldn't encode the resized photo");
  return { blob, width, height };
}
