# Next-year improvements

Notes from the 2026 event. The tool ran the whole event with no issues; these are improvements, not fixes.

## 1. Multi-scorer, concurrent model (biggest change)

The single "operator" model is too brittle. In the end the event couldn't be handed off to other scorers, and one laptop had to stay in charge of the entire event.

Rebuild as a multi-tenant, concurrent model:

- One or more scorers, on computers or phones, working at the same time.
- Bulletproof, streamlined scorer UIs.
- An admin/operator role that adjusts, manages and fixes data afterwards.

Design direction (decided after the event):

- **The server is the source of truth.** Connectivity at the finish line was good in 2026, so this is workable. It replaces the browser-held snapshot and the last-writer-wins sync.
- **Scorers only submit finishes.** Each scorer's records are appended to the server, so scorers never overwrite each other.
- **Duplicates are expected.** If several scorers submit the same finisher, that's fine. The operator reconciles duplicates afterwards instead of the scorer UI trying to prevent them.
- **Model on the micro-apps.** The wave-start tracker and the photo upload page both worked perfectly on race day. Each is a small token-gated page that writes to its own Redis hash. The scorer should be built the same way, rather than as another mode of the operator app.
- **Still to design:** what a scorer does when the connection briefly drops. A local queue that retries, like the wave-start page, is the likely answer.

## 2. Photo-to-finisher matching

Connecting photos to finishers was hard. We made a few changes during the event, but a human problem showed up: in the native photo picker every photo looks so similar that it was very hard to tell which photos had been uploaded and which were missing.

Options to consider:

- A native app that connects files to finishers automatically.
- A better matching/uploading UI.

Reference design: my photo partner's mockup at https://crocker510.com/ride-tracker/ (mock data only, no backend). It is a review-and-adjust screen for matches that already exist, not a matcher:

- **Two columns on a shared time axis.** Finishes are on the left and photos on the right, each placed by timestamp, so a photo sits opposite the finish it was taken at. Gaps between clusters are labelled.
- **Review every match at a glance.** Connectors share a color per rider #, and amber marks anything with no rider #. Counters show progress, e.g. "finishes 7 of 10 · photos 12 of 17".
- **Fix matches by dragging.** Drop a finish onto a photo, or a photo onto a finish, to give both the same rider #. If their numbers disagree, a dialog asks which to keep. Rider # can also be typed on any card.
- **Spot orphans.** Riders with no photo and photos with no rider are easy to see, which was the hard part with the native picker.

Open question: where the first-pass matches come from. Last year's capture-time candidates in `lib/photoMatch.ts` could pre-fill the timeline.

## 3. Course staff photo uploads

Let staff around the course upload photos and match them by bib number. That way we end up with more than a finish-line photo for each rider, including a few photos from around the course. Useful for the top 10, etc.

## 4. Richer `/tv/` mode

Make TV mode more dynamic: show photos on half the screen while the finishers scroll on the other half.

## 5. Always show the most important information

Make sure the key information is always visible. For example, the main scoring screen didn't show elapsed time for recent finishers.

## 6. Mark riders present at the start

Add a way to mark riders as present at race start. About a dozen no-shows made it impossible to tell whether all riders had finished or whether more were still on the course.

## 2026 capacity and cost baseline

Usage for the 2026 event, Oct 9 to 12, Production. Everything ran well inside its limits. Use this as the baseline when sizing next year's changes.

### Vercel (from the dashboard)

- **Requests:** 49K in total, peaking around 4K per time bucket on race day, which is roughly one request per second. 0% function errors and 0% timeouts.
- **Compute:** 9 minutes of active CPU in total, with a peak of about 45 seconds per bucket.
- **Transfer:** 612 MB out and 279 MB in. This is well under 1% of the Hobby plan's 100 GB a month, as I recall the plan (check the plan page).
- **Traffic shape:** a sharp spike on race day, a smaller bump on Oct 9 (probably setup and testing), then a steady tail of leaderboard views through Oct 12.

Where the data went:

| Route | Requests | Cached | Notes |
| --- | --- | --- | --- |
| `/timing_bg.webp` | 554 | not recorded | 217 MB out, 35% of all outgoing transfer, at about 390 KB each |
| `/[slug]` (public leaderboard) | 11K | 0% | 125 MB out, about 11 KB per view; each view runs the function and reads Redis |
| `/api/photos` | 736 | 0% | 215 MB in, 77% of all incoming. Requests include polls and approvals, so uploads are fewer and bigger; photo bytes pass through the function |
| `/api/wave-start` | 2.3K | 0% | phone polling, as expected |
| static assets | n/a | 92-99% | |

### Vercel Blob (photos)

- **Downloads:** 21K downloads, 2.04 GB in total, or about 97 KB per download. That is almost all thumbnails, so the two-size design works.
- **Cap:** the repo's Blob note says Hobby includes 10 GB of transfer a month and stops serving when it is exhausted. One event used about 20% of that.
- **Separate from Vercel transfer:** total delivery was about 2.6 GB (2.04 GB Blob plus 612 MB Fast Data Transfer).

### Upstash Redis

- **Commands:** 63K, made up of 60,060 reads and 2,536 writes.
- **Bandwidth:** 2 GB, or about 33 KB per read. This is consistent with each leaderboard view pulling the whole race snapshot (my inference).
- **Storage:** 1 MB of 100 GB.
- **Cost:** $0.13 against a $25 budget (Pay As You Go).

### Firewall

Firewall Actions showed red spikes up to about 500. One lines up with race day. A second came near the end of the range when regular traffic was low, which looks more like a bot or scanner. The action and rule weren't visible in the screenshot. To do: check the Firewall tab and confirm no real spectators were blocked or rate-limited at the race peak.

### What this means for next year

- **Blob is the only finite ceiling.** Course-staff photos (#3) and a photo-cycling TV (#4) both multiply photo traffic. Plan for it, by upgrading Blob for race week or keeping thumbnails small. The hard stop is the failure mode to avoid.
- **Shrink `/timing_bg.webp`.** It is the single largest outgoing item. Compressing or resizing it is cheap, and it is worth confirming how it is cached.
- **Cache the public leaderboard briefly.** A 10 to 30 second cache on `/[slug]` would cut function invocations and Redis reads and bandwidth. It would matter more with a bigger crowd.
- **Course-staff uploads should go direct to Blob.** At this scale `/api/photos` carried photo bytes through the function. More photographers would multiply that and run into the function's request-body limit.
- **Server-as-source-of-truth (#1) is not a capacity risk.** Compute and Redis were tiny. Per-finish records would raise writes from today's 2.5K, which is still far from a concern.
