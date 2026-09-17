import { test, expect } from "@playwright/test";
import { unlockOperator, startNewRace } from "./helpers";

// The server mints the public slug and both companion-link tokens on a
// race's first sync and hands them back on the response. There's no Redis in
// this environment, so the sync is faked at the network boundary — that's
// enough, because what's under test is what the client does with the answer,
// not what the server computed.

const SLUG = "ebdc-test-race";
const START_TOKEN = "11111111-1111-1111-1111-111111111111";
const PHOTO_TOKEN = "22222222-2222-2222-2222-222222222222";

test("a race adopts the slug and both tokens from one sync, not just the last one", async ({
  page,
}) => {
  await page.route("**/api/backup", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        lastSaved: new Date().toISOString(),
        slug: SLUG,
        startToken: START_TOKEN,
        photoToken: PHOTO_TOKEN,
      }),
    });
  });

  await unlockOperator(page);
  await startNewRace(page);

  // All three arrive in the same response, so all three have to survive it.
  // Three separate effects each spreading the race they closed over batched
  // into one write, and only the last one's field stuck — the slug was the
  // one you could see going missing, in this header.
  await expect(page.getByRole("link", { name: SLUG })).toBeVisible();
  await expect(page.getByText("link pending first sync")).toHaveCount(0);

  await page.getByTitle("Settings").click();
  await expect(page.getByText(`/start/${START_TOKEN}`)).toBeVisible();
  await expect(page.getByText(`/photo/${PHOTO_TOKEN}`)).toBeVisible();
});
