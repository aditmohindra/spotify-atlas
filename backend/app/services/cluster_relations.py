import numpy as np
from sqlalchemy.orm import Session
from collections import defaultdict

_centroid_cache = None


def compute_cluster_centroids(db: Session) -> dict:
    global _centroid_cache
    if _centroid_cache is not None:
        return _centroid_cache

    from app.models.models import TrackCluster, TrackEmbedding

    print("Computing cluster centroids (first time)...")

    clusters = db.query(TrackCluster).all()
    cluster_track_ids = defaultdict(list)
    for c in clusters:
        if c.cluster_id != -1:
            cluster_track_ids[c.cluster_id].append(c.track_id)

    embeddings = db.query(TrackEmbedding).all()
    embedding_map = {e.track_id: np.array(e.vector) for e in embeddings}

    centroids = {}
    for cluster_id, track_ids in cluster_track_ids.items():
        vecs = [embedding_map[tid] for tid in track_ids if tid in embedding_map]
        if vecs:
            centroids[cluster_id] = np.mean(vecs, axis=0)

    _centroid_cache = centroids
    print(f"Cached {len(centroids)} cluster centroids")
    return _centroid_cache


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def get_related_clusters(cluster_id: int, db: Session, top_n: int = 5) -> list:
    from app.models.models import ClusterLabel

    centroids = compute_cluster_centroids(db)

    if cluster_id not in centroids:
        return []

    target = centroids[cluster_id]
    labels = {l.cluster_id: l for l in db.query(ClusterLabel).all()}

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
            "similarity": round(sim, 4)
        })

    scores.sort(key=lambda x: x["similarity"], reverse=True)
    return scores[:top_n]