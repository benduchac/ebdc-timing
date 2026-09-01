import { test, expect } from "@playwright/test";
import { unlockOperator, startNewRace, uploadCsv, FIXTURES } from "./helpers";

test.beforeEach(async ({ page }) => {
  await unlockOperator(page);
  await startNewRace(page);
  await uploadCsv(page, FIXTURES.good);
  await expect(page.getByText("100 of 100 riders imported.")).toBeVisible();
});

test("a walk-up is added through the ordinary Add registrant form, using the bib off their packet", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Add registrant" }).click();
  await expect(
    page.getByRole("heading", { name: "Add registrant" })
  ).toBeVisible();

  // Never pre-filled with a guessed value — every field starts blank.
  await expect(page.getByLabel("Name")).toHaveValue("");
  await expect(page.getByLabel("Age")).toHaveValue("");
  await expect(page.getByLabel("Gender")).toHaveValue("");

  await page.getByLabel("Bib number").fill("150");
  await page.getByLabel("Name").fill("Walkup Rider");
  await page.getByRole("button", { name: "B", exact: true }).click();
  await page.getByLabel("Age").fill("30");
  await page.getByLabel("Gender").selectOption("female");
  await page.getByRole("button", { name: "Add registrant", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Registration (101 riders)" })
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Walkup Rider" })).toBeVisible();
});

test("a bib nobody has added yet records as an unresolved finisher, not a match", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Timing" }).click();

  await page.getByPlaceholder("Enter bib number").fill("999");
  await expect(
    page.getByText("Bib #999 not found in registration. Entry will still be recorded.")
  ).toBeVisible();

  await page.getByRole("button", { name: "Record finish (Enter)" }).click();
  await expect(page.getByText("Unknown", { exact: true })).toBeVisible();
});
