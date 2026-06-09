from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.connection import get_db
from collections import defaultdict

router = APIRouter()


@router.get("/profile/taste")
async def get_taste_profile(user_id: int = 1, db: Session = Depends(get_db)):
    from app.models.models import ListeningEvent, Track, TrackCluster, ClusterLabel

    events = db.query(ListeningEvent).filter(
        ListeningEvent.user_id == user_id
    ).all()

    track_weights = defaultdict(float)

    for event in events:
        weight = 1.0
        if event.source == "saved_tracks":
            weight = 2.0
        elif event.source and event.source.startswith("top_"):
            if "short" in event.source:
                weight = 3.0
            elif "medium" in event.source:
                weight = 2.5
            elif "long" in event.source:
                weight = 2.0
        elif event.source and event.source.startswith("playlist_"):
            weight = 1.5
        elif event.source == "recently_played":
            weight = 3.0

        track_weights[event.track_id] += weight

    cluster_weights = defaultdict(float)
    for track_id, weight in track_weights.items():
        cluster = db.query(TrackCluster).filter(
            TrackCluster.track_id == track_id
        ).first()
        if cluster:
            cluster_weights[cluster.cluster_id] += weight

    noise_weight = cluster_weights.pop(-1, 0)
    total_weight = sum(cluster_weights.values())

    if total_weight == 0:
        return {"total_tracks": 0, "communities": []}

    labels = {
        l.cluster_id: l
        for l in db.query(ClusterLabel).all()
    }

    communities = []
    for cluster_id, weight in sorted(
        cluster_weights.items(),
        key=lambda x: x[1],
        reverse=True
    ):
        label = labels.get(cluster_id)
        percentage = round((weight / total_weight) * 100, 1)

        communities.append({
            "cluster_id": cluster_id,
            "name": label.name if label else f"Cluster {cluster_id}",
            "canonical_name": label.canonical_name if label else "",
            "description": label.description if label else "",
            "keywords": label.keywords if label else [],
            "percentage": percentage,
            "weight": round(weight, 1)
        })

    return {
        "user_id": user_id,
        "total_weight": round(total_weight, 1),
        "communities": communities[:50]
    }