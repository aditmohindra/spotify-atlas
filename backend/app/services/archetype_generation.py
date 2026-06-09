import os
import json
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def discover_archetypes(db: Session) -> dict:
    from sqlalchemy import text

    rows = db.execute(text("""
        SELECT cl.name, cl.canonical_name, cl.description, 
               array_agg(DISTINCT a.name) as artists
        FROM cluster_labels cl
        LEFT JOIN track_clusters tc ON tc.cluster_id = cl.cluster_id
        LEFT JOIN tracks t ON t.id = tc.track_id
        LEFT JOIN artists a ON a.id = t.artist_id
        GROUP BY cl.cluster_id, cl.name, cl.canonical_name, cl.description
        ORDER BY cl.name
    """)).fetchall()

    cluster_list = "\n".join([
        f"- {r[0]} | {r[1] or ''} | {', '.join((r[3] or [])[:5])}"
        for r in rows
    ])

    prompt = f"""You are mapping a person's musical identity.

    These are the music communities discovered in their Spotify library. Each line shows:
    display_name | canonical_name | top artists

    Communities:
    {cluster_list}

    Your task: identify 8-10 IDENTITIES that emerge when these communities are grouped together.

    An identity answers: "What kind of person listens to these communities together?"

    An identity is NOT a genre. An identity is a lifestyle, internet behavior, fandom overlap, cultural affiliation, geographic connection, nostalgia source, or emotional function.

    GOOD identities (describe a person):
    - Internet Kid (turned late-night rabbit holes into a music taste)
    - Festival Citizenship (thinks every weekend should end at sunrise)
    - Anime Passport (emotional development partially outsourced to Japanese media)
    - Toronto Winter Arc (still carrying that OVO heartbreak in their headphones)
    - Desi Household (grew up between two cultures, playlist shows it)
    - Main Character Music (life has a cinematic score whether anyone asked or not)
    - Terminally Online (found music before the algorithm found them)
    - Gym Villain Era (the workout playlist has become a personality)

    BAD identities (describe music, not people):
    - Hip-Hop
    - Electronic Music
    - Anime Music
    - Underground Rap
    - Cinematic Aura
    - Japanese Music

    Test: If someone saw their archetype and said "that's literally me" → correct.
    If it sounds like Spotify Wrapped copy → wrong.

    The name can be funny or internet-native, but it should still feel premium.
    Avoid names that sound like a cheap meme page, insult, or random Gen Z slang dump.
    "Terminally Online" → good (accurate, self-aware)
    "Discord Sewer Kids" → bad (mean, cheap)
    "TikTok Brainrot Goblins" → bad (cringe, unserious)

    Requirements:
    - 8-10 identities
    - 1-5 words
    - describe PEOPLE not music
    - every community maps to exactly one identity
    - use ONLY exact community display names in clusters array

    BANNED WORDS: Groove, Vibes, Soundscape, Dreamscape, Pulse, Fusion, Collective,
    Revival, Echoes, Universe, World, Landscape, Storyteller, Dreamer, Enthusiast,
    Aura, Scene, Culture, Music, Fan, Lover

    Return ONLY valid JSON:
    {{
    "archetypes": [
        {{
        "name": "identity name",
        "description": "One sentence: what kind of person has this identity? Start with 'People who...'",
        "clusters": ["exact display name 1", "exact display name 2", ...]
        }}
    ]
    }}"""

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 4000,
            "temperature": 0.7
        },
        timeout=120.0
    )

    data = response.json()
    text_content = data["choices"][0]["message"]["content"].strip()

    if text_content.startswith("```"):
        lines = text_content.split("\n")
        text_content = "\n".join(lines[1:-1])

    return json.loads(text_content)


def assign_archetypes(db: Session):
    print("Discovering archetypes from your library...")
    result = discover_archetypes(db)

    archetypes = result["archetypes"]
    print(f"\nDiscovered {len(archetypes)} archetypes:")
    for a in archetypes:
        print(f"  {a['name']} — {len(a['clusters'])} clusters")
        print(f"    {a['description']}")

    assigned = 0
    unmatched = []

    for archetype in archetypes:
        for cluster_name in archetype["clusters"]:
            result_sql = db.execute(
                text("UPDATE cluster_labels SET cluster_archetype = :archetype WHERE name = :name"),
                {"archetype": archetype["name"], "name": cluster_name}
            )
            if result_sql.rowcount > 0:
                assigned += 1
            else:
                unmatched.append(cluster_name)

    db.commit()
    print(f"\nAssigned {assigned} clusters to archetypes")

    if unmatched:
        print(f"Unmatched ({len(unmatched)}): {unmatched[:10]}")

    unassigned_rows = db.execute(
        text("SELECT name, canonical_name FROM cluster_labels WHERE cluster_archetype IS NULL")
    ).fetchall()

    if unassigned_rows:
        print(f"\n{len(unassigned_rows)} clusters unassigned — running fallback...")
        fallback_assign(unassigned_rows, archetypes, db)

    total = db.execute(
        text("SELECT COUNT(*) FROM cluster_labels WHERE cluster_archetype IS NOT NULL")
    ).scalar()
    print(f"\nFinal: {total}/204 clusters assigned to archetypes")

    return result


def fallback_assign(unassigned_rows, archetypes, db):
    archetype_names = [a["name"] for a in archetypes]
    labels_text = "\n".join([f"- {r[0]}" for r in unassigned_rows])
    archetype_list = "\n".join([f"- {a}" for a in archetype_names])

    prompt = f"""Assign each community to the most fitting archetype.

Communities to assign:
{labels_text}

Available archetypes:
{archetype_list}

Respond with ONLY valid JSON:
{{
  "assignments": [
    {{"cluster": "exact cluster name", "archetype": "exact archetype name"}}
  ]
}}"""

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 4000,
            "temperature": 0.3
        },
        timeout=60.0
    )

    data = response.json()
    text_content = data["choices"][0]["message"]["content"].strip()
    if text_content.startswith("```"):
        lines = text_content.split("\n")
        text_content = "\n".join(lines[1:-1])

    result = json.loads(text_content)

    for assignment in result["assignments"]:
        db.execute(
            text("UPDATE cluster_labels SET cluster_archetype = :archetype WHERE name = :name"),
            {"archetype": assignment["archetype"], "name": assignment["cluster"]}
        )

    db.commit()
    print("Fallback assignment complete")