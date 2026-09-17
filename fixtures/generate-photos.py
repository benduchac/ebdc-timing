#!/usr/bin/env python3
"""Regenerates the photo fixtures under fixtures/photos/.

Two JPEGs for the finish-line photo companion: one carrying a real EXIF
DateTimeOriginal, one carrying none. See fixtures/README.md for what each
proves. Both are a plain gradient — nothing here is testing what the picture
looks like, only how big it is and what metadata rides along with it.

No third-party imaging library: the PNG is built by hand (zlib is
stdlib), macOS's sips converts it to JPEG, and the EXIF block is spliced in
afterwards. Re-running reproduces the same files byte for byte.

Usage: python3 fixtures/generate-photos.py
"""

import struct
import subprocess
import tempfile
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).parent / "photos"

# Deliberately larger than the 1600px long edge the phone resizes to, so the
# downscale path is actually exercised rather than skipped.
WIDTH, HEIGHT = 2400, 1600

# Fixed, and in a zone with a known UTC offset: 2026-10-10 09:15:42 -07:00 is
# 16:15:42 UTC. The e2e test asserts against that, so it can't pass by
# accidentally agreeing with itself.
DATE_TIME_ORIGINAL = b"2026:10:10 09:15:42\x00"
OFFSET_TIME_ORIGINAL = b"-07:00\x00"


def png_chunk(kind: bytes, data: bytes) -> bytes:
    body = kind + data
    return (
        struct.pack(">I", len(data))
        + body
        + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    )


def make_png() -> bytes:
    rows = bytearray()
    for y in range(HEIGHT):
        rows.append(0)  # filter byte: none
        for x in range(WIDTH):
            rows += bytes(
                ((x * 255) // WIDTH, (y * 255) // HEIGHT, 128)
            )
    header = struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(bytes(rows), 6))
        + png_chunk(b"IEND", b"")
    )


def make_exif_app1() -> bytes:
    """A minimal little-endian TIFF block holding just the two time tags.

    Layout, all offsets from the start of the TIFF header:
      0   "II", 0x002A, IFD0 offset (8)
      8   IFD0: one entry, the pointer to the EXIF sub-IFD at 26
      26  EXIF sub-IFD: DateTimeOriginal and OffsetTimeOriginal
      56  the DateTimeOriginal string
      76  the OffsetTimeOriginal string
    """
    date_at, offset_at = 56, 76

    ifd0 = struct.pack("<H", 1)
    ifd0 += struct.pack("<HHII", 0x8769, 4, 1, 26)  # ExifIFDPointer -> 26
    ifd0 += struct.pack("<I", 0)  # no next IFD

    sub = struct.pack("<H", 2)
    sub += struct.pack("<HHII", 0x9003, 2, len(DATE_TIME_ORIGINAL), date_at)
    sub += struct.pack("<HHII", 0x9011, 2, len(OFFSET_TIME_ORIGINAL), offset_at)
    sub += struct.pack("<I", 0)

    tiff = b"II" + struct.pack("<HI", 0x002A, 8) + ifd0 + sub
    assert len(tiff) == date_at, f"date lands at {len(tiff)}, not {date_at}"
    tiff += DATE_TIME_ORIGINAL
    assert len(tiff) == offset_at, f"offset lands at {len(tiff)}, not {offset_at}"
    tiff += OFFSET_TIME_ORIGINAL

    payload = b"Exif\x00\x00" + tiff
    return b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        png_path = Path(tmp) / "source.png"
        jpg_path = Path(tmp) / "source.jpg"
        png_path.write_bytes(make_png())
        subprocess.run(
            ["sips", "-s", "format", "jpeg", str(png_path), "--out", str(jpg_path)],
            check=True,
            capture_output=True,
        )
        plain = jpg_path.read_bytes()

    assert plain[:2] == b"\xff\xd8", "sips didn't produce a JPEG"

    (OUT_DIR / "finish-no-exif.jpg").write_bytes(plain)
    # Straight after the SOI marker, ahead of whatever segments sips wrote.
    (OUT_DIR / "finish-with-exif.jpg").write_bytes(
        plain[:2] + make_exif_app1() + plain[2:]
    )

    for name in ("finish-with-exif.jpg", "finish-no-exif.jpg"):
        size = (OUT_DIR / name).stat().st_size
        print(f"{name}: {size // 1024}KB")


if __name__ == "__main__":
    main()
