# EBDC 2026 Fun Awards — Timing App Spec

**Status:** Approved for implementation
**Owner:** Timing app (this repo)
**Companion doc:** `docs/wordpress-registration-form.md` — the registration
form build. Section 4 of that doc defines the CSV contract, which is the
authoritative description of this app's input. Don't restate it here; if the
format needs to change, change it there.

---

## 1. Purpose

Add "fun award" sub-leaderboards alongside the existing category boards,
driven by optional questions answered at registration. Everything here
consumes the registration CSV; none of it changes how finishes are recorded
or how elapsed time is computed.

---

## 2. Input

A CSV matching `docs/wordpress-registration-form.md` section 4. Summarized:

| Column | Values |
| --- | --- |
| `bib` | integer |
| `first_name`, `last_name` | text |
| `wave` | `A` \| `B` \| `C` |
| `dob` | `YYYY-MM-DD` |
| `gender` | `male` \| `female` \| `nonbinary` \| `undisclosed` |
| `first_gravel_race` | `yes` \| `no` \| *(blank)* |
| `is_parent` | `yes` \| `no` \| *(blank)* |
| `rigid_bike` | `yes` \| `no` \| `unsure` \| *(blank)* |
| `steel_bike` | `yes` \| `no` \| `unsure` \| *(blank)* |

Header-driven parsing — column order is free, column names are fixed.

The file carries only riders who registered online — there's no row for a
day-of walk-up. Walk-up bibs are physical: a stack of packets held back from
printing, with the number already on each one. The operator adds a walk-up
in the app when they show up, typing the bib off their packet — see
implementation item 6.

Contact and fundraising fields are deliberately excluded from this CSV.
Everything imported here lands in the `raceState` snapshot, which syncs to
Redis and backs the public leaderboard, so the import surface stays as small
as the awards require.

---

## 3. Derived Fields (computed, not collected)

```yaml
derived_fields:
  - id: age_on_race_day
    source: dob
    logic: "race_date (2026-10-10) minus dob, in years"
    note: >
      Anchored to race day, not the day results are computed, so recomputing
      or republishing later never reshuffles a category.
  - id: masters_50_flag
    source: age_on_race_day
    logic: "age_on_race_day >= 50"
  - id: junior_flag
    source: age_on_race_day
    logic: "age_on_race_day <= 18"
    note: "RESOLVED — 18 inclusive, matching the cutoff already implemented in lib/categories.ts."
```

---

## 4. Award Categories

```yaml
award_categories:
  - name: "Masters 50+"
    eligibility: "masters_50_flag == true"
    sort_by: "elapsed_time asc"
    split_by_gender: false
    note: >
      A gendered split (Masters male/female) shipped once and was reverted —
      too many near-identical boards for a field this size. One combined
      board.

  - name: "Fastest Parent"
    eligibility: "is_parent == 'yes'"
    sort_by: "elapsed_time asc"
    split_by_gender: false

  - name: "Fastest First-Timer"
    eligibility: "first_gravel_race == 'yes'"
    sort_by: "elapsed_time asc"
    split_by_gender: false

  - name: "Top Rigid Bike"
    eligibility: "rigid_bike == 'yes'"
    sort_by: "elapsed_time asc"
    split_by_gender: false
    note: "'unsure' is not eligible."

  - name: "Top Steel Bike"
    eligibility: "steel_bike == 'yes'"
    sort_by: "elapsed_time asc"
    split_by_gender: false
    note: >
      Can overlap with Top Rigid Bike winner — allowed, not mutually
      exclusive. 'unsure' is not eligible.


ranking_rules:
  sort_key: elapsed_time   # finish time minus that rider's own wave start
  tiebreak: bib asc        # stable, deterministic across renders
  excluded: >
    Entries with no wave assigned (unresolved unknown bibs) have no elapsed
    time and are excluded from every board until resolved.
  gendered_boards: >
    Only gender == 'male' or 'female' appear in gendered podiums. 'nonbinary'
    and 'undisclosed' riders are still ranked in every non-gendered board
    (Masters combined view, all fun awards, overall results).
```

### 4a. Board display

A UI decision, not a data one — `CategoryLeaderboardGrid.tsx`.

- **Fun awards are a single-winner spotlight by default, expandable to the
  full field.** Each award card shows only the fastest eligible rider (more
  than one name only on a genuine tie), not a top-10 — a fun award has one
  point, who won it. "Show full results" on the card expands it into the
  same ranked-row view a category board uses, so a rider who didn't win can
  still find their own place; "Show winner only" collapses it back.
