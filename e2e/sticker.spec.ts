import { test, expect } from "@playwright/test";
import { unlockOperator, startNewRace } from "./helpers";

// The brand sticker in app/layout.tsx is fixed to the top-right corner of
// every page. On the operator screen it must never sit over the Settings gear.
for (const width of [360, 390, 640, 768, 1024, 1280, 1440]) {
  test(`the sticker does not cover the Settings gear at ${width}px wide`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await unlockOperator(page);
    await startNewRace(page);

    const gear = await page.getByTitle("Settings").boundingBox();
    const sticker = await page.locator('img[aria-hidden="true"]').first().boundingBox();
    expect(gear).not.toBeNull();
    expect(sticker).not.toBeNull();

    const overlaps =
      gear!.x < sticker!.x + sticker!.width &&
      gear!.x + gear!.width > sticker!.x &&
      gear!.y < sticker!.y + sticker!.height &&
      gear!.y + gear!.height > sticker!.y;
    expect(overlaps, `gear ${JSON.stringify(gear)} vs sticker ${JSON.stringify(sticker)}`).toBe(false);
  });
}
