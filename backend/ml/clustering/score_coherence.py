"""
Score cluster coherence using GPT-4o-mini.

For each cluster in a run, feeds top 10 tracks + top 5 artists + top tags
to GPT-4o-mini and asks for a coherence rating 1-10.
Stores the average as clustering_runs.llm_coherence_score.

Usage:
    uv run python ml/clustering/score_coherence.py --run-id 12
    uv run python ml/clustering/score_coherence.py --run-id 12 --max-clusters 20
"""
import argparse
import os
import sys
import time
import re
from collections import Counter
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from openai import OpenAI

from app.models.models import ClusteringRun, ClusteringAssignment, Track, Artist

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

openai_client = OpenAI(api_key=OPENAI_API_KEY)

COHERENCE_PROMPT_TEMPLATE = """\
You are evaluating music cluster coherence.
Cluster contents:

Top tracks: {tracks}

Top artists: {artists}

Top tags: {tags}

Rate this cluster's coherence from 1-10, where:
10 = perfectly coherent (all tracks clearly belong together culturally/sonically)
5 = somewhat coherent (loose theme but mixed)
1 = incoherent (random assortment)

Respond with ONLY a single integer from 1-10. No explanation."""


def parse_tags_from_document(document: str) -> list[str]:
    """Extract Genre and Mood tags from a feature_document or scene_document."""
    if not document:
        return []
    tags = []
    for line in document.split('\n'):
        if line.startswith('Genre:') or line.startswith('Genres:'):
            prefix = 'Genre:' if line.startswith('Genre:') else 'Genres:'
            raw = line[len(prefix):].strip()
            tags.extend([t.strip() for t in raw.split(',') if t.strip()])
        elif line.startswith('Mood:') or line.startswith('Moods:'):
            prefix = 'Mood:' if line.startswith('Mood:') else 'Moods:'
            raw = line[len(prefix):].strip()
            tags.extend([t.strip() for t in raw.split(',') if t.strip()])
    return tags


def score_cluster(cluster_id: int, track_names: list, artist_names: list, tags: list) -> int | None:
    """Ask GPT-4o-mini for a coherence score. Returns int 1-10 or None on failure."""
    tracks_str = ", ".join(track_names[:10]) if track_names else "unknown"
    artists_str = ", ".join(artist_names[:5]) if artist_names else "unknown"
    tags_str = ", ".join(tags[:10]) if tags else "none"

    prompt = COHERENCE_PROMPT_TEMPLATE.format(
        tracks=tracks_str,
        artists=artists_str,
        tags=tags_str,
    )

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=5,
            temperature=0,
        )
        text = response.choices[0].message.content.strip()
        match = re.search(r'\b([1-9]|10)\b', text)
        if match:
            return int(match.group(1))
        print(f"  Cluster {cluster_id}: unexpected GPT response '{text}', skipping")
        return None
    except Exception as e:
        print(f"  Cluster {cluster_id}: API error — {e}, skipping")
        return None


def run_coherence_scoring(run_id: int, max_clusters: int = None):
    db = SessionLocal()
    try:
        run = db.query(ClusteringRun).filter(ClusteringRun.id == run_id).first()
        if run is None:
            print(f"Error: run_id={run_id} not found in clustering_runs.")
            sys.exit(1)

        print(f"Scoring coherence for run_id={run_id} (doc_type={run.document_type})")

        assignments = (
            db.query(ClusteringAssignment)
            .filter(
                ClusteringAssignment.run_id == run_id,
                ClusteringAssignment.cluster_id != -1,
            )
            .all()
        )

        # Group by cluster_id
        cluster_track_ids: dict[int, list[int]] = {}
        for a in assignments:
            cluster_track_ids.setdefault(a.cluster_id, []).append(a.track_id)

        cluster_ids = sorted(cluster_track_ids.keys())
        if max_clusters is not None:
            cluster_ids = cluster_ids[:max_clusters]

        print(f"Scoring {len(cluster_ids)} clusters "
              f"({'all' if max_clusters is None else f'capped at {max_clusters}'} of "
              f"{len(cluster_track_ids)} total)...")

        scores = []

        for i, cluster_id in enumerate(cluster_ids):
            track_ids = cluster_track_ids[cluster_id]

            tracks = (
                db.query(Track)
                .filter(Track.id.in_(track_ids))
                .all()
            )

            track_names = [t.name for t in tracks[:10]]

            artist_counts: Counter = Counter()
            all_tags: list[str] = []
            for t in tracks:
                if t.artist_id:
                    artist = db.query(Artist).filter(Artist.id == t.artist_id).first()
                    if artist:
                        artist_counts[artist.name] += 1
                doc = t.scene_document or t.feature_document
                all_tags.extend(parse_tags_from_document(doc))

            top_artists = [name for name, _ in artist_counts.most_common(5)]
            top_tags = [tag for tag, _ in Counter(all_tags).most_common(10)]

            score = score_cluster(cluster_id, track_names, top_artists, top_tags)

            if score is not None:
                scores.append(score)
                print(f"  Cluster {cluster_id:>4}  (n={len(track_ids):>4})  score={score}")
            else:
                print(f"  Cluster {cluster_id:>4}  (n={len(track_ids):>4})  score=SKIPPED")

            if i < len(cluster_ids) - 1:
                time.sleep(0.5)

        if not scores:
            print("No clusters scored successfully.")
            return

        avg_score = sum(scores) / len(scores)
        min_score = min(scores)
        max_score = max(scores)

        print(f"\n=== COHERENCE SCORING SUMMARY (run_id={run_id}) ===")
        print(f"  Clusters scored: {len(scores)}")
        print(f"  Average score:   {avg_score:.4f}")
        print(f"  Min score:       {min_score}")
        print(f"  Max score:       {max_score}")

        run.llm_coherence_score = avg_score
        db.commit()
        print(f"  Updated clustering_runs.llm_coherence_score = {avg_score:.4f}")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Score cluster coherence with GPT-4o-mini.")
    parser.add_argument("--run-id", type=int, required=True)
    parser.add_argument("--max-clusters", type=int, default=None,
                        help="Limit number of clusters to score (default: all)")
    args = parser.parse_args()

    run_coherence_scoring(run_id=args.run_id, max_clusters=args.max_clusters)
