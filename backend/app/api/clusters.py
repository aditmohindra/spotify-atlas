import random

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database.connection import get_db

router = APIRouter()

VIBE_RUN_ID = 29

EFFECTIVE_VIBE_CLUSTER = """
    CASE
        WHEN ca.assignment_type = 'between_worlds' THEN -1
        WHEN ca.assignment_type = 'soft'           THEN ca.soft_cluster_id
        ELSE ca.cluster_id
    END
"""


def _validate_layer(layer: str) -> None:
    if layer not in ("vibe", "scene"):
        raise HTTPException(status_code=400, detail="layer must be 'vibe' or 'scene'")


@router.post("/clusters/name")
async def trigger_naming(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    from app.services.cluster_naming import run_cluster_naming
    background_tasks.add_task(run_cluster_naming, db)
    return {"message": "Cluster naming started"}


@router.get("/clusters/labels")
async def get_labels(db: Session = Depends(get_db)):
    from app.models.models import ClusterLabel
    labels = db.query(ClusterLabel).all()
    return {
        "labels": [
            {
                "cluster_id": l.cluster_id,
                "name": l.name,
                "canonical_name": l.canonical_name,
                "description": l.description,
                "keywords": l.keywords,
                "cluster_archetype": l.cluster_archetype
            }
            for l in labels
        ]
    }


@router.get("/clusters/status")
async def naming_status(db: Session = Depends(get_db)):
    from app.models.models import TrackCluster, ClusterLabel
    total = db.query(TrackCluster.cluster_id).distinct().count() - 1
    named = db.query(ClusterLabel).count()
    return {
        "total_clusters": total,
        "named": named,
        "remaining": total - named,
        "completion_pct": round(named / total * 100, 1) if total > 0 else 0
    }


@router.post("/clusters/archetypes/generate")
async def generate_archetypes(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    from app.services.archetype_generation import assign_archetypes
    background_tasks.add_task(assign_archetypes, db)
    return {"message": "Archetype generation started"}


@router.get("/clusters/archetypes")
async def get_archetypes(
    layer: str = Query(default="vibe"),
    db: Session = Depends(get_db),
):
    from collections import defaultdict

    _validate_layer(layer)

    rows = db.execute(text("""
        SELECT cluster_id, name, canonical_name, description, cluster_archetype
        FROM cluster_labels
        WHERE cluster_layer = :layer
        ORDER BY name
    """), {"layer": layer}).fetchall()

    archetypes = defaultdict(list)
    for row in rows:
        archetype = row[4] or "Unassigned"
        archetypes[archetype].append({
            "cluster_id": row[0],
            "name": row[1],
            "canonical_name": row[2],
            "description": row[3]
        })

    return {
        "layer": layer,
        "archetypes": [
            {
                "name": archetype,
                "cluster_count": len(clusters),
                "clusters": clusters
            }
            for archetype, clusters in sorted(archetypes.items())
        ]
    }


@router.get("/clusters/{cluster_id}/related")
async def get_related_clusters(
    cluster_id: int,
    layer: str = Query(default="vibe"),
    db: Session = Depends(get_db),
):
    from app.services.cluster_relations import get_related_clusters as _get_related

    _validate_layer(layer)
    related = _get_related(cluster_id, db, layer=layer)
    return {"cluster_id": cluster_id, "layer": layer, "related": related}


@router.get("/clusters/{cluster_id}/detail")
async def get_cluster_detail(
    cluster_id: int,
    user_id: int = 1,
    layer: str = Query(default="vibe"),
    db: Session = Depends(get_db),
):
    _validate_layer(layer)

    label = db.execute(text(
        """
        SELECT cluster_id, name, canonical_name, description, keywords, cluster_archetype
        FROM cluster_labels
        WHERE cluster_id = :id AND cluster_layer = :layer
        """
    ), {"id": cluster_id, "layer": layer}).fetchone()

    if not label:
        raise HTTPException(status_code=404, detail="Community not found")

    if layer == "vibe":
        all_artist_rows = db.execute(text(f"""
            SELECT a.name, a.image_url, COUNT(*) as cnt
            FROM clustering_assignments ca
            JOIN tracks t ON t.id = ca.track_id
            JOIN artists a ON a.id = t.artist_id
            WHERE ca.run_id = :run_id
              AND {EFFECTIVE_VIBE_CLUSTER} = :id
            GROUP BY a.name, a.image_url
            ORDER BY cnt DESC
        """), {"run_id": VIBE_RUN_ID, "id": cluster_id}).fetchall()

        all_track_rows = db.execute(text(f"""
            SELECT t.name, a.name as artist, t.spotify_track_id, al.image_url as album_image_url
            FROM clustering_assignments ca
            JOIN tracks t ON t.id = ca.track_id
            JOIN artists a ON a.id = t.artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE ca.run_id = :run_id
              AND {EFFECTIVE_VIBE_CLUSTER} = :id
            ORDER BY t.name
        """), {"run_id": VIBE_RUN_ID, "id": cluster_id}).fetchall()

        track_count = db.execute(text(f"""
            SELECT COUNT(*)
            FROM clustering_assignments ca
            WHERE ca.run_id = :run_id
              AND {EFFECTIVE_VIBE_CLUSTER} = :id
        """), {"run_id": VIBE_RUN_ID, "id": cluster_id}).scalar()

        user_community = db.execute(text(f"""
            SELECT
                SUM(CASE
                    WHEN le.source = 'saved_tracks' THEN 2.0
                    WHEN le.source LIKE '%top_short%' THEN 3.0
                    WHEN le.source LIKE '%top_medium%' THEN 2.5
                    WHEN le.source LIKE '%top_long%' THEN 2.0
                    WHEN le.source LIKE 'playlist_%' THEN 1.5
                    ELSE 1.0
                END) as weight
            FROM listening_events le
            JOIN clustering_assignments ca ON ca.track_id = le.track_id
                                          AND ca.run_id = :run_id
            WHERE le.user_id = :uid
              AND {EFFECTIVE_VIBE_CLUSTER} = :id
        """), {"run_id": VIBE_RUN_ID, "uid": user_id, "id": cluster_id}).fetchone()
    else:
        all_artist_rows = db.execute(text("""
            SELECT a.name, a.image_url, COUNT(*) as cnt
            FROM track_clusters tc
            JOIN tracks t ON t.id = tc.track_id
            JOIN artists a ON a.id = t.artist_id
            WHERE tc.cluster_id = :id
            GROUP BY a.name, a.image_url
            ORDER BY cnt DESC
        """), {"id": cluster_id}).fetchall()

        all_track_rows = db.execute(text("""
            SELECT t.name, a.name as artist, t.spotify_track_id, al.image_url as album_image_url
            FROM track_clusters tc
            JOIN tracks t ON t.id = tc.track_id
            JOIN artists a ON a.id = t.artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE tc.cluster_id = :id
            ORDER BY t.name
        """), {"id": cluster_id}).fetchall()

        track_count = db.execute(text(
            "SELECT COUNT(*) FROM track_clusters WHERE cluster_id = :id"
        ), {"id": cluster_id}).scalar()

        user_community = db.execute(text("""
            SELECT
                SUM(CASE
                    WHEN le.source = 'saved_tracks' THEN 2.0
                    WHEN le.source LIKE '%top_short%' THEN 3.0
                    WHEN le.source LIKE '%top_medium%' THEN 2.5
                    WHEN le.source LIKE '%top_long%' THEN 2.0
                    WHEN le.source LIKE 'playlist_%' THEN 1.5
                    ELSE 1.0
                END) as weight
            FROM listening_events le
            JOIN track_clusters tc ON tc.track_id = le.track_id
            WHERE tc.cluster_id = :id AND le.user_id = :uid
        """), {"id": cluster_id, "uid": user_id}).fetchone()

    # top_artists / sample_tracks preserve their prior exact query results
    # (same ordering, same size) — just sliced/sampled from the now-unlimited
    # queries above instead of via a separate LIMIT'd query.
    top_artist_rows = all_artist_rows[:5]
    sample_track_rows = random.sample(all_track_rows, min(8, len(all_track_rows)))

    return {
        "cluster_id": label[0],
        "name": label[1],
        "canonical_name": label[2],
        "description": label[3],
        "keywords": label[4] or [],
        "archetype": label[5],
        "layer": layer,
        "track_count": track_count,
        "top_artists": [{"name": r[0], "artist_image_url": r[1]} for r in top_artist_rows],
        "sample_tracks": [
            {"name": r[0], "artist": r[1], "spotify_id": r[2], "album_image_url": r[3]}
            for r in sample_track_rows
        ],
        "all_artists": [
            {"name": r[0], "artist_image_url": r[1], "track_count": r[2]}
            for r in all_artist_rows
        ],
        "all_tracks": [
            {"name": r[0], "artist": r[1], "album_image_url": r[3], "spotify_id": r[2]}
            for r in all_track_rows
        ],
        "user_weight": round(user_community[0] or 0, 1)
    }


@router.get("/communities/meta")
async def get_communities_meta(db: Session = Depends(get_db)):
    from datetime import datetime

    year = datetime.utcnow().year

    new_this_year = db.execute(text("""
        SELECT COUNT(DISTINCT cluster_id) FROM clustering_assignments
        WHERE run_id = :run_id AND assignment_type = 'hard' AND cluster_id IN (
            SELECT DISTINCT ca.cluster_id
            FROM clustering_assignments ca
            JOIN listening_events le ON le.track_id = ca.track_id
            WHERE ca.run_id = :run_id
              AND le.source = 'extended_history'
              AND EXTRACT(YEAR FROM le.played_at) = :year
        )
        AND cluster_id NOT IN (
            SELECT DISTINCT ca2.cluster_id
            FROM clustering_assignments ca2
            JOIN listening_events le2 ON le2.track_id = ca2.track_id
            WHERE ca2.run_id = :run_id
              AND le2.source = 'extended_history'
              AND EXTRACT(YEAR FROM le2.played_at) < :year
        )
    """), {"run_id": VIBE_RUN_ID, "year": year}).scalar() or 0

    return {"year": year, "new_communities_this_year": new_this_year}
