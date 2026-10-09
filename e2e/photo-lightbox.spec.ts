import { test, expect, type Page } from "@playwright/test";

// The photo lightbox on the public leaderboard, against the dev preview page
// (/dev/public-preview), which renders a seeded race with photos from
// picsum.photos. The image host is stubbed so these don't touch the network.

// A 1x1 JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

async function stubImages(page: Page) {
  const requested: string[] = [];
  await page.route("https://picsum.photos/**", async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG });
  });
  return requested;
}

const fullFrames = (requested: string[]) =>
  requested.filter((u) => u.includes("/1200/800"));

test("the photo is the last cell on the row, after the race time", async ({ page }) => {
  await stubImages(page);
  await page.goto("/dev/public-preview");

  const headers = await page.locator("thead th").allInnerTexts();
  expect(headers.slice(-2)).toEqual(["Race Time", "Photo"]);

  // Every row has the same number of cells, photo or not.
  const counts = await page
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((r) => r.querySelectorAll("td").length));
  expect(new Set(counts)).toEqual(new Set([headers.length]));

  // And the thumbnail lives in the last cell, never an earlier one.
  const firstWithPhoto = page.locator("tbody tr", {
    has: page.getByRole("button", { name: "Open the full photo" }),
  }).first();
  await expect(
    firstWithPhoto.locator("td").last().getByRole("button", { name: "Open the full photo" })
  ).toBeVisible();
  await expect(
    firstWithPhoto.locator("td:not(:last-child)").getByRole("button", { name: "Open the full photo" })
  ).toHaveCount(0);
});

test("a race with no photos has no Photo column", async ({ page }) => {
  await stubImages(page);
  await page.goto("/dev/public-preview?photos=none");
  await expect(page.locator("thead th").last()).toHaveText("Race Time");
  await expect(page.getByRole("button", { name: "Open the full photo" })).toHaveCount(0);
});

test("tapping a thumbnail opens a lightbox on the same page, and loads the full frame only then", async ({
  page,
  context,
}) => {
  const requested = await stubImages(page);
  await page.goto("/dev/public-preview");
  await expect(page.getByRole("button", { name: "Open the full photo" }).first()).toBeVisible();

  // Thumbnails are loaded; no full frame has been.
  expect(requested.length).toBeGreaterThan(0);
  expect(fullFrames(requested)).toHaveLength(0);
  const url = page.url();

  await page.getByRole("button", { name: "Open the full photo" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Finish-line photo" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => fullFrames(requested).length).toBe(1);
  // Same tab, same page.
  expect(context.pages()).toHaveLength(1);
  expect(page.url()).toBe(url);
  // The page behind can't scroll.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
});

test("the lightbox closes from the button, the backdrop and Escape, but not from the photo", async ({
  page,
}) => {
  await stubImages(page);
  await page.goto("/dev/public-preview");
  const open = () => page.getByRole("button", { name: "Open the full photo" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Finish-line photo" });

  await open();
  await expect(dialog).toBeVisible();
  await dialog.locator("img").click();
  await expect(dialog).toBeVisible(); // tapping the photo does not close it

  await page.getByRole("button", { name: "Close photo" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");

  await open();
  await dialog.click({ position: { x: 5, y: 200 } }); // dark area
  await expect(dialog).toHaveCount(0);

  await open();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("a photo on the category boards opens the same lightbox", async ({ page }) => {
  await stubImages(page);
  await page.goto("/dev/public-preview");
  await page.getByRole("button", { name: "Categories" }).click();

  const card = page.locator("div", { has: page.getByRole("heading", { name: "Men's Overall" }) }).last();
  const photo = card.getByRole("button", { name: "Open the full photo" }).first();
  await expect(photo).toBeVisible();

  // Last on its row, after the time.
  expect(await photo.evaluate((el) => el === el.parentElement?.lastElementChild)).toBe(true);

  await photo.click();
  await expect(page.getByRole("dialog", { name: "Finish-line photo" })).toBeVisible();
});

test("the preview page is dev-only", async () => {
  // Pinned in the source because the test server always runs in development.
  const { readFileSync } = await import("fs");
  const { resolve } = await import("path");
  const source = readFileSync(resolve(__dirname, "../app/dev/public-preview/page.tsx"), "utf8");
  expect(source).toContain('process.env.NODE_ENV === "production") notFound()');
});
