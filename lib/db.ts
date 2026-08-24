import Dexie from "dexie";

// Documentation of the valid tokens, not enforced on the field type — see
// the Registrant.gender comment for why: an invalid raw answer (e.g.
// "maybe") needs to be storable and flagged, not silently dropped.
export type YesNo = "yes" | "no";
export type YesNoUnsure = "yes" | "no" | "unsure";

export interface Registrant {
  bib: string;
  firstName: string;
  lastName: string;
  // Nullable: a badly imported row (missing/invalid wave column) still
  // imports rather than being dropped — see docs/fun-awards-timing.md 6a.
  wave: "A" | "B" | "C" | null;
  dob: string; // Format: YYYY-MM-DD
  // Free text, not a union: the importer must be able to carry an invalid
  // token (e.g. "Female") through as a flagged, fixable value rather than
  // silently coercing it to one of the four real tokens — see
  // docs/fun-awards-timing.md section 6a ("never substitute a placeholder").
  // The four real tokens are "male" | "female" | "nonbinary" | "undisclosed";
  // anything else just doesn't match a gendered board's eligibility check.
  gender: string;
  // Optional fun-award questions, answered at registration. Blank/absent
  // means "not eligible for that award," not "unknown." Free text like
  // `gender` above — an invalid token still needs to display and flag, not
  // vanish. Eligibility checks compare against the exact YesNo/YesNoUnsure
  // tokens; anything else just isn't eligible.
  firstGravelRace?: string;
  isParent?: string;
  rigidBike?: string;
  steelBike?: string;
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
  // YYYY-MM-DD, the day wave start times were confirmed for. Anchors both
  // age-on-race-day (lib/categories.ts) and restoring wave start times onto
  // the right date instead of whatever date they happen to carry in storage.
  // Absent on pre-2026 races; restore/age logic falls back to today.
  raceDate?: string;
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
