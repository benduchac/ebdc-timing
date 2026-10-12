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

## 3. Course staff photo uploads

Let staff around the course upload photos and match them by bib number. That way we end up with more than a finish-line photo for each rider, including a few photos from around the course. Useful for the top 10, etc.

## 4. Richer `/tv/` mode

Make TV mode more dynamic: show photos on half the screen while the finishers scroll on the other half.

## 5. Always show the most important information

Make sure the key information is always visible. For example, the main scoring screen didn't show elapsed time for recent finishers.

## 6. Mark riders present at the start

Add a way to mark riders as present at race start. About a dozen no-shows made it impossible to tell whether all riders had finished or whether more were still on the course.
