import asyncio
import os
import sys
import numpy as np
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()
from openai import OpenAI
import psycopg2

client = OpenAI()

def embed(text: str) -> np.ndarray:
    response = client.embeddings.create(model="text-embedding-3-small", input=text)
    return np.array(response.data[0].embedding)

def cosine_sim(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

async def test():
    conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
    cur = conn.cursor()

    # Use tracks we KNOW have vibe docs from test50 runs
    tracks_to_test = [
        # Musashi cluster
        ('Violent Crimes', 'Kanye West'),
        ('Bound 2', 'Kanye West'),
        ('Not You Too', 'Drake'),
        ('One Dance', 'Drake'),
        ('Quintana Pt. 2', 'Travis Scott'),
        ('Diamonds & Gold', 'Mac Miller'),
        # Should be far
        ('Beneath the Mask -rain-', 'Lyn'),
        ('Crossroads', 'Christopher Larkin'),
        ('Ishq Wala Love', 'Vishal-Shekhar'),
        ('Snotty Wax!', 'Homixide Gang'),
    ]

    print("Embedding vibe descriptions...")
    embeddings = {}
    for track_name, artist_name in tracks_to_test:
        cur.execute("""
            SELECT t.vibe_document FROM tracks t
            JOIN artists ar ON ar.id = t.artist_id
            WHERE t.name ILIKE %s AND ar.name ILIKE %s
            AND t.vibe_document IS NOT NULL
            LIMIT 1
        """, (f'%{track_name}%', f'%{artist_name}%'))
        row = cur.fetchone()
        if row and row[0]:
            vec = embed(row[0])
            embeddings[(track_name, artist_name)] = vec
            print(f"  ✓ {track_name} — {artist_name}")
        else:
            print(f"  ✗ {track_name} — {artist_name} (no vibe doc)")

    print("\n" + "=" * 65)
    print("KEY COMPARISONS")
    print("=" * 65)

    comparisons = [
        # Within musashi — should be HIGH
        (('Violent Crimes', 'Kanye West'), ('Not You Too', 'Drake'), 'Musashi: Kanye vs Drake — should be HIGH'),
        (('Quintana Pt. 2', 'Travis Scott'), ('Diamonds & Gold', 'Mac Miller'), 'Musashi: Travis vs Mac — should be HIGH'),
        (('Bound 2', 'Kanye West'), ('One Dance', 'Drake'), 'Musashi: Kanye vs Drake 2 — should be HIGH'),
        # Musashi vs game OST — should be LOW
        (('Violent Crimes', 'Kanye West'), ('Crossroads', 'Christopher Larkin'), 'Kanye vs Hollow Knight — should be LOW'),
        (('One Dance', 'Drake'), ('Ishq Wala Love', 'Vishal-Shekhar'), 'Drake vs Bollywood — should be LOW'),
        # Musashi vs underground — interesting
        (('Not You Too', 'Drake'), ('Snotty Wax!', 'Homixide Gang'), 'Drake vs Homixide — nocturnal but different energy'),
        # Game OST vs Bollywood — both non-Western, different vibe
        (('Crossroads', 'Christopher Larkin'), ('Ishq Wala Love', 'Vishal-Shekhar'), 'Hollow Knight vs Bollywood — should be LOW'),
        # Game OST vs rain mask — both atmospheric
        (('Crossroads', 'Christopher Larkin'), ('Beneath the Mask -rain-', 'Lyn'), 'Hollow Knight vs Persona — should be MEDIUM/HIGH'),
    ]

    for (t1, a1), (t2, a2), label in comparisons:
        if (t1, a1) in embeddings and (t2, a2) in embeddings:
            sim = cosine_sim(embeddings[(t1, a1)], embeddings[(t2, a2)])
            bar = '█' * int(sim * 20) + '░' * (20 - int(sim * 20))
            verdict = "✓" if (
                ('should be HIGH' in label and sim > 0.70) or
                ('should be LOW' in label and sim < 0.55) or
                ('MEDIUM' in label and 0.55 < sim < 0.80)
            ) else "?"
            print(f"\n{verdict} {label}")
            print(f"  [{bar}] {sim:.3f}")

    conn.close()

asyncio.run(test())
