# Known Issues

Open defects and gaps in the timing app, from a full read of the codebase on
22 August 2026 (`main` @ `486d9a1`), ahead of the 10 October race. Every item
here was reproduced against the code, not inferred.

Three companion docs own their own open questions and don't repeat them
here: `race-readiness-design.md` (backup/sync/recovery),
`registrant-import.md` (the CSV import contract and age/gender category
boards), and `photo-companion-design.md` (finish-line photos).

---

## Fixed — safety pass, 22 August 2026

Listed so they don't get re-reported. Each was a race-day failure with no
overlap on the 2026 feature work.

- **The service worker served API reads from a 24-hour cache.** Serwist's
  `defaultCache` routes same-origin `/api/` GETs through NetworkFirst, so a
  slow hotspot could return an hours-old `/api/time` (reading as huge clock
  drift on a correct clock) or an older snapshot from `GET /api/backup?id=`
  on the recovery path. `app/sw.ts` now puts a NetworkOnly rule for `/api/`
  ahead of `defaultCache`.
- **The finish timestamp was captured after the duplicate-bib prompt.**
  Whatever time the operator took to read that dialog was added to the
  rider's finish time. `TimingTab.handleRecordFinish` now stamps first.
- **A failed sync only retried on a state change or the `online` event.**
  Behind a hotspot `navigator.onLine` stays true when the upstream link
  drops, so the last finisher's failed sync had nothing scheduled to fix it.
  `useCloudSync` now retries on its own timer, 15s backing off to 120s.
- **The U key also typed a "u" into the bib box**, so the next bib recorded
  as `u57` — an unregistered rider. The keystroke is swallowed now.
- **The edit modal accepted a blank finish time**, writing NaN into
  `finishTimeMs`/`elapsedMs`. It also forced a wave (defaulting to A) onto an
  unresolved entry, promoting it into the rankings against a start the rider
  never used. Both fixed; the wave selector has an explicit "Unresolved".
- **IndexedDB was evictable and save failures were invisible.** The operator
  app now requests persistent storage on startup and shows "Local save
  failed" beside the sync badge.
- **Rollback history covered ~20 finishers.** `MAX_HISTORY` 20 → 200.

---

## Fixed — handoff safety, 8 October 2026

- **A stale laptop could overwrite the cloud copy.** A sync uploads the whole
  snapshot, so a laptop that had been handed off, then reconnected, woke up or
  was reopened (it restores its old local copy and syncs on load) rolled the
  cloud, and the public leaderboard, back to its old state. `POST
  /api/backup` now refuses a write from a device that is not based on the
  cloud copy (`lib/syncGuard.ts`): each sync sends a device id and the
  `lastSaved` it last loaded or wrote. A refusal returns 409, writes nothing
  (so it adds no history entry), and the operator app shows a red banner with
  **Save a copy and leave**: it downloads a JSON of the local copy, clears it,
  and returns to the race menu. Recording keeps working on the refused device
  until then; its entries stay local.
- **Opening a race took it over.** The race menu's Open synced at once, which
  made that computer the race's writer and locked out the one actually
  scoring. Open is now **Start scoring**, the only way into a race that is in
  the cloud, so taking a race over is always a deliberate press. There is no
  view-only mode: watch results on the public leaderboard instead.
- **Finish scoring came back after a reload.** The reply to its last sync
  reached state as the local copy was cleared, and the save effect wrote the
  race back to IndexedDB. `clearLocalRaceState` now resets state before it
  clears storage. Switch Race had the same bug when it ran right after a sync.
- **An imported backup JSON was refused on another computer.** The JSON did
  not carry the cloud version it was built on, so the server could not tell
  it was current. Export now writes `cloudLastSyncedAt` and import restores
  it. A JSON exported before this change still has none, and its sync from a
  different computer is refused.
- **There was no safe way to leave a race for another computer.** Settings
  now has **Finish scoring**: it syncs, waits for the server's confirmation,
  and only then clears the local copy and returns to the race menu. If the
  cloud doesn't confirm, or another computer is ahead, nothing is cleared.
  It asks for a second press first, since a stray click mid-race would stop
  recording until the race was reopened. "Switch to a different race" stays;
  it only warns.

Not covered: two computers recording at the same time (the second to sync is
refused and sees the banner, but the entries are not merged), and the gap in
recording while the computers swap. The check reads then writes without a
lock, so two syncs landing in the same instant could both pass.

---

## Fixed — 9 October 2026

- **The results CSV dropped unresolved finishers.** `handleExportCSV` kept
  only entries with a wave, so a rider recorded as `UNK-n`, or under a bib
  nobody had registered, was missing from the official record, and the
  confirmation only counted the rows it wrote. Those riders now follow the
  ranked rows, in the order they crossed, with `UNRESOLVED` in the Overall
  Place column and the wave, wave place and elapsed time blank. The columns
  are unchanged, and the popup says how many unresolved rows were added.
- **The brand sticker covered the Settings gear.** It is fixed to the
  top-right of every page (`app/layout.tsx`), so on the operator screen it sat
  over the gear at most widths. The top bar now keeps 96px clear on the right.
  The rest of the page still scrolls under the sticker, which only matters for
  what is hidden behind it, not for taps (it ignores them).

---

## Fixed — CSV/registrant revision, 26 August 2026

Confirmed against the current code while stripping the fun-awards feature
and moving the CSV to `bib,name,wave,age,gender` (see
`registrant-import.md`). Listed so they don't get re-reported.

