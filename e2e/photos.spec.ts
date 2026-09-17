import { test, expect, type Page } from "@playwright/test";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { unlockOperator, startNewRace } from "./helpers";

// This repo's e2e environment has neither Redis nor a Blob store configured
// (see playwright.config.ts), so a race never gets a photoToken and an
// upload never lands. That's exactly the "not synced yet" / "storage not
// configured" / "keeps retrying" behavior most of these tests pin down.
// Where a test needs the server to have answered — the dedupe against
// photos a previous session uploaded — the GET is faked at the network
// boundary; what's under test there is what the phone does with the answer.

const WITH_EXIF = "fixtures/photos/finish-with-exif.jpg";
const NO_EXIF = "fixtures/photos/finish-no-exif.jpg";

// The same digest lib/photoHash.ts computes in the browser.
const fixtureHash = (path: string) =>
  createHash("sha256")
    .update(readFileSync(resolve(__dirname, "..", path)))
    .digest("hex");

// A 1x1 GIF, so the grid can render without reaching for a real Blob store.
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// A 1x1 PNG, so "the full frame" is distinguishable from "the thumbnail"
// by src alone.
const FULL_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const stubPhoto = (contentHash: string) => ({
  id: "33333333-3333-3333-3333-333333333333",
  url: PIXEL,
  thumbUrl: PIXEL,
  capturedAtMs: Date.now(),
  capturedSource: "exif",
  contentHash,
  clockOffsetMs: 0,
  width: 1600,
  height: 1200,
  uploadedAt: new Date().toISOString(),
  status: "pending",
  entryId: null,
});

// Answers only the list request; an upload still falls through to the real
// route, which 503s for want of storage.
async function stubExistingPhotos(page: Page, contentHashes: string[]) {
  await page.route("**/api/photos*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, photos: contentHashes.map(stubPhoto) }),
    });
  });
}

test("Settings shows the photo link as pending until the race has synced", async ({
  page,
}) => {
  await unlockOperator(page);
  await startNewRace(page);

  await page.getByTitle("Settings").click();
  await expect(page.getByText("Finish line photos")).toBeVisible();
  await expect(
    page.getByText("Nothing to share yet — connect to the internet once")
  ).toBeVisible();
});

test("the Photos tab says so when it can't reach the queue", async ({
  page,
}) => {
  await unlockOperator(page);
  await startNewRace(page);

  await page.getByRole("button", { name: "Photos" }).click();
  await expect(
    page.getByRole("heading", { name: /^Photos \(0 to review\)/ })
  ).toBeVisible();
  await expect(
    page.getByText("Backup storage is not configured yet.")
  ).toBeVisible();
});

test("without configured storage, the page falls back to the dev preview", async ({
  page,
}) => {
  await page.goto("/photo/not-a-real-token");
  await expect(page.getByText(/Dev preview/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Add photos/ })).toBeVisible();
});

test("a picked photo is read, resized and queued, then retries", async ({
  page,
}) => {
  await page.goto("/photo/not-a-real-token");
  await page.locator("#photoInput").setInputFiles(WITH_EXIF);

  await expect(page.getByText("finish-with-exif.jpg")).toBeVisible();

  // A preview only exists once the resize produced a blob, so this is the
  // EXIF read and the downscale both having run on the original.
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible();

  // No backend to accept it here, so it stays in the queue — this proves the
  // photo is held onto rather than dropped on the first failure.
  await expect(page.getByText(/Not sent yet, retrying/)).toBeVisible({
    timeout: 15_000,
  });
});

test("a photo carrying no EXIF still gets through the queue", async ({
  page,
}) => {
  await page.goto("/photo/not-a-real-token");
  await page.locator("#photoInput").setInputFiles(NO_EXIF);

  // The fallback to the file's own timestamp has to keep the pipeline
  // moving; a photo with no capture time of its own is the operator's
  // problem to place, not a reason to refuse it here.
  await expect(page.getByText("finish-no-exif.jpg")).toBeVisible();
  await expect(page.getByText(/Not sent yet, retrying/)).toBeVisible({
    timeout: 15_000,
  });
});

test("several photos queue together and upload one at a time", async ({
  page,
}) => {
  await page.goto("/photo/not-a-real-token");
  await page.locator("#photoInput").setInputFiles([WITH_EXIF, NO_EXIF]);

  // One in flight at a time: the second waits rather than fighting the first
  // for the same connection.
  await expect(page.getByText("Waiting to send")).toBeVisible();
  await expect(
    page.getByText("Keep this page open until the list above is empty")
  ).toBeVisible();
});

test("a photo the race already has is skipped before it is uploaded", async ({
  page,
}) => {
  // The case the whole dedupe exists for: the photographer re-picks their
  // entire camera roll rather than remembering which shots they already
  // sent, and everything already up drops out without being re-sent.
  await stubExistingPhotos(page, [fixtureHash(WITH_EXIF)]);
  await page.goto("/photo/not-a-real-token");

  await expect(page.getByText("1 uploaded")).toBeVisible();

  await page.locator("#photoInput").setInputFiles([WITH_EXIF, NO_EXIF]);

  await expect(
    page.getByText("Skipped 1 photo already uploaded.")
  ).toBeVisible();
  // The known one never joins the queue; the new one does.
  await expect(page.getByText("finish-with-exif.jpg")).toHaveCount(0);
  await expect(page.getByText("finish-no-exif.jpg")).toBeVisible();
});

test("the same photo picked twice in one batch only uploads once", async ({
  page,
}) => {
  await page.goto("/photo/not-a-real-token");
  await page.locator("#photoInput").setInputFiles([WITH_EXIF, WITH_EXIF]);

  await expect(
    page.getByText("Skipped 1 photo already uploaded.")
  ).toBeVisible();
  await expect(page.getByText("finish-with-exif.jpg")).toHaveCount(1);
});

test("the review queue loads thumbnails, and the full frame only on request", async ({
  page,
}) => {
  // A 1600px frame rendered at 112px costs the whole transfer and shows
  // none of the extra detail. Vercel Blob's Hobby transfer allowance is
  // what makes that expensive rather than merely wasteful — see
  // docs/photo-companion-design.md "Two sizes, not one".
  await page.route("**/api/photos*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        photos: [{ ...stubPhoto("abc"), url: FULL_PIXEL, thumbUrl: PIXEL }],
      }),
    });
  });

  await unlockOperator(page);
  await startNewRace(page);
  await page.getByRole("button", { name: "Photos" }).click();

  await expect(page.locator(`img[src="${PIXEL}"]`)).toHaveCount(1);
  await expect(page.locator(`img[src="${FULL_PIXEL}"]`)).toHaveCount(0);

  // The operator asks for it when they need to read a bib.
  await page.locator(`img[src="${PIXEL}"]`).click();
  await expect(page.locator(`img[src="${FULL_PIXEL}"]`)).toHaveCount(1);
});

test("photos already uploaded show as a grid, from thumbnails", async ({
  page,
}) => {
  await stubExistingPhotos(page, [
    fixtureHash(WITH_EXIF),
    fixtureHash(NO_EXIF),
  ]);
  await page.goto("/photo/not-a-real-token");

  await expect(page.getByText("2 uploaded")).toBeVisible();
  // Thumbnails, never the full frames — see the Blob transfer note in
  // docs/photo-companion-design.md.
  await expect(page.locator(`img[src="${PIXEL}"]`)).toHaveCount(2);
});
