import os
import httpx
import asyncio
from dotenv import load_dotenv

load_dotenv()

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/"


async def get_artist_tags(artist_name: str) -> list:
    params = {
        "method": "artist.getTopTags",
        "artist": artist_name,
        "api_key": LASTFM_API_KEY,
        "format": "json",
        "limit": 5
    }

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(LASTFM_API_URL, params=params)

            if response.status_code == 200:
                data = response.json()
                if "error" in data:
                    return []
                tags = data.get("toptags", {}).get("tag", [])
                genre_tags = []
                for tag in tags:
                    name = tag.get("name", "").lower()
                    count = tag.get("count", 0)
                    if count > 10:
                        genre_tags.append(name)
                return genre_tags[:5]
            else:
                await asyncio.sleep(2 ** attempt)

        except Exception as e:
            print(f"Last.fm error for {artist_name}: {e}")
            await asyncio.sleep(2 ** attempt)

    return []


async def enrich_artists_with_lastfm(artists: list) -> dict:
    results = {}
    for i, artist in enumerate(artists):
        tags = await get_artist_tags(artist.name)
        results[artist.spotify_artist_id] = tags
        if (i + 1) % 50 == 0:
            print(f"  Fetched Last.fm tags for {i+1}/{len(artists)} artists")
        await asyncio.sleep(0.25)
    return results

async def get_track_tags(artist_name: str, track_name: str) -> list:
    params = {
        "method": "track.getTopTags",
        "artist": artist_name,
        "track": track_name,
        "api_key": LASTFM_API_KEY,
        "format": "json",
        "limit": 10
    }

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(LASTFM_API_URL, params=params)

            if response.status_code == 200:
                data = response.json()
                if "error" in data:
                    return []
                tags = data.get("toptags", {}).get("tag", [])
                mood_tags = []
                for tag in tags:
                    name = tag.get("name", "").lower().strip()
                    count = tag.get("count", 0)
                    if count > 5 and len(name) > 1 and len(name) < 30:
                        mood_tags.append(name)
                return mood_tags[:8]
            else:
                await asyncio.sleep(2 ** attempt)

        except Exception as e:
            print(f"Last.fm track tag error for {track_name}: {e}")
            await asyncio.sleep(2 ** attempt)

    return []


async def enrich_tracks_with_lastfm(tracks: list) -> dict:
    results = {}
    for i, track in enumerate(tracks):
        artist_name = track.artist.name if track.artist else ""
        if not artist_name:
            results[track.id] = []
            continue

        tags = await get_track_tags(artist_name, track.name)
        results[track.id] = tags

        if (i + 1) % 100 == 0:
            print(f"  Fetched Last.fm track tags {i+1}/{len(tracks)}")
        await asyncio.sleep(0.25)

    return results