- **The importer used to be a single regex** that kept only the last word of
  an unquoted multi-word name and collapsed empty fields, shifting every
  later column. It's now header-driven RFC-4180 parsing (`lib/csvImport.ts`),
  and every row with a bib imports and carries its own problem — only a row
  with no bib is refused. `fixtures/` has the files to build against.
- **Wave start times used to keep the date they were entered on**, so an
  evening-before setup made every elapsed time 24 hours long on restore.
  `RaceState.raceDate` now anchors both local resume and cloud recovery to
  the right date.
- **`calculateAge` used to parse `YYYY-MM-DD` as UTC**, flipping a birthday a
  day early in Pacific time. Moot now — age is a plain number collected on
  the form, not derived from a date at all.
- **The public leaderboard had no `revalidate`.** `app/[slug]/page.tsx` now
  sets `export const revalidate = 10` so open viewer tabs share one render
  instead of each hitting Redis on its own timer.
- **A blank wave used to throw or read NaN.** `WaveStatusBoxes.tsx` only
  increments `totalByWave` when `rider.wave` is set, and
  `RegistrationTab.tsx`'s wave sort treats a null wave as sorting last
  instead of calling `.localeCompare` on it.
- **The `n/a` → `undisclosed` gender normalization** runs at all three load
  paths — IndexedDB load, `handleOpenRace`, and backup JSON import.

---

## Deferred

Real, but not worth the churn before race day.

- **The public leaderboard is not cached, so every open tab reads Redis.**
  `app/[slug]/page.tsx` sets `revalidate = 10` to share one render between
  viewers, but the page is rendered on every request (`x-vercel-cache: MISS`,
  `cache-control: no-store`). Each render costs about 5 commands (the title and
  the body each read the index and snapshot, plus the photos) and about 60 KB;
  a tab refreshes every 20 seconds, so one open tab is roughly 900 commands and
  11 MB an hour. 100 tabs for 3 hours is about 270,000 commands and 3 GB.
  Accepted for race day on a Redis pay-as-you-go plan (20 cents per 100,000
  commands; the free plan caps at 500,000 a month and 10 GB of bandwidth).
  The fix is a 10-second shared cache (`unstable_cache`) around the page's
  reads, with the title and body sharing one load: about 3,000 commands for a
  3-hour race whatever the audience. Not built.
- **Two overlapping start-line sends can land out of order.** `POST
  /api/wave-start` writes whichever request arrives last. If a phone's first tap
  is slow and the volunteer restarts the wave, the restart can land first and
  the slow first tap after it, leaving the server with the older time while the
  phone shows the newer one as synced. Needs a slow request and a restart inside
  the same window. A fix is for the server to keep the later timestamp for a
  wave (a restart is always a later tap), at the cost of a phone with a fast
  clock outranking a correct one; a per-phone sequence number would avoid that.
  Not built.
- **Unknown-rider numbers get reused.** The next `UNK-n` is numbered from the
  count of existing ones, so deleting UNK-1 makes the next unknown UNK-2 as
  well.
- **Offline has a 24-hour shelf life.** Serwist precaches the JS, CSS and
  fonts but not the page itself; the operator page's HTML sits in a
  NetworkFirst cache that expires after 24 hours. Handled operationally for
  now (see below); the code fix is a dedicated cache rule with a long
  max-age.
- **Two operator tabs in one browser still overwrite each other.** They share
  a device id, so the write check (below) treats them as one device. A tab
  lock (BroadcastChannel or a localStorage claim) would close it.
- **No rate limit on `POST /api/auth`.** The shared passphrase is the only
  thing between the internet and overwriting a race's backup. Mitigated by
  making the passphrase long.
- **Backup import doesn't validate the file** before loading it into state and
  on into IndexedDB, so a wrong file can wedge the app in a way a reload
  doesn't clear. There is no error boundary either.
- **The dev-only "Reset to blank slate" button** is still in the tree behind a
  `NODE_ENV` check. Confirmed absent from a production build; remove it when
  the setup flow stops needing repeat testing.
- **Docs drift.** The README's troubleshooting still points at "Reset App &
  Clear All Data" (gone); `race-readiness-design.md` still says `/` redirects
  to the latest race (it's a static landing page).

---

## Race-day workarounds

For what is still open above.

1. Open `/operator` on the venue's connection before anything else — that
   refreshes the offline copy, which expires after 24 hours.
2. **Re-enter the wave start times on race morning**, even if they look right.
3. After the CSV upload, check the rider count against the registration list
   and look up anyone whose name has a space in it.
4. Watch the wave clocks on the Timing tab. Wave A reading 23-something
   before the start means the wave date is wrong.
5. **Handing timekeeping off to a second computer:** on the outgoing
   laptop, record the last finisher, then Settings → **Finish scoring** →
   **Yes, finish scoring**. It returns to the race menu once the cloud
   confirms. Then the incoming laptop unlocks `/operator` and presses
   **Start scoring** on the race. Someone writes down bibs for the gap. To
   take the race back, repeat in the other direction. Start scoring takes
   the race over, so don't use it on a second laptop just to look; use the
   public leaderboard. If a laptop is ever reopened with an old copy, it
   shows a red "out of date" banner; press **Save a copy and leave**.
6. Export both the results CSV and the backup JSON before closing the tab.
   Resolve any `UNK-n` or unregistered-bib finishers first (Results tab, give
   each a wave) so they are ranked. Any still open are listed at the end of
   the CSV as `UNRESOLVED`; check that block is empty or expected.
