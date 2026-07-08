"""
Import Spotify's official extended streaming history export into listening_events.

Parses Streaming_History_Audio_*.json files (skips Streaming_History_Video_*.json),
filters out podcasts/audiobooks and sub-30s plays, matches remaining entries to the
existing tracks table via spotify_track_uri, and inserts new listening_events rows
with source='extended_history'. Entries that can't be matched to a known track are
logged to unmatched_tracks.json instead of being auto-ingested.

Usage:
    uv run python ml/import/parse_extended_history.py --dry-run
    uv run python ml/import/parse_extended_history.py --dry-run --source-dir "C:\\path\\to\\export"
    uv run python ml/import/parse_extended_history.py
"""
import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

from dotenv import load_dotenv
from sqlalchemy import create_engine, insert
from sqlalchemy.orm import sessionmaker

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import ListeningEvent, Track

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

DEFAULT_USER_ID = 1
DEFAULT_SOURCE_DIR = r"C:\Users\aditm\Downloads\my_spotify_data\Spotify Extended Streaming History"
DEFAULT_UNMATCHED_OUTPUT = os.path.join(os.path.dirname(__file__), "unmatched_tracks.json")

MIN_MS_PLAYED = 30000
DEDUPE_TOLERANCE_SECONDS = 90
INSERT_BATCH_SIZE = 5000
PROGRESS_EVERY_ROWS = 50000


def find_audio_files(source_dir: str) -> list[str]:
    pattern = os.path.join(source_dir, "Streaming_History_Audio_*.json")
    return sorted(glob.glob(pattern))


def load_track_map(db) -> dict[str, int]:
    """spotify_track_id -> internal tracks.id"""
    rows = db.query(Track.spotify_track_id, Track.id).all()
    return {spotify_id: internal_id for spotify_id, internal_id in rows}


def load_existing_recently_played(db, user_id: int) -> dict[int, list[datetime]]:
    """internal track_id -> sorted played_at datetimes, recently_played source only"""
    rows = db.query(ListeningEvent.track_id, ListeningEvent.played_at).filter(
        ListeningEvent.user_id == user_id,
        ListeningEvent.source == "recently_played",
    ).all()
    existing = defaultdict(list)
    for track_id, played_at in rows:
        if played_at is not None:
            existing[track_id].append(played_at)
    for track_id in existing:
        existing[track_id].sort()
    return existing


def is_near_duplicate(existing_times: list[datetime], played_at: datetime, tolerance_seconds: int) -> bool:
    return any(abs((t - played_at).total_seconds()) <= tolerance_seconds for t in existing_times)


