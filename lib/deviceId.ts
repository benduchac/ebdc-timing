// A random id for this browser, kept in localStorage so a reload keeps it.
// Sent with every sync so the server can tell "my own earlier write" from
// "another computer's write" — see lib/syncGuard.ts. Two tabs in one browser
// share it, which is the known two-tab gap in docs/known-issues.md.

const KEY = "ebdc_device_id";
let memoryId: string | null = null;

export function getDeviceId(): string {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Storage blocked: an id that lasts until the page reloads still covers
    // a session.
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}
