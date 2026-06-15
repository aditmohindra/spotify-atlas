"""
Soft assignment for Run 29 noise tracks.
For each noise track, finds nearest vibe community by cosine similarity to centroids.
Assigns soft_cluster_id if similarity >= threshold, else marks as 'between_worlds'.

Usage:
    uv run python ml/clustering/soft_noise_assignment.py --threshold 0.85 --dry-run
    uv run python ml/clustering/soft_noise_assignment.py --threshold 0.85
    uv run python ml/clustering/soft_noise_assignment.py --kanye-audit
"""
import argparse
import os
import sys
from collections import defaultdict, Counter

import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import (
    ClusteringAssignment, TrackEmbedding, VibeClusterCentroid,
    Track, Artist,
)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

VIBE_RUN_ID = 29
DEFAULT_THRESHOLD = 0.85


# ---------------------------------------------------------------------------
# Core similarity helpers
# ---------------------------------------------------------------------------

def load_centroids(db) -> tuple[list[int], np.ndarray]:
    """Return (cluster_ids, normalized centroid matrix [N x 1536])."""
    rows = db.query(VibeClusterCentroid).order_by(VibeClusterCentroid.cluster_id).all()
    if not rows:
        print("ERROR: vibe_cluster_centroids is empty. Run compute_vibe_centroids.py first.")
        sys.exit(1)
    cluster_ids = [r.cluster_id for r in rows]
    matrix = np.array([r.raw_centroid for r in rows], dtype=np.float32)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    centroids_norm = matrix / norms
    print(f"Loaded {len(cluster_ids)} vibe centroids (shape {matrix.shape})")
    return cluster_ids, centroids_norm


def nearest_centroid(track_vec: np.ndarray, centroids_norm: np.ndarray) -> tuple[int, float]:
    """Return (index_into_centroids, cosine_similarity) for the nearest centroid."""
    v = track_vec.astype(np.float32)
    n = np.linalg.norm(v)
    if n == 0:
        return 0, 0.0
    v_norm = v / n
    sims = centroids_norm @ v_norm
    idx = int(np.argmax(sims))
    return idx, float(sims[idx])


def load_noise_assignments(db) -> list[ClusteringAssignment]:
    return (
        db.query(ClusteringAssignment)
        .filter(
            ClusteringAssignment.run_id == VIBE_RUN_ID,
            ClusteringAssignment.cluster_id == -1,
        )
        .all()
    )


def load_vibe_embedding(db, track_id: int) -> np.ndarray | None:
    row = (
        db.query(TrackEmbedding.vector)
        .filter(
            TrackEmbedding.track_id == track_id,
            TrackEmbedding.document_type == 'vibe',
        )
        .first()
    )
    return np.array(row[0], dtype=np.float32) if row else None


def get_top_artists_in_cluster(db, cluster_id: int, limit: int = 5) -> list[str]:
    track_ids = [
        r[0] for r in db.query(ClusteringAssignment.track_id)
        .filter(
            ClusteringAssignment.run_id == VIBE_RUN_ID,
            ClusteringAssignment.cluster_id == cluster_id,
        )
        .all()
    ]
    counts: dict[str, int] = defaultdict(int)
    for _, a in (
        db.query(Track, Artist)
        .join(Artist, Track.artist_id == Artist.id)
        .filter(Track.id.in_(track_ids))
        .all()
    ):
        counts[a.name] += 1
    return [n for n, _ in sorted(counts.items(), key=lambda x: -x[1])[:limit]]


# ---------------------------------------------------------------------------
# Kanye audit
# ---------------------------------------------------------------------------

def run_kanye_audit(db):
    print("\n=== KANYE AUDIT ===")
    print("Finding all Kanye West noise tracks in Run 29...\n")

    kanye = db.query(Artist).filter(Artist.name == "Kanye West").first()
    if kanye is None:
        print("ERROR: Artist 'Kanye West' not found in artists table.")
        return

    kanye_tracks = db.query(Track).filter(Track.artist_id == kanye.id).all()
    kanye_track_ids = {t.id for t in kanye_tracks}
    kanye_track_map = {t.id: t.name for t in kanye_tracks}

    noise_assignments = load_noise_assignments(db)
    kanye_noise = [a for a in noise_assignments if a.track_id in kanye_track_ids]

    print(f"Kanye tracks total: {len(kanye_tracks)}")
    print(f"Kanye noise tracks (cluster_id=-1): {len(kanye_noise)}")

    if not kanye_noise:
        print("No Kanye noise tracks found — he's fully clustered!")
        return

    cluster_ids_list, centroids_norm = load_centroids(db)

    print(f"\n{'Track name':<40} | {'Nearest cluster':>15} | {'Similarity':>10} | assignment_type")
    print("-" * 90)

    nearest_cluster_counts: Counter = Counter()

    for assignment in kanye_noise:
        track_name = kanye_track_map.get(assignment.track_id, f"track_id={assignment.track_id}")
        vec = load_vibe_embedding(db, assignment.track_id)

        if vec is None:
            print(f"  {track_name:<38} | {'NO EMBEDDING':>15} | {'N/A':>10} | —")
            continue

        idx, sim = nearest_centroid(vec, centroids_norm)
        nearest_cid = cluster_ids_list[idx]
        nearest_cluster_counts[nearest_cid] += 1

        assignment_type = 'soft' if sim >= DEFAULT_THRESHOLD else 'between_worlds'
        print(f"  {track_name:<38} | {nearest_cid:>15} | {sim:>10.4f} | {assignment_type}")

    # Top 5 artists in each nearest cluster that appeared
    print(f"\n--- Top artists in nearest clusters ---")
    for cid, count in nearest_cluster_counts.most_common():
        top_artists = get_top_artists_in_cluster(db, cid, limit=5)
        print(f"\n  Cluster {cid} (attracted {count} Kanye noise tracks):")
        for a in top_artists:
            print(f"    {a}")


