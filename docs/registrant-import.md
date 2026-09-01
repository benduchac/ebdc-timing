# EBDC 2026 Registrant Import — Timing App Spec

**Status:** Approved for implementation
**Owner:** Timing app (this repo)
**Companion doc:** `docs/wordpress-registration-form.md` — the registration
form build. Section 4 of that doc defines the CSV contract, which is the
authoritative description of this app's input. Don't restate it here; if the
format needs to change, change it there.

---

## 1. Purpose

Documents the CSV import contract, its error reporting, and the age/gender
category boards, all as implemented in this repo. Replaces an earlier
"fun awards" plan — those sub-leaderboards (fastest parent, first-timer,
rigid/steel bike) were cut before the form launched. Age/gender categories
are the only leaderboards for 2026.

---

## 2. Input

A CSV matching `docs/wordpress-registration-form.md` section 4. Summarized:

| Column | Values |
| --- | --- |
| `bib` | integer |
| `name` | text |
| `wave` | `A` \| `B` \| `C` |
| `age` | integer |
| `gender` | `male` \| `female` \| `nonbinary` \| `undisclosed` |

Header-driven parsing — column order is free, column names are fixed.

The file carries only riders who registered online — there's no row for a
day-of walk-up. Walk-up bibs are physical: a stack of packets held back from
printing, with the number already on each one. The operator adds a walk-up
in the app when they show up, typing the bib off their packet — see
implementation item 6.

Contact and fundraising fields are deliberately excluded from this CSV.
Everything imported here lands in the `raceState` snapshot, which syncs to
Redis and backs the public leaderboard, so the import surface stays as small
as scoring requires.

---

## 3. Age

`age` is collected directly on the registration form — a plain number, not a
date of birth. It is **not** re-derived or anchored to race day: whatever the
rider entered at registration is what ships, so a rider whose birthday falls
between registering and race day may be scored a year off from their true
age-on-race-day. Accepted tradeoff for a simpler form (see
`wordpress-registration-form.md` section 3's note); revisit only if this
turns out to matter for a real rider.

`lib/categories.ts`'s `parseAge` validates the raw string (a non-negative
whole number, or `null`); `getAgeCategory` applies the cutoffs below.

```yaml
age_categories:
  - id: junior
    logic: "age <= 18"
    note: "18 inclusive."
  - id: masters
    logic: "age >= 50"
  - id: adult
    logic: "everyone else"
```

---

## 4. Category Boards

```yaml
category_boards:
  - name: "Overall male"
    eligibility: "gender == 'male'"
    display_limit: 10
  - name: "Overall female"
    eligibility: "gender == 'female'"
    display_limit: 10
  - name: "Junior male (18U)"
    eligibility: "gender == 'male' and age_category == 'junior'"
    display_limit: 3
  - name: "Junior female (18U)"
    eligibility: "gender == 'female' and age_category == 'junior'"
    display_limit: 3
  - name: "Masters (50+)"
    eligibility: "age_category == 'masters'"
    display_limit: 3
    note: >
      One combined (all-genders) board — a gendered split shipped once and
      was reverted, too many near-identical boards for a field this size.

ranking_rules:
  sort_key: elapsed_time   # finish time minus that rider's own wave start
  tiebreak: bib asc        # stable, deterministic across renders
  excluded: >
    Entries with no wave assigned (unresolved unknown bibs) have no elapsed
    time and are excluded from every board until resolved.
  gendered_boards: >
    Only gender == 'male' or 'female' appear in gendered boards. 'nonbinary'
    and 'undisclosed' riders are still ranked in every non-gendered board
    (Masters, overall results).
```

This is the pre-2026 baseline, unchanged by the fun-awards cut. The exact
cutoffs and board list for 2026 are still open — see
`docs/wordpress-registration-form.md` section 5.

### 4a. Board display

A UI decision, not a data one — `CategoryLeaderboardGrid.tsx`.

**Boards cap their default display per board, not one shared number.** A
small field doesn't need as many rows shown as a large one to feel complete:
Masters top 3, Junior (each gender) top 3, Overall (each gender) top 10.
"Show all" still expands to the full field on any board.

---

## 5. Decisions

### Resolved

- [x] **`gender == "Prefer not to say"` handling** — exported as `undisclosed`,
  stored distinctly from `nonbinary`. Neither appears in gendered boards;
  both are ranked normally everywhere else.
- [x] **Fun award categories — cut.** Not on the live form. Age/gender
  leaderboards only for 2026. See section 1.
- [x] **`JUNIOR_AGE_CUTOFF` value** — 18, inclusive.
- [x] **CSV column order** — free. The importer is header-driven. Column
  *names* are fixed (section 2).
- [x] **Name is a single field** — the registration form collects one Name
  question, not first/last. The app stores and displays it as one string
  throughout (roster, results, exports): riders are never looked up or
  displayed by last name, so nothing needs the split.
- [x] **A registered row missing a required field** — imports, flagged, and is
  fixed in the app; it is not dropped and never gets a substituted value. Only
  a row with no bib is refused, because nothing can be attached to it. See
  section 6a.
