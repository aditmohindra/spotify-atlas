import os
import json
import httpx
from sqlalchemy.orm import Session
from collections import defaultdict
from dotenv import load_dotenv
import time

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

BANNED_WORDS_ANYWHERE = [
    "collective", "revival", "circuit", "network", "sessions", "grooves",
    "vibes", "beats", "anthems", "escape", "retreat", "lounge", "journey",
    "fusion", "chronicles", "dreamscape", "soundscape", "echoes", "pulse",
    "rhythms", "paradise", "oasis", "universe", "realm", "hangout", "vortex",
    "dreamers", "sanctuary", "neon", "nights", "nostalgia", "guild",
    "society", "club", "party", "underground", "aesthetic", "after dark",
    "brigade", "crew", "squad", "nation", "culture", "world", "night" "dream",
    "dreamscape", "anime", "otaku", "k-pop", "asian", "late night", "pixelated", 
    "trap house"
]

FILLER_SUFFIXES = [
    "Jams", "Anthems", "Vibes", "Party", "Parties", "Raves", "Circle",
    "Club", "Hour", "Mix", "Energy", "Sessions", "Lounge", "Nights",
    "Night", "Drive", "Cypher", "Set", "Fest", "Event", "Hangout",
    "Culture", "Rhythm", "Rhythms", "Diaries", "Echoes", "Revival",
    "Narratives", "Scene", "World", "Era", "Movement", "Experience"
]

def clean_display_name(name: str) -> str:
    for suffix in FILLER_SUFFIXES:
        name = name.replace(f" & {suffix}", "")
        if name.endswith(f" {suffix}"):
            name = name[:-len(f" {suffix}")]
    return name.strip()


def is_name_acceptable(name: str) -> bool:
    name_lower = name.lower()
    for banned in BANNED_WORDS_ANYWHERE:
        if banned in name_lower:
            return False
    return True


def get_cluster_data(cluster_id: int, db: Session) -> dict:
    from app.models.models import Track, Artist, TrackCluster

    track_ids = [
        c.track_id for c in db.query(TrackCluster).filter(
            TrackCluster.cluster_id == cluster_id
        ).all()
    ]

    tracks_with_artists = db.query(Track, Artist).join(
        Artist, Track.artist_id == Artist.id
    ).filter(Track.id.in_(track_ids)).all()

    artist_counts = defaultdict(int)
    genres = set()
    moods = set()
    track_names = []

    for track, artist in tracks_with_artists:
        artist_counts[artist.name] += 1
        track_names.append(track.name)

        if artist.genres:
            for g in artist.genres:
                genres.add(g)

        if track.feature_document:
            lines = track.feature_document.split("\n")
            for line in lines:
                if line.startswith("Moods:"):
                    tags = [t.strip() for t in line[7:].split(",")]
                    for tag in tags[:4]:
                        moods.add(tag)

    top_artists = sorted(artist_counts.items(), key=lambda x: x[1], reverse=True)[:8]

    return {
        "cluster_id": cluster_id,
        "track_count": len(track_ids),
        "top_artists": [a for a, _ in top_artists],
        "top_tracks": track_names[:10],
        "genres": list(genres)[:15],
        "moods": list(moods)[:15]
    }

