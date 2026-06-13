import asyncio
import os
import sys
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()
from app.services.vibe_generation import generate_vibe_description, parse_tags_from_feature_document
import psycopg2

async def test():
    conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
    cur = conn.cursor()

    # --- TEST 1: Spot check tracks not in test50 ---
    spot_checks = [
        ('Deference for Darkness', 'Halo'),
        ('Beneath the Mask', 'Lyn'),
        ('Cool For Cats', 'Squeeze'),
        ('Where We Used to Live', 'Laurence Manning'),
        ('Bijlee Bijlee', 'Harrdy Sandhu'),
        ('Burn Water', 'Christopher Larkin'),
        ('Drive, Don\'t Talk', 'Makeout Reef'),
        ('Float On', 'Modest Mouse'),
        ('Pursuit of Happiness', 'Kid Cudi'),
    ]

    print("=" * 60)
    print("SPOT CHECKS")
    print("=" * 60)
    for track_name, artist_name in spot_checks:
        cur.execute("""
            SELECT t.feature_document FROM tracks t
            JOIN artists ar ON ar.id = t.artist_id
            WHERE t.name ILIKE %s AND ar.name ILIKE %s
            LIMIT 1
        """, (f'%{track_name}%', f'%{artist_name}%'))
        row = cur.fetchone()
        tags = parse_tags_from_feature_document(row[0]) if row and row[0] else ''
        desc = await generate_vibe_description(track_name, artist_name, tags)
        print(f"\n[{artist_name}] {track_name}")
        print(f"  → {desc}")
        await asyncio.sleep(0.5)

    # --- TEST 2: Proper noun check on all 42 existing descriptions ---
    print("\n" + "=" * 60)
    print("PROPER NOUN SCAN (42 existing descriptions)")
    print("=" * 60)
    
    # Artist names and common proper nouns to check for
    banned_terms = [
        'drake', 'kanye', 'frank ocean', 'weeknd', 'mac miller',
        'travis scott', 'rocky', 'playboi carti', 'lancey foux',
        'homixide', 'ken carson', 'arijit', 'pritam', 'rahman',
        'vishal', 'christopher larkin', 'toby fox', 'yoko shimomura',
        'hip-hop', 'hip hop', 'r&b', 'rnb', 'electronic', 'pop',
        'rap', 'jazz', 'bollywood', 'anime',
    ]

    cur.execute("""
        SELECT t.name, ar.name, t.vibe_document
        FROM tracks t
        JOIN artists ar ON ar.id = t.artist_id
        WHERE t.vibe_source = 'llm'
    """)
    rows = cur.fetchall()
    violations = []
    for track_name, artist_name, vibe_doc in rows:
        if not vibe_doc:
            continue
        doc_lower = vibe_doc.lower()
        found = [term for term in banned_terms if term in doc_lower]
        if found:
            violations.append((track_name, artist_name, found, vibe_doc))

    if violations:
        print(f"VIOLATIONS FOUND: {len(violations)}")
        for track_name, artist_name, found, doc in violations:
            print(f"\n  [{artist_name}] {track_name}")
            print(f"  Banned terms found: {found}")
            print(f"  Description: {doc[:150]}...")
    else:
        print("CLEAN — no proper nouns or genre labels found in any description")

    # --- TEST 3: Musashi comparison — 30 for 30 vs Say You Will ---
    print("\n" + "=" * 60)
    print("COMPARISON TEST: 30 for 30 (Drake) vs Say You Will (Kanye)")
    print("=" * 60)

    comparison_tracks = [
        ('30 for 30 Freestyle', 'Drake'),
        ('Say You Will', 'Kanye West'),
    ]
    descs = []
    for track_name, artist_name in comparison_tracks:
        cur.execute("""
            SELECT t.feature_document FROM tracks t
            JOIN artists ar ON ar.id = t.artist_id
            WHERE t.name ILIKE %s AND ar.name ILIKE %s
            LIMIT 1
        """, (f'%{track_name}%', f'%{artist_name}%'))
        row = cur.fetchone()
        tags = parse_tags_from_feature_document(row[0]) if row and row[0] else ''
        desc = await generate_vibe_description(track_name, artist_name, tags)
        descs.append((track_name, artist_name, desc))
        print(f"\n[{artist_name}] {track_name}")
        print(f"  → {desc}")
        await asyncio.sleep(0.5)

    # Shared vocabulary analysis
    print("\n--- Shared vocabulary ---")
    if len(descs) == 2:
        words1 = set(descs[0][2].lower().split()) if descs[0][2] else set()
        words2 = set(descs[1][2].lower().split()) if descs[1][2] else set()
        stopwords = {'a','an','the','and','or','but','in','on','at','to','for',
                     'of','with','as','is','it','its','you','your','like','that',
                     'this','are','was','be','by','from','has','have','had','not',
                     'if','so','do','up','out','all','can','into','while','through',
                     'both','where','what','there','their','they','feel','feels',
                     'feeling','sense','sense','creates','create','evokes','evoke'}
        shared = words1 & words2 - stopwords
        meaningful = [w for w in shared if len(w) > 4]
        print(f"  Shared meaningful words: {sorted(meaningful)}")

    conn.close()

asyncio.run(test())
