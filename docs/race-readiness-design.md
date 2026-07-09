# EBDC Timing — Race-Readiness Design

Design spec for making the timing app race-ready: an **offline-first operator
app** plus a **public results page**, with confirmed cloud backup and recovery.
This is the source of truth for the in-progress work; build from it. Decisions
here were made collaboratively; a few genuinely-open items are marked **OPEN**.

Guiding principle: **data integrity is paramount.** On-site connectivity is a
mobile hotspot — treat it as "can drop anytime." The operator app must fully
function offline; anything that claims data is safe must be provably true.

---

## Status

- **Done:** Phase 1 — offline-capable PWA (Serwist service worker, installable),
  deployed to Vercel, verified working offline. See [Deployment](#deployment).
- **In progress:** the design below (Phases 2.5, 3). Phase 2 (real leaderboard)
  and Phase 4 (clock + dry run) follow.

---

## Surfaces & routing

Two surfaces, clearly separated:

| Surface | Path | Access |
|---|---|---|
| Public results / leaderboard | `/` | public, read-only |
| Operator app (scoring/editing) | `/operator` | passphrase-gated |

**Decided default** (confirmable): public leaderboard at `/` so racers hit the
bare domain and get results; operator bookmarks `/operator`. Today the full
operator app is served at `/` with Vercel protection off — that exposure is
exactly what this closes.

Currently `/results` holds a placeholder; under this design the public results
move to `/` (or `/results` stays and `/` redirects — implementation detail).

---

## Auth model

A single shared **operator passphrase**. One secret, three jobs:

1. Unlocks the operator UI (client-side gate).
2. Authorizes every cloud **write** (backup POST, later the publish POST).
3. Gates every **private read** (restore/download of the full snapshot).

**The real boundary is server-side.** The client gate is hygiene — client code
is always loadable, so it only stops casual access. Integrity comes from the
server validating the passphrase against a `PUBLISH_SECRET` env var on every
write and every private read. A stranger who loads `/operator` can only touch
their own empty local IndexedDB; they cannot corrupt the real backup or
leaderboard, and cannot download the PII snapshot, without the secret.

The public leaderboard is the **only** unauthenticated read, and it serves a
deliberately non-sensitive projection (see [Privacy](#privacy)).

Flow: operator enters passphrase → validated server-side (`POST /api/auth`) →
token/session stored locally → sent with all privileged requests.

---

## Data model

### Race entity
Every race has an identity so backups never collide or clobber:

```ts
Race = { id: string /* generated, globally unique */,
         label: string /* human, e.g. "EBDC 2026" */,
         createdAt: string /* ISO */ }
```

The `id` is threaded through app state and rides along in every snapshot.

### Cloud is the source of truth; local is a cache
IndexedDB remains the local working store (durable across reload/crash/reboot on
one machine, enables offline scoring). The **cloud registry is authoritative for
"which races exist"** — so a lost/cleared/replaced machine can always find its
way back to an in-progress race (see [Recovery](#race-lifecycle--recovery)).

### Snapshot
The full JSON snapshot (same shape the app already serializes for backup):
`{ raceId, label, waveStartTimes, registrants, entries, entryCounter,
   lastSaved }`. This is the private, restorable artifact.

---

## Storage

**Private key-value store** (Upstash Redis via the Vercel Marketplace — the
successor to "Vercel KV"). Chosen over Vercel Blob because Blob hands out public
(if unguessable) URLs; a backup full of PII/minors must be **server-only, never
public**. Snapshots are small (~100–200 KB); well within limits.

Keys:
- `races:index` — registry: map/list of `{ id, label, createdAt, lastSaved,
  entryCount }` for the race menu (cheap; no full snapshots).
- `race:{id}:latest` — current full snapshot.
- `race:{id}:history` — capped rolling list (last ~20 snapshots) so a corrupt or
  accidental overwrite can be rolled back.

---

## Endpoints

All secret-gated **except** the public leaderboard read.

| Method / path | Purpose | Auth |
|---|---|---|
| `POST /api/auth` | Validate passphrase, issue session | passphrase |
| `POST /api/backup` | Write snapshot; update `latest`, `history`, `races:index` | secret |
| `GET /api/races` | List the registry for the race menu | secret |
| `GET /api/backup?id=` | Pull a race's latest snapshot (restore) | secret |
| (Phase 2) publish read | Public leaderboard projection | public |

---

## Backup sync behavior

- **Trigger:** best-effort `POST /api/backup` on **every state change** (finishes,
  edits, deletes, wave-time fixes). Non-blocking — timing never waits on the
  network.
- **Green means the server acked it.** Only an HTTP 200 turns the indicator
  green. No ack, no green. This is the honest "it's off-device" signal, and the
  reason we own the endpoint rather than trusting an opaque third-party sync
  (which risks "green but nothing actually backed up").
- **Offline / failed write:** the snapshot stays safe in IndexedDB; the change is
  marked **dirty**. On the `online` event (and on retry), flush the latest
  snapshot; on success it goes green.

Replaces the old every-10-entries auto-download (removed).

---

## Sync indicator (badge)

Top of the operator surface. **Alarm is driven by a dirty flag, NOT elapsed
time** — a lull between finishers is normal and must never look like an error.

- **Fresh success:** green that fades to neutral over ~30s. Positive confirmation.
- **Idle + everything synced:** neutral/calm; may read "Backed up 2m ago" in
  muted text (informational, never alarming).
- **No backup ever / no store configured:** red — "Set up backup."
- **Dirty / unsynced entries:** red or amber — "Last N entries not backed up."
  Fires only when data changed but isn't confirmed off-device (offline, or a
  failed write). Never fires merely because time passed.

Also always show the **active race** (label + short id) in the operator header,
so there's zero ambiguity about which event is being scored.

---

## Race lifecycle & recovery

- **Start new race** — mints a new `id`. Because storage is keyed per-race, this
  **cannot clobber** a prior race's backup. This replaces the old blanket
  "reset/clear" (which would otherwise POST an empty snapshot over good data).
- **Race menu** in the operator surface — browse every event id (label · date ·
  finisher count · last-synced) and **Open** any one: pulls `race:{id}:latest`
  into IndexedDB, sets it active, resumes syncing to that id.
- **Recovery-aware startup:**
  1. Local active race present → continue it.
  2. No local race, online + authed → show the race menu (recover the in-progress
     race, or Start new).
  3. No local race, offline → can only Start new; the menu lights up once online.
- **Guard destructive actions**: Start-new / switching confirms the current race
  is **synced ✓** first, or warns loudly if there are unsynced changes.

This directly answers "what if the browser loses the id mid-race": on a fresh or
cleared machine, open the app → race menu → pick the in-progress event → resume.
The id can't be permanently lost once it has reached the cloud.

---

## "Ready for the field" readiness

The operator surface shows an explicit pre-scoring readiness state:

- Race created ✓
- Registrants synced ✓
- Wave times set ✓
- **Fully synced at [time]**

Warn before entering scoring (or going offline) with **unsynced setup**. The one
hard rule: **a race is not recovery-proof until its first successful sync** — if
created offline, the app says so plainly.

---

## Recommended race-day workflow

1. **Create the race and do all setup while on good internet** — load the
   registrant CSV, set wave start times. This registers the id in the cloud
   (enables recovery) and front-loads the error-prone work into good
   connectivity.
2. **Confirm "fully synced ✓"** before leaving.
3. **Move to scoring.** In the field the app only appends finishes, which sync
   best-effort; the badge flags anything not yet confirmed off-device.

Even if the scoring laptop dies, a replacement Opens the race fully provisioned
(all registrants/waves/prior finishes) and loses only unsynced finishes — which
the badge was already warning about.

---

## Manual backups / escape hatches

- **Results CSV** — human/officials export; always visible.
- **Full JSON export / import** — manual restore path; also the operator's move
  during a fully-offline race (download, drop on a USB stick).
- The **File System Access single-file** idea was **dropped** — once backup is a
  confirmable cloud POST, a local file only duplicates same-machine IndexedDB
  without adding a *confirmed* off-device copy.

---

## Privacy

- **Public leaderboard = a projection**, not the raw data. No raw DOB. **OPEN:**
  how minors appear (reg data includes under-18 riders) — full name vs first name
  + last initial; show age/category or not. Decide before going public.
- **Private backup = full snapshot with PII**, secret-gated read only.

---

## Honest limitations

- **Recovery restores the last *synced* snapshot.** Finishes recorded after the
  last sync on a since-dead machine are gone — inherent to any backup; the dirty
  badge is the mitigation.
- **Single active operator assumed.** Two machines editing the same race
  last-write-wins clobber each other. True concurrent multi-machine scoring is
  the deferred **redundancy** topic — out of scope here.
- **Offline + lost id** can't browse the registry until back online.
- Client gate is soft; SVG PWA icons (fine on current Chrome/Edge — the confirmed
  race browser — PNG polish deferred).

---

## Provisioning checklist (operator/owner)

Before Phase 3 can function, in the Vercel project:
1. Create a private KV/Redis store (Upstash via Marketplace); it sets the
   connection env vars automatically.
2. Set `PUBLISH_SECRET` env var = the operator passphrase.
3. Redeploy.

---

## Build order

1. **Phase 2.5** — routing split (public `/`, gated `/operator`) + passphrase
   gate + `POST /api/auth`. Closes the current exposure. *No provisioning needed
   to build; gate is live once `PUBLISH_SECRET` is set.*
2. **Phase 3** — Race entity + `/api/backup` + `/api/races` + client sync + badge
   + race menu/recovery + readiness state. *Needs the KV store provisioned.*
3. **Phase 2** — the real public leaderboard + publish pipeline. **Deferred:
   needs product spec** (what it shows; minors display). Reuses this same
   endpoint/storage/auth foundation.
4. **Phase 4** — clock-verification hardening + full offline dry run.

---

## Deployment

- Vercel, auto-building from `main`. Production URL:
  `https://ebdc-timing-benduchacs-projects.vercel.app` (`/` operator today,
  `/results` placeholder).
- **Deployment Protection** must stay off for production (else anonymous users
  get a 302 to Vercel SSO and racers can't load results).
- Vercel fails builds on Next.js versions with known CVEs — keep Next patched
  (currently on the 15.5.x backport line).
