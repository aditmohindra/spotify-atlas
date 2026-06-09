import os
import sys
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import Track, TrackEmbedding, TrackCluster, TrackCoordinate, Artist

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def load_umap_coordinates(db):
    print("Loading UMAP coordinates...")
    coords = db.query(TrackCoordinate).all()
    track_ids = [c.track_id for c in coords]
    vectors = np.array([[c.x, c.y] for c in coords])
    print(f"Loaded {len(vectors)} 2D coordinates")
    return track_ids, vectors


def run_hdbscan(vectors: np.ndarray, min_cluster_size: int = 15, min_samples: int = 5):
    import hdbscan

    print(f"Running HDBSCAN: min_cluster_size={min_cluster_size}, min_samples={min_samples}")

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric="euclidean",
        cluster_selection_method="eom",
        prediction_data=True
    )

    labels = clusterer.fit_predict(vectors)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = list(labels).count(-1)

    print(f"Found {n_clusters} clusters")
    print(f"Noise points: {n_noise} ({n_noise/len(labels)*100:.1f}%)")

    return labels, clusterer


def save_clusters(db, track_ids: list, labels: list):
    print("Saving cluster assignments...")

    existing = {c.track_id: c for c in db.query(TrackCluster).all()}

    saved = 0
    for track_id, label in zip(track_ids, labels):
        cluster_id = int(label)

        if track_id in existing:
            existing[track_id].cluster_id = cluster_id
        else:
            db.add(TrackCluster(
                track_id=track_id,
                cluster_id=cluster_id
            ))
        saved += 1

    db.commit()
    print(f"Saved {saved} cluster assignments")
    return saved


def print_cluster_stats(db, labels: list):
    from collections import Counter

    label_counts = Counter(labels)
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)

    print(f"\n=== CLUSTER STATISTICS ===")
    print(f"Total clusters: {n_clusters}")
    print(f"Noise points (-1): {label_counts.get(-1, 0)}")
    print(f"\nTop 20 clusters by size:")

    sorted_clusters = sorted(
        [(k, v) for k, v in label_counts.items() if k != -1],
        key=lambda x: x[1],
        reverse=True
    )

    for cluster_id, count in sorted_clusters[:20]:
        print(f"  Cluster {cluster_id}: {count} tracks")

    print(f"\nSmallest clusters:")
    for cluster_id, count in sorted_clusters[-10:]:
        print(f"  Cluster {cluster_id}: {count} tracks")


def inspect_clusters(db, track_ids: list, labels: list, n_clusters_to_show: int = 10):
    from collections import defaultdict

    cluster_tracks = defaultdict(list)
    for track_id, label in zip(track_ids, labels):
        if label != -1:
            cluster_tracks[label].append(track_id)

    sorted_clusters = sorted(
        cluster_tracks.items(),
        key=lambda x: len(x[1]),
        reverse=True
    )

    print(f"\n=== CLUSTER INSPECTION (top {n_clusters_to_show}) ===")

    for cluster_id, tids in sorted_clusters[:n_clusters_to_show]:
        sample_ids = tids[:8]
        tracks = db.query(Track, Artist).join(
            Artist, Track.artist_id == Artist.id
        ).filter(Track.id.in_(sample_ids)).all()

        print(f"\nCluster {cluster_id} ({len(tids)} tracks):")
        for track, artist in tracks:
            print(f"  - {track.name} by {artist.name}")

def export_clusters_to_file(db, track_ids: list, labels: list):
    from collections import defaultdict
    
    cluster_tracks = defaultdict(list)
    for track_id, label in zip(track_ids, labels):
        cluster_tracks[label].append(track_id)
    
    sorted_clusters = sorted(
        cluster_tracks.items(),
        key=lambda x: len(x[1]),
        reverse=True
    )
    
    output_path = os.path.join(os.path.dirname(__file__), 'clusters_export.txt')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"SPOTIFY ATLAS — CLUSTER EXPORT\n")
        f.write(f"{'='*60}\n\n")
        
        total_clusters = len([c for c in cluster_tracks if c != -1])
        noise_count = len(cluster_tracks.get(-1, []))
        f.write(f"Total clusters: {total_clusters}\n")
        f.write(f"Noise points: {noise_count}\n\n")
        
        for cluster_id, tids in sorted_clusters:
            if cluster_id == -1:
                continue
                
            tracks = db.query(Track, Artist).join(
                Artist, Track.artist_id == Artist.id
            ).filter(Track.id.in_(tids)).all()
            
            f.write(f"{'='*60}\n")
            f.write(f"CLUSTER {cluster_id} — {len(tids)} tracks\n")
            f.write(f"{'='*60}\n")
            
            for track, artist in tracks:
                f.write(f"  {track.name} — {artist.name}\n")
            
            f.write("\n")
        
        noise_ids = cluster_tracks.get(-1, [])
        if noise_ids:
            f.write(f"{'='*60}\n")
            f.write(f"NOISE (-1) — {len(noise_ids)} tracks\n")
            f.write(f"{'='*60}\n")
            noise_tracks = db.query(Track, Artist).join(
                Artist, Track.artist_id == Artist.id
            ).filter(Track.id.in_(noise_ids[:100])).all()
            for track, artist in noise_tracks:
                f.write(f"  {track.name} — {artist.name}\n")
    
    print(f"Exported cluster data to {output_path}")


def main():
    db = SessionLocal()

    try:
        track_ids, vectors = load_umap_coordinates(db)

        if len(vectors) == 0:
            print("No coordinates found. Run UMAP pipeline first.")
            return

        labels, clusterer = run_hdbscan(
            vectors,
            min_cluster_size=15,
            min_samples=5
        )

        print_cluster_stats(db, labels)
        inspect_clusters(db, track_ids, labels)
        save_clusters(db, track_ids, labels)
        export_clusters_to_file(db, track_ids, labels)

        print("\nHDBSCAN complete!")

    finally:
        db.close()


if __name__ == "__main__":
    main()