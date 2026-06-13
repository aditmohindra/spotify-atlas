import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("SELECT document_type, COUNT(*) FROM track_embeddings GROUP BY document_type ORDER BY document_type")
for row in cur.fetchall():
    print(f"  {row[0]:<20} {row[1]}")
conn.close()
