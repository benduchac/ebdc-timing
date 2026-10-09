import { test, expect, type Page } from "@playwright/test";

// How hard the start-line page tries to get an unsent tap out. No Redis here,
// so the server is a stub, and the clock is Playwright's so waiting is free.

const TOKEN = "dev-token";

interface Stub {
  online: boolean;
  hang: boolean; // accept a request and never answer
  posts: number[]; // timestampMs of every attempt, in order
  starts: Record<string, string>;
  // When on, every POST waits here until released, then succeeds. gates[i]
  // releases the i-th request.
  gated: boolean;
  gates: (() => void)[];
}

async function stubServer(page: Page): Promise<Stub> {
  const state: Stub = {
    online: false,
    hang: false,
    posts: [],
    starts: {},
    gated: false,
    gates: [],
  };
  await page.route("**/api/wave-start*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, waveStarts: state.starts }),
      });
    }
    const body = JSON.parse(request.postData() ?? "{}");
    state.posts.push(body.timestampMs);
    if (state.hang) return new Promise<void>(() => {}); // never answers
    if (state.gated) {
      await new Promise<void>((resolve) => state.gates.push(resolve));
      const startedAt = new Date(body.timestampMs).toISOString();
      state.starts[body.wave] = startedAt;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, wave: body.wave, startedAt }),
      });
    }
    if (!state.online) return route.abort("connectionfailed");
    const startedAt = new Date(body.timestampMs).toISOString();
    state.starts[body.wave] = startedAt;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, wave: body.wave, startedAt }),
    });
  });
  return state;
}

// The button once the tap has reached the server. An unsent tap also reads
// "Started at 9:00:02 AM", followed by "not sent yet", so the pattern is
// anchored at the end to tell them apart.
const SENT = /^Wave AStarted at \d{1,2}:\d{2}:\d{2} [AP]M$/;

const waveA = (page: Page) => page.getByRole("button", { name: /Wave A/ });

test("it keeps trying at least every 15 seconds, however long the signal is gone", async ({
  page,
}) => {
  await page.clock.install();
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await waveA(page).click();
  await expect(waveA(page)).toContainText("not sent yet");

  // Burn through the backoff: 2, 4, 8, then a steady 15 seconds. Ten windows
  // is far enough that a cap of a minute would be waiting 60 seconds by now.
  for (let i = 0; i < 10; i++) await page.clock.fastForward(16_000);
  expect(server.posts.length).toBeGreaterThanOrEqual(3);

  // Each further 16 seconds brings at least one more attempt.
  for (let i = 0; i < 3; i++) {
    const n = server.posts.length;
    await page.clock.fastForward(16_000);
    await expect.poll(() => server.posts.length).toBeGreaterThan(n);
  }
  // All of them are the same tap.
  expect(new Set(server.posts).size).toBe(1);
});

test("the first retry comes within a few seconds", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await waveA(page).click();
  await expect.poll(() => server.posts.length).toBe(1);

  await page.clock.fastForward(2_500);
  await expect.poll(() => server.posts.length).toBe(2);
});

test("the signal coming back sends at once, without waiting for the timer", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await waveA(page).click();
  // Let the backoff reach its longest wait, so only the event can explain
  // a send in the next moment.
  for (let i = 0; i < 10; i++) await page.clock.fastForward(16_000);
  await expect(waveA(page)).toContainText("not sent yet");

  server.online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // Well inside the next timer step, so only the event can explain it.
  await expect(waveA(page)).toContainText(SENT, { timeout: 1_500 });
  expect(server.starts.A).toBeTruthy();
});

test("waking the screen sends at once", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await waveA(page).click();
  for (let i = 0; i < 10; i++) await page.clock.fastForward(16_000);
  await expect(waveA(page)).toContainText("not sent yet");

  server.online = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  await expect(waveA(page)).toContainText(SENT, { timeout: 1_500 });
});

test("a request that never answers is given up on and retried", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page);
  server.hang = true;
  await page.goto(`/start/${TOKEN}`);
  await waveA(page).click();
  await expect.poll(() => server.posts.length).toBe(1);

  // Past the 8-second limit, the dead attempt is dropped and the next one goes
  // out; with no answer from the first it would otherwise wait forever.
  server.hang = false;
  server.online = true;
  await page.clock.fastForward(9_000);
  await page.clock.fastForward(3_000);

  await expect(waveA(page)).toContainText(SENT);
  expect(server.posts.length).toBeGreaterThanOrEqual(2);
  expect(new Set(server.posts).size).toBe(1);
});

test("a second wake while an attempt is still out does not send a second copy", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page);
  server.hang = true;
  await page.goto(`/start/${TOKEN}`);
  await waveA(page).click();
  await expect.poll(() => server.posts.length).toBe(1);

  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(300);
  expect(server.posts.length).toBe(1);
});

test("a slow connection that needs longer than 8 seconds still gets a send through", async ({
  page,
}) => {
  await page.clock.install();
  const server = await stubServer(page);
  server.gated = true; // every request waits to be released
  await page.goto(`/start/${TOKEN}`);
  await waveA(page).click();
  await expect.poll(() => server.gates.length).toBe(1);

  // The first attempt is given up on at 8 seconds and retried a moment later.
  await page.clock.fastForward(8_500);
  await page.clock.fastForward(2_500);
  await expect.poll(() => server.gates.length).toBe(2);

  // The second is allowed longer, so a reply that takes 10 seconds counts.
  await page.clock.fastForward(10_000);
  server.gates[1]();
  await expect(waveA(page)).toContainText(SENT);
  expect(server.posts.length).toBe(2);
});

test("waking the screen replaces a send that is stuck, rather than waiting it out", async ({
  page,
}) => {
  await page.clock.install();
  const server = await stubServer(page);
  server.hang = true;
  await page.goto(`/start/${TOKEN}`);
  await waveA(page).click();
  await expect.poll(() => server.posts.length).toBe(1);

  // Stuck for a while: older than the grace period, younger than the timeout.
  await page.clock.fastForward(3_000);
  server.hang = false;
  server.online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(waveA(page)).toContainText(SENT, { timeout: 1_500 });
  expect(server.posts.length).toBe(2);
});

test("a late reply for a replaced tap does not put the old time back", async ({ page }) => {
  await page.clock.install();
  const server = await stubServer(page);
  server.gated = true;
  await page.goto(`/start/${TOKEN}`);

  await waveA(page).click(); // tap 1: its request is held open
  await expect.poll(() => server.gates.length).toBe(1);
  const first = server.posts[0];

  await page.clock.fastForward(2_000);
  await waveA(page).click(); // arm
  await waveA(page).click(); // tap 2, the restart
  await expect.poll(() => server.gates.length).toBe(2);
  const second = server.posts[1];
  expect(second).toBeGreaterThan(first);

  // Tap 2's reply comes back first and is confirmed...
  server.gates[1]();
  await expect(waveA(page)).toContainText(SENT);
  const showing = await waveA(page).innerText();
  const t2 = showing.match(/\d{1,2}:\d{2}:\d{2} [AP]M/)![0];

  // ...then tap 1's reply arrives, carrying the older time.
  server.gates[0]();
  await page.waitForTimeout(300);
  expect(await waveA(page).innerText()).toContain(t2);
  await expect(page.getByRole("group", { name: "Wave time sync status" })).toHaveAttribute(
    "data-state",
    "synced"
  );
});
