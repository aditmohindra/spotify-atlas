"""Targeted album/artist art backfill for the product's most-viewed surfaces.

Rather than backfilling all ~5600 albums (see backfill_images.py), this only
covers tracks that actually appear in:

  P1 - Wrapped top tracks/artists/albums, all 3 windows
       (GET /wrapped/top-tracks|top-artists|top-albums, app/api/wrapped.py)
  P2 - Discovery era representative tracks + top artists
       (GET /eras/{id}/depth, app/api/eras.py) - replicates that endpoint's
       own distinctiveness scoring so priority coverage matches what the era
       detail page can actually show. Uses track_limit=10 / limit=10 to match
       the era detail page (frontend/app/timeline/era/[id]/page.tsx), which
       requests more depth than the timeline card view's default of 3.
  P3 - Top 20 vibe communities by (hard-assignment) track count
       (GET /clusters/{id}/detail, app/api/clusters.py) - the endpoint samples
       8 random hard-assigned tracks per community, so every hard-assigned
       track in a top community is a candidate for display.

Album art: iTunes Search API (entity=album), same approach as
backfill_images.py, at a conservative 1.5s pace given the rate-limiting
behavior observed there (see project memory).

Artist art: iTunes has no artwork field on entity=musicArtist results at all
(confirmed empirically - only artistName/artistLinkUrl/artistId/genre come
back). As a stand-in, priority artists missing image_url get an
entity=album search on their name, and the top result's artwork is used as
a placeholder artist image if the artist name matches.

Usage:
    uv run python scripts/backfill_priority_images.py --dry-run
    uv run python scripts/backfill_priority_images.py
"""
import argparse
import re
import sys
import time
from pathlib import Path

import httpx
from sqlalchemy import text

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database.connection import SessionLocal
from app.models.models import Album, Artist, Track, UserEra

ITUNES_SEARCH_URL = "https://itunes.apple.com/search"
SLEEP_BETWEEN_CALLS = 1.5
DRY_RUN_SAMPLE_SIZE = 5
USER_ID = 1
VIBE_RUN_ID = 29
ERA_TRACK_LIMIT = 10   # matches the era detail page's track_limit, the more thorough of the 2 call sites
ERA_ARTIST_LIMIT = 10  # matches the era detail page's limit, for top_artists_by_volume / by_distinctiveness
TOP_COMMUNITY_COUNT = 20
COMMUNITY_TRACKS_PER_CLUSTER = 20  # cap per community; /clusters/{id}/detail only ever samples 8 at random

WRAPPED_WINDOWS = ("top_short_term", "top_medium_term", "top_long_term")
WRAPPED_TRACKS_LIMIT = 20   # matches frontend/app/wrapped/page.tsx getWrappedTopTracks call
WRAPPED_ARTISTS_LIMIT = 20  # ditto, getWrappedTopArtists
WRAPPED_ALBUMS_LIMIT = 10   # ditto, getWrappedTopAlbums
DISCOVERY_ERA_SOURCES = ("saved_tracks", "recently_played")  # matches RELIABLE_SOURCES in eras.py


def _distinctiveness_score(era_freq: int, era_total: int, global_freq: int, global_total: int) -> float:
    """Same formula as eras.py::_distinctiveness_score."""
    if era_freq <= 0 or era_total <= 0 or global_freq <= 0 or global_total <= 0:
        return 0.0
    era_share = era_freq / era_total
    global_share = global_freq / global_total
    if global_share == 0:
        return 0.0
    return round(era_share / global_share, 4)


