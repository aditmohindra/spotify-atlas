import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database.connection import get_db

router = APIRouter()

# Simple in-memory cache: { layer: (timestamp, response_dict) }
_galaxy_cache: dict = {}
_CACHE_TTL_SECONDS = 300

VIBE_RUN_ID = 29
SCENE_RUN_ID = 18


@router.get("/galaxy")
async def get_galaxy(
    layer: str = Query(default="vibe"),
    db: Session = Depends(get_db),
):
    if layer not in ("vibe", "scene"):
        raise HTTPException(status_code=400, detail="layer must be 'vibe' or 'scene'")

    cached = _galaxy_cache.get(layer)
    if cached:
        cached_at, payload = cached
        if time.time() - cached_at < _CACHE_TTL_SECONDS:
            return payload

    t0 = time.time()

    if layer == "vibe":
        payload = _build_vibe_payload(db)
    else:
        payload = _build_scene_payload(db)

    elapsed = time.time() - t0
    print(f"[galaxy] layer={layer} query_time={elapsed:.3f}s tracks={payload['total_tracks']}")

    _galaxy_cache[layer] = (time.time(), payload)
    return payload


def _build_vibe_payload(db: Session) -> dict:
    sql = text("""
        SELECT
            t.id                          AS track_id,
            t.spotify_track_id,
            t.name,
            a.name                        AS artist,
            al.image_url                  AS album_image_url,
            tvc.x,
            tvc.y,
            CASE
                WHEN ca.assignment_type = 'between_worlds' THEN -1
                WHEN ca.assignment_type = 'soft'           THEN ca.soft_cluster_id
                ELSE ca.cluster_id
            END                           AS cluster_id,
            ca.assignment_type,
            CASE
                WHEN ca.assignment_type = 'between_worlds' THEN 'Between Worlds'
                ELSE cl.name
            END                           AS community_name
        FROM tracks t
        JOIN artists a               ON t.artist_id      = a.id
        LEFT JOIN albums al          ON t.album_id        = al.id
        JOIN track_vibe_coordinates tvc ON t.id          = tvc.track_id
        JOIN clustering_assignments ca  ON t.id          = ca.track_id
                                       AND ca.run_id     = :run_id
        LEFT JOIN cluster_labels cl  ON cl.cluster_id   = CASE
                                            WHEN ca.assignment_type = 'soft' THEN ca.soft_cluster_id
                                            ELSE ca.cluster_id
                                        END
                                       AND cl.cluster_layer = 'vibe'
    """)
    rows = db.execute(sql, {"run_id": VIBE_RUN_ID}).mappings().all()

    label_sql = text("""
        SELECT cluster_id, name, canonical_name, cluster_archetype
        FROM cluster_labels
        WHERE cluster_layer = 'vibe'
    """)
    labels = {r["cluster_id"]: r for r in db.execute(label_sql).mappings().all()}

    return _assemble_payload("vibe", rows, labels, noise_name="Between Worlds")


def _build_scene_payload(db: Session) -> dict:
    sql = text("""
        SELECT
            t.id                    AS track_id,
            t.spotify_track_id,
            t.name,
            a.name                  AS artist,
            al.image_url            AS album_image_url,
            tc_coord.x,
            tc_coord.y,
            tc.cluster_id,
            'hard'                  AS assignment_type,
            CASE
                WHEN tc.cluster_id = -1 THEN 'Uncharted'
                ELSE cl.name
            END                     AS community_name
        FROM tracks t
        JOIN artists a              ON t.artist_id     = a.id
        LEFT JOIN albums al         ON t.album_id       = al.id
        JOIN track_coordinates tc_coord ON t.id        = tc_coord.track_id
        JOIN track_clusters tc      ON t.id            = tc.track_id
        LEFT JOIN cluster_labels cl ON cl.cluster_id   = tc.cluster_id
                                    AND cl.cluster_layer = 'scene'
    """)
    rows = db.execute(sql).mappings().all()

    label_sql = text("""
        SELECT cluster_id, name, canonical_name, cluster_archetype
        FROM cluster_labels
        WHERE cluster_layer = 'scene'
    """)
    labels = {r["cluster_id"]: r for r in db.execute(label_sql).mappings().all()}

    return _assemble_payload("scene", rows, labels, noise_name="Uncharted")


def _assemble_payload(layer: str, rows, labels: dict, noise_name: str) -> dict:
    tracks = []
    community_track_counts: dict[int, int] = defaultdict(int)

    for r in rows:
        cid = r["cluster_id"]
        if cid is not None:
            community_track_counts[cid] += 1
        tracks.append({
            "track_id":        r["track_id"],
            "spotify_track_id": r["spotify_track_id"],
            "name":            r["name"],
            "artist":          r["artist"],
            "album_image_url": r["album_image_url"],
            "x":               r["x"],
            "y":               r["y"],
            "cluster_id":      cid if cid is not None else -1,
            "community_name":  r["community_name"],
            "assignment_type": r["assignment_type"],
        })

    communities = []
    for cid, label_row in labels.items():
        communities.append({
            "cluster_id":       cid,
            "name":             label_row["name"],
            "canonical_name":   label_row["canonical_name"],
            "cluster_archetype": label_row["cluster_archetype"],
            "track_count":      community_track_counts.get(cid, 0),
        })
    if -1 in community_track_counts:
        communities.append({
            "cluster_id":       -1,
            "name":             noise_name,
            "canonical_name":   None,
            "cluster_archetype": None,
            "track_count":      community_track_counts[-1],
        })
    communities.sort(key=lambda c: c["cluster_id"])

    return {
        "layer":             layer,
        "total_tracks":      len(tracks),
        "total_communities": len([c for c in communities if c["cluster_id"] != -1]),
        "tracks":            tracks,
        "communities":       communities,
    }


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
    from app.models.models import Track, Artist, TrackCluster, TrackCoordinate
    from collections import defaultdict
    import statistics

    clusters = db.query(TrackCluster).all()
    coords = db.query(TrackCoordinate).all()
    coord_map = {c.track_id: c for c in coords}

    cluster_tracks = defaultdict(list)
    for c in clusters:
        cluster_tracks[c.cluster_id].append(c.track_id)

    result = []
    for cluster_id, track_ids in cluster_tracks.items():
        if cluster_id == -1:
            continue

        xs = [coord_map[tid].x for tid in track_ids if tid in coord_map]
        ys = [coord_map[tid].y for tid in track_ids if tid in coord_map]

        if not xs:
            continue

        centroid_x = statistics.mean(xs)
        centroid_y = statistics.mean(ys)

        sample = db.query(Track, Artist).join(
            Artist, Track.artist_id == Artist.id
        ).filter(Track.id.in_(track_ids[:5])).all()

        top_artists = {}
        all_tracks = db.query(Track, Artist).join(
            Artist, Track.artist_id == Artist.id
        ).filter(Track.id.in_(track_ids)).all()

        for t, a in all_tracks:
            top_artists[a.name] = top_artists.get(a.name, 0) + 1

        sorted_artists = sorted(top_artists.items(), key=lambda x: x[1], reverse=True)

        result.append({
            "cluster_id": cluster_id,
            "track_count": len(track_ids),
            "centroid_x": centroid_x,
            "centroid_y": centroid_y,
            "top_artists": [a for a, _ in sorted_artists[:3]],
            "sample_tracks": [
                {"name": t.name, "artist": a.name}
                for t, a in sample[:3]
            ]
        })

    result.sort(key=lambda x: x["track_count"], reverse=True)
    return {"clusters": result}