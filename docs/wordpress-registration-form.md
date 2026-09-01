# EBDC 2026 Registration Form — Build Spec

**Status:** Live
**Owner:** WordPress site
**Companion doc:** `docs/registrant-import.md` (timing-app side — CSV import
and leaderboard logic. You don't need it to build the form; it consumes the
CSV defined in section 4 below.)

---

## 1. Purpose

Documents the live 2026 EBDC registration form and the CSV export it
produces, so the timing app's import contract stays in sync with what the
form actually collects. Prizes go to the fastest rider **in each age/gender
group** — the form collects a plain Age and Gender, not a fun-award
opt-in section.

The form produces two deliverables: the live form, and a CSV export in the
exact format specified in **section 4**. That CSV is the only thing the
timing app ingests.

---

## 2. Live Copy

```
The East Bay Dirt Classic is $100 per rider.

There will be a one day event with a mass start at 9 am, from 5656 Weaver
Place on October 10. Route is still to be determined! There will be a BBQ
pool party and presentation of awards after the event - bring your family!

Prizes from our sponsors will be awarded to participants who complete the
entire course in the shortest elapsed time for their age/gender group.

After you submit this registration, we'll provide you with a link to
connect your Strava account to our stats collecting app. There will be a
QOM/KOM Strava segment on the course for which there will be a separate
prize, and we'll throw up a leaderboard after the event to compare your
Strava times with others.

Note – there are no road or trail closures for this event. All riders
should be in control and respect all other users at all times. We want
riders to challenge themselves, but for it to live on we have to keep our
priority on the community, the fun, and the fundraising.
```

Strava linking happens after submission (a link the rider is given, not a
form field) and has no bearing on this app — it's a separate stats page, not
part of the timing/results pipeline.

---

## 3. Form Fields

Authoritative field list and order, as the live form collects them. Where a
field has an `export_map`, the CSV carries the **mapped value**, not the
display label — the timing app validates against those exact tokens. A value
it can't match doesn't lose the rider: the row imports and the operator gets
a named problem to fix by hand (`registrant-import.md` section 6a). That's a
repair job at the finish line, so export the mapped tokens.

Fields marked `note: "Registration only"` are collected for the
organizers' purposes but are **excluded from the timing CSV** — see
section 4.

```yaml
form_fields:
  - id: name
    label: "Name"
    type: text
    required: true
    note: >
      One combined field — the form doesn't collect first/last separately.
      The timing app stores it as a single string throughout (rosters,
      results, exports) rather than splitting it: riders are never looked
      up or displayed by last name, so there's nothing splitting would buy,
      and a split step is a chance to mis-parse a name the form never asked
      to have taken apart.
  - id: email
    label: "Email"
    type: email
    required: true
    note: "Registration only — excluded from the timing export."
  - id: age
    label: "Age"
    type: number
    required: true
    note: >
      A plain age, not date of birth. Whatever the rider enters is what
      ships — it isn't re-derived from a birthdate as of race day, so a
      rider whose birthday falls between registering and race day may be
      scored a year off from their age-on-race-day. Accepted as the
      tradeoff for a simpler form; not worth the friction of asking for a
      full birthdate.
  - id: city
    label: "City"
    type: text
    required: true
    note: "Registration only — excluded from the timing export."
  - id: emergency_contact
    label: "Emergency contact (name and phone)"
    type: text
    required: true
    note: "Registration only — excluded from the timing export."
  - id: gender
    label: "Gender"
    type: single_select
    required: true
    options: ["Male", "Female", "Non-binary", "Prefer not to say"]
    export_map:
      "Male": male
      "Female": female
      "Non-binary": nonbinary
      "Prefer not to say": undisclosed
    note: >
      Determines eligibility for gendered leaderboards. Non-binary and
      Prefer-not-to-say are stored as distinct values, not collapsed
      together — see section 5, RESOLVED.
  - id: wave
    label: "Start wave"
    type: single_select
    required: true
    options:
      - "A — 1hr 30 to 2hr"
      - "B — 2hr to 2hr 25"
      - "C — over 2hr 25"
    export_map:
      "A — 1hr 30 to 2hr": A
      "B — 2hr to 2hr 25": B
      "C — over 2hr 25": C
    note: >
      Export the bare letter only. Anything else imports as a rider with
      no wave, flagged on the roster — they can't be scored until an
      operator sets it by hand.
    help_text: >
      Waves are seeded by pace, fastest riders first — this keeps faster
      riders from getting stuck passing slower traffic on course. It has
      no bearing on your results: every rider is ranked individually by
      start-to-finish time, regardless of wave.
  - id: bbq_attending
    label: "Staying for the BBQ on October 10?"
    type: single_select
    required: true
    options: ["Yes", "No"]
    note: "Registration only — excluded from the timing export."
  - id: tshirt_size
    label: "T-Shirt size"
    type: single_select
    required: true
    options: []  # carry over existing size list, unchanged
    note: "Registration only — excluded from the timing export."
  - id: donation_amount
    label: "Extra donation"
    type: single_select_with_custom
    required: false
    options: ["Nothing", "$20", "$40", "$60"]
    custom_option:
      label: "Other amount"
      type: text
    note: "Registration only — excluded from the timing export."
```

