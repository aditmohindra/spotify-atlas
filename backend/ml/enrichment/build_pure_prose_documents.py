"""
Build pure_prose_document for all tracks.
Contains ONLY the LLM vibe prose — no mood tags, no culture anchors, no metadata.
This is the purest vibe signal for clustering.

Usage:
    uv run python ml/enrichment/build_pure_prose_documents.py
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

load_env_path = os.path.join(os.path.dirname(__file__), "../../.env")
sys.path.append(os.path.join(os.path.dirname(__file__), "../.."))

from dotenv import load_dotenv
load_dotenv(dotenv_path=load_env_path)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.models import Track

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

BATCH_SIZE = 500


def build_pure_prose_documents():
    db = SessionLocal()
    try:
        tracks = (
            db.query(Track)
            .filter(Track.vibe_document.isnot(None))
            .all()
        )
        print(f"Found {len(tracks)} tracks with vibe_document")

        count = 0
        for i, track in enumerate(tracks):
            track.pure_prose_document = f"Vibe: {track.vibe_document}"
            count += 1

            if (i + 1) % BATCH_SIZE == 0:
                db.commit()
                print(f"  Progress: {i + 1}/{len(tracks)} tracks processed")

        db.commit()
        print(f"Built pure_prose_document for {count} tracks")
        return count

    finally:
        db.close()


if __name__ == "__main__":
    build_pure_prose_documents()
