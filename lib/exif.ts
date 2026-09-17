// Reads a photo's capture time out of its EXIF block. This runs on the
// phone, before the downscale re-encode throws EXIF away (see
// components/PhotoUploadView.tsx) — and the re-encode dropping it is also
// what keeps GPS coordinates off the server.
//
// Two tags only, so this stays a few dozen lines instead of a dependency.
// Anything unexpected returns null and the caller falls back to the file's
// own modified time. See docs/photo-companion-design.md "Capture time".

const JPEG_SOI = 0xffd8;
const MARKER_APP1 = 0xffe1;
const MARKER_SOS = 0xffda;

const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TYPE_ASCII = 2;

// Where the photographer's time came from, carried through to the operator's
// review card so a bad match can be read rather than guessed at.
export type PhotoCaptureSource = "exif" | "file" | "upload";

export interface CaptureTime {
  capturedAtMs: number;
  source: PhotoCaptureSource;
}

interface ExifTimes {
  dateTimeOriginal: string; // "2026:10:10 09:15:42"
  offsetTimeOriginal?: string; // "-07:00", present on recent phones only
}

// EXIF sits in the first segment of the file, well inside this. A phone
// photo is several megabytes we have no reason to pull into memory twice.
const EXIF_HEAD_BYTES = 128 * 1024;

export async function resolveCaptureTime(file: File): Promise<CaptureTime> {
  try {
    const head = await file.slice(0, EXIF_HEAD_BYTES).arrayBuffer();
    const times = readExifTimes(head);
    if (times) {
      const ms = parseExifDateTime(
        times.dateTimeOriginal,
        times.offsetTimeOriginal
      );
      if (ms !== null) return { capturedAtMs: ms, source: "exif" };
    }
  } catch {
    // Unreadable head — fall through to the file's own timestamp.
  }

  // A screenshot or a re-saved image has no EXIF. lastModified is worse
  // (it can be the moment the file was copied, not shot) but it is usually
  // the right day, which is enough for the operator to judge.
  if (file.lastModified > 0) {
    return { capturedAtMs: file.lastModified, source: "file" };
  }
  return { capturedAtMs: Date.now(), source: "upload" };
}

// "2026:10:10 09:15:42" plus an optional "-07:00". With the offset this is
// an absolute instant. Without it — and most cameras still don't write it —
// the only sane reading is the phone's own timezone, which is where the
// photo was taken.
export function parseExifDateTime(
  dateTime: string,
  offset?: string
): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(
    dateTime.trim()
  );
  if (!m) return null;

  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  // An unset EXIF date is written as all zeros; the month check catches it.
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 60) return null;

  const trimmed = offset?.trim();
  const zone = trimmed && /^[+-]\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;

  const ms = zone
    ? Date.parse(
        `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(
          minute
        )}:${pad(second)}${zone}`
      )
    : new Date(year, month - 1, day, hour, minute, second).getTime();

  return Number.isFinite(ms) ? ms : null;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function readExifTimes(buffer: ArrayBuffer): ExifTimes | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== JPEG_SOI) return null;

  // Everything ahead of the image data is a length-prefixed segment, so
  // this skips from marker to marker rather than scanning bytes.
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) return null; // lost the boundary
    if (marker === MARKER_SOS) return null; // image data — no EXIF in this file

    const length = view.getUint16(offset + 2);
    if (length < 2) return null;

    if (
      marker === MARKER_APP1 &&
      offset + 10 <= view.byteLength &&
      view.getUint32(offset + 4) === 0x45786966 && // "Exif"
      view.getUint16(offset + 8) === 0x0000
    ) {
      return readTiff(view, offset + 10);
    }
    offset += 2 + length;
  }
  return null;
}

// Offsets inside the EXIF block are all relative to the start of its TIFF
// header, not to the file, so tiffStart is threaded through everything here.
function readTiff(view: DataView, tiffStart: number): ExifTimes | null {
  if (tiffStart + 8 > view.byteLength) return null;

  const endian = view.getUint16(tiffStart);
  if (endian !== 0x4949 && endian !== 0x4d4d) return null;
  const little = endian === 0x4949;
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;

  const ifd0 = tiffStart + view.getUint32(tiffStart + 4, little);
  const pointer = findEntry(view, ifd0, little, TAG_EXIF_IFD_POINTER);
  if (pointer === null) return null;

  // Both tags we want live in the EXIF sub-IFD, never in IFD0.
  const exifIfd = tiffStart + view.getUint32(pointer + 8, little);
  const dateTimeOriginal = readAscii(
    view,
    tiffStart,
    exifIfd,
    little,
    TAG_DATE_TIME_ORIGINAL
  );
  if (!dateTimeOriginal) return null;

  const offsetTimeOriginal = readAscii(
    view,
    tiffStart,
    exifIfd,
    little,
    TAG_OFFSET_TIME_ORIGINAL
  );
  return {
    dateTimeOriginal,
    offsetTimeOriginal: offsetTimeOriginal ?? undefined,
  };
}

// Returns the offset of the 12-byte directory entry for a tag: 2 tag,
// 2 type, 4 count, 4 value-or-offset.
function findEntry(
  view: DataView,
  ifd: number,
  little: boolean,
  tag: number
): number | null {
  if (ifd < 0 || ifd + 2 > view.byteLength) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) return null;
    if (view.getUint16(entry, little) === tag) return entry;
  }
  return null;
}

function readAscii(
  view: DataView,
  tiffStart: number,
  ifd: number,
  little: boolean,
  tag: number
): string | null {
  const entry = findEntry(view, ifd, little, tag);
  if (entry === null) return null;
  if (view.getUint16(entry + 2, little) !== TYPE_ASCII) return null;

  const count = view.getUint32(entry + 4, little);
  // Both tags are short fixed-width strings; anything longer is a file we
  // don't understand, not a date.
  if (count === 0 || count > 64) return null;

  // Four bytes or fewer are stored in the entry itself; more is an offset.
  const start =
    count <= 4 ? entry + 8 : tiffStart + view.getUint32(entry + 8, little);
  if (start < 0 || start + count > view.byteLength) return null;

  let out = "";
  for (let i = 0; i < count; i++) {
    const c = view.getUint8(start + i);
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out.trim() || null;
}
