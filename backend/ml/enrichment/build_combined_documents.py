"""
Build vibe_combined_document for all tracks.
Combines LLM vibe prose with cross-artist-filtered Last.fm mood tags.
No artist names. No genre labels. No proper nouns.

Usage:
    uv run python ml/enrichment/build_combined_documents.py
    uv run python ml/enrichment/build_combined_documents.py --spot-check
"""

import sys
import os
import argparse
import asyncio

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
from dotenv import load_dotenv

load_dotenv()

from app.models.models import Track, Artist
from app.services.feature_engineering_v3 import build_all_vibe_combined_documents

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas",
)

SPOT_CHECK_TRACKS = [
    ("Self Care", "Mac Miller"),
    ("Saint Pablo", "Kanye West"),
    ("HOUSTONFORNICATION", "Travis Scott"),
    ("Do Not Disturb", "Drake"),
    ("Nights", "Frank Ocean"),
    ("Beneath the Mask", "Lyn"),
    ("Deference for Darkness", None),   # Halo OST — artist may vary
    ("Chammak Challo", "Vishal-Shekhar"),
    ("Snotty Wax!", "Homixide Gang"),
]


def build_session():
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    return Session()


def print_spot_check(session):
    print("\n" + "=" * 60)
    print("SPOT CHECK — Combined Documents")
    print("=" * 60)

    for track_name, artist_name in SPOT_CHECK_TRACKS:
        q = session.query(Track).options(joinedload(Track.artist))
        q = q.filter(Track.name == track_name)
        if artist_name:
            q = q.join(Artist, Track.artist_id == Artist.id).filter(Artist.name == artist_name)

        track = q.first()

        print(f"\n[{artist_name or 'Unknown Artist'} — {track_name}]")
        if not track:
            print("  !! NOT FOUND IN DB")
            continue
        if not track.vibe_combined_document:
            print("  !! vibe_combined_document is NULL")
            continue
        print(track.vibe_combined_document)


async def main(spot_check: bool):
    session = build_session()
    try:
        result = await build_all_vibe_combined_documents(session)
        print(f"\nSummary: {result}")

        if spot_check:
            print_spot_check(session)
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build vibe_combined_document for all tracks")
    parser.add_argument("--spot-check", action="store_true", help="Print spot-check tracks after building")
    args = parser.parse_args()

    asyncio.run(main(spot_check=args.spot_check))
