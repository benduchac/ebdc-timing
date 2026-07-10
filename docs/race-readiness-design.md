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
- **Done:** Phase 2.5 — routing split (`/` public placeholder, `/operator`
  gated), `OperatorGate` client-side passphrase gate, `POST /api/auth`. The PWA
  `start_url` now points at `/operator`. `PUBLISH_SECRET` is set in Vercel and
  the gate is confirmed live in production.
- **Done, deployed:** Phase 3 (cloud backup + race entity + recovery).
  Backend (`/api/backup`, `/api/races`, Upstash Redis) and full client wiring
  (race creation, best-effort sync + badge, race menu + recovery-aware
  startup, setup checklist, guarded Switch Race) verified end-to-end in a
  real browser, including the core scenario: wipe local IndexedDB entirely,
  reopen, recover the race from the cloud with all registrants/entries/
  wave-times intact.
- **Done, deployed:** Phase 4's clock-verification half (the dry-run half is
  still open). `worldtimeapi.org` (the original source) is dead — replaced
  with `time.now`'s API, proxied through `GET /api/time` since most simple
  time APIs don't send CORS headers. Threshold tightened from <60s to <5s
  "fine", with caution (5-30s) and alert (>=30s) tiers, auto-run whenever a
  race becomes active, surfaced in Settings and as the first panel of the
  Registration-tab setup checklist.
- **Done, deployed:** Phase 2 (public leaderboard). Every race gets a
  permanent, shareable URL — `/[slug]`, derived from the race label (e.g.
  "EBDC 7/9" → `/ebdc-7-9`), assigned once server-side on first sync and
  deduped on collision (`-2`, `-3`, ...; labels themselves are allowed to
  repeat, only the slug is disambiguated). `/` redirects to the
  most-recently-synced race's slug, or shows a placeholder if none exist yet.
  Privacy: ages are never shown (removed entirely, not just for minors —
  simpler than a name-redaction rule); full names are shown because consent
  is handled by policy (the existing mandatory event waiver), not tracked in
  the app. DOB never leaves the server — category bucketing
  (`computeCategoryBuckets` in `lib/categories.ts`) happens server-side in
  the `/[slug]` Server Component, and only the resulting PII-free `Entry[]`
  arrays are passed to the client-rendered leaderboard. Unresolved finishers
  (unmatched bib, no wave assigned) are excluded from the public view.
  Auto-refreshes every 20s via `router.refresh()`.
- **Done, deployed:** post-launch polish pass — setup checklist redesign
  (three actionable panels replacing the old readiness banner; see CLAUDE.md
  for the full rationale), bib normalization (`normalizeBib` — "001"/"01"/"1"
  all resolve to the same rider everywhere a bib is used), a dev-only
  "Reset to Blank Slate" button for repeat setup-flow testing, and assorted
  UI cleanup (green secondary buttons, richer clock-check detail text, a
  non-blocking "Copied!" link-copy affordance, background-rendering fixes
  for both a desktop scrollbar-width bug and a preventive mobile one).
- **Next:** the rest of Phase 4 (full offline dry run). Deferred separately:
  a UI reskin (visual polish, explicitly no functionality changes — planned
  for after the leaderboard, in its own branch) and a stretch-goal photo
  matching feature (finish-line photos matched to finishers by timestamp).

---

## Surfaces & routing

Two surfaces, clearly separated:

| Surface | Path | Access |
|---|---|---|
| Public results / leaderboard | `/[slug]` (e.g. `/ebdc-7-9`) | public, read-only |
| Public landing / redirect | `/` | public — redirects to the latest race's `/[slug]`, or a placeholder if none exist |
| Operator app (scoring/editing) | `/operator` | passphrase-gated |

**Decided default** (confirmable): public leaderboard at `/` so racers hit the
bare domain and get results; operator bookmarks `/operator`. Today the full
operator app is served at `/` with Vercel protection off — that exposure is
exactly what this closes.

**Decided:** every race gets its own permanent, shareable URL derived from
its label (`/[slug]`); `/` is a convenience redirect to whichever race
synced most recently, so a bookmark/share from the bare domain still lands
on the correct permanent link. `/results` redirects to `/` for old links.

---

## Auth model

A single shared **operator passphrase**. One secret, three jobs:

1. Unlocks the operator UI (client-side gate).
2. Authorizes every cloud **write** (backup POST).
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

