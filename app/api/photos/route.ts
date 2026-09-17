import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { isAuthorized } from "@/lib/auth";
import { getRedis, kvKeys } from "@/lib/kv";
import type {
  PhotoCaptureSource,
  RaceIndexEntry,
  RacePhoto,
} from "@/lib/types";

// The photographer's phone has no passphrase — the token in its URL is the
// only credential, exactly as /api/wave-start works. Looked up the same way:
// a linear scan of the small races index, not a reverse-index key.
// See docs/photo-companion-design.md.

// Vercel caps a request body at 4.5MB, and both sizes of a photo arrive in
// one request. The phone downscales to a few hundred KB all in, so anything
// near this is a client that skipped the resize — refuse it here rather than
// letting the platform return an opaque 413.
const MAX_BYTES = 4 * 1024 * 1024;

// A thumbnail that isn't tiny defeats its own purpose — see
// docs/photo-companion-design.md "Two sizes, not one".
const MAX_THUMB_BYTES = 256 * 1024;

const CAPTURE_SOURCES = new Set<PhotoCaptureSource>(["exif", "file", "upload"]);

// A photo id becomes part of the blob pathname, so it is checked against the
// shape we mint (crypto.randomUUID) rather than trusted — a client-supplied
// "../" would otherwise write outside the race's folder.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A phone whose clock is out by more than this isn't drifting, it's wrong —
// and the page's clock banner will have said so. Stored anyway, but clamped
// so one absurd value can't drag a match somewhere strange.
const MAX_CLOCK_OFFSET_MS = 24 * 60 * 60 * 1000;

function blobConfigured(): boolean {
  // Either the read-write token or the store connection's own id is enough;
  // the SDK authenticates with whichever it finds.
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

async function findRaceIdByPhotoToken(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  token: string
): Promise<string | null> {
  const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
  return index.find((r) => r.photoToken === token)?.id ?? null;
}

async function findPhotoByHash(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  raceId: string,
  contentHash: string
): Promise<RacePhoto | null> {
  const hash =
    (await redis.hgetall<Record<string, RacePhoto>>(
      kvKeys.racePhotos(raceId)
    )) ?? {};
  return (
    Object.values(hash).find((p) => p.contentHash === contentHash) ?? null
  );
}

async function readPhotos(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  raceId: string
): Promise<RacePhoto[]> {
  const hash =
    (await redis.hgetall<Record<string, RacePhoto>>(
      kvKeys.racePhotos(raceId)
    )) ?? {};
  // Newest first — the review queue reads top-down as the photographer
  // uploads.
  return Object.values(hash).sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt)
  );
}

const notConfigured = (what: string) =>
  NextResponse.json({ ok: false, error: `${what} is not configured yet.` }, {
    status: 503,
  });

const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status });

