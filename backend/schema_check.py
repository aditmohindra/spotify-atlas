import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position")
for row in cur.fetchall():
    print(f"{row[0]:<30} {row[1]:<30} {row[2]}")
conn.close()
