from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.services.ingestion import run_ingestion

router = APIRouter()


@router.post("/ingest")
async def trigger_ingestion(user_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(run_ingestion, user_id, db)
    return {"message": f"Ingestion started for user {user_id}"}


@router.get("/ingest/status")
async def ingestion_status(user_id: int, db: Session = Depends(get_db)):
    from app.models.models import Track, Artist, ListeningEvent
    
    track_count = db.query(Track).count()
    artist_count = db.query(Artist).count()
    event_count = db.query(ListeningEvent).filter(
        ListeningEvent.user_id == user_id
    ).count()

    return {
        "user_id": user_id,
        "tracks": track_count,
        "artists": artist_count,
        "listening_events": event_count
    }