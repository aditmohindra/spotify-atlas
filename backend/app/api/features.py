from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.services.features import run_feature_engineering

router = APIRouter()


@router.post("/features/engineer")
async def trigger_feature_engineering(user_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(run_feature_engineering, user_id, db)
    return {"message": f"Feature engineering started for user {user_id}"}


@router.get("/features/status")
async def feature_status(db: Session = Depends(get_db)):
    from app.models.models import Track

    total = db.query(Track).count()
    with_features = db.query(Track).filter(Track.energy != None).count()
    with_documents = db.query(Track).filter(Track.feature_document != None).count()

    return {
        "total_tracks": total,
        "tracks_with_audio_features": with_features,
        "tracks_with_documents": with_documents,
        "completion_pct": round(with_documents / total * 100, 1) if total > 0 else 0
    }


@router.get("/features/sample")
async def sample_documents(db: Session = Depends(get_db)):
    from app.models.models import Track

    tracks = db.query(Track).filter(
        Track.feature_document != None
    ).limit(5).all()

    return {
        "samples": [
            {"name": t.name, "document": t.feature_document}
            for t in tracks
        ]
    }