def parse_ts(ts_str: str) -> datetime:
    return datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--user-id", type=int, default=DEFAULT_USER_ID)
    parser.add_argument("--unmatched-output", default=DEFAULT_UNMATCHED_OUTPUT)
    args = parser.parse_args()

    files = find_audio_files(args.source_dir)
    if not files:
        print(f"No Streaming_History_Audio_*.json files found in {args.source_dir}")
        return
    print(f"Found {len(files)} audio history files in {args.source_dir}")

    db = SessionLocal()
    track_map = load_track_map(db)
    print(f"Loaded {len(track_map)} tracks from DB for matching")

    existing_recent = load_existing_recently_played(db, args.user_id)
    total_existing_recent = sum(len(v) for v in existing_recent.values())
    print(f"Loaded {total_existing_recent} existing recently_played events for dedup (user_id={args.user_id})")

    total_parsed = 0
    filtered_podcast_audiobook = 0
    filtered_short_play = 0
    matched = 0
    unmatched = 0
    deduped = 0
    to_insert = []
    seen_in_run = set()          # (raw_track_id, ts_str) - catches exact dupes across export files
    unmatched_agg: dict[str, dict] = {}

    earliest_ts = None
    latest_ts = None

    for file_idx, filepath in enumerate(files, 1):
        with open(filepath, encoding="utf-8-sig") as f:
            entries = json.load(f)

        for entry in entries:
            total_parsed += 1
            if total_parsed % PROGRESS_EVERY_ROWS == 0:
                print(f"  ...{total_parsed} entries processed so far")

            ts_str = entry.get("ts")
            if ts_str:
                if earliest_ts is None or ts_str < earliest_ts:
                    earliest_ts = ts_str
                if latest_ts is None or ts_str > latest_ts:
                    latest_ts = ts_str

            if entry.get("episode_name") is not None or entry.get("audiobook_title") is not None:
                filtered_podcast_audiobook += 1
                continue

            ms_played = entry.get("ms_played") or 0
            if ms_played < MIN_MS_PLAYED:
                filtered_short_play += 1
                continue

            uri = entry.get("spotify_track_uri")
            raw_track_id = uri[len("spotify:track:"):] if uri and uri.startswith("spotify:track:") else None
            internal_track_id = track_map.get(raw_track_id) if raw_track_id else None

            if internal_track_id is None:
                unmatched += 1
                key = raw_track_id or uri or "(no uri)"
                agg = unmatched_agg.setdefault(key, {
                    "spotify_track_uri": uri,
                    "track_name": entry.get("master_metadata_track_name"),
                    "artist_name": entry.get("master_metadata_album_artist_name"),
                    "count": 0,
                })
                agg["count"] += 1
                continue

            matched += 1

            # Offline plays sync in batches and share the same `ts` (the sync time, not
            # the actual play time) - offline_timestamp + ms_played disambiguate genuinely
            # distinct plays that would otherwise collide on (track_id, ts) alone.
            dedup_key = (raw_track_id, ts_str, entry.get("offline_timestamp"), ms_played)
            if dedup_key in seen_in_run:
                deduped += 1
                continue
            seen_in_run.add(dedup_key)

            played_at = parse_ts(ts_str)
            if is_near_duplicate(existing_recent.get(internal_track_id, []), played_at, DEDUPE_TOLERANCE_SECONDS):
                deduped += 1
                continue

            to_insert.append({
                "user_id": args.user_id,
                "track_id": internal_track_id,
                "played_at": played_at,
                "source": "extended_history",
                "ms_played": ms_played,
                "spotify_track_uri": uri,
            })

        print(f"[{file_idx}/{len(files)}] {os.path.basename(filepath)}: {len(entries)} entries (running total: {total_parsed})")

    unmatched_list = sorted(unmatched_agg.values(), key=lambda x: -x["count"])
    with open(args.unmatched_output, "w", encoding="utf-8") as f:
        json.dump(unmatched_list, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(unmatched_list)} unique unmatched tracks to {args.unmatched_output}")

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Date range:                          {earliest_ts}  to  {latest_ts}")
    print(f"Total entries parsed:                 {total_parsed}")
    print(f"Filtered (podcast/audiobook):          {filtered_podcast_audiobook}")
    print(f"Filtered (ms_played < {MIN_MS_PLAYED}):        {filtered_short_play}")
    print(f"Matched to tracks table:               {matched}")
    print(f"Unmatched (no track match):            {unmatched}")
    print(f"Deduplicated (vs existing/within run): {deduped}")
    print(f"Final count to insert:                 {len(to_insert)}")
    print("=" * 60)

    if args.dry_run:
        print("\n--dry-run set: no rows were inserted.")
        db.close()
        return

    print(f"\nInserting {len(to_insert)} rows into listening_events...")
    table = ListeningEvent.__table__
    with engine.begin() as conn:
        for i in range(0, len(to_insert), INSERT_BATCH_SIZE):
            batch = to_insert[i:i + INSERT_BATCH_SIZE]
            conn.execute(insert(table), batch)
            print(f"  Inserted {min(i + INSERT_BATCH_SIZE, len(to_insert))}/{len(to_insert)} rows")

    print("Done.")
    db.close()


if __name__ == "__main__":
    main()
