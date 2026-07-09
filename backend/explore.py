import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("""
    SELECT name, image_url FROM artists 
    WHERE name IN ('Young Thug', 'Future', 'Badfinger', 'Two Door Cinema Club')
    ORDER BY name
""")
for row in cur.fetchall():
    print(f"  {row[0]:<25} {row[1] or 'NULL'}")
conn.close()
