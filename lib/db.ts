import Dexie, { Table } from 'dexie';

export interface Registrant {
  bib: string;
  firstName: string;
  lastName: string;
  wave: 'A' | 'B' | 'C';
}

export interface Entry {
  id: number;
  bib: string;
  wave: 'A' | 'B' | 'C' | null;
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

export class EBDCDatabase extends Dexie {
  entries!: Table<Entry, number>;
  raceState!: Table<RaceState, number>;

  constructor() {
    super('EBDCTiming');
    this.version(1).stores({
      entries: '++id, bib, wave, finishTimeMs',
      raceState: '++id'
    });
  }
}

export async function clearAllData(): Promise<void> {
  await db.entries.clear();
  await db.raceState.clear();
}

export const db = new EBDCDatabase();