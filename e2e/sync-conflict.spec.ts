import { test, expect } from "@playwright/test";
import type { Route } from "@playwright/test";
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
  writerId?: string;
  baseSavedAt?: string | null;
}

// Answers POSTs from a script and records what was sent. GET returns a
// snapshot of the race named in the query, as the real route would.
function fakeBackup(opts: { status: () => number }) {
  const posts: SyncBody[] = [];
  let counter = 0;
  const lastSavedFor = (n: number) =>
    new Date(Date.UTC(2026, 9, 10, 16, 0, n)).toISOString();

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
    page.getByRole("button", { name: "Load latest from cloud" })
  ).toBeVisible();

  // A further change must not queue another attempt, and no retry timer runs.
  await page.getByRole("button", { name: /Set wave times/ }).click();
  await page.getByRole("button", { name: "Save wave times" }).click();
  await page.waitForTimeout(1500);
  expect(fake.posts.length).toBe(1);
});

test("Load latest saves a copy of this computer's data, takes the cloud's, and resumes syncing", async ({
  page,
}) => {
  let status = 409;
  const fake = fakeBackup({ status: () => status });
  await page.route(/\/api\/backup/, fake.handler);

  await unlockOperator(page);
  await startNewRace(page);
  await expect(page.getByText("This computer is out of date.")).toBeVisible();

  status = 200;
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Load latest from cloud" }).click();
  expect((await download).suggestedFilename()).toMatch(/^EBDC-backup-.*\.json$/);

  await expect(page.getByText("This computer is out of date.")).toHaveCount(0);
  // The cloud's registrant replaced this computer's empty list.
  await expect(
    page.getByRole("heading", { name: /^Registration \(1 riders\)/ })
  ).toBeVisible();

  // Syncing resumes, based on the version just loaded.
  await expect.poll(() => fake.posts.length).toBe(2);
  expect(fake.posts[1].baseSavedAt).toBe("2026-10-10T17:00:00.000Z");
});

test.describe("Finish scoring", () => {
  test("saves to the cloud, then returns to the race menu", async ({ page }) => {
    const fake = fakeBackup({ status: () => 200 });
    await page.route(/\/api\/backup/, fake.handler);

    await unlockOperator(page);
    await startNewRace(page);
    await expect.poll(() => fake.posts.length).toBe(1);

    await page.getByTitle("Settings").click();
    await page.getByRole("button", { name: "Finish scoring" }).click();

    await expect(page.getByRole("status")).toContainText("Scoring finished");
    await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
    // The flush itself was a sync, so the cloud was asked before anything cleared.
    expect(fake.posts.length).toBeGreaterThanOrEqual(2);
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
    await page.getByRole("button", { name: "Finish scoring" }).click();

    await expect(
      page.getByText("The cloud didn't confirm the save, so nothing was cleared.")
    ).toBeVisible();
    // Still in the race.
    await expect(page.getByRole("button", { name: "Finish scoring" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Race" })).toHaveCount(0);
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
    await page.getByRole("button", { name: "Finish scoring" }).click();

    await expect(
      page.getByText("Another computer has newer results, so nothing was cleared.")
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Race" })).toHaveCount(0);
  });
});
