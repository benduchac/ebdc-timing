export type { Registrant, Entry, RaceState } from "./db";

export interface WaveStartTimes {
  A: Date | null;
  B: Date | null;
  C: Date | null;
}

export interface ClockCheckResult {
  serverTime?: string;
  localTime: string;
  diffSeconds?: number;
  ok: boolean | null;
  error?: string;
}
