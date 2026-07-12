"""
Compute per-community cohesion scores for vibe clusters (Run 29).

Cohesion = average cosine similarity of each hard-assigned track's vibe
embedding to the community centroid (from vibe_cluster_centroids).

Stored as a raw 0–1 float on cluster_labels.cohesion_score (vibe layer).
The API/UI may scale by 10 for a 0–10 display.

Usage (from backend/):
    uv run python ml/clustering/compute_cohesion.py
"""
import os
import sys
import random

import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))
sys.path.append(os.path.join(os.path.dirname(__file__), "../.."))

from app.models.models import (
    ClusteringAssignment,
    TrackEmbedding,
    VibeClusterCentroid,
    ClusterLabel,
)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

VIBE_RUN_ID = 29
LAYER = "vibe"


def cosine_similarity_batch(vectors: np.ndarray, centroid: np.ndarray) -> np.ndarray:
    """Cosine similarity of each row in `vectors` to `centroid`."""
    c_norm = np.linalg.norm(centroid)
    if c_norm == 0:
        return np.zeros(len(vectors))
    v_norms = np.linalg.norm(vectors, axis=1)
    # Avoid divide-by-zero for zero vectors
    safe_norms = np.where(v_norms == 0, 1.0, v_norms)
    dots = vectors @ centroid
    sims = dots / (safe_norms * c_norm)
    sims = np.where(v_norms == 0, 0.0, sims)
    return sims


def compute_cohesion():
    db = SessionLocal()
    try:
        centroids = {
            c.cluster_id: np.array(c.raw_centroid, dtype=np.float64)
            for c in db.query(VibeClusterCentroid).all()
        }
        if not centroids:
            print("ERROR: vibe_cluster_centroids is empty. Run compute_vibe_centroids.py first.")
            return 0

        cluster_ids = sorted(centroids.keys())
        print(f"Computing cohesion for {len(cluster_ids)} vibe communities...")

        scores: list[tuple[int, float, int]] = []  # (cluster_id, cohesion, n_tracks)
        skipped = 0

        for i, cluster_id in enumerate(cluster_ids):
            track_ids = [
                r[0]
                for r in db.query(ClusteringAssignment.track_id)
                .filter(
                    ClusteringAssignment.run_id == VIBE_RUN_ID,
                    ClusteringAssignment.cluster_id == cluster_id,
                    ClusteringAssignment.assignment_type == "hard",
                )
                .all()
            ]
            if not track_ids:
                print(f"  WARNING cluster {cluster_id}: no hard assignments — skipping")
                skipped += 1
                continue

            emb_rows = (
                db.query(TrackEmbedding.vector)
                .filter(
                    TrackEmbedding.track_id.in_(track_ids),
                    TrackEmbedding.document_type == "vibe",
                )
                .all()
            )
            if not emb_rows:
                print(f"  WARNING cluster {cluster_id}: no vibe embeddings — skipping")
                skipped += 1
                continue

            vectors = np.array([r[0] for r in emb_rows], dtype=np.float64)
            centroid = centroids[cluster_id]
            sims = cosine_similarity_batch(vectors, centroid)
            cohesion = float(np.mean(sims))

            updated = (
                db.query(ClusterLabel)
                .filter(
                    ClusterLabel.cluster_id == cluster_id,
                    ClusterLabel.cluster_layer == LAYER,
                )
                .update({"cohesion_score": cohesion}, synchronize_session=False)
            )
            if updated == 0:
                print(f"  WARNING cluster {cluster_id}: no vibe cluster_labels row — skipping write")
                skipped += 1
                continue

            scores.append((cluster_id, cohesion, len(emb_rows)))

            if (i + 1) % 20 == 0:
                db.commit()
                print(f"  Progress: {i + 1}/{len(cluster_ids)}")

        db.commit()

        if not scores:
            print("No cohesion scores computed.")
            return 0

        vals = np.array([s[1] for s in scores])
        print(f"\nComputed cohesion for {len(scores)} communities (skipped {skipped})")
        print(
            f"Distribution (raw 0–1): "
            f"min={vals.min():.4f}  max={vals.max():.4f}  "
            f"mean={vals.mean():.4f}  median={np.median(vals):.4f}"
        )
        # Same stretch used by the API for 0–10 display (floor 0.88)
        display = np.clip((vals - 0.88) / (1.0 - 0.88) * 10, 0, 10)
        print(
            f"Display scale (0.88→0 / 1.0→10): "
            f"min={display.min():.2f}  max={display.max():.2f}  "
            f"mean={display.mean():.2f}"
        )

        # Spot-check: highest and lowest cohesion communities
        by_score = sorted(scores, key=lambda x: x[1])
        labels = {
            l.cluster_id: l
            for l in db.query(ClusterLabel)
            .filter(ClusterLabel.cluster_layer == LAYER)
            .all()
        }

        print("\nLowest cohesion (most eclectic):")
        for cid, score, n in by_score[:5]:
            label = labels.get(cid)
            name = label.name if label else f"Cluster {cid}"
            disp = max(0.0, min(10.0, (score - 0.88) / 0.12 * 10))
            print(f"  {cid:>3}  raw={score:.4f}  display={disp:.2f}/10  n={n}  {name}")

        print("\nHighest cohesion (tightest):")
        for cid, score, n in by_score[-5:][::-1]:
            label = labels.get(cid)
            name = label.name if label else f"Cluster {cid}"
            disp = max(0.0, min(10.0, (score - 0.88) / 0.12 * 10))
            print(f"  {cid:>3}  raw={score:.4f}  display={disp:.2f}/10  n={n}  {name}")

        sample = random.sample(scores, min(3, len(scores)))
        print("\nRandom spot-check:")
        for cid, score, n in sample:
            label = labels.get(cid)
            name = label.name if label else f"Cluster {cid}"
            disp = max(0.0, min(10.0, (score - 0.88) / 0.12 * 10))
            print(f"  {cid:>3}  raw={score:.4f}  display={disp:.2f}/10  n={n}  {name}")

        return len(scores)

    finally:
        db.close()


if __name__ == "__main__":
    compute_cohesion()
