import os
import sys
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import Track, TrackEmbedding, TrackCoordinate, Artist

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def load_embeddings(db):
    print("Loading embeddings from database...")
    embeddings = db.query(TrackEmbedding).all()
    
    track_ids = []
    vectors = []
    
    for emb in embeddings:
        track_ids.append(emb.track_id)
        vectors.append(emb.vector)
    
    print(f"Loaded {len(vectors)} embeddings")
    return track_ids, np.array(vectors)


def run_umap(vectors: np.ndarray, n_components: int = 2, n_neighbors: int = 50, min_dist: float = 0.05):
    import umap

    print(f"Running UMAP on {len(vectors)} vectors...")
    print(f"Parameters: n_components={n_components}, n_neighbors={n_neighbors}, min_dist={min_dist}")

    kwargs = dict(
        n_components=n_components,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric="cosine",
        random_state=42,
        verbose=True,
    )
    if n_components == 2:
        kwargs["spread"] = 1.5

    reducer = umap.UMAP(**kwargs)
    coordinates = reducer.fit_transform(vectors)
    print("UMAP complete")
    return coordinates


def normalize_coordinates(coords: np.ndarray, scale: float = 1000.0):
    x_min, x_max = coords[:, 0].min(), coords[:, 0].max()
    y_min, y_max = coords[:, 1].min(), coords[:, 1].max()
    
    x_norm = (coords[:, 0] - x_min) / (x_max - x_min) * scale
    y_norm = (coords[:, 1] - y_min) / (y_max - y_min) * scale
    
    return np.column_stack([x_norm, y_norm])


def save_coordinates(db, track_ids: list, coords: np.ndarray):
    print("Saving coordinates to database...")
    
    existing = {c.track_id for c in db.query(TrackCoordinate).all()}
    
    saved = 0
    for track_id, (x, y) in zip(track_ids, coords):
        if track_id in existing:
            coord = db.query(TrackCoordinate).filter(
                TrackCoordinate.track_id == track_id
            ).first()
            coord.x = float(x)
            coord.y = float(y)
        else:
            db.add(TrackCoordinate(
                track_id=track_id,
                x=float(x),
                y=float(y)
            ))
        saved += 1
    
    db.commit()
    print(f"Saved {saved} coordinates")
    return saved


def visualize_local(db, coords: np.ndarray, track_ids: list):
    try:
        import matplotlib.pyplot as plt
        
        print("Generating local scatter plot...")
        
        fig, ax = plt.subplots(1, 1, figsize=(12, 12))
        ax.scatter(
            coords[:, 0],
            coords[:, 1],
            alpha=0.3,
            s=1,
            c='steelblue'
        )
        ax.set_title(f"Spotify Atlas — Music Galaxy ({len(coords)} tracks)")
        ax.set_xlabel("UMAP Dimension 1")
        ax.set_ylabel("UMAP Dimension 2")
        ax.axis('off')
        
        output_path = os.path.join(os.path.dirname(__file__), 'galaxy_preview.png')
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        plt.close()
        print(f"Saved preview to {output_path}")
        
    except ImportError:
        print("matplotlib not installed — skipping visualization")


def main():
    db = SessionLocal()
    
    try:
        track_ids, vectors = load_embeddings(db)
        
        if len(vectors) == 0:
            print("No embeddings found. Run the embedding pipeline first.")
            return
        
        coords = run_umap(vectors, n_components=2)
        coords_normalized = normalize_coordinates(coords)
        
        visualize_local(db, coords_normalized, track_ids)
        saved = save_coordinates(db, track_ids, coords_normalized)
        
        print(f"\nUMAP complete — {saved} tracks have 2D coordinates")
        print(f"X range: {coords_normalized[:, 0].min():.1f} — {coords_normalized[:, 0].max():.1f}")
        print(f"Y range: {coords_normalized[:, 1].min():.1f} — {coords_normalized[:, 1].max():.1f}")
        
    finally:
        db.close()


if __name__ == "__main__":
    main()