def name_cluster_sync(cluster_data: dict) -> dict:
    prompt = f"""You are a cultural anthropologist, not a music journalist.

    Your task is NOT to name music. Your task is to identify the specific human community hiding inside this Spotify cluster.

    Cluster data:
    Tracks: {cluster_data['track_count']}
    Top artists: {', '.join(cluster_data['top_artists'][:10])}
    Sample tracks: {', '.join(cluster_data['top_tracks'][:12])}
    Genres: {', '.join(cluster_data['genres'][:15])}
    Mood tags: {', '.join(cluster_data['moods'][:10])}

    STEP 0 — Think like an anthropologist. Do NOT name the music yet.
    Answer internally:
    - Who are these people? (age, identity, lifestyle)
    - Where do they spend time online? (subreddits, Discord servers, TikTok niches)
    - What do they wear? What memes do they know?
    - What fandoms overlap with this music?
    - What would instantly signal membership in this group to an outsider?

    STEP 1 — Find the password.
    Every real music scene has a password. A password is a word, phrase, place, object, meme, website, fandom reference, inside joke, or cultural artifact that instantly signals membership.

    Examples of finding the password:
    - Persona OSTs → password = "Velvet Room" → "Velvet Room Visitor"
    - One Piece covers → password = "Thousand Sunny" → "Thousand Sunny Study Hall"
    - Playboi Carti leaks → password = "Google Drive" → "Carti Leaks Folder"
    - Fred again.. fans → password = "Boiler Room" → "Boiler Room Regular"
    - Hardstyle gym culture → password = "Villain Arc" → "Gym Villain Arc"
    - Michigan scam rap → password = "BabyTron" → "Michigan Scammer's Club"
    - Drake / OVO → password = "October's Very Own" → "OVO Sweatpants Season"
    - Pokemon OSTs → password = "Professor Oak" → "Professor Oak's MP3 Player"

    DO NOT reuse example words unless the cluster GENUINELY contains that scene.
    Examples show specificity — they are not templates.

    STEP 2 — Name source priority:
    1. Specific fandom password (game title, anime, artist label, specific album)
    2. Internet culture artifact (subreddit, meme, platform moment)
    3. Physical place or event that defines the scene
    4. Activity or lifestyle behavior
    5. Geographic scene
    6. Genre — LAST RESORT ONLY

    STEP 3 — Genericity test.
    "Could this name appear as a Spotify editorial playlist?"
    If YES → reject and try again.

    STEP 4 — Specificity test.
    "If I swapped this name onto a different cluster, would it still fit?"
    If YES → too generic → try again.

    TONE: The name can be funny or internet-native, but must still feel premium.
    Good: "Terminally Online", "Magic City Parking Lot", "Missed My Flight Home"
    Bad: "Discord Sewer Kids", "TikTok Brainrot Goblins" (cheap, cringe, unserious)

    LENGTH: Prefer 2-4 words. Specificity beats brevity.
    "Professor Oak's MP3 Player" → keep
    "r/hiphopheads at 2AM" → keep
    Never shorten if shortening removes the reference.

    ABSOLUTELY FORBIDDEN WORDS:
    Sessions, Grooves, Vibes, Beats, Anthems, Escape, Retreat, Lounge, Journey,
    Revival, Fusion, Collective, Chronicles, Dream, Dreamscape, Soundscape, Echoes,
    Pulse, Rhythms, Paradise, Oasis, Universe, Realm, Hangout, Vortex, Dreamers,
    Sanctuary, Neon, Nostalgia, Guild, Society, Underground, Aesthetic,
    Brigade, Crew, Squad, Nation, Culture, World, Circuit, Network,
    Takeover, Renaissance, Diaries, Archives, Corner, Hub, Zone,
    Night, Drive, Cypher, Energy, Mix, Essential, Playlist, Files

    canonical_name: Explain the music to someone who has never heard the display_name.
    Format: [Geography / Platform / Fandom] + [Primary Sound]
    canonical_name must be boring, clean, and factual. No slang, no vibe words, no "online/digital/internet" unless the platform is genuinely the defining feature.

    Good: K-Pop & Hyperpop, SoundCloud Cloud Rap, European Hard Dance, Anime OST & J-Pop, UK Garage & House, Toronto R&B & Hip-Hop
    Bad: K-Pop FANdom, Internet Rap & Cloud Vibes, Online Neo-Psychedelic Chill, Digital Bassline & Garage, European Dance & Electronica

    description: One sentence. Mention specific artists. What makes this cluster distinct?

    keywords: Exactly 3 words.

    password: The single cultural artifact or reference the name is built around.

    why_this_name: One sentence explaining why this name fits better than a generic one.

    DISPLAY NAME RULE:
    The display_name should be the password itself, or the password plus ONE meaningful modifier.
    Do NOT add generic music/event words after the password.

    Bad: "Konoha Jams & Anthems" → Good: "Konoha Training Arc"
    Bad: "Coachella Sunset Vibes" → Good: "Coachella Wristband"  
    Bad: "Compton Storytellers Circle" → Good: "Compton Narratives"
    Bad: "ISOxo Discord Raves" → Good: "ISOxo Mosh Pit"
    Bad: "2-Step Telegram Party" → Good: "2-Step Telegram"

    Before finalizing, remove any trailing generic word.
    If the name ends with Jams, Anthems, Vibes, Party, Raves, Circle, Club, Mix, Energy, Sessions, Lounge — delete it.
    Most of the time the shorter name is stronger.

    TRUST THE PASSWORD:
    If the password is already specific and recognizable, use it as the display_name with no additions.

    Bad: "Warped Tour Revival" → Good: "Warped Tour"
    Bad: "Blood Gulch Echoes" → Good: "Blood Gulch"
    Bad: "Shibuya Crossing Rhythm" → Good: "Shibuya Crossing"
    Bad: "A-Trak Remix Culture" → Good: "A-Trak Remix"
    Bad: "Freetekno Rave" → Good: "Freetekno"

    Ask: "Is the password alone enough for an insider to recognize this community?"
    If YES → use the password alone.
    If NO → add ONE meaningful modifier.

    Return ONLY valid JSON:
    {{
        "display_name": "",
        "canonical_name": "",
        "password": "",
        "why_this_name": "",
        "description": "",
        "keywords": ["", "", ""]
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
            "max_tokens": 400,
            "temperature": 0.9
        },
        timeout=30.0
    )

    data = response.json()
    text = data["choices"][0]["message"]["content"].strip()

    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])

    result = json.loads(text)
    result["display_name"] = clean_display_name(result["display_name"])
    assert "display_name" in result
    assert "canonical_name" in result

    # Log password and reasoning for debugging
    if "password" in result:
        print(f"    password: {result['password']} — {result.get('why_this_name', '')}")

    return result


async def run_cluster_naming(db: Session):
    from app.models.models import TrackCluster, ClusterLabel

    cluster_ids = [
        row[0] for row in db.query(TrackCluster.cluster_id).distinct().all()
        if row[0] != -1
    ]

    print(f"Naming {len(cluster_ids)} clusters...")

    existing = {l.cluster_id for l in db.query(ClusterLabel).all()}
    to_name = [c for c in cluster_ids if c not in existing]
    print(f"{len(existing)} already named, {len(to_name)} remaining")

    named = 0
    failed = 0

    for cluster_id in to_name:
        try:
            cluster_data = get_cluster_data(cluster_id, db)
            result = name_cluster_sync(cluster_data)

            label = ClusterLabel(
                cluster_id=cluster_id,
                name=result["display_name"],
                canonical_name=result.get("canonical_name", ""),
                description=result.get("description", ""),
                keywords=result.get("keywords", [])
            )
            db.add(label)
            db.commit()

            named += 1
            print(f"  [{named}/{len(to_name)}] Cluster {cluster_id}: {result['display_name']} / {result['canonical_name']}")
            time.sleep(0.5)

        except Exception as e:
            failed += 1
            print(f"  Failed cluster {cluster_id}: {e}")
            db.rollback()

    print(f"\nNaming complete: {named} named, {failed} failed")
    return {"named": named, "failed": failed}