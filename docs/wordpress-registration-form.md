# EBDC 2026 Registration Form — Build Spec

**Status:** Approved for implementation
**Owner:** WordPress site
**Companion doc:** `docs/fun-awards-timing.md` (timing-app side — leaderboard
logic. You don't need it to build the form; it consumes the CSV defined in
section 4 below.)

---

## 1. Purpose

Update the EBDC registration form from its 2024 version to 2026. Two things
are changing:

1. **Stale copy** — fee, ride formats, and event date.
2. **New optional fields** — a short, skippable "fun award" section that feeds
   new sub-leaderboards in the timing app, without adding friction to core
   registration.

The form build produces two deliverables: the live form, and a CSV export in
the exact format specified in **section 4**. That CSV is the only thing the
timing app ingests.

---

## 2. Copy Changes (Setup/Intro Text)

| Item             | 2024 (current live)                     | 2026 (new)                             |
| ---------------- | --------------------------------------- | -------------------------------------- |
| Registration fee | $85                                     | $100                                   |
| Ride formats     | Mass start + 2-week virtual ride window | Mass start only — virtual ride removed |
| Event date       | September 28, 2024                      | October 10, 2026                       |

All other intro copy (location, QOM/KOM segment, BBQ, t-shirt, Strava linkage, no-closures notice, community/fun/fundraising framing) carries over unchanged.

### Full intro copy block (for WordPress page body, above the form)

```
The East Bay Dirt Classic is $100 per rider.

There will be a one day event with a mass start at 9 am, from 5656 Weaver Place, Oakland, CA 94619 on October 10. Route is still to be determined!

Prizes from our sponsors will be awarded to participants who complete the entire course in the shortest elapsed time.

There will also be one QOM/KOM segment on the course for which there will be a separate prize.

There will be an after-event pool party including barbecue, refreshments and presentation of awards on October 10th, 2026. All registered riders will receive a limited edition, highly coveted, 2026 EBDC t-shirt. We recommend a cross-country style MTB or gravel bike for this event.

Participants may link their Strava account to appear on our leaderboard.

Note – there are no road or trail closures for this event. All riders should be in control and respect all other users at all times. We want riders to challenge themselves, but for it to live on we have to keep our priority on the community, the fun, and the fundraising.

Registration fee: $100
```

---

---

## 3. Form Fields

Authoritative field list, order, types, and options.

`id` is the field name. Where a field has an `export_map`, the CSV must carry
the **mapped value**, not the display label — the timing app validates against
those exact tokens and silently drops rows it can't match.

Fields marked `note: "Registration only"` are collected for your purposes but
are **excluded from the timing CSV** — see section 4.

