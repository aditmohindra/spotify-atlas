from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.connection import get_db

router = APIRouter()

VALID_WINDOWS = {"short_term", "medium_term", "long_term"}


def _validate_window(window: str) -> str:
    if window not in VALID_WINDOWS:
        raise HTTPException(
            status_code=400,
            detail="window must be 'short_term', 'medium_term', or 'long_term'",
        )
    return f"top_{window}"


@router.get("/wrapped/top-tracks")
async def get_wrapped_top_tracks(
    window: str = Query(...),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: int = 1,
    db: Session = Depends(get_db),
):
    source = _validate_window(window)

    rows = db.execute(
        text(
            """
            SELECT
                le.id AS listening_event_id,
                t.name AS track_name,
                COALESCE(ar.name, 'Unknown Artist') AS artist_name,
                t.spotify_track_id,
                al.name AS album_name
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            LEFT JOIN artists ar ON ar.id = t.artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE le.user_id = :user_id
              AND le.source = :source
            ORDER BY le.id ASC
            LIMIT :limit
            """
        ),
        {"user_id": user_id, "source": source, "limit": limit},
    ).fetchall()

    return [
        {
            "rank": idx,
            "track_name": row.track_name,
            "artist_name": row.artist_name,
            "spotify_track_id": row.spotify_track_id,
            "album_name": row.album_name,
        }
        for idx, row in enumerate(rows, start=1)
    ]


@router.get("/wrapped/top-artists")
async def get_wrapped_top_artists(
    window: str = Query(...),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: int = 1,
    db: Session = Depends(get_db),
):
    source = _validate_window(window)

    rows = db.execute(
        text(
            """
            SELECT
                COALESCE(ar.name, 'Unknown Artist') AS artist_name,
                ar.spotify_artist_id,
                MIN(le.id) AS first_rank_signal
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            LEFT JOIN artists ar ON ar.id = t.artist_id
            WHERE le.user_id = :user_id
              AND le.source = :source
            GROUP BY COALESCE(ar.name, 'Unknown Artist'), ar.spotify_artist_id
            ORDER BY first_rank_signal ASC
            LIMIT :limit
            """
        ),
        {"user_id": user_id, "source": source, "limit": limit},
    ).fetchall()

    return [
        {
            "rank": idx,
            "artist_name": row.artist_name,
            "spotify_artist_id": row.spotify_artist_id,
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
    source = _validate_window(window)

    rows = db.execute(
        text(
            """
            SELECT
                COALESCE(al.name, 'Unknown Album') AS album_name,
                COALESCE(ar.name, 'Unknown Artist') AS artist_name,
                COUNT(*) AS track_count,
                MIN(le.id) AS first_rank_signal
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            LEFT JOIN albums al ON al.id = t.album_id
            LEFT JOIN artists ar ON ar.id = t.artist_id
            WHERE le.user_id = :user_id
              AND le.source = :source
            GROUP BY COALESCE(al.name, 'Unknown Album'), COALESCE(ar.name, 'Unknown Artist')
            ORDER BY track_count DESC, first_rank_signal ASC, album_name ASC
            LIMIT :limit
            """
        ),
        {"user_id": user_id, "source": source, "limit": limit},
    ).fetchall()

    return [
        {
            "rank": idx,
            "album_name": row.album_name,
            "artist_name": row.artist_name,
            "track_count": row.track_count,
        }
        for idx, row in enumerate(rows, start=1)
    ]


@router.get("/wrapped/meta")
async def get_wrapped_meta(
    window: str = Query(...),
    user_id: int = 1,
    db: Session = Depends(get_db),
):
    source = _validate_window(window)

    as_of_date = db.execute(
        text(
            """
            SELECT MAX(created_at) AS as_of_date
            FROM listening_events
            WHERE user_id = :user_id
              AND source = :source
            """
        ),
        {"user_id": user_id, "source": source},
    ).scalar()

    return {
        "window": window,
        "as_of_date": as_of_date.isoformat() if as_of_date else None,
    }
