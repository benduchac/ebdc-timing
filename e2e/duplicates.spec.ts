import { test, expect } from "@playwright/test";
import { unlockOperator, startNewRace, uploadCsv, FIXTURES } from "./helpers";

test.beforeEach(async ({ page }) => {
  await unlockOperator(page);
  await startNewRace(page);
  await uploadCsv(page, FIXTURES.good);
  await expect(page.getByText("100 of 100 riders imported.")).toBeVisible();
  await page.getByRole("button", { name: "Set wave times" }).click();
  await page.getByRole("button", { name: "Save wave times" }).click();
  await page.getByRole("button", { name: "Timing" }).click();
});

test("recording the same bib twice never blocks on a confirm dialog", async ({
  page,
}) => {
  let dialogFired = false;
  page.on("dialog", async (dialog) => {
    dialogFired = true;
    await dialog.dismiss();
  });

  await page.getByPlaceholder("Enter bib number").fill("1");
  await page.getByRole("button", { name: "Record finish (Enter)" }).click();
  await page.getByPlaceholder("Enter bib number").fill("1");
  await page.getByRole("button", { name: "Record finish (Enter)" }).click();

  expect(dialogFired).toBe(false);

  await page.getByRole("button", { name: "Results" }).click();
  await page.getByRole("button", { name: "Overall Results" }).click();
  await expect(page.getByRole("row", { name: /Sarah Johnson/ })).toHaveCount(2);
});

test("a duplicate bib is flagged red for the operator only", async ({
  page,
}) => {
  await page.getByPlaceholder("Enter bib number").fill("1");
  await page.getByRole("button", { name: "Record finish (Enter)" }).click();
  await page.getByPlaceholder("Enter bib number").fill("1");
  await page.getByRole("button", { name: "Record finish (Enter)" }).click();

  await page.getByRole("button", { name: "Results" }).click();
  await page.getByRole("button", { name: "Overall Results" }).click();

  const rows = page.getByRole("row", { name: /Sarah Johnson/ });
  await expect(rows.first()).toHaveClass(/bg-danger-soft/);
  await expect(rows.last()).toHaveClass(/bg-danger-soft/);
});
