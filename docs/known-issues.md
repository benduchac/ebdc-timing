# Known Issues

Open defects and gaps in the timing app, from a full read of the codebase on
22 August 2026 (`main` @ `486d9a1`), ahead of the 10 October race. Every item
here was reproduced against the code, not inferred.

Two companion docs own their own open questions and don't repeat them here:
`race-readiness-design.md` (backup/sync/recovery) and `fun-awards-timing.md`
(the 2026 award boards, which own the CSV importer rewrite).

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

## Fold into the 2026 build

These overlap `fun-awards-timing.md`'s implementation plan. Doing them
separately means doing them twice.

### With item 1 (importer rewrite)

The importer is a single regex that keeps only the last word of an unquoted
multi-word name and collapses empty fields, shifting every later column.
Against the 2026 CSV contract it is worse than that: the new `status` column
shifts positions by one, so **every row is dropped and nothing is reported**
— 0 of 19 rows from `fixtures/registrants-2026.csv`.

The reporting half is now specified: `fun-awards-timing.md` section 6a. Every
row with a bib imports and carries its problem; only a row with no bib is
refused; the operator gets named counts and a flagged roster. Flags are
derived from the record, not stored, so they clear when the field is fixed.
`fixtures/` has the files to build it against.

### With item 3 (race-date anchor)

- **Wave start times keep the date they were entered on.** Set them the
  evening before and the app restores them verbatim next morning, so every
  elapsed time comes out 24 hours long. Both restore paths have it: local
  resume (`app/operator/page.tsx`, the `raceState` branch) and cloud recovery
  (`handleOpenRace`). The `setupConfig` fallback below the first one already
  rebuilds onto today's date — that path only runs when there is no race
  state. The race date item 3 adds to `RaceState` is the right anchor for
  both: rebase restored wave times onto it, don't rebase onto "today".
- **`calculateAge` parses `YYYY-MM-DD` as UTC** and compares against local
  dates, so in Pacific time a birthday lands a day early. Fix it in the same
  edit or it carries into the anchored version.

### With item 4 (bucket restructure)

- **The public leaderboard has no `revalidate`.** It renders per request and
  reads the index plus the full snapshot from Redis every time, while every
  open viewer tab refreshes on a 20s timer. Twenty viewers is roughly 120
  Redis commands a minute. If that trips the Upstash quota, the operator's
  backups fail at the same moment the public page starts reporting the race
  doesn't exist — a storage error renders the same "not found" page as a bad
  URL. `export const revalidate = 10` on `app/[slug]/page.tsx` makes all
  viewers share one render; also split the two failure cases apart.

### With item 6 (spare bibs)

A wave-less registrant is new, and code across the app assumes three letters:

- `Entry.wave` guards are written `wave !== null`, which an `undefined` wave
  passes — a spare match would look resolved. Use `null`, or `== null`.
- `WaveStatusBoxes.tsx` does `totalByWave[rider.wave]++`; a blank wave writes
  an undefined key and the box reads NaN.
- `RegistrationTab.tsx` sorts with `a.wave.localeCompare(b.wave)`, which
  throws on a null wave and blanks the tab.
- Spares must come out of `registrants.size` — it drives the setup
  checklist's "Load Registrants" tick, the header count, and the wave summary.
- The `n/a` → `undisclosed` normalizing read has three entry points, not one:
  the IndexedDB load, `handleOpenRace`, and the backup JSON import.

---

## Deferred

Real, but not worth the churn before race day.

- **The results CSV drops unresolved finishers.** `handleExportCSV` filters to
  entries with a wave and the confirmation counts only those, so the file that
  becomes the official record omits the riders still needing a decision. Worth
  revisiting after item 6 — spares make unresolved entries routine.
- **Unknown-rider numbers get reused.** The next `UNK-n` is numbered from the
  count of existing ones, so deleting UNK-1 makes the next unknown UNK-2 as
  well. Less pressing once walk-ups claim a real reserved bib.
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
5. Export both the results CSV and the backup JSON before closing the tab,
   and check the CSV's row count against the finisher count on screen —
   unresolved finishers are not in the file.
