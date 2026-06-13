import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("UPDATE clustering_runs SET cluster_layer = 'vibe' WHERE id = 29")
conn.commit()
print("Run 29 marked as vibe production layer")
cur.execute("SELECT id, document_type, num_clusters, noise_ratio, silhouette_score, cluster_layer FROM clustering_runs WHERE cluster_layer IS NOT NULL ORDER BY id")
for row in cur.fetchall():
    print(f"  run_id={row[0]} doc={row[1]} clusters={row[2]} noise={row[3]:.1%} sil={row[4]:.4f} layer={row[5]}")
conn.close()
