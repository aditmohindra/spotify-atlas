"""
HDBSCAN clustering pipeline for experiment runs.

Reads 15D coordinates from track_cluster_coordinates (keyed by run_id),
clusters them, computes quality metrics, and writes results to
clustering_assignments. Never touches the production track_clusters table.
"""
import os
import sys
import numpy as np
from collections import Counter
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import (
    Track, Artist,
    TrackClusterCoordinate,
    ClusteringAssignment,
)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def load_cluster_coordinates(db, run_id: int, coords_run_id: int = None):
    """Load ND coordinates for clustering.

    coords_run_id: if provided, coordinates are read from this run instead of
    run_id. Useful when reusing an existing UMAP projection for a new
    HDBSCAN-only experiment.
    """
    source = coords_run_id if coords_run_id is not None else run_id
    if coords_run_id is not None:
        print(f"Loading 15D coordinates from run_id={source} (reused for run_id={run_id})...")
    else:
        print(f"Loading 15D coordinates for run_id={source}...")
    rows = (
        db.query(TrackClusterCoordinate)
        .filter(TrackClusterCoordinate.run_id == source)
        .all()
    )
    if not rows:
        raise ValueError(
            f"No coordinates found for run_id={source}. "
            "Run umap_cluster_pipeline.py first."
        )
    track_ids = [r.track_id for r in rows]
    vectors = np.array([r.components for r in rows])
    print(f"Loaded {len(vectors)} coordinate vectors (shape {vectors.shape})")
    return track_ids, vectors


def run_hdbscan(
    vectors: np.ndarray,
    min_cluster_size: int = 25,
    min_samples: int = 10,
):
    import hdbscan

    print(f"Running HDBSCAN: min_cluster_size={min_cluster_size}, min_samples={min_samples}")
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric="euclidean",
        cluster_selection_method="eom",
        prediction_data=True,
    )
    labels = clusterer.fit_predict(vectors)
    probabilities = clusterer.probabilities_

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = int((labels == -1).sum())
    print(f"Found {n_clusters} clusters")
    print(f"Noise points: {n_noise} ({n_noise / len(labels) * 100:.1f}%)")

    return labels, probabilities, clusterer


def compute_metrics(vectors: np.ndarray, labels: np.ndarray):
    from collections import Counter

    label_counts = Counter(labels[labels != -1])
    n_clusters = len(label_counts)
    n_noise = int((labels == -1).sum())
    noise_ratio = n_noise / len(labels)

    cluster_sizes = list(label_counts.values())
    median_size = float(np.median(cluster_sizes)) if cluster_sizes else 0.0
    largest_size = int(max(cluster_sizes)) if cluster_sizes else 0

    silhouette = None
    if n_clusters >= 2:
        from sklearn.metrics import silhouette_score

        mask = labels != -1
        X_valid = vectors[mask]
        y_valid = labels[mask]

        if len(X_valid) > 2000:
            rng = np.random.default_rng(42)
            idx = rng.choice(len(X_valid), size=2000, replace=False)
            X_valid = X_valid[idx]
            y_valid = y_valid[idx]

        try:
            silhouette = float(silhouette_score(X_valid, y_valid, metric="euclidean"))
        except Exception as e:
            print(f"Warning: silhouette_score failed: {e}")

    return {
        "num_clusters": n_clusters,
        "noise_ratio": noise_ratio,
        "median_cluster_size": median_size,
        "largest_cluster_size": largest_size,
        "silhouette_score": silhouette,
    }


def save_assignments(db, run_id: int, track_ids: list, labels: np.ndarray, probabilities: np.ndarray):
    print("Saving cluster assignments...")
    rows = [
        ClusteringAssignment(
            run_id=run_id,
            track_id=track_id,
            cluster_id=int(label),
            probability=float(prob),
        )
        for track_id, label, prob in zip(track_ids, labels, probabilities)
    ]
    db.bulk_save_objects(rows)
    db.commit()
    print(f"Saved {len(rows)} assignments to clustering_assignments (run_id={run_id})")
    return len(rows)


def run_clustering_experiment(
    run_id: int,
    min_cluster_size: int = 25,
    min_samples: int = 10,
    document_type: str = "original",
    coords_run_id: int = None,
):
    """Run HDBSCAN for a clustering experiment.

    coords_run_id: when supplied, coordinates are loaded from this run_id
    instead of the new run_id. Assignments are always saved under run_id.
    """
    db = SessionLocal()
    try:
        track_ids, vectors = load_cluster_coordinates(db, run_id, coords_run_id=coords_run_id)
        labels, probabilities, clusterer = run_hdbscan(
            vectors,
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
        )
        metrics = compute_metrics(vectors, labels)
        save_assignments(db, run_id, track_ids, labels, probabilities)

        print(f"\n=== CLUSTERING SUMMARY (run_id={run_id}) ===")
        print(f"  Clusters:        {metrics['num_clusters']}")
        print(f"  Noise count:     {int(metrics['noise_ratio'] * len(labels))}")
        print(f"  Noise ratio:     {metrics['noise_ratio'] * 100:.1f}%")
        print(f"  Silhouette:      {metrics['silhouette_score']:.4f}" if metrics['silhouette_score'] is not None else "  Silhouette:      N/A")
        print(f"  Median cluster:  {metrics['median_cluster_size']:.1f} tracks")
        print(f"  Largest cluster: {metrics['largest_cluster_size']} tracks")

        return metrics

    finally:
        db.close()


# ---------------------------------------------------------------------------
# Legacy helpers kept for backward compatibility (inspect / export / stats)
# These still work standalone but no longer touch track_clusters.
# ---------------------------------------------------------------------------

def print_cluster_stats(labels):
    label_counts = Counter(labels)
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)

    print(f"\n=== CLUSTER STATISTICS ===")
    print(f"Total clusters: {n_clusters}")
    print(f"Noise points (-1): {label_counts.get(-1, 0)}")
    print(f"\nTop 20 clusters by size:")

    sorted_clusters = sorted(
        [(k, v) for k, v in label_counts.items() if k != -1],
        key=lambda x: x[1],
        reverse=True,
    )
    for cluster_id, count in sorted_clusters[:20]:
        print(f"  Cluster {cluster_id}: {count} tracks")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run HDBSCAN clustering experiment.")
    parser.add_argument("run_id", type=int)
    parser.add_argument("--min-cluster-size", type=int, default=25)
    parser.add_argument("--min-samples", type=int, default=10)
    parser.add_argument("--document-type", type=str, default="original")
    args = parser.parse_args()

    run_clustering_experiment(
        run_id=args.run_id,
        min_cluster_size=args.min_cluster_size,
        min_samples=args.min_samples,
        document_type=args.document_type,
    )
