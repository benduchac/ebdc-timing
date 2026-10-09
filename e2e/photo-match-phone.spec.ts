import { test, expect, type Page, type Request } from "@playwright/test";

// The photographer's Match view on /photo/[token]. No Redis here, so the
// server is a stub at the network boundary: what's under test is that the
// phone matches with its photo link (never a passphrase), and what the page
// does with the answers.

const TOKEN = "11111111-2222-4333-8444-555555555555";
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const FINISH_MS = Date.UTC(2026, 9, 10, 17, 30, 0);

const finishers = [
  { id: 1, bib: "12", name: "Pat Rider", finishTime: "10:30:00 AM", finishTimeMs: FINISH_MS },
  { id: 2, bib: "34", name: "Sam Pedal", finishTime: "10:45:00 AM", finishTimeMs: FINISH_MS + 15 * 60_000 },
];

const photo = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  url: PIXEL,
  thumbUrl: PIXEL,
  capturedAtMs: FINISH_MS - 4_000,
  capturedSource: "exif",
  contentHash: "h1",
  clockOffsetMs: 0,
  width: 1600,
  height: 1200,
  uploadedAt: "2026-10-10T17:31:00.000Z",
  status: "pending",
  entryId: null,
};

async function stubServer(page: Page) {
  const requests: Request[] = [];
  await page.route("**/api/photos*", async (route) => {
    const request = route.request();
    requests.push(request);
    const url = new URL(request.url());
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          label: "Test Race",
          photos: [photo],
          ...(url.searchParams.get("finishers") === "1" ? { finishers } : {}),
        }),
      });
    }
    if (request.method() === "PATCH") {
      const body = JSON.parse(request.postData() ?? "{}");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          photo: {
            ...photo,
            status: body.entryId === null ? "pending" : "approved",
            entryId: body.entryId,
          },
        }),
      });
    }
    if (request.method() === "DELETE") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.continue();
  });
  return requests;
}

const matchRequests = (requests: Request[]) =>
  requests.filter((r) => new URL(r.url()).searchParams.get("finishers") === "1");

test("the Match view is quiet until it is opened, and the Upload view stays mounted", async ({
  page,
}) => {
  const requests = await stubServer(page);
  await page.goto(`/photo/${TOKEN}`);
  await expect(page.getByRole("button", { name: /Add photos/ })).toBeVisible();

  // Upload is the default view, and Match hasn't asked for finishers yet.
  await page.waitForTimeout(500);
  expect(matchRequests(requests)).toHaveLength(0);

  await page.getByRole("button", { name: "Match", exact: true }).click();
  await expect(page.getByRole("button", { name: /Pat Rider/ })).toBeVisible();
  expect(matchRequests(requests).length).toBeGreaterThan(0);

  // Hidden, not gone: it holds the queue of photos still being sent.
  await expect(page.getByRole("button", { name: /Add photos/ })).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Add photos/, includeHidden: true })
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("button", { name: /Add photos/ })).toBeVisible();
});

test("approving a photo sends the photo link, not a passphrase", async ({ page }) => {
  const requests = await stubServer(page);
  await page.goto(`/photo/${TOKEN}`);
  await page.getByRole("button", { name: "Match", exact: true }).click();

  // The rider who crossed 4s after the shutter is offered first; the one 15
  // minutes later is not offered at all.
  await expect(page.getByRole("button", { name: /Pat Rider/ })).toContainText("4.0s before");
  await expect(page.getByRole("button", { name: /Sam Pedal/ })).toHaveCount(0);

  await page.getByRole("button", { name: /Pat Rider/ }).click();
  await expect(page.getByText("Approved (1)")).toBeVisible();

  const patch = requests.find((r) => r.method() === "PATCH")!;
  expect(JSON.parse(patch.postData()!)).toEqual({
    token: TOKEN,
    photoId: photo.id,
    entryId: 1,
  });
  expect(patch.headers()["authorization"]).toBeUndefined();

  // And it can be taken back.
  await page.getByRole("button", { name: "Unapprove" }).click();
  await expect(page.getByText("Approved (1)")).toHaveCount(0);
  const patches = requests.filter((r) => r.method() === "PATCH");
  expect(JSON.parse(patches[1].postData()!).entryId).toBeNull();
});

test("the search finds a rider the times didn't suggest", async ({ page }) => {
  await stubServer(page);
  await page.goto(`/photo/${TOKEN}`);
  await page.getByRole("button", { name: "Match", exact: true }).click();

  await page.getByRole("button", { name: "Someone else" }).click();
  await page.getByPlaceholder("Search by bib or name").fill("034");
  await expect(page.getByRole("button", { name: /Sam Pedal/ })).toBeVisible();
});

test("deleting asks first, then sends the photo link", async ({ page }) => {
  const requests = await stubServer(page);
  await page.goto(`/photo/${TOKEN}`);
  await page.getByRole("button", { name: "Match", exact: true }).click();

  const dialogs: string[] = [];
  page.once("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  await page.getByRole("button", { name: "Delete photo" }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(requests.some((r) => r.method() === "DELETE")).toBe(false);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete photo" }).click();
  await expect.poll(() => requests.some((r) => r.method() === "DELETE")).toBe(true);

  const del = requests.find((r) => r.method() === "DELETE")!;
  const params = new URL(del.url()).searchParams;
  expect(params.get("token")).toBe(TOKEN);
  expect(params.get("photoId")).toBe(photo.id);
  expect(del.headers()["authorization"]).toBeUndefined();
  await expect(page.getByRole("button", { name: "Delete photo" })).toHaveCount(0);
});

test("a refused decision says so and leaves the photo where it was", async ({ page }) => {
  await page.route("**/api/photos*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, photos: [photo], finishers }),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "Invalid or expired link." }),
    });
  });
  await page.goto(`/photo/${TOKEN}`);
  await page.getByRole("button", { name: "Match", exact: true }).click();
  await page.getByRole("button", { name: /Pat Rider/ }).click();

  await expect(page.getByText("Invalid or expired link.")).toBeVisible();
  await expect(page.getByText("Approved (1)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pat Rider/ })).toBeVisible();
});
