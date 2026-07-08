import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

print("=== EVENTS BY SOURCE ===")
cur.execute("""
    SELECT source, COUNT(*), MIN(played_at), MAX(played_at)
    FROM listening_events
    GROUP BY source
    ORDER BY COUNT(*) DESC
""")
for row in cur.fetchall():
    print(f"  {str(row[0]):<25} {row[1]:>8} events  {str(row[2])[:10]} → {str(row[3])[:10]}")

print("\n=== EXTENDED HISTORY BY YEAR ===")
cur.execute("""
    SELECT EXTRACT(YEAR FROM played_at)::int as year, COUNT(*),
           SUM(ms_played)/3600000.0 as hours
    FROM listening_events
    WHERE source = 'extended_history'
    GROUP BY year ORDER BY year
""")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]:>6} streams  {row[2]:.1f} hours")

conn.close()