```yaml
form_fields:
  - section: rider_info
    label: "Rider Info"
    fields:
      - id: first_name
        label: "First Name"
        type: text
        required: true
        note: "Collected separately from last name — the timing app stores them as distinct fields and never splits a combined name."
      - id: last_name
        label: "Last Name"
        type: text
        required: true
      - id: email
        label: "Email"
        type: email
        required: true
        note: "Registration only — excluded from the timing export. See section 8."
      - id: dob
        label: "Date of Birth"
        type: date
        display_format: "MM/DD/YYYY"
        export_format: "YYYY-MM-DD"
        required: true
        note: "Replaces old Age field. Source of truth for Masters 50+ and junior derivation. Display as MM/DD/YYYY if preferred, but export ISO — see section 8."
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
          Determines eligibility for gendered podiums (overall men's/women's,
          junior men's/women's). Non-binary and Prefer-not-to-say are stored
          as distinct values, not collapsed together — see section 6, RESOLVED.
      - id: city
        label: "City"
        type: text
        required: true
        note: "Registration only — excluded from the timing export."
      - id: emergency_contact
        label: "Emergency Contact (name/phone)"
        type: text
        required: true
        note: "Registration only — excluded from the timing export."

  - section: event_details
    label: "Event Details"
    fields:
      - id: bbq_attending
        label: "Do you plan to attend the BBQ on October 10?"
        type: single_select
        required: true
        options: ["Yes", "No"]
        note: "Registration only — excluded from the timing export."
      - id: wave
        label: "Please select the wave most appropriate for you, based on last year's time or your estimated time for this year:"
        type: single_select
        required: true
        options:
          - "A – 1hr 30 to 2hr"
          - "B – 2hr to 2hr 25"
          - "C – over 2hr 25"
        export_map:
          "A – 1hr 30 to 2hr": A
          "B – 2hr to 2hr 25": B
          "C – over 2hr 25": C
        note: >
          Export the bare letter only. The timing app validates against
          exactly A/B/C and silently drops any row it cannot match.
        help_text: >
          Waves are seeded by pace, fastest riders first — this keeps faster
          riders from getting stuck passing slower traffic on course. It has
          no bearing on your results: every rider is ranked individually by
          start-to-finish time, regardless of wave. If you're not sure which
          wave to pick, go with whichever feels right — ride with friends,
          adjust for how you're feeling, whatever works.
      - id: tshirt_size
        label: "T-Shirt size"
        type: single_select
        required: true
        options: []  # carry over existing size list from 2024 form, unchanged
        note: "Registration only — excluded from the timing export."

  - section: fun_award_categories
    label: "Fun Award Categories"
    optional_section: true
    intro_text: >
      These are just for fun — answer any or all, or skip the whole section.
      It has no effect on your official time or the main podiums.
    fields:
      - id: first_gravel_race
        label: "Is this your first-ever gravel race?"
        type: single_select
        required: false
        options: ["Yes", "No", "Prefer not to say"]
        export_map: { "Yes": "yes", "No": "no", "Prefer not to say": "" }
        note: "OPEN QUESTION: 'first-ever' vs 'first at EBDC' not finalized — see section 6."
      - id: is_parent
        label: "Are you a parent? (...but are you the fastest parent?)"
        type: single_select
        required: false
        options: ["Yes", "No", "Prefer not to say"]
        export_map: { "Yes": "yes", "No": "no", "Prefer not to say": "" }
      - id: rigid_bike
        label: "Are you riding a rigid bike?"
        type: single_select
        required: false
        options: ["Yes", "No", "Not sure"]
        export_map: { "Yes": "yes", "No": "no", "Not sure": "unsure" }
      - id: steel_bike
        label: "Are you riding a steel bike?"
        type: single_select
        required: false
        options: ["Yes", "No", "Not sure"]
        export_map: { "Yes": "yes", "No": "no", "Not sure": "unsure" }
        note: "Independent of rigid_bike — a rider can qualify for both awards."

  - section: fundraising
    label: "Fundraising"
    fields:
      - id: donation_amount
        label: "Extra ACCFB donation/raffle tickets"
        type: single_select_with_custom
        required: false
        options: ["Nothing", "$20", "$40", "$60"]
        custom_option:
          label: "Custom amount"
          type: text
        note: "Registration only — excluded from the timing export."
        intro_text: >
          Our ultimate goal is to raise as much money as we can for the
          Alameda County Community Food Bank. The ACCFB provides food
          support to 1 out of every 6 residents in Alameda County in a
          given year, and 97% of the funds they raise go directly into
          buying and distributing food. Could you add an additional
          donation to your registration, which will be fully donated
          to the ACCFB? Extra donations will enter you in our BBQ raffle
          for the great swag donated by our sponsors! You must be
          present to win these prizes.
```

Removed from the 2024 form (not carried forward): `ride_format` field
("Mass Start or Virtual Ride?") — no longer applicable.

## 4. CSV Export Format (the timing app's only input)

This is the **only** file the timing app ingests. It is a projection of the
registration data, not the full export.

**Format:** UTF-8, one header row, one row per bib, RFC-4180 quoting
(any field containing a comma, quote, or newline must be double-quoted;
embedded quotes doubled). Column order is free — the importer keys off
header names — but the names below are exact and case-sensitive.