# ---------------------------------------------------------------------------
# Full soft assignment
# ---------------------------------------------------------------------------

def run_soft_assignment(db, threshold: float, dry_run: bool):
    cluster_ids_list, centroids_norm = load_centroids(db)
    noise_assignments = load_noise_assignments(db)

    print(f"\nNoise tracks to process: {len(noise_assignments)}")
    print(f"Threshold: {threshold}")
    print(f"Mode: {'DRY RUN' if dry_run else 'WRITE'}\n")

    n_soft = 0
    n_between = 0
    n_missing_emb = 0

    dry_run_rows: list[dict] = []

    for i, assignment in enumerate(noise_assignments):
        vec = load_vibe_embedding(db, assignment.track_id)

        if vec is None:
            n_missing_emb += 1
            continue

        idx, sim = nearest_centroid(vec, centroids_norm)
        nearest_cid = cluster_ids_list[idx]

        if sim >= threshold:
            atype = 'soft'
            n_soft += 1
        else:
            atype = 'between_worlds'
            nearest_cid = None
            n_between += 1

        if dry_run:
            if len(dry_run_rows) < 20:
                track = db.query(Track).filter(Track.id == assignment.track_id).first()
                dry_run_rows.append({
                    "track": track.name if track else f"id={assignment.track_id}",
                    "nearest_cluster": cluster_ids_list[idx],
                    "similarity": sim,
                    "assignment_type": atype,
                })
        else:
            assignment.assignment_type = atype
            assignment.soft_cluster_id = nearest_cid
            assignment.soft_similarity = sim if nearest_cid is not None else None

        if (i + 1) % 100 == 0:
            if not dry_run:
                db.commit()
            print(f"  Processed {i + 1}/{len(noise_assignments)}")

    if not dry_run:
        db.commit()

    # Hard assignments: mark remaining (non-noise) rows as 'hard' if not yet set
    if not dry_run:
        db.query(ClusteringAssignment).filter(
            ClusteringAssignment.run_id == VIBE_RUN_ID,
            ClusteringAssignment.cluster_id != -1,
            ClusteringAssignment.assignment_type.is_(None),
        ).update({"assignment_type": "hard"}, synchronize_session=False)
        db.commit()

    hard_count = (
        db.query(ClusteringAssignment)
        .filter(
            ClusteringAssignment.run_id == VIBE_RUN_ID,
            ClusteringAssignment.cluster_id != -1,
        )
        .count()
    )

    print("\n" + "=" * 50)
    print("SOFT ASSIGNMENT SUMMARY")
    print("=" * 50)
    print(f"  Hard assigned:              {hard_count}")
    print(f"  Soft assigned (>={threshold}): {n_soft}")
    print(f"  Between worlds (<{threshold}):  {n_between}")
    print(f"  Missing embeddings:         {n_missing_emb}")
    print(f"  Total noise processed:      {len(noise_assignments)}")

    if dry_run and dry_run_rows:
        print(f"\nFirst {len(dry_run_rows)} noise tracks (dry run):")
        print(f"\n{'Track':<40} | {'Nearest':>8} | {'Similarity':>10} | Type")
        print("-" * 75)
        for r in dry_run_rows:
            print(
                f"  {r['track']:<38} | {r['nearest_cluster']:>8} | "
                f"{r['similarity']:>10.4f} | {r['assignment_type']}"
            )
        print("\nNo DB writes performed.")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Soft noise assignment for Run 29.")
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD,
                        help="Cosine similarity threshold for soft assignment (default 0.85)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Compute but don't write; print first 20 noise tracks.")
    parser.add_argument("--kanye-audit", action="store_true",
                        help="Only process Kanye West tracks and print full results.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.kanye_audit:
            run_kanye_audit(db)
        else:
            run_soft_assignment(db, threshold=args.threshold, dry_run=args.dry_run)
    finally:
        db.close()


if __name__ == "__main__":
    main()
