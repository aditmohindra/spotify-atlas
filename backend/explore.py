import psycopg2
conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

pure_vibe_clusters = [
    (71, 'Game OST'),
    (67, 'Indie Rock'),
    (48, 'Jazz Hip-Hop'),
    (47, 'Underground/Alternative Hip-Hop'),
    (35, 'Late Night R&B'),
    (89, 'Mystery Cluster'),
]

output_lines = []
output_lines.append("SPOTIFY ATLAS — PURE VIBE CLUSTER DEEP DIVE")
output_lines.append("Run 29 | Checking if clusters formed on pure vibe or tag signal")
output_lines.append("=" * 70)

for cluster_id, label in pure_vibe_clusters:
    # Stats
    cur.execute("""
        SELECT COUNT(DISTINCT ar.id), COUNT(*)
        FROM clustering_assignments ca
        JOIN tracks t ON t.id = ca.track_id
        JOIN artists ar ON ar.id = t.artist_id
        WHERE ca.run_id = 29 AND ca.cluster_id = %s
    """, (cluster_id,))
    unique_artists, total = cur.fetchone()

    # Full track list
    cur.execute("""
        SELECT t.name, ar.name
        FROM clustering_assignments ca
        JOIN tracks t ON t.id = ca.track_id
        JOIN artists ar ON ar.id = t.artist_id
        WHERE ca.run_id = 29 AND ca.cluster_id = %s
        ORDER BY ar.name, t.name
    """, (cluster_id,))
    tracks = cur.fetchall()

    # All unique mood tags present in this cluster
    cur.execute("""
        SELECT t.vibe_combined_document
        FROM clustering_assignments ca
        JOIN tracks t ON t.id = ca.track_id
        WHERE ca.run_id = 29 AND ca.cluster_id = %s
        AND t.vibe_combined_document IS NOT NULL
    """, (cluster_id,))
    docs = cur.fetchall()

    # Parse mood tags from all documents
    from collections import Counter
    tag_counter = Counter()
    prose_only_count = 0
    for (doc,) in docs:
        if not doc:
            continue
        if 'Mood:' in doc:
            mood_line = [l for l in doc.split('\n') if l.startswith('Mood:')]
            if mood_line:
                tags = [t.strip() for t in mood_line[0].replace('Mood:', '').split(',')]
                for tag in tags:
                    if tag:
                        tag_counter[tag] += 1
        else:
            prose_only_count += 1

    # 5 sample documents from most diverse artists
    cur.execute("""
        SELECT DISTINCT ON (ar.id) t.name, ar.name, t.vibe_combined_document
        FROM clustering_assignments ca
        JOIN tracks t ON t.id = ca.track_id
        JOIN artists ar ON ar.id = t.artist_id
        WHERE ca.run_id = 29 AND ca.cluster_id = %s
        AND t.vibe_combined_document IS NOT NULL
        ORDER BY ar.id, RANDOM()
        LIMIT 5
    """, (cluster_id,))
    samples = cur.fetchall()

    output_lines.append(f"\n{'='*70}")
    output_lines.append(f"  CLUSTER {cluster_id} — {label}")
    output_lines.append(f"  {total} tracks | {unique_artists} unique artists | {round(unique_artists/total*100)}% diversity")
    output_lines.append(f"{'='*70}")

    # Tag analysis
    output_lines.append(f"\n  TAG ANALYSIS (did this cluster form on tags or pure vibe?):")
    output_lines.append(f"  Tracks with mood tags: {total - prose_only_count}/{total}")
    output_lines.append(f"  Tracks with NO tags (pure prose): {prose_only_count}/{total}")
    if tag_counter:
        output_lines.append(f"  Top tags across cluster:")
        for tag, count in tag_counter.most_common(15):
            pct = round(count/total*100)
            bar = '█' * (pct // 5) + '░' * (20 - pct // 5)
            output_lines.append(f"    [{bar}] {pct:>3}%  {tag} ({count} tracks)")
    else:
        output_lines.append(f"  NO TAGS — pure vibe cluster")

    # Full track list
    output_lines.append(f"\n  FULL TRACK LIST:")
    for track_name, artist_name in tracks:
        output_lines.append(f"    {track_name[:38]:<38} {artist_name}")

    # Sample documents
    output_lines.append(f"\n  SAMPLE DOCUMENTS (what the algorithm actually saw):")
    for track_name, artist_name, doc in samples:
        output_lines.append(f"\n  [{artist_name}] {track_name}")
        if doc:
            for line in doc.split('\n'):
                output_lines.append(f"    {line}")

output_lines.append(f"\n{'='*70}")
output_lines.append("END OF REPORT")

output = "\n".join(output_lines)
path = "ml/enrichment/pure_vibe_clusters.txt"
with open(path, "w", encoding="utf-8") as f:
    f.write(output)

print(f"Exported to {path}")
for cluster_id, label in pure_vibe_clusters:
    cur.execute("""
        SELECT COUNT(*) FROM clustering_assignments
        WHERE run_id = 29 AND cluster_id = %s
    """, (cluster_id,))
    count = cur.fetchone()[0]
    print(f"  Cluster {cluster_id} ({label}): {count} tracks")

conn.close()
