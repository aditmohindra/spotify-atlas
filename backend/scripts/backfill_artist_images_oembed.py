"""Backfill artist image_url using Spotify's public oEmbed endpoint.

Unlike the iTunes-based scripts (backfill_images.py, backfill_priority_images.py),
this looks artists up directly by their known spotify_artist_id (captured at
ingestion, see Artist.spotify_artist_id) via:

    GET https://open.spotify.com/oembed?url=spotify:artist:{spotify_artist_id}

which returns a `thumbnail_url` pointing at Spotify's own image CDN
(image-cdn-fa.spotifycdn.com, not the older i.scdn.co host, but the same kind
of first-party CDN asset - confirmed to resolve to a real JPEG). oEmbed is
meant for public embedding (e.g. blog posts), so it isn't subject to the app's
Web API dev-mode quota or the 403 throttling iTunes Search exhibits - no API
key, no auth, exact ID lookup instead of fuzzy name search.

Progress is checkpointed to oembed_artist_checkpoint.json (next to this
script, kept separate from backfill_images.py's album checkpoint) after every
batch, so an interrupted run can be resumed without re-querying already
processed artists.

Usage:
    uv run python scripts/backfill_artist_images_oembed.py --dry-run
    uv run python scripts/backfill_artist_images_oembed.py
"""
import argparse
import json
import sys
import time
from pathlib import Path

import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database.connection import SessionLocal
from app.models.models import Artist

OEMBED_URL = "https://open.spotify.com/oembed"
CHECKPOINT_PATH = Path(__file__).resolve().parent / "oembed_artist_checkpoint.json"
SLEEP_BETWEEN_CALLS = 1.0
LOG_EVERY_N_ITEMS = 100
DRY_RUN_SAMPLE_SIZE = 5

MAX_RETRIES = 3          # only for transient errors (timeouts / 5xx) - a 404 is a real "not found", not retried
RETRY_BACKOFF = 2.0       # seconds; doubles each retry


def load_checkpoint() -> set:
    if CHECKPOINT_PATH.exists():
        with open(CHECKPOINT_PATH) as f:
            data = json.load(f)
        return set(data.get("processed_artist_ids", []))
    return set()


def save_checkpoint(processed_ids: set):
    with open(CHECKPOINT_PATH, "w") as f:
        json.dump({"processed_artist_ids": sorted(processed_ids)}, f)


def get_artists_missing_images(db):
    return (
        db.query(Artist.id, Artist.name, Artist.spotify_artist_id)
        .filter(Artist.image_url.is_(None), Artist.spotify_artist_id.isnot(None))
        .order_by(Artist.id)
        .all()
    )


def fetch_oembed_thumbnail(client: httpx.Client, spotify_artist_id: str):
    """Returns the thumbnail_url on success, or None (artist not found / no
    thumbnail / exhausted retries on a transient error).
    """
    url = f"spotify:artist:{spotify_artist_id}"
    for attempt in range(MAX_RETRIES):
        try:
            response = client.get(OEMBED_URL, params={"url": url})
        except httpx.HTTPError as e:
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF * (2 ** attempt)
                print(f"      network error ({e}), retrying in {wait:.0f}s...")
                time.sleep(wait)
                continue
            print(f"      network error ({e}), exhausted retries, treating as not found")
            return None

        if response.status_code == 404:
            return None
        if response.status_code == 200:
            return response.json().get("thumbnail_url")
        if attempt < MAX_RETRIES - 1:
            wait = RETRY_BACKOFF * (2 ** attempt)
            print(f"      oEmbed {response.status_code} (attempt {attempt + 1}/{MAX_RETRIES}), retrying in {wait:.0f}s...")
            time.sleep(wait)
            continue
        print(f"      oEmbed {response.status_code}, exhausted retries, treating as not found")
        return None
    return None


def run_dry_run(rows):
    sample = rows[:DRY_RUN_SAMPLE_SIZE]
    print(f"Artists missing image_url (with a spotify_artist_id): {len(rows)}")
    print(f"Showing first {len(sample)} oEmbed lookups:\n")

    with httpx.Client(timeout=10.0) as client:
        for artist_id, name, spotify_artist_id in sample:
            thumbnail_url = fetch_oembed_thumbnail(client, spotify_artist_id)
            print(f"  [{name}] (spotify:artist:{spotify_artist_id})")
            print(f"    -> {thumbnail_url}\n" if thumbnail_url else "    -> no match\n")
            time.sleep(SLEEP_BETWEEN_CALLS)

    print("(dry run - no DB writes made)")


def run_backfill(rows, db):
    processed = load_checkpoint()
    remaining = [r for r in rows if r[0] not in processed]
    already_done = len(rows) - len(remaining)
    if already_done:
        print(f"Resuming: {already_done} artists already processed per checkpoint, {len(remaining)} remaining.")

    updated = 0
    not_found = 0

    with httpx.Client(timeout=10.0) as client:
        for i, (artist_id, name, spotify_artist_id) in enumerate(remaining, start=1):
            thumbnail_url = fetch_oembed_thumbnail(client, spotify_artist_id)
            if thumbnail_url:
                db.query(Artist).filter(Artist.id == artist_id).update({"image_url": thumbnail_url})
                db.commit()
                updated += 1
            else:
                not_found += 1

            processed.add(artist_id)

            if i % LOG_EVERY_N_ITEMS == 0 or i == len(remaining):
                save_checkpoint(processed)
                print(f"  Artists: {i}/{len(remaining)} ({updated} updated, {not_found} not found so far)")

            time.sleep(SLEEP_BETWEEN_CALLS)

    save_checkpoint(processed)

    total = len(rows)
    # Recount from the DB rather than tallying across runs - the checkpoint only
    # tracks which artist IDs were attempted, not whether they matched, so a
    # resumed run can't otherwise tell overall updated/not-found apart.
    all_ids = [r[0] for r in rows]
    total_updated = db.query(Artist).filter(
        Artist.id.in_(all_ids), Artist.image_url.isnot(None)
    ).count() if all_ids else 0
    total_not_found = total - total_updated
    coverage = (total_updated / total * 100) if total else 0.0

    print("\n=== Summary ===")
    print(f"{updated} artists updated with oEmbed art this run ({not_found} not found this run)")
    print(f"Overall: {total_updated} artists updated with oEmbed art")
    print(f"Overall: {total_not_found} artists not found via oEmbed")
    print(f"Coverage: {coverage:.1f}% ({total_updated}/{total})")


def main(dry_run: bool):
    db = SessionLocal()
    try:
        total_missing = db.query(Artist).filter(Artist.image_url.is_(None)).count()
        rows = get_artists_missing_images(db)
        excluded = total_missing - len(rows)
        if excluded:
            print(f"Note: {excluded} artists missing image_url have no spotify_artist_id and were excluded.")

        if dry_run:
            run_dry_run(rows)
        else:
            run_backfill(rows, db)
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show first 5 oEmbed matches, no DB writes")
    args = parser.parse_args()
    main(args.dry_run)
