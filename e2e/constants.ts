// Shared between playwright.config.ts (which sets this as the dev server's
// PUBLISH_SECRET) and every test that needs to get past OperatorGate.
export const TEST_PASSPHRASE = "e2e-test-passphrase";
