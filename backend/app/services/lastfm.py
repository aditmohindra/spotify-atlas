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