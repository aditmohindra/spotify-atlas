import os
import httpx
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.models import User
from dotenv import load_dotenv

load_dotenv()

SPOTIFY_API_URL = "https://api.spotify.com/v1"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")


async def get_valid_token(user: User, db: Session) -> str:
    if user.token_expires_at and datetime.utcnow() >= user.token_expires_at - timedelta(minutes=5):
        async with httpx.AsyncClient() as client:
            response = await client.post(
                SPOTIFY_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": user.refresh_token,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)
            )
        if response.status_code == 200:
            tokens = response.json()
            user.access_token = tokens["access_token"]
            user.token_expires_at = datetime.utcnow() + timedelta(seconds=tokens.get("expires_in", 3600))
            db.commit()

    return user.access_token


async def spotify_get(endpoint: str, token: str, params: dict = None) -> dict:
    url = f"{SPOTIFY_API_URL}{endpoint}"
    headers = {"Authorization": f"Bearer {token}"}

    for attempt in range(5):
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params=params)

        if response.status_code == 200:
            return response.json()
        elif response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 2 ** attempt))
            print(f"Rate limited. Waiting {retry_after}s...")
            await asyncio.sleep(retry_after)
        elif response.status_code == 401:
            raise Exception("Unauthorized — token may be invalid")
        else:
            print(f"Spotify API error {response.status_code}: {response.text}")
            await asyncio.sleep(2 ** attempt)

    raise Exception(f"Failed to fetch {endpoint} after 5 attempts")


async def get_top_tracks(token: str, time_range: str = "medium_term") -> list:
    results = []
    offset = 0
    while True:
        data = await spotify_get(
            "/me/top/tracks",
            token,
            params={"limit": 50, "offset": offset, "time_range": time_range}
        )
        items = data.get("items", [])
        results.extend(items)
        if len(items) < 50 or not data.get("next"):
            break
        offset += 50
    return results


async def get_top_artists(token: str, time_range: str = "medium_term") -> list:
    results = []
    offset = 0
    while True:
        data = await spotify_get(
            "/me/top/artists",
            token,
            params={"limit": 50, "offset": offset, "time_range": time_range}
        )
        items = data.get("items", [])
        results.extend(items)
        if len(items) < 50 or not data.get("next"):
            break
        offset += 50
    return results


async def get_saved_tracks(token: str) -> list:
    results = []
    offset = 0
    while True:
        data = await spotify_get(
            "/me/tracks",
            token,
            params={"limit": 50, "offset": offset}
        )
        items = data.get("items", [])
        results.extend(items)
        if len(items) < 50 or not data.get("next"):
            break
        offset += 50
    return results


async def get_recently_played(token: str) -> list:
    data = await spotify_get(
        "/me/player/recently-played",
        token,
        params={"limit": 50}
    )
    return data.get("items", [])


async def get_playlists(token: str) -> list:
    results = []
    offset = 0
    while True:
        data = await spotify_get(
            "/me/playlists",
            token,
            params={"limit": 50, "offset": offset}
        )
        items = data.get("items", [])
        results.extend(items)
        if len(items) < 50 or not data.get("next"):
            break
        offset += 50
    return results


async def get_playlist_tracks(token: str, playlist_id: str) -> list:
    results = []
    offset = 0
    while True:
        data = await spotify_get(
            f"/playlists/{playlist_id}/tracks",
            token,
            params={"limit": 50, "offset": offset}
        )
        items = data.get("items", [])
        results.extend(items)
        if len(items) < 50 or not data.get("next"):
            break
        offset += 50
    return results

async def get_artists_batch(token: str, artist_ids: list) -> list:
    results = []
    for i in range(0, len(artist_ids), 50):
        batch = artist_ids[i:i+50]
        data = await spotify_get(
            "/artists",
            token,
            params={"ids": ",".join(batch)}
        )
        results.extend(data.get("artists", []))
        print(f"  Fetched artist details {i+len(batch)}/{len(artist_ids)}")
    return results