"""
Cluster 171 community centroids into 8-12 archetypes.
Tries three methods on raw_centroid (1536D) with cosine distance:
  A. HDBSCAN
  B. Agglomerative clustering
  C. Spherical KMeans

Prints comparison table. Exports archetype_candidates.txt for manual review.
Does NOT write to DB — human selects the best result and runs with --promote <method> <k>

Usage:
    uv run python ml/clustering/archetype_clustering.py
    uv run python ml/clustering/archetype_clustering.py --promote agglomerative 10
"""
import argparse
import os
import sys
from collections import defaultdict, Counter

import numpy as np
from sklearn.preprocessing import normalize
from sklearn.cluster import AgglomerativeClustering, KMeans
from hdbscan import HDBSCAN
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import (
    ClusterCentroid, TrackCluster, Track, Artist,
    ClusterArchetype, CommunityArchetypeAssignment,
)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "archetype_candidates.txt")


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_centroids(db):
    rows = db.query(ClusterCentroid).order_by(ClusterCentroid.cluster_id).all()
    if not rows:
        print("ERROR: cluster_centroids table is empty — run compute_centroids.py first.")
        sys.exit(1)
    cluster_ids = [r.cluster_id for r in rows]
    raw = np.array([r.raw_centroid for r in rows], dtype=np.float32)
    print(f"Loaded {len(cluster_ids)} centroids ({raw.shape[1]}D).")
    return cluster_ids, raw


def get_top_artists_for_cluster(db, cluster_id: int, limit: int = 4) -> list[str]:
    track_ids = [
        r[0] for r in db.query(TrackCluster.track_id)
        .filter(TrackCluster.cluster_id == cluster_id)
        .all()
    ]
    counts: dict[str, int] = defaultdict(int)
    for t, a in db.query(Track, Artist).join(Artist, Track.artist_id == Artist.id).filter(Track.id.in_(track_ids)).all():
        counts[a.name] += 1
    return [name for name, _ in sorted(counts.items(), key=lambda x: -x[1])[:limit]]


# ---------------------------------------------------------------------------
# Clustering methods
# ---------------------------------------------------------------------------

def run_hdbscan(raw: np.ndarray) -> dict[int, np.ndarray]:
    """Returns {min_cluster_size: labels_array}."""
    normalized = normalize(raw)
    results = {}
    print("\n  Method A — HDBSCAN (L2-normalised, euclidean ≡ cosine on unit sphere):")
    for mcs in [3, 4, 5, 6, 8]:
        clusterer = HDBSCAN(min_cluster_size=mcs, metric='euclidean')
        labels = clusterer.fit_predict(normalized)
        n_archetypes = len(set(labels)) - (1 if -1 in labels else 0)
        noise = sum(1 for l in labels if l == -1)
        print(f"    mcs={mcs}: {n_archetypes} archetypes, {noise} noise")
        results[mcs] = labels
    return results


def run_agglomerative(raw: np.ndarray) -> dict[int, np.ndarray]:
    """Returns {k: labels_array}."""
    results = {}
    print("\n  Method B — Agglomerative (cosine, average linkage):")
    for n in [8, 9, 10, 11, 12]:
        clusterer = AgglomerativeClustering(n_clusters=n, metric='cosine', linkage='average')
        labels = clusterer.fit_predict(raw)
        sizes = sorted([sum(1 for l in labels if l == i) for i in range(n)], reverse=True)
        print(f"    k={n}: sizes={sizes}")
        results[n] = labels
    return results


def run_kmeans(raw: np.ndarray) -> dict[int, tuple[np.ndarray, float]]:
    """Returns {k: (labels_array, inertia)}."""
    normalized = normalize(raw)
    results = {}
    print("\n  Method C — Spherical KMeans (L2-normalised):")
    for k in [8, 9, 10, 11, 12]:
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(normalized)
        sizes = sorted([sum(1 for l in labels if l == i) for i in range(k)], reverse=True)
        inertia = kmeans.inertia_
        print(f"    k={k}: sizes={sizes} inertia={inertia:.2f}")
        results[k] = (labels, inertia)
    return results


# ---------------------------------------------------------------------------
# Candidate export
# ---------------------------------------------------------------------------

