from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database.connection import get_db
from collections import defaultdict
from datetime import datetime, timedelta

router = APIRouter()


def compute_taste_profile(user_id: int, db: Session, since: str = None):
    from app.models.models import ListeningEvent, Track, TrackCluster, Artist

    query = db.query(
        ListeningEvent.track_id,
        ListeningEvent.source
    ).filter(ListeningEvent.user_id == user_id)

    source_filter = None
    if since == "30days":
        source_filter = ["top_short_term", "recently_played"]
    elif since == "6months":
        source_filter = ["top_short_term", "top_medium_term", "recently_played", "saved_tracks"]

    if source_filter:
        query = query.filter(ListeningEvent.source.in_(source_filter))

    events = query.all()

    track_weights = defaultdict(float)
    for track_id, source in events:
        weight = 1.0
        if source == "saved_tracks":
            weight = 2.0
        elif source and "top_short" in source:
            weight = 3.0
        elif source and "top_medium" in source:
            weight = 2.5
        elif source and "top_long" in source:
            weight = 2.0
        elif source and source.startswith("playlist_"):
            weight = 1.5
        elif source == "recently_played":
            weight = 1.0
        track_weights[track_id] += weight

    track_ids = list(track_weights.keys())

    clusters = db.query(
        TrackCluster.track_id,
        TrackCluster.cluster_id
    ).filter(TrackCluster.track_id.in_(track_ids)).all()

    track_to_cluster = {tc.track_id: tc.cluster_id for tc in clusters}

    cluster_weights = defaultdict(float)
    cluster_track_ids = defaultdict(list)
    for track_id, weight in track_weights.items():
        cluster_id = track_to_cluster.get(track_id)
        if cluster_id is not None:
            cluster_weights[cluster_id] += weight
            cluster_track_ids[cluster_id].append(track_id)

    cluster_weights.pop(-1, None)
    total_weight = sum(cluster_weights.values())
    if total_weight == 0:
        return {"user_id": user_id, "total_weight": 0, "communities": []}

    label_rows = db.execute(text(
        "SELECT cluster_id, name, canonical_name, description, keywords, cluster_archetype FROM cluster_labels"
    )).fetchall()
    labels = {
        r[0]: {
            "name": r[1],
            "canonical_name": r[2],
            "description": r[3],
            "keywords": r[4] or [],
            "cluster_archetype": r[5]
        }
        for r in label_rows
    }

    tracks_info = db.query(
        Track.id,
        Track.artist_id
    ).filter(Track.id.in_(track_ids)).all()
    track_to_artist = {t.id: t.artist_id for t in tracks_info}

    artist_ids = list(set(aid for aid in track_to_artist.values() if aid))
    artists_info = db.query(Artist.id, Artist.name).filter(Artist.id.in_(artist_ids)).all()
    artist_names = {a.id: a.name for a in artists_info}

    communities = []
    for cluster_id, weight in sorted(cluster_weights.items(), key=lambda x: x[1], reverse=True):
        label = labels.get(cluster_id)
        percentage = round((weight / total_weight) * 100, 1)

        tids = cluster_track_ids[cluster_id]
        artist_weights = defaultdict(float)
        for tid in tids:
            aid = track_to_artist.get(tid)
            if aid:
                name = artist_names.get(aid)
                if name:
                    artist_weights[name] += track_weights[tid]

        top_artists = [a for a, _ in sorted(artist_weights.items(), key=lambda x: x[1], reverse=True)[:3]]

        total_tracks_in_cluster = len(tids)
        if total_tracks_in_cluster <= 20:
            rarity = "Extremely Rare"
        elif total_tracks_in_cluster <= 50:
            rarity = "Rare"
        elif total_tracks_in_cluster <= 100:
            rarity = "Niche"
        elif total_tracks_in_cluster <= 200:
            rarity = "Underground"
        else:
            rarity = "Core"

        communities.append({
            "cluster_id": cluster_id,
            "name": label["name"] if label else f"Cluster {cluster_id}",
            "canonical_name": label["canonical_name"] if label else "",
            "description": label["description"] if label else "",
            "keywords": label["keywords"] if label else [],
            "percentage": percentage,
            "weight": round(weight, 1),
            "top_artists": top_artists,
            "rarity": rarity,
            "track_count": total_tracks_in_cluster,
            "archetype": label["cluster_archetype"] if label else None
        })

    return {
        "user_id": user_id,
        "total_weight": round(total_weight, 1),
        "communities": communities[:50]
    }