"Required" below applies to `status: registered` rows. Spare rows carry a
`bib` and nothing else — see "Bib assignment and spare bibs".

| Column | Values | Required | Notes |
| --- | --- | --- | --- |
| `bib` | integer | yes | Assigned after registration closes. Leading zeros are stripped on import. |
| `status` | `registered` | `spare` | no | Marks reserved day-of bibs. Absent column or blank value is treated as `registered`. |
| `first_name` | text | yes | Never a combined name. |
| `last_name` | text | yes | |
| `wave` | `A` \| `B` \| `C` | yes | Bare letter, not the display label. |
| `dob` | `YYYY-MM-DD` | yes | ISO only. |
| `gender` | `male` \| `female` \| `nonbinary` \| `undisclosed` | yes | Lowercase tokens. |
| `first_gravel_race` | `yes` \| `no` \| *(blank)* | no | Blank = skipped or declined. |
| `is_parent` | `yes` \| `no` \| *(blank)* | no | |
| `rigid_bike` | `yes` \| `no` \| `unsure` \| *(blank)* | no | Only `yes` is award-eligible. |
| `steel_bike` | `yes` \| `no` \| `unsure` \| *(blank)* | no | Only `yes` is award-eligible. |

### Example

```csv
bib,status,first_name,last_name,wave,dob,gender,first_gravel_race,is_parent,rigid_bike,steel_bike
1,registered,Sarah,Johnson,A,1992-03-15,female,no,yes,no,yes
2,registered,Michael,Chen,A,1988-07-22,male,yes,no,yes,yes
3,registered,"Mary Jo","Van Der Berg",B,1980-01-02,female,,,unsure,no
4,registered,Alex,Rivera,C,2009-06-30,nonbinary,yes,no,no,no
151,spare,,,,,,,,,
```

Row 3 is the one to look at: a multi-word first *and* last name, both quoted,
plus two skipped optional answers as empty fields that still hold their
position. Row 151 is a reserved spare — bib and status only.

### Bib assignment and spare bibs

Bibs are assigned by the registration-side script the week before the ride,
after registration closes — the same run that prints each rider's release
form with their number and contact info. That script produces this CSV.

The CSV carries **both** assigned and spare bibs:

- **Assigned bibs** — one row per registered rider, `status` = `registered`,
  all columns populated as described above.
- **Spare bibs** — the numbers held back for day-of walk-ups. One row each,
  `status` = `spare`, `bib` populated, **every other column left blank**.
  Don't invent placeholder names or dates; blank is the signal.

A walk-up rider is handed a spare bib at the line, and the operator fills in
their details in the app against that already-reserved number. The rider is
then eligible for every board on the same terms as someone who registered
online — the app's add-registrant form collects the same fields as the web
form, including date of birth and the fun-award questions. Nothing further is
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

These need answers before the form goes live:

- [ ] **Wave time cutoffs** — currently reusing last year's brackets
  (A – 1hr 30 to 2hr / B – 2hr to 2hr 25 / C – over 2hr 25). Confirm for 2026
  or supply new ones.
- [ ] **`first_gravel_race` wording** — "first-ever gravel race anywhere" or
  "first time at EBDC"? Copy-only decision, no effect on the export format.
  Worth noting that "first at EBDC" is checkable against last year's roster
  and "first-ever" is honor system.

Already settled, for reference:

- **Gender** exports as four distinct values (`male`, `female`, `nonbinary`,
  `undisclosed`) rather than collapsing the last two together.
- **Bib assignment** happens in the registration-side script the week before
  the ride — see section 4.
- **Column order** in the CSV is free; column *names* are fixed.

---

## 6. Out of Scope

- Route details (TBD separately)
- Leaderboard and award logic — see `docs/fun-awards-timing.md`
- Timing app backup/sync architecture — see `docs/race-readiness-design.md`
- Podium/award ceremony format itself
