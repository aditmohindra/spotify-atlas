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