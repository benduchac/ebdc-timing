# EBDC Timing — Photo Companion Design

Design spec for the finish-line photo companion: a phone page a photographer
opens from a link, uploading shots that the operator then matches to
finishers by time and approves for the public leaderboard.

**Boundary.** A token-gated phone page where a designated photographer
uploads finish-line photos for the active race, the storage behind it, an
operator review queue that pairs each photo with a finisher by capture time,
and approved photos on the public leaderboard.

This is the stretch goal `race-readiness-design.md` has carried as deferred
since Phase 2. It borrows the whole shape of the wave-start line — read
["Wave start line"](race-readiness-design.md#wave-start-line) first; the
reasoning there about tokens, separate keys and client-side timestamps
applies here unchanged and isn't repeated.

---

## Build order

Three phases, each usable on its own. Stopping after A or B leaves nothing
half-built.

- **A — capture and store** *(built)*. `/photo/[token]`, `POST /api/photos`,
  the Blob store, the per-race photo token. Photos land safely; nobody sees
  them yet.
- **B — review and match** *(built)*. A Photos tab in the operator app:
  candidate finishers by capture time, approve or reject.
- **C — publish** *(not built)*. Approved photos beside their finisher on
  `/[slug]`.

Phases A and B are written and pass the test suite, but no photo has been
through a real Blob store yet — that needs a deploy. See "Testing" under
[Open items](#open-items).

---

## Surfaces

| Surface | Path | Access |
|---|---|---|
| Photographer's phone page | `/photo/[token]` | token-gated, unlinked |
| Upload | `POST /api/photos` | token |
| Read a race's photos (the phone) | `GET /api/photos?token=` | token |
| Read a race's photos (the operator) | `GET /api/photos?raceId=` | secret |
| Approve / reassign | `PATCH /api/photos` | secret |
| Reject (deletes the files) | `DELETE /api/photos` | secret |
| Review queue | operator app, fourth tab | passphrase |
| Approved photos | `/[slug]` | public |

One route file, `app/api/photos/route.ts`. Its two-caller GET copies
`/api/wave-start` exactly: `?token=` for the phone, `?raceId=` plus the
operator passphrase for the operator.

### The token

A new `photoToken` per race, not a reuse of `startToken`. Different person,
different job, and a link handed to a photographer must not also let them
post wave start times. Assigned server-side in `app/api/backup/route.ts`
alongside `slug` and `startToken`, on a race's first sync, never
regenerated. Races already in the registry pick one up on their next sync,
so nothing needs migrating. Shared from Settings through `LinkWithCopy`,
next to the wave-start link.

---

## Data model

```ts
interface RacePhoto {
  id: string;             // crypto.randomUUID(), minted on the phone
  url: string;            // full frame, Vercel Blob URL
  thumbUrl: string;       // grid-sized copy — see "Two sizes, not one"
  capturedAtMs: number;   // when the shutter fired — see "Capture time"
  capturedSource: "exif" | "file" | "upload";
  clockOffsetMs: number;  // the phone's measured clock error at upload
  contentHash: string;    // SHA-256 of the original — see "Picking a hundred photos"
  width: number;
  height: number;
  uploadedAt: string;     // ISO, set server-side
  status: "pending" | "approved" | "rejected";
  entryId: number | null; // the finisher, once approved
}
```

Stored in a Redis hash, `race:{id}:photos`, field = photo id. **Its own key,
like `race:{id}:wavestarts`, and for the same reason**: the operator's device
overwrites `race:{id}:latest` wholesale on every sync, so anything the phone
writes into that object gets clobbered by the next routine POST.

Image bytes go to Vercel Blob at `races/{raceId}/{photoId}.jpg` and
`races/{raceId}/{photoId}-thumb.jpg`, in the
`ebdc-timing-blob` store (sfo1, public access). Writes use
`BLOB_READ_WRITE_TOKEN`, which the store connection adds to Production and
Preview — local work needs it pulled or pasted into `.env.local`, same as
the Upstash pair.

**The store is public, so review governs the leaderboard, not the URL.** A
pending photo is already reachable by anyone holding its unguessable Blob
URL. That is proportionate for race photos, and it is why rejecting deletes
the blob rather than flagging the record — see [Review](#review). A private
store was the alternative and was rejected: every leaderboard render would
have to mint a signed URL that expires, which kills browser caching and
breaks a link shared to a single photo.

---

## Two sizes, not one

Every photo is stored twice: the full frame at 1600px on the long edge
(250-450KB) and a thumbnail at 320px (~20KB). Both are made on the phone
from one decode, and both go up in the same request, so a photo is either
fully stored or not stored at all. The leaderboard loads only thumbnails;
the full frame is fetched when the operator reviews the photo, or when a
viewer taps one.

**This is not an optimization.** Vercel Blob on the Hobby plan includes 10GB
of data transfer a month, and cache hits count toward it — Vercel's own
pricing example bills all 2.5 million downloads as transfer while only the
750,000 cache misses count as operations. Exceeding the allowance does not
generate a bill; the store stops serving, and stays stopped until 30 days
have passed. That would take down photo uploads and every photo already on
the leaderboard at once.

At one size, a 200-rider leaderboard costs 70MB a page load — about 146
loads for the month, which a race clears in an afternoon. At thumbnail size
it costs 5MB, so a few thousand loads, with room left for people tapping
through to full frames.

The other Hobby meters are clear by a wide margin: ~150MB of the 1GB
storage, and 400 of the 2,000 advanced operations (each `put()` is one, so
two per photo, plus any hotspot retries). `del()` is free. Two things worth
knowing: `list()` bills as an advanced operation, which is part of why photo
metadata lives in Redis rather than being read back out of the store — and
browsing the store in the Vercel dashboard bills advanced operations too, so
checking on it repeatedly is not free.

---

## Picking a hundred photos

One photographer will have a hundred shots or more, and iOS has no "select
all" in its picker. The workable move is to swipe across the whole roll —
but only if re-picking something is free, because they will not remember
which shots went up in the last batch. So the rule the page is built around
is **select everything, every time**, and the app works out what's new.

Every photo is identified by a SHA-256 of the original file, before
resizing. On load the phone asks the race what it already holds and keeps
those hashes; anything picked that matches one drops out before being
decoded, resized or sent, and the page says how many it skipped. That makes
a re-pick cost one read per photo instead of a decode, a resize and an
upload — cheaper than the first pass, not more expensive.

The server checks again on upload and returns the stored record instead of
writing a second copy. The phone's list is loaded once and can go stale — a
second phone, or an earlier session on the same one — and this is what keeps
a duplicate out of the operator's review queue rather than merely off the
wire.

**Everything already uploaded shows as a thumbnail grid** below the button,
which answers "did they all make it?" without scrolling a hundred rows. A
photo that lands leaves the upload list and joins the grid, so the list only
ever holds work in progress. An earlier draft of this doc argued against
pulling thumbnails back from Blob, as hotspot bandwidth spent showing the
photographer something they already have; that was wrong once the grid
became the answer to which photos are already sent. At thumbnail size a
hundred of them is about 2MB, on one device.

A phone on an insecure origin has no `crypto.subtle` and so no hash. Dedupe
turns off for that device rather than blocking it; the photos still upload,
and the server still refuses exact repeats it can recognise.

---

## Capture time

Matching is only as good as the time on the photo, so the chain is explicit:

1. **EXIF `DateTimeOriginal` plus `OffsetTimeOriginal`**, read on the phone
   from the original file, before downscaling — the canvas re-encode drops
   EXIF, so it has to be read first. Gives an absolute time.
2. **`DateTimeOriginal` with no offset tag** — read it in the phone's own
   timezone, which is where the photo was taken.
3. **No EXIF** (a screenshot, a re-saved image) — `File.lastModified`.
4. **Nothing usable** — the upload time, flagged `"upload"`. The review card
   says so and proposes no match.

Read with about eighty lines in `lib/exif.ts`: walk the JPEG APP1 segment
for two tags. No dependency; anything unexpected falls through to step 3.

**Clock drift.** The photo page runs the same `verifySystemClock` check the
wave-start page does, shows it the same way, and sends the measured offset
with every photo. Matching subtracts it. The offset is measured at upload,
not at capture, which over one race morning is close enough — and the
operator confirms every match by hand anyway. A phone that is hours out gets
caught by the banner before anyone shoots.

---

## Matching

Compare `capturedAtMs - clockOffsetMs` against each entry's `finishTimeMs`.
Every entry within **±20 seconds** is a candidate, nearest first.

Twenty seconds covers the gap between the shutter and the operator's
keystroke plus the slop in two clocks. In a pack finish it will return
several riders — which is the point. The app ranks; the operator picks. No
attempt is made to decide alone.

Matching runs in the operator's browser, not on the server: finish times
live in the operator's local state, and the server has no business holding
them outside the snapshot.

---

## The phone page

Phone-first, same header and clock banner as `WaveStartView`.

- Pick shots with `<input type="file" accept="image/*" multiple>` — the
  photographer shoots in the camera app and picks from the roll afterwards.
- Per photo, on the phone: read EXIF, then decode once and draw twice — the
  1600px frame and the 320px thumbnail described above, against
  multi-megabyte originals over a hotspot.
- Upload one at a time, `POST /api/photos`, both sizes as form fields with
  the photo id, capture time, source and clock offset in the query string.
- Retry with backoff on failure, 5s out to 60s, the same shape
  `WaveStartView` uses.
- A visible per-photo list: queued, sending, retrying, sent.

The re-encode drops GPS coordinates along with the rest of the EXIF, so
location never reaches the server.

Vercel caps a request body at 4.5MB, and both sizes travel together. They
come to well under half a megabyte, but the server refuses a pair over 4MB
rather than letting the platform return an opaque 413.

**The upload list lives in memory and does not survive a reload.**
Deliberate: `WaveStartView` persists pending taps because a lost tap is a
lost result, and a lost photo is only a lost photo. The page says plainly to
keep it open until the list is empty — and a reload is cheap to recover from
anyway now, since re-picking the roll skips everything that already landed.
Persisting the blobs to IndexedDB on the phone is a follow-up, not part of
this.

---

## Review

A fourth operator tab, "Photos", carrying a count of what's pending.

Each pending photo shows the image, its capture time and where that time came
from, and the candidate finishers with their deltas, nearest first. Approve
against one of them, or reject.

**When nothing matches, the card says how far off it was** — the nearest
finisher and the gap, and beyond twelve hours, that the photo is from
another day or a clock is wrong. "No finisher within 20 seconds" on its own
sends the operator hunting for a bug when the answer is usually a photo
picked from an earlier shoot, which is the commonest way testing goes
sideways.

Matching keys off the absolute finish time, not elapsed, so correcting a
**wave start** changes every elapsed time and no photo matches. Correcting a
**finisher's own time** does re-match, immediately.

**A rider who has a photo drops out of every other photo's options.** One
rider, one photo — so the list of who's left shrinks as the operator works
down the queue, and the same person can't be picked twice a hundred photos
apart without anyone noticing. Swapping in a better shot means unapproving
the first, which puts that rider back in the running.

**Anyone still without a photo can be found by bib or name.** The time-based
suggestions are the fast path and will usually be right, but a photo whose
capture time fell back to the file date lands nowhere near its rider, and
then the operator needs to search. Typing runs against both the bib and the
name, and `normalizeBib` means the leading zeros printed on a packet still
find the rider. A dropdown of two hundred was the first attempt and is
unusable at that size.

**The review queue loads thumbnails too**, not just the leaderboard. Tapping
one enlarges it, and that is the only thing that ever fetches a full frame —
which is when the operator actually needs to read a bib. An earlier version
loaded the 1600px frame and drew it at 112px: the whole transfer cost, none
of the detail.

**Rejecting deletes the blob** and drops the hash field, because the store is
public and a flag alone would leave the image sitting at a live URL. It is
the one irreversible action here, so it takes a confirmation, matching how
this app treats every other delete.

Approved photos stay listed so one can be pulled back to pending — that much
is reversible, and it is what makes publishing on approval acceptable.

**This tab needs the network, on purpose.** It reads Blob URLs and the Redis
hash, and has no local copy. Offline it says so and does nothing else.
Scoring is untouched — no part of the timing path waits on it. The service
worker already refuses to cache anything under `/api/`, so a review queue is
never served stale.

---

## Publishing

`/[slug]` reads `race:{id}:photos` beside the snapshot it already reads,
keeps the approved records, and joins them to entries on `entryId`,
server-side. The thumbnail sits with the finisher; tapping it opens the full
frame. `loading="lazy"` on the thumbnails is load-bearing for cost, not just
for speed — a viewer who never scrolls past the top ten never fetches the
rest.

Nothing new is exposed: a photo hangs off an entry that is already public.
Consent for photos is covered where the design doc's
[Privacy](race-readiness-design.md#privacy) section says it is — the event's
mandatory waiver, which names photos and media.

Plain `<img>`, not `next/image` — the repo configures no image domains
today, and the phone has already done the resizing. Worth knowing for later:
routing through `next/image` would move per-viewer serving off the 10GB Blob
transfer meter onto the far larger Fast Data Transfer one, since viewers
would hit Vercel's image cache instead of the store. That's the escape valve
if Blob transfer ever gets tight, not a reason to add it now.

---

## What this does not do

- **No bib or face recognition.** Time is the only signal.
- **One photo, one finisher, and one finisher, one photo.** A pack shot gets
  approved against a single rider or skipped, and a rider who already has a
  photo isn't offered again. Attaching one photo to several riders, or
  giving a rider a gallery, are both later calls.
- **No cropping, rotating or editing.**
- **No retention policy.** An approved photo stays in Blob until someone
  deletes it by hand. Only rejection deletes anything on its own.
- **No rate limit on the upload endpoint**, the same accepted trade-off as
  the wave-start link and `POST /api/auth`. Someone with the link can fill
  the Blob store; the review queue means they can't publish anything.

---

## Open items

- **A Pro plan turns the hard stop into a bill.** Pro includes 100GB of Blob
  transfer instead of 10GB, and meters overage at $0.05/GB rather than
  cutting the store off for 30 days. That is the one Hobby risk that can't
  be engineered around, so it's worth deciding before race day rather than
  during it. The two sizes stay either way — at full size a 200-finisher
  board is a 70MB page, and the people loading it are standing at a
  trailhead on the same kind of connection the operator is warned about.
- **Storage is the meter that persists.** Transfer and operations are
  monthly and reset; storage doesn't, and nothing deletes a photo on its
  own. One race a year at ~150MB stays well under the 1GB Hobby line, so
  paying for Pro only around race day and dropping back afterwards works.
- **A past race's leaderboard keeps serving photos all year.** That traffic
  lands on whatever plan is current, which on the pattern above is Hobby —
  200 photos at full size is 70MB a load against 10GB a month. It's the
  same argument for two sizes as the race-day one, stretched across the
  other eleven months.
- **Watch Blob usage in Vercel's Observability tab after the first real
  race.** The arithmetic above says a race fits inside Hobby with room to
  spare, but it assumes photo counts we haven't measured yet, and running
  out stops the store serving for 30 days.
- **Server uploads hold a function open** for the whole phone-to-Vercel leg,
  so a slow hotspot can fail as a function timeout rather than a network
  error. The retry loop covers it either way; client uploads (a signed URL
  the phone posts to directly) would remove it, at the cost of more
  machinery.
- **Testing.** The e2e environment has no Redis and now no Blob either, so
  the same limit `e2e/wave-start.spec.ts` documents applies: tests can pin
  the dev-preview page, the queue states and the matching function, but the
  authorized round trip needs a real deploy.
