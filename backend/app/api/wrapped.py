from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.connection import get_db

router = APIRouter()

VALID_WINDOWS = {"short_term", "medium_term", "long_term"}

EXTENDED_HISTORY_SOURCE = "extended_history"

# Days of real playback history each window covers, anchored to the latest
# real event timestamp in extended_history (not the server clock), since this
# is a frozen, read-only showcase rather than a live app.
WINDOW_DAYS = {
    "short_term": 28,
    "medium_term": 182,
}

# How many top (deduped) tracks feed the "which album do the top tracks
# belong to" derivation, mirroring the size of a typical Spotify top-items
# snapshot.
ALBUM_TRACK_POOL_SIZE = 50


def _validate_window(window: str) -> None:
    if window not in VALID_WINDOWS:
        raise HTTPException(
            status_code=400,
            detail="window must be 'short_term', 'medium_term', or 'long_term'",
        )


def _get_window_bounds(db: Session, user_id: int, window: str):
    """Resolve (start, end, anchor) for a window, anchored to the latest real
    extended_history event instead of the actual server clock."""
    anchor = db.execute(
        text(
            """
            SELECT MAX(played_at) AS anchor
            FROM listening_events
            WHERE user_id = :user_id
              AND source = :source
            """
        ),
        {"user_id": user_id, "source": EXTENDED_HISTORY_SOURCE},
    ).scalar()

    if anchor is None:
        return None, None, None

    if window == "long_term":
        earliest = db.execute(
            text(
                """
                SELECT MIN(played_at) AS earliest
                FROM listening_events
                WHERE user_id = :user_id
                  AND source = :source
                """
            ),
            {"user_id": user_id, "source": EXTENDED_HISTORY_SOURCE},
        ).scalar()
        return earliest, anchor, anchor

    start = anchor - timedelta(days=WINDOW_DAYS[window])
    return start, anchor, anchor


def _fetch_track_play_rows(db: Session, user_id: int, start, end):
    """Real per-track play counts within the window, one row per underlying
    track_id (before name/artist dedup)."""
    return db.execute(
        text(
            """
            SELECT
                t.id AS track_id,
                t.name AS track_name,
                COALESCE(ar.name, 'Unknown Artist') AS artist_name,
                t.spotify_track_id,
                al.name AS album_name,
                al.image_url AS album_image_url,
                COUNT(*) AS play_count
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            LEFT JOIN artists ar ON ar.id = t.artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE le.user_id = :user_id
              AND le.source = :source
              AND le.played_at >= :start
              AND le.played_at <= :end
            GROUP BY t.id, t.name, COALESCE(ar.name, 'Unknown Artist'), t.spotify_track_id, al.name, al.image_url
            """
        ),
        {
            "user_id": user_id,
            "source": EXTENDED_HISTORY_SOURCE,
            "start": start,
            "end": end,
        },
    ).fetchall()


def _dedup_and_rank_tracks(rows, limit=None):
    """Merge split track rows that share the same (track_name, artist_name) —
    e.g. remaster/reissue duplicates with distinct track_ids — so plays
    aren't undercounted or double-counted, then rank by summed play count."""
    merged: dict[tuple[str, str], dict] = {}

    for row in rows:
        key = (row.track_name, row.artist_name)
        entry = merged.get(key)
        if entry is None:
            entry = {
                "track_name": row.track_name,
                "artist_name": row.artist_name,
                "spotify_track_id": row.spotify_track_id,
                "album_name": row.album_name,
                "album_image_url": row.album_image_url,
                "play_count": 0,
                "_best_sub_count": -1,
            }
            merged[key] = entry

        entry["play_count"] += row.play_count
        # Attribute display metadata (album, canonical spotify id) from
        # whichever underlying track_id row has the most plays.
        if row.play_count > entry["_best_sub_count"]:
            entry["_best_sub_count"] = row.play_count
            entry["spotify_track_id"] = row.spotify_track_id
            entry["album_name"] = row.album_name
            entry["album_image_url"] = row.album_image_url

    ranked = sorted(
        merged.values(),
        key=lambda entry: (-entry["play_count"], entry["track_name"]),
    )

    for entry in ranked:
        entry.pop("_best_sub_count", None)

    return ranked[:limit] if limit is not None else ranked