@router.get("/profile/taste")
async def get_taste_profile(
    user_id: int = 1,
    time_range: str = "all",
    db: Session = Depends(get_db)
):
    return compute_taste_profile(user_id, db, time_range if time_range != "all" else None)

@router.get("/profile/summary")
async def get_taste_summary(user_id: int = 1, db: Session = Depends(get_db)):
    import httpx
    import os

    profile = compute_taste_profile(user_id, db)
    top5 = profile["communities"][:5]

    archetype_weights: dict = {}
    for c in profile["communities"]:
        if c["archetype"]:
            archetype_weights[c["archetype"]] = archetype_weights.get(c["archetype"], 0) + c["percentage"]
    top_archetype = max(archetype_weights, key=archetype_weights.get) if archetype_weights else "Explorer"

    top5_text = "\n".join([
        f"- {c['name']} ({c['canonical_name']}): {c['percentage']}%, top artists: {', '.join(c['top_artists'])}"
        for c in top5
    ])

    prompt = f"""You are the narrator of Spotify Atlas, a premium musical identity product.
    You are not a music critic. You are not summarizing genres. You are not writing Spotify Wrapped copy.
    You are writing a personality result based on someone's listening history.

    Tone:
    - mythic
    - intimate
    - slightly melancholic
    - self-aware
    - emotionally precise
    - premium, not cheesy

    Inspirations:
    - Pokemon Mystery Dungeon personality intro
    - Kingdom Hearts opening monologue
    - a Hogwarts house result that actually hurts a little
    - a friend who knows your taste too well

    Their top 5 music communities are:
    {top5_text}

    Their dominant identity: {top_archetype}

    Your task:
    Find the hidden pattern between these communities.
    Do not explain each community one by one.
    Instead, answer: "What kind of person keeps returning to this exact combination of worlds?"

    Look for: contradiction, longing, escapism, ambition, nostalgia, internet identity, emotional self-protection, obsession with complete worlds.

    Rules:
    - Write in second person. Use "you" naturally.
    - Reference 1-3 specific communities or artists only when they support the insight.
    - Do NOT list genres.
    - Do NOT use vague praise.
    - The profile should feel earned from years of listening.
    - The final sentence should be the sharpest and most uncanny line.
    - Plain text only. No markdown.
    - Maximum 4 sentences. Every sentence must reveal something about the listener.

    Banned words: diverse, eclectic, unique, journey, tapestry, blend, fusion, genre, playlist, sonic, soundscape, vibe, vibes, explores, celebrates, realm, realms, echo, echoes, weave, weaver, whisper, cosmos, astral, infinite, dawn

    Also write a TITLE on the first line:
    - 2-4 words
    - Feels like a personality test result or character class
    - NOT fantasy novel language
    - Good: "The Completionist", "Midnight Cartographer", "Terminally Online", "The World Builder"
    - Bad: "Alchemist of Realms", "Keeper of Worlds", "Weaver of Tales"

    Return ONLY this exact format — nothing else:
    TITLE: [title here]
    SUMMARY: [4 sentences here]"""

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}", "Content-Type": "application/json"},
        json={
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 300,
            "temperature": 0.9
        },
        timeout=30.0
    )

    text_content = response.json()["choices"][0]["message"]["content"].strip()

    title = top_archetype
    summary = text_content

    for line in text_content.split("\n"):
        if line.startswith("TITLE:"):
            title = line.replace("TITLE:", "").strip()
        elif line.startswith("SUMMARY:"):
            summary = line.replace("SUMMARY:", "").strip()

    return {"title": title, "summary": summary}