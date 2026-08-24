import { test, expect, type Page } from "@playwright/test";
import { unlockOperator, startNewRace, uploadCsv, FIXTURES } from "./helpers";

test.beforeEach(async ({ page }) => {
  await unlockOperator(page);
  await startNewRace(page);
  await uploadCsv(page, FIXTURES.good);
  await expect(page.getByText("19 of 19 riders imported.")).toBeVisible();
  await page.getByRole("button", { name: "Set wave times" }).click();
  await page.getByRole("button", { name: "Save wave times" }).click();

  await page.getByRole("button", { name: "Timing" }).click();
});

async function recordFinish(page: Page, bib: string) {
  await page.getByPlaceholder("Enter bib number").fill(bib);
  await page.getByRole("button", { name: "Record finish (Enter)" }).click();
}

// Sets one recorded entry's finish time via its Edit modal — the reliable
// way to pin an exact elapsed time instead of depending on real wall-clock
// timing between two recordFinish() calls.
async function setFinishTime(page: Page, riderName: string, time: string) {
  await page
    .getByRole("row", { name: new RegExp(riderName) })
    .getByTitle("Edit")
    .click();
  await page.locator('input[type="time"]').fill(time);
  await page.getByRole("button", { name: "Save changes" }).click();
}

// A board's own container: the heading's immediate parent is the
// LeaderboardCard root div (see CategoryLeaderboardGrid.tsx), so this is a
// single, unambiguous match rather than a class-based guess.
function board(page: Page, name: string) {
  return page.getByRole("heading", { name, exact: true }).locator("..");
}

test("award boards only show eligible riders, ranked by elapsed time", async ({
  page,
}) => {
  // Bib 4 (Alex Rivera): nonbinary, first_gravel_race yes, rigid+steel no.
  // Bib 2 (Michael Chen): male, first_gravel_race yes, rigid+steel yes.
  await recordFinish(page, "4");
  await recordFinish(page, "2");

  await page.getByRole("button", { name: "Results" }).click();
  await page.getByRole("button", { name: "Overall Results" }).click();
  await setFinishTime(page, "Alex Rivera", "10:00:00"); // wave C 9:30 start -> 30min
  await setFinishTime(page, "Michael Chen", "10:30:00"); // wave A 9:00 start -> 90min

  await page.getByRole("button", { name: "Category Leaderboards" }).click();

  const firstTimerBoard = board(page, "Fastest first-timer");
  await expect(firstTimerBoard.getByText("Alex Rivera")).toBeVisible();
  await expect(firstTimerBoard.getByText("Michael Chen")).toBeVisible();
  // Alex's elapsed (30min) beats Michael's (90min).
  const entries = firstTimerBoard.locator(".space-y-2 > div");
  await expect(entries.first()).toContainText("Alex Rivera");

  const rigidBoard = board(page, "Top rigid bike");
  await expect(rigidBoard.getByText("Michael Chen")).toBeVisible();
  // Alex isn't rigid_bike-eligible — must not appear on this board at all.
  await expect(rigidBoard.getByText("Alex Rivera")).toHaveCount(0);
});

test("tied finish times share a place number; the next rider skips ahead", async ({
  page,
}) => {
  await recordFinish(page, "2"); // Michael Chen, wave A
  await recordFinish(page, "1"); // Sarah Johnson, wave A
  await recordFinish(page, "4"); // Alex Rivera, wave C

  await page.getByRole("button", { name: "Results" }).click();

  // Same wave, same finish time -> identical elapsed -> a genuine tie.
  await setFinishTime(page, "Michael Chen", "10:00:00");
  await setFinishTime(page, "Sarah Johnson", "10:00:00");
  // Clearly slower than the tied pair, so it lands in third.
  await setFinishTime(page, "Alex Rivera", "12:00:00");

  const michaelRow = page.getByRole("row", { name: /Michael Chen/ });
  const sarahRow = page.getByRole("row", { name: /Sarah Johnson/ });
  const alexRow = page.getByRole("row", { name: /Alex Rivera/ });

  // Standard competition ranking: both tied riders are place 1, and the
  // next distinct time is place 3 (not 2 — 1, 1, 3, not 1, 1, 2).
  await expect(michaelRow.locator("td").first()).toContainText("1");
  await expect(sarahRow.locator("td").first()).toContainText("1");
  await expect(alexRow.locator("td").first()).toContainText("3");
});
