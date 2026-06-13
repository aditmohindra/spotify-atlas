import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

# Get all clusters sorted by size, show top artists per cluster
cur.execute("""
    SELECT ca.cluster_id, COUNT(*) as size
    FROM clustering_assignments ca
    WHERE ca.run_id = 29 AND ca.cluster_id != -1
    GROUP BY ca.cluster_id
    ORDER BY size DESC
""")
clusters = cur.fetchall()

print(f"Run 29 — {len(clusters)} clusters\n")
print(f"{'Cluster':>8} {'Size':>6}  Top Artists")
print("-" * 80)

for cluster_id, size in clusters:
    cur.execute("""
        SELECT ar.name, COUNT(*) as cnt
        FROM clustering_assignments ca
        JOIN tracks t ON t.id = ca.track_id
        JOIN artists ar ON ar.id = t.artist_id
        WHERE ca.run_id = 29 AND ca.cluster_id = %s
        GROUP BY ar.name
        ORDER BY cnt DESC
        LIMIT 5
    """, (cluster_id,))
    artists = cur.fetchall()
    artist_str = ", ".join([f"{a[0]} ({a[1]})" for a in artists])
    print(f"{cluster_id:>8} {size:>6}  {artist_str[:70]}")

conn.close()
