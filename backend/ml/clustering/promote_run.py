"""
Promote a clustering experiment run to the production track_clusters table.

Usage:
    uv run python ml/clustering/promote_run.py <run_id>

This is the ONLY script allowed to overwrite track_clusters.
"""
import os
import sys
import argparse
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import ClusteringRun, ClusteringAssignment, TrackCluster

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def promote(run_id: int):
    db = SessionLocal()
    try:
        run = db.query(ClusteringRun).filter(ClusteringRun.id == run_id).first()
        if run is None:
            print(f"Error: run_id={run_id} not found in clustering_runs.")
            sys.exit(1)

        noise_pct = f"{run.noise_ratio * 100:.1f}%" if run.noise_ratio is not None else "N/A"
        clusters_str = str(run.num_clusters) if run.num_clusters is not None else "?"

        print(
            f"Promoting run {run_id} "
            f"({clusters_str} clusters, {noise_pct} noise) "
            f"to production track_clusters table"
        )
        answer = input("Type 'yes' to proceed: ").strip()

        if answer.lower() != "yes":
            print("Aborted.")
            sys.exit(0)

        assignments = (
            db.query(ClusteringAssignment)
            .filter(ClusteringAssignment.run_id == run_id)
            .all()
        )
        if not assignments:
            print(f"Error: no assignments found for run_id={run_id}.")
            sys.exit(1)

        print(f"Deleting all rows from track_clusters...")
        db.execute(text("DELETE FROM track_clusters"))

        print(f"Inserting {len(assignments)} rows...")
        rows = [
            TrackCluster(
                track_id=a.track_id,
                cluster_id=a.cluster_id,
            )
            for a in assignments
        ]
        db.bulk_save_objects(rows)
        db.commit()

        print(f"Done. {len(rows):,} tracks assigned to production clusters.")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promote an experiment run to production.")
    parser.add_argument("run_id", type=int, help="ID of the ClusteringRun to promote")
    args = parser.parse_args()
    promote(args.run_id)
