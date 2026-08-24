import { test, expect } from "@playwright/test";
import { unlockOperator, startNewRace, uploadCsv, FIXTURES } from "./helpers";

test.beforeEach(async ({ page }) => {
  await unlockOperator(page);
  await startNewRace(page);
  await uploadCsv(page, FIXTURES.good);
  await expect(page.getByText("19 of 19 riders imported.")).toBeVisible();
});

test("typing a reserved bib into Add registrant claims it and drops it off the reserved list", async ({
  page,
}) => {
  await expect(page.getByText("Reserved bibs (3 unclaimed)")).toBeVisible();

  await page.getByRole("button", { name: "+ Add registrant" }).click();
  await expect(
    page.getByRole("heading", { name: "Add registrant" })
  ).toBeVisible();

  // Never pre-filled with a guessed value — every field starts blank.
  await expect(page.getByLabel("First name")).toHaveValue("");
  await expect(page.getByLabel("Date of birth")).toHaveValue("");
  await expect(page.getByLabel("Gender")).toHaveValue("");

  await page.getByLabel("Bib number").fill("150");
  await page.getByLabel("First name").fill("Walkup");
  await page.getByLabel("Last name").fill("Rider");
  await page.getByRole("button", { name: "B", exact: true }).click();
  await page.getByLabel("Date of birth").fill("1995-05-05");
  await page.getByLabel("Gender").selectOption("female");
  await page.getByRole("button", { name: "Add registrant", exact: true }).click();

  await expect(page.getByText("Reserved bibs (2 unclaimed)")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Registration (17 riders)" })
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Walkup Rider" })).toBeVisible();
});

test("typing an arbitrary bib not on the reserved list also works", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Add registrant" }).click();
  await page.getByLabel("Bib number").fill("999");
  await page.getByLabel("First name").fill("Extra");
  await page.getByLabel("Last name").fill("Walkup");
  await page.getByRole("button", { name: "C", exact: true }).click();
  await page.getByLabel("Date of birth").fill("1990-01-01");
  await page.getByLabel("Gender").selectOption("male");
  await page.getByRole("button", { name: "Add registrant", exact: true }).click();

  // Reserved bibs untouched — this bib wasn't one of them.
  await expect(page.getByText("Reserved bibs (3 unclaimed)")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Registration (17 riders)" })
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Extra Walkup" })).toBeVisible();
});

test("an unclaimed spare bib is never silently matched at record time", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Timing" }).click();

  // 151 is a reserved-but-unclaimed spare from the good fixture.
  await page.getByPlaceholder("Enter bib number").fill("151");
  await expect(
    page.getByText("Bib #151 not found in registration. Entry will still be recorded.")
  ).toBeVisible();

  // Recording it produces an unresolved finisher, not a match against the
  // reserved rider.
  await page.getByRole("button", { name: "Record finish (Enter)" }).click();
  await expect(page.getByText("Unknown", { exact: true })).toBeVisible();
});
