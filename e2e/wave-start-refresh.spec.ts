import { test, expect, type Page } from "@playwright/test";

// The start-line page refreshes the wave times other phones have sent. There
// is no Redis here, so the server is a stub at the network boundary, and the
// clock is Playwright's so 15 seconds takes no time. The page runs in its dev
// preview (no storage), which is the same component the real page renders.

const TOKEN = "dev-token";
const REFRESH_PLUS = 16_000;

type Starts = Partial<Record<"A" | "B" | "C", string>>;

const timeOf = (page: Page, iso: string) =>
  page.evaluate(
    (value) => new Date(value).toLocaleTimeString("en-US", { hour12: true }),
    iso
  );

// Serves the wave starts and records each phone tap into them, the way the
// real route would. `failing` makes every read drop; `holdNextGet` makes the
// next read wait until released, so a test can land it late.
async function stubServer(page: Page, initial: Starts = {}) {
  const state = {
    starts: { ...initial } as Starts,
    failing: false,
    gets: 0,
    hold: null as null | { release: () => void; answer: Starts },
  };
  await page.route("**/api/wave-start*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      state.gets += 1;
      if (state.failing) return route.abort("connectionfailed");
      if (state.hold) {
        const { hold } = state;
        state.hold = null;
        await new Promise<void>((resolve) => (hold.release = resolve));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, waveStarts: hold.answer }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, waveStarts: state.starts }),
      });
    }
    const body = JSON.parse(request.postData() ?? "{}");
    const startedAt = new Date(body.timestampMs).toISOString();
    state.starts[body.wave as "A" | "B" | "C"] = startedAt;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, wave: body.wave, startedAt }),
    });
  });
  return state;
}

const button = (page: Page, wave: "A" | "B" | "C") =>
  page.getByRole("button", { name: new RegExp(`Wave ${wave}`) });

test("a wave started on another phone shows up without a reload", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await expect(button(page, "A")).toContainText("Tap when the lead rider crosses");

  server.starts.A = "2026-10-10T16:00:02.000Z";
  await page.clock.fastForward(REFRESH_PLUS);

  await expect(button(page, "A")).toContainText(
    `Started at ${await timeOf(page, "2026-10-10T16:00:02.000Z")}`
  );
  // The other waves are still ready to tap.
  await expect(button(page, "B")).toContainText("Tap when the lead rider crosses");
});

test("losing the connection keeps every button and every known time", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page, { A: "2026-10-10T16:00:02.000Z" });
  await page.goto(`/start/${TOKEN}`);
  const aTime = await timeOf(page, "2026-10-10T16:00:02.000Z");
  await expect(button(page, "A")).toContainText(`Started at ${aTime}`);
  await expect(page.getByRole("status")).toContainText("up to date as of");

  server.failing = true;
  await page.clock.fastForward(REFRESH_PLUS);
  await expect(page.getByRole("status")).toContainText("Can't reach the server");
  await page.clock.fastForward(REFRESH_PLUS);

  // Nothing disappeared, and the buttons still work.
  await expect(button(page, "A")).toContainText(`Started at ${aTime}`);
  await expect(button(page, "B")).toBeEnabled();
  await expect(button(page, "C")).toBeEnabled();
  await expect(button(page, "B")).toContainText("Tap when the lead rider crosses");

  // A tap while offline is captured and shown, to be sent when the signal is back.
  await button(page, "B").click();
  await expect(button(page, "B")).toContainText(/Started at/);
});

test("it recovers by itself when the signal comes back", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);

  server.failing = true;
  await page.clock.fastForward(REFRESH_PLUS);
  await expect(page.getByRole("status")).toContainText("Can't reach the server");

  // Another phone sent Wave B while this one had no signal.
  server.starts.B = "2026-10-10T16:15:01.000Z";
  server.failing = false;
  await page.clock.fastForward(REFRESH_PLUS);

  await expect(page.getByRole("status")).toContainText("up to date as of");
  await expect(button(page, "B")).toContainText(
    `Started at ${await timeOf(page, "2026-10-10T16:15:01.000Z")}`
  );
});

test("regaining the connection refreshes at once, without waiting for the timer", async ({
  page,
}) => {
  await page.clock.install();
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await expect.poll(() => server.gets).toBeGreaterThan(0);
  const before = server.gets;

  server.starts.C = "2026-10-10T16:30:00.000Z";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect.poll(() => server.gets).toBeGreaterThan(before);
  await expect(button(page, "C")).toContainText("Started at");
});

test("a late reply from before this phone's own tap does not undo it", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page, { A: "2026-10-10T16:00:00.000Z" });
  await page.goto(`/start/${TOKEN}`);
  const oldTime = await timeOf(page, "2026-10-10T16:00:00.000Z");
  await expect(button(page, "A")).toContainText(`Started at ${oldTime}`);

  // The next refresh is sent and then held, still carrying the old time.
  server.hold = { release: () => {}, answer: { A: "2026-10-10T16:00:00.000Z" } };
  const held = server.hold;
  await page.clock.fastForward(REFRESH_PLUS);
  await expect.poll(() => server.hold === null).toBe(true);

  // This phone restarts the wave: the first tap arms it, the second sends.
  await button(page, "A").click();
  await button(page, "A").click();
  await expect(button(page, "A")).not.toContainText(oldTime);
  const newText = await button(page, "A").innerText();

  // Now the old answer arrives.
  held.release();
  await page.waitForTimeout(300);

  expect(await button(page, "A").innerText()).toBe(newText);
  await expect(button(page, "A")).not.toContainText(oldTime);
});
