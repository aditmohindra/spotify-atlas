from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.services.qdrant import upsert_embeddings, search_similar

router = APIRouter()


@router.post("/qdrant/upsert")
async def trigger_upsert(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(upsert_embeddings, db)
    return {"message": "Qdrant upsert started"}


@router.get("/qdrant/similar/{track_id}")
async def get_similar(track_id: int, limit: int = 10, db: Session = Depends(get_db)):
    try:
        results = search_similar(track_id, limit)
        return {"track_id": track_id, "similar_tracks": results}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/qdrant/status")
async def qdrant_status():
    from app.services.qdrant import client, COLLECTION_NAME
    try:
        info = client.get_collection(COLLECTION_NAME)
        return {
            "collection": COLLECTION_NAME,
            "vectors_count": info.points_count,
            "status": str(info.status)
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/qdrant/find-track")
async def find_track(name: str, db: Session = Depends(get_db)):
    from app.models.models import Track, Artist
    tracks = db.query(Track).filter(
        Track.name.ilike(f"%{name}%")
    ).limit(5).all()

    results = []
    for t in tracks:
        artist = db.query(Artist).filter(Artist.id == t.artist_id).first()
        results.append({
            "track_id": t.id,
            "name": t.name,
            "artist": artist.name if artist else "Unknown"
        })
    return {"results": results}