#!/usr/bin/env python3
"""Regenerates registrants-2026.csv and its shuffled/CRLF+BOM siblings.

Bibs 001-013 and 017 are pinned to specific people and values — the parsing
and age-boundary proofs documented in fixtures/README.md. Every other bib is
procedurally generated with a fixed seed, so re-running this script
reproduces the exact same file. registrants-2026-problems.csv and legacy/
are hand-authored negative tests and untouched by this script.

Usage: python3 fixtures/generate.py
"""

import codecs
import csv
import random
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent
SEED = 2026

HEADER = [
    "bib", "first_name", "last_name", "wave", "dob", "gender",
    "first_gravel_race", "is_parent", "rigid_bike", "steel_bike",
]
SHUFFLED_HEADER = [
    "last_name", "first_name", "wave", "bib", "gender", "steel_bike",
    "rigid_bike", "dob", "is_parent", "first_gravel_race",
]

FIRST_MALE = ["James", "Robert", "John", "David", "William", "Carlos", "Kevin",
    "Brian", "Marcus", "Tyler", "Jordan", "Nathan", "Andre", "Felix", "Omar",
    "Diego", "Sam", "Ravi", "Hassan", "Miguel", "Elijah", "Gabriel", "Theo",
    "Owen", "Caleb", "Noah", "Lucas", "Mateo", "Julian", "Ezra", "Dominic",
    "Victor", "Isaac", "Simon", "Leo", "Adrian", "Cole", "Grant", "Ronald",
    "Walter", "Bruce", "Gary", "Douglas", "Roger", "Harold", "Frank",
    "Raymond", "Dennis", "Larry", "Wayne"]
FIRST_FEMALE = ["Sarah", "Emily", "Priya", "Nia", "Helen", "Dana", "Ines",
    "Ana", "Rachel", "Grace", "Olivia", "Sophia", "Mia", "Chloe", "Zoe",
    "Amara", "Leila", "Fatima", "Yuki", "Elena", "Jasmine", "Naomi", "Ruth",
    "Alice", "Diane", "Carol", "Judith", "Joan", "Sandra", "Donna",
    "Kathleen", "Sharon", "Cynthia", "Angela", "Brenda", "Emma", "Ava",
    "Isabella", "Layla", "Aaliyah", "Camila", "Valentina", "Luna", "Willow",
    "Hazel", "Nora", "Ellie", "Stella", "Freya", "Autumn"]
FIRST_NEUTRAL = ["Alex", "Jae", "Robin", "Quinn", "Rowan", "Sasha", "Morgan",
    "Casey", "Riley", "Skyler"]
LAST = ["Johnson", "Chen", "Rivera", "Okonkwo", "Raman", "Smith", "O'Brien",
    "Zero", "Webb", "Fletcher", "Ellery", "Marsh", "Park",
    "Delacroix-Mbeki", "Sousa", "Nakamura", "Harlow", "Adeyemi", "Lindqvist",
    "Okafor", "Barros", "Lindgren", "Sundqvist", "Ashworth", "Nguyen",
    "Patel", "Kowalski", "Dubois", "Ferreira", "Haddad", "Kim", "Suzuki",
    "Osei", "Mensah", "Ibarra", "Castillo", "Moreau", "Bianchi",
    "Kowalczyk", "Novak", "Petrov", "Andersen", "Larsen", "Hallgren",
    "Whitfield", "Ashby", "Pemberton", "Kestrel", "Rourke", "Sinclair",
    "Blackwood", "Fairweather", "Hollis", "Winslow", "Pryce", "Vance",
    "Merton", "Faulkner", "Whitmore", "Cassidy", "Rutherford"]

# Fixed proof rows — see fixtures/README.md for what each one is for.
FIXED_ROWS = {
    1: ["001", "Sarah", "Johnson", "A", "1992-03-15", "female", "no", "yes", "no", "yes"],
    2: ["002", "Michael", "Chen", "A", "1988-07-22", "male", "yes", "no", "yes", "yes"],
    3: ["003", "Mary Jo", "Van Der Berg", "B", "1980-01-02", "female", "", "", "unsure", "no"],
    4: ["004", "Alex", "Rivera", "C", "2009-06-30", "nonbinary", "yes", "no", "no", "no"],
    6: ["006", "Priya", "Raman", "A", "1996-02-29", "female", "no", "no", "yes", "no"],
    7: ["007", "Leading", "Zero", "C", "1985-12-01", "male", "no", "no", "no", "no"],
    8: ["008", "Siobhan", 'O"Brien', "B", "1991-08-19", "female", "yes", "yes", "unsure", "unsure"],
    10: ["010", "Marcus", "Webb", "A", "2007-10-10", "male", "no", "no", "no", "no"],
    11: ["011", "Nia", "Fletcher", "B", "2007-10-11", "female", "yes", "no", "no", "no"],
    12: ["012", "Robert", "Ellery", "C", "1976-10-10", "male", "no", "yes", "yes", "yes"],
    13: ["013", "Helen", "Marsh", "B", "1976-10-11", "female", "no", "yes", "no", "no"],
    17: ["017", "Tom", "Smith, Jr.", "C", "1969-05-04", "male", "no", "yes", "no", "yes"],
}
# Redundantly quoted (a bare space needs no quoting under RFC-4180) — proves
# the good file's quoting is optional-but-tolerated, distinct from the
# shuffled file where the same name comes through unquoted.
FORCE_QUOTE_BIBS = {"003"}


