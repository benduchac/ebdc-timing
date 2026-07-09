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

export const verifySystemClock = async (): Promise<ClockCheckResult> => {
  try {
    const response = await fetch(
      "https://worldtimeapi.org/api/timezone/America/Los_Angeles"
    );
    const data = await response.json();
    const serverTime = new Date(data.datetime);
    const localTime = new Date();

    const diffMs = Math.abs(serverTime.getTime() - localTime.getTime());
    const diffSeconds = Math.round(diffMs / 1000);

    return {
      serverTime: serverTime.toLocaleTimeString("en-US", { hour12: false }),
      localTime: localTime.toLocaleTimeString("en-US", { hour12: false }),
      diffSeconds,
      ok: diffSeconds < 60,
    };
  } catch {
    return {
      localTime: new Date().toLocaleTimeString("en-US", { hour12: false }),
      ok: null,
      error: "Can't verify (offline)",
    };
  }
};
