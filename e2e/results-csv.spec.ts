import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { unlockOperator, startNewRace, uploadCsv, FIXTURES } from "./helpers";

test.beforeEach(async ({ page }) => {
  await unlockOperator(page);
  await startNewRace(page);
  await uploadCsv(page, FIXTURES.good);
  await page.getByRole("heading", { name: /^Registration \(/ }).waitFor();
  await page.getByRole("button", { name: "Timing" }).click();
});

async function recordFinish(page: import("@playwright/test").Page, bib: string) {
  await page.getByPlaceholder("Enter bib number").fill(bib);
  await page.getByRole("button", { name: "Record finish (Enter)" }).click();
}

async function exportCsv(page: import("@playwright/test").Page) {
  let message = "";
  page.once("dialog", async (dialog) => {
    message = dialog.message();
    await dialog.accept();
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const path = await (await download).path();
  return { csv: readFileSync(path, "utf8"), message: () => message };
}

test("unresolved finishers are listed after the ranked rows, and the popup says so", async ({
  page,
}) => {
  await recordFinish(page, "1"); // Sarah Johnson, wave A
  await recordFinish(page, "999"); // not registered: no wave
  await page.getByPlaceholder("Enter bib number").press("u"); // Unknown rider

  const { csv, message } = await exportCsv(page);
  const rows = csv.trim().split("\n");

  expect(rows[0]).toBe(
    "Overall Place,Wave Place,Bib Number,Name,Wave,Finish Time,Elapsed Time,Full Timestamp"
  );
  // One ranked row first, then the two unresolved ones in the order they crossed.
  expect(rows).toHaveLength(4);
  expect(rows[1]).toMatch(/^1,1,1,Sarah Johnson,A,/);
  expect(rows[2]).toMatch(/^UNRESOLVED,,999,/);
  expect(rows[3]).toMatch(/^UNRESOLVED,,UNK-1,Unknown rider,,/);

  await expect.poll(() => message()).toContain("1 ranked finishers");
  expect(message()).toContain("2 unresolved");
});

test("a file with no unresolved finishers is unchanged", async ({ page }) => {
  await recordFinish(page, "1");

  const { csv, message } = await exportCsv(page);
  expect(csv.trim().split("\n")).toHaveLength(2);
  expect(csv).not.toContain("UNRESOLVED");
  await expect.poll(() => message()).toBe("Exported 1 finishers to CSV!");
});

test("a file of only unresolved finishers still exports", async ({ page }) => {
  await recordFinish(page, "999");

  const { csv } = await exportCsv(page);
  const rows = csv.trim().split("\n");
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatch(/^UNRESOLVED,,999,/);
});
