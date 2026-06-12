import sys
sys.path.insert(0, '.')
from qdrant_client import QdrantClient
import psycopg2

conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

cur.execute("SELECT te.vector, t.id FROM track_embeddings te JOIN tracks t ON t.id = te.track_id WHERE t.name ILIKE '%Blinding Lights%' AND te.document_type = 'sound' LIMIT 1")
row = cur.fetchone()
if not row:
    print('Track not found')
    exit()
vector, track_id = list(row[0]), row[1]

client = QdrantClient(host='127.0.0.1', port=6333)
results = client.query_points(collection_name='tracks_sound', query=vector, limit=10).points

print('Sonic twins - sound embedding:')
print('-' * 60)
for r in results:
    cur.execute("SELECT t.name, ar.name FROM tracks t JOIN artists ar ON ar.id = t.artist_id WHERE t.id = %s", (r.payload['track_id'],))
    track = cur.fetchone()
    if track:
        print(f'  {track[0][:35]:<35} {track[1][:24]:<25} score={r.score:.4f}')
conn.close()
