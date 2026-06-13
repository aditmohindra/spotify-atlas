import os
import httpx
import asyncio
from dotenv import load_dotenv

load_dotenv()

GETSONGBPM_API_KEY = os.getenv("GETSONGBPM_API_KEY")
GETSONGBPM_API_URL = "https://api.getsong.co"


async def search_song(track_name: str, artist_name: str) -> dict | None:
    params = {
        "api_key": GETSONGBPM_API_KEY,
        "type": "both",
        "lookup": f"song:{track_name} artist:{artist_name}",
    }

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{GETSONGBPM_API_URL}/search/", params=params)

            if response.status_code == 200:
                data = response.json()
                results = data.get("search", [])
                # API returns {"search": {"error": "no result"}} when nothing found
                if isinstance(results, list) and results:
                    return results[0]
                return None
            else:
                await asyncio.sleep(2 ** attempt)

        except Exception as e:
            print(f"GetSongBPM search error for '{track_name}' by '{artist_name}': {e}")
            await asyncio.sleep(2 ** attempt)

    return None


async def get_song_features(song_id: str) -> dict | None:
    params = {
        "api_key": GETSONGBPM_API_KEY,
        "id": song_id,
    }

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{GETSONGBPM_API_URL}/song/", params=params)

            if response.status_code == 200:
                data = response.json()
                song = data.get("song")
                if song:
                    return song
                return None
            else:
                await asyncio.sleep(2 ** attempt)

        except Exception as e:
            print(f"GetSongBPM features error for song_id '{song_id}': {e}")
            await asyncio.sleep(2 ** attempt)

    return None


async def enrich_track(track_name: str, artist_name: str) -> dict | None:
    search_result = await search_song(track_name, artist_name)
    if not search_result:
        return None

    song_id = search_result.get("id")
    if not song_id:
        return None

    features = await get_song_features(str(song_id))
    if not features:
        return None

    def _to_int(val) -> int | None:
        if val is None or val == "":
            return None
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return None

    # API exposes: tempo (str), danceability (int), acousticness (int), key_of (str)
    # energy and liveness are not returned by this API — left as None
    bpm_raw = features.get("tempo") or features.get("bpm")
    return {
        "getsongbpm_id": str(song_id),
        "bpm": _to_int(bpm_raw),
        "audio_energy": _to_int(features.get("energy")),
        "audio_danceability": _to_int(features.get("danceability")),
        "audio_acousticness": _to_int(features.get("acousticness")),
        "audio_liveness": _to_int(features.get("liveness")),
        "audio_key": features.get("key_of") or None,
    }
