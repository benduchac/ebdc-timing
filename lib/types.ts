export type { Registrant, Entry, RaceState } from "./db";
import type { Registrant, Entry } from "./db";

export interface WaveStartTimes {
  A: Date | null;
  B: Date | null;
  C: Date | null;
}

// Cloud backup data model (Phase 3). See docs/race-readiness-design.md
// "Data model" and "Storage" — the race id keeps per-race backups from ever
// colliding, and the snapshot is the same shape the app already serializes
// for local export.
export interface Race {
  id: string;
  label: string;
  createdAt: string; // ISO, set once at race creation
}

export interface RaceSnapshot {
  raceId: string;
  label: string;
  createdAt: string; // ISO, set once at race creation (matches Race.createdAt)
  waveStartTimes: { A: string; B: string; C: string };
  registrants: [string, Registrant][];
  entries: Entry[];
  entryCounter: number;
  lastSaved: string; // ISO, set server-side on every write
}

// Cheap per-race summary stored in the `races:index` registry so the race
// menu doesn't need to pull every full snapshot.
export interface RaceIndexEntry {
  id: string;
  label: string;
  createdAt: string;
  lastSaved: string;
  entryCount: number;
}

export interface ClockCheckResult {
  serverTime?: string;
  localTime: string;
  diffSeconds?: number;
  ok: boolean | null;
  error?: string;
}