- [x] **Bib assignment** — handled by the registration-side script the week
  before the ride, after registration closes.

### Still open

- [ ] **Minimum entrants per board** — a board with one eligible rider is
  arguably worse than no board. Decide a floor, or accept single-entrant
  boards.
- [ ] **Age/gender category cutoffs and board list for 2026** — see
  `docs/wordpress-registration-form.md` section 5.

---

## 6. Implementation Status

Items below are all implemented in this repo (`lib/csvImport.ts`,
`lib/db.ts`, `lib/categories.ts`, `components/RegistrationTab.tsx`).
Kept as a reference for the shape of the work, not a todo list.

1. **CSV importer** — `lib/csvImport.ts`. Header-driven, RFC-4180 parsing.
   Rejects a file whose header doesn't carry the expected column names, by
   name — the likeliest race-morning mistake is uploading last year's export,
   and that fails loudly rather than importing nothing.

   Test files are in `fixtures/`, with a table in `fixtures/README.md` saying
   what each row proves — the good file, one-problem-per-row, shuffled column
   order, CRLF + BOM, and the 2024 files as a wrong-file negative test.

2. **`Registrant` shape** — `lib/db.ts`. `name` (single field), `age` (raw
   string, validated by `parseAge`), `gender` (four tokens plus flaggable
   invalid values), `wave`.

3. **Walk-up registration** — `components/RegistrationTab.tsx`. No reserved-
   bib concept: the CSV carries only riders who registered online, and a
   walk-up is added the same way as any late manual entry, through the
   ordinary Add registrant form, typing the bib that's already printed on
   their packet. The app never tracks which physical bibs exist or which are
   still unhanded-out — that's the responsibility of whoever's holding the
   stack of packets, not this app.

   An earlier version of this modeled reserved bibs as `status: spare`
   registrants: the CSV pre-declared day-of numbers, the app tracked which
   were unclaimed, and a lookup guard kept an unclaimed one from silently
   matching a mistyped bib at record time. Dropped — there's no threat that
   guard was protecting against once the bib itself is just a physical
   object handed to a rider.

### Constraints that carry over

- **Age never reaches the client, ungrouped.** `computeCategoryBuckets`
  returns plain `Entry[]` precisely so the public page can render boards
  without registrant data in the bundle. New boards must follow the same
  rule: bucket server-side, ship `Entry[]`.
- **Ranking is by elapsed time, always.** With staggered wave starts, order of
  finish and order of elapsed time are different orderings.

---

## 6a. Import Reporting

Nothing about an import is silent.

### Take every row that has a bib

A row is refused only when it has no bib. There is nothing to attach a
correction to, and no rider will appear at the start line under a number that
doesn't exist. Everything else imports and carries its problem with it: a
missing wave or age is a rider to chase down before the gun, not a rider to
delete.

| Problem | Tier | Effect if left unfixed |
| --- | --- | --- |
| No bib | refused | Not imported. Fix in the source file and re-upload. |
| Bib already used by an earlier row | blocks scoring | The later row silently overwrites the earlier one and a rider vanishes. |
| Wave missing or not A/B/C | blocks scoring | No elapsed time. The rider finishes unranked. |
| Name missing | blocks results | Nothing to put on the results sheet or the podium. |
| `age` missing or not a whole number | blocks awards | Absent from age-based boards. Never substitute a placeholder — a plausible-looking fake age files the rider into the wrong category. |
| `gender` missing or not one of the four tokens | blocks awards | Absent from gendered boards. |

### Summarize the upload

Plain counts, named. After a 120-row file:

```
118 of 120 riders imported.
  1 rider with an invalid wave — can't be scored until fixed
  3 ages missing or invalid — no age categories for them
  2 rows couldn't be imported (rows 44, 91 — no bib)
```

A panel on the Registration tab, not an `alert()`. The operator works through
this list; a dialog they dismiss once is gone. Collapsible, so a roster they
have decided is good enough stops nagging.

The refused rows are the one part that can't be recovered after the fact —
they aren't in the roster to be looked up — so name their row numbers here.

### Flag them on the roster

Every problem above except "no bib" belongs to a rider who is in the table, so
mark the row and say which field.

**Derive the flags, don't store them.** Every one of these is visible in the
record itself — a missing age is an empty `age`, an invalid wave is a null
`wave`. One function over a `Registrant` returns its problems; the roster
marks rows with it and the summary counts the same function's output across
the roster, so the two can't disagree. No new persisted field, no snapshot
growth, no migration, and the flag clears itself the moment the field is
fixed.

### Checklist interaction

`SetupChecklist`'s "Load Registrants" panel ticks on `registrantCount > 0`
unless any rider carries a **blocks scoring** problem — that's the one tier
that makes the race unscoreable. Blocks-results and blocks-awards problems
show on the roster but don't hold the tick.

---

## 7. Out of Scope

- The registration form itself — `docs/wordpress-registration-form.md`
- Timing app backup/sync architecture — `docs/race-readiness-design.md`
- Route details, podium/ceremony format
