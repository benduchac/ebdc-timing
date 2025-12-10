import type { ClockCheckResult } from "./types";

export const formatElapsedTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Always show hours, even if 0
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
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
  } catch (error) {
    return {
      localTime: new Date().toLocaleTimeString("en-US", { hour12: false }),
      ok: null,
      error: "Can't verify (offline)",
    };
  }
};
