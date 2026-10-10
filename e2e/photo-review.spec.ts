import { test, expect, type Page } from "@playwright/test";
import { unlockOperator, startNewRace, uploadCsv, FIXTURES } from "./helpers";
import { decidePhoto } from "../lib/photoMatch";
import type { RacePhoto } from "../lib/types";

// The operator's side of photo matching. There's no Redis here, so the photo
// queue is served from a stub at the network boundary — what's under test is
// the matching and the picking, which are entirely client-side.

const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const stubPhoto = (id: string, capturedAtMs: number): RacePhoto => ({
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

// Serves the queue and accepts the operator's decisions through the same
// decidePhoto the server runs, so approving one photo actually moves it (and
// any it displaces) and the other cards re-render against it. Returns the
// PATCH bodies sent.
async function stubPhotoQueue(page: Page, ids: string[]) {
  // Captured now, so it lands inside the match window of finishes recorded
  // moments ago. Register this after the finishes, not before.
  let photos = ids.map((id) => stubPhoto(id, Date.now()));
  const patches: { photoId: string; entryId: number | null }[] = [];

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
      patches.push(body);
      const decision = decidePhoto(photos, body.photoId, body.entryId)!;
      const updated = new Map(
        [decision.photo, ...decision.displaced].map((p) => [p.id, p])
      );
      photos = photos.map((p) => updated.get(p.id) ?? p);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, ...decision }),
      });
    }
    return route.continue();
  });
  return patches;
}

// A fixed instant today, so a photo's capture time and a hand-edited finish
// time can be made to line up exactly.
function todayAt(h: number, m: number, sec: number): number {
  const d = new Date();
  d.setHours(h, m, sec, 0);
  return d.getTime();
}

// Sets one recorded entry's finish time through its Edit modal, the same way
// e2e/ranking.spec.ts does.
async function setFinishTime(page: Page, riderName: string, time: string) {
  await page.getByRole("button", { name: "Results" }).click();
  await page
    .getByRole("row", { name: new RegExp(riderName) })
    .getByTitle("Edit")
    .click();
  await page.locator('input[type="time"]').fill(time);
  await page.getByRole("button", { name: "Save changes" }).click();
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

test("a rider matched to the wrong photo can be found and swapped", async ({
  page,
}) => {
  const first = "aaaaaaaa-0000-4000-8000-000000000001";
  const second = "aaaaaaaa-0000-4000-8000-000000000002";
  const patches = await stubPhotoQueue(page, [first, second]);
  await page.getByRole("button", { name: "Photos" }).click();

  // The first card is the first photo. Give Sarah that one.
  await page.getByRole("button", { name: /Sarah Johnson/ }).first().click();
  await expect(page.getByText("Approved (1)")).toBeVisible();
  const sarahId = patches[0].entryId;

  // The remaining photo is really hers. The suggestions no longer offer her,
  // but the search does, flagged as already having a photo.
  await page.getByRole("button", { name: "Someone else" }).click();
  await page.getByPlaceholder("Search by bib or name").fill("Sarah");
  const results = page.locator('[aria-label="Finisher search results"]');
  const sarah = results.getByRole("button", { name: /Sarah Johnson/ });
  await expect(sarah).toContainText("Has a photo");

  // Picking her asks first, and backing out changes nothing.
  await sarah.click();
  const swap = page.locator('[aria-label="Swap photo"]');
  await expect(swap).toContainText("already has a photo");
  await swap.getByRole("button", { name: "Keep current" }).click();
  await expect(swap).toHaveCount(0);
  expect(patches).toHaveLength(1);

  await sarah.click();
  await swap.getByRole("button", { name: "Use this one" }).click();

  // One request: the second photo goes to Sarah, and the first goes back to
  // the queue rather than leaving her with two.
  await expect(
    page.getByRole("heading", { name: /^Photos \(1 to review\)/ })
  ).toBeVisible();
  await expect(page.getByText("Approved (1)")).toBeVisible();
  expect(patches).toEqual([
    { raceId: expect.any(String), photoId: first, entryId: sarahId },
    { raceId: expect.any(String), photoId: second, entryId: sarahId },
  ]);
  // The first photo is pending again, and Sarah is spoken for, so it no
  // longer suggests her.
  await expect(page.getByRole("button", { name: /Michael Chen/ })).toHaveCount(
    1
  );
  await expect(page.getByRole("button", { name: /Sarah Johnson/ })).toHaveCount(
    0
  );
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
    page.getByText("No finisher matches that.")
  ).toBeVisible();
});

