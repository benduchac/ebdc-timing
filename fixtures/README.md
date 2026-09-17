# Test fixtures

CSV files for the registrant importer, and JPEGs for the photo companion.
The CSV format is defined in `docs/wordpress-registration-form.md` section
4; what the importer must do with a bad row is `docs/registrant-import.md`
section 6a. The photos are described under `photos/` below.

## Files

### `registrants-2026.csv` — the good file
100 rows, all valid, bibs numbered sequentially `001`-`100` the way the
registration-side script actually assigns them — not the old file's
arbitrary/gapped numbers. Large enough to exercise real leaderboard behavior
(per-board display caps, "Show all", every gender/category board actually
populated) instead of just parsing edge cases. Bibs 001-013 and 017 are
pinned to specific people and values for the parsing proofs below; every
other bib is procedurally generated (fixed seed, so re-running the generator
reproduces the same file) to fill out a realistic field.

| Bib | Row | What it proves |
| --- | --- | --- |
| 003 | Mary Jo Van Der Berg | A name with internal spaces imports as one whole field, not split or truncated. |
| 017 | Smith, Jr. | A comma inside a quoted field. |
| 008 | O"Brien | An embedded double quote, RFC-4180 escaped as `""`. |
| 007 | Leading Zero | `normalizeBib` still applies — this rider is bib 7. |
| 010 | Marcus Webb, age 19 | Just above the junior cutoff (18) — adult. |
| 011 | Nia Fletcher, age 18 | Right at the junior cutoff — junior. |
| 012 | Robert Ellery, age 50 | Right at the masters cutoff — masters. |
| 013 | Helen Marsh, age 49 | Just below the masters cutoff — not masters. |
| 001 | Sarah Johnson | male/female/nonbinary/undisclosed all appear elsewhere in the generated rows too — `female`. |
| 002 | Michael Chen | `male`. |
| 004 | Alex Rivera | `nonbinary`, junior (age 17). |

At the generated field size, every category board comfortably clears its
display cap (Masters 3, Junior 3 per gender, Overall 10 per gender) with
real, non-boundary riders — Junior Male/Female, Masters, and both Overall
boards all have more finishers than their cap once everyone in the file
finishes, so "Show all" is reachable without hand-crafting a scenario.

### `registrants-2026-problems.csv` — one problem per row
The fixture the import report is built against. Expected outcome: **8 of 9
imported, 1 refused**, and every one of these named.

| Bib | Problem | Tier |
| --- | --- | --- |
| 20 | `age` blank | blocks awards |
| 21 | `gender` blank | blocks awards |
| 22 | wave `D` | blocks scoring |
| 23 | `name` blank | blocks results |
| 25 | `gender` is `Female`, not the lowercase token | blocks awards |
| 26 | `age` is `unknown`, not a whole number | blocks awards |
| 26 (again) | bib already used by the row above | blocks scoring |
| *(none)* | no bib — the only row that gets refused | refused |
| 28 | nothing wrong; the control row | — |

Row 25 is the one to think about: `Female` is unambiguous to a human, so
accepting it case-insensitively is tempting. Don't. The export contract is
lowercase tokens, and quietly accepting near-misses is how a `Non-Binary` or
a `PREFER NOT TO SAY` ends up mapped to something nobody chose. Flag it and
let a person decide.

### `registrants-2026-shuffled-columns.csv`
Identical riders to the good file, columns in a different order
(`wave,name,gender,age,bib`). The spec says column order is free and only
names are fixed, so this must import identically. This is what regresses
when someone writes a header-aware parser that still assumes position.

### `registrants-2026-crlf-bom.csv`
The good file with CRLF line endings and a UTF-8 BOM — what a real WordPress
or Excel export tends to produce. The BOM makes the first header read as
`﻿bib` unless it's stripped, and header matching then fails on every
row. Strip with `utf-8-sig` decoding or an explicit check.

### `photos/` — finish-line photo fixtures
Two JPEGs for the photo companion, both a plain gradient at 2400x1600 —
larger than the 1600px long edge the phone resizes to, so the downscale path
runs rather than being skipped. Regenerate with `python3
fixtures/generate-photos.py`.

| File | What it proves |
| --- | --- |
| `finish-with-exif.jpg` | A real EXIF block with `DateTimeOriginal` (2026:10:10 09:15:42) and `OffsetTimeOriginal` (-07:00), so the parsed time can be asserted against a known UTC instant rather than against itself. |
| `finish-no-exif.jpg` | The same image with no EXIF at all — a screenshot or a re-saved file. Must fall back to the file's modified time and keep the upload queue moving, not throw. |

### `legacy/`
The 2024-format files, kept as a negative test. The likeliest race-morning
mistake isn't a malformed export — it's uploading last year's file. Neither
has a `bib` or `name` header, so the importer should refuse both by name
("this doesn't look like a 2026 registration export") rather than importing
nothing quietly.
