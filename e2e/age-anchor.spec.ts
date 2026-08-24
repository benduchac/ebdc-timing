import { test, expect } from "@playwright/test";
import { unlockOperator, startNewRace, uploadCsv, FIXTURES } from "./helpers";

// The four dated riders in registrants-2026.csv sit exactly on a category
// boundary relative to race day 2026-10-10 (see fixtures/README.md), and
// calculateAge used to parse dob as UTC while comparing against a local
// "today" — a bug that flips exactly these four in Pacific time. Pinning
// the browser clock to race day gives a deterministic, real assertion
// instead of trusting the date math by inspection.
test("age lands on the right side of the boundary on race day", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-10T08:00:00") });

  await unlockOperator(page);
  await startNewRace(page);
  await uploadCsv(page, FIXTURES.good);
  await expect(page.getByText("100 of 100 riders imported.")).toBeVisible();

  // Confirms wave times for "today" (the pinned clock's race day), which is
  // what sets RaceState.raceDate and anchors the age column to it.
  await page.getByRole("button", { name: "Set wave times" }).click();
  await page.getByRole("button", { name: "Save wave times" }).click();

  const row = (name: string) => page.getByRole("row", { name: new RegExp(name) });

  // Turns 19 ON race day -> adult, not junior.
  await expect(row("Marcus Webb")).toContainText("19");
  // Turns 19 the day AFTER race day -> still 18, junior.
  await expect(row("Nia Fletcher")).toContainText("18");
  // Turns 50 ON race day -> masters.
  await expect(row("Robert Ellery")).toContainText("50");
  // Turns 50 the day AFTER race day -> still 49, not masters.
  await expect(row("Helen Marsh")).toContainText("49");
});
