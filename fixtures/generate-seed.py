"""Regenerates fixtures/seed/: two backup JSONs of a seeded race, for the
operator's Settings > Import backup and for the dev preview at
/dev/public-preview. Built from registrants-2026.csv with a fixed seed, so
re-running reproduces the same files.

  - ebdc-seed-midrace.json: the race at 11:20, partway through.
  - ebdc-seed-final.json: everyone who finished, 8 riders who did not, a tied
    place, and two unresolved finishers (UNK-1 and an unregistered bib 999).

Usage: python3 fixtures/generate-seed.py
"""

import csv, json, random, uuid
from pathlib import Path

HERE = Path(__file__).parent
from datetime import datetime, timedelta, timezone

random.seed(1010)
PDT = timezone(timedelta(hours=-7))
START = {"A": datetime(2026, 10, 10, 9, 0, 0, tzinfo=PDT),
         "B": datetime(2026, 10, 10, 9, 15, 0, tzinfo=PDT),
         "C": datetime(2026, 10, 10, 9, 30, 0, tzinfo=PDT)}
# (mean, sd) elapsed minutes per wave: the form's brackets are A 1:30-2:00,
# B 2:00-2:25, C over 2:25.
PACE = {"A": (103, 11), "B": (129, 13), "C": (156, 19)}

riders = []
with open(HERE / "registrants-2026.csv", newline="") as f:
    for r in csv.DictReader(f):
        riders.append({"bib": str(int(r["bib"])), "name": r["name"], "wave": r["wave"],
                       "age": r["age"], "gender": r["gender"]})

def elapsed_min(r):
    mean, sd = PACE[r["wave"]]
    m = random.gauss(mean, sd)
    age = int(r["age"]) if r["age"].isdigit() else 35
    if age >= 50: m *= 1.05
    if age <= 17: m *= 1.04
    if r["gender"] == "female": m *= 1.07
    return max(m, mean * 0.8)

results = []
for r in riders:
    if r["bib"] in ("14", "41", "63", "77", "88", "95", "99", "100"):  # did not finish
        continue
    sec = int(elapsed_min(r) * 60)
    results.append((r, sec))
# two riders finish on the same second, to show a tied place
a, b = results[10], results[11]
results[11] = (b[0], a[1]) if a[0]["wave"] == b[0]["wave"] else b

def fmt_hms(sec):
    sign = "-" if sec < 0 else ""
    sec = abs(sec)
    return f"{sign}{sec//3600}:{sec%3600//60:02d}:{sec%60:02d}"

def make_entries(cutoff):
    rows = []
    for r, sec in results:
        finish = START[r["wave"]] + timedelta(seconds=sec)
        if cutoff and finish > cutoff: continue
        rows.append((finish, r, sec))
    rows.sort(key=lambda x: x[0])
    entries = []
    unk = [(rows[6][0] + timedelta(seconds=40), "UNK-1", "Unknown rider"),
           (rows[20][0] + timedelta(seconds=25), "999", "Unknown rider")] if len(rows) > 21 else []
    merged = [(f, r, s) for f, r, s in rows] + [(f, {"bib": bib, "name": nm, "wave": None}, None) for f, bib, nm in unk]
    merged.sort(key=lambda x: x[0])
    for i, (finish, r, sec) in enumerate(merged, 1):
        local = finish.astimezone(PDT)
        entries.append({
            "id": i, "bib": r["bib"], "wave": r["wave"], "name": r["name"],
            "finishTime": local.strftime("%-I:%M:%S %p"),
            "finishTimeMs": int(finish.timestamp() * 1000),
            "elapsedTime": fmt_hms(sec) if sec is not None else "N/A",
            "elapsedMs": sec * 1000 if sec is not None else None,
            "timestamp": finish.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        })
    return entries

def backup(entries, label_suffix):
    return {
        "exportDate": "2026-10-10T18:30:00.000Z",
        "event": "East Bay Dirt Classic - C510",
        "raceId": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"ebdc-seed-{label_suffix}")),
        "raceLabel": f"East Bay Dirt Classic – 10/10/2026 ({label_suffix})",
        "raceCreatedAt": "2026-10-09T05:14:51.582Z",
        "raceDate": "2026-10-10",
        "waveStartAdopted": {},
        "waveStartTimes": {w: START[w].astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z") for w in "ABC"},
        "waveTimesConfirmed": True,
        "registrants": [[r["bib"], {**r}] for r in riders],
        "entryCounter": len(entries),
        "entries": entries,
    }

mid = make_entries(datetime(2026, 10, 10, 11, 20, 0, tzinfo=PDT))
final = make_entries(None)
out = HERE / "seed"
out.mkdir(exist_ok=True)
json.dump(backup(mid, "seed, mid-race"), open(out / "ebdc-seed-midrace.json", "w"), indent=1)
json.dump(backup(final, "seed, finished"), open(out / "ebdc-seed-final.json", "w"), indent=1)
for name, e in (("mid-race", mid), ("final", final)):
    ranked = [x for x in e if x["wave"]]
    print(name, "entries:", len(e), "ranked:", len(ranked), "unresolved:", len(e) - len(ranked))
print("registrants:", len(riders), "fastest:", min(x["elapsedTime"] for x in final if x["wave"]), "slowest:", max(x["elapsedTime"] for x in final if x["wave"]))
