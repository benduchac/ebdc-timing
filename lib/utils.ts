import type { ClockCheckResult } from "./types";

export const formatElapsedTime = (ms: number): string => {
  // A negative elapsed time means a finish was recorded before its wave's
  // start time (misconfigured/edited start). Surface it clearly with a leading
  // "-" instead of rendering garbage like "-1:-1:-5".
  const sign = ms < 0 ? "-" : "";
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Always show hours, even if 0
  return `${sign}${hours}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
};

/**
 * Normalizes a bib number by stripping leading zeros, so "001", "01", and
 * "1" all resolve to the same identity ("1"). Bibs are always numeric in
 * this app (registrant sorting already assumes `parseInt` works on them),
 * so there's no case where a leading zero is meaningful — apply this
 * anywhere a bib is stored, looked up, or compared (registrant map keys,
 * recorded entries, duplicate checks) so a rider isn't missed just because
 * the operator typed "1" for a bib registered as "001".
 */
export const normalizeBib = (bib: string): string => {
  const stripped = bib.trim().replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
};

/**
 * Formats how long ago a moment was, as "Xs ago" / "Xm ago" / "Xh ago".
 * Shared by SyncBadge and SetupChecklist's clock panel so there's one
 * relative-time formatter, not divergent copies.
 */
export const formatRelativeTime = (fromMs: number, nowMs: number): string => {
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
};

/**
 * Escape a value for safe inclusion in a CSV cell (RFC 4180).
 * Wraps the value in double quotes and doubles any internal quotes when it
 * contains a comma, quote, or newline. Without this, a name like "Smith, Jr."
 * or 'O"Brien' would shift or break columns in the exported results.
 */
export const csvField = (value: string | number | null | undefined): string => {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

/**
 * Format a duration in seconds as "Xh Ym Zs" (e.g. "8h 0m 0s"). Distinct from
 * formatElapsedTime's "H:MM:SS" — this is for plain-language duration deltas
 * (e.g. "this is 8h 0m 0s later than current"), not a race clock display.
 */
export const formatDurationHMS = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
};

export const getDateString = (): string => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(
    2,
    "0"
  )}${String(now.getMinutes()).padStart(2, "0")}${String(
    now.getSeconds()
  ).padStart(2, "0")}`;
};

export const downloadFile = (
  content: string,
  filename: string,
  mimeType: string
) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Friendly display name for whatever service /api/time currently proxies —
// keep in sync with app/api/time/route.ts if the source ever changes again.
export const TIME_SOURCE_LABEL = "time.now";

export const verifySystemClock = async (): Promise<ClockCheckResult> => {
  try {
    // Proxied through our own /api/time (see that route for why): most
    // simple time APIs don't send CORS headers, so calling them directly
    // from the browser is silently blocked even though curl/a server works.
    const response = await fetch("/api/time");
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? `HTTP ${response.status}`);
    }
    const serverTimeMs: number = data.serverTimeMs;
    const localTime = new Date();

    const diffMs = Math.abs(serverTimeMs - localTime.getTime());
    const diffSeconds = Math.round(diffMs / 1000);

    return {
      serverTime: new Date(serverTimeMs).toLocaleTimeString("en-US", {
        hour12: false,
      }),
      localTime: localTime.toLocaleTimeString("en-US", { hour12: false }),
      diffSeconds,
      // "ok" means genuinely fine — see getClockSeverity for the full
      // fine/caution/alert breakdown used in the UI. Tightened from the
      // original 60s: a finish-line clock is timing individual races, not
      // just roughly telling time, and a 2-minute drift silently corrupts
      // every reported elapsed time by that amount.
      ok: diffSeconds < 5,
    };
  } catch {
    return {
      localTime: new Date().toLocaleTimeString("en-US", { hour12: false }),
      ok: null,
      error: "Can't verify (offline or time service unreachable)",
    };
  }
};

export type ClockSeverity = "fine" | "caution" | "alert" | "unknown";

/**
 * Classifies a clock check into a 3-tier severity (plus "unknown" when it
 * couldn't be verified at all) for consistent UI treatment across the
 * Settings modal and the readiness banner. Thresholds: fine < 5s,
 * caution 5-30s, alert >= 30s.
 */
export const getClockSeverity = (
  result: ClockCheckResult | null
): ClockSeverity => {
  if (!result || result.ok === null || result.diffSeconds === undefined) {
    return "unknown";
  }
  if (result.diffSeconds < 5) return "fine";
  if (result.diffSeconds < 30) return "caution";
  return "alert";
};
