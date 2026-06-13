"""
Quality check for vibe clustering runs.
Checks:
1. Basic metrics (clusters, noise, silhouette)
2. Musashi test (Self Care, Saint Pablo, HOUSTONFORNICATION, Do Not Disturb, Nights)
3. Cluster 89-type check (find most cross-artist cluster by diversity %)
4. Beneath the Mask placement (should NOT be in K-pop cluster)
5. Mega-cluster check (no cluster > 15% of total tracks = 1484 tracks)
6. Game OST check (Jeremy Soule, ConcernedApe, Yoko Shimomura should share a cluster)

Usage:
    uv run python ml/clustering/vibe_quality_check.py --run-id 31
"""
import argparse
import os
import sys
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding="utf-8")

load_env_path = os.path.join(os.path.dirname(__file__), "../../.env")
sys.path.append(os.path.join(os.path.dirname(__file__), "../.."))

from dotenv import load_dotenv
load_dotenv(dotenv_path=load_env_path)

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from app.models.models import (
    ClusteringRun, ClusteringAssignment, Track, Artist,
)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

MEGA_CLUSTER_THRESHOLD = 1484  # 15% of 9892

MUSASHI_TRACKS = [
    "Self Care",
    "Saint Pablo",
    "HOUSTONFORNICATION",
    "Do Not Disturb",
    "Nights",
]

GAME_OST_ARTISTS = [
    "Jeremy Soule",
    "ConcernedApe",
    "Yoko Shimomura",
]

BENEATH_THE_MASK_NAME = "Beneath the Mask"
KPOP_TAGS = {"k-pop", "kpop", "korean", "k pop"}


def _get_run(db, run_id: int) -> ClusteringRun:
    run = db.query(ClusteringRun).filter(ClusteringRun.id == run_id).first()
    if run is None:
        print(f"Error: run_id={run_id} not found in clustering_runs.")
        sys.exit(1)
    return run


def _assignments_for_run(db, run_id: int) -> list[ClusteringAssignment]:
    return (
        db.query(ClusteringAssignment)
        .filter(ClusteringAssignment.run_id == run_id)
        .all()
    )


def print_metrics(run: ClusteringRun):
    print("\n" + "=" * 60)
    print(f"RUN {run.id} — {run.notes or '(no notes)'}")
    print("=" * 60)
    print(f"  document_type:        {run.document_type}")
    print(f"  umap_n_components:    {run.umap_n_components}")
    print(f"  umap_n_neighbors:     {run.umap_n_neighbors}")
    print(f"  umap_min_dist:        {run.umap_min_dist}")
    print(f"  hdbscan_min_cluster:  {run.hdbscan_min_cluster_size}")
    print(f"  hdbscan_min_samples:  {run.hdbscan_min_samples}")
    print(f"  num_clusters:         {run.num_clusters}")
    noise_pct = f"{run.noise_ratio * 100:.1f}%" if run.noise_ratio is not None else "N/A"
    print(f"  noise_ratio:          {noise_pct}")
    print(f"  median_cluster_size:  {run.median_cluster_size}")
    print(f"  largest_cluster_size: {run.largest_cluster_size}")
    sil = f"{run.silhouette_score:.4f}" if run.silhouette_score is not None else "N/A"
    print(f"  silhouette_score:     {sil}")
    print(f"  created_at:           {run.created_at}")


def check_musashi(db, assignments: list[ClusteringAssignment]):
    """Check that the Musashi test tracks are in the same cluster."""
    print("\n--- CHECK 1: Musashi Test ---")
    print(f"Looking for: {MUSASHI_TRACKS}")

    track_to_cluster: dict[str, int] = {}
    for name in MUSASHI_TRACKS:
        track = db.query(Track).filter(Track.name == name).first()
        if track is None:
            print(f"  WARNING: Track '{name}' not found in tracks table")
            continue

        assignment_map = {a.track_id: a.cluster_id for a in assignments}
        cluster_id = assignment_map.get(track.id)
        if cluster_id is None:
            print(f"  WARNING: Track '{name}' (id={track.id}) has no assignment in this run")
        else:
            track_to_cluster[name] = cluster_id
            print(f"  {name}: cluster {cluster_id}")

    if len(track_to_cluster) >= 2:
        cluster_ids = set(track_to_cluster.values())
        if len(cluster_ids) == 1:
            print(f"  PASS — all found tracks share cluster {cluster_ids.pop()}")
        else:
            print(f"  FAIL — tracks spread across {len(cluster_ids)} clusters: {cluster_ids}")
    else:
        print("  SKIP — fewer than 2 tracks found")