def get_wrapped_ids(db) -> tuple[set, set]:
    """Replicates the exact per-window ranking + LIMIT used by
    GET /wrapped/top-tracks|top-artists|top-albums (app/api/wrapped.py),
    called with limit=20/20/10 respectively (frontend/app/wrapped/page.tsx).
    Source tags like 'top_long_term' have thousands of rows each - only the
    top N by that ordering are ever actually rendered.
    """
    album_ids = set()
    artist_ids = set()

    for source in WRAPPED_WINDOWS:
        track_rows = db.execute(text("""
            SELECT t.album_id
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            WHERE le.user_id = :user_id AND le.source = :source
            ORDER BY le.id ASC
            LIMIT :limit
        """), {"user_id": USER_ID, "source": source, "limit": WRAPPED_TRACKS_LIMIT}).fetchall()
        album_ids.update(r.album_id for r in track_rows if r.album_id is not None)

        artist_rows = db.execute(text("""
            SELECT ar.id AS artist_id, MIN(le.id) AS first_rank_signal
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            LEFT JOIN artists ar ON ar.id = t.artist_id
            WHERE le.user_id = :user_id AND le.source = :source
            GROUP BY ar.id
            ORDER BY first_rank_signal ASC
            LIMIT :limit
        """), {"user_id": USER_ID, "source": source, "limit": WRAPPED_ARTISTS_LIMIT}).fetchall()
        artist_ids.update(r.artist_id for r in artist_rows if r.artist_id is not None)

        album_rows = db.execute(text("""
            SELECT al.id AS album_id, COUNT(*) AS track_count, MIN(le.id) AS first_rank_signal
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE le.user_id = :user_id AND le.source = :source
            GROUP BY al.id
            ORDER BY track_count DESC, first_rank_signal ASC
            LIMIT :limit
        """), {"user_id": USER_ID, "source": source, "limit": WRAPPED_ALBUMS_LIMIT}).fetchall()
        album_ids.update(r.album_id for r in album_rows if r.album_id is not None)

    return album_ids, artist_ids


def get_discovery_era_ids(db) -> tuple[set, set]:
    """Replicates GET /eras/{id}/depth's representative-track and
    top-artist scoring for every discovery era.
    """
    album_ids = set()
    artist_ids = set()

    eras = db.query(UserEra).filter(
        UserEra.user_id == USER_ID, UserEra.era_type == "discovery"
    ).all()
    if not eras:
        return album_ids, artist_ids

    global_total = db.execute(text("""
        SELECT COUNT(*) FROM listening_events
        WHERE user_id = :user_id AND source = ANY(:sources)
    """), {"user_id": USER_ID, "sources": list(DISCOVERY_ERA_SOURCES)}).scalar() or 0

    global_track_map = {
        r.track_id: r.cnt for r in db.execute(text("""
            SELECT le.track_id, COUNT(*) AS cnt
            FROM listening_events le
            WHERE le.user_id = :user_id AND le.source = ANY(:sources)
            GROUP BY le.track_id
        """), {"user_id": USER_ID, "sources": list(DISCOVERY_ERA_SOURCES)}).fetchall()
    }

    global_artist_map = {
        r.artist_id: r.cnt for r in db.execute(text("""
            SELECT t.artist_id, COUNT(*) AS cnt
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            WHERE le.user_id = :user_id AND le.source = ANY(:sources)
            GROUP BY t.artist_id
        """), {"user_id": USER_ID, "sources": list(DISCOVERY_ERA_SOURCES)}).fetchall()
        if r.artist_id is not None
    }

    for era in eras:
        era_rows = db.execute(text("""
            SELECT le.track_id, t.album_id, t.artist_id
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            WHERE le.user_id = :user_id
              AND le.source = ANY(:sources)
              AND le.played_at BETWEEN :start_date AND :end_date
        """), {
            "user_id": USER_ID, "sources": list(DISCOVERY_ERA_SOURCES),
            "start_date": era.start_date, "end_date": era.end_date,
        }).fetchall()

        era_total = len(era_rows)
        if era_total == 0:
            continue

        track_counts: dict[int, int] = {}
        artist_counts: dict[int, int] = {}
        track_album: dict[int, int] = {}
        for r in era_rows:
            track_counts[r.track_id] = track_counts.get(r.track_id, 0) + 1
            track_album[r.track_id] = r.album_id
            if r.artist_id is not None:
                artist_counts[r.artist_id] = artist_counts.get(r.artist_id, 0) + 1

        # Representative tracks: discovery eras use min_era_frequency=1 (eras.py)
        track_scores = [
            (track_id, _distinctiveness_score(freq, era_total, global_track_map.get(track_id, 0), global_total))
            for track_id, freq in track_counts.items()
        ]
        track_scores.sort(key=lambda x: -x[1])
        for track_id, _ in track_scores[:ERA_TRACK_LIMIT]:
            if track_album.get(track_id):
                album_ids.add(track_album[track_id])

        # Top artists by volume
        for artist_id, _ in sorted(artist_counts.items(), key=lambda x: -x[1])[:ERA_ARTIST_LIMIT]:
            artist_ids.add(artist_id)

        # Top artists by distinctiveness (era_freq >= 2, matching eras.py)
        distinct_scores = []
        for artist_id, era_freq in artist_counts.items():
            if era_freq < 2:
                continue
            global_freq = global_artist_map.get(artist_id, 0)
            if global_freq <= era_freq:
                continue
            distinct_scores.append(
                (artist_id, _distinctiveness_score(era_freq, era_total, global_freq, global_total))
            )
        distinct_scores.sort(key=lambda x: -x[1])
        for artist_id, _ in distinct_scores[:ERA_ARTIST_LIMIT]:
            artist_ids.add(artist_id)

    return album_ids, artist_ids


