import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("SELECT id, era_number, era_type, start_date, end_date, event_count FROM user_eras ORDER BY era_type, era_number LIMIT 10")
for row in cur.fetchall():
    print(row)
conn.close()
