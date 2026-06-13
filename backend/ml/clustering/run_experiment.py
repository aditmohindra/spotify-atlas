"""
End-to-end clustering experiment runner.

1. Creates a ClusteringRun row with the given config.
2. Runs UMAP to N-D (umap_cluster_pipeline)  — skipped when --reuse-coordinates-from-run is set.
3. Runs HDBSCAN (hdbscan_pipeline).
4. Updates the ClusteringRun row with computed metrics.

Usage examples:
    # Full run (UMAP + HDBSCAN)
    uv run python ml/clustering/run_experiment.py

    # HDBSCAN-only — reuse UMAP coordinates from run 1
    uv run python ml/clustering/run_experiment.py --reuse-coordinates-from-run 1 \
        --hdbscan-min-cluster-size 40 --hdbscan-min-samples 15
"""
import argparse
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import ClusteringRun
from ml.clustering.umap_cluster_pipeline import run_umap_for_clustering
from ml.clustering.hdbscan_pipeline import run_clustering_experiment

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

DEFAULT_CONFIG = {
    "document_type": "original",
    "umap_n_components": 15,
    "umap_n_neighbors": 50,
    "umap_min_dist": 0.05,
    "hdbscan_min_cluster_size": 25,
    "hdbscan_min_samples": 10,
    "notes": "ML-2a baseline: 15D UMAP clustering",
}


def _load_run_or_abort(db, run_id: int) -> ClusteringRun:
    run = db.query(ClusteringRun).filter(ClusteringRun.id == run_id).first()
    if run is None:
        print(f"Error: run_id={run_id} not found in clustering_runs.")
        sys.exit(1)
    return run


def run_full_experiment(config: dict = None, reuse_coordinates_from: int = None):
    """Run a clustering experiment.

    config: experiment parameters (defaults to DEFAULT_CONFIG).
    reuse_coordinates_from: if set, skip Stage 1 and load track_cluster_coordinates
        from this run_id. UMAP params are copied from that source run.
    """
    if config is None:
        config = DEFAULT_CONFIG

    db = SessionLocal()
    try:
        print("=" * 60)
        print("STARTING CLUSTERING EXPERIMENT")
        print("=" * 60)

        # When reusing coordinates, inherit UMAP params from the source run
        # so the new ClusteringRun row accurately reflects what projection was used.
        if reuse_coordinates_from is not None:
            src = _load_run_or_abort(db, reuse_coordinates_from)
            config = dict(config)
            config["umap_n_components"] = src.umap_n_components
            config["umap_n_neighbors"] = src.umap_n_neighbors
            config["umap_min_dist"] = src.umap_min_dist
            if not config.get("notes"):
                config["notes"] = (
                    f"HDBSCAN-only (coordinates reused from run {reuse_coordinates_from})"
                )
            print(f"Reusing UMAP coordinates from run_id={reuse_coordinates_from} "
                  f"({src.umap_n_components}D, n_neighbors={src.umap_n_neighbors}, "
                  f"min_dist={src.umap_min_dist})")

        print(f"Config: {config}")

        run = ClusteringRun(
            document_type=config["document_type"],
            umap_n_components=config["umap_n_components"],
            umap_n_neighbors=config["umap_n_neighbors"],
            umap_min_dist=config["umap_min_dist"],
            hdbscan_min_cluster_size=config["hdbscan_min_cluster_size"],
            hdbscan_min_samples=config["hdbscan_min_samples"],
            notes=config.get("notes"),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        run_id = run.id
        print(f"\nCreated ClusteringRun row — run_id={run_id}")

    finally:
        db.close()

    if reuse_coordinates_from is not None:
        print(f"\n--- Stage 1: SKIPPED (reusing coordinates from run {reuse_coordinates_from}) ---")
    else:
        print("\n--- Stage 1: UMAP to ND ---")
        run_umap_for_clustering(
            run_id=run_id,
            n_components=config["umap_n_components"],
            n_neighbors=config["umap_n_neighbors"],
            min_dist=config["umap_min_dist"],
            document_type=config["document_type"],
        )

    print("\n--- Stage 2: HDBSCAN clustering ---")
    metrics = run_clustering_experiment(
        run_id=run_id,
        min_cluster_size=config["hdbscan_min_cluster_size"],
        min_samples=config["hdbscan_min_samples"],
        document_type=config["document_type"],
        coords_run_id=reuse_coordinates_from,
    )

    db = SessionLocal()
    try:
        run = db.query(ClusteringRun).filter(ClusteringRun.id == run_id).first()
        run.num_clusters = metrics["num_clusters"]
        run.noise_ratio = metrics["noise_ratio"]
        run.median_cluster_size = metrics["median_cluster_size"]
        run.largest_cluster_size = metrics["largest_cluster_size"]
        run.silhouette_score = metrics["silhouette_score"]
        db.commit()
        print(f"\nUpdated ClusteringRun id={run_id} with metrics.")
    finally:
        db.close()

    print("\n" + "=" * 60)
    print(f"EXPERIMENT COMPLETE — run_id={run_id}")
    print(f"  num_clusters:    {metrics['num_clusters']}")
    print(f"  noise_ratio:     {metrics['noise_ratio'] * 100:.1f}%")
    sil = metrics["silhouette_score"]
    print(f"  silhouette:      {sil:.4f}" if sil is not None else "  silhouette:      N/A")
    print("=" * 60)

    return run_id, metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run a clustering experiment.")
    parser.add_argument(
        "--reuse-coordinates-from-run",
        type=int,
        default=None,
        metavar="RUN_ID",
        help="Skip UMAP and reuse track_cluster_coordinates from this run_id.",
    )
    parser.add_argument("--document-type", type=str, default=None)
    parser.add_argument("--umap-n-components", type=int, default=None)
    parser.add_argument("--umap-n-neighbors", type=int, default=None)
    parser.add_argument("--umap-min-dist", type=float, default=None)
    parser.add_argument("--hdbscan-min-cluster-size", type=int, default=None)
    parser.add_argument("--hdbscan-min-samples", type=int, default=None)
    parser.add_argument("--notes", type=str, default=None)
    args = parser.parse_args()

    config = dict(DEFAULT_CONFIG)
    overrides = {
        "document_type": args.document_type,
        "umap_n_components": args.umap_n_components,
        "umap_n_neighbors": args.umap_n_neighbors,
        "umap_min_dist": args.umap_min_dist,
        "hdbscan_min_cluster_size": args.hdbscan_min_cluster_size,
        "hdbscan_min_samples": args.hdbscan_min_samples,
        "notes": args.notes,
    }
    config.update({k: v for k, v in overrides.items() if v is not None})

    run_full_experiment(config=config, reuse_coordinates_from=args.reuse_coordinates_from_run)
