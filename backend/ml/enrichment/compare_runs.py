import psycopg2

conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

def get_cluster_for_track(run_id, track_name, artist_name):
    cur.execute("""
        SELECT ca.cluster_id, cs.cluster_size, cs.unique_artists
        FROM clustering_assignments ca
        JOIN tracks t ON t.id = ca.track_id
        JOIN artists ar ON ar.id = t.artist_id
        JOIN (
            SELECT ca2.cluster_id,
                   COUNT(*) as cluster_size,
                   COUNT(DISTINCT ar2.id) as unique_artists
            FROM clustering_assignments ca2
            JOIN tracks t2 ON t2.id = ca2.track_id
            JOIN artists ar2 ON ar2.id = t2.artist_id
            WHERE ca2.run_id = %s
            GROUP BY ca2.cluster_id
        ) cs ON cs.cluster_id = ca.cluster_id
        WHERE ca.run_id = %s AND t.name ILIKE %s AND ar.name ILIKE %s
        LIMIT 1
    """, (run_id, run_id, f'%{track_name}%', f'%{artist_name}%'))
    return cur.fetchone()

def get_cluster_top_artists(run_id, cluster_id, limit=4):
    if cluster_id == -1:
        return ["[NOISE]"]
    cur.execute("""
        SELECT ar.name, COUNT(*) as cnt
        FROM clustering_assignments ca
        JOIN tracks t ON t.id = ca.track_id
        JOIN artists ar ON ar.id = t.artist_id
        WHERE ca.run_id = %s AND ca.cluster_id = %s
        GROUP BY ar.name ORDER BY cnt DESC LIMIT %s
    """, (run_id, cluster_id, limit))
    return [f"{r[0]} ({r[1]})" for r in cur.fetchall()]

test_cases = [
    ("Late Night", "Self Care", "Mac Miller"),
    ("Late Night", "Saint Pablo", "Kanye West"),
    ("Late Night", "Do Not Disturb", "Drake"),
    ("Late Night", "Nights", "Frank Ocean"),
    ("Late Night", "Ghost Town", "Kanye West"),
    ("Game/Ambient", "Hollow Knight", "Christopher Larkin"),
    ("Game/Ambient", "Stardew Valley Overture", "ConcernedApe"),
    ("Game/Ambient", "Beneath the Mask", "Lyn"),
    ("Game/Ambient", "Dearly Beloved", "Yoko Shimomura"),
    ("Game/Ambient", "Deference for Darkness", "Martin O'Donnell"),
    ("Hype", "HOUSTONFORNICATION", "Travis Scott"),
    ("Hype", "High Heels Te Nachche", "Meet Bros."),
    ("Hype", "Bijlee Bijlee", "Harrdy Sandhu"),
    ("Hype", "SICKO MODE", "Travis Scott"),
    ("Hype", "goosebumps", "Travis Scott"),
    ("Trap", "Drip Too Hard", "Gunna"),
    ("Trap", "Pick Up the Phone", "Young Thug"),
    ("Trap", "Relationship", "Future"),
    ("Trap", "Yes Indeed", "Lil Baby"),
    ("Trap", "Sold Out Dates", "Gunna"),
]

output = []
output.append("RUN 18 (scene) vs RUN 29 (vibe) - HEAD TO HEAD COMPARISON")
output.append("=" * 80)

current_category = None
for category, track_name, artist_name in test_cases:
    if category != current_category:
        current_category = category
        output.append(f"\n{'─'*80}")
        output.append(f"  CATEGORY: {category}")
        output.append(f"{'─'*80}")

    r18 = get_cluster_for_track(18, track_name, artist_name)
    r29 = get_cluster_for_track(29, track_name, artist_name)

    output.append(f"\n  {track_name} - {artist_name}")

    if r18:
        cluster_id, size, diversity = r18
        artists = get_cluster_top_artists(18, cluster_id)
        diversity_pct = round(diversity/size*100) if size > 0 else 0
        output.append(f"    Run 18 (scene): cluster={cluster_id:>4}  size={size:>4}  diversity={diversity_pct:>3}%")
        output.append(f"                   {', '.join(artists)}")
    else:
        output.append(f"    Run 18 (scene): NOT FOUND")

    if r29:
        cluster_id, size, diversity = r29
        artists = get_cluster_top_artists(29, cluster_id)
        diversity_pct = round(diversity/size*100) if size > 0 else 0
        noise = " NOISE" if cluster_id == -1 else ""
        output.append(f"    Run 29 (vibe):  cluster={cluster_id:>4}  size={size:>4}  diversity={diversity_pct:>3}%{noise}")
        output.append(f"                   {', '.join(artists)}")
    else:
        output.append(f"    Run 29 (vibe):  NOT FOUND")

output.append(f"\n{'='*80}")
output.append("END OF COMPARISON")

result = "\n".join(output)

path = "ml/enrichment/run18_vs_run29_comparison.txt"
with open(path, "w", encoding="utf-8") as f:
    f.write(result)

print(result)
conn.close()
