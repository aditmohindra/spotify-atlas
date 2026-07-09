"""Backfill image_url for albums using the iTunes Search API.

Spotify's API is currently rate-limited for this app (see project memory /
earlier runs of this script), so this uses iTunes Search instead: no API
key, no meaningful rate limit, free. Artist images are intentionally
skipped — iTunes doesn't have good artist photos; that will be handled
separately later. Only album art is backfilled here.

Progress is checkpointed to backfill_checkpoint.json (next to this script)
after every batch, so an interrupted run can be resumed without
re-querying already-processed albums.

Usage:
    uv run python scripts/backfill_images.py --dry-run
    uv run python scripts/backfill_images.py
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database.connection import SessionLocal
from app.models.models import Album, Track, Artist

ITUNES_SEARCH_URL = "https://itunes.apple.com/search"
CHECKPOINT_PATH = Path(__file__).resolve().parent / "backfill_checkpoint.json"
SLEEP_BETWEEN_CALLS = 0.3
LOG_EVERY_N_ITEMS = 50
DRY_RUN_SAMPLE_SIZE = 10


def load_checkpoint() -> set:
    if CHECKPOINT_PATH.exists():
        with open(CHECKPOINT_PATH) as f:
            data = json.load(f)
        return set(data.get("processed_album_ids", []))
    return set()


def save_checkpoint(processed_ids: set):
    with open(CHECKPOINT_PATH, "w") as f:
        json.dump({"processed_album_ids": sorted(processed_ids)}, f)


def get_albums_missing_art(db):
    """Albums with no image_url, joined to one associated track/artist for search text.

    Albums with no tracks (or no artist on their tracks) can't be searched and
    are excluded here — reported separately by the caller.
    """
    return (
        db.query(Album.id, Album.name, Artist.name.label("artist_name"))
        .join(Track, Track.album_id == Album.id)
        .join(Artist, Track.artist_id == Artist.id)
        .filter(Album.image_url.is_(None))
        .order_by(Album.id)
        .distinct(Album.id)
        .all()
    )


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _artist_matches(our_artist: str, itunes_artist: str) -> bool:
    a, b = _normalize(our_artist), _normalize(itunes_artist or "")
    if not a or not b:
        return False
    return a in b or b in a


ITUNES_MAX_RETRIES = 4
ITUNES_RETRY_BACKOFF = 2.0  # seconds; doubles each retry


def _get_with_retry(client: httpx.Client, url: str, params: dict):
    for attempt in range(ITUNES_MAX_RETRIES):
        response = client.get(url, params=params)
        if response.status_code != 403:
            response.raise_for_status()
            return response
        if attempt < ITUNES_MAX_RETRIES - 1:
            wait = ITUNES_RETRY_BACKOFF * (2 ** attempt)
            print(f"    iTunes 403 (attempt {attempt + 1}/{ITUNES_MAX_RETRIES}), retrying in {wait:.0f}s...")
            time.sleep(wait)
    return None  # exhausted retries, still 403ing


def search_itunes_album_art(client: httpx.Client, artist_name: str, album_name: str):
    query = f"{artist_name} {album_name}"
    response = _get_with_retry(
        client,
        ITUNES_SEARCH_URL,
        params={"term": query, "entity": "album", "limit": 1},
    )
    if response is None:
        return None
    results = response.json().get("results", [])
    if not results:
        return None
    top = results[0]
    artwork_url = top.get("artworkUrl100")
    if not artwork_url:
        return None
    if not _artist_matches(artist_name, top.get("artistName", "")):
        return {
            "query": query,
            "matched_artist": top.get("artistName"),
            "matched_album": top.get("collectionName"),
            "artwork_url": None,
            "rejected_artist_mismatch": True,
        }
    return {
        "query": query,
        "matched_artist": top.get("artistName"),
        "matched_album": top.get("collectionName"),
        "artwork_url": artwork_url.replace("100x100", "600x600"),
        "rejected_artist_mismatch": False,
    }


def run_dry_run(rows):
    sample = rows[:DRY_RUN_SAMPLE_SIZE]
    print(f"Albums missing image_url (with a known artist): {len(rows)}")
    print(f"Showing first {len(sample)} matches:\n")

    with httpx.Client(timeout=10.0) as client:
        for album_id, album_name, artist_name in sample:
            match = search_itunes_album_art(client, artist_name, album_name)
            print(f"  [{artist_name} - {album_name}]")
            if not match:
                print("    -> no iTunes match\n")
            elif match["rejected_artist_mismatch"]:
                print(f"    -> rejected (artist mismatch): iTunes returned "
                      f"{match['matched_artist']} - {match['matched_album']}\n")
            else:
                print(f"    matched: {match['matched_artist']} - {match['matched_album']}")
                print(f"    artwork: {match['artwork_url']}\n")
            time.sleep(SLEEP_BETWEEN_CALLS)

    print("(dry run - no DB writes made)")


def run_backfill(rows, db):
    processed = load_checkpoint()
    remaining = [r for r in rows if r[0] not in processed]
    already_done = len(rows) - len(remaining)
    if already_done:
        print(f"Resuming: {already_done} albums already processed per checkpoint, {len(remaining)} remaining.")

    updated = 0
    not_found = 0

    with httpx.Client(timeout=10.0) as client:
        for i, (album_id, album_name, artist_name) in enumerate(remaining, start=1):
            match = search_itunes_album_art(client, artist_name, album_name)
            if match and not match["rejected_artist_mismatch"]:
                db.query(Album).filter(Album.id == album_id).update({"image_url": match["artwork_url"]})
                db.commit()
                updated += 1
            else:
                not_found += 1

            processed.add(album_id)

            if i % LOG_EVERY_N_ITEMS == 0 or i == len(remaining):
                save_checkpoint(processed)
                print(f"  Albums: {i}/{len(remaining)} ({updated} updated, {not_found} not found so far)")

            time.sleep(SLEEP_BETWEEN_CALLS)

    save_checkpoint(processed)

    total = len(rows)
    # Recount from the DB rather than tallying across runs — the checkpoint only
    # tracks which album IDs were attempted, not whether they matched, so a
    # resumed run can't otherwise tell overall updated/not-found apart.
    all_ids = [r[0] for r in rows]
    total_updated = db.query(Album).filter(
        Album.id.in_(all_ids), Album.image_url.isnot(None)
    ).count() if all_ids else 0
    total_not_found = total - total_updated
    coverage = (total_updated / total * 100) if total else 0.0

    print("\n=== Summary ===")
    print(f"{updated} albums updated with iTunes art this run ({not_found} not found this run)")
    print(f"Overall: {total_updated} albums updated with iTunes art")
    print(f"Overall: {total_not_found} albums not found on iTunes")
    print(f"Coverage: {coverage:.1f}% ({total_updated}/{total})")


def main(dry_run: bool):
    db = SessionLocal()
    try:
        total_missing = db.query(Album).filter(Album.image_url.is_(None)).count()
        rows = get_albums_missing_art(db)
        excluded = total_missing - len(rows)
        if excluded:
            print(f"Note: {excluded} albums missing image_url have no linked track/artist and were excluded (can't build a search query).")

        if dry_run:
            run_dry_run(rows)
        else:
            run_backfill(rows, db)
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show first 10 iTunes matches, no DB writes")
    args = parser.parse_args()
    main(args.dry_run)
