import os
import httpx
import asyncio
from sqlalchemy.orm import Session
from app.models.models import Track, Artist
from app.services.spotify import get_valid_token
from dotenv import load_dotenv

load_dotenv()

SPOTIFY_API_URL = "https://api.spotify.com/v1"


def bucket_energy(value: float) -> str:
    if value is None: return "Unknown"
    if value >= 0.8: return "Very High"
    if value >= 0.6: return "High"
    if value >= 0.4: return "Medium"
    if value >= 0.2: return "Low"
    return "Very Low"


def bucket_valence(value: float) -> str:
    if value is None: return "Unknown"
    if value >= 0.8: return "Very Positive"
    if value >= 0.6: return "Positive"
    if value >= 0.4: return "Neutral"
    if value >= 0.2: return "Melancholic"
    return "Very Melancholic"


def bucket_tempo(value: float) -> str:
    if value is None: return "Unknown"
    if value >= 160: return "Very Fast"
    if value >= 120: return "Fast"
    if value >= 90: return "Medium"
    if value >= 60: return "Slow"
    return "Very Slow"


def bucket_danceability(value: float) -> str:
    if value is None: return "Unknown"
    if value >= 0.8: return "Very High"
    if value >= 0.6: return "High"
    if value >= 0.4: return "Medium"
    if value >= 0.2: return "Low"
    return "Very Low"


def bucket_acousticness(value: float) -> str:
    if value is None: return "Unknown"
    if value >= 0.8: return "Very Acoustic"
    if value >= 0.6: return "Acoustic"
    if value >= 0.4: return "Balanced"
    if value >= 0.2: return "Electronic"
    return "Very Electronic"


def bucket_instrumentalness(value: float) -> str:
    if value is None: return "Unknown"
    if value >= 0.8: return "Instrumental"
    if value >= 0.5: return "Mostly Instrumental"
    if value >= 0.1: return "Mixed"
    return "Vocal"


def build_feature_document(track: Track, artist: Artist) -> str:
    lines = []
    lines.append(f"Track: {track.name}")

    if artist:
        lines.append(f"Artist: {artist.name}")
        if artist.genres and len(artist.genres) > 0:
            genres_str = ", ".join(artist.genres[:5])
            lines.append(f"Genres: {genres_str}")

    if track.energy is not None:
        lines.append(f"Energy: {bucket_energy(track.energy)}")
    if track.valence is not None:
        lines.append(f"Valence: {bucket_valence(track.valence)}")
    if track.tempo is not None:
        lines.append(f"Tempo: {bucket_tempo(track.tempo)}")
    if track.danceability is not None:
        lines.append(f"Danceability: {bucket_danceability(track.danceability)}")
    if track.acousticness is not None:
        lines.append(f"Acousticness: {bucket_acousticness(track.acousticness)}")
    if track.instrumentalness is not None:
        lines.append(f"Instrumentalness: {bucket_instrumentalness(track.instrumentalness)}")

    return "\n".join(lines)

def build_feature_document_with_tags(track: Track, artist: Artist, tags: list) -> str:
    lines = []
    lines.append(f"Track: {track.name}")

    if artist:
        lines.append(f"Artist: {artist.name}")
        if artist.genres and len(artist.genres) > 0:
            genres_str = ", ".join(artist.genres[:5])
            lines.append(f"Genres: {genres_str}")

    if tags:
        mood_str = ", ".join(tags[:8])
        lines.append(f"Moods: {mood_str}")

    return "\n".join(lines)


async def fetch_audio_features_batch(token: str, track_ids: list) -> dict:
    features_map = {}

    for i in range(0, len(track_ids), 100):
        batch = track_ids[i:i+100]
        ids_str = ",".join(batch)

        for attempt in range(5):
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{SPOTIFY_API_URL}/audio-features",
                    headers={"Authorization": f"Bearer {token}"},
                    params={"ids": ids_str}
                )

            if response.status_code == 200:
                data = response.json()
                for feature in data.get("audio_features", []):
                    if feature and feature.get("id"):
                        features_map[feature["id"]] = feature
                break
            elif response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 2 ** attempt))
                print(f"Rate limited. Waiting {retry_after}s...")
                await asyncio.sleep(retry_after)
            else:
                print(f"Audio features error {response.status_code}: {response.text}")
                await asyncio.sleep(2 ** attempt)

        print(f"  Fetched audio features {min(i+100, len(track_ids))}/{len(track_ids)}")
        await asyncio.sleep(0.1)

    return features_map

async def run_feature_engineering(user_id: int, db: Session):
    from app.models.models import User
    from app.services.lastfm import enrich_tracks_with_lastfm
    from sqlalchemy.orm import joinedload

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise Exception(f"User {user_id} not found")

    tracks = db.query(Track).options(joinedload(Track.artist)).all()
    print(f"Fetching Last.fm tags for {len(tracks)} tracks...")

    track_tags = await enrich_tracks_with_lastfm(tracks)

    print(f"Building feature documents for {len(tracks)} tracks...")
    documented = 0
    for track in tracks:
        artist = track.artist
        tags = track_tags.get(track.id, [])
        doc = build_feature_document_with_tags(track, artist, tags)
        track.feature_document = doc
        documented += 1

    db.commit()
    print(f"Built feature documents for {documented} tracks")

    return {"tracks_with_documents": documented}