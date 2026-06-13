import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

# How many run 18 cluster IDs have no matching cluster_label?
cur.execute("""
    SELECT COUNT(DISTINCT tc.cluster_id) as total_clusters,
           COUNT(DISTINCT cl.cluster_id) as named_clusters,
           COUNT(DISTINCT tc.cluster_id) - COUNT(DISTINCT cl.cluster_id) as unnamed_clusters
    FROM track_clusters tc
    LEFT JOIN cluster_labels cl ON cl.cluster_id = tc.cluster_id
    WHERE tc.cluster_id != -1
""")
row = cur.fetchone()
print(f"Total clusters in production: {row[0]}")
print(f"Clusters with names:          {row[1]}")
print(f"Clusters WITHOUT names:       {row[2]}")

# Show a sample of mismatched ones - clusters that have a name but wrong content
cur.execute("""
    SELECT cl.cluster_id, cl.name, ar.name as top_artist, COUNT(*) as cnt
    FROM cluster_labels cl
    JOIN track_clusters tc ON tc.cluster_id = cl.cluster_id
    JOIN tracks t ON t.id = tc.track_id
    JOIN artists ar ON ar.id = t.artist_id
    GROUP BY cl.cluster_id, cl.name, ar.name
    ORDER BY cl.cluster_id, cnt DESC
""")
rows = cur.fetchall()

current_cluster = None
print("\nSample — cluster name vs actual top artist:")
print("-" * 70)
shown = 0
for row in rows:
    if row[0] != current_cluster:
        current_cluster = row[0]
        print(f"  [{row[0]}] '{row[1]}' → top artist: {row[2]} ({row[3]} tracks)")
        shown += 1
    if shown >= 20:
        break

conn.close()
