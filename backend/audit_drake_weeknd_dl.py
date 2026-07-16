
import re

import psycopg2

import pandas as pd

conn = psycopg2.connect(

    host="127.0.0.1", port=5433,

    dbname="spotify_atlas", user="spotify_atlas", password="spotify_atlas_password"

)

tracks = pd.read_sql("""

    SELECT t.id, t.artist_id, ar.name AS artist_name, t.vibe_combined_document,

           ca.cluster_id, cl.name AS cluster_name

    FROM tracks t

    JOIN clustering_assignments ca ON ca.track_id = t.id

    JOIN artists ar ON ar.id = t.artist_id

    LEFT JOIN cluster_labels cl ON cl.cluster_id = ca.cluster_id AND cl.cluster_layer = 'vibe'

    WHERE ca.run_id = 29 AND t.vibe_combined_document IS NOT NULL

""", conn)

def has(doc, term):

    return re.search(r'\b' + re.escape(term.lower()) + r'\b', doc.lower()) is not None

terms = ["drake", "destroy lonely",  "opium", "weeknd", "the weeknd"]

for term in terms:

    matches = tracks[tracks["vibe_combined_document"].apply(lambda d: has(d, term))]

    print(f"\n=== '{term}': {len(matches)} tracks ===")

    if len(matches) == 0:

        continue

    by_cluster = matches.groupby(["cluster_id", "cluster_name"]).size().sort_values(ascending=False)

    print(by_cluster.head(10))

    # show a couple of the actual artists these leaked tracks belong to, to spot-check false positives

    print("Sample owning artists:", matches["artist_name"].drop_duplicates().head(5).tolist())

