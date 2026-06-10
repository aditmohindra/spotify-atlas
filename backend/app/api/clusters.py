from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.database.connection import get_db

router = APIRouter()


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
async def get_archetypes(db: Session = Depends(get_db)):
    from sqlalchemy import text
    from collections import defaultdict

    rows = db.execute(text("""
        SELECT cluster_id, name, canonical_name, description, cluster_archetype
        FROM cluster_labels
        ORDER BY name
    """)).fetchall()

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
async def get_related_clusters(cluster_id: int, db: Session = Depends(get_db)):
    from app.services.cluster_relations import get_related_clusters
    related = get_related_clusters(cluster_id, db)
    return {"cluster_id": cluster_id, "related": related}

@router.get("/clusters/{cluster_id}/detail")
async def get_cluster_detail(cluster_id: int, user_id: int = 1, db: Session = Depends(get_db)):
    from sqlalchemy import text

    label = db.execute(text(
        "SELECT cluster_id, name, canonical_name, description, keywords, cluster_archetype FROM cluster_labels WHERE cluster_id = :id"
    ), {"id": cluster_id}).fetchone()

    if not label:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Community not found")

    artists = db.execute(text("""
        SELECT a.name, COUNT(*) as cnt
        FROM track_clusters tc
        JOIN tracks t ON t.id = tc.track_id
        JOIN artists a ON a.id = t.artist_id
        WHERE tc.cluster_id = :id
        GROUP BY a.name
        ORDER BY cnt DESC
        LIMIT 5
    """), {"id": cluster_id}).fetchall()

    tracks = db.execute(text("""
        SELECT t.name, a.name as artist, t.spotify_track_id
        FROM track_clusters tc
        JOIN tracks t ON t.id = tc.track_id
        JOIN artists a ON a.id = t.artist_id
        WHERE tc.cluster_id = :id
        ORDER BY RANDOM()
        LIMIT 8
    """), {"id": cluster_id}).fetchall()

    track_count = db.execute(text(
        "SELECT COUNT(*) FROM track_clusters WHERE cluster_id = :id"
    ), {"id": cluster_id}).scalar()

    user_percentage = None
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

    return {
        "cluster_id": label[0],
        "name": label[1],
        "canonical_name": label[2],
        "description": label[3],
        "keywords": label[4] or [],
        "archetype": label[5],
        "track_count": track_count,
        "top_artists": [r[0] for r in artists],
        "sample_tracks": [{"name": r[0], "artist": r[1], "spotify_id": r[2]} for r in tracks],
        "user_weight": round(user_community[0] or 0, 1)
    }