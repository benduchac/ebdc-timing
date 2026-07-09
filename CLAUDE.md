# CLAUDE.md

Guidance for working in this repo.

## What this is

Race-timing web app for the **East Bay Dirt Classic** (EBDC), a charity bike race
(team C510). It runs entirely in the browser: a finish-line operator types bib
numbers as riders cross, and the app computes elapsed times per wave, ranks
finishers, and exports results. It is **offline-first** — all data lives in the
browser's IndexedDB, with JSON auto-backups downloaded periodically. There is no
server or database; nothing leaves the machine except the files the user
downloads.

Because this is the source of truth for official race results, **data integrity
is the top priority**. When in doubt, favor correctness and recoverability over
features.

## Commands

```bash
npm run dev     # dev server (Turbopack) at http://localhost:3000
npm run build   # production build — ALSO runs ESLint + type-check, and FAILS on errors
npm run start   # serve the production build
npm run lint    # ESLint only
```

Run `npm run build` before committing non-trivial changes — it's the gate that
catches lint errors (which block the build) and type errors in one pass.

## Stack

- **Next.js 15** (App Router) + **React 19**, all client-side (`"use client"`).
- **Tailwind CSS v4** (via `@tailwindcss/postcss`).
- **Dexie** (IndexedDB wrapper) for persistence.
- **TypeScript**, strict.

## Architecture

Single-page app. `app/page.tsx` is the top-level container and **owns all
state** — registrants, entries, wave start times, modal state — and passes it
down to three tabs plus modals. State flows down via props; children call
handler callbacks to mutate. There is no global store or context.

- `app/page.tsx` — state owner, persistence effects, CSV/backup export, all
  entry mutation handlers.
- `lib/db.ts` — Dexie schema (`entries`, `raceState`, `setupConfig`) and the
  `Registrant` / `Entry` / `RaceState` / `SetupConfig` types. `clearAllData()`.
- `lib/types.ts` — re-exports DB types plus view types (`WaveStartTimes`,
  `ClockCheckResult`).
- `lib/utils.ts` — `formatElapsedTime`, `csvField` (RFC 4180 CSV escaping),
  `getDateString`, `downloadFile`, `verifySystemClock`.
- `lib/categories.ts` — age/gender categorization for leaderboards
  (`calculateAge`, `getAgeCategory`, `filterByCategory`, `getTopEntries`).

### Tabs (`components/`)
- `RegistrationTab` — CSV upload + manual add/edit/delete of registrants.
- `TimingTab` — the live finish-recording UI (bib input, record/unknown
  buttons, recent finishers, wave status, top-10).
- `ResultsTable` + `CategoryLeaderboards` — the Results tab views.

### Modals
`EditModal`, `DeleteEntryModal`, `WaveTimeEditModal`, `SettingsModal`
(clock check, backup import/export, reset).

## Data model & timing semantics

- Riders are in **waves A/B/C**, each with its own start time. A finisher's
  **elapsed time = finishTimeMs − waveStartTimes[wave]**.
- `Entry.finishTimeMs` is the absolute wall-clock time of the finish; elapsed is
  derived. Editing a wave's start time recalculates elapsed for all its entries
  (`handleSaveWaveTime`).
- Entries with an unknown/unregistered bib get `wave: null`, `elapsedMs: null`,
  and are shown separately (they need a wave assigned post-race). "Unknown
  finisher" entries use bib `UNK-<n>`.
- Rider identity (name/wave) is looked up from `registrants` by bib at record
  time and re-derived on edit; changing an entry's bib re-pulls the rider.

## Persistence

- `raceState` holds the full snapshot (entries, registrants as `[bib, Registrant][]`,
  wave times as ISO strings, counter). Saved on every relevant state change via a
  transactional clear+add.
- `setupConfig` holds just wave start times (HH:MM:SS) so they survive a reset of
  race data.
- **Auto-backup**: every 10 newly recorded entries, a JSON backup is
  auto-downloaded (driven by an effect on `entries` so it captures committed
  state). Manual export/import lives in `SettingsModal`.
- On load, `page.tsx` restores `raceState` if present, else falls back to
  `setupConfig` for wave times.

## Conventions & gotchas

- **Keep timing/format logic in `lib/`** — always import `formatElapsedTime` and
  `csvField` from `lib/utils.ts`; do not re-implement them in components (a past
  bug came from a divergent local copy in `EditModal`).
- **`formatElapsedTime` handles negatives** by prefixing `-`. A negative elapsed
  means a finish was recorded before its wave start (misconfig) — surface it,
  don't hide it.
- **CSV export must go through `csvField`** — registrant names come from an
  uploaded CSV and can contain commas/quotes.
- Wave start times are `Date` objects in state but persisted as ISO strings;
  convert at the boundaries.
- Destructive actions (reset, delete registrant/entry) require typed
  confirmation — preserve that pattern.
- `verifySystemClock` calls `worldtimeapi.org` and degrades gracefully offline
  (`ok: null`). Clock accuracy matters for results, but the app must work with no
  internet.

## In-progress: race-readiness work

The plan to make this fully race-ready — offline PWA (done), a public results
page, confirmed cloud backup with per-race identity and recovery, and a gated
operator surface — is specced in **`docs/race-readiness-design.md`**. Read that
before building on the backup/sync/leaderboard/auth work; it's the source of
truth and records the decisions and open items. Phase status also lives in the
task list.

**Recommended race-day workflow** (baked into the design): create the race and do
all setup — load registrant CSV, set wave times — while on good internet, confirm
"fully synced", *then* move to scoring. Creating/syncing online registers the
race id in the cloud, which is what makes a lost/dead scoring laptop recoverable.

## Race-day operating notes

- The app assumes a browser tab kept open for the whole race; `beforeunload`
  warns if there are entries. Auto-backup JSONs land in the Downloads folder and
  are the recovery path.
- Connectivity on-site is via **mobile hotspot** (assume it can drop — offline
  behavior must hold).
