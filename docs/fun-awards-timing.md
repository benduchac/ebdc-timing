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
| `status` | `registered` | `spare` (absent = `registered`) |
| `first_name`, `last_name` | text |
| `wave` | `A` \| `B` \| `C` |
| `dob` | `YYYY-MM-DD` |
| `gender` | `male` \| `female` \| `nonbinary` \| `undisclosed` |
| `first_gravel_race` | `yes` \| `no` \| *(blank)* |
| `is_parent` | `yes` \| `no` \| *(blank)* |
| `rigid_bike` | `yes` \| `no` \| `unsure` \| *(blank)* |
| `steel_bike` | `yes` \| `no` \| `unsure` \| *(blank)* |

Header-driven parsing — column order is free, column names are fixed.

The file carries spare bibs as well as registered riders: a `status: spare`
row has a `bib` and every other column blank. These are reserved numbers for
day-of walk-ups, not people — see implementation item 6.

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
    split_by_gender: true
    note: >
      CHANGE TO EXISTING BEHAVIOR — Masters is currently a single combined
      board in the timing app. Splitting it is a change, not new work.

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
- [x] **Bib assignment** — handled by the registration-side script the week
  before the ride, after registration closes. That run assigns each rider a
  number and prints their release form, and is also the source of the timing
  CSV. See section 8.

### Still open

- [ ] **Minimum entrants per award** — a board with one eligible rider is
  arguably worse than no board. Decide a floor, or accept single-entrant
  awards.
- [ ] **Walk-up capture workflow** — deferred, not designed. Reserved bibs
  arriving in the CSV (item 6) are enough to unblock the build, but the
  at-the-line experience hasn't been worked through: how much the operator
  realistically types while riders are queueing, whether the four award
  questions belong on the claim form or only in a later edit, and whether
  claiming happens in the Registration tab or inline from Timing. Worth a
  pass before race day, but it does not block items 1-5.

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
   make routine.

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

6. **Reserved bibs + walk-up capture** — `components/RegistrationTab.tsx`.
   Spare bibs arrive as `status: spare` rows, so the operator no longer picks
   a number; they claim one that already exists. Three parts:

   - **Import** — spare rows become registrants with a bib and nothing else.
     The importer must accept them despite blank names (today it requires
     first and last name and would drop them).
   - **Claim flow** — the walk-up path finds the reserved bib and fills in the
     rider, replacing `handleAddNew`'s `max(assigned) + 1` guess. Add the four
     award questions to the shared add/edit modal, and stop pre-seeding
     `dob: "1990-01-01"` / `gender: "n/a"` — a plausible-looking fake
     birthdate that passes validation is worse than an empty required field,
     since it silently files a rider into the wrong age category.
   - **Unclaimed guard** — see below. This is the part that matters most.

   **An unclaimed spare must behave exactly like an unknown bib.** Today, a
   bib the operator types that isn't in `registrants` produces an entry with
   `wave: null` / `elapsedMs: null`, flagged for post-race resolution. Once
   spare rows exist, a mistyped bib can instead *match* a reserved-but-
   unclaimed registrant — and quietly attach a finish to a nameless rider
   rather than raising the flag. The lookup at record time must treat an
   unclaimed spare as a miss, not a hit. A spare row has no wave, so elapsed
   time can't be computed either way; the risk is the entry looking resolved
   when it isn't.

   Unclaimed spares must also be excluded from every leaderboard, the results
   table, and the registrant count shown in the setup checklist — they're
   reserved numbers, not people.
### Constraints that carry over

- **DOB never reaches the client.** `computeCategoryBuckets` returns plain
  `Entry[]` precisely so the public page can render boards without registrant
  data in the bundle. New award flags must follow the same rule: bucket
  server-side, ship `Entry[]`.
- **Ranking is by elapsed time, always.** With staggered wave starts, order of
  finish and order of elapsed time are different orderings.

---

## 7. Out of Scope

- The registration form itself — `docs/wordpress-registration-form.md`
- Timing app backup/sync architecture — `docs/race-readiness-design.md`
- Route details, podium/ceremony format
