"""
Generate 2D UMAP coordinates from vibe embeddings (document_type='vibe').
Saves to track_vibe_coordinates — never touches track_coordinates (scene layout).

Also generates a 2x2 comparison: vibe layout vs scene layout, both coloured by
scene clusters (run 18) and vibe clusters (run 29).

Usage:
    uv run python ml/visualization/umap_vibe_pipeline.py
"""
import os
import sys
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import (
    TrackEmbedding, TrackVibeCoordinate, TrackCoordinate,
    TrackCluster, ClusteringAssignment,
)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

VIBE_RUN_ID = 29   # clustering_assignments run with document_type='vibe'


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_vibe_embeddings(db):
    print("Loading vibe embeddings (document_type='vibe')...")
    embeddings = (
        db.query(TrackEmbedding)
        .filter(TrackEmbedding.document_type == 'vibe')
        .all()
    )
    track_ids = [e.track_id for e in embeddings]
    vectors = np.array([e.vector for e in embeddings])
    print(f"Loaded {len(vectors)} vibe embeddings")
    if len(vectors) == 0:
        raise ValueError("No vibe embeddings found — run the vibe embedding pipeline first.")
    return track_ids, vectors


# ---------------------------------------------------------------------------
# UMAP
# ---------------------------------------------------------------------------

def run_umap(vectors: np.ndarray) -> np.ndarray:
    import umap

    print(f"Running UMAP on {len(vectors)} vectors...")
    print("Parameters: n_components=2, n_neighbors=50, min_dist=0.1, metric=cosine, spread=1.5")

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=50,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
        spread=1.5,
        verbose=True,
    )
    coords = reducer.fit_transform(vectors)
    print("UMAP complete")
    return coords


# ---------------------------------------------------------------------------
# Normalise + save
# ---------------------------------------------------------------------------

def normalize_coordinates(coords: np.ndarray, scale: float = 1000.0) -> np.ndarray:
    x_min, x_max = coords[:, 0].min(), coords[:, 0].max()
    y_min, y_max = coords[:, 1].min(), coords[:, 1].max()
    x_norm = (coords[:, 0] - x_min) / (x_max - x_min) * scale
    y_norm = (coords[:, 1] - y_min) / (y_max - y_min) * scale
    return np.column_stack([x_norm, y_norm])


def save_vibe_coordinates(db, track_ids: list, coords: np.ndarray) -> int:
    print("Saving vibe coordinates to track_vibe_coordinates...")
    existing = {
        row[0]: row[1]
        for row in db.query(TrackVibeCoordinate.track_id, TrackVibeCoordinate.id).all()
    }
    saved = 0
    for track_id, (x, y) in zip(track_ids, coords):
        if track_id in existing:
            row = db.query(TrackVibeCoordinate).filter(
                TrackVibeCoordinate.track_id == track_id
            ).first()
            row.x = float(x)
            row.y = float(y)
        else:
            db.add(TrackVibeCoordinate(track_id=track_id, x=float(x), y=float(y)))
        saved += 1
    db.commit()
    print(f"Saved {saved} vibe coordinates")
    return saved


# ---------------------------------------------------------------------------
# 2x2 comparison visualisation
# ---------------------------------------------------------------------------

def build_color_palette():
    """Return 60 distinct colours from tab20 + tab20b + tab20c."""
    import matplotlib.cm as cm
    colors = []
    for cmap_name in ("tab20", "tab20b", "tab20c"):
        cmap = cm.get_cmap(cmap_name)
        colors.extend([cmap(i / 20) for i in range(20)])
    return colors


