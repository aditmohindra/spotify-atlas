import json
import urllib.request

BASE = "http://127.0.0.1:8000"


def fetch(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE}{path}", timeout=60) as r:
        return json.load(r)


print("=== /clusters/9/detail?layer=vibe ===")
d = fetch("/clusters/9/detail?layer=vibe")
print("name:", d.get("name"))
print("layer:", d.get("layer"))
print("archetype:", d.get("archetype"))
print("track_count:", d.get("track_count"))

print()
print("=== /clusters/archetypes?layer=vibe ===")
a = fetch("/clusters/archetypes?layer=vibe")
print("layer:", a.get("layer"))
print("archetype groups:", len(a.get("archetypes", [])))
for g in a.get("archetypes", [])[:5]:
    print(f"  {g['name']}: {g['cluster_count']} communities")

print()
print("=== /profile/taste?user_id=1&layer=vibe ===")
p = fetch("/profile/taste?user_id=1&layer=vibe")
print("layer:", p.get("layer"))
print("total_weight:", p.get("total_weight"))
print("communities:", len(p.get("communities", [])))
for c in p.get("communities", [])[:5]:
    print(f"  {c['cluster_id']} {c['name']}: {c['percentage']}%")
