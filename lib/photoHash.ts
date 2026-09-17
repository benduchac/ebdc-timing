// A photo's identity, for spotting one that's already been uploaded.
//
// The photographer is expected to re-pick the whole camera roll every time
// rather than remember which shots they already sent — that's the point of
// the dedupe, and it's what makes a 100-photo batch one swipe instead of a
// hundred taps. So this has to be right.
//
// The whole file, not a cheap prefix: a false positive means a photo is
// silently never uploaded, and losing a frame is worse than the second or
// two this costs. It's also cheaper than it looks, because a duplicate is
// skipped before the expensive part — decoding and resizing — ever runs.
export async function hashFile(file: File): Promise<string | null> {
  // Absent on an insecure origin. Dedupe turns off rather than blocking the
  // upload; the server checks again anyway.
  if (!globalThis.crypto?.subtle) return null;
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer()
    );
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
