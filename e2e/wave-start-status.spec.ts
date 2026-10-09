import { test, expect, type Page } from "@playwright/test";

// What the start-line page tells the volunteer about their wave times: the
// status box under the buttons, and a restart made with no signal showing as
// the new time instead of looking like nothing happened.

const TOKEN = "dev-token";
const OLD_ISO = "2026-10-10T16:00:02.000Z"; // already on the server

interface Stub {
  online: boolean;
  posts: number[];
  starts: Record<string, string>;
  // Hold the next POST open (no answer) until `release` is called, then fail it.
  holdNext: boolean;
  release: () => void;
}

async function stubServer(page: Page, starts: Record<string, string> = {}) {
  const state: Stub = {
    online: false,
    posts: [],
    starts: { ...starts },
    holdNext: false,
    release: () => {},
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
    if (state.holdNext) {
      state.holdNext = false;
      await new Promise<void>((resolve) => (state.release = resolve));
      return route.abort("connectionfailed");
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

const button = (page: Page, wave: "A" | "B" | "C") =>
  page.getByRole("button", { name: new RegExp(`Wave ${wave}`) });
const box = (page: Page) => page.getByRole("group", { name: "Wave time sync status" });
const timeOf = (page: Page, iso: string) =>
  page.evaluate(
    (v) => new Date(v).toLocaleTimeString("en-US", { hour12: true }),
    iso
  );

test("with nothing started the box says so, and is not green", async ({ page }) => {
  await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await expect(box(page)).toContainText("No wave times yet");
  await expect(box(page)).toHaveAttribute("data-state", "empty");
});

test("the box is below the buttons", async ({ page }) => {
  await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  const lastButton = await button(page, "C").boundingBox();
  const statusBox = await box(page).boundingBox();
  expect(statusBox!.y).toBeGreaterThan(lastButton!.y + lastButton!.height - 1);
});

test("green when everything this phone sent is on the server", async ({ page }) => {
  const server = await stubServer(page);
  server.online = true;
  await page.goto(`/start/${TOKEN}`);
  await button(page, "A").click();

  await expect(box(page)).toContainText("All wave times synced to the server");
  await expect(box(page)).toHaveAttribute("data-state", "synced");
  await expect(box(page)).toContainText("Wave A");
  await expect(box(page)).toContainText("synced");
  await expect(box(page)).not.toContainText("screenshot");
});

test("amber, with the unsent time, when there is no signal", async ({ page }) => {
  await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await button(page, "A").click();

  await expect(box(page)).toContainText("Waiting to sync — take a screenshot for backup");
  await expect(box(page)).toHaveAttribute("data-state", "unsent");
  await expect(box(page).getByRole("listitem")).toContainText(["Wave A"]);
  await expect(box(page)).toContainText("not sent");
  // The time on the button is the time in the box, so a screenshot matches.
  const buttonText = await button(page, "A").innerText();
  const time = buttonText.match(/\d{1,2}:\d{2}:\d{2} [AP]M/)![0];
  await expect(box(page)).toContainText(time);
});

test("amber turns green by itself when the signal comes back", async ({ page }) => {
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await button(page, "A").click();
  await expect(box(page)).toHaveAttribute("data-state", "unsent");

  server.online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(box(page)).toHaveAttribute("data-state", "synced", { timeout: 2_000 });
  await expect(box(page)).toContainText("All wave times synced to the server");
});

test("restarting a confirmed wave with no signal shows the new time, not the old one", async ({
  page,
}) => {
  await page.clock.install();
  const server = await stubServer(page, { A: OLD_ISO });
  await page.goto(`/start/${TOKEN}`);
  const oldTime = await timeOf(page, OLD_ISO);
  await expect(button(page, "A")).toContainText(`Started at ${oldTime}`);
  await expect(box(page)).toContainText("All wave times synced to the server");

  // The signal is gone. Tap once to arm, again to restart.
  await page.clock.fastForward(60_000);
  await button(page, "A").click();
  await expect(button(page, "A")).toContainText(`Already started at ${oldTime}`);
  await button(page, "A").click();

  // The button now carries the new time and says it hasn't been sent.
  await expect(button(page, "A")).toContainText(/Restarted at .* not sent yet/);
  await expect(button(page, "A")).not.toContainText(oldTime);
  // And the box says what to do about it.
  await expect(box(page)).toContainText("Waiting to sync — take a screenshot for backup");
  await expect(box(page)).not.toContainText(oldTime);

  // When the signal returns, the new time reaches the server.
  server.online = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(box(page)).toContainText("All wave times synced to the server", { timeout: 2_000 });
  const newest = server.posts[server.posts.length - 1];
  await expect.poll(() => server.starts.A).toBe(new Date(newest).toISOString());
  expect(server.starts.A).not.toBe(OLD_ISO);
  await expect(button(page, "A")).toContainText(/^Wave AStarted at \d{1,2}:\d{2}:\d{2} [AP]M$/);
});

test("a tap replaced while its request was still out does not come back to retry", async ({
  page,
}) => {
  await page.clock.install();
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);

  // Tap 1's request is out and unanswered.
  server.holdNext = true;
  await button(page, "A").click();
  await expect.poll(() => server.posts.length).toBe(1);
  const first = server.posts[0];

  // The volunteer restarts the wave. Tap 2 replaces tap 1 and fails (no signal).
  await page.clock.fastForward(2_000);
  await button(page, "A").click(); // arm
  await button(page, "A").click(); // tap 2
  await expect.poll(() => new Set(server.posts).size).toBe(2);
  const second = [...new Set(server.posts)].find((t) => t !== first)!;
  expect(second).toBeGreaterThan(first);

  // Now tap 1's request finally fails. Its tap is gone; it must not retry.
  server.release();
  await page.waitForTimeout(200);

  // The signal returns, and only the retry timers notice (no "online" event,
  // which would reset them). From here nothing but tap 2 may be sent.
  const sentBefore = server.posts.length;
  server.online = true;
  for (let i = 0; i < 4; i++) await page.clock.fastForward(16_000);
  await expect(box(page)).toContainText("All wave times synced to the server");

  const afterwards = server.posts.slice(sentBefore);
  expect(afterwards.length).toBeGreaterThan(0);
  expect(new Set(afterwards)).toEqual(new Set([second]));
  expect(server.starts.A).toBe(new Date(second).toISOString());
});

test("the status area is plain text beside a bar, not another button", async ({ page }) => {
  const server = await stubServer(page);
  await page.goto(`/start/${TOKEN}`);
  await button(page, "A").click();
  const styles = async () =>
    box(page).evaluate((el) => {
      const c = getComputedStyle(el);
      return {
        background: c.backgroundColor,
        radius: c.borderTopLeftRadius,
        top: c.borderTopWidth,
        left: c.borderLeftWidth,
      };
    });

  for (const wait of ["unsent", "synced"] as const) {
    if (wait === "synced") {
      server.online = true;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
    }
    await expect(box(page)).toHaveAttribute("data-state", wait, { timeout: 2_000 });
    const st = await styles();
    expect(st.background).toBe("rgba(0, 0, 0, 0)"); // no fill
    expect(st.radius).toBe("0px"); // not rounded like the buttons
    expect(st.top).toBe("0px"); // no box border
    expect(st.left).toBe("4px"); // just the accent bar
  }
  // And the microcopy that promised it would send by itself is gone.
  await expect(box(page)).not.toContainText("sends by itself");
});

test("two taps in a row leave nothing behind, on screen or in storage", async ({ page }) => {
  const server = await stubServer(page);
  server.online = true;
  await page.goto(`/start/${TOKEN}`);

  // A's reply and B's tap land close together.
  await button(page, "A").click();
  await button(page, "B").click();
  await button(page, "C").click();

  await expect(box(page)).toHaveAttribute("data-state", "synced");
  for (const wave of ["A", "B", "C"] as const) {
    await expect(button(page, wave)).toContainText(/^Wave .Started at \d{1,2}:\d{2}:\d{2} [AP]M$/);
  }
  const saved = await page.evaluate(
    (key) => localStorage.getItem(key),
    `ebdc-wave-start-pending:${TOKEN}`
  );
  expect(JSON.parse(saved ?? "{}")).toEqual({});
});
