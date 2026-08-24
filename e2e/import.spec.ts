import { test, expect } from "@playwright/test";
import { unlockOperator, startNewRace, uploadCsv, FIXTURES } from "./helpers";

// See fixtures/README.md for what each file proves and its expected outcome.
test.describe("CSV import", () => {
  test.beforeEach(async ({ page }) => {
    await unlockOperator(page);
    await startNewRace(page);
  });

  test("the good file imports all 16 rows", async ({ page }) => {
    await uploadCsv(page, FIXTURES.good);

    await expect(page.getByText("16 of 16 riders imported.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Registration (16 riders)" })
    ).toBeVisible();

    // normalizeBib strips the leading zero on "007" and doesn't collide —
    // the fixture's Tom Smith (bib 17) and Leading Zero (007 -> 7) both land.
    await expect(page.getByRole("cell", { name: "Leading Zero" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Tom Smith, Jr." })
    ).toBeVisible();
  });

  test("shuffled columns and CRLF+BOM import identically to the good file", async ({
    page,
  }) => {
    await uploadCsv(page, FIXTURES.shuffled);
    await expect(page.getByText("16 of 16 riders imported.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Registration (16 riders)" })
    ).toBeVisible();

    await uploadCsv(page, FIXTURES.crlfBom);
    await expect(page.getByText("16 of 16 riders imported.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Registration (16 riders)" })
    ).toBeVisible();
  });

  test("last year's export is refused by name, not silently emptied", async ({
    page,
  }) => {
    await uploadCsv(page, FIXTURES.legacy4col);

    await expect(page.getByText(/doesn't look like a 2026/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Registration (0 riders)" })
    ).toBeVisible();
  });

  test("the problems file imports 9 of 10 rows and names every issue", async ({
    page,
  }) => {
    await uploadCsv(page, FIXTURES.problems);

    await expect(page.getByText("9 of 10 riders imported.")).toBeVisible();
    await expect(
      page.getByText("1 row couldn't be imported (row 10 — no bib)")
    ).toBeVisible();
    await expect(
      page.getByText(/rider.*with a missing or unrecognized gender/)
    ).toBeVisible();
    await expect(
      page.getByText(/birthday.*missing or invalid/)
    ).toBeVisible();
    await expect(
      page.getByText(/rider.*with an invalid wave/)
    ).toBeVisible();
    await expect(page.getByText(/duplicate bib/)).toBeVisible();

    // Setup checklist can't tick "Load registrants" while a rider is
    // unscoreable (the invalid-wave row).
    await expect(page.getByText(/2\. Load registrants/)).toBeVisible();
    await expect(
      page.getByText("Some riders can't be scored — fix flagged rows below")
    ).toBeVisible();

    // Row 25's "Female" (capitalized) is never silently coerced to "female" —
    // it's flagged (checked above) but displayed exactly as submitted.
    await expect(
      page.getByRole("row", { name: /Ines Barros/ }).getByRole("cell", { name: "Female", exact: true })
    ).toBeVisible();
  });
});
