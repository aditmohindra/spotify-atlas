from datetime import datetime
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database.connection import get_db
from app.services.feature_engineering_v2 import parse_tags_from_feature_document

router = APIRouter()

RELIABLE_SOURCES = ("saved_tracks", "recently_played")
LISTENING_SOURCES = ("extended_history",)
VIBE_RUN_ID = 29

EFFECTIVE_VIBE_CLUSTER = """
    CASE
        WHEN ca.assignment_type = 'between_worlds' THEN -1
        WHEN ca.assignment_type = 'soft'           THEN ca.soft_cluster_id
        ELSE ca.cluster_id
    END
"""


def _int_to_roman(n: int) -> str:
    vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"]
    result = ""
    for val, sym in zip(vals, syms):
        count, n = divmod(n, val)
        result += sym * count
    return result


def _default_era_title(era_number: int) -> str:
    return f"Era {_int_to_roman(era_number)}"


class EraLabelUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    mood: str | None = None


def _fetch_dominant_communities(db: Session, cluster_ids: list[int] | None) -> list[dict]:
    if not cluster_ids:
        return []

    rows = db.execute(
        text("""
            SELECT cluster_id, name, cluster_archetype
            FROM cluster_labels
            WHERE cluster_layer = 'vibe'
              AND cluster_id = ANY(:ids)
        """),
        {"ids": cluster_ids},
    ).fetchall()

    by_id = {
        row[0]: {
            "cluster_id": row[0],
            "name": row[1],
            "archetype": row[2],
        }
        for row in rows
    }
    return [by_id[cid] for cid in cluster_ids if cid in by_id]


@router.get("/eras")
async def get_eras(
    user_id: int = 1,
    type: str = Query(default="discovery", pattern="^(discovery|listening)$"),
    db: Session = Depends(get_db),
):
    from app.models.models import UserEra, EraLabel

    eras = (
        db.query(UserEra)
        .filter(UserEra.user_id == user_id, UserEra.era_type == type)
        .order_by(UserEra.era_number)
        .all()
    )

    label_by_era = {
        label.era_id: label
        for label in db.query(EraLabel).filter(
            EraLabel.era_id.in_([e.id for e in eras])
        ).all()
    }

    return [
        {
            "era_id": era.id,
            "era_number": era.era_number,
            "era_type": era.era_type,
            "start_date": era.start_date.isoformat(),
            "end_date": era.end_date.isoformat(),
            "event_count": era.event_count,
            "title": label.title if (label := label_by_era.get(era.id)) else None,
            "description": label.description if label else None,
            "mood": label.mood if label else None,
            "key_tracks": label.key_tracks if label and label.key_tracks else [],
            "is_named": bool(label and label.edited_at is not None),
            "dominant_communities": _fetch_dominant_communities(
                db, era.dominant_cluster_ids
            ),
        }
        for era in eras
    ]


@router.patch("/eras/{era_id}")
async def update_era_label(
    era_id: int,
    body: EraLabelUpdate,
    db: Session = Depends(get_db),
):
    from app.models.models import UserEra, EraLabel

    era = db.query(UserEra).filter(UserEra.id == era_id).first()
    if not era:
        raise HTTPException(status_code=404, detail="Era not found")

    label = db.query(EraLabel).filter(EraLabel.era_id == era_id).first()
    if not label:
        raise HTTPException(status_code=404, detail="Era label not found")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    for field, value in updates.items():
        setattr(label, field, value)
    label.edited_at = datetime.utcnow()
    db.commit()
    db.refresh(label)

    return {
        "era_id": era.id,
        "era_number": era.era_number,
        "title": label.title,
        "description": label.description,
        "mood": label.mood,
        "key_tracks": label.key_tracks or [],
        "edited_at": label.edited_at.isoformat() if label.edited_at else None,
    }


def _rank_by_volume(counts: dict, limit: int) -> list[tuple[str, int]]:
    return sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:limit]


def _distinctiveness_score(era_freq: int, era_total: int, global_freq: int, global_total: int) -> float:
    if era_freq <= 0 or era_total <= 0 or global_freq <= 0 or global_total <= 0:
        return 0.0
    era_share = era_freq / era_total
    global_share = global_freq / global_total
    if global_share == 0:
        return 0.0
    return round(era_share / global_share, 4)


