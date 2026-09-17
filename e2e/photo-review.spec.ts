import { test, expect, type Page } from "@playwright/test";
import { unlockOperator, startNewRace, uploadCsv, FIXTURES } from "./helpers";

// The operator's side of photo matching. There's no Redis here, so the photo
// queue is served from a stub at the network boundary — what's under test is
// the matching and the picking, which are entirely client-side.

const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const stubPhoto = (id: string, capturedAtMs: number) => ({
  id,
  url: PIXEL,
  thumbUrl: PIXEL,
  capturedAtMs,
  capturedSource: "exif",
  contentHash: id,
  clockOffsetMs: 0,
  width: 1600,
  height: 1200,
  uploadedAt: new Date().toISOString(),
  status: "pending",
  entryId: null,
});

// Serves the queue and accepts the operator's decisions, so approving one
// photo actually moves it and the other cards re-render against it.
async function stubPhotoQueue(page: Page, ids: string[]) {
  // Captured now, so it lands inside the match window of finishes recorded
  // moments ago. Register this after the finishes, not before.
  const photos = ids.map((id) => stubPhoto(id, Date.now()));

  await page.route("**/api/photos*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, photos }),
      });
    }
    if (request.method() === "PATCH") {
      const body = JSON.parse(request.postData() ?? "{}");
      const base = photos.find((p) => p.id === body.photoId);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          photo: {
            ...base,
            status: body.entryId === null ? "pending" : "approved",
            entryId: body.entryId,
          },
        }),
      });
    }
    return route.continue();
  });
}

async function recordFinish(page: Page, bib: string) {
  await page.getByPlaceholder("Enter bib number").fill(bib);
  await page.getByRole("button", { name: "Record finish (Enter)" }).click();
}

test.beforeEach(async ({ page }) => {
  await unlockOperator(page);
  await startNewRace(page);
  await uploadCsv(page, FIXTURES.good);
  await expect(page.getByText("100 of 100 riders imported.")).toBeVisible();
  await page.getByRole("button", { name: "Set wave times" }).click();
  await page.getByRole("button", { name: "Save wave times" }).click();

  await page.getByRole("button", { name: "Timing" }).click();
  await recordFinish(page, "1"); // Sarah Johnson
  await recordFinish(page, "2"); // Michael Chen
  await recordFinish(page, "4"); // Alex Rivera
});

test("a rider with a photo is no longer offered for any other photo", async ({
  page,
}) => {
  await stubPhotoQueue(page, ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002"]);
  await page.getByRole("button", { name: "Photos" }).click();

  await expect(
    page.getByRole("heading", { name: /^Photos \(2 to review\)/ })
  ).toBeVisible();

  // Both photos were taken around all three finishes, so both offer all
  // three riders — six buttons in total.
  await expect(page.getByRole("button", { name: /Sarah Johnson/ })).toHaveCount(
    2
  );

  await page.getByRole("button", { name: /Sarah Johnson/ }).first().click();

  // She's spoken for now: the remaining photo must not offer her again.
  await expect(page.getByRole("button", { name: /Sarah Johnson/ })).toHaveCount(
    0
  );
  await expect(page.getByText("Approved (1)")).toBeVisible();
  // The riders still without a photo are untouched.
  await expect(page.getByRole("button", { name: /Michael Chen/ })).toHaveCount(
    1
  );
});

test("unapproving puts a rider back in the running", async ({ page }) => {
  await stubPhotoQueue(page, ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002"]);
  await page.getByRole("button", { name: "Photos" }).click();

  await page.getByRole("button", { name: /Alex Rivera/ }).first().click();
  await expect(page.getByRole("button", { name: /Alex Rivera/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Unapprove" }).click();
  await expect(page.getByRole("button", { name: /Alex Rivera/ })).toHaveCount(2);
});

test("a finisher can be found by name or bib instead of the suggestions", async ({
  page,
}) => {
  await stubPhotoQueue(page, ["aaaaaaaa-0000-4000-8000-000000000001"]);
  await page.getByRole("button", { name: "Photos" }).click();

  await page.getByRole("button", { name: "Someone else" }).click();
  const search = page.getByPlaceholder("Search by bib or name");
  // Scoped to the results, because the time-based suggestions above the
  // search box name the same riders.
  const results = page.locator('[aria-label="Finisher search results"]');

  await search.fill("Rivera");
  await expect(results.getByRole("button", { name: /Alex Rivera/ })).toHaveCount(
    1
  );
  await expect(
    results.getByRole("button", { name: /Michael Chen/ })
  ).toHaveCount(0);

  // Leading zeros are what's printed on a packet; normalizeBib means typing
  // them still finds the rider.
  await search.fill("002");
  await expect(
    results.getByRole("button", { name: /Michael Chen/ })
  ).toHaveCount(1);

  await search.fill("zzzz");
  await expect(
    page.getByText("No rider without a photo matches that.")
  ).toBeVisible();
});
