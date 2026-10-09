import { test, expect, type Page } from "@playwright/test";

// On a phone the public overall results are the same card rows the category
// boards use, not a seven-column table with the photo cut off the right edge.
// Rendered from the dev preview page; the image host is stubbed.

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

async function open(page: Page, width: number, query = "") {
  await page.route("https://picsum.photos/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG })
  );
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/dev/public-preview${query}`);
}

const list = (page: Page) => page.locator("div.sm\\:hidden").first();
const table = (page: Page) => page.locator("table").first();

test.describe("on a phone", () => {
  test("the overall results are rows, not a table", async ({ page }) => {
    await open(page, 390);
    await expect(table(page)).toBeHidden();
    await expect(list(page)).toBeVisible();
    // Every finisher is there: 92 in the finished seed.
    await expect(list(page).locator(":scope > div")).toHaveCount(92);
  });

  test("a row shows rank, bib, name, wave, finish time and race time", async ({ page }) => {
    await open(page, 390);
    const first = list(page).locator(":scope > div").first();
    await expect(first).toContainText("Wayne Dubois");
    await expect(first).toContainText("Wave A · 10:22 AM");
    await expect(first).toContainText("1h 22m 34s");
    await expect(first).toContainText("71");
  });

  test("the photo is the last thing on the row and fully on screen", async ({ page }) => {
    await open(page, 390);
    const row = list(page).locator(":scope > div", {
      has: page.getByRole("button", { name: "Open the full photo" }),
    }).first();
    const photo = row.getByRole("button", { name: "Open the full photo" });
    await expect(photo).toBeVisible();
    expect(await photo.evaluate((el) => el === el.parentElement?.lastElementChild)).toBe(true);

    const box = (await photo.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    // Nothing makes the page itself scroll sideways.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });

  test("a row's photo opens the lightbox", async ({ page }) => {
    await open(page, 390);
    await list(page).getByRole("button", { name: "Open the full photo" }).first().click();
    await expect(page.getByRole("dialog", { name: "Finish-line photo" })).toBeVisible();
  });

  test("without photos the rows have none", async ({ page }) => {
    await open(page, 390, "?photos=none");
    await expect(list(page).locator(":scope > div")).toHaveCount(92);
    await expect(page.getByRole("button", { name: "Open the full photo" })).toHaveCount(0);
  });
});

test.describe("on a larger screen", () => {
  for (const width of [640, 768, 1280]) {
    test(`at ${width}px it is the table, and the table fits`, async ({ page }) => {
      await open(page, width);
      await expect(table(page)).toBeVisible();
      await expect(list(page)).toBeHidden();
      // The Photo column is on screen, not scrolled away.
      const header = page.locator("thead th", { hasText: "Photo" });
      const box = (await header.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const overflowing = await page
        .locator("div.overflow-x-auto")
        .first()
        .evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(overflowing).toBe(false);
    });
  }
});

test("the operator's Results table is never swapped for rows", async () => {
  const { readFileSync } = await import("fs");
  const { resolve } = await import("path");
  const source = readFileSync(resolve(__dirname, "../components/ResultsTable.tsx"), "utf8");
  // The editable table returns before the phone rows are built.
  expect(source.indexOf("if (editable) return table;")).toBeGreaterThan(-1);
  expect(source.indexOf("if (editable) return table;")).toBeLessThan(source.indexOf("sm:hidden"));
});
