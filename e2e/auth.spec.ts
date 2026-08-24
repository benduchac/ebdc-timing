import { test, expect } from "@playwright/test";
import { TEST_PASSPHRASE } from "./constants";

test.describe("operator gate", () => {
  test("wrong passphrase is rejected, correct one unlocks", async ({ page }) => {
    await page.goto("/operator");

    await page.getByPlaceholder("Passphrase").fill("not-the-secret");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText(/incorrect passphrase/i)).toBeVisible();

    await page.getByPlaceholder("Passphrase").fill(TEST_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
  });
});
