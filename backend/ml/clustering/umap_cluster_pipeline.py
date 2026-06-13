import os
import sys
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import TrackEmbedding, TrackClusterCoordinate

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def run_umap_for_clustering(
    run_id: int,
    n_components: int = 15,
    n_neighbors: int = 50,
    min_dist: float = 0.05,
    document_type: str = 'original',
) -> np.ndarray:
    import umap

    db = SessionLocal()
    try:
        print(f"Loading embeddings from database (document_type='{document_type}')...")
        embeddings = (
            db.query(TrackEmbedding)
            .filter(TrackEmbedding.document_type == document_type)
            .all()
        )
        track_ids = [emb.track_id for emb in embeddings]
        vectors = np.array([emb.vector for emb in embeddings])
        print(f"Loaded {len(vectors)} embeddings (document_type='{document_type}')")

        if len(vectors) == 0:
            raise ValueError("No embeddings found. Run the embedding pipeline first.")

        print(f"Running UMAP to {n_components}D...")
        print(f"Parameters: n_components={n_components}, n_neighbors={n_neighbors}, min_dist={min_dist}")

        reducer = umap.UMAP(
            n_components=n_components,
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            metric="cosine",
            random_state=42,
            verbose=True,
        )
        coords = reducer.fit_transform(vectors)
        print(f"UMAP complete — output shape: {coords.shape}")

        print("Saving cluster coordinates to database...")
        rows = [
            TrackClusterCoordinate(
                track_id=track_id,
                run_id=run_id,
                components=[float(v) for v in coord],
            )
            for track_id, coord in zip(track_ids, coords)
        ]
        db.bulk_save_objects(rows)
        db.commit()
        print(f"Saved {len(rows)} rows to track_cluster_coordinates (run_id={run_id})")

        return track_ids, coords

    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run UMAP to ND for a clustering experiment run.")
    parser.add_argument("run_id", type=int, help="ClusteringRun.id to associate coordinates with")
    parser.add_argument("--n-components", type=int, default=15)
    parser.add_argument("--n-neighbors", type=int, default=50)
    parser.add_argument("--min-dist", type=float, default=0.05)
    parser.add_argument("--document-type", type=str, default="original")
    args = parser.parse_args()

    run_umap_for_clustering(
        run_id=args.run_id,
        n_components=args.n_components,
        n_neighbors=args.n_neighbors,
        min_dist=args.min_dist,
        document_type=args.document_type,
    )
