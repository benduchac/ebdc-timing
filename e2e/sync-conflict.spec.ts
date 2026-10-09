import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { readFileSync } from "fs";
import { unlockOperator, startNewRace } from "./helpers";
import { isWriteAllowed } from "../lib/syncGuard";

// There is no Redis here, so the server's answer is faked at the network
// boundary. What's under test on the page is what the client sends and what
// it does with a refusal; the decision itself is a pure function, pinned in
// the first block.

test.describe("isWriteAllowed", () => {
  const cloud = { lastSaved: "2026-10-10T16:00:00.000Z", writerId: "laptop-b" };

  test("allows the first sync of a race", () => {
    expect(isWriteAllowed(undefined, { writerId: "a", baseSavedAt: null })).toBe(
      true
    );
  });

  test("allows a write over a copy that predates device tracking", () => {
    expect(
      isWriteAllowed(
        { lastSaved: cloud.lastSaved },
        { writerId: "a", baseSavedAt: "2026-10-09T00:00:00.000Z" }
      )
    ).toBe(true);
  });

  test("allows the device that wrote the cloud copy, even if it missed the reply", () => {
    expect(
      isWriteAllowed(cloud, { writerId: "laptop-b", baseSavedAt: "older" })
    ).toBe(true);
  });

  test("allows a device that loaded the copy now in the cloud", () => {
    expect(
      isWriteAllowed(cloud, { writerId: "laptop-a", baseSavedAt: cloud.lastSaved })
    ).toBe(true);
  });

  test("refuses a device whose copy is older than the cloud's", () => {
    expect(
      isWriteAllowed(cloud, {
        writerId: "laptop-a",
        baseSavedAt: "2026-10-10T15:00:00.000Z",
      })
    ).toBe(false);
  });

  test("refuses a device that never synced this race", () => {
    expect(isWriteAllowed(cloud, { writerId: "laptop-a", baseSavedAt: null })).toBe(
      false
    );
  });

  test("refuses a client too old to send an id", () => {
    expect(isWriteAllowed(cloud, {})).toBe(false);
  });
});

interface SyncBody {
  raceId?: string;
  writerId?: string;
  baseSavedAt?: string | null;
}

// Answers POSTs from a script and records what was sent. GET returns a
// snapshot of the race named in the query, as the real route would.
// `minute` keeps two computers' servers from handing out the same versions.
function fakeBackup(opts: { status: () => number; minute?: number }) {
  const posts: SyncBody[] = [];
  let counter = 0;
  const lastSavedFor = (n: number) =>
    new Date(Date.UTC(2026, 9, 10, 16, opts.minute ?? 0, n)).toISOString();

  const handler = async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST") {
      posts.push(request.postDataJSON());
      const status = opts.status();
      if (status === 409) {
        return route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            conflict: true,
            error: "Another computer has newer results for this race.",
          }),
        });
      }
      if (status !== 200) {
        return route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "Server trouble." }),
        });
      }
      counter += 1;
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          lastSaved: lastSavedFor(counter),
          slug: "ebdc-test",
          startToken: "11111111-1111-1111-1111-111111111111",
          photoToken: "22222222-2222-2222-2222-222222222222",
        }),
      });
    }
    // GET: the newer copy another computer wrote.
    const raceId = new URL(request.url()).searchParams.get("id");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        snapshot: {
          raceId,
          label: "Test Race",
          createdAt: "2026-10-09T12:00:00.000Z",
          slug: "ebdc-test",
          startToken: "11111111-1111-1111-1111-111111111111",
          photoToken: "22222222-2222-2222-2222-222222222222",
          waveStartTimes: {
            A: "2026-10-10T16:00:00.000Z",
            B: "2026-10-10T16:15:00.000Z",
            C: "2026-10-10T16:30:00.000Z",
          },
          raceDate: "2026-10-10",
          registrants: [
            ["101", { bib: "101", name: "Pat Rider", wave: "A", age: "30", gender: "male" }],
          ],
          entries: [],
          entryCounter: 0,
          lastSaved: "2026-10-10T17:00:00.000Z",
          writerId: "laptop-b",
        },
      }),
    });
  };
  return { posts, handler };
}