def export_candidates(db, cluster_ids: list[int], all_label_sets: list[tuple[str, np.ndarray]]):
    """Write archetype_candidates.txt with artist compositions for each method/k."""
    lines = ["ARCHETYPE CANDIDATES — Review and pick the best method + k\n", "=" * 80]

    for method_label, labels in all_label_sets:
        n_archetypes = len(set(l for l in labels if l != -1))
        lines.append(f"\n\n=== {method_label} ({n_archetypes} archetypes) ===")

        archetype_to_clusters: dict[int, list[int]] = defaultdict(list)
        for cluster_id, label in zip(cluster_ids, labels):
            archetype_to_clusters[label].append(cluster_id)

        for arch_id in sorted(archetype_to_clusters.keys()):
            members = archetype_to_clusters[arch_id]
            noise_tag = " [NOISE/UNASSIGNED]" if arch_id == -1 else ""
            lines.append(f"\n  Archetype {arch_id} ({len(members)} communities){noise_tag}:")

            # Collect top artists across all member communities
            all_artist_counts: dict[str, int] = defaultdict(int)
            community_samples = []
            for cid in members[:8]:  # cap to avoid huge exports
                top = get_top_artists_for_cluster(db, cid, limit=3)
                for a in top:
                    all_artist_counts[a] += 1
                if top:
                    community_samples.append(" | ".join(top))

            top_artists_str = ", ".join(
                a for a, _ in sorted(all_artist_counts.items(), key=lambda x: -x[1])[:12]
            )
            lines.append(f"    Top artists: {top_artists_str}")
            if community_samples:
                lines.append(f"    Sample communities: {' || '.join(community_samples[:5])}")

    output = "\n".join(lines)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(output)
    print(f"\nExported archetype_candidates.txt → {OUTPUT_FILE}")
    print("\n" + output[:4000])  # print first 4000 chars to console
    if len(output) > 4000:
        print(f"  ... (truncated — see {OUTPUT_FILE} for full output)")


# ---------------------------------------------------------------------------
# Promote
# ---------------------------------------------------------------------------

def promote(db, cluster_ids: list[int], raw: np.ndarray, method: str, k: int):
    """Write winning archetype assignment to DB."""
    normalized = normalize(raw)

    if method == "hdbscan":
        clusterer = HDBSCAN(min_cluster_size=k, metric='euclidean')
        labels = clusterer.fit_predict(normalized)
    elif method == "agglomerative":
        clusterer = AgglomerativeClustering(n_clusters=k, metric='cosine', linkage='average')
        labels = clusterer.fit_predict(raw)
    elif method == "kmeans":
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(normalized)
    else:
        print(f"Unknown method '{method}'. Use: hdbscan, agglomerative, kmeans")
        sys.exit(1)

    # Resolve HDBSCAN noise (-1): assign to nearest archetype centroid by cosine sim
    if -1 in set(labels):
        noise_mask = labels == -1
        non_noise_labels = [l for l in labels if l != -1]
        archetype_ids = sorted(set(non_noise_labels))
        # Compute archetype centroids in normalised space
        arch_centroids = np.array([
            normalized[labels == aid].mean(axis=0)
            for aid in archetype_ids
        ])
        arch_centroids_norm = normalize(arch_centroids)
        for idx in np.where(noise_mask)[0]:
            sims = arch_centroids_norm @ normalized[idx]
            labels[idx] = archetype_ids[int(np.argmax(sims))]
        print(f"  Reassigned {noise_mask.sum()} noise communities to nearest archetype.")

    actual_k = len(set(labels))

    # Clear existing rows
    db.query(CommunityArchetypeAssignment).delete()
    db.query(ClusterArchetype).delete()
    db.commit()

    # Insert archetypes
    for arch_id in sorted(set(labels)):
        db.add(ClusterArchetype(archetype_id=int(arch_id), name=None, description=None))

    # Insert assignments
    for cluster_id, arch_id in zip(cluster_ids, labels):
        db.add(CommunityArchetypeAssignment(
            cluster_id=int(cluster_id),
            archetype_id=int(arch_id),
        ))

    db.commit()
    print(
        f"Promoted: {method} k={k} → {actual_k} archetypes, "
        f"{len(cluster_ids)} communities assigned"
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Cluster community centroids into archetypes.")
    parser.add_argument(
        "--promote",
        nargs=2,
        metavar=("METHOD", "K"),
        help="Promote a specific method+k to DB. E.g. --promote agglomerative 10",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        cluster_ids, raw = load_centroids(db)

        if args.promote:
            method, k_str = args.promote
            k = int(k_str)
            print(f"\nPromoting {method} k={k} to cluster_archetypes + community_archetype_assignments...")
            promote(db, cluster_ids, raw, method, k)
            return

        print("\n" + "=" * 60)
        print("ARCHETYPE CLUSTERING EXPLORATION")
        print("=" * 60)

        hdbscan_results = run_hdbscan(raw)
        agg_results = run_agglomerative(raw)
        km_results = run_kmeans(raw)

        # Collect all label sets that produce 8-12 archetypes for export
        all_label_sets = []

        for mcs, labels in hdbscan_results.items():
            n = len(set(l for l in labels if l != -1))
            if 8 <= n <= 12:
                all_label_sets.append((f"HDBSCAN mcs={mcs}", labels))

        for n, labels in agg_results.items():
            all_label_sets.append((f"AGGLOMERATIVE k={n}", labels))

        for k, (labels, _) in km_results.items():
            all_label_sets.append((f"KMEANS k={k}", labels))

        print(f"\n{len(all_label_sets)} candidate configurations in range 8-12 archetypes — exporting...")
        export_candidates(db, cluster_ids, all_label_sets)

        print("\nReview archetype_candidates.txt then run:")
        print("  uv run python ml/clustering/archetype_clustering.py --promote <method> <k>")
        print("  E.g.: --promote agglomerative 10")

    finally:
        db.close()


if __name__ == "__main__":
    main()
