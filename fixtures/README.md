# CSV fixtures

Test files for the registrant importer. The format they follow is defined in
`docs/wordpress-registration-form.md` section 4; what the importer must do
with a bad row is `docs/fun-awards-timing.md` section 6a.

Race day is **2026-10-10**. Several dates below sit on a category boundary
relative to that date, on purpose.

Today's importer keeps **0 of 19** rows from `registrants-2026.csv` and says
nothing. That's the bug these exist to close, so a rewrite that can't load
these isn't done.

## Files

### `registrants-2026.csv` — the good file
19 rows, all valid, covering every shape that breaks a naive parser:

| Row | What it proves |
| --- | --- |
| Mary Jo Van Der Berg | Multi-word first *and* last name. The current regex keeps only the last word of each. |
| Smith, Jr. | A comma inside a quoted field. |
| O"Brien | An embedded double quote, RFC-4180 escaped as `""`. |
| bib `007` | `normalizeBib` still applies — this rider is bib 7. |
| Mary Jo's blank answers | Two skipped optional questions that still hold their position. Collapsing them shifts every later column. |
| Marcus Webb, `2007-10-10` | Turns 19 **on** race day → age 19, not a junior. |
| Nia Fletcher, `2007-10-11` | Turns 19 the **day after** → age 18, junior. |
| Robert Ellery, `1976-10-10` | Turns 50 **on** race day → masters. |
| Helen Marsh, `1976-10-11` | Turns 50 the **day after** → age 49, not masters. |
| Priya Raman, `1996-02-29` | Leap-year birthday. |
| all four gender tokens | `male`, `female`, `nonbinary`, `undisclosed`. |
| bibs 150–152 | `status: spare` — a bib and nothing else. Blank fields on a spare are expected, not problems. |

The four dated rows are also the age-anchor test: `calculateAge` parses
`YYYY-MM-DD` as UTC and compares against local dates, which in Pacific time
flips exactly these four.

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
