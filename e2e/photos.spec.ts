import { test, expect } from "@playwright/test";
import { unlockOperator, startNewRace } from "./helpers";

// This repo's e2e environment has neither Redis nor a Blob store configured
// (see playwright.config.ts), so a race never gets a photoToken and an
// upload never lands. That's exactly the "not synced yet" / "storage not
// configured" / "keeps retrying" behavior these tests pin down — the
// authorized upload round trip needs real storage and isn't reachable here.
// Same limit as e2e/wave-start.spec.ts.

const WITH_EXIF = "fixtures/photos/finish-with-exif.jpg";
const NO_EXIF = "fixtures/photos/finish-no-exif.jpg";

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

  const row = page.getByText("finish-with-exif.jpg").locator("..");
  await expect(row).toBeVisible();

  // A preview only exists once the resize produced a blob, so this is the
  // EXIF read and the downscale both having run on the original.
  await expect(
    page.locator('img[src^="blob:"]').first()
  ).toBeVisible();

  // No backend to accept it here, so it never reaches "Sent" — this proves
  // the queue keeps hold of it rather than dropping it on the first failure.
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

  await expect(page.getByText("0 of 2 sent")).toBeVisible();
  // One in flight at a time: the second waits rather than fighting the first
  // for the same connection.
  await expect(page.getByText("Waiting to send")).toBeVisible();
  await expect(
    page.getByText(
      "Keep this page open until every photo says Sent — closing it loses whatever hasn't gone yet."
    )
  ).toBeVisible();
});
