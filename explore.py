import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()
cur.execute("""
    SELECT cl.cluster_id, cl.name, cl.canonical_name, cl.cluster_archetype
    FROM cluster_labels cl
    WHERE cl.cluster_layer = 'vibe'
    ORDER BY cl.cluster_id
""")
rows = cur.fetchall()
print(f"{'ID':>4}  {'Display Name':<35} {'Canonical':<35} Archetype")
print("-" * 100)
for row in rows:
    print(f"{row[0]:>4}  {str(row[1]):<35} {str(row[2]):<35} {row[3]}")
conn.close()
