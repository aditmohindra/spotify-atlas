"""
Compute vibe community centroids from Run 29 hard cluster assignments.
Uses vibe embeddings (document_type='vibe') — only hard cluster members (cluster_id != -1).
Stores in vibe_cluster_centroids table.

Usage:
    uv run python ml/clustering/compute_vibe_centroids.py
"""
import os
import sys
import random
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import ClusteringAssignment, TrackEmbedding, VibeClusterCentroid

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

VIBE_RUN_ID = 29


def compute_vibe_centroids():
    db = SessionLocal()
    try:
        # Always start fresh
        db.execute(text("DELETE FROM vibe_cluster_centroids"))
        db.commit()
        print("Cleared existing rows from vibe_cluster_centroids")

        # Load all distinct hard cluster_ids for Run 29
        cluster_ids = sorted(set(
            r[0] for r in db.query(ClusteringAssignment.cluster_id)
            .filter(
                ClusteringAssignment.run_id == VIBE_RUN_ID,
                ClusteringAssignment.cluster_id != -1,
            )
            .distinct()
            .all()
        ))
        print(f"Found {len(cluster_ids)} hard clusters in Run {VIBE_RUN_ID}")

        track_counts = []
        skipped = 0

        for i, cluster_id in enumerate(cluster_ids):
            # Track IDs for this hard cluster
            track_ids = [
                r[0] for r in db.query(ClusteringAssignment.track_id)
                .filter(
                    ClusteringAssignment.run_id == VIBE_RUN_ID,
                    ClusteringAssignment.cluster_id == cluster_id,
                )
                .all()
            ]
            n = len(track_ids)

            # Vibe embeddings for these tracks
            emb_rows = (
                db.query(TrackEmbedding.vector)
                .filter(
                    TrackEmbedding.track_id.in_(track_ids),
                    TrackEmbedding.document_type == 'vibe',
                )
                .all()
            )
            if not emb_rows:
                print(f"  WARNING cluster {cluster_id}: no vibe embeddings — skipping")
                skipped += 1
                continue

            raw_centroid = np.mean(np.array([r[0] for r in emb_rows]), axis=0).tolist()
            track_counts.append(n)

            db.add(VibeClusterCentroid(
                cluster_id=cluster_id,
                raw_centroid=raw_centroid,
                track_count=n,
            ))

            if (i + 1) % 10 == 0:
                db.commit()
                print(f"  Progress: {i + 1}/{len(cluster_ids)} clusters processed")

        db.commit()

        computed = len(cluster_ids) - skipped
        avg = round(float(np.mean(track_counts)), 1) if track_counts else 0
        print(f"\nComputed vibe centroids for {computed} clusters (skipped {skipped})")
        print(f"Avg track count per cluster: {avg}")

        # Spot-check 3 random centroids
        all_centroids = db.query(VibeClusterCentroid).all()
        sample = random.sample(all_centroids, min(3, len(all_centroids)))
        print("\nSpot-check (3 random centroids):")
        for c in sample:
            dim = len(c.raw_centroid) if c.raw_centroid else 0
            print(f"  cluster_id={c.cluster_id}  tracks={c.track_count}  raw={dim}D")

        return computed

    finally:
        db.close()


if __name__ == "__main__":
    compute_vibe_centroids()