Removed from the 2024 form (not carried forward): `ride_format` field
("Mass Start or Virtual Ride?") — no longer applicable.

Not on the live form (an earlier draft of this spec proposed a "Fun Award
Categories" section — first-timer, parent, rigid bike, steel bike questions.
Cut before launch; age/gender leaderboards are the only leaderboards for
2026. See `docs/registrant-import.md`.

---

## 4. CSV Export Format (the timing app's only input)

This is the **only** file the timing app ingests. It is a projection of the
registration data, not the full export.

**Format:** UTF-8, one header row, one row per bib, RFC-4180 quoting
(any field containing a comma, quote, or newline must be double-quoted;
embedded quotes doubled). Column order is free — the importer keys off
header names — but the names below are exact and case-sensitive.

| Column | Values | Required | Notes |
| --- | --- | --- | --- |
| `bib` | integer | yes | Assigned after registration closes. Leading zeros are stripped on import. |
| `name` | text | yes | One combined field — see section 3. |
| `wave` | `A` \| `B` \| `C` | yes | Bare letter, not the display label. |
| `age` | integer | yes | As entered on the form — not derived from a birthdate. |
| `gender` | `male` \| `female` \| `nonbinary` \| `undisclosed` | yes | Lowercase tokens. |

### Example

```csv
bib,name,wave,age,gender
1,Sarah Johnson,A,34,female
2,Michael Chen,A,38,male
3,"Mary Jo Van Der Berg",B,46,female
4,Alex Rivera,C,17,nonbinary
```

Row 3 is the one to look at: a name with an internal comma or quote needs
RFC-4180 quoting/escaping, same as any other field.

### Bib assignment

Bibs are assigned by the registration-side script the week before the ride,
after registration closes — the same run that prints each rider's release
form with their number and contact info. That script produces this CSV, and
it carries only riders who registered online; there's no reserved-bib row for
day-of walk-ups.

Walk-up numbers are physical, not data — a stack of bib packets held back
from printing, with the number already on each one. A walk-up rider is
handed one at the line, and the operator adds them in the app like any other
registrant, typing the bib that's already on their packet. Nothing further is
needed from the registration side.

### Deliberately excluded

`email`, `emergency_contact`, `city`, `bbq_attending`, `tshirt_size`,
`donation_amount`.

Everything in this file is loaded into the race snapshot, which syncs to
cloud storage and backs the public leaderboard page. Timing has no use for
contact or fundraising data, so it stays out of that blast radius entirely
and lives only in WordPress.

---

## 5. Open Questions

- [ ] **Age/gender category cutoffs and leaderboard list for 2026** — the
  pre-existing five boards (Overall male/female, Junior male/female 18U,
  Masters 50+ combined) are the baseline until decided otherwise. See
  `docs/registrant-import.md` section 4.
- [ ] **Wave time cutoffs** — currently reusing last year's brackets
  (A – 1hr 30 to 2hr / B – 2hr to 2hr 25 / C – over 2hr 25). Confirm for 2026
  or supply new ones.

Already settled, for reference:

- **Gender** exports as four distinct values (`male`, `female`, `nonbinary`,
  `undisclosed`) rather than collapsing the last two together.
- **Age is collected directly**, not derived from a date of birth — see
  section 3's note on that tradeoff.
- **Name is a single field**, not split into first/last — see section 3.
- **Bib assignment** happens in the registration-side script the week before
  the ride — see section 4.
- **Column order** in the CSV is free; column *names* are fixed.
- **Fun award questions — cut.** Not part of the live form; age/gender
  leaderboards only for 2026.

---

## 6. Out of Scope

- Route details (TBD separately)
- Leaderboard logic — see `docs/registrant-import.md`
- Timing app backup/sync architecture — see `docs/race-readiness-design.md`
- Podium/award ceremony format itself
- Strava integration (a separate post-submission stats page, not part of
  the timing app)
