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

Three route families: `/[slug]` is a public, unauthenticated, per-race
leaderboard (Server Component, reads Redis directly, no client state); `/`
redirects to the latest race's `/[slug]`, or shows a placeholder; `/operator`
is the actual app. `app/operator/page.tsx` is the top-level container and
**owns all state** — registrants, entries, wave start times, modal state —
and passes it down to three tabs plus modals. State flows down via props;
children call handler callbacks to mutate. There is no global store or
context.

- `app/operator/page.tsx` — state owner, persistence effects, CSV/backup
  export, all entry mutation handlers. Wrapped in `OperatorGate`.
- `components/OperatorGate.tsx` — client-side passphrase gate for `/operator`;
  validates against `POST /api/auth`, caches the passphrase in localStorage so
  the app keeps working offline after the first unlock.
- `app/api/auth/route.ts` — validates the passphrase against the
  `PUBLISH_SECRET` env var. See `docs/race-readiness-design.md` "Auth model".
- `app/api/backup/route.ts` (`POST`/`GET`) + `app/api/races/route.ts`
  (`GET`) — cloud backup and the race registry, backed by Upstash Redis
  (`lib/kv.ts`). All three privileged routes share `lib/auth.ts`'s
  `isAuthorized` (expects `Authorization: Bearer <passphrase>`).
- `lib/useCloudSync.ts` — best-effort `POST /api/backup` on every relevant
  state change (debounced ~600ms), drives `components/SyncBadge.tsx`. Status
  distinguishes "dirty" (change queued, about to sync — calm) from "error"
  (an attempt actually failed — the alarm state); see the hook's top comment.
- `components/RaceMenuScreen.tsx` — shown when there's no local `activeRace`;
  if online, lists races from `GET /api/races` to resume (pulls
  `race:{id}:latest` via `GET /api/backup?id=`), always offers Start New
  (mints a `Race { id, label, createdAt }`). Offline: Start New only.
- `components/SetupChecklist.tsx` — three-panel setup checklist (Registration
  tab only): Check Clock / Load Registrants / Set Wave Times, each with its
  own status and a direct action button (no leaving the tab to complete any
  of them). Collapses to a single summary line once all three are done.
  Deliberately excludes sync status — that's `SyncBadge`'s job; duplicating
  it here as a checklist item (an earlier version did) was just confusing,
  same signal unlabeled right next to the real one.
- `components/WaveTimesSetupModal.tsx` — sets all three wave start times at
  once, for initial setup. Distinct from `WaveTimeEditModal` (Timing tab),
  which corrects one wave mid/post-race and explicitly warns about
  recalculating existing entries — that framing doesn't fit "give me your
  best estimate before the race starts." `RaceState.waveTimesConfirmed` /
  `RaceSnapshot.waveTimesConfirmed` tracks "has this been reviewed," not "is
  it correct" (defaults always look like a valid value, reviewed or not).
- `app/api/time/route.ts` — proxies the clock-check time source server-side.
  Most simple time APIs (including the current one, `time.now`) don't send
  CORS headers, so the browser must go through our own server, not call them
  directly.
- `app/[slug]/page.tsx` — public leaderboard for one race. Server Component;
  reads `race:{id}:latest` directly from Redis (no round trip through our
  own API), computes category buckets server-side via
  `computeCategoryBuckets`, and only passes the resulting PII-free `Entry[]`
  arrays to `components/PublicLeaderboardView.tsx` — real registrant data
  (DOB) never reaches the client. Unresolved finishers (no wave assigned)
  are excluded.
- `lib/slug.ts` — `slugify`/`assignSlug`: turns a race label into its public
  URL slug (`"EBDC 7/9"` → `"ebdc-7-9"`), deduped on collision (`-2`, `-3`,
  ...). Assigned once server-side on a race's first sync
  (`app/api/backup/route.ts`), never recomputed — reused from `races:index`
  on every later sync.
- `components/CategoryLeaderboardGrid.tsx` — pure presentational category
  grid; takes pre-bucketed `Entry[]` arrays only, no registrants/DOB. Shared
  by both the operator's `CategoryLeaderboards.tsx` (thin wrapper that calls
  `computeCategoryBuckets` with the real local registrants) and the public
  page (buckets computed server-side instead).
- `app/page.tsx` / `app/results/page.tsx` — redirect to the latest race's
  `/[slug]` (placeholder if none exist) / redirect to `/`.
- `components/PageBackground.tsx` — the site background image, as a
  `position: fixed` layer, not `background-attachment: fixed` on the
  content container. See the gotcha below before adding a new page's
  background any other way.
- `components/CopyLinkButton.tsx` — copies the public leaderboard link;
  shows a "Copied!" flash that fades over 3s (CSS keyframe in
  `globals.css`) instead of `alert()`. Resolves `window.location.origin` at
  click time, not from a prop, so it's never evaluated during SSR.
- `lib/db.ts` — Dexie schema (`entries`, `raceState`, `setupConfig`) and the
  `Registrant` / `Entry` / `RaceState` / `SetupConfig` types. `clearAllData()`.
- `lib/types.ts` — re-exports DB types plus view types (`WaveStartTimes`,
  `ClockCheckResult`), plus the Phase 3 race types (`Race`, `RaceSnapshot`,
  `RaceIndexEntry` — all three carry `slug`).
