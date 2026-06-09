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
                "keywords": l.keywords
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

@router.get("/clusters/{cluster_id}/related")
async def get_related_clusters(cluster_id: int, db: Session = Depends(get_db)):
    from app.services.cluster_relations import get_related_clusters
    related = get_related_clusters(cluster_id, db)
    return {"cluster_id": cluster_id, "related": related}