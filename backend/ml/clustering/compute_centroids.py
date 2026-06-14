"""
Compute community centroids for Phase 15 recursive clustering.
Stores three representations per community:
- raw_centroid: 1536D mean of scene embeddings (primary archetype clustering signal)
- umap15_centroid: 15D mean of run 18 UMAP coordinates (sanity check)
- map2d_centroid: 2D mean of visualization coordinates (galaxy map labels)

Usage:
    uv run python ml/clustering/compute_centroids.py            # uses track_clusters
    uv run python ml/clustering/compute_centroids.py --run-id 18  # uses clustering_assignments
"""
import argparse
import os
import sys
import random
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import (
    TrackCluster, TrackEmbedding, TrackClusterCoordinate,
    TrackCoordinate, ClusterCentroid, ClusteringAssignment,
)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Run 18 reused UMAP coordinates from run 16 — see clustering_runs.notes
UMAP_RUN_ID = 16


def _load_cluster_map(db, run_id: int | None) -> dict[int, list[int]]:
    """Return {cluster_id: [track_id, ...]} from the appropriate source."""
    cluster_map: dict[int, list[int]] = {}

    if run_id is not None:
        print(f"Loading from clustering_assignments run_id={run_id}")
        rows = (
            db.query(ClusteringAssignment.cluster_id, ClusteringAssignment.track_id)
            .filter(
                ClusteringAssignment.run_id == run_id,
                ClusteringAssignment.cluster_id != -1,
            )
            .all()
        )
    else:
        print("Loading from track_clusters")
        rows = (
            db.query(TrackCluster.cluster_id, TrackCluster.track_id)
            .filter(TrackCluster.cluster_id != -1)
            .all()
        )

    for cluster_id, track_id in rows:
        cluster_map.setdefault(cluster_id, []).append(track_id)

    return cluster_map


def compute_centroids(run_id: int | None = None):
    db = SessionLocal()
    try:
        # Always start fresh
        db.execute(text("DELETE FROM cluster_centroids"))
        db.commit()
        print("Cleared existing rows from cluster_centroids")

        cluster_map = _load_cluster_map(db, run_id)
        cluster_ids = sorted(cluster_map)
        source_label = f"clustering_assignments run_id={run_id}" if run_id is not None else "track_clusters"
        print(f"Found {len(cluster_ids)} clusters from {source_label}")

        track_counts = []

        for i, cluster_id in enumerate(cluster_ids):
            track_ids = cluster_map[cluster_id]
            n = len(track_ids)
            track_counts.append(n)

            # raw_centroid: 1536D mean of scene embeddings (always document_type='scene')
            emb_rows = (
                db.query(TrackEmbedding.vector)
                .filter(
                    TrackEmbedding.track_id.in_(track_ids),
                    TrackEmbedding.document_type == 'scene',
                )
                .all()
            )
            if not emb_rows:
                print(f"  WARNING cluster {cluster_id}: no scene embeddings — skipping")
                continue
            raw_centroid = np.mean(np.array([r[0] for r in emb_rows]), axis=0).tolist()

            # --- umap15_centroid: 15D UMAP coordinates from run 18 ---
            umap_rows = (
                db.query(TrackClusterCoordinate.components)
                .filter(
                    TrackClusterCoordinate.track_id.in_(track_ids),
                    TrackClusterCoordinate.run_id == UMAP_RUN_ID,
                )
                .all()
            )
            umap15_centroid = None
            if umap_rows:
                umap15_centroid = np.mean(np.array([r[0] for r in umap_rows]), axis=0).tolist()

            # --- map2d_centroid: 2D visualization coordinates ---
            coord_rows = (
                db.query(TrackCoordinate.x, TrackCoordinate.y)
                .filter(TrackCoordinate.track_id.in_(track_ids))
                .all()
            )
            map2d_centroid = None
            if coord_rows:
                pts = np.array([[r[0], r[1]] for r in coord_rows])
                map2d_centroid = np.mean(pts, axis=0).tolist()

            centroid = ClusterCentroid(
                cluster_id=cluster_id,
                raw_centroid=raw_centroid,
                umap15_centroid=umap15_centroid,
                map2d_centroid=map2d_centroid,
                track_count=n,
            )
            db.add(centroid)

            if (i + 1) % 25 == 0:
                db.commit()
                print(f"  Progress: {i + 1}/{len(cluster_ids)} clusters processed")

        db.commit()

        # Summary
        avg_tracks = np.mean(track_counts).round(1) if track_counts else 0
        print(
            f"\nComputed centroids for {len(cluster_ids)} clusters. "
            f"Avg track count: {avg_tracks}. "
            f"Dimensions: raw=1536, umap15=15, map2d=2"
        )

        # Summary stats
        all_centroids = db.query(ClusterCentroid).all()
        all_cids = sorted(c.cluster_id for c in all_centroids)
        print(f"Cluster IDs: min={all_cids[0]}, max={all_cids[-1]}, total={len(all_cids)}")

        # Spot-check 3 random centroids
        sample = random.sample(all_centroids, min(3, len(all_centroids)))
        print("\nSpot-check (3 random centroids):")
        for c in sample:
            raw_dim = len(c.raw_centroid) if c.raw_centroid else 0
            u15_dim = len(c.umap15_centroid) if c.umap15_centroid else 0
            m2d_dim = len(c.map2d_centroid) if c.map2d_centroid else 0
            print(
                f"  cluster_id={c.cluster_id}  tracks={c.track_count}"
                f"  raw={raw_dim}D  umap15={u15_dim}D  map2d={m2d_dim}D"
            )

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute cluster centroids.")
    parser.add_argument(
        "--run-id",
        type=int,
        default=None,
        metavar="RUN_ID",
        help="Load assignments from clustering_assignments WHERE run_id=RUN_ID. "
             "Omit to load from track_clusters (production behavior).",
    )
    args = parser.parse_args()
    compute_centroids(run_id=args.run_id)
