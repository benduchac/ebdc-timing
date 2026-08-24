import type { Page } from "@playwright/test";
import { TEST_PASSPHRASE } from "./constants";

const PASSPHRASE_STORAGE_KEY = "ebdc_operator_passphrase";

// Seeds the same localStorage key OperatorGate writes after a successful
// unlock, so tests skip re-driving that form every time. See
// e2e/auth.spec.ts for the one test that exercises the real unlock flow.
export async function unlockOperator(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PASSPHRASE_STORAGE_KEY, TEST_PASSPHRASE] as const
  );
  await page.goto("/operator");
}

// From the race menu (no active race), starts a fresh one and waits for the
// Registration tab to be ready.
export async function startNewRace(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start Race" }).click();
  await page.getByRole("heading", { name: /^Registration \(/ }).waitFor();
}

export async function uploadCsv(page: Page, absolutePath: string): Promise<void> {
  await page.locator("#csvInput").setInputFiles(absolutePath);
}

export const FIXTURES = {
  good: "fixtures/registrants-2026.csv",
  problems: "fixtures/registrants-2026-problems.csv",
  shuffled: "fixtures/registrants-2026-shuffled-columns.csv",
  crlfBom: "fixtures/registrants-2026-crlf-bom.csv",
  legacy4col: "fixtures/legacy/registrants-2024-4col.csv",
};