def check_cross_artist_cluster(db, assignments: list[ClusteringAssignment]):
    """Find the cluster with the highest unique_artists / total_tracks ratio."""
    print("\n--- CHECK 2: Most Cross-Artist Cluster ---")

    assignment_map = {a.track_id: a.cluster_id for a in assignments if a.cluster_id != -1}

    cluster_tracks: dict[int, list[int]] = defaultdict(list)
    for track_id, cluster_id in assignment_map.items():
        cluster_tracks[cluster_id].append(track_id)

    best_cluster = None
    best_ratio = 0.0

    for cluster_id, track_ids in cluster_tracks.items():
        if len(track_ids) < 5:
            continue
        tracks = db.query(Track).filter(Track.id.in_(track_ids)).all()
        artist_ids = {t.artist_id for t in tracks if t.artist_id}
        ratio = len(artist_ids) / len(track_ids)
        if ratio > best_ratio:
            best_ratio = ratio
            best_cluster = cluster_id

    if best_cluster is None:
        print("  No clusters found.")
        return

    track_ids = cluster_tracks[best_cluster]
    tracks = db.query(Track).filter(Track.id.in_(track_ids)).all()
    artist_ids = [t.artist_id for t in tracks if t.artist_id]
    artist_counter = Counter(artist_ids)
    top_artist_ids = [aid for aid, _ in artist_counter.most_common(5)]
    top_artists = db.query(Artist).filter(Artist.id.in_(top_artist_ids)).all()
    artist_name_map = {a.id: a.name for a in top_artists}

    unique_artists = len(set(artist_ids))
    print(f"  Most cross-artist cluster: {best_cluster}")
    print(f"  Total tracks: {len(track_ids)}, Unique artists: {unique_artists}")
    print(f"  Diversity ratio: {best_ratio:.2%}")
    print(f"  Top 5 artists:")
    for aid, count in artist_counter.most_common(5):
        name = artist_name_map.get(aid, f"artist_id={aid}")
        print(f"    {name}: {count} tracks")


def check_beneath_the_mask(db, assignments: list[ClusteringAssignment]):
    """Find Beneath the Mask's cluster and check if it's K-pop-heavy."""
    print(f"\n--- CHECK 3: Beneath the Mask Placement ---")

    track = db.query(Track).filter(Track.name == BENEATH_THE_MASK_NAME).first()
    if track is None:
        print(f"  WARNING: '{BENEATH_THE_MASK_NAME}' not found in tracks table")
        return

    assignment_map = {a.track_id: a.cluster_id for a in assignments}
    cluster_id = assignment_map.get(track.id)
    if cluster_id is None:
        print(f"  WARNING: '{BENEATH_THE_MASK_NAME}' has no assignment in this run")
        return

    print(f"  '{BENEATH_THE_MASK_NAME}' is in cluster {cluster_id}")

    # Get all tracks in this cluster
    cluster_track_ids = [
        a.track_id for a in assignments if a.cluster_id == cluster_id
    ]
    cluster_tracks = db.query(Track).filter(Track.id.in_(cluster_track_ids)).all()

    artist_ids = [t.artist_id for t in cluster_tracks if t.artist_id]
    artist_counter = Counter(artist_ids)
    top_artist_ids = [aid for aid, _ in artist_counter.most_common(5)]
    top_artists = db.query(Artist).filter(Artist.id.in_(top_artist_ids)).all()
    artist_name_map = {a.id: a.name for a in top_artists}

    print(f"  Cluster size: {len(cluster_track_ids)} tracks")
    print(f"  Top 5 artists in cluster:")
    for aid, count in artist_counter.most_common(5):
        name = artist_name_map.get(aid, f"artist_id={aid}")
        print(f"    {name}: {count} tracks")

    # Heuristic: check if K-pop artists dominate
    top_artist_names = {artist_name_map.get(aid, "").lower() for aid in top_artist_ids}
    kpop_signals = {"bts", "blackpink", "twice", "stray kids", "exo", "nct", "aespa", "ive", "newjeans"}
    if top_artist_names & kpop_signals:
        print("  FAIL — cluster appears to be K-pop dominated (Beneath the Mask misplaced)")
    else:
        print("  PASS — cluster does not appear K-pop dominated")


