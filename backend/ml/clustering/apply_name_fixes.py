"""
Targeted rename pass for vibe community labels (Run 29).
Only touches cluster_labels WHERE cluster_layer = 'vibe'.
Does not touch scene labels, cluster assignments, or track data.

Usage:
    uv run python ml/clustering/apply_name_fixes.py
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

load_env_path = os.path.join(os.path.dirname(__file__), "../../.env")
sys.path.append(os.path.join(os.path.dirname(__file__), "../.."))

from dotenv import load_dotenv
load_dotenv(dotenv_path=load_env_path)

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models.models import ClusterLabel

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

RENAMES = {
    9:   "Route 209",
    10:  "Halo Theme Drop",
    11:  "Zaragoza Underground",
    12:  "Ibiza Season",
    13:  "Hybrid Theory Kid",
    14:  "Fabric London",
    15:  "Newgrounds Alumni",
    16:  "SoundCloud 2021",
    18:  "Arijit Singh Unplugged",
    19:  "Dil Chahta Hai Era",
    20:  "AP Dhillon Aesthetic",
    22:  "Defqon.1",
    23:  "Fabric Room Two",
    24:  "São Paulo After Dark",
    25:  "Drift King Playlist",
    29:  "Printworks Closing Set",
    30:  "Tumblr Playlist 2013",
    31:  "Koishi Komeiji Plugg",
    32:  "De School Amsterdam",
    33:  "SoundCloud Discovery Feed",
    34:  "Strawberry Fields Sydney",
    37:  "Robert Johnson Offenbach",
    39:  "HARD Summer Mainstage",
    40:  "Tim Westwood Freestyle",
    41:  "Tresor Berlin",
    42:  "Printworks Main Room",
    43:  "A State of Trance",
    44:  "Output Brooklyn",
    45:  "Tomorrowland Main Stage",
    46:  "Coffee Shop Closing Time",
    49:  "Shibuya 109 Rooftop",
    50:  "Crunchyroll Waiting Room",
    52:  "BET Hip Hop Awards 2009",
    54:  "Sigilkore Discord",
    55:  "SoundCloud 2018",
    56:  "Pluggnb Dropbox",
    58:  "Top of the Pops 1983",
    61:  "Mac DeMarco's Porch",
    63:  "Ninja Academy Courtyard",
    65:  "Bleach Arc Transition",
    66:  "ISOxo Discord Mosh",
    68:  "NME Class of 2001",
    70:  "Piano Collections",
    73:  "Chillhop Records",
    74:  "Crate & Barrel",
    75:  "TRL Countdown",
    76:  "Electric Zoo 2012",
    77:  "XS Nightclub Vegas",
    78:  "Cream Ibiza",
    79:  "Stadium EDM Row",
    80:  "Nawfside Tunnel",
    81:  "Huncho Jack Interlude",
    82:  "Late Night SoundCloud",
    83:  "Zora's Domain",
    84:  "Thousand Sunny Deck",
    85:  "Donda Sessions",
    86:  "Travis Scott Interlude",
    87:  "Printworks Closing Night",
    90:  "4AM Study Hall",
    92:  "Virgil Abloh Sample",
    93:  "QC Playlist",
    94:  "Culture Tape",
    95:  "Quavo Interlude",
    96:  "Houston Freeway",
    97:  "SoundCloud Global",
    98:  "Late Night Kanye",
    100: "Rap Caviar Adjacent",
    101: "808 Mafia Session",
}


def apply_renames():
    db = SessionLocal()
    try:
        renamed = 0
        not_found = []

        for cluster_id, new_name in sorted(RENAMES.items()):
            label = (
                db.query(ClusterLabel)
                .filter(
                    ClusterLabel.cluster_id == cluster_id,
                    ClusterLabel.cluster_layer == "vibe",
                )
                .first()
            )
            if label is None:
                not_found.append(cluster_id)
                print(f"  WARNING cluster {cluster_id}: not found in cluster_labels (vibe)")
                continue

            old_name = label.name
            label.name = new_name
            renamed += 1
            print(f"  cluster {cluster_id}: {old_name} → {new_name}")

        db.commit()

        # Duplicate check
        print("\nRunning duplicate name check...")
        rows = db.execute(text(
            "SELECT name, COUNT(*) as cnt "
            "FROM cluster_labels "
            "WHERE cluster_layer = 'vibe' "
            "GROUP BY name HAVING COUNT(*) > 1 "
            "ORDER BY cnt DESC"
        )).fetchall()

        if rows:
            print("DUPLICATES FOUND:")
            for row in rows:
                print(f"  '{row[0]}': {row[1]} occurrences")
            raise RuntimeError(f"{len(rows)} duplicate name(s) detected — fix before proceeding.")

        if not_found:
            print(f"\nWARNING: {len(not_found)} cluster_ids not found: {not_found}")

        print(f"\n{renamed} clusters renamed, 0 duplicates")
        return renamed

    finally:
        db.close()


if __name__ == "__main__":
    apply_renames()
