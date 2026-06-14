import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("SELECT COUNT(DISTINCT cluster_id) FROM track_clusters WHERE cluster_id != -1")
print(f"Production clusters: {cur.fetchone()[0]}")
cur.execute("SELECT id, document_type, num_clusters, cluster_layer FROM clustering_runs WHERE cluster_layer IS NOT NULL ORDER BY id")
for row in cur.fetchall():
    print(f"  run_id={row[0]} doc={row[1]} clusters={row[2]} layer={row[3]}")
conn.close()