- **Category boards cap their default display per board, not one shared
  number.** A small field doesn't need as many rows shown as a large one to
  feel complete: Masters top 3, Junior (each gender) top 3, Overall (each
  gender) top 10. "Show all" still expands to the full field on any board.

---

## 5. Decisions

### Resolved

- [x] **`gender == "Prefer not to say"` handling** — exported as `undisclosed`,
  stored distinctly from `nonbinary`. Neither appears in gendered podiums;
  both are ranked normally everywhere else. Chosen over collapsing both to
  one bucket so the data stays honest and a dedicated board can be added
  later without re-collecting.
- [x] **Lanterne Rouge — CUT.** Not running this award. The field includes a
  lot of amateur and first-time racers, and a last-place award is the only
  one on the list conferred on a rider rather than opted into on the form.
  Every remaining award is something the rider volunteered for, which is
  what keeps the set celebratory. Revisit only if the field changes
  character.
- [x] **`JUNIOR_AGE_CUTOFF` value** — 18, inclusive. Already the cutoff in
  `lib/categories.ts`; no change needed.
- [x] **CSV column order** — no longer a constraint. The timing app's importer
  is moving to header-driven parsing, so column order is free. Column
  *names* are fixed (section 8).
- [x] **Rigid + steel double winner** — allowed. The two are independent
  filters; a rider on a rigid steel bike can win both.
- [x] **A registered row missing a required field** — imports, flagged, and is
  fixed in the app; it is not dropped and never gets a substituted value. Only
  a row with no bib is refused, because nothing can be attached to it. See
  section 6a.
- [x] **Bib assignment** — handled by the registration-side script the week
  before the ride, after registration closes. That run assigns each rider a
  number and prints their release form, and is also the source of the timing
  CSV. See section 8.

### Still open

- [ ] **Minimum entrants per award** — a board with one eligible rider is
  arguably worse than no board. Decide a floor, or accept single-entrant
  awards.

Form-side open questions (wave cutoffs, `first_gravel_race` wording) live in
`docs/wordpress-registration-form.md` section 5 — neither has code impact.

---

## 6. Implementation Plan

Ordered by dependency. Items 1–3 and 6 are independent of the structural
question in item 4.

1. **Rewrite the CSV importer** — `components/RegistrationTab.tsx`.
   Header-driven, RFC-4180 parsing. Also a live bug fix: the current regex
   field-splitter keeps only the last word of an unquoted multi-word name
   (`Mary Jo Van Der Berg` imports as `Jo Berg`) and collapses empty fields,
   shifting every later column — which the optional award questions would
   make routine. Reject a file whose header doesn't carry the expected column
   names, by name — the likeliest race-morning mistake is uploading last
   year's export, and that should fail loudly rather than import nothing.

   **Import says what it did — see section 6a.** The parsing fix alone still
   leaves the operator holding "117 riders" from a 120-row file with no
   explanation. Both halves ship together or item 1 isn't done.

   Test files are in `fixtures/`, with a table in `fixtures/README.md` saying
   what each row proves — the good file, one-problem-per-row, shuffled column
   order, CRLF + BOM, and the 2024 files as a wrong-file negative test. Today's
   importer keeps 0 of 19 rows from the good file.

2. **Widen `Registrant`** — `lib/db.ts`. Gender union becomes
   `male | female | nonbinary | undisclosed`; add the four optional award
   fields. Registrants live inside the `raceState` blob rather than an indexed
   Dexie table, so no schema version bump is needed — but existing local *and
   cloud* snapshots contain `"n/a"`, so the load path needs a normalizing read
   (`n/a` → `undisclosed`) or last year's races stop loading.

3. **Anchor age to race day** — `calculateAge` currently uses `new Date()`.
   Add an as-of date (and a race date on `RaceState`) so republishing results
   in November doesn't reshuffle Masters.

4. **Restructure `CategoryBuckets`** — today a fixed five-field interface in
   `lib/categories.ts`. With five award boards plus a gender-split Masters it
   grows to ~9. Move to `{ id, name, entries }[]` so boards are data-driven
   and `CategoryLeaderboardGrid` maps over them. Touches `lib/categories.ts`,
   `CategoryLeaderboardGrid.tsx`, `CategoryLeaderboards.tsx`, and
   `app/[slug]/page.tsx`.

5. **Award eligibility + tiebreak** — the bucket predicates themselves. Small
   once item 4 is settled.

