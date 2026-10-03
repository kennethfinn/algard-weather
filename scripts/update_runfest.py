"""Public EQ Timing snapshot for RUNFEST, 3 October 2026. Standard library only."""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

EVENT = 80878
DATE = "2026-10-03"
API = f"https://live.eqtiming.com/api"
RACES = [
    {"id": "half", "name": "Halvmaraton · 21 km", "start": "11:30", "race_ids": [330057]},
    {"id": "10k", "name": "10 km", "start": "15:00", "race_ids": [330058, 333326]},
    {"id": "5k", "name": "5 km miks", "start": "17:00", "race_ids": [330059, 333328]},
    {"id": "women", "name": "5 km elite kvinner", "start": "18:15", "race_ids": [330059]},
    {"id": "men", "name": "5 km elite menn", "start": "18:35", "race_ids": [330059]},
]
UNTIMED = {333326, 333328}


def get(url):
    request = Request(url, headers={"User-Agent": "DidWell-Runfest/1.0 (https://weather.didwell.no/runfest.html)", "Accept": "application/json"})
    with urlopen(request, timeout=40) as response:
        return json.load(response)


def values(obj):
    return list(obj.values()) if isinstance(obj, dict) else obj


def pages(path):
    result, start = [], 1
    for _ in range(100):
        data = get(f"{API}/{path}?startAt={start}&count=500")
        if not isinstance(data, dict) or "Items" not in data:
            raise ValueError("Unexpected EQ Timing data")
        items = values(data["Items"])
        result.extend(items)
        total = int(data["TotalItems"])
        if len(result) >= total:
            return result
        if not items:
            raise ValueError("Incomplete EQ Timing page")
        start += len(items)
    raise ValueError("EQ Timing pagination did not finish")


def group(race_id, wave_id):
    if race_id == 330057:
        return "half"
    if race_id in (330058, 333326):
        return "10k"
    if wave_id == 452775:
        return "women"
    if wave_id == 438289:
        return "men"
    return "5k"


def entry(person, race_id, result=None):
    athlete = person.get("Utover") or {}
    stage = next((s for s in values(person.get("EtappeDeltaker") or {}) if s["Etappe"]["UID"] == race_id), {})
    wave = stage.get("Pulje") or person.get("Pulje") or {}
    category = person.get("Klasse") or {}
    state = next((flag for flag in ("DSQ", "DNF", "DNS", "DNC", "DNQ") if stage.get(flag)), None)
    time, rank, sort_time = None, None, None
    if result:
        code = result.get("StatusTekst")
        if code in ("DSQ", "DNF", "DNS", "DNC", "DNQ"):
            state = code
        elif code in ("TIME", "COMPLETED") and result.get("StasjonsOppsett", {}).get("Er_stopp"):
            state = "Fullført"
            if category.get("VisTider") and race_id not in UNTIMED:
                time = result.get("Formatert")
                sort_time = result.get("RangeringsTid")
                # Preserve the provider's class placing; do not invent a combined placing.
                rank = (result.get("Plassering") or {}).get("Klasse") or None
    if not state:
        state = "Uten tidtaking" if race_id in UNTIMED else "Påmeldt"
    anonymous = person.get("Anonym", False)
    return group(race_id, wave.get("UID")), {
        "id": f"{race_id}:{person['UID']}",
        "bib": stage.get("Startnummer") or person.get("Startnummer") or None,
        "name": "Anonym deltaker" if anonymous else athlete.get("NavnFormatert", ""),
        "club": "" if anonymous else (person.get("KlubbTeamFormatert") or ""),
        "class": category.get("Navn", "").strip(),
        "status": state, "time": time, "class_rank": rank, "sort_time": sort_time,
    }


def build():
    race_ids = sorted({r for group in RACES for r in group["race_ids"]})
    jobs = [(r, kind) for r in race_ids for kind in ("Startlist", "Result/Total") if kind == "Startlist" or r not in UNTIMED]
    with ThreadPoolExecutor(max_workers=3) as pool:
        feeds = dict(zip(jobs, pool.map(lambda job: pages(f"{job[1]}/{EVENT}/{job[0]}"), jobs)))
    groups = {r["id"]: {} for r in RACES}
    for race_id in race_ids:
        results = {x["Deltaker"]["UID"]: x for x in feeds.get((race_id, "Result/Total"), [])}
        people = {p["UID"]: p for p in feeds[(race_id, "Startlist")]}
        for uid, result in results.items():
            people.setdefault(uid, result["Deltaker"])
        for uid, person in people.items():
            if (person.get("Status") or {}).get("Visible") is False:
                continue
            key, row = entry(person, race_id, results.get(uid))
            if row["name"]:
                groups[key][row["id"]] = row
    races = []
    for race in RACES:
        rows = sorted(groups[race["id"]].values(), key=lambda p: (p["sort_time"] is None, p["sort_time"] or 0, p["bib"] or 999999, p["name"]))
        races.append({**race, "participants": rows})
    return {"event_date": DATE, "updated_at": datetime.now(timezone.utc).isoformat(), "source": f"https://live.eqtiming.com/{EVENT}", "races": races}


if __name__ == "__main__":
    data = build()
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "runfest-data.json")
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print("RUNFEST:", ", ".join(f"{r['name']}: {len(r['participants'])}" for r in data["races"]))