def get_top_community_album_ids(db) -> set:
    """Top 20 vibe communities ranked by hard-assignment track count. Community
    sizes run 100-400+ hard-assigned tracks each, but /clusters/{id}/detail only
    ever samples 8 random sample_tracks per pageview - so rather than pulling
    every track in every top community (~2500 albums, nearly half the catalog),
    this caps at COMMUNITY_TRACKS_PER_CLUSTER tracks per community (deterministic
    by track_id) to stay within the intended "targeted, not everything" scope
    while still covering the large majority of what's likely to be sampled.
    """
    top_clusters = db.execute(text("""
        SELECT cl.cluster_id, COUNT(*) AS track_count
        FROM cluster_labels cl
        JOIN clustering_assignments ca
          ON ca.cluster_id = cl.cluster_id AND ca.run_id = :run_id AND ca.assignment_type = 'hard'
        WHERE cl.cluster_layer = 'vibe'
        GROUP BY cl.cluster_id
        ORDER BY track_count DESC
        LIMIT :n
    """), {"run_id": VIBE_RUN_ID, "n": TOP_COMMUNITY_COUNT}).fetchall()

    cluster_ids = [r.cluster_id for r in top_clusters]
    if not cluster_ids:
        return set()

    rows = db.execute(text("""
        SELECT album_id FROM (
            SELECT t.album_id,
                   ROW_NUMBER() OVER (PARTITION BY ca.cluster_id ORDER BY t.id) AS rn
            FROM clustering_assignments ca
            JOIN tracks t ON t.id = ca.track_id
            WHERE ca.run_id = :run_id
              AND ca.assignment_type = 'hard'
              AND ca.cluster_id = ANY(:cluster_ids)
        ) ranked
        WHERE rn <= :per_cluster
    """), {
        "run_id": VIBE_RUN_ID, "cluster_ids": cluster_ids,
        "per_cluster": COMMUNITY_TRACKS_PER_CLUSTER,
    }).fetchall()

    return {r.album_id for r in rows if r.album_id is not None}


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _artist_matches(our_artist: str, itunes_artist: str) -> bool:
    a, b = _normalize(our_artist), _normalize(itunes_artist or "")
    if not a or not b:
        return False
    return a in b or b in a


ITUNES_MAX_RETRIES = 4
ITUNES_RETRY_BACKOFF = 2.0  # seconds; doubles each retry


def _get_with_retry(client: httpx.Client, params: dict):
    for attempt in range(ITUNES_MAX_RETRIES):
        response = client.get(ITUNES_SEARCH_URL, params=params)
        if response.status_code == 200:
            return response
        if response.status_code != 403:
            print(f"      iTunes {response.status_code} for term={params.get('term')!r}, treating as no match")
            return None
        if attempt < ITUNES_MAX_RETRIES - 1:
            wait = ITUNES_RETRY_BACKOFF * (2 ** attempt)
            print(f"      iTunes 403 (attempt {attempt + 1}/{ITUNES_MAX_RETRIES}), retrying in {wait:.0f}s...")
            time.sleep(wait)
    return None


