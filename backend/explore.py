import sys
sys.path.insert(0, '.')
from qdrant_client import QdrantClient
import psycopg2

conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

tracks_to_test = [
    ('Deference for Darkness', 'sound'),
    ('Deference for Darkness', 'scene'),
    ('High Heels', 'scene'),
    ('High Heels', 'sound'),
    ('Nights', 'scene'),
    ('Blinding Lights', 'scene'),
    ('Beneath the Mask', 'scene'),
]

client = QdrantClient(host='127.0.0.1', port=6333)

for track_name, doc_type in tracks_to_test:
    cur.execute(
        "SELECT te.vector, t.id, t.name, ar.name FROM track_embeddings te JOIN tracks t ON t.id = te.track_id JOIN artists ar ON ar.id = t.artist_id WHERE t.name ILIKE %s AND te.document_type = %s LIMIT 1",
        (f'%{track_name}%', doc_type)
    )
    row = cur.fetchone()
    if not row:
        print(f'\n[NOT FOUND] {track_name} ({doc_type})')
        continue

    vector, track_id, found_name, found_artist = list(row[0]), row[1], row[2], row[3]
    collection = f'tracks_{doc_type}'
    results = client.query_points(collection_name=collection, query=vector, limit=8).points

    print(f'\n=== {found_name} — {found_artist} [{doc_type.upper()}] ===')
    for r in results[1:]:
        cur.execute(
            "SELECT t.name, ar.name FROM tracks t JOIN artists ar ON ar.id = t.artist_id WHERE t.id = %s",
            (r.payload['track_id'],)
        )
        track = cur.fetchone()
        if track:
            print(f'  {track[0][:35]:<35} {track[1][:24]:<25} score={r.score:.4f}')

conn.close()
