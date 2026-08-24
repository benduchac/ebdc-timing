# CSV fixtures

Test files for the registrant importer. The format they follow is defined in
`docs/wordpress-registration-form.md` section 4; what the importer must do
with a bad row is `docs/fun-awards-timing.md` section 6a.

Race day is **2026-10-10**. Several dates below sit on a category boundary
relative to that date, on purpose.

Today's importer keeps **0 of 100** rows from `registrants-2026.csv` and says
nothing. That's the bug these exist to close, so a rewrite that can't load
these isn't done.

## Files

### `registrants-2026.csv` — the good file
100 rows, all valid, bibs numbered sequentially `001`-`100` the way the
registration-side script actually assigns them — not the old file's
arbitrary/gapped numbers. Large enough to exercise real leaderboard behavior
(per-board display caps, "Show all", every gender/award board actually
populated) instead of just parsing edge cases. Bibs 001-013 and 017 are
pinned to specific people and values for the parsing/boundary proofs below;
every other bib is procedurally generated (fixed seed, so re-running the
generator reproduces the same file) to fill out a realistic field. See
`docs/wordpress-registration-form.md` section 4 for the format the generator
follows.

| Bib | Row | What it proves |
| --- | --- | --- |
| 003 | Mary Jo Van Der Berg | Multi-word first *and* last name, redundantly quoted even though RFC-4180 doesn't require it for a bare space. The current regex keeps only the last word of each. |
| 017 | Smith, Jr. | A comma inside a quoted field. |
| 008 | O"Brien | An embedded double quote, RFC-4180 escaped as `""`. |
| 007 | Leading Zero | `normalizeBib` still applies — this rider is bib 7. |
| 003 | Mary Jo's blank answers | Two skipped optional questions that still hold their position. Collapsing them shifts every later column. |
| 010 | Marcus Webb, `2007-10-10` | Turns 19 **on** race day → age 19, not a junior. |
| 011 | Nia Fletcher, `2007-10-11` | Turns 19 the **day after** → age 18, junior. |
| 012 | Robert Ellery, `1976-10-10` | Turns 50 **on** race day → masters. |
| 013 | Helen Marsh, `1976-10-11` | Turns 50 the **day after** → age 49, not masters. |
| 006 | Priya Raman, `1996-02-29` | Leap-year birthday. |
| 001 | Sarah Johnson | male/female/nonbinary/undisclosed all appear elsewhere in the generated rows too — `female`. |
| 002 | Michael Chen | `male`, first-timer + rigid + steel eligible — a fun-award winner candidate. |
| 004 | Alex Rivera | `nonbinary`, junior, first-timer eligible. |

The four dated boundary rows are also the age-anchor test: `calculateAge`
parses `YYYY-MM-DD` as UTC and compares against local dates, which in
Pacific time flips exactly these four.

At race-day anchoring, the generated field comfortably clears every
category board's display cap (Masters 3, Junior 5 per gender, Overall 20 per
gender) with real, non-boundary riders — Junior Male/Female, Masters, and
both Overall boards all have more finishers than their cap once everyone in
the file finishes, so "Show all" is reachable without hand-crafting a
scenario.

### `registrants-2026-problems.csv` — one problem per row
The fixture the import report is built against. Expected outcome: **9 of 10
imported, 1 refused**, and every one of these named.

| Bib | Problem | Tier |
| --- | --- | --- |
| 20 | `dob` blank | blocks awards |
| 21 | `gender` blank | blocks awards |
| 22 | wave `D` | blocks scoring |
| 23 | `first_name` blank | blocks results |
| 24 | `first_gravel_race` is `maybe` | blocks awards |
| 25 | `gender` is `Female`, not the lowercase token | blocks awards |
| 26 | `dob` is `03/15/1992`, not ISO | blocks awards |
| 26 (again) | bib already used by the row above | blocks scoring |
| *(none)* | no bib — the only row that gets refused | refused |
| 28 | nothing wrong; the control row | — |

Row 25 is the one to think about: `Female` is unambiguous to a human, so
accepting it case-insensitively is tempting. Don't. The export contract is
lowercase tokens, and quietly accepting near-misses is how a `Non-Binary` or
a `PREFER NOT TO SAY` ends up mapped to something nobody chose. Flag it and
let a person decide.

### `registrants-2026-shuffled-columns.csv`
Identical riders to the good file, columns in a different order. The spec says
column order is free and only names are fixed, so this must import identically.
This is what regresses when someone writes a header-aware parser that still
assumes position.

Note the multi-word names come through unquoted here — a space needs no
quoting under RFC-4180, and a real export won't add it. Handling
`Van Der Berg` unquoted is the requirement, not a nicety.

### `registrants-2026-crlf-bom.csv`
The good file with CRLF line endings and a UTF-8 BOM — what a real WordPress
or Excel export tends to produce. The BOM makes the first header read as
`﻿bib` unless it's stripped, and header matching then fails on every
row. Strip with `utf-8-sig` decoding or an explicit check.

### `legacy/`
The 2024-format files, kept as a negative test. The likeliest race-morning
mistake isn't a malformed export — it's uploading last year's file. Neither
has a `bib` or `first_name` header, so the importer should refuse both by
name ("this doesn't look like a 2026 registration export") rather than
importing nothing quietly.
