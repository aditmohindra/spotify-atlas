"""One-off script to apply archetype name migrations."""
import psycopg2

CONN = "postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas"

UPDATES = [
    # SCENE layer
    """UPDATE cluster_labels SET cluster_archetype = 'Trap Dynasty'
       WHERE cluster_layer = 'scene' AND cluster_archetype IN ('Vibe Architect', 'Urban Maverick')""",
    """UPDATE cluster_labels SET cluster_archetype = 'Festival Regular'
       WHERE cluster_layer = 'scene' AND cluster_archetype IN ('Global Groove Seeker', 'Rhythm Explorer', 'Euphoric Beatseeker', 'Global Vibecaster', 'Eclectic Pulse Chaser')""",
    """UPDATE cluster_labels SET cluster_archetype = 'Terminally Online'
       WHERE cluster_layer = 'scene' AND cluster_archetype IN ('Neo Eclectic Explorer', 'Chaos Curator')""",
    """UPDATE cluster_labels SET cluster_archetype = 'Anime Passport'
       WHERE cluster_layer = 'scene' AND cluster_archetype IN ('Anime Dreamer', 'Tranquil Dreamer')""",
    """UPDATE cluster_labels SET cluster_archetype = 'Lo-Fi Otaku'
       WHERE cluster_layer = 'scene' AND cluster_archetype IN ('Chill Dreamer', 'Serene Soundscaper')""",
    """UPDATE cluster_labels SET cluster_archetype = 'K-Pop Citizen'
       WHERE cluster_layer = 'scene' AND cluster_archetype = 'K-Pop Daydreamer'""",
    """UPDATE cluster_labels SET cluster_archetype = 'Rap Canon Devotee'
       WHERE cluster_layer = 'scene' AND cluster_archetype = 'Introspective Aficionado'""",
    """UPDATE cluster_labels SET cluster_archetype = 'Indie Main Character'
       WHERE cluster_layer = 'scene' AND cluster_archetype = 'Urban Dreamer'""",
    """UPDATE cluster_labels SET cluster_archetype = 'Side Quest Soul'
       WHERE cluster_layer = 'scene' AND cluster_archetype = 'Abstract Vibe Connoisseur'""",
    """UPDATE cluster_labels SET cluster_archetype = 'Desi Household'
       WHERE cluster_layer = 'scene' AND cluster_archetype = 'Urban Groove Seeker'""",
    """UPDATE cluster_labels SET cluster_archetype = 'Club Circuit'
       WHERE cluster_layer = 'scene' AND cluster_archetype IN ('Urban Groove Seeker')""",
    # VIBE layer
    """UPDATE cluster_labels SET cluster_archetype = 'Trap Dynasty'
       WHERE cluster_layer = 'vibe' AND cluster_archetype IN ('Evolving Beat Seeker', 'Melodic Maverick')""",
    """UPDATE cluster_labels SET cluster_archetype = 'Festival Regular'
       WHERE cluster_layer = 'vibe' AND cluster_archetype IN ('Urban Dreamweaver', 'Rhythmic Voyager', 'Nightlife Maverick')""",
    """UPDATE cluster_labels SET cluster_archetype = 'Terminally Online'
       WHERE cluster_layer = 'vibe' AND cluster_archetype = 'Eccentric Globe-Trotter'""",
    """UPDATE cluster_labels SET cluster_archetype = 'Late Night Romantic'
       WHERE cluster_layer = 'vibe' AND cluster_archetype = 'Vibrant Multiverse'""",
    """UPDATE cluster_labels SET cluster_archetype = 'Indie Main Character'
       WHERE cluster_layer = 'vibe' AND cluster_archetype = 'Eclectic Beat Explorer'""",
    """UPDATE cluster_labels SET cluster_archetype = 'Rap Canon Devotee'
       WHERE cluster_layer = 'vibe' AND cluster_archetype = 'Cultural Bridger'""",
    """UPDATE cluster_labels SET cluster_archetype = 'Side Quest Soul'
       WHERE cluster_layer = 'vibe' AND cluster_archetype IN ('Vibe Nomad', 'Vibe Explorer', 'Vibe Navigator', 'Eclectic Dreamer')""",
    """UPDATE cluster_labels SET cluster_archetype = 'K-Pop Citizen'
       WHERE cluster_layer = 'vibe' AND cluster_archetype = 'Eclectic Groove Adventurer'""",
]


def main() -> None:
    conn = psycopg2.connect(CONN)
    conn.autocommit = True
    cur = conn.cursor()

    for stmt in UPDATES:
        cur.execute(stmt)
        print(f"Updated {cur.rowcount} rows")

    print("\n=== Verification ===")
    cur.execute(
        """
        SELECT cluster_archetype, COUNT(*)
        FROM cluster_labels
        GROUP BY cluster_archetype
        ORDER BY cluster_archetype
        """
    )
    for archetype, count in cur.fetchall():
        print(f"  {archetype!r}: {count}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
