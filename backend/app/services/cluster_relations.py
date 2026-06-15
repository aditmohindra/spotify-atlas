import numpy as np
from sqlalchemy.orm import Session

_centroid_cache: dict[str, dict] = {}

VIBE_RUN_ID = 29


def _load_centroids(db: Session, layer: str) -> dict:
    global _centroid_cache
    if layer in _centroid_cache:
        return _centroid_cache[layer]

    from app.models.models import ClusterCentroid, VibeClusterCentroid

    if layer == "vibe":
        rows = db.query(VibeClusterCentroid).all()
    else:
        rows = db.query(ClusterCentroid).all()

    centroids = {r.cluster_id: np.array(r.raw_centroid) for r in rows}
    _centroid_cache[layer] = centroids
    print(f"Cached {len(centroids)} {layer} cluster centroids")
    return centroids


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def get_related_clusters(
    cluster_id: int,
    db: Session,
    layer: str = "vibe",
    top_n: int = 5,
) -> list:
    from app.models.models import ClusterLabel

    centroids = _load_centroids(db, layer)

    if cluster_id not in centroids:
        return []

    target = centroids[cluster_id]
    labels = {
        l.cluster_id: l
        for l in db.query(ClusterLabel).filter(ClusterLabel.cluster_layer == layer).all()
    }

    scores = []
    for cid, centroid in centroids.items():
        if cid == cluster_id:
            continue
        sim = cosine_similarity(target, centroid)
        label = labels.get(cid)
        scores.append({
            "cluster_id": cid,
            "name": label.name if label else f"Cluster {cid}",
            "canonical_name": label.canonical_name if label else "",
            "similarity": round(sim, 4),
        })

    scores.sort(key=lambda x: x["similarity"], reverse=True)
    return scores[:top_n]