def visualize_comparison(db, vibe_coords: np.ndarray, vibe_track_ids: list):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed — skipping comparison visualisation")
        return

    print("\nGenerating 2x2 comparison visualisation...")

    palette = build_color_palette()
    noise_color = "#2a2a2a"

    # --- Load scene coordinates (existing layout) ---
    scene_rows = db.query(TrackCoordinate).all()
    scene_tid_to_xy = {r.track_id: (r.x, r.y) for r in scene_rows}

    # --- Load scene cluster assignments (track_clusters, production run 18) ---
    scene_cluster_rows = db.query(TrackCluster).all()
    scene_tid_to_cluster = {r.track_id: r.cluster_id for r in scene_cluster_rows}

    # --- Load vibe cluster assignments (clustering_assignments, run 29) ---
    vibe_assign_rows = (
        db.query(ClusteringAssignment)
        .filter(ClusteringAssignment.run_id == VIBE_RUN_ID)
        .all()
    )
    vibe_tid_to_cluster = {r.track_id: r.cluster_id for r in vibe_assign_rows}

    # --- Stable colour maps ---
    scene_cluster_ids = sorted(set(v for v in scene_tid_to_cluster.values() if v != -1))
    vibe_cluster_ids  = sorted(set(v for v in vibe_tid_to_cluster.values()  if v != -1))
    scene_color_map = {cid: palette[i % len(palette)] for i, cid in enumerate(scene_cluster_ids)}
    vibe_color_map  = {cid: palette[i % len(palette)] for i, cid in enumerate(vibe_cluster_ids)}

    # --- Vibe layout arrays ---
    vibe_x = vibe_coords[:, 0]
    vibe_y = vibe_coords[:, 1]
    vibe_scene_colors = [
        scene_color_map.get(scene_tid_to_cluster.get(tid, -1), noise_color)
        for tid in vibe_track_ids
    ]
    vibe_vibe_colors = [
        vibe_color_map.get(vibe_tid_to_cluster.get(tid, -1), noise_color)
        for tid in vibe_track_ids
    ]

    # --- Scene layout arrays (only tracks that have scene coords) ---
    scene_track_ids = list(scene_tid_to_xy.keys())
    scene_x = np.array([scene_tid_to_xy[tid][0] for tid in scene_track_ids])
    scene_y = np.array([scene_tid_to_xy[tid][1] for tid in scene_track_ids])
    scene_scene_colors = [
        scene_color_map.get(scene_tid_to_cluster.get(tid, -1), noise_color)
        for tid in scene_track_ids
    ]
    scene_vibe_colors = [
        vibe_color_map.get(vibe_tid_to_cluster.get(tid, -1), noise_color)
        for tid in scene_track_ids
    ]

    # --- Plot ---
    fig, axes = plt.subplots(2, 2, figsize=(20, 20))
    fig.patch.set_facecolor("#0a0a0a")

    panels = [
        (axes[0, 0], scene_x,  scene_y,  scene_scene_colors, "Scene layout  +  scene clusters (run 18)"),
        (axes[0, 1], vibe_x,   vibe_y,   vibe_vibe_colors,   "Vibe layout  +  vibe clusters (run 29)"),
        (axes[1, 0], scene_x,  scene_y,  scene_vibe_colors,  "Scene layout  +  vibe clusters  [collision check]"),
        (axes[1, 1], vibe_x,   vibe_y,   vibe_scene_colors,  "Vibe layout  +  scene clusters  [reverse]"),
    ]

    for ax, xs, ys, colors, title in panels:
        ax.set_facecolor("#0a0a0a")
        ax.scatter(xs, ys, c=colors, s=2, alpha=0.6, linewidths=0)
        ax.set_title(title, color="white", fontsize=11, pad=8)
        ax.axis("off")

    plt.suptitle("Vibe vs Scene — 2x2 Layout Comparison", color="white", fontsize=14, y=1.01)
    plt.tight_layout()

    out_path = os.path.join(os.path.dirname(__file__), "vibe_vs_scene_2x2.png")
    plt.savefig(out_path, dpi=150, bbox_inches="tight", facecolor="#0a0a0a")
    plt.close()
    print(f"Saved comparison image → {out_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    db = SessionLocal()
    try:
        track_ids, vectors = load_vibe_embeddings(db)

        coords = run_umap(vectors)
        coords_norm = normalize_coordinates(coords)

        saved = save_vibe_coordinates(db, track_ids, coords_norm)

        print(f"\nVibe UMAP complete — {saved} tracks have vibe 2D coordinates")
        print(f"X range: {coords_norm[:, 0].min():.1f} — {coords_norm[:, 0].max():.1f}")
        print(f"Y range: {coords_norm[:, 1].min():.1f} — {coords_norm[:, 1].max():.1f}")

        visualize_comparison(db, coords_norm, track_ids)

    finally:
        db.close()


if __name__ == "__main__":
    main()
