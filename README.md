# EBDC Timing System

Race timing app for the East Bay Dirt Classic charity bike race.

## Setup

```bash
npm install
npm run dev
```

- Public results: [http://localhost:3000](http://localhost:3000)
- Operator app: [http://localhost:3000/operator](http://localhost:3000/operator) —
  passphrase-gated, see `.env.example` for the `PUBLISH_SECRET` /
  `KV_REST_API_*` vars needed for local dev.

## Race Day Quick Start

1. **Unlock**: enter the operator passphrase at `/operator`.
2. **Race menu**: resume an in-progress race from the cloud, or start a new
   one. Do this while online — it registers the race so a lost or dead
   laptop can be recovered later.
3. **Load CSV**: upload registrants (Bib, FirstName, LastName, Wave).
4. **Set wave start times**, and check Settings → "Verify System Clock" — a
   few seconds of drift is fine; more than that silently shifts every
   recorded finish time by the same amount.
5. **Confirm synced**: the Registration tab shows a readiness banner until
   registrants are loaded and the race has synced at least once.
6. **Record Finishers**: type bib → Enter (or press U for unknown riders).
7. **Export Results**: click "Export Results CSV" when done.

## Key Features

- **Offline-first PWA**: installable, keeps working with no internet once
  loaded; data lives in the browser's IndexedDB.
- **Cloud backup + recovery**: best-effort sync to a private cloud store on
  every change. The sync badge only turns green on a confirmed server ack —
  never on a guess. A lost or replaced device can reopen the exact same race
  from the Race Menu with registrants, entries, and wave times all intact.
- **Clock drift check**: flags when the device's clock disagrees with a
  reference time by more than a few seconds. Wave start times are recorded
  independently of finish times, so a drifted clock silently shifts every
  reported elapsed time.
- **Edit entries**: fix bibs/waves post-race; editing a wave's start time
  recalculates elapsed times for every entry in that wave.
- **Switch races**: on the wrong race? Settings → Danger Zone → "Switch to a
  Different Race" returns to the Race Menu without touching that race's
  cloud backup.

## Data Safety

- Local IndexedDB is the working copy; the cloud store is authoritative for
  "which races exist" and is what makes recovery possible (see
  `docs/race-readiness-design.md` for the full design).
- The sync badge is deliberately honest: dirty/syncing states are normal and
  not alarming, but it only shows "backed up" after an actual server ack.
- Manual JSON export/import (Settings) is still the offline escape hatch —
  useful if you're fully offline for the whole race (download to a USB
  stick).
- **Keep the browser tab open during the race** — `beforeunload` warns if
  there's unsaved timing data.

## Troubleshooting

**Wrong race?**: Settings → Danger Zone → "Switch to a Different Race."

**Reset everything**: Settings → Danger Zone → "Reset App & Clear All Data"
(warns first if there's unsynced data that would be discarded).

**Lost the device?**: On any device, open `/operator`, unlock, and pick the
race from the Race Menu (needs internet). Anything recorded after the last
green sync is what's at risk — that's what the badge is for.

**Wrong times?**: Settings → "Verify System Clock." Green means <5s drift;
amber/red means fix the device's clock before scoring — see
`docs/race-readiness-design.md` for why a drifted clock is a bigger deal
than it sounds.

---

Built for C510 • Proudly supporting the Alameda County Community Food Bank 🚴💚