// Upload, from the photographer's phone. Two sizes of the same photo arrive
// together as form fields, so a photo is either fully stored or not stored
// at all; everything else we know about it rides in the query string, which
// the phone already has. The capture time is the phone's, taken from EXIF
// before the downscale — never the moment this request landed, which on a
// hotspot says more about the signal than about the shutter.
export async function POST(request: NextRequest) {
  const redis = getRedis();
  if (!redis) return notConfigured("Backup storage");
  if (!blobConfigured()) return notConfigured("Photo storage");

  const params = request.nextUrl.searchParams;
  const token = params.get("token");
  const photoId = params.get("photoId");
  const capturedAtMs = Number(params.get("capturedAtMs"));
  const clockOffsetMs = Number(params.get("clockOffsetMs") ?? 0);
  const width = Number(params.get("width"));
  const height = Number(params.get("height"));
  const source = params.get("source") as PhotoCaptureSource | null;
  const contentHash = (params.get("contentHash") ?? "").toLowerCase();

  if (!token) return bad("Missing token.");
  if (!photoId || !UUID_RE.test(photoId)) return bad("Invalid photo id.");
  if (!Number.isFinite(capturedAtMs) || capturedAtMs <= 0) {
    return bad("Missing or invalid capture time.");
  }
  if (!Number.isFinite(clockOffsetMs)) return bad("Invalid clock offset.");
  if (!source || !CAPTURE_SOURCES.has(source)) {
    return bad("Invalid capture source.");
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return bad("Missing image dimensions.");
  }
  // Empty is allowed — a phone on an insecure origin can't hash, and that
  // costs dedupe, not the upload.
  if (contentHash && !/^[0-9a-f]{64}$/.test(contentHash)) {
    return bad("Invalid content hash.");
  }

  const raceId = await findRaceIdByPhotoToken(redis, token);
  if (!raceId) return bad("Invalid or expired link.", 404);

  // The phone skips what it already knows about before uploading anything,
  // but its list can be stale — it loads once, and a second phone or an
  // earlier session may have added photos since. Checking again here is what
  // keeps a duplicate out of the operator's review queue, and it costs two
  // blob writes less than storing one.
  if (contentHash) {
    const existing = await findPhotoByHash(redis, raceId, contentHash);
    if (existing) {
      return NextResponse.json({ ok: true, photo: existing, duplicate: true });
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Invalid upload.");
  }

  const fullPart = form.get("full");
  const thumbPart = form.get("thumb");
  if (!(fullPart instanceof Blob) || !(thumbPart instanceof Blob)) {
    return bad("Both a full-size and a thumbnail image are required.");
  }

  const full = await fullPart.arrayBuffer();
  const thumb = await thumbPart.arrayBuffer();
  if (full.byteLength === 0 || thumb.byteLength === 0) {
    return bad("Empty upload.");
  }
  if (full.byteLength + thumb.byteLength > MAX_BYTES) {
    return bad("Photo is too large — it should have been resized first.", 413);
  }
  if (thumb.byteLength > MAX_THUMB_BYTES) {
    return bad("Thumbnail is too large — it should have been resized first.");
  }
  // Only JPEG, checked by each file's own first bytes rather than a header
  // the client sets. Keeps the store to what the leaderboard can display.
  if (!isJpeg(full) || !isJpeg(thumb)) {
    return bad("Only JPEG photos are accepted.");
  }

  const options = {
    access: "public" as const,
    contentType: "image/jpeg",
    addRandomSuffix: false,
    // A retry after a response we never saw must land on the same objects
    // rather than failing as duplicates — the phone retries on any failure,
    // and the id is already unique per photo.
    allowOverwrite: true,
  };

  let url: string;
  let thumbUrl: string;
  try {
    const [stored, storedThumb] = await Promise.all([
      put(`races/${raceId}/${photoId}.jpg`, full, options),
      put(`races/${raceId}/${photoId}-thumb.jpg`, thumb, options),
    ]);
    url = stored.url;
    thumbUrl = storedThumb.url;
  } catch (error) {
    console.error("Blob upload failed:", error);
    return NextResponse.json(
      { ok: false, error: "Couldn't store the photo." },
      { status: 502 }
    );
  }

  const photo: RacePhoto = {
    id: photoId,
    url,
    thumbUrl,
    capturedAtMs,
    capturedSource: source,
    contentHash,
    clockOffsetMs: clamp(clockOffsetMs, -MAX_CLOCK_OFFSET_MS, MAX_CLOCK_OFFSET_MS),
    width: Math.round(width),
    height: Math.round(height),
    uploadedAt: new Date().toISOString(),
    status: "pending",
    entryId: null,
  };

  // A field write, not a read-modify-write of one JSON blob — two photos
  // finishing their upload together can't drop each other, same reasoning as
  // the wave-start hash.
  await redis.hset(kvKeys.racePhotos(raceId), { [photoId]: photo });

  return NextResponse.json({ ok: true, photo });
}

// Two callers, mirroring /api/wave-start: the phone (?token=, no passphrase)
// reading back what it has already sent, and the operator (?raceId=,
// passphrase-gated) loading the review queue.
export async function GET(request: NextRequest) {
  const redis = getRedis();
  if (!redis) return notConfigured("Backup storage");

  const raceIdParam = request.nextUrl.searchParams.get("raceId");
  const token = request.nextUrl.searchParams.get("token");

  let raceId: string;
  let label: string | undefined;

  if (raceIdParam) {
    if (!isAuthorized(request)) return bad("Unauthorized.", 401);
    raceId = raceIdParam;
  } else if (token) {
    const found = await findRaceIdByPhotoToken(redis, token);
    if (!found) return bad("Invalid or expired link.", 404);
    raceId = found;
    const index = (await redis.get<RaceIndexEntry[]>(kvKeys.racesIndex)) ?? [];
    label = index.find((r) => r.id === raceId)?.label;
  } else {
    return bad("Missing raceId or token.");
  }

  return NextResponse.json({
    ok: true,
    label,
    photos: await readPhotos(redis, raceId),
  });
}

// The operator's decision. entryId attaches the photo to a finisher and
// publishes it; null puts it back to pending, which is what makes approval
// reversible.
export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return bad("Unauthorized.", 401);

  const redis = getRedis();
  if (!redis) return notConfigured("Backup storage");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request.");
  }

  const { raceId, photoId, entryId } = (body ?? {}) as Record<string, unknown>;
  if (typeof raceId !== "string" || !raceId) return bad("Missing raceId.");
  if (typeof photoId !== "string" || !photoId) return bad("Missing photoId.");
  if (entryId !== null && typeof entryId !== "number") {
    return bad("entryId must be a finisher id or null.");
  }

  const existing = await redis.hget<RacePhoto>(
    kvKeys.racePhotos(raceId),
    photoId
  );
  if (!existing) return bad("No such photo.", 404);

  const photo: RacePhoto = {
    ...existing,
    status: entryId === null ? "pending" : "approved",
    entryId,
  };
  await redis.hset(kvKeys.racePhotos(raceId), { [photoId]: photo });

  return NextResponse.json({ ok: true, photo });
}

// Rejecting deletes the image, it doesn't flag it. The store is public, so a
// record marked "rejected" would leave the photo sitting at a live URL —
// see docs/photo-companion-design.md "Review".
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return bad("Unauthorized.", 401);

  const redis = getRedis();
  if (!redis) return notConfigured("Backup storage");

  const raceId = request.nextUrl.searchParams.get("raceId");
  const photoId = request.nextUrl.searchParams.get("photoId");
  if (!raceId || !photoId) return bad("Missing raceId or photoId.");

  const existing = await redis.hget<RacePhoto>(
    kvKeys.racePhotos(raceId),
    photoId
  );
  if (!existing) return bad("No such photo.", 404);

  try {
    // Both sizes, and del() is free either way.
    await del([existing.url, existing.thumbUrl].filter(Boolean));
  } catch (error) {
    // The record stays put so the photo can be deleted again — dropping it
    // here would strand a live URL with nothing pointing at it.
    console.error("Blob delete failed:", error);
    return NextResponse.json(
      { ok: false, error: "Couldn't delete the photo — it's still stored." },
      { status: 502 }
    );
  }
  await redis.hdel(kvKeys.racePhotos(raceId), photoId);

  return NextResponse.json({ ok: true });
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

function isJpeg(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes.slice(0, 3));
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}