6. **Walk-up registration** — `components/RegistrationTab.tsx`. No reserved-
   bib concept: the CSV carries only riders who registered online, and a
   walk-up is added the same way as any late manual entry, through the
   ordinary Add registrant form, typing the bib that's already printed on
   their packet. The app never tracks which physical bibs exist or which are
   still unhanded-out — that's the responsibility of whoever's holding the
   stack of packets, not this app. Add the four award questions to the
   shared add/edit modal, and stop pre-seeding `dob: "1990-01-01"` /
   `gender: "n/a"` — a plausible-looking fake birthdate that passes
   validation is worse than an empty required field, since it silently files
   a rider into the wrong age category.

   An earlier version of this item modeled reserved bibs as `status: spare`
   registrants: the CSV pre-declared day-of numbers, the app tracked which
   were unclaimed, and a lookup guard kept an unclaimed one from silently
   matching a mistyped bib at record time. Dropped — there's no threat that
   guard was protecting against once the bib itself is just a physical
   object handed to a rider, and the concept added a second bib-shaped thing
   for the app to keep straight for no benefit.

### Constraints that carry over

- **DOB never reaches the client.** `computeCategoryBuckets` returns plain
  `Entry[]` precisely so the public page can render boards without registrant
  data in the bundle. New award flags must follow the same rule: bucket
  server-side, ship `Entry[]`.
- **Ranking is by elapsed time, always.** With staggered wave starts, order of
  finish and order of elapsed time are different orderings.

---

## 6a. Import Reporting

Nothing about an import is silent. Three parts, all of item 1.

### Take every row that has a bib

A row is refused only when it has no bib. There is nothing to attach a
correction to, and no rider will appear at the start line under a number that
doesn't exist. Everything else imports and carries its problem with it: a
missing wave or birthday is a rider to chase down before the gun, not a rider
to delete. This reverses today's behavior, which drops a row for a blank name
or an unrecognized wave and says nothing — the rider then reappears at the
finish line three hours later as "Unknown Rider".

| Problem | Tier | Effect if left unfixed |
| --- | --- | --- |
| No bib | refused | Not imported. Fix in the source file and re-upload. |
| Bib already used by an earlier row | blocks scoring | Today the later row silently overwrites the earlier one and a rider vanishes. |
| Wave missing or not A/B/C | blocks scoring | No elapsed time. The rider finishes unranked. |
| Name missing | blocks results | Nothing to put on the results sheet or the podium. |
| `dob` missing or unparseable | blocks awards | Absent from Masters and junior boards. Never substitute a placeholder date — a plausible-looking fake passes validation and files the rider into the wrong age category. |
| `gender` missing or not one of the four tokens | blocks awards | Absent from gendered podiums. |
| Award answer not one of its allowed tokens | blocks awards | Treated as blank, i.e. not eligible for that board. |

### Summarize the upload

Plain counts, named. After a 120-row file:

```
118 of 120 riders imported.
  1 rider with an invalid wave — can't be scored until fixed
  3 birthdays missing — no age categories for them
  2 rows couldn't be imported (rows 44, 91 — no bib)
```

A panel on the Registration tab, not an `alert()`. The operator works through
this list; a dialog they dismiss once is gone. Collapsible, so a roster they
have decided is good enough stops nagging.

The refused rows are the one part that can't be recovered after the fact —
they aren't in the roster to be looked up — so name their row numbers here.

### Flag them on the roster

Every problem above except "no bib" belongs to a rider who is in the table, so
mark the row and say which field. That's where it gets fixed: the same
add/edit modal item 6 extends.

**Derive the flags, don't store them.** Every one of these is visible in the
record itself — a missing birthday is an empty `dob`, an invalid wave is a
null `wave`. One function over a `Registrant` returns its problems; the roster
marks rows with it and the summary counts the same function's output across
the roster, so the two can't disagree. No new persisted field, no snapshot
growth, no migration, and the flag clears itself the moment the field is
fixed. A stored flag goes stale on the first edit.

### Checklist interaction

`SetupChecklist`'s "Load Registrants" panel currently ticks on
`registrantCount > 0`. It must not tick while any rider carries a
**blocks scoring** problem — that's the one tier that makes the race
unscoreable, and the checklist is the last thing between it and the start.
Blocks-results and blocks-awards problems show on the roster but don't hold
the tick: the awards are opt-in by design and a missing birthday is not worth
blocking a race over.

---

## 7. Out of Scope

- The registration form itself — `docs/wordpress-registration-form.md`
- Timing app backup/sync architecture — `docs/race-readiness-design.md`
- Route details, podium/ceremony format
