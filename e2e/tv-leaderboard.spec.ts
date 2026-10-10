import { test, expect } from "@playwright/test";

// The TV view (/[slug]/tv), against the dev preview's ?tv=1, since the real
// route needs Redis. Run fast, with short holds, so a whole loop fits in a
// test.

test.beforeEach(async ({ page }) => {
  await page.route("https://picsum.photos/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.alloc(0) })
  );
});

test("shows overall results, then every category board expanded", async ({ page }) => {
  await page.goto("/dev/public-preview?tv=1&pause=60");

  await expect(page.getByRole("heading", { name: /Overall results/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Category leaderboards" })).toBeVisible();
  // Expanded, and with nothing to click.
  await expect(page.getByRole("button", { name: /^Show / })).toHaveCount(0);
  await expect(page.getByText(/\(showing top 3\)/)).toHaveCount(0);
});

test("scrolls to the bottom, then starts again from the top", async ({ page }) => {
  await page.goto("/dev/public-preview?tv=1&speed=2000&pause=1");

  // Holds at the top first.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.scrollY >=
            document.documentElement.scrollHeight - window.innerHeight - 2
        ),
      { timeout: 20_000 }
    )
    .toBe(true);

  // After the hold at the bottom, back to the top.
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
    .toBe(0);
});

test("a QR code in the corner points at the interactive leaderboard", async ({ page }) => {
  await page.goto("/dev/public-preview?tv=1&pause=60");
  const qr = page.locator('[aria-label="Scan for live results"]');
  await expect(qr.locator("svg")).toBeVisible();
  // The preview's own leaderboard, not the TV view.
  await expect(qr).toContainText(/\/dev\/public-preview$/);

  // Still in the corner after the board scrolls.
  const box = await qr.boundingBox();
  await page.evaluate(() => window.scrollTo(0, 2000));
  expect(await qr.boundingBox()).toEqual(box);
});
