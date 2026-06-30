"""
Seed era_labels with default Roman numeral titles.

Usage:
    uv run python ml/eras/era_naming_prompt.py
    uv run python ml/eras/era_naming_prompt.py --user-id 1
"""
import argparse
import os
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import EraLabel, UserEra

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

DEFAULT_USER_ID = 1


def int_to_roman(n: int) -> str:
    vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"]
    result = ""
    for val, sym in zip(vals, syms):
        count, n = divmod(n, val)
        result += sym * count
    return result


def default_title(era_number: int) -> str:
    return f"Era {int_to_roman(era_number)}"


def seed_era_labels(user_id: int) -> None:
    db = SessionLocal()
    try:
        eras = (
            db.query(UserEra)
            .filter(UserEra.user_id == user_id)
            .order_by(UserEra.era_number)
            .all()
        )

        if not eras:
            print(f"No eras found for user_id={user_id}")
            return

        for era in eras:
            title = default_title(era.era_number)
            existing = db.query(EraLabel).filter(EraLabel.era_id == era.id).first()

            if existing:
                existing.title = title
                existing.description = None
                existing.mood = None
                existing.key_tracks = None
                existing.edited_at = None
            else:
                db.add(EraLabel(
                    era_id=era.id,
                    title=title,
                    description=None,
                    mood=None,
                    key_tracks=None,
                    edited_at=None,
                ))

            print(f"  Era {era.era_number}: {title}")

        db.commit()
        print(f"\nSeeded {len(eras)} era labels for user_id={user_id}")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Seed default Roman numeral era titles")
    parser.add_argument("--user-id", type=int, default=DEFAULT_USER_ID)
    args = parser.parse_args()
    seed_era_labels(args.user_id)


if __name__ == "__main__":
    main()