test("each sync carries the device id and the version it is based on", async ({
  page,
}) => {
  const fake = fakeBackup({ status: () => 200 });
  await page.route(/\/api\/backup/, fake.handler);

  await unlockOperator(page);
  await startNewRace(page);
  await expect.poll(() => fake.posts.length).toBe(1);

  expect(fake.posts[0].writerId).toBeTruthy();
  expect(fake.posts[0].baseSavedAt).toBeNull();

  // Any state change syncs again; confirming wave times is the quickest.
  await page.getByRole("button", { name: /Set wave times/ }).click();
  await page.getByRole("button", { name: "Save wave times" }).click();
  await expect.poll(() => fake.posts.length).toBe(2);

  // The first reply's version is now the base, and the id is unchanged.
  expect(fake.posts[1].baseSavedAt).toBe("2026-10-10T16:00:01.000Z");
  expect(fake.posts[1].writerId).toBe(fake.posts[0].writerId);
});

test("a refused sync shows the banner and stops trying", async ({ page }) => {
  const fake = fakeBackup({ status: () => 409 });
  await page.route(/\/api\/backup/, fake.handler);

  await unlockOperator(page);
  await startNewRace(page);

  await expect(page.getByText("This computer is out of date.")).toBeVisible();
  await expect(page.getByText("Out of date", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save a copy and leave" })
  ).toBeVisible();

  // A further change must not queue another attempt, and no retry timer runs.
  await page.getByRole("button", { name: /Set wave times/ }).click();
  await page.getByRole("button", { name: "Save wave times" }).click();
  await page.waitForTimeout(1500);
  expect(fake.posts.length).toBe(1);
});

test("Save a copy and leave downloads this computer's copy and returns to the race menu without syncing", async ({
  page,
}) => {
  const fake = fakeBackup({ status: () => 409 });
  await page.route(/\/api\/backup/, fake.handler);

  await unlockOperator(page);
  await startNewRace(page);
  await expect(page.getByText("This computer is out of date.")).toBeVisible();
  const postsBefore = fake.posts.length;

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save a copy and leave" }).click();
  expect((await download).suggestedFilename()).toMatch(/^EBDC-backup-.*\.json$/);

  await expect(page.getByRole("status")).toContainText(
    "Another computer is scoring this race."
  );
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();

  // Leaving takes nothing over: no sync, now or after a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(fake.posts.length).toBe(postsBefore);
});

// The race menu's list, holding the race another computer is scoring.
async function routeRaceList(page: Page) {
  await page.route(/\/api\/races/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        races: [
          {
            id: "race-from-laptop-b",
            label: "Test Race",
            slug: "ebdc-test",
            createdAt: "2026-10-09T12:00:00.000Z",
            lastSaved: "2026-10-10T17:00:00.000Z",
            entryCount: 0,
            writerId: "laptop-b",
          },
        ],
      }),
    })
  );
}

