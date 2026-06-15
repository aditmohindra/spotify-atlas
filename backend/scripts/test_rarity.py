import json
import urllib.request
from collections import Counter

d = json.load(urllib.request.urlopen("http://127.0.0.1:8000/profile/taste?user_id=1&layer=vibe"))
communities = d["communities"]
print("Total communities:", len(communities))
print()
print("Rarity distribution:")
for rarity, count in Counter(c.get("rarity") for c in communities).most_common():
    print(f"  {rarity}: {count}")
print()
print("Small communities (track_count < 100):")
for c in [c for c in communities if c.get("track_count", 0) < 100][:10]:
    print(f"  [{c['cluster_id']}] {c['name']} — {c['track_count']} tracks — rarity: {c.get('rarity')}")
