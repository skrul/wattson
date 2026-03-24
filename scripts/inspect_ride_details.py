#!/usr/bin/env python3
"""Extract interesting fields from ride details JSON for each discipline."""
import json
import sqlite3
import os
import sys

db_path = os.path.expanduser("~/Library/Application Support/com.skrul.wattson/wattson.db")
conn = sqlite3.connect(db_path)

disciplines = [r[0] for r in conn.execute("SELECT DISTINCT discipline FROM workouts ORDER BY discipline").fetchall()]

for disc in disciplines:
    print(f"=== {disc} ===")
    row = conn.execute(
        "SELECT raw_ride_details_json FROM workouts WHERE discipline=? AND raw_ride_details_json IS NOT NULL LIMIT 1",
        (disc,),
    ).fetchone()
    if not row:
        print("  (no ride details)\n")
        continue

    data = json.loads(row[0])
    ride = data.get("ride", {})

    interesting = {
        "description": ride.get("description"),
        "difficulty_estimate": ride.get("difficulty_estimate"),
        "difficulty_rating_avg": ride.get("difficulty_rating_avg"),
        "difficulty_rating_count": ride.get("difficulty_rating_count"),
        "difficulty_level": ride.get("difficulty_level"),
        "overall_rating_avg": ride.get("overall_rating_avg"),
        "overall_rating_count": ride.get("overall_rating_count"),
        "total_ratings": ride.get("total_ratings"),
        "total_workouts": ride.get("total_workouts"),
        "language": ride.get("language"),
        "location": ride.get("location"),
        "is_explicit": ride.get("is_explicit"),
        "is_outdoor": ride.get("is_outdoor"),
        "equipment_tags": ride.get("equipment_tags"),
        "muscle_group_score": ride.get("muscle_group_score"),
    }

    # Top-level keys outside of ride
    top_keys = [k for k in data.keys() if k != "ride"]
    interesting["_top_level_keys"] = top_keys

    # Playlist/music
    if "playlist" in data:
        pl = data["playlist"]
        if "songs" in pl and len(pl["songs"]) > 0:
            interesting["_sample_song"] = {
                "title": pl["songs"][0].get("title"),
                "artists": [a.get("artist_name") for a in pl["songs"][0].get("artists", [])],
            }
            interesting["_playlist_song_count"] = len(pl["songs"])

    # Class types
    if "class_types" in data:
        interesting["class_types"] = [{"name": ct.get("name")} for ct in data["class_types"]]

    # Target metrics
    if "target_metrics_data" in data:
        tmd = data["target_metrics_data"]
        if isinstance(tmd, dict):
            interesting["_target_metrics_keys"] = list(tmd.keys())

    # Averages/segments
    if "averages" in data:
        interesting["_averages"] = data["averages"]
    if "segments" in data:
        seg = data["segments"]
        if isinstance(seg, dict):
            interesting["_segments_keys"] = list(seg.keys())

    print(json.dumps(interesting, indent=2))
    print()

conn.close()
