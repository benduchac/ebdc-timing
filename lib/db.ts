import Dexie from "dexie";

export interface Registrant {
  bib: string;
  firstName: string;
  lastName: string;
  wave: "A" | "B" | "C";
  dob: string; // Format: YYYY-MM-DD
  gender: "male" | "female" | "n/a";
}

export interface Entry {
  id: number;
  bib: string;
  wave: "A" | "B" | "C" | null;
  firstName: string;
  lastName: string;
  finishTime: string;
  finishTimeMs: number;
  elapsedTime: string;
  elapsedMs: number | null;
  timestamp: string;
}

export interface RaceState {
  id?: number;
  // Phase 3 race identity — optional because pre-existing local records
  // predate it; app/operator/page.tsx mints these on load if absent so old
  // data migrates seamlessly instead of forcing a new race.
  raceId?: string;
  raceLabel?: string;
  raceCreatedAt?: string; // ISO
  raceSlug?: string; // assigned server-side on first sync; absent until then
  // Last snapshot timestamp the cloud actually acked for this race. Restored
  // on load purely for the "Backed up Nm ago" idle badge text; the badge's
  // dirty/synced status itself is re-earned each session, not trusted from
  // a prior one (see docs/race-readiness-design.md "Sync indicator").
  cloudLastSyncedAt?: string;
  // True once the operator has explicitly saved wave times via the setup
  // checklist or edited one via the Timing tab — tracks "has this been
  // reviewed," not "is it correct" (defaults are always a valid-looking
  // value, reviewed or not). Synced to the cloud snapshot too so recovery on
  // a different machine doesn't force re-confirmation.
  waveTimesConfirmed?: boolean;
  waveStartTimes: {
    A: string;
    B: string;
    C: string;
  };
  registrants: [string, Registrant][];
  entries: Entry[];
  entryCounter: number;
  lastSaved: string;
}

export interface SetupConfig {
  id?: number;
  waveATime: string;
  waveBTime: string;
  waveCTime: string;
  lastUpdated: string;
}

// Create and configure the database
const database = new Dexie("EBDCTiming");

database.version(1).stores({
  entries: "++id, bib, wave, finishTimeMs",
  raceState: "++id",
});

database.version(2).stores({
  entries: "++id, bib, wave, finishTimeMs",
  raceState: "++id",
  setupConfig: "++id",
});

// v3: drop the unused `entries` store. Entry data has always lived inside the
// single `raceState` snapshot row; this table and its indexes were never
// written to. Setting the store to null deletes it (no data to migrate).
database.version(3).stores({
  raceState: "++id",
  setupConfig: "++id",
  entries: null,
});

export const db = database as Dexie & {
  raceState: Dexie.Table<RaceState, number>;
  setupConfig: Dexie.Table<SetupConfig, number>;
};

export async function clearAllData(): Promise<void> {
  await db.raceState.clear();
  await db.setupConfig.clear();
}
