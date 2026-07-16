import re
import psycopg2
import pandas as pd
from collections import defaultdict

conn = psycopg2.connect(
    host="127.0.0.1", port=5433,
    dbname="spotify_atlas", user="spotify_atlas", password="spotify_atlas_password"
)

artists = pd.read_sql("SELECT id, name FROM artists WHERE name IS NOT NULL", conn)
tracks = pd.read_sql("""
    SELECT t.id, t.artist_id, t.vibe_combined_document,
           ca.cluster_id, ca.run_id
    FROM tracks t
    JOIN clustering_assignments ca ON ca.track_id = t.id
    WHERE ca.run_id = 29 AND t.vibe_combined_document IS NOT NULL
""", conn)

artist_patterns = {}
for _, row in artists.iterrows():
    name = row["name"].strip()
    if len(name) < 4:
        continue
    artist_patterns[row["id"]] = re.compile(r'\b' + re.escape(name.lower()) + r'\b')

leak_counts = defaultdict(int)
affected_clusters = defaultdict(set)
affected_track_ids = []

for _, row in tracks.iterrows():
    doc = row["vibe_combined_document"].lower()
    own_artist = row["artist_id"]
    for aid, pattern in artist_patterns.items():
        if aid == own_artist:
            continue
        if pattern.search(doc):
            leak_counts[aid] += 1
            affected_clusters[row["cluster_id"]].add(artists.loc[artists.id == aid, "name"].values[0])
            affected_track_ids.append(row["id"])

print(f"Total leaked track instances: {len(affected_track_ids)}")
print(f"Distinct tracks affected: {len(set(affected_track_ids))}")
print(f"Distinct clusters affected: {len(affected_clusters)}")
print("\nTop leaking artist names (by track count):")
top = sorted(leak_counts.items(), key=lambda x: -x[1])[:20]
for aid, cnt in top:
    name = artists.loc[artists.id == aid, "name"].values[0]
    print(f"  {name}: {cnt} tracks")

print("\nClusters with leakage:")
for cid, names in sorted(affected_clusters.items(), key=lambda x: -len(x[1]))[:15]:
    print(f"  cluster {cid}: {len(names)} distinct leaked artist names - {list(names)[:5]}")
