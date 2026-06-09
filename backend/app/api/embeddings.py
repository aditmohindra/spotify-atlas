from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.services.embeddings import run_embedding_pipeline

router = APIRouter()


@router.post("/embeddings/generate")
async def trigger_embeddings(user_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(run_embedding_pipeline, user_id, db)
    return {"message": f"Embedding pipeline started for user {user_id}"}


@router.get("/embeddings/status")
async def embedding_status(db: Session = Depends(get_db)):
    from app.models.models import Track, TrackEmbedding

    total_tracks = db.query(Track).filter(
        Track.feature_document != None
    ).count()
    embedded = db.query(TrackEmbedding).count()

    return {
        "total_tracks": total_tracks,
        "embedded": embedded,
        "remaining": total_tracks - embedded,
        "completion_pct": round(embedded / total_tracks * 100, 1) if total_tracks > 0 else 0
    }