def dob_for_band(rng, band):
    if band == "junior":
        year = rng.randint(2008, 2016)
    elif band == "masters":
        year = rng.randint(1951, 1976)
    else:
        year = rng.randint(1977, 2007)
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    return f"{year:04d}-{month:02d}-{day:02d}"


def yn(rng, p_yes, p_unsure=0.0, p_blank=0.1):
    if rng.random() < p_blank:
        return ""
    r = rng.random()
    if r < p_yes:
        return "yes"
    if r < p_yes + p_unsure:
        return "unsure"
    return "no"


def generate_rows():
    rng = random.Random(SEED)
    rows = dict(FIXED_ROWS)
    used_names = set()

    for bib in range(1, 101):
        if bib in rows:
            continue

        r = rng.random()
        if r < 0.20:
            band = "junior"
            gender = rng.choices(["male", "female"], weights=[52, 48])[0]
        elif r < 0.38:
            band = "masters"
            gender = rng.choices(
                ["male", "female", "nonbinary", "undisclosed"], weights=[47, 47, 3, 3]
            )[0]
        else:
            band = "adult"
            gender = rng.choices(
                ["male", "female", "nonbinary", "undisclosed"], weights=[45, 45, 5, 5]
            )[0]

        first_pool = FIRST_MALE if gender == "male" else FIRST_FEMALE if gender == "female" else FIRST_NEUTRAL
        first = rng.choice(first_pool)
        last = rng.choice(LAST)
        while (first, last) in used_names:
            last = rng.choice(LAST)
        used_names.add((first, last))

        dob = dob_for_band(rng, band)
        wave = rng.choice(["A", "B", "C"])
        is_junior = band == "junior"
        rows[bib] = [
            f"{bib:03d}", first, last, wave, dob, gender,
            yn(rng, 0.25),
            "" if is_junior else yn(rng, 0.35),
            yn(rng, 0.15, 0.10),
            yn(rng, 0.15, 0.10),
        ]

    return [rows[b] for b in range(1, 101)]


def write_good(rows):
    # Plain LF — CRLF is deliberately reserved for registrants-2026-crlf-bom.csv
    # alone, so that fixture is the only one exercising CRLF handling.
    path = FIXTURES_DIR / "registrants-2026.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        w.writerow(HEADER)
        w.writerows(rows)
    # csv.QUOTE_MINIMAL won't quote a bare-space field, but the good file's
    # "Mary Jo" row is meant to be redundantly quoted — patch it in place.
    text = path.read_text(encoding="utf-8")
    text = text.replace("003,Mary Jo,Van Der Berg,", '003,"Mary Jo","Van Der Berg",')
    path.write_text(text, encoding="utf-8")
    print(f"wrote {path.name}: {len(rows)} rows")


def write_shuffled(rows):
    by_bib = {row[0]: dict(zip(HEADER, row)) for row in rows}
    path = FIXTURES_DIR / "registrants-2026-shuffled-columns.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        w.writerow(SHUFFLED_HEADER)
        for bib in sorted(by_bib):
            r = by_bib[bib]
            w.writerow([r[c] for c in SHUFFLED_HEADER])
    print(f"wrote {path.name}: {len(rows)} rows")


def write_crlf_bom():
    good_path = FIXTURES_DIR / "registrants-2026.csv"
    out_path = FIXTURES_DIR / "registrants-2026-crlf-bom.csv"
    lines = [l for l in good_path.read_text(encoding="utf-8").split("\n") if l != ""]
    crlf_content = "\r\n".join(lines) + "\r\n"
    with open(out_path, "wb") as f:
        f.write(codecs.BOM_UTF8)
        f.write(crlf_content.encode("utf-8"))
    print(f"wrote {out_path.name}")


if __name__ == "__main__":
    rows = generate_rows()
    write_good(rows)
    write_shuffled(rows)
    write_crlf_bom()
