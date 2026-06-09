from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from app.database.connection import get_db
from collections import defaultdict
from datetime import datetime, timedelta

router = APIRouter()


def compute_taste_profile(user_id: int, db: Session, since: str = None):
    from app.models.models import ListeningEvent, Track, TrackCluster, ClusterLabel, Artist

    source_filter = None
    if since == "30days":
        source_filter = ["top_short_term", "recently_played"]
    elif since == "6months":
        source_filter = ["top_short_term", "top_medium_term", "recently_played", "saved_tracks"]

    query = db.query(
        ListeningEvent.track_id,
        ListeningEvent.source
    ).filter(ListeningEvent.user_id == user_id)

    if source_filter:
        query = query.filter(ListeningEvent.source.in_(source_filter))

    events = query.all()

    track_weights = defaultdict(float)
    for track_id, source in events:
        weight = 1.0
        if source == "saved_tracks":
            weight = 2.0
        elif source and source.startswith("top_short"):
            weight = 3.0
        elif source and source.startswith("top_medium"):
            weight = 2.5
        elif source and source.startswith("top_long"):
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

    labels = {l.cluster_id: l for l in db.query(ClusterLabel).all()}

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

        communities.append({
            "cluster_id": cluster_id,
            "name": label.name if label else f"Cluster {cluster_id}",
            "canonical_name": label.canonical_name if label else "",
            "description": label.description if label else "",
            "keywords": label.keywords if label else [],
            "percentage": percentage,
            "weight": round(weight, 1),
            "top_artists": top_artists
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

    top5_text = "\n".join([
        f"- {c['name']} ({c['canonical_name']}): {c['percentage']}%, top artists: {', '.join(c['top_artists'])}"
        for c in top5
    ])

    prompt = f"""You are writing a one-paragraph musical identity summary for someone's Spotify Atlas profile.

    Their top 5 music communities are:
    {top5_text}

    Write exactly one paragraph (3-4 sentences) that:
    - Feels personal and insightful, not generic
    - Names specific communities and artists
    - Reveals something the person might not have realized about themselves
    - Has personality — like a music journalist wrote it, not an algorithm

    Do not start with "You" or "Your". Do not use the word "diverse"."""

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}", "Content-Type": "application/json"},
        json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 200,
            "temperature": 0.85
        },
        timeout=30.0
    )

    text = response.json()["choices"][0]["message"]["content"].strip()
    return {"summary": text}