@router.get("/wrapped/top-tracks")
async def get_wrapped_top_tracks(
    window: str = Query(...),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: int = 1,
    db: Session = Depends(get_db),
):
    _validate_window(window)
    start, end, anchor = _get_window_bounds(db, user_id, window)
    if anchor is None:
        return []

    rows = _fetch_track_play_rows(db, user_id, start, end)
    ranked = _dedup_and_rank_tracks(rows, limit=limit)

    return [
        {
            "rank": idx,
            "track_name": entry["track_name"],
            "artist_name": entry["artist_name"],
            "spotify_track_id": entry["spotify_track_id"],
            "album_name": entry["album_name"],
            "album_image_url": entry["album_image_url"],
            "play_count": entry["play_count"],
        }
        for idx, entry in enumerate(ranked, start=1)
    ]


@router.get("/wrapped/top-artists")
async def get_wrapped_top_artists(
    window: str = Query(...),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: int = 1,
    db: Session = Depends(get_db),
):
    _validate_window(window)
    start, end, anchor = _get_window_bounds(db, user_id, window)
    if anchor is None:
        return []

    rows = db.execute(
        text(
            """
            SELECT
                ar.id AS artist_id,
                COALESCE(ar.name, 'Unknown Artist') AS artist_name,
                ar.spotify_artist_id,
                ar.image_url AS artist_image_url,
                COUNT(*) AS play_count
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            LEFT JOIN artists ar ON ar.id = t.artist_id
            WHERE le.user_id = :user_id
              AND le.source = :source
              AND le.played_at >= :start
              AND le.played_at <= :end
            GROUP BY ar.id, COALESCE(ar.name, 'Unknown Artist'), ar.spotify_artist_id, ar.image_url
            ORDER BY play_count DESC, artist_name ASC
            LIMIT :limit
            """
        ),
        {
            "user_id": user_id,
            "source": EXTENDED_HISTORY_SOURCE,
            "start": start,
            "end": end,
            "limit": limit,
        },
    ).fetchall()

    return [
        {
            "rank": idx,
            "artist_name": row.artist_name,
            "spotify_artist_id": row.spotify_artist_id,
            "artist_image_url": row.artist_image_url,
            "play_count": row.play_count,
        }
        for idx, row in enumerate(rows, start=1)
    ]


@router.get("/wrapped/top-albums")
async def get_wrapped_top_albums(
    window: str = Query(...),
    limit: int = Query(default=10, ge=1, le=25),
    user_id: int = 1,
    db: Session = Depends(get_db),
):
    _validate_window(window)
    start, end, anchor = _get_window_bounds(db, user_id, window)
    if anchor is None:
        return []

    rows = _fetch_track_play_rows(db, user_id, start, end)
    top_tracks = _dedup_and_rank_tracks(rows, limit=ALBUM_TRACK_POOL_SIZE)

    albums: dict[tuple[str, str], dict] = {}
    for order, entry in enumerate(top_tracks):
        album_name = entry["album_name"] or "Unknown Album"
        artist_name = entry["artist_name"]
        key = (album_name, artist_name)
        album = albums.get(key)
        if album is None:
            album = {
                "album_name": album_name,
                "artist_name": artist_name,
                "album_image_url": entry["album_image_url"],
                "track_count": 0,
                "first_rank_signal": order,
            }
            albums[key] = album
        album["track_count"] += 1

    ranked_albums = sorted(
        albums.values(),
        key=lambda album: (
            -album["track_count"],
            album["first_rank_signal"],
            album["album_name"],
        ),
    )[:limit]

    return [
        {
            "rank": idx,
            "album_name": album["album_name"],
            "artist_name": album["artist_name"],
            "album_image_url": album["album_image_url"],
            "track_count": album["track_count"],
        }
        for idx, album in enumerate(ranked_albums, start=1)
    ]


@router.get("/wrapped/meta")
async def get_wrapped_meta(
    window: str = Query(...),
    user_id: int = 1,
    db: Session = Depends(get_db),
):
    _validate_window(window)
    start, end, anchor = _get_window_bounds(db, user_id, window)

    if anchor is None:
        return {
            "window": window,
            "as_of_date": None,
            "start_date": None,
            "end_date": None,
            "total_events": 0,
        }

    total_events = db.execute(
        text(
            """
            SELECT COUNT(*) AS total_events
            FROM listening_events
            WHERE user_id = :user_id
              AND source = :source
              AND played_at >= :start
              AND played_at <= :end
            """
        ),
        {
            "user_id": user_id,
            "source": EXTENDED_HISTORY_SOURCE,
            "start": start,
            "end": end,
        },
    ).scalar()

    return {
        "window": window,
        # Anchor = latest real extended_history event, kept as as_of_date for
        # backwards compatibility with existing "as of" UI copy.
        "as_of_date": anchor.isoformat() if anchor else None,
        "start_date": start.isoformat() if start else None,
        "end_date": end.isoformat() if end else None,
        "total_events": total_events or 0,
    }