test("correcting a finisher's time re-matches the photos against it", async ({
  page,
}) => {
  // The photo was taken at 10:00:05. Every finish was recorded just now, so
  // nothing is within the match window to begin with.
  const photos = [
    { ...stubPhoto("aaaaaaaa-0000-4000-8000-000000000009", todayAt(10, 0, 5)) },
  ];
  await page.route("**/api/photos*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, photos }),
    });
  });

  await page.getByRole("button", { name: "Photos" }).click();
  await expect(page.getByText(/No finisher within 20 seconds/)).toBeVisible();

  // Move one rider's finish to five seconds before the shutter.
  await setFinishTime(page, "Michael Chen", "10:00:00");

  await page.getByRole("button", { name: "Photos" }).click();
  await expect(
    page.getByRole("button", { name: /Michael Chen/ })
  ).toHaveCount(1);
  await expect(page.getByText(/No finisher within 20 seconds/)).toHaveCount(0);
});

test("a photo from another day says so instead of just failing to match", async ({
  page,
}) => {
  // The commonest way testing goes sideways: a photo off the camera roll
  // shot last week, against finishes recorded today. Nothing can match, and
  // "no finisher within 20 seconds" on its own reads like a broken feature.
  const sixDaysAgo = todayAt(10, 0, 0) - 6 * 24 * 60 * 60 * 1000;
  await page.route("**/api/photos*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        photos: [stubPhoto("aaaaaaaa-0000-4000-8000-00000000000a", sixDaysAgo)],
      }),
    });
  });

  // Pin one finish to 10:00 today, so the nearest finisher is exactly six
  // days off whatever time of day this runs. Finishes recorded "now" are six
  // and a half days off or more late in the evening, and describeGap rounds
  // that to 7.
  await setFinishTime(page, "Michael Chen", "10:00:00");

  await page.getByRole("button", { name: "Photos" }).click();
  await expect(page.getByText(/6 days away/)).toBeVisible();
  await expect(
    page.getByText(/taken on a different day, or a clock is wrong/)
  ).toBeVisible();
});

test("the duplicate sweep keeps one copy and deletes the rest", async ({
  page,
}) => {
  const shot = Date.now();
  const photos = [
    { ...stubPhoto("aaaaaaaa-0000-4000-8000-000000000011", shot), contentHash: "x1" },
    { ...stubPhoto("aaaaaaaa-0000-4000-8000-000000000012", shot), contentHash: "x2" },
    { ...stubPhoto("aaaaaaaa-0000-4000-8000-000000000013", shot - 60_000), contentHash: "x3" },
  ];
  const deleted: string[] = [];
  await page.route("**/api/photos*", async (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      deleted.push(new URL(request.url()).searchParams.get("photoId")!);
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, photos: photos.filter((p) => !deleted.includes(p.id)) }),
    });
  });
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.accept();
  });

  await page.getByRole("button", { name: "Photos" }).click();
  await page.getByRole("button", { name: "Find duplicates" }).click();
  const sweep = page.locator('[aria-label="Duplicate photos"]');
  await expect(sweep).toContainText("1 group");
  await expect(sweep).toContainText("same second");

  // Keep the second; only the first is deleted, after one confirm.
  await sweep.getByRole("button", { name: "Keep this one", exact: true }).click();
  await expect(sweep).toContainText("No duplicates among 2 photos.");
  expect(deleted).toEqual(["aaaaaaaa-0000-4000-8000-000000000011"]);
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toContain("Delete 1 other copy");
});

test("any photo in the queue opens full size, and only on a tap", async ({
  page,
}) => {
  const FULL = PIXEL + "#full";
  await page.route("**/api/photos*", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        photos: [
          { ...stubPhoto("aaaaaaaa-0000-4000-8000-000000000021", Date.now()), url: FULL },
          {
            ...stubPhoto("aaaaaaaa-0000-4000-8000-000000000022", Date.now()),
            url: FULL,
            status: "approved",
            entryId: 1,
          },
        ],
      }),
    })
  );
  await page.getByRole("button", { name: "Photos" }).click();
  await expect(page.getByText("Approved (1)")).toBeVisible();
  await expect(page.locator(`img[src="${FULL}"]`)).toHaveCount(0);

  // The approved row's photo, which used to be a plain thumbnail.
  await page.getByRole("button", { name: "Open the full photo" }).last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(`img[src="${FULL}"]`)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(`img[src="${FULL}"]`)).toHaveCount(0);
});
