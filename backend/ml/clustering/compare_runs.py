"""
Print a formatted summary table of all clustering experiment runs,
sorted by silhouette_score descending.

Usage:
    uv run python ml/clustering/compare_runs.py
"""
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import ClusteringRun

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def fmt(value, fmt_str, fallback="N/A"):
    if value is None:
        return fallback
    return format(value, fmt_str)


def main():
    db = SessionLocal()
    try:
        runs = db.query(ClusteringRun).all()
    finally:
        db.close()

    if not runs:
        print("No clustering runs found.")
        return

    runs = sorted(
        runs,
        key=lambda r: r.silhouette_score if r.silhouette_score is not None else -999,
        reverse=True,
    )

    col_widths = {
        "id":        4,
        "doc_type":  13,
        "comps":     6,
        "neighbors": 9,
        "min_dist":  8,
        "min_cls":   7,
        "clusters":  8,
        "noise":     7,
        "sil":       10,
        "coherence": 10,
        "created":   19,
    }

    header = (
        f"{'ID':<{col_widths['id']}}"
        f"  {'Document Type':<{col_widths['doc_type']}}"
        f"  {'Comps':>{col_widths['comps']}}"
        f"  {'Neighbors':>{col_widths['neighbors']}}"
        f"  {'Min Dist':>{col_widths['min_dist']}}"
        f"  {'Min Cls':>{col_widths['min_cls']}}"
        f"  {'Clusters':>{col_widths['clusters']}}"
        f"  {'Noise%':>{col_widths['noise']}}"
        f"  {'Silhouette':>{col_widths['sil']}}"
        f"  {'Coherence':>{col_widths['coherence']}}"
        f"  {'Created':<{col_widths['created']}}"
    )
    divider = "-" * len(header)

    print(divider)
    print(header)
    print(divider)

    for r in runs:
        noise_pct = f"{r.noise_ratio * 100:.1f}%" if r.noise_ratio is not None else "N/A"
        created = r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "N/A"

        row = (
            f"{r.id:<{col_widths['id']}}"
            f"  {r.document_type:<{col_widths['doc_type']}}"
            f"  {r.umap_n_components:>{col_widths['comps']}}"
            f"  {r.umap_n_neighbors:>{col_widths['neighbors']}}"
            f"  {r.umap_min_dist:>{col_widths['min_dist']}.3f}"
            f"  {r.hdbscan_min_cluster_size:>{col_widths['min_cls']}}"
            f"  {fmt(r.num_clusters, 'd'):>{col_widths['clusters']}}"
            f"  {noise_pct:>{col_widths['noise']}}"
            f"  {fmt(r.silhouette_score, '.4f'):>{col_widths['sil']}}"
            f"  {fmt(r.llm_coherence_score, '.4f'):>{col_widths['coherence']}}"
            f"  {created:<{col_widths['created']}}"
        )
        print(row)

    print(divider)
    print(f"  {len(runs)} run(s) total")


if __name__ == "__main__":
    main()