def check_mega_clusters(assignments: list[ClusteringAssignment]):
    """Flag any cluster with more than MEGA_CLUSTER_THRESHOLD tracks."""
    print(f"\n--- CHECK 4: Mega-Cluster Check (threshold={MEGA_CLUSTER_THRESHOLD}) ---")

    cluster_counts = Counter(
        a.cluster_id for a in assignments if a.cluster_id != -1
    )
    mega = [(cid, cnt) for cid, cnt in cluster_counts.items() if cnt > MEGA_CLUSTER_THRESHOLD]

    if not mega:
        print(f"  PASS — no cluster exceeds {MEGA_CLUSTER_THRESHOLD} tracks")
    else:
        for cid, cnt in sorted(mega, key=lambda x: -x[1]):
            pct = cnt / len(assignments) * 100
            print(f"  FAIL — cluster {cid}: {cnt} tracks ({pct:.1f}%)")


def check_game_ost(db, assignments: list[ClusteringAssignment]):
    """Check whether Jeremy Soule, ConcernedApe, and Yoko Shimomura share a cluster."""
    print(f"\n--- CHECK 5: Game OST Check ---")
    print(f"Artists: {GAME_OST_ARTISTS}")

    assignment_map = {a.track_id: a.cluster_id for a in assignments}
    artist_clusters: dict[str, set[int]] = {}

    for artist_name in GAME_OST_ARTISTS:
        artist = db.query(Artist).filter(Artist.name == artist_name).first()
        if artist is None:
            print(f"  WARNING: Artist '{artist_name}' not found")
            continue

        tracks = db.query(Track).filter(Track.artist_id == artist.id).all()
        clusters = {
            assignment_map[t.id]
            for t in tracks
            if t.id in assignment_map and assignment_map[t.id] != -1
        }
        artist_clusters[artist_name] = clusters
        print(f"  {artist_name}: {len(tracks)} tracks → clusters {sorted(clusters)}")

    if len(artist_clusters) >= 2:
        all_cluster_sets = list(artist_clusters.values())
        shared = all_cluster_sets[0]
        for s in all_cluster_sets[1:]:
            shared = shared & s

        if shared:
            print(f"  PASS — share cluster(s): {sorted(shared)}")
        else:
            print(f"  FAIL — no shared cluster among game OST artists")
    else:
        print("  SKIP — fewer than 2 game OST artists found")


def run_quality_check(run_id: int):
    db = SessionLocal()
    try:
        run = _get_run(db, run_id)
        print_metrics(run)

        assignments = _assignments_for_run(db, run_id)
        if not assignments:
            print(f"\nNo assignments found for run_id={run_id}. Aborting checks.")
            return

        total = len(assignments)
        noise = sum(1 for a in assignments if a.cluster_id == -1)
        print(f"\nLoaded {total} assignments ({noise} noise points)")

        check_musashi(db, assignments)
        check_cross_artist_cluster(db, assignments)
        check_beneath_the_mask(db, assignments)
        check_mega_clusters(assignments)
        check_game_ost(db, assignments)

        print("\n" + "=" * 60)
        print("QUALITY CHECK COMPLETE")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run quality checks on a clustering run.")
    parser.add_argument("--run-id", type=int, required=True, help="ClusteringRun.id to check")
    args = parser.parse_args()

    run_quality_check(args.run_id)
