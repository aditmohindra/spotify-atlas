"""
Generate LLM vibe descriptions for all tracks using GPT-4o-mini.
Skips tracks where vibe_source IN ('llm', 'human', 'llm_edited') — never overwrites human edits.

Usage:
    # 50-track test (specific tracks across library profile)
    uv run python ml/enrichment/generate_vibe_descriptions.py --mode test50

    # Full run
    uv run python ml/enrichment/generate_vibe_descriptions.py --mode full

    # Export CSV for manual review
    uv run python ml/enrichment/generate_vibe_descriptions.py --export-csv
"""

import sys
import os
import argparse
import asyncio
import csv
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker, joinedload
from dotenv import load_dotenv

load_dotenv()

from app.models.models import Track, Artist
from app.services.vibe_generation import (
    generate_vibe_description,
    parse_tags_from_feature_document,
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas")

EXPORT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vibe_descriptions_review.csv")

SKIPPED_SOURCES = {"llm", "human", "llm_edited"}

TEST_ARTISTS = {
    "mainstream": ["Drake", "The Weeknd", "Frank Ocean", "Kanye West", "Mac Miller"],
    "anime_game": ["Lyn", "Shoji Meguro", "Toby Fox", "Christopher Larkin", "Yoko Shimomura"],
    "underground": ["Homixide Gang", "Lancey Foux", "Playboi Carti", "Pi'erre Bourne", "Ken Carson"],
    "bollywood": ["Vishal-Shekhar", "Pritam", "Honey Singh", "Arijit Singh", "A.R. Rahman"],
    "musashi": ["Mac Miller", "Kanye West", "A$AP Rocky", "Travis Scott", "Drake"],
}


def build_session():
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    return Session()


def collect_test50_tracks(session) -> list[tuple[str, object]]:
    """
    Returns list of (category_label, track) for the 50-track test.
    2 tracks per artist per category, using RANDOM(). Global dedup by track_id.
    """
    result: list[tuple[str, object]] = []
    seen_ids: set[int] = set()

    for category, artists in TEST_ARTISTS.items():
        for artist_name in artists:
            tracks = (
                session.query(Track)
                .options(joinedload(Track.artist))
                .join(Artist, Track.artist_id == Artist.id)
                .filter(Artist.name == artist_name)
                .filter(Track.vibe_source.is_(None))
                .filter(~Track.id.in_(seen_ids) if seen_ids else True)
                .order_by(func.random())
                .limit(2)
                .all()
            )
            for t in tracks:
                if t.id not in seen_ids:
                    seen_ids.add(t.id)
                    result.append((category, t))

    return result


async def run_test50(session):
    labeled_tracks = collect_test50_tracks(session)
    print(f"Collected {len(labeled_tracks)} tracks for test50\n")

    # Count per category for numbering
    cat_counters: dict[str, int] = {cat: 0 for cat in TEST_ARTISTS}
    cat_totals: dict[str, int] = {}
    for cat, _ in labeled_tracks:
        cat_totals[cat] = cat_totals.get(cat, 0) + 1

    none_count = 0
    commits = 0

    for category, track in labeled_tracks:
        cat_counters[category] += 1
        n = cat_counters[category]
        total = cat_totals.get(category, "?")
        artist_name = track.artist.name if track.artist else "Unknown"
        existing_tags = parse_tags_from_feature_document(track.feature_document or "")

        print(f"[{category} {n}/{total}] {track.name} \u2014 {artist_name}")

        description = await generate_vibe_description(track.name, artist_name, existing_tags)

        if description:
            print(f'  \u2192 "{description}"\n')
            track.vibe_document = description
            track.vibe_source = "llm"
            track.vibe_generated_at = datetime.now(timezone.utc)
            commits += 1
        else:
            print(f"  \u2192 [None — API error]\n")
            none_count += 1

        await asyncio.sleep(0.5)

    session.commit()

    print(f"=== TEST50 COMPLETE ===")
    print(f"Saved:  {commits}")
    print(f"Failed: {none_count}")


async def run_full(session):
    tracks = (
        session.query(Track)
        .options(joinedload(Track.artist))
        .filter(Track.vibe_source.is_(None))
        .all()
    )
    total = len(tracks)
    print(f"Loaded {total} tracks without vibe descriptions\n")

    cost_per_track = 200 / 1_000_000 * 0.60
    generated = 0
    failed = 0

    for i, track in enumerate(tracks):
        artist_name = track.artist.name if track.artist else ""
        existing_tags = parse_tags_from_feature_document(track.feature_document or "")

        description = await generate_vibe_description(track.name, artist_name, existing_tags)

        if description:
            track.vibe_document = description
            track.vibe_source = "llm"
            track.vibe_generated_at = datetime.now(timezone.utc)
            generated += 1
        else:
            failed += 1

        processed = i + 1
        if processed % 100 == 0:
            session.commit()
            cost = processed * cost_per_track
            print(f"Generated {processed}/{total} ({processed/total*100:.1f}%) — cost estimate: ${cost:.2f}")

        await asyncio.sleep(0.5)

    session.commit()
    total_cost = total * cost_per_track
    print(f"\n=== FULL GENERATION COMPLETE ===")
    print(f"Total:     {total}")
    print(f"Generated: {generated}")
    print(f"Failed:    {failed}")
    print(f"Est. cost: ${total_cost:.2f}")


def run_export_csv(session):
    tracks = (
        session.query(Track)
        .options(joinedload(Track.artist))
        .filter(Track.vibe_document.isnot(None))
        .join(Artist, Track.artist_id == Artist.id)
        .order_by(Artist.name, Track.name)
        .all()
    )

    with open(EXPORT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["track_id", "name", "artist", "existing_tags", "vibe_document", "vibe_source", "approved"])
        for track in tracks:
            artist_name = track.artist.name if track.artist else ""
            existing_tags = parse_tags_from_feature_document(track.feature_document or "")
            writer.writerow([
                track.id,
                track.name,
                artist_name,
                existing_tags,
                track.vibe_document,
                track.vibe_source or "",
                "",
            ])

    print(f"Exported {len(tracks)} tracks to {EXPORT_PATH}")


def main():
    parser = argparse.ArgumentParser(description="Generate LLM vibe descriptions for tracks")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--mode", choices=["test50", "full"], help="Generation mode")
    group.add_argument("--export-csv", action="store_true", help="Export vibe docs to CSV for review")
    args = parser.parse_args()

    session = build_session()
    try:
        if args.export_csv:
            run_export_csv(session)
        elif args.mode == "test50":
            asyncio.run(run_test50(session))
        elif args.mode == "full":
            asyncio.run(run_full(session))
    finally:
        session.close()


if __name__ == "__main__":
    main()