def _take_top_distinct_scores(items: list, limit: int, score_index: int) -> list:
    """Prefer items with unique scores so ranked lists don't collapse to one value."""
    picked: list = []
    seen_scores: set[float] = set()
    for item in items:
        score = item[score_index]
        if score in seen_scores:
            continue
        seen_scores.add(score)
        picked.append(item)
        if len(picked) >= limit:
            return picked
    for item in items:
        if item in picked:
            continue
        picked.append(item)
        if len(picked) >= limit:
            break
    return picked


@router.get("/eras/{era_id}/depth")
async def get_era_depth(
    era_id: int,
    user_id: int = 1,
    limit: int = Query(default=3, ge=1, le=20),
    track_limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    from app.models.models import UserEra, EraLabel

    era = (
        db.query(UserEra)
        .filter(UserEra.id == era_id, UserEra.user_id == user_id)
        .first()
    )
    if not era:
        raise HTTPException(status_code=404, detail="Era not found")

    label = db.query(EraLabel).filter(EraLabel.era_id == era_id).first()
    title = label.title if label else _default_era_title(era.era_number)

    era_sources = LISTENING_SOURCES if era.era_type == "listening" else RELIABLE_SOURCES

    era_rows = db.execute(
        text("""
            SELECT
                le.track_id,
                t.name AS track_name,
                COALESCE(a.name, 'Unknown Artist') AS artist_name,
                a.image_url AS artist_image_url,
                al.image_url AS album_image_url,
                t.feature_document
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            LEFT JOIN artists a ON a.id = t.artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE le.user_id = :user_id
              AND le.source = ANY(:sources)
              AND le.played_at BETWEEN :start_date AND :end_date
        """),
        {
            "user_id": user_id,
            "sources": list(era_sources),
            "start_date": era.start_date,
            "end_date": era.end_date,
        },
    ).fetchall()

    era_total = len(era_rows)
    if era_total == 0:
        return {
            "era_id": era.id,
            "era_number": era.era_number,
            "title": title,
            "start_date": era.start_date.isoformat(),
            "end_date": era.end_date.isoformat(),
            "event_count": era.event_count,
            "top_artists_by_volume": [],
            "top_artists_by_distinctiveness": [],
            "representative_tracks": [],
            "top_genres_moods": [],
            "archetype_breakdown": [],
            "dominant_communities": _fetch_dominant_communities(
                db, era.dominant_cluster_ids
            ),
        }

    artist_counts: Counter[str] = Counter()
    track_counts: Counter[int] = Counter()
    track_meta: dict[int, tuple[str, str, str | None]] = {}
    artist_image_map: dict[str, str | None] = {}
    tag_counts: Counter[str] = Counter()

    for row in era_rows:
        artist_counts[row.artist_name] += 1
        track_counts[row.track_id] += 1
        track_meta[row.track_id] = (row.track_name, row.artist_name, row.album_image_url)
        if row.artist_name not in artist_image_map or not artist_image_map[row.artist_name]:
            artist_image_map[row.artist_name] = row.artist_image_url
        genres, moods = parse_tags_from_feature_document(row.feature_document or "")
        for tag in genres + moods:
            tag_counts[tag] += 1

    global_total = db.execute(
        text("""
            SELECT COUNT(*)
            FROM listening_events
            WHERE user_id = :user_id
              AND source = ANY(:sources)
        """),
        {"user_id": user_id, "sources": list(era_sources)},
    ).scalar() or 0

    global_artist_rows = db.execute(
        text("""
            SELECT COALESCE(a.name, 'Unknown Artist') AS artist_name, COUNT(*) AS cnt
            FROM listening_events le
            JOIN tracks t ON t.id = le.track_id
            LEFT JOIN artists a ON a.id = t.artist_id
            WHERE le.user_id = :user_id
              AND le.source = ANY(:sources)
            GROUP BY COALESCE(a.name, 'Unknown Artist')
        """),
        {"user_id": user_id, "sources": list(era_sources)},
    ).fetchall()

    global_track_rows = db.execute(
        text("""
            SELECT le.track_id, COUNT(*) AS cnt
            FROM listening_events le
            WHERE le.user_id = :user_id
              AND le.source = ANY(:sources)
            GROUP BY le.track_id
        """),
        {"user_id": user_id, "sources": list(era_sources)},
    ).fetchall()

    global_artist_map = {r.artist_name: r.cnt for r in global_artist_rows}
    global_track_map = {r.track_id: r.cnt for r in global_track_rows}

    top_artists_volume = _rank_by_volume(dict(artist_counts), limit)

    artist_distinct = []
    for name, era_freq in artist_counts.items():
        if era_freq < 2:
            continue
        global_freq = global_artist_map.get(name, 0)
        if global_freq <= era_freq:
            continue
        score = _distinctiveness_score(era_freq, era_total, global_freq, global_total)
        artist_distinct.append((name, score, era_freq))
    artist_distinct.sort(key=lambda x: (-x[1], -x[2], x[0]))

    # Discovery-source events (saved_tracks) are one-time per track, so era_freq
    # is almost always 1 — a >=2 threshold would filter out every representative
    # track. Listening-source events (extended_history) are real repeat plays,
    # so >=2 still means something there.
    min_era_frequency = 1 if era.era_type == "discovery" else 2

    track_distinct = []
    for track_id, era_freq in track_counts.items():
        if era_freq < min_era_frequency:
            continue
        global_freq = global_track_map.get(track_id, 0)
        name, artist, album_image_url = track_meta[track_id]
        score = _distinctiveness_score(era_freq, era_total, global_freq, global_total)
        track_distinct.append((name, artist, score, album_image_url))
    track_distinct.sort(key=lambda x: (-x[2], x[0], x[1]))

    archetype_rows = db.execute(
        text(f"""
            SELECT COALESCE(cl.cluster_archetype, 'Unassigned') AS archetype,
                   COUNT(*) AS cnt
            FROM listening_events le
            JOIN clustering_assignments ca
              ON ca.track_id = le.track_id AND ca.run_id = :run_id
            LEFT JOIN cluster_labels cl
              ON cl.cluster_id = {EFFECTIVE_VIBE_CLUSTER}
             AND cl.cluster_layer = 'vibe'
            WHERE le.user_id = :user_id
              AND le.source = ANY(:sources)
              AND le.played_at BETWEEN :start_date AND :end_date
            GROUP BY cl.cluster_archetype
        """),
        {
            "run_id": VIBE_RUN_ID,
            "user_id": user_id,
            "sources": list(era_sources),
            "start_date": era.start_date,
            "end_date": era.end_date,
        },
    ).fetchall()

    archetype_total = sum(r.cnt for r in archetype_rows) or 1
    archetype_breakdown = [
        {
            "archetype": r.archetype,
            "percentage": round(r.cnt / archetype_total * 100, 1),
        }
        for r in sorted(archetype_rows, key=lambda x: -x.cnt)
        if r.archetype
    ]

    top_genres_moods = [
        {"tag": tag, "count": count}
        for tag, count in tag_counts.most_common(5)
    ]

    return {
        "era_id": era.id,
        "era_number": era.era_number,
        "title": title,
        "start_date": era.start_date.isoformat(),
        "end_date": era.end_date.isoformat(),
        "event_count": era.event_count,
        "top_artists_by_volume": [
            {"name": name, "event_count": cnt, "artist_image_url": artist_image_map.get(name)}
            for name, cnt in top_artists_volume
        ],
        "top_artists_by_distinctiveness": [
            {
                "name": name,
                "distinctiveness_score": score,
                "era_frequency": freq,
                "artist_image_url": artist_image_map.get(name),
            }
            for name, score, freq in _take_top_distinct_scores(artist_distinct, limit, 1)
        ],
        "representative_tracks": [
            {"name": name, "artist": artist, "distinctiveness_score": score, "album_image_url": album_image_url}
            for name, artist, score, album_image_url in _take_top_distinct_scores(track_distinct, track_limit, 2)
        ],
        "top_genres_moods": top_genres_moods,
        "archetype_breakdown": archetype_breakdown,
        "dominant_communities": _fetch_dominant_communities(
            db, era.dominant_cluster_ids
        ),
    }
