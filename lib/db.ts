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

export const db = database as Dexie & {
  entries: Dexie.Table<Entry, number>;
  raceState: Dexie.Table<RaceState, number>;
  setupConfig: Dexie.Table<SetupConfig, number>;
};

export async function clearAllData(): Promise<void> {
  await db.entries.clear();
  await db.raceState.clear();
  await db.setupConfig.clear();
}
