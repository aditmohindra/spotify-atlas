"""
Musashi test — checks if the following tracks land in the same or adjacent clusters:
- Self Care (Mac Miller)
- Saint Pablo (Kanye West)
- HOUSTONFORNICATION (Travis Scott)
- Do Not Disturb (Drake)
- Nights (Frank Ocean)

Usage:
    uv run python ml/clustering/musashi_test.py --run-id 26
"""
import argparse
import os
import sys
from collections import Counter

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import Track, Artist, ClusteringAssignment

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

PASS_THRESHOLD = 3  # at least N of 5 tracks in the same cluster

MUSASHI_TRACKS = [
    ("Self Care",          "Mac Miller"),
    ("Saint Pablo",        "Kanye West"),
    ("HOUSTONFORNICATION", "Travis Scott"),
    ("Do Not Disturb",     "Drake"),
    ("Nights",             "Frank Ocean"),
]


def find_track(db, track_name: str, artist_name: str):
    """Return (track_id, actual_track_name, actual_artist_name) or None."""
    results = (
        db.query(Track, Artist)
        .join(Artist, Track.artist_id == Artist.id)
        .filter(Track.name.ilike(f"%{track_name}%"))
        .filter(Artist.name.ilike(f"%{artist_name}%"))
        .all()
    )
    if not results:
        return None
    # prefer exact name match if multiple results
    for track, artist in results:
        if track.name.lower() == track_name.lower():
            return track.id, track.name, artist.name
    track, artist = results[0]
    return track.id, track.name, artist.name


def get_cluster_id(db, run_id: int, track_id: int):
    """Return cluster_id from clustering_assignments, or None if not found."""
    assignment = (
        db.query(ClusteringAssignment)
        .filter(
            ClusteringAssignment.run_id == run_id,
            ClusteringAssignment.track_id == track_id,
        )
        .first()
    )
    return assignment.cluster_id if assignment else None


def run_musashi_test(run_id: int):
    db = SessionLocal()
    try:
        print(f"\n=== MUSASHI TEST (run_id={run_id}) ===\n")
        print(f"{'Track':<30} {'Artist':<16} {'Cluster'}")
        print("-" * 60)

        results = []
        for track_name, artist_name in MUSASHI_TRACKS:
            found = find_track(db, track_name, artist_name)
            if found is None:
                print(f"{'[NOT FOUND] ' + track_name:<30} {artist_name:<16} N/A")
                results.append((track_name, artist_name, None, None))
                continue

            track_id, actual_name, actual_artist = found
            cluster_id = get_cluster_id(db, run_id, track_id)

            if cluster_id is None:
                print(f"{actual_name:<30} {actual_artist:<16} [no assignment]")
            else:
                print(f"{actual_name:<30} {actual_artist:<16} {cluster_id}")

            results.append((actual_name, actual_artist, track_id, cluster_id))
            print()

    finally:
        db.close()

    # Tally cluster assignments
    assigned = [(name, artist, cid) for name, artist, _, cid in results if cid is not None]
    if not assigned:
        print("Result: 0/5 tracks found in clustering_assignments — FAILED\n")
        return

    cluster_counts = Counter(cid for _, _, cid in assigned)
    majority_cluster, majority_count = cluster_counts.most_common(1)[0]

    print(f"Result: {majority_count}/{len(MUSASHI_TRACKS)} tracks in same cluster (cluster {majority_cluster})")

    # Adjacent clusters: tracks not in majority cluster
    adjacent = sorted(set(
        cid for _, _, cid in assigned if cid != majority_cluster
    ))
    if adjacent:
        print(f"Adjacent clusters found: {', '.join(str(c) for c in adjacent)}")
    else:
        print("Adjacent clusters found: none")
    print()

    passed = majority_count >= PASS_THRESHOLD
    status = f"PASSED ✓" if passed else f"FAILED ✗"
    print(f"{status} (threshold: {PASS_THRESHOLD}/{len(MUSASHI_TRACKS)} in same cluster)")
    print()

    return {
        "run_id": run_id,
        "majority_cluster": majority_cluster,
        "majority_count": majority_count,
        "adjacent_clusters": adjacent,
        "passed": passed,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Check whether Musashi playlist tracks land in the same cluster."
    )
    parser.add_argument("--run-id", type=int, required=True, help="ClusteringRun id to test.")
    args = parser.parse_args()

    run_musashi_test(run_id=args.run_id)