- `lib/utils.ts` — `formatElapsedTime`, `formatDurationHMS` ("Xh Ym Zs" for
  plain-language duration deltas), `formatRelativeTime` ("Xs/Xm/Xh ago",
  shared by `SyncBadge` and `SetupChecklist`'s clock panel), `normalizeBib`
  (strips leading zeros — see gotcha below), `csvField` (RFC 4180 CSV
  escaping), `getDateString`, `downloadFile`, `verifySystemClock`,
  `TIME_SOURCE_LABEL`, `getClockSeverity` (fine/caution/alert/unknown from a
  `ClockCheckResult`).
- `lib/categories.ts` — age/gender categorization (`calculateAge`,
  `getAgeCategory`, `filterByCategory`, `getTopEntries`). `computeCategoryBuckets`
  is the one place actual bucketing happens; only call it somewhere with real
  `registrants` data (server-side, or the operator's own local state) — never
  pass registrants into a client component for the public page.

### Tabs (`components/`)
- `RegistrationTab` — CSV upload + manual add/edit/delete of registrants.
- `TimingTab` — the live finish-recording UI (bib input, record/unknown
  buttons, recent finishers, wave status, top-10).
- `ResultsTable` + `CategoryLeaderboards` — the Results tab views. Both are
  reused by the public `/[slug]` page too (`ResultsTable`'s `onEditEntry`/
  `onDeleteEntry` are optional — omitted there, which also hides the Actions
  column; `CategoryLeaderboards` is operator-only, the public page uses
  `CategoryLeaderboardGrid` directly with server-computed buckets instead).

### Modals
`EditModal`, `DeleteEntryModal`, `WaveTimeEditModal`, `WaveTimesSetupModal`,
`SettingsModal` (clock check, backup import/export, session lock, Switch
Race, and — dev builds only — a "Reset to Blank Slate" button; see gotcha
below).

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
  wave times as ISO strings, counter, plus `raceId`/`raceLabel`/`raceCreatedAt`/
  `cloudLastSyncedAt`). Saved on every relevant state change via a
  transactional clear+add.
- `setupConfig` holds just wave start times (HH:MM:SS) so they survive a reset of
  race data.
- **Cloud sync**: `useCloudSync` best-effort POSTs the snapshot to
  `/api/backup` on every relevant state change (replaced the old every-10-
  entries auto-download JSON). Manual JSON export/import still lives in
  `SettingsModal` as the offline/USB-stick escape hatch.
- `raceState.raceId` is optional — pre-Phase-3 local records lack it;
  `operator/page.tsx`'s load effect mints one on the spot if there's existing
  data but no id, so old local data migrates without user action.
- On load, `operator/page.tsx` restores `raceState` if present, else falls back
  to `setupConfig` for wave times.

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
- Destructive actions (delete registrant/entry) require typed confirmation —
  preserve that pattern. There's no separate "Reset App" anymore — it used
  to be a harder-confirmation version of the exact same underlying action as
  "Switch to a Different Race" (both cleared local state and returned to the
  race menu), which was confusing once cloud backup made both equally safe
  and recoverable; Switch Race is now the only escape hatch, with a
  confirm() only when there's genuinely unsynced data at risk.
- `verifySystemClock` (via `/api/time`) degrades gracefully offline
  (`ok: null`). A drifted device clock silently shifts every recorded
  elapsed time by the drift amount (wave start is typed independently of the
  device clock; finish times are captured from it) — so this is checked
  automatically whenever a race becomes active, not just on request.
  worldtimeapi.org (the original source) is dead; don't resurrect it if you
  see it referenced in old context.
- **Time.Now's free API requires attribution** (their ToS): a link back to
  `https://time.now` on the site footer, README, or an About screen. Keep
  the README "Credits" section (or equivalent) if you touch `/api/time` or
  the README's structure — don't drop it silently.
- **Always normalize bibs with `normalizeBib`** (strips leading zeros) at
  every point one is stored, looked up, or compared — CSV upload, manual
  add/edit, timing lookup, duplicate detection, entry editing, delete
  confirmations. Without it, a registrant loaded as "001" silently fails to
  match an operator typing "1" at the finish line. Don't reimplement the
  stripping inline — same divergent-copy risk as `formatElapsedTime`.
- **Page backgrounds must use `PageBackground`, not
  `background-attachment: fixed` directly.** Two distinct rendering bugs
  motivated this: (1) a vertical scrollbar appearing/disappearing shrinks
  viewport width, which resizes any `cover`-sized fixed background —
  fixed globally via `scrollbar-gutter: stable` in `globals.css`, not by
  the component; (2) mobile browser chrome collapsing/expanding during
  scroll is known to jank `attachment: fixed` specifically (preventive,
  not confirmed against a reported symptom) — `PageBackground`'s
  `position: fixed` avoids it.
- **The Settings "Reset to Blank Slate" button is dev-only** (gated by
  `isDev={process.env.NODE_ENV !== "production"}` in
  `app/operator/page.tsx`), added for repeatedly re-testing the setup flow
  without minting a new race each time. Its own code comment says "remove
  before release" — that's still the intent; it hasn't been removed
  because it's still in active use for dev testing. Confirmed hidden in a
  production build. Don't confuse it with "Switch to a Different Race"
  (the real, production, non-destructive escape hatch) when reading
  `SettingsModal`'s Danger Zone.

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
