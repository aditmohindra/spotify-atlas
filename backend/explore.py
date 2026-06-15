import psycopg2

conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

print("=== FINAL VIBE ASSIGNMENT AUDIT ===\n")

# Overall counts
cur.execute("""
    SELECT assignment_type, COUNT(*)
    FROM clustering_assignments
    WHERE run_id = 29
    GROUP BY assignment_type ORDER BY assignment_type
""")
print("ASSIGNMENT BREAKDOWN:")
for row in cur.fetchall():
    print(f"  {row[0]:<15} {row[1]} tracks")

# Top soft-assigned clusters
print("\nTOP SOFT-ASSIGNED CLUSTERS:")
cur.execute("""
    SELECT ca.soft_cluster_id, COUNT(*) as cnt, AVG(ca.soft_similarity) as avg_sim
    FROM clustering_assignments ca
    WHERE ca.run_id = 29 AND ca.assignment_type = 'soft'
    GROUP BY ca.soft_cluster_id
    ORDER BY cnt DESC LIMIT 10
""")
for row in cur.fetchall():
    cur2 = conn.cursor()
    cur2.execute("""
        SELECT ar.name, COUNT(*) FROM clustering_assignments ca
        JOIN tracks t ON t.id = ca.track_id
        JOIN artists ar ON ar.id = t.artist_id
        WHERE ca.run_id = 29 AND ca.cluster_id = %s AND ca.assignment_type = 'hard'
        GROUP BY ar.name ORDER BY COUNT(*) DESC LIMIT 3
    """, (row[0],))
    artists = ', '.join([r[0] for r in cur2.fetchall()])
    print(f"  Cluster {row[0]:>4} | {row[1]:>4} soft | avg_sim={row[2]:.3f} | {artists}")

# Kanye soft assignments
print("\nKANYE SOFT ASSIGNMENTS:")
cur.execute("""
    SELECT t.name, ca.soft_cluster_id, ca.soft_similarity, ca.assignment_type
    FROM clustering_assignments ca
    JOIN tracks t ON t.id = ca.track_id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE ca.run_id = 29 AND ar.name = 'Kanye West'
    AND ca.assignment_type IN ('soft', 'between_worlds')
    ORDER BY ca.soft_similarity DESC NULLS LAST
""")
for row in cur.fetchall():
    sim = f"{row[2]:.3f}" if row[2] else "N/A"
    print(f"  {row[0][:38]:<38} → cluster {str(row[1]):<5} sim={sim} [{row[3]}]")

# Between worlds tracks
print("\nBETWEEN WORLDS TRACKS (47 total):")
cur.execute("""
    SELECT t.name, ar.name, ca.soft_similarity
    FROM clustering_assignments ca
    JOIN tracks t ON t.id = ca.track_id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE ca.run_id = 29 AND ca.assignment_type = 'between_worlds'
    ORDER BY ca.soft_similarity DESC NULLS LAST
""")
for row in cur.fetchall():
    sim = f"{row[2]:.3f}" if row[2] else "N/A"
    print(f"  {row[0][:35]:<35} {row[1]:<20} sim={sim}")

# Random 20 soft assignments
print("\nRANDOM 20 SOFT ASSIGNMENTS:")
cur.execute("""
    SELECT t.name, ar.name, ca.soft_cluster_id, ca.soft_similarity
    FROM clustering_assignments ca
    JOIN tracks t ON t.id = ca.track_id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE ca.run_id = 29 AND ca.assignment_type = 'soft'
    ORDER BY RANDOM() LIMIT 20
""")
for row in cur.fetchall():
    print(f"  {row[0][:30]:<30} {row[1]:<20} → cluster {row[2]} sim={row[3]:.3f}")

conn.close()
