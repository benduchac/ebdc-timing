import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { approvedPhotosByEntry } from "../lib/publicPhotos";
import type { RacePhoto } from "../lib/types";

// Approved photos on the public leaderboard. The page itself needs Redis, so
// this pins the two parts that matter without it: which photos are chosen,
// and that only the small copy is ever drawn.

const photo = (over: Partial<RacePhoto>): RacePhoto => ({
  id: "p",
  url: "https://blob.example/full.jpg",
  thumbUrl: "https://blob.example/thumb.jpg",
  capturedAtMs: 0,
  capturedSource: "exif",
  contentHash: "",
  clockOffsetMs: 0,
  width: 1600,
  height: 1200,
  uploadedAt: "2026-10-10T17:00:00.000Z",
  status: "approved",
  entryId: 1,
  ...over,
});

test.describe("approvedPhotosByEntry", () => {
  test("keeps approved photos for finishers on the page", () => {
    const result = approvedPhotosByEntry(
      [photo({ entryId: 1 }), photo({ id: "q", entryId: 2 })],
      new Set([1, 2])
    );
    expect(Object.keys(result).sort()).toEqual(["1", "2"]);
    expect(result[1]).toEqual({
      thumbUrl: "https://blob.example/thumb.jpg",
      url: "https://blob.example/full.jpg",
    });
  });

  test("leaves out pending photos and photos with no finisher", () => {
    const result = approvedPhotosByEntry(
      [
        photo({ status: "pending", entryId: null }),
        photo({ id: "b", status: "pending", entryId: 1 }),
        photo({ id: "c", status: "approved", entryId: null }),
      ],
      new Set([1])
    );
    expect(result).toEqual({});
  });

  test("leaves out a finisher who isn't shown, such as an unresolved one", () => {
    const result = approvedPhotosByEntry([photo({ entryId: 9 })], new Set([1]));
    expect(result).toEqual({});
  });

  test("the most recent upload wins when two share a finisher", () => {
    const result = approvedPhotosByEntry(
      [
        photo({ id: "new", entryId: 1, uploadedAt: "2026-10-10T18:00:00.000Z", thumbUrl: "https://blob.example/new-thumb.jpg" }),
        photo({ id: "old", entryId: 1, uploadedAt: "2026-10-10T17:00:00.000Z" }),
      ],
      new Set([1])
    );
    expect(result[1].thumbUrl).toBe("https://blob.example/new-thumb.jpg");
  });
});

// Where photos are allowed to reach the full frame. Vercel Blob stops serving
// for 30 days once the month's transfer runs out; a leaderboard that loads
// full frames would get there in an afternoon. The components can't be
// rendered inside Playwright's runner (it rewrites component imports), so
// this reads the source for the structure; e2e/photo-lightbox.spec.ts proves
// the behavior against the dev preview page.
const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");

test("the full frame is only rendered inside FinisherPhoto's open lightbox", () => {
  const photo = read("components/FinisherPhoto.tsx");
  // The thumbnail is what the page draws, lazily.
  expect(photo).toContain("src={photo.thumbUrl}");
  expect(photo).toContain('loading="lazy"');
  // The one use of the full URL sits after the `open &&` gate.
  const uses = photo.split("src={photo.url}").length - 1;
  expect(uses).toBe(1);
  expect(photo.indexOf("{open &&")).toBeGreaterThan(-1);
  expect(photo.indexOf("src={photo.url}")).toBeGreaterThan(photo.indexOf("{open &&"));
});

test("the public views reach photos only through FinisherPhoto", () => {
  for (const file of [
    "components/ResultsTable.tsx",
    "components/CategoryLeaderboardGrid.tsx",
    "components/PublicLeaderboardView.tsx",
  ]) {
    const source = read(file);
    expect(source, file).not.toMatch(/\.url\b/);
    expect(source, file).not.toMatch(/<img\b/);
  }
});
