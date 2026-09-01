# Known Issues

Open defects and gaps in the timing app, from a full read of the codebase on
22 August 2026 (`main` @ `486d9a1`), ahead of the 10 October race. Every item
here was reproduced against the code, not inferred.

Two companion docs own their own open questions and don't repeat them here:
`race-readiness-design.md` (backup/sync/recovery) and `registrant-import.md`
(the CSV import contract and age/gender category boards).

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

- **The results CSV drops unresolved finishers.** `handleExportCSV` filters to
  entries with a wave and the confirmation counts only those, so the file that
  becomes the official record omits the riders still needing a decision.
- **Unknown-rider numbers get reused.** The next `UNK-n` is numbered from the
  count of existing ones, so deleting UNK-1 makes the next unknown UNK-2 as
  well.
- **Offline has a 24-hour shelf life.** Serwist precaches the JS, CSS and
  fonts but not the page itself; the operator page's HTML sits in a
  NetworkFirst cache that expires after 24 hours. Handled operationally for
  now (see below); the code fix is a dedicated cache rule with a long
  max-age.
- **A second operator tab overwrites the cloud snapshot.** The sync effect
  fires on mount, so a second tab uploads whatever it loaded from IndexedDB.
  The design doc accepts last-write-wins between machines; a tab lock
  (BroadcastChannel or a localStorage claim) would close the one-machine
  case.
- **No deliberate flow for handing timekeeping off to a second computer
  mid-race.** Today a swap means: hope the outgoing laptop's last sync
  landed, then "Open" the race from the menu on the new one — no
  confirmation, nothing stopping the old tab from firing one more sync
  after the new one starts recording (same root cause as the item above).
  Physically handing off the running laptop instead is the zero-risk
  option and needs no code — worth writing up as the recommended
  race-day procedure regardless of whether this ships.

  Proposed: a "Hand off" action (Settings, or its own confirmation
  screen) that (1) force-flushes `useCloudSync` immediately instead of
  waiting out its debounce, and blocks on the server's ack rather than
  the fire-and-forget the effect does today; (2) on success, shows a
  clear green "Synced — safe to hand off" state and puts the outgoing
  device into a locked/read-only mode so it physically can't fire
  another write; (3) the incoming laptop's normal "Open Race" pull from
  the race menu is the only way back in, so there's one blessed path,
  not an ad hoc "just open it and hope." Needs a force-flush entry point
  on `useCloudSync` and a local lock state that survives a reload (so a
  laptop that's been handed off doesn't quietly start scoring again if
  someone opens the lid). Not built.
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
   laptop, wait for the sync badge to read "Synced" (not just "Saved
   locally"), then close that tab — don't leave it open. Only then open
   the race on the new laptop from the race menu. Skipping the wait or
   leaving the old tab open risks it firing one more sync that overwrites
   whatever the new laptop records first.
6. Export both the results CSV and the backup JSON before closing the tab,
   and check the CSV's row count against the finisher count on screen —
   unresolved finishers are not in the file.
