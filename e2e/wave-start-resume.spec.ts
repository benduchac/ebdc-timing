import { test, expect } from "@playwright/test";

// A tap made with no signal must survive the page being closed, and go out
// with the moment it was tapped, not the moment the page was reopened.

const TOKEN = "dev-token";

test("a tap made offline is sent, with its original time, when the page is reopened", async ({
  page,
}) => {
  let online = false;
  const posts: { wave: string; timestampMs: number }[] = [];
  const starts: Record<string, string> = {};

  await page.route("**/api/wave-start*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, waveStarts: starts }),
      });
    }
    const body = JSON.parse(request.postData() ?? "{}");
    posts.push({ wave: body.wave, timestampMs: body.timestampMs });
    if (!online) return route.abort("connectionfailed");
    const startedAt = new Date(body.timestampMs).toISOString();
    starts[body.wave] = startedAt;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, wave: body.wave, startedAt }),
    });
  });

  await page.goto(`/start/${TOKEN}`);
  const waveA = page.getByRole("button", { name: /Wave A/ });

  // 1. Tap with no service. It is shown as started, and not sent.
  await waveA.click();
  await expect(waveA).toContainText("not sent yet, retrying");
  await expect.poll(() => posts.length).toBeGreaterThan(0);
  const tappedAt = posts[0].timestampMs;

  // 2-3. Time passes and the signal comes back, but the page is closed.
  await page.goto("about:blank");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  online = true;

  // 4. Opening the page again sends it, without another tap.
  await page.goto(`/start/${TOKEN}`);
  await expect(page.getByRole("button", { name: /Wave A/ })).toContainText(
    /^Wave AStarted at \d{1,2}:\d{2}:\d{2} [AP]M$/
  );

  const sent = posts.filter((p) => p.wave === "A").pop()!;
  expect(sent.timestampMs).toBe(tappedAt);
  expect(starts.A).toBe(new Date(tappedAt).toISOString());
  // One tap, however many tries it took.
  expect(new Set(posts.map((p) => p.timestampMs)).size).toBe(1);
});
