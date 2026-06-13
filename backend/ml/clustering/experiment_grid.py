"""
ML-2c: Systematic clustering grid search across scene document type.

FULL_RUNS  — complete UMAP + HDBSCAN passes (each ~20 min)
HDBSCAN_PARAMS — additional HDBSCAN sweeps reusing each UMAP projection

Usage:
    uv run python ml/clustering/experiment_grid.py
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from ml.clustering.run_experiment import run_full_experiment

# ---------------------------------------------------------------------------
# Grid definition
# ---------------------------------------------------------------------------

# (n_neighbors, min_dist, document_type)
FULL_RUNS = [
    (100, 0.0, 'scene'),   # mirror of best original run
    (50,  0.0, 'scene'),   # tighter manifold
    (150, 0.0, 'scene'),   # more global structure
]

# (min_cluster_size, min_samples)
HDBSCAN_PARAMS = [
    (5,  3),
    (10, 5),
    (15, 5),
    (20, 8),
    (25, 10),
]

# Quality filter thresholds — print WARNING but never skip/delete
MAX_NOISE_RATIO   = 0.30
MAX_CLUSTER_SIZE  = 1484   # 15% of 9892
MAX_NUM_CLUSTERS  = 300
MIN_NUM_CLUSTERS  = 50


def check_quality(run_id: int, metrics: dict):
    """Warn when quality thresholds are violated."""
    warnings = []
    if metrics["noise_ratio"] is not None and metrics["noise_ratio"] > MAX_NOISE_RATIO:
        warnings.append(
            f"noise_ratio={metrics['noise_ratio'] * 100:.1f}% > {MAX_NOISE_RATIO * 100:.0f}%"
        )
    if metrics["largest_cluster_size"] is not None and metrics["largest_cluster_size"] > MAX_CLUSTER_SIZE:
        warnings.append(
            f"largest_cluster={metrics['largest_cluster_size']} > {MAX_CLUSTER_SIZE}"
        )
    if metrics["num_clusters"] is not None:
        if metrics["num_clusters"] > MAX_NUM_CLUSTERS:
            warnings.append(f"num_clusters={metrics['num_clusters']} > {MAX_NUM_CLUSTERS}")
        elif metrics["num_clusters"] < MIN_NUM_CLUSTERS:
            warnings.append(f"num_clusters={metrics['num_clusters']} < {MIN_NUM_CLUSTERS}")

    for w in warnings:
        print(f"  ⚠ WARNING run_id={run_id}: {w}")


def print_run_summary(run_id: int, config: dict, metrics: dict):
    sil = metrics.get("silhouette_score")
    print(
        f"  run_id={run_id:>3}  doc={config['document_type']:<8}"
        f"  n_neighbors={config['umap_n_neighbors']:<4}"
        f"  mcs={config['hdbscan_min_cluster_size']:<3}"
        f"  ms={config['hdbscan_min_samples']:<3}"
        f"  clusters={metrics.get('num_clusters', 'N/A'):<4}"
        f"  noise={metrics.get('noise_ratio', 0) * 100:.1f}%"
        f"  sil={sil:.4f}" if sil is not None else f"  sil=N/A"
    )


def run_grid():
    all_results = []   # list of (run_id, config, metrics)

    for umap_idx, (n_neighbors, min_dist, doc_type) in enumerate(FULL_RUNS):
        print("\n" + "=" * 70)
        print(
            f"FULL RUN {umap_idx + 1}/{len(FULL_RUNS)} — "
            f"doc={doc_type}, n_neighbors={n_neighbors}, min_dist={min_dist}"
        )
        print("=" * 70)

        # Use the first HDBSCAN_PARAMS entry for the full UMAP run
        first_mcs, first_ms = HDBSCAN_PARAMS[0]
        base_config = {
            "document_type": doc_type,
            "umap_n_components": 15,
            "umap_n_neighbors": n_neighbors,
            "umap_min_dist": min_dist,
            "hdbscan_min_cluster_size": first_mcs,
            "hdbscan_min_samples": first_ms,
            "notes": (
                f"ML-2c grid: {doc_type} n_neighbors={n_neighbors} "
                f"min_dist={min_dist} mcs={first_mcs} ms={first_ms}"
            ),
        }

        base_run_id, base_metrics = run_full_experiment(config=base_config)
        check_quality(base_run_id, base_metrics)
        all_results.append((base_run_id, base_config, base_metrics))

        print(f"\n--- Running summary after base run {base_run_id} ---")
        print_run_summary(base_run_id, base_config, base_metrics)

        # HDBSCAN sweeps reusing the UMAP projection just computed
        for mcs, ms in HDBSCAN_PARAMS[1:]:
            print("\n" + "-" * 60)
            print(
                f"HDBSCAN-only reuse run_id={base_run_id}: "
                f"mcs={mcs}, ms={ms}"
            )
            sweep_config = {
                "document_type": doc_type,
                "umap_n_components": 15,
                "umap_n_neighbors": n_neighbors,
                "umap_min_dist": min_dist,
                "hdbscan_min_cluster_size": mcs,
                "hdbscan_min_samples": ms,
                "notes": (
                    f"ML-2c grid: {doc_type} n_neighbors={n_neighbors} "
                    f"min_dist={min_dist} mcs={mcs} ms={ms} "
                    f"(coords from run {base_run_id})"
                ),
            }

            sweep_run_id, sweep_metrics = run_full_experiment(
                config=sweep_config,
                reuse_coordinates_from=base_run_id,
            )
            check_quality(sweep_run_id, sweep_metrics)
            all_results.append((sweep_run_id, sweep_config, sweep_metrics))

            print(f"\n--- Running summary after sweep run {sweep_run_id} ---")
            print_run_summary(sweep_run_id, sweep_config, sweep_metrics)

    # Final summary — top 5 by silhouette
    print("\n" + "=" * 70)
    print("GRID SEARCH COMPLETE")
    print("=" * 70)
    print(f"Total runs completed: {len(all_results)}\n")

    valid = [
        (rid, cfg, m)
        for rid, cfg, m in all_results
        if m.get("silhouette_score") is not None
    ]
    top5 = sorted(valid, key=lambda x: x[2]["silhouette_score"], reverse=True)[:5]

    print("Top 5 runs by silhouette score:")
    print(f"  {'run_id':<8} {'doc':<10} {'neighbors':<10} {'mcs':<5} {'ms':<5} "
          f"{'clusters':<10} {'noise%':<8} {'silhouette'}")
    print("  " + "-" * 68)
    for rid, cfg, m in top5:
        sil = m.get("silhouette_score")
        print(
            f"  {rid:<8} {cfg['document_type']:<10} "
            f"{cfg['umap_n_neighbors']:<10} "
            f"{cfg['hdbscan_min_cluster_size']:<5} "
            f"{cfg['hdbscan_min_samples']:<5} "
            f"{m.get('num_clusters', 'N/A'):<10} "
            f"{m.get('noise_ratio', 0) * 100:<7.1f}% "
            f"{sil:.4f}"
        )

    return all_results


if __name__ == "__main__":
    run_grid()
