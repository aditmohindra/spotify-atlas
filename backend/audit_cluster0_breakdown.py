import re
import psycopg2
import pandas as pd

conn = psycopg2.connect(
    host="127.0.0.1", port=5433,
    dbname="spotify_atlas", user="spotify_atlas", password="spotify_atlas_password"
)

tracks = pd.read_sql("""
    SELECT t.id, t.artist_id, ar.name AS artist_name, t.vibe_combined_document
    FROM tracks t
    JOIN clustering_assignments ca ON ca.track_id = t.id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE ca.run_id = 29 AND ca.cluster_id = 0
      AND t.vibe_combined_document IS NOT NULL
""", conn)

def has(doc, term):
    return re.search(r'\b' + re.escape(term) + r'\b', doc.lower()) is not None

results = []
for _, row in tracks.iterrows():
    doc = row["vibe_combined_document"]
    results.append({
        "id": row["id"],
        "own_artist": row["artist_name"],
        "has_travis_scott_phrase": has(doc, "travis scott"),
        "has_travis_alone": has(doc, "travis"),
        "has_scott_alone": has(doc, "scott"),
        "has_drake_alone": has(doc, "drake"),
    })

df = pd.DataFrame(results)
print("Total cluster 0 tracks checked:", len(df))
print("Contains exact phrase 'travis scott':", df["has_travis_scott_phrase"].sum())
print("Contains 'travis' (any context):", df["has_travis_alone"].sum())
print("Contains 'scott' (any context):", df["has_scott_alone"].sum())
print("Contains 'drake' (any context):", df["has_drake_alone"].sum())

print("\n--- Sample tracks with 'scott' but NOT the full phrase 'travis scott' ---")
subset = df[(df["has_scott_alone"]) & (~df["has_travis_scott_phrase"])]
print(f"Count: {len(subset)}")
for tid in subset["id"].head(10):
    doc = tracks.loc[tracks.id == tid, "vibe_combined_document"].values[0]
    artist = tracks.loc[tracks.id == tid, "artist_name"].values[0]
    print(f"\n[track {tid}, artist: {artist}]\n{doc}")

print("\n--- Sample tracks with 'drake' ---")
subset2 = df[df["has_drake_alone"]]
print(f"Count: {len(subset2)}")
for tid in subset2["id"].head(10):
    doc = tracks.loc[tracks.id == tid, "vibe_combined_document"].values[0]
    artist = tracks.loc[tracks.id == tid, "artist_name"].values[0]
    print(f"\n[track {tid}, artist: {artist}]\n{doc}")
