from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.services.ingestion import run_ingestion, enrich_artists, enrich_artists_lastfm

router = APIRouter()


@router.post("/ingest")
async def trigger_ingestion(user_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(run_ingestion, user_id, db)
    return {"message": f"Ingestion started for user {user_id}"}


@router.post("/ingest/enrich-artists")
async def trigger_artist_enrichment(user_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(enrich_artists, user_id, db)
    return {"message": f"Artist enrichment started for user {user_id}"}


@router.post("/ingest/enrich-artists-lastfm")
async def trigger_lastfm_enrichment(user_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(enrich_artists_lastfm, user_id, db)
    return {"message": f"Last.fm artist enrichment started for user {user_id}"}


@router.get("/ingest/status")
async def ingestion_status(user_id: int, db: Session = Depends(get_db)):
    from app.models.models import Track, Artist, ListeningEvent

    track_count = db.query(Track).count()
    artist_count = db.query(Artist).count()
    event_count = db.query(ListeningEvent).filter(
        ListeningEvent.user_id == user_id
    ).count()
    artists_with_genres = db.query(Artist).filter(
        Artist.genres != None,
        Artist.genres != []
    ).count()

    return {
        "user_id": user_id,
        "tracks": track_count,
        "artists": artist_count,
        "artists_with_genres": artists_with_genres,
        "listening_events": event_count
    }


@router.get("/ingest/test-genres")
async def test_genres(user_id: int, db: Session = Depends(get_db)):
    from app.models.models import User
    from app.services.spotify import get_valid_token, get_top_artists

    user = db.query(User).filter(User.id == user_id).first()
    token = await get_valid_token(user, db)
    artists = await get_top_artists(token, "medium_term")

    sample = []
    for a in artists[:5]:
        sample.append({
            "name": a.get("name"),
            "genres": a.get("genres", [])
        })
    return {"sample": sample}