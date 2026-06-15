import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

cur.execute("""
    SELECT cl.cluster_id, cl.name, cl.canonical_name,
           STRING_AGG(ar.name || ' (' || cnt::text || ')', ', ' ORDER BY cnt DESC)
    FROM cluster_labels cl
    JOIN (
        SELECT ca.cluster_id, ar.name, COUNT(*) as cnt
        FROM clustering_assignments ca
        JOIN tracks t ON t.id = ca.track_id
        JOIN artists ar ON ar.id = t.artist_id
        WHERE ca.run_id = 29 AND ca.assignment_type = 'hard'
        GROUP BY ca.cluster_id, ar.name
    ) top ON top.cluster_id = cl.cluster_id
    JOIN artists ar ON ar.name = top.name
    WHERE cl.cluster_layer = 'vibe'
    GROUP BY cl.cluster_id, cl.name, cl.canonical_name
    ORDER BY cl.cluster_id
""")

rows = cur.fetchall()
print(f"{'ID':>4}  {'Name':<35} {'Top Artists'}")
print("-" * 120)
for row in rows:
    artists = str(row[3] or '')[:70]
    print(f"{row[0]:>4}  {str(row[1]):<35} {artists}")

conn.close()
