import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

cur.execute("""
    SELECT DATE_TRUNC('month', played_at) as month, COUNT(*) 
    FROM listening_events
    WHERE source = 'saved_tracks'
    GROUP BY month
    ORDER BY month
""")
print("Saved tracks by month (real added_at dates):")
for row in cur.fetchall():
    print(f"  {row[0].strftime('%Y-%m')}: {row[1]}")

cur.execute("""
    SELECT MIN(played_at), MAX(played_at) 
    FROM listening_events WHERE source = 'saved_tracks'
""")
print("\nRange:", cur.fetchone())

conn.close()
