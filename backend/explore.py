import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("""
    SELECT cluster_id, name FROM cluster_labels
    WHERE cluster_layer = 'vibe'
    ORDER BY cluster_id
""")
for row in cur.fetchall():
    print(f"  {row[0]:>4}  {row[1]}")
conn.close()
