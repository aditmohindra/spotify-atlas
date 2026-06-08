import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database.connection import get_db
from app.models.models import User
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI")

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_URL = "https://api.spotify.com/v1"

SCOPES = [
    "user-read-private",
    "user-read-email",
    "user-top-read",
    "user-read-recently-played",
    "user-library-read",
    "playlist-read-private",
    "playlist-read-collaborative"
]


@router.get("/auth/login")
def spotify_login():
    scope = "%20".join(SCOPES)
    auth_url = (
        f"{SPOTIFY_AUTH_URL}"
        f"?client_id={SPOTIFY_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={SPOTIFY_REDIRECT_URI}"
        f"&scope={scope}"
    )
    return RedirectResponse(url=auth_url)


@router.get("/auth/callback")
async def spotify_callback(code: str, db: Session = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": SPOTIFY_REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)
        )

    if token_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to get token from Spotify")

    tokens = token_response.json()
    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)
    token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

    async with httpx.AsyncClient() as client:
        profile_response = await client.get(
            f"{SPOTIFY_API_URL}/me",
            headers={"Authorization": f"Bearer {access_token}"}
        )

    if profile_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to get Spotify profile")

    profile = profile_response.json()
    spotify_id = profile["id"]
    display_name = profile.get("display_name")
    email = profile.get("email")

    user = db.query(User).filter(User.spotify_id == spotify_id).first()
    if user:
        user.access_token = access_token
        user.refresh_token = refresh_token
        user.token_expires_at = token_expires_at
        user.display_name = display_name
    else:
        user = User(
            spotify_id=spotify_id,
            display_name=display_name,
            email=email,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    return RedirectResponse(url=f"http://localhost:3000?user_id={user.id}")


@router.post("/auth/refresh")
async def refresh_token(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": user.refresh_token,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)
        )

    if token_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to refresh token")

    tokens = token_response.json()
    user.access_token = tokens["access_token"]
    user.token_expires_at = datetime.utcnow() + timedelta(seconds=tokens.get("expires_in", 3600))
    db.commit()

    return {"message": "Token refreshed successfully"}


@router.get("/auth/me")
async def get_current_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user.id,
        "spotify_id": user.spotify_id,
        "display_name": user.display_name,
        "email": user.email,
        "token_expires_at": user.token_expires_at
    }