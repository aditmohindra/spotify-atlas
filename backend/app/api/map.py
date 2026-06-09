from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.connection import get_db

router = APIRouter()


@router.get("/map")
async def get_map_data(db: Session = Depends(get_db)):
    from app.models.models import Track, Artist, TrackCoordinate, TrackCluster

    coords = db.query(TrackCoordinate).all()
    coord_map = {c.track_id: c for c in coords}

    clusters = db.query(TrackCluster).all()
    cluster_map = {c.track_id: c.cluster_id for c in clusters}

    tracks = db.query(Track, Artist).join(
        Artist, Track.artist_id == Artist.id
    ).filter(Track.id.in_(coord_map.keys())).all()

    points = []
    for track, artist in tracks:
        coord = coord_map.get(track.id)
        if not coord:
            continue
        points.append({
            "id": track.id,
            "name": track.name,
            "artist": artist.name if artist else "Unknown",
            "x": coord.x,
            "y": coord.y,
            "cluster_id": cluster_map.get(track.id, -1),
            "spotify_id": track.spotify_track_id
        })

    return {
        "total": len(points),
        "points": points
    }


@router.get("/map/clusters")
async def get_clusters(db: Session = Depends(get_db)):
    from app.models.models import Track, Artist, TrackCluster
    from collections import defaultdict

    clusters = db.query(TrackCluster).all()

    cluster_tracks = defaultdict(list)
    for c in clusters:
        cluster_tracks[c.cluster_id].append(c.track_id)

    result = []
    for cluster_id, track_ids in cluster_tracks.items():
        sample = db.query(Track, Artist).join(
            Artist, Track.artist_id == Artist.id
        ).filter(Track.id.in_(track_ids[:3])).all()

        result.append({
            "cluster_id": cluster_id,
            "track_count": len(track_ids),
            "sample_tracks": [
                {"name": t.name, "artist": a.name}
                for t, a in sample
            ]
        })

    result.sort(key=lambda x: x["track_count"], reverse=True)
    return {"clusters": result}