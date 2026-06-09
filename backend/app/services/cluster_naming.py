import os
import json
import httpx
from sqlalchemy.orm import Session
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


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
    prompt = f"""You are a music scene journalist writing for Pitchfork, NTS Radio, and Resident Advisor. You name music communities the way a human would — with cultural specificity, not poetic filler.

    Given data about a cluster of {cluster_data['track_count']} tracks from someone's Spotify library:

    Top artists: {', '.join(cluster_data['top_artists'][:6])}
    Sample tracks: {', '.join(cluster_data['top_tracks'][:8])}
    Genres: {', '.join(cluster_data['genres'][:10])}
    Mood tags: {', '.join(cluster_data['moods'][:10])}

    Generate TWO names:

    1. display_name: A fun, evocative 2-4 word name. Culturally specific. Think Boiler Room set titles, NTS show names, music blog categories. Should make someone immediately want to click it.

    2. canonical_name: A descriptive 2-5 word name that explains what music is actually in here. Genre + scene + geography or era when relevant. This is the explainer underneath the fun name.

    BANNED WORDS — never use these:
    Neon, Dream, Dreamscape, Dreamwave, Dreams, Odyssey, Reverie, Collective, Sanctuary, Society, Vibes, Chronicles, Echoes, Celestial, Ethereal, Cosmic, Phantom, Elysian, Whispers, Luminous, Galactic

    GOOD display_name examples:
    - "Gym Villain Arc" (for aggressive trap/rap)
    - "3AM SoundCloud Scroll" (for bedroom rap/emo rap)
    - "Punjabi Party Pulse" (for bhangra/desi pop)
    - "Memphis Nightmare Society" (for Memphis rap/horrorcore)
    - "Berlin Warehouse Sunday" (for techno/acid house)
    - "Anime Soul Kitchen" (for Japanese OST/city pop)
    - "YSL Parking Lot" (for Atlanta trap)
    - "Post-Breakup Playlist" (for sad R&B/emo)

    GOOD canonical_name examples:
    - "Atlanta Melodic Trap"
    - "UK Drill & Grime"
    - "Japanese City Pop & Anime OST"
    - "Acid House & Warehouse Techno"
    - "Bedroom Emo Rap"
    - "Bhangra & Desi Pop"

    Also generate:
    - description: exactly one sentence, references specific artists, explains the sound
    - keywords: exactly 3 words that capture the essence

    Respond with ONLY valid JSON:
    {{
    "display_name": "fun evocative name",
    "canonical_name": "descriptive genre name",
    "description": "one sentence about the sound and artists",
    "keywords": ["word1", "word2", "word3"]
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
            "max_tokens": 256,
            "temperature": 0.8
        },
        timeout=30.0
    )

    data = response.json()
    text = data["choices"][0]["message"]["content"].strip()

    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])

    result = json.loads(text)
    assert "display_name" in result
    assert "canonical_name" in result
    assert "description" in result
    assert "keywords" in result

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

        except Exception as e:
            failed += 1
            print(f"  Failed cluster {cluster_id}: {e}")
            db.rollback()

    print(f"\nNaming complete: {named} named, {failed} failed")
    return {"named": named, "failed": failed}