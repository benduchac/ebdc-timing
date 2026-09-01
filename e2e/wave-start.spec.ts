import { test, expect } from "@playwright/test";
import { unlockOperator, startNewRace } from "./helpers";

// This repo's e2e environment has no Redis configured (see
// playwright.config.ts), so cloud sync never succeeds and a race never gets
// a startToken. That's exactly the "not synced yet" / "storage not
// configured" states these tests pin down — the actual token-authorized
// POST/GET flow needs real backup storage to exercise and isn't reachable
// here.

test("Settings shows the wave-start link as pending until the race has synced", async ({
  page,
}) => {
  await unlockOperator(page);
  await startNewRace(page);

  await page.getByTitle("Settings").click();
  await expect(page.getByText("Wave start line")).toBeVisible();
  await expect(
    page.getByText("Link pending first sync — connect to the internet once to")
  ).toBeVisible();
});

test("without configured storage, the page falls back to the dev preview", async ({
  page,
}) => {
  // Storage isn't configured in this environment (or in dev generally — see
  // playwright.config.ts's webServer, which runs `next dev`), so this hits
  // app/start/[token]/page.tsx's dev-preview branch rather than either of
  // its production error states (storageError / invalid token) — both of
  // those need a real deploy with Redis configured to exercise.
  await page.goto("/start/not-a-real-token");
  await expect(page.getByText(/Dev preview/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Wave A/ })
  ).toBeVisible();
});

test("tapping a wave button captures the moment and shows a pending state", async ({
  page,
}) => {
  await page.goto("/start/not-a-real-token");

  const waveAButton = page.getByRole("button", { name: /Wave A/ });
  await expect(waveAButton).toContainText("Tap when the lead rider crosses");

  await waveAButton.click();
  // No backend to confirm against here, so it never reaches the green
  // "confirmed" state — just proves the tap is captured and shown
  // immediately (sending), then starts retrying once the POST 503s.
  await expect(waveAButton).toContainText(/sending|retrying/);
});