All secret-gated **except** the public leaderboard.

| Method / path | Purpose | Auth |
|---|---|---|
| `POST /api/auth` | Validate passphrase, issue session | passphrase |
| `POST /api/backup` | Write snapshot; update `latest`, `history`, `races:index` | secret |
| `GET /api/races` | List the registry for the race menu | secret |
| `GET /api/backup?id=` | Pull a race's latest snapshot (restore) | secret |
| `GET /` , `GET /[slug]` | Public leaderboard | public |

The public leaderboard isn't a separate publish pipeline — no data is ever
copied to a public-facing store. `/[slug]` is a Server Component that reads
`race:{id}:latest` directly (same private Redis, same keys the operator
syncs to) and does the PII filtering (DOB → category, never raw) at render
time, server-side, before anything reaches the client. Simpler than the
originally-sketched separate "publish read" endpoint, and avoids ever having
two copies of the data to keep in sync.

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

## Setup checklist

The Registration tab shows a three-panel checklist, each panel independently
actionable without leaving the tab:

1. **Check Clock** — runs the drift check (auto-runs once when a race
   becomes active too); shows the actual drift and a Recheck button.
2. **Load Registrants** — button opens the CSV file picker directly.
3. **Set Wave Times** — opens a combined modal for all three waves at once,
   distinct from the Timing tab's per-wave editor (that one's for
   mid/post-race correction and warns about recalculating existing entries;
   this one is for initial best-estimate setup, usually before any entries
   exist). "Done" tracks *reviewed*, not *correct* — wave times always have
   a value (defaults), so there's no way to detect correctness, only whether
   the operator engaged with the step at least once.

Once all three are done, the checklist collapses to a single calm summary
line. **Deliberately excludes sync status** — that's `SyncBadge`'s
permanent job (visible on every tab); an earlier version duplicated it here
as a fourth checklist item and it was just confusing, the same signal
unlabeled right next to the real one. The one hard rule that sync itself
still enforces: **a race is not recovery-proof until its first successful
sync** — the badge, not this checklist, is what says so.

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

- **Public leaderboard = a projection**, not the raw data. No raw DOB, ever —
  category bucketing happens server-side and only the resulting entries
  (name, bib, wave, time) are sent to the client. **Decided:** no ages shown
  publicly at all (not just for minors — simpler than a redaction rule, and
  applies uniformly). Full names ARE shown for everyone, including minors —
  this is intentionally handled by policy, not app logic: consent to appear
  on the leaderboard is folded into the event's existing mandatory
  waiver/registration checkbox (photos, media, liability, etc.), so it's
  already covered before the app ever sees a registrant. The app does not
  track a per-registrant opt-in flag — that was considered and deliberately
  rejected as unnecessary complexity for a low-volume community event.
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

In the Vercel project:
1. ✅ Set `PUBLISH_SECRET` env var = the operator passphrase. Done — the
   `/operator` gate is live in production.
2. Create a private KV/Redis store (Upstash via Marketplace) — needed before
   Phase 3 (backup/sync) can function; it sets the connection env vars
   automatically.
3. Redeploy.

---

## Build order

1. **Phase 2.5** *(done — deployed and verified)* — routing split (public `/`,
   gated `/operator`) + passphrase gate + `POST /api/auth`. Closes the
   exposure that motivated this work.
2. **Phase 3** *(done — deployed)* — Race entity + `/api/backup` +
   `/api/races` + client sync + badge + race menu/recovery + setup
   checklist.
3. **Phase 4, clock half** *(done — deployed)* — clock-verification
   hardening. Full offline dry run still open.
4. **Phase 2** *(done — deployed)* — the public leaderboard, at
   `/[slug]` per race. Spec resolved in conversation, not deferred anymore:
   no ages shown (uniformly, not just for minors), full names shown for
   everyone (consent handled by the event's existing waiver, not tracked in
   the app), DOB never leaves the server.

---

## Deployment

- Vercel, auto-building from `main`. Production URL:
  `https://ebdc-timing-benduchacs-projects.vercel.app` (`/` public placeholder,
  `/operator` gated app — `PUBLISH_SECRET` is set and the gate is confirmed
  live).
- **Deployment Protection** must stay off for production (else anonymous users
  get a 302 to Vercel SSO and racers can't load results).
- Vercel fails builds on Next.js versions with known CVEs — keep Next patched
  (currently on the 15.5.x backport line).
