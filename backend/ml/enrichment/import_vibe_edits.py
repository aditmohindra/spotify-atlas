"""
Import human-reviewed vibe descriptions from CSV back to database.
Sets vibe_source='human' for any row where the description was changed.
Sets vibe_source='llm_edited' for rows where approved=TRUE but description unchanged.
Never touches rows where vibe_source='human' already exists in DB.

Usage:
    uv run python ml/enrichment/import_vibe_edits.py --csv ml/enrichment/vibe_descriptions_review.csv
    uv run python ml/enrichment/import_vibe_edits.py --csv ml/enrichment/vibe_descriptions_review.csv --dry-run
"""

import sys
import os
import argparse
import csv
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

from app.models.models import Track

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas")

APPROVED_VALUES = {"true", "yes", "1", "approved", "y"}


def is_approved(value: str) -> bool:
    return value.strip().lower() in APPROVED_VALUES


def main():
    parser = argparse.ArgumentParser(description="Import human-reviewed vibe edits from CSV")
    parser.add_argument("--csv", required=True, help="Path to reviewed CSV file")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing to DB")
    args = parser.parse_args()

    if not os.path.exists(args.csv):
        print(f"Error: CSV file not found: {args.csv}")
        sys.exit(1)

    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        with open(args.csv, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        human_count = 0
        llm_edited_count = 0
        skipped_human = 0
        skipped_not_approved = 0

        now = datetime.now(timezone.utc)

        for row in rows:
            approved_raw = row.get("approved", "").strip()
            if not approved_raw or not is_approved(approved_raw):
                skipped_not_approved += 1
                continue

            track_id_raw = row.get("track_id", "").strip()
            if not track_id_raw:
                continue

            try:
                track_id = int(track_id_raw)
            except ValueError:
                print(f"  Skipping invalid track_id: {track_id_raw!r}")
                continue

            track = session.query(Track).filter(Track.id == track_id).first()
            if not track:
                print(f"  Track {track_id} not found in DB, skipping")
                continue

            # Never overwrite human-curated entries
            if track.vibe_source == "human":
                skipped_human += 1
                if args.dry_run:
                    print(f"  [SKIP human] {track.name}")
                continue

            csv_description = row.get("vibe_document", "").strip()
            db_description = (track.vibe_document or "").strip()

            if csv_description != db_description:
                # Description was changed — treat as human-authored
                if args.dry_run:
                    print(f"  [human] {track.name}: description changed")
                else:
                    track.vibe_document = csv_description
                    track.vibe_source = "human"
                    track.vibe_edited_at = now
                human_count += 1
            else:
                # Description unchanged but approved — mark as llm_edited
                if args.dry_run:
                    print(f"  [llm_edited] {track.name}: approved, unchanged")
                else:
                    track.vibe_source = "llm_edited"
                    track.vibe_edited_at = now
                llm_edited_count += 1

        if not args.dry_run:
            session.commit()

        prefix = "[DRY RUN] " if args.dry_run else ""
        print(
            f"{prefix}Updated: {human_count} human, "
            f"{llm_edited_count} llm_edited, "
            f"{skipped_human} skipped (already human), "
            f"{skipped_not_approved} skipped (not approved)"
        )

    finally:
        session.close()


if __name__ == "__main__":
    main()
