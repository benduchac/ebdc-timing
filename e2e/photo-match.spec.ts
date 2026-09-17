import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { readExifTimes, parseExifDateTime } from "../lib/exif";
import {
  findCandidates,
  correctedCaptureMs,
  nearestEntry,
  describeGap,
} from "../lib/photoMatch";
import type { Entry } from "../lib/db";

// Pure-function tests — no page, no server. Both halves of photo matching
// are decidable without a network, which matters because the authorized
// upload round trip isn't reachable in this environment (no Redis, no Blob;
// same limit e2e/wave-start.spec.ts documents).

const entry = (id: number, bib: string, finishTimeMs: number): Entry => ({
  id,
  bib,
  wave: "A",
  name: `Rider ${bib}`,
  finishTime: new Date(finishTimeMs).toISOString(),
  finishTimeMs,
  elapsedTime: "00:30:00",
  elapsedMs: 1_800_000,
  timestamp: new Date(finishTimeMs).toISOString(),
});

const T = Date.UTC(2026, 9, 10, 16, 15, 42);

test.describe("findCandidates", () => {
  const entries = [
    entry(1, "101", T - 30_000), // outside the window
    entry(2, "102", T - 3_000), // 3s before the shutter
    entry(3, "103", T + 1_000), // 1s after
    entry(4, "104", T + 25_000), // outside
  ];

  test("returns only finishers inside the window, nearest first", () => {
    const found = findCandidates(
      { capturedAtMs: T, clockOffsetMs: 0 },
      entries
    );
    expect(found.map((c) => c.entry.bib)).toEqual(["103", "102"]);
    expect(found[0].deltaMs).toBe(-1_000);
    expect(found[1].deltaMs).toBe(3_000);
  });

  test("takes the phone's clock error back off the capture time", () => {
    // A phone 25s fast: the raw capture time lands past every finisher, and
    // only the correction brings it back onto the real ones.
    const fast = { capturedAtMs: T + 25_000, clockOffsetMs: 25_000 };
    expect(correctedCaptureMs(fast)).toBe(T);
    expect(
      findCandidates(fast, entries).map((c) => c.entry.bib)
    ).toEqual(["103", "102"]);

    // Same photo with the error ignored matches the wrong rider.
    expect(
      findCandidates(
        { capturedAtMs: T + 25_000, clockOffsetMs: 0 },
        entries
      ).map((c) => c.entry.bib)
    ).toEqual(["104"]);
  });

  test("returns nothing when no finisher is close", () => {
    expect(
      findCandidates({ capturedAtMs: T + 600_000, clockOffsetMs: 0 }, entries)
    ).toEqual([]);
  });

  test("ignores entries with no usable finish time", () => {
    const broken = [{ ...entry(5, "105", T), finishTimeMs: NaN }];
    expect(findCandidates({ capturedAtMs: T, clockOffsetMs: 0 }, broken)).toEqual(
      []
    );
  });
});

test.describe("parseExifDateTime", () => {
  test("an offset tag makes the time absolute", () => {
    expect(parseExifDateTime("2026:10:10 09:15:42", "-07:00")).toBe(T);
  });

  test("without an offset it reads in this machine's timezone", () => {
    expect(parseExifDateTime("2026:10:10 09:15:42")).toBe(
      new Date(2026, 9, 10, 9, 15, 42).getTime()
    );
  });

  test("refuses an unset or malformed date", () => {
    // Cameras write all zeros when the clock has never been set.
    expect(parseExifDateTime("0000:00:00 00:00:00")).toBeNull();
    expect(parseExifDateTime("not a date")).toBeNull();
    expect(parseExifDateTime("2026:13:10 09:15:42")).toBeNull();
  });
});

test.describe("readExifTimes", () => {
  const load = (name: string) => {
    const buf = readFileSync(resolve(__dirname, "../fixtures/photos", name));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  };

  test("pulls both time tags out of a real JPEG", () => {
    const times = readExifTimes(load("finish-with-exif.jpg"));
    expect(times).toEqual({
      dateTimeOriginal: "2026:10:10 09:15:42",
      offsetTimeOriginal: "-07:00",
    });
    expect(
      parseExifDateTime(times!.dateTimeOriginal, times!.offsetTimeOriginal)
    ).toBe(T);
  });

  test("returns null for a JPEG with no EXIF rather than throwing", () => {
    expect(readExifTimes(load("finish-no-exif.jpg"))).toBeNull();
  });

  test("returns null for bytes that aren't a JPEG at all", () => {
    expect(readExifTimes(new TextEncoder().encode("nope").buffer)).toBeNull();
  });
});

test.describe("nearestEntry", () => {
  const entries = [
    entry(1, "101", T - 6 * 24 * 60 * 60 * 1000),
    entry(2, "102", T - 4 * 60 * 60 * 1000),
    entry(3, "103", T + 90 * 60 * 1000),
  ];

  test("finds the closest finisher with no window at all", () => {
    // 90 minutes after beats 4 hours before, which beats 6 days before.
    const found = nearestEntry({ capturedAtMs: T, clockOffsetMs: 0 }, entries);
    expect(found?.entry.bib).toBe("103");
    expect(found?.deltaMs).toBe(-90 * 60 * 1000);
  });

  test("is null when there is nothing to compare against", () => {
    expect(nearestEntry({ capturedAtMs: T, clockOffsetMs: 0 }, [])).toBeNull();
  });
});

test.describe("describeGap", () => {
  test("reads as a person would say it, at every scale", () => {
    expect(describeGap(8_000)).toBe("8 seconds");
    expect(describeGap(-8_000)).toBe("8 seconds"); // direction is shown elsewhere
    expect(describeGap(20 * 60_000)).toBe("20 minutes");
    expect(describeGap(5 * 3_600_000)).toBe("5 hours");
    expect(describeGap(6 * 24 * 3_600_000)).toBe("6 days");
  });
});
