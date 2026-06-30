from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database.connection import get_db

router = APIRouter()


class EraLabelUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    mood: str | None = None


def _fetch_dominant_communities(db: Session, cluster_ids: list[int] | None) -> list[dict]:
    if not cluster_ids:
        return []

    rows = db.execute(
        text("""
            SELECT cluster_id, name, cluster_archetype
            FROM cluster_labels
            WHERE cluster_layer = 'vibe'
              AND cluster_id = ANY(:ids)
        """),
        {"ids": cluster_ids},
    ).fetchall()

    by_id = {
        row[0]: {
            "cluster_id": row[0],
            "name": row[1],
            "archetype": row[2],
        }
        for row in rows
    }
    return [by_id[cid] for cid in cluster_ids if cid in by_id]


@router.get("/eras")
async def get_eras(user_id: int = 1, db: Session = Depends(get_db)):
    from app.models.models import UserEra, EraLabel

    eras = (
        db.query(UserEra)
        .filter(UserEra.user_id == user_id)
        .order_by(UserEra.era_number)
        .all()
    )

    label_by_era = {
        label.era_id: label
        for label in db.query(EraLabel).filter(
            EraLabel.era_id.in_([e.id for e in eras])
        ).all()
    }

    return [
        {
            "era_id": era.id,
            "era_number": era.era_number,
            "start_date": era.start_date.isoformat(),
            "end_date": era.end_date.isoformat(),
            "event_count": era.event_count,
            "title": label.title if (label := label_by_era.get(era.id)) else None,
            "description": label.description if label else None,
            "mood": label.mood if label else None,
            "key_tracks": label.key_tracks if label and label.key_tracks else [],
            "is_named": bool(label and label.edited_at is not None),
            "dominant_communities": _fetch_dominant_communities(
                db, era.dominant_cluster_ids
            ),
        }
        for era in eras
    ]


@router.patch("/eras/{era_id}")
async def update_era_label(
    era_id: int,
    body: EraLabelUpdate,
    db: Session = Depends(get_db),
):
    from app.models.models import UserEra, EraLabel

    era = db.query(UserEra).filter(UserEra.id == era_id).first()
    if not era:
        raise HTTPException(status_code=404, detail="Era not found")

    label = db.query(EraLabel).filter(EraLabel.era_id == era_id).first()
    if not label:
        raise HTTPException(status_code=404, detail="Era label not found")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    for field, value in updates.items():
        setattr(label, field, value)
    label.edited_at = datetime.utcnow()
    db.commit()
    db.refresh(label)

    return {
        "era_id": era.id,
        "era_number": era.era_number,
        "title": label.title,
        "description": label.description,
        "mood": label.mood,
        "key_tracks": label.key_tracks or [],
        "edited_at": label.edited_at.isoformat() if label.edited_at else None,
    }
