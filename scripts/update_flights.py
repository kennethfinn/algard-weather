#!/usr/bin/env python3
"""Collect two public feeds for the static SVG flight page."""
import json
import math
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

LAT, LON = 58.8767, 5.6378  # Stavanger lufthavn, Sola (SVG)
RADIUS_KM = 200
HEADERS = {"User-Agent": "algard-weather/1.0 (weather.didwell.no)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=25) as response:
        return response.read()


def distance_km(lat, lon):
    a = math.sin(math.radians(lat - LAT) / 2) ** 2 + math.cos(math.radians(LAT)) * math.cos(math.radians(lat)) * math.sin(math.radians(lon - LON) / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(a)))


def collect():
    now = datetime.now(timezone.utc)
    # API radius uses nautical miles; final distance is checked in kilometers.
    feed = json.loads(get(f"https://api.adsb.lol/v2/point/{LAT}/{LON}/109"))
    if not isinstance(feed.get("ac"), list):
        raise ValueError("ADS-B response has no aircraft list")
    aircraft = []
    for ac in feed["ac"]:
        lat, lon = ac.get("lat"), ac.get("lon")
        if not isinstance(lat, (float, int)) or not isinstance(lon, (float, int)):
            continue
        distance = distance_km(lat, lon)
        if distance > RADIUS_KM or ac.get("seen_pos", 999) > 60 or ac.get("alt_baro") == "ground":
            continue
        aircraft.append({k: v for k, v in {
            "hex": ac.get("hex"), "flight": (ac.get("flight") or "").strip(),
            "registration": ac.get("r"), "type": ac.get("t"),
            "description": ac.get("desc"), "altitude_ft": ac.get("alt_baro"),
            "lat": lat, "lon": lon, "distance_km": round(distance),
        }.items() if v is not None})
    aircraft.sort(key=lambda ac: ac["distance_km"])

    xml = ET.fromstring(get("https://asrv.avinor.no/XmlFeed/v1.0?airport=SVG&TimeFrom=0&TimeTo=4&serviceType=E"))
    if xml.tag != "airport" or xml.attrib.get("name") != "SVG":
        raise ValueError("Unexpected Avinor airport response")
    flights_node = xml.find("flights")
    if flights_node is None:
        raise ValueError("Avinor response has no flights node")
    flights = []
    for node in flights_node.findall("flight"):
        direction = node.findtext("arr_dep")
        scheduled = node.findtext("schedule_time")
        if direction not in ("A", "D") or not scheduled:
            continue
        time = datetime.fromisoformat(scheduled.replace("Z", "+00:00"))
        if not now <= time < now + timedelta(hours=4):
            continue
        status = node.find("status")
        flights.append({
            "id": node.findtext("flight_id") or "—",
            "direction": direction,
            "airport": node.findtext("airport") or "—",
            "scheduled": scheduled,
            "status_code": status.attrib.get("code") if status is not None else None,
            "status_time": status.attrib.get("time") if status is not None else None,
        })
    flights.sort(key=lambda flight: flight["scheduled"])
    return {"updated_at": now.isoformat().replace("+00:00", "Z"), "airport": "SVG",
            "radius_km": RADIUS_KM, "aircraft": aircraft, "flights": flights,
            "avinor_last_update": flights_node.attrib.get("lastUpdate")}


if __name__ == "__main__":
    try:
        with open(sys.argv[1], "w", encoding="utf-8") as out:
            json.dump(collect(), out, ensure_ascii=False, separators=(",", ":"))
    except Exception as exc:
        print(f"Flight data update failed: {exc}", file=sys.stderr)
        sys.exit(1)
