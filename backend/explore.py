import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("SELECT era_number, start_date, end_date, event_count, dominant_cluster_ids FROM user_eras ORDER BY era_number")
for row in cur.fetchall():
    print(row)
conn.close()
