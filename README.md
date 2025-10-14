# EBDC Timing System

Race timing app for the East Bay Dirt Classic charity bike race.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Race Day Quick Start

1. **Setup Screen**: Set wave start times (9:00, 9:15, 9:30)
2. **Load CSV**: Upload registrants (Bib, FirstName, LastName, Wave)
3. **Start Race**: Begin timing
4. **Record Finishers**: Type bib → Enter (or press U for unknown riders)
5. **Export Results**: Click "Export Results CSV" when done

## Key Features

- **Offline-first**: Works without internet, data saved to browser
- **Auto-backup**: Downloads backup JSON every 10 entries
- **Edit entries**: Fix bibs/waves post-race
- **Zero cost**: No subscriptions, runs entirely in browser

## Data Safety

- All data stored in IndexedDB (browser database)
- Auto-backups download to your Downloads folder
- Manual export anytime via "Download Backup JSON"
- **Keep browser tab open during race!**

## Troubleshooting

**Reset everything**: Click "Reset App & Clear All Data" on setup screen

**Lost data?**: Check Downloads folder for auto-backup files, load via browser

**Wrong times?**: Check system clock before race starts

---

Built for C510 • Every dollar saved goes to the food bank 🚴💚