def _search_one(client: httpx.Client, query: str, entity: str, artist_name: str):
    response = _get_with_retry(client, {"term": query, "entity": entity, "limit": 1})
    if response is None:
        return None
    results = response.json().get("results", [])
    if not results:
        return None
    top = results[0]
    artwork_url = top.get("artworkUrl100")
    if not artwork_url or not _artist_matches(artist_name, top.get("artistName", "")):
        return None
    return artwork_url.replace("100x100", "600x600")


def search_album_art(client: httpx.Client, artist_name: str, album_name: str):
    """Tries entity=album first, then falls back to entity=song. Many priority
    tracks are singles (e.g. Lupe Fiasco's "Samurai") that iTunes indexes as a
    song, not an album collection - entity=album alone returns zero results
    for those even though the same release has artwork under entity=song.
    """
    query = f"{artist_name} {album_name}"
    match = _search_one(client, query, "album", artist_name)
    if match:
        return match
    time.sleep(SLEEP_BETWEEN_CALLS)
    return _search_one(client, query, "song", artist_name)


def search_artist_stand_in_art(client: httpx.Client, artist_name: str):
    """iTunes has no artist-photo field; use a matching album's art as a stand-in."""
    response = _get_with_retry(client, {"term": artist_name, "entity": "album", "limit": 1})
    if response is None:
        return None
    results = response.json().get("results", [])
    if not results:
        return None
    top = results[0]
    artwork_url = top.get("artworkUrl100")
    if not artwork_url or not _artist_matches(artist_name, top.get("artistName", "")):
        return None
    return artwork_url.replace("100x100", "600x600")


def collect_priority_ids(db):
    wrapped_album_ids, wrapped_artist_ids = get_wrapped_ids(db)
    era_album_ids, era_artist_ids = get_discovery_era_ids(db)
    community_album_ids = get_top_community_album_ids(db)

    album_ids = wrapped_album_ids | era_album_ids | community_album_ids
    artist_ids = wrapped_artist_ids | era_artist_ids

    return {
        "album_ids": album_ids,
        "artist_ids": artist_ids,
        "breakdown": {
            "wrapped_albums": len(wrapped_album_ids),
            "era_albums": len(era_album_ids),
            "community_albums": len(community_album_ids),
            "wrapped_artists": len(wrapped_artist_ids),
            "era_artists": len(era_artist_ids),
        },
    }


def get_missing_albums(db, album_ids: set):
    if not album_ids:
        return []
    return (
        db.query(Album.id, Album.name, Artist.name.label("artist_name"))
        .join(Track, Track.album_id == Album.id)
        .join(Artist, Track.artist_id == Artist.id)
        .filter(Album.id.in_(album_ids), Album.image_url.is_(None))
        .order_by(Album.id)
        .distinct(Album.id)
        .all()
    )


def get_missing_artists(db, artist_ids: set):
    if not artist_ids:
        return []
    return (
        db.query(Artist.id, Artist.name)
        .filter(Artist.id.in_(artist_ids), Artist.image_url.is_(None))
        .order_by(Artist.id)
        .all()
    )


def run_dry_run(albums, artists):
    album_sample = albums[:DRY_RUN_SAMPLE_SIZE]
    artist_sample = artists[:DRY_RUN_SAMPLE_SIZE]

    print(f"\nShowing first {len(album_sample)} album matches:\n")
    with httpx.Client(timeout=10.0) as client:
        for album_id, album_name, artist_name in album_sample:
            artwork_url = search_album_art(client, artist_name, album_name)
            print(f"  [{artist_name} - {album_name}]")
            print(f"    artwork: {artwork_url}\n" if artwork_url else "    -> no match\n")
            time.sleep(SLEEP_BETWEEN_CALLS)

    print(f"Showing first {len(artist_sample)} artist stand-in matches:\n")
    with httpx.Client(timeout=10.0) as client:
        for artist_id, artist_name in artist_sample:
            artwork_url = search_artist_stand_in_art(client, artist_name)
            print(f"  [{artist_name}]")
            print(f"    artwork (album stand-in): {artwork_url}\n" if artwork_url else "    -> no match\n")
            time.sleep(SLEEP_BETWEEN_CALLS)

    print("(dry run - no DB writes made)")