test("Start scoring is the only way into a cloud race, and it syncs on the copy it loaded", async ({
  page,
}) => {
  const fake = fakeBackup({ status: () => 200 });
  await page.route(/\/api\/backup/, fake.handler);
  await routeRaceList(page);

  await unlockOperator(page);
  await expect(page.getByRole("button", { name: "Open", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Start scoring" }).click();

  await expect(
    page.getByRole("heading", { name: /^Registration \(1 riders\)/ })
  ).toBeVisible();
  await expect.poll(() => fake.posts.length).toBe(1);
  expect(fake.posts[0].baseSavedAt).toBe("2026-10-10T17:00:00.000Z");
  expect(fake.posts[0].writerId).not.toBe("laptop-b");
});

test("a backup JSON imported on another computer syncs on the version it was exported from", async ({
  page,
  browser,
}) => {
  // Laptop A: syncs once, then exports.
  const fakeA = fakeBackup({ status: () => 200 });
  await page.route(/\/api\/backup/, fakeA.handler);
  await unlockOperator(page);
  await startNewRace(page);
  await expect.poll(() => fakeA.posts.length).toBe(1);

  await page.getByTitle("Settings").click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup JSON" }).click();
  const file = await (await download).path();
  const exported = JSON.parse(readFileSync(file, "utf8"));
  expect(exported.cloudLastSyncedAt).toBe("2026-10-10T16:00:01.000Z");

  // Laptop B: its own browser, so its own device id and IndexedDB.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const fakeB = fakeBackup({ status: () => 200, minute: 30 });
  await pageB.route(/\/api\/backup/, fakeB.handler);
  await unlockOperator(pageB);
  await startNewRace(pageB);
  await expect.poll(() => fakeB.posts.length).toBe(1);

  await pageB.getByTitle("Settings").click();
  await pageB.locator('input[type="file"][accept=".json"]').setInputFiles(file);
  await expect.poll(() => fakeB.posts.length).toBe(2);
  const importSync = fakeB.posts[1];
  expect(importSync.raceId).toBe(exported.raceId);
  expect(importSync.baseSavedAt).toBe("2026-10-10T16:00:01.000Z");
  expect(importSync.writerId).not.toBe(fakeA.posts[0].writerId);

  await contextB.close();
});

// Both presses: the button, then the confirmation it asks for.
async function finishScoring(page: Page) {
  await page.getByRole("button", { name: "Finish scoring" }).click();
  await page.getByRole("button", { name: "Yes, finish scoring" }).click();
}

test.describe("Finish scoring", () => {
  test("does nothing until the second press, and closing Settings disarms it", async ({
    page,
  }) => {
    const fake = fakeBackup({ status: () => 200 });
    await page.route(/\/api\/backup/, fake.handler);

    await unlockOperator(page);
    await startNewRace(page);
    await expect.poll(() => fake.posts.length).toBe(1);

    await page.getByTitle("Settings").click();
    await page.getByRole("button", { name: "Finish scoring" }).click();
    await page.getByRole("button", { name: "Keep scoring" }).click();
    await expect(page.getByRole("button", { name: "Finish scoring" })).toBeVisible();

    // Armed, then closed: reopening shows the first button again.
    await page.getByRole("button", { name: "Finish scoring" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByTitle("Settings").click();
    await expect(page.getByRole("button", { name: "Yes, finish scoring" })).toHaveCount(0);

    // Nothing was flushed or cleared along the way.
    expect(fake.posts.length).toBe(1);
    await expect(page.getByRole("button", { name: "Start Race" })).toHaveCount(0);
  });

  test("saves to the cloud, then returns to the race menu", async ({ page }) => {
    const fake = fakeBackup({ status: () => 200 });
    await page.route(/\/api\/backup/, fake.handler);

    await unlockOperator(page);
    await startNewRace(page);
    await expect.poll(() => fake.posts.length).toBe(1);

    await page.getByTitle("Settings").click();
    await finishScoring(page);

    await expect(page.getByRole("status")).toContainText("Scoring finished");
    await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
    // The flush itself was a sync, so the cloud was asked before anything cleared.
    expect(fake.posts.length).toBeGreaterThanOrEqual(2);
  });

  test("stays cleared after a reload", async ({ page }) => {
    const fake = fakeBackup({ status: () => 200 });
    await page.route(/\/api\/backup/, fake.handler);

    await unlockOperator(page);
    await startNewRace(page);
    await expect.poll(() => fake.posts.length).toBe(1);

    await page.getByTitle("Settings").click();
    await finishScoring(page);
    await expect(page.getByRole("status")).toContainText("Scoring finished");

    // The flush's reply lands in state just as the clear runs; it must not
    // write the race back to IndexedDB.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
  });

  test("clears nothing when the cloud does not confirm", async ({ page }) => {
    let status = 200;
    const fake = fakeBackup({ status: () => status });
    await page.route(/\/api\/backup/, fake.handler);

    await unlockOperator(page);
    await startNewRace(page);
    await expect.poll(() => fake.posts.length).toBe(1);

    status = 500;
    await page.getByTitle("Settings").click();
    await finishScoring(page);

    await expect(
      page.getByText("The cloud didn't confirm the save, so nothing was cleared.")
    ).toBeVisible();
    // Still in the race.
    await expect(page.getByRole("button", { name: "Finish scoring" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Race" })).toHaveCount(0);

    // The error belongs to that attempt; reopening Settings starts clean.
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByTitle("Settings").click();
    await expect(
      page.getByText("The cloud didn't confirm the save, so nothing was cleared.")
    ).toHaveCount(0);
  });

  test("clears nothing when another computer is ahead", async ({ page }) => {
    let status = 200;
    const fake = fakeBackup({ status: () => status });
    await page.route(/\/api\/backup/, fake.handler);

    await unlockOperator(page);
    await startNewRace(page);
    await expect.poll(() => fake.posts.length).toBe(1);

    status = 409;
    await page.getByTitle("Settings").click();
    await finishScoring(page);

    await expect(
      page.getByText("Another computer is scoring this race, so nothing was cleared.")
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Race" })).toHaveCount(0);
  });
});
