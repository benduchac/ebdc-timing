export type { Registrant, Entry, RaceState } from "./db";
export type { PhotoCaptureSource } from "./exif";
import type { Registrant, Entry } from "./db";
import type { PhotoCaptureSource } from "./exif";

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
  // Public leaderboard URL slug (see lib/slug.ts). Assigned server-side on
  // first successful sync, so it's absent client-side until then.
  slug?: string;
  // Secret that authorizes /start/[token] for this race — see lib/db.ts's
  // RaceState.raceStartToken. Assigned alongside slug, same lifecycle.
  startToken?: string;
  // Secret that authorizes /photo/[token] for this race. Its own token, not
  // a reuse of startToken: a link handed to a photographer must not also let
  // them post wave start times. Assigned alongside slug, same lifecycle.
  photoToken?: string;
}

// A finish-line photo, as stored in the race:{id}:photos hash. Deliberately
// not part of RaceSnapshot — the operator's device overwrites the snapshot
// wholesale on every sync, which would clobber whatever the phone posted
// between two syncs. Same reasoning as WaveStarts above. See
// docs/photo-companion-design.md "Data model".
export type PhotoStatus = "pending" | "approved";

export interface RacePhoto {
  id: string;
  // The full frame, for the operator's review card and for a viewer who
  // taps a thumbnail.
  url: string;
  // A grid-sized copy, made on the phone at the same time. The leaderboard
  // shows only this: Vercel Blob's Hobby plan includes 10GB of data
  // transfer a month, cache hits included, and it stops serving rather than
  // billing when that runs out. At full size a single leaderboard load of a
  // 200-rider race would spend 70MB of it. See
  // docs/photo-companion-design.md "Two sizes, not one".
  thumbUrl: string;
  capturedAtMs: number;
  capturedSource: PhotoCaptureSource;
  // The phone's clock error at upload, subtracted before matching.
  clockOffsetMs: number;
  width: number;
  height: number;
  uploadedAt: string; // ISO, set server-side
  status: PhotoStatus;
  // The finisher this photo is attached to, set when approved.
  entryId: number | null;
}

// A wave's start time as posted from the start-line phone, ISO or absent.
export type WaveStarts = { A?: string; B?: string; C?: string };

export interface RaceSnapshot {
  raceId: string;
  label: string;
  createdAt: string; // ISO, set once at race creation (matches Race.createdAt)
  slug: string; // always present once persisted — server assigns it, never the client
  startToken: string; // always present once persisted — server assigns it, never the client
  photoToken: string; // always present once persisted — server assigns it, never the client
  waveStartTimes: { A: string; B: string; C: string };
  waveTimesConfirmed?: boolean;
  raceDate?: string; // YYYY-MM-DD — see RaceState.raceDate in lib/db.ts
  waveStartAdopted?: WaveStarts; // see RaceState.waveStartAdopted in lib/db.ts
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
  slug: string;
  startToken: string;
  photoToken: string;
  createdAt: string;
  lastSaved: string;
  entryCount: number;
}

export interface ClockCheckResult {
  serverTime?: string;
  localTime: string;
  // Unsigned size of the drift — what every readout shows.
  diffSeconds?: number;
  // The same drift, signed: positive means this device runs ahead of the
  // time source. Used to take a phone's clock error back off a photo's
  // capture time; see lib/photoMatch.ts.
  offsetMs?: number;
  ok: boolean | null;
  error?: string;
}