def run_backfill(albums, artists, db):
    album_updated = 0
    album_not_found = 0
    album_errors = 0
    with httpx.Client(timeout=10.0) as client:
        for i, (album_id, album_name, artist_name) in enumerate(albums, start=1):
            try:
                artwork_url = search_album_art(client, artist_name, album_name)
            except httpx.HTTPError as e:
                print(f"      Error searching '{artist_name} - {album_name}': {e}, treating as no match")
                artwork_url = None
                album_errors += 1
            if artwork_url:
                db.query(Album).filter(Album.id == album_id).update({"image_url": artwork_url})
                db.commit()
                album_updated += 1
            else:
                album_not_found += 1
            if i % 20 == 0 or i == len(albums):
                print(f"  Albums: {i}/{len(albums)} ({album_updated} updated, {album_not_found} not found so far)")
            time.sleep(SLEEP_BETWEEN_CALLS)
    if album_errors:
        print(f"  ({album_errors} album lookups hit an HTTP error and were counted as not found)")

    artist_updated = 0
    artist_not_found = 0
    artist_errors = 0
    with httpx.Client(timeout=10.0) as client:
        for i, (artist_id, artist_name) in enumerate(artists, start=1):
            try:
                artwork_url = search_artist_stand_in_art(client, artist_name)
            except httpx.HTTPError as e:
                print(f"      Error searching '{artist_name}': {e}, treating as no match")
                artwork_url = None
                artist_errors += 1
            if artwork_url:
                db.query(Artist).filter(Artist.id == artist_id).update({"image_url": artwork_url})
                db.commit()
                artist_updated += 1
            else:
                artist_not_found += 1
            if i % 20 == 0 or i == len(artists):
                print(f"  Artists: {i}/{len(artists)} ({artist_updated} updated, {artist_not_found} not found so far)")
            time.sleep(SLEEP_BETWEEN_CALLS)
    if artist_errors:
        print(f"  ({artist_errors} artist lookups hit an HTTP error and were counted as not found)")

    print("\n=== Summary ===")
    print(f"Albums: {album_updated} updated with iTunes art, {album_not_found} not found on iTunes ({album_errors} of those were HTTP errors)")
    print(f"Artists: {artist_updated} updated with iTunes album-art stand-in, {artist_not_found} not found on iTunes ({artist_errors} of those were HTTP errors)")


def print_wrapped_coverage(db):
    row = db.execute(text("""
        SELECT COUNT(*) AS total, COUNT(al.image_url) AS with_art
        FROM listening_events le
        JOIN tracks t ON t.id = le.track_id
        JOIN albums al ON al.id = t.album_id
        WHERE le.source = 'top_long_term'
    """)).fetchone()
    pct = (row.with_art / row.total * 100) if row.total else 0.0
    print(f"\nWrapped long_term coverage: {row.with_art}/{row.total} ({pct:.1f}%)")


def main(dry_run: bool):
    db = SessionLocal()
    try:
        ids = collect_priority_ids(db)
        b = ids["breakdown"]
        print("Priority ID collection:")
        print(f"  Wrapped: {b['wrapped_albums']} albums, {b['wrapped_artists']} artists")
        print(f"  Discovery eras: {b['era_albums']} albums, {b['era_artists']} artists")
        print(f"  Top {TOP_COMMUNITY_COUNT} communities: {b['community_albums']} albums")
        print(f"  Total unique priority albums: {len(ids['album_ids'])}")
        print(f"  Total unique priority artists: {len(ids['artist_ids'])}")

        albums = get_missing_albums(db, ids["album_ids"])
        artists = get_missing_artists(db, ids["artist_ids"])
        print(f"\nFound {len(albums)} priority albums missing art, {len(artists)} priority artists missing art")

        if dry_run:
            run_dry_run(albums, artists)
        else:
            run_backfill(albums, artists, db)
            print_wrapped_coverage(db)
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show first 5 iTunes matches, no DB writes")
    args = parser.parse_args()
    main(args.dry_run)
