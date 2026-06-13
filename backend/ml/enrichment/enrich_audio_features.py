"""
Enrich all tracks with audio features from GetSongBPM API.
Skips tracks that already have audio_features_source = 'getsongbpm'.
Rate limit: 3000 req/hour = max ~0.83/sec → use 1.3s delay between tracks.

Usage:
    uv run python ml/enrichment/enrich_audio_features.py
    uv run python ml/enrichment/enrich_audio_features.py --limit 100  # test run
"""

import sys
import os
import argparse
import asyncio
from collections import defaultdict

# Allow imports from backend root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import create_engine, or_
from sqlalchemy.orm import sessionmaker, joinedload
from dotenv import load_dotenv

load_dotenv()

from app.models.models import Track
from app.services.getsongbpm import enrich_track

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas")

RATE_LIMIT_DELAY = 1.3
COMMIT_EVERY = 100


def build_session():
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    return Session()


async def run_enrichment(limit: int | None = None, offset: int = 0):
    session = build_session()

    try:
        query = (
            session.query(Track)
            .options(joinedload(Track.artist))
            .filter(
                or_(
                    Track.audio_features_source.is_(None),
                    Track.audio_features_source != "getsongbpm",
                )
            )
        )

        if offset:
            query = query.offset(offset)
        if limit:
            query = query.limit(limit)

        tracks = query.all()
        total = len(tracks)
        print(f"Loaded {total} tracks to enrich (limit={limit})")

        matched = 0
        unmatched = 0
        unmatched_artists: dict[str, int] = defaultdict(int)

        for i, track in enumerate(tracks):
            artist_name = track.artist.name if track.artist else ""
            if not artist_name:
                unmatched += 1
                await asyncio.sleep(RATE_LIMIT_DELAY)
                continue

            result = await enrich_track(track.name, artist_name)

            if result is not None:
                track.getsongbpm_id = result.get("getsongbpm_id")
                track.bpm = result.get("bpm")
                track.audio_energy = result.get("audio_energy")
                track.audio_danceability = result.get("audio_danceability")
                track.audio_acousticness = result.get("audio_acousticness")
                track.audio_liveness = result.get("audio_liveness")
                track.audio_key = result.get("audio_key")
                track.audio_features_source = "getsongbpm"
                matched += 1
            else:
                unmatched += 1
                unmatched_artists[artist_name] += 1

            processed = i + 1
            if processed % COMMIT_EVERY == 0:
                session.commit()
                print(f"Processed {processed}/{total} — matched: {matched}, unmatched: {unmatched}")

            await asyncio.sleep(RATE_LIMIT_DELAY)

        session.commit()

        # Final summary
        print()
        print("=== ENRICHMENT COMPLETE ===")
        print()
        print(f"Total tracks:     {total}")
        print()
        print(f"Matched:          {matched}  ({matched/total*100:.1f}%)" if total else "Matched:          0")
        print(f"Unmatched:        {unmatched}  ({unmatched/total*100:.1f}%)" if total else "Unmatched:        0")

        if unmatched_artists:
            print("Top unmatched artists (sample):")
            top = sorted(unmatched_artists.items(), key=lambda x: -x[1])[:10]
            for artist, count in top:
                print(f"  {artist:<24} — {count} tracks")

        # Coverage stats
        refreshed = (
            session.query(Track)
            .filter(Track.audio_features_source == "getsongbpm")
            .all()
        )
        bpm_count = sum(1 for t in refreshed if t.bpm is not None)
        energy_count = sum(1 for t in refreshed if t.audio_energy is not None)
        dance_count = sum(1 for t in refreshed if t.audio_danceability is not None)
        acoustic_count = sum(1 for t in refreshed if t.audio_acousticness is not None)
        live_count = sum(1 for t in refreshed if t.audio_liveness is not None)

        print("Audio feature coverage:")
        print(f"  bpm:              {bpm_count} tracks")
        print(f"  energy:           {energy_count} tracks")
        print(f"  danceability:     {dance_count} tracks")
        print(f"  acousticness:     {acoustic_count} tracks")
        print(f"  liveness:         {live_count} tracks")

    finally:
        session.close()


def main():
    parser = argparse.ArgumentParser(description="Enrich tracks with GetSongBPM audio features")
    parser.add_argument("--limit", type=int, default=None, help="Only process N tracks")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N unenriched tracks (useful for resuming or targeting)")
    args = parser.parse_args()

    asyncio.run(run_enrichment(limit=args.limit, offset=args.offset))


if __name__ == "__main__":
    main()
