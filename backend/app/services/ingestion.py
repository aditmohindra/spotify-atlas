import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.models import User, Artist, Album, Track, ListeningEvent
from app.services.spotify import (
    get_valid_token,
    get_top_tracks,
    get_top_artists,
    get_saved_tracks,
    get_recently_played,
    get_playlists,
    get_playlist_tracks
)


def upsert_artist(db: Session, artist_data: dict) -> Artist:
    artist = db.query(Artist).filter(
        Artist.spotify_artist_id == artist_data["id"]
    ).first()

    if not artist:
        artist = Artist(
            spotify_artist_id=artist_data["id"],
            name=artist_data["name"],
            genres=artist_data.get("genres", []),
            popularity=artist_data.get("popularity")
        )
        db.add(artist)
        db.flush()
    else:
        artist.genres = artist_data.get("genres", artist.genres)
        artist.popularity = artist_data.get("popularity", artist.popularity)

    return artist


def upsert_album(db: Session, album_data: dict) -> Album:
    album = db.query(Album).filter(
        Album.spotify_album_id == album_data["id"]
    ).first()

    if not album:
        album = Album(
            spotify_album_id=album_data["id"],
            name=album_data["name"],
            release_date=album_data.get("release_date")
        )
        db.add(album)
        db.flush()

    return album


def upsert_track(db: Session, track_data: dict) -> Track:
    track = db.query(Track).filter(
        Track.spotify_track_id == track_data["id"]
    ).first()

    if not track:
        artist_data = track_data.get("artists", [{}])[0]
        artist = None
        if artist_data.get("id"):
            artist = db.query(Artist).filter(
                Artist.spotify_artist_id == artist_data["id"]
            ).first()

        album_data = track_data.get("album", {})
        album = None
        if album_data.get("id"):
            album = db.query(Album).filter(
                Album.spotify_album_id == album_data["id"]
            ).first()

        track = Track(
            spotify_track_id=track_data["id"],
            name=track_data["name"],
            artist_id=artist.id if artist else None,
            album_id=album.id if album else None,
            popularity=track_data.get("popularity")
        )
        db.add(track)
        db.flush()

    return track


def add_listening_event(db: Session, user_id: int, track_id: int, played_at: datetime, source: str):
    existing = db.query(ListeningEvent).filter(
        ListeningEvent.user_id == user_id,
        ListeningEvent.track_id == track_id,
        ListeningEvent.played_at == played_at,
        ListeningEvent.source == source
    ).first()

    if not existing:
        event = ListeningEvent(
            user_id=user_id,
            track_id=track_id,
            played_at=played_at,
            source=source
        )
        db.add(event)


async def run_ingestion(user_id: int, db: Session):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise Exception(f"User {user_id} not found")

    token = await get_valid_token(user, db)
    stats = {
        "artists": 0, "albums": 0, "tracks": 0, "listening_events": 0
    }

    print("Ingesting top artists...")
    for time_range in ["short_term", "medium_term", "long_term"]:
        artists = await get_top_artists(token, time_range)
        for artist_data in artists:
            upsert_artist(db, artist_data)
            stats["artists"] += 1
        db.commit()
        print(f"  {time_range}: {len(artists)} artists")

    print("Ingesting top tracks...")
    for time_range in ["short_term", "medium_term", "long_term"]:
        tracks = await get_top_tracks(token, time_range)
        for track_data in tracks:
            artist_data = track_data.get("artists", [{}])[0]
            if artist_data.get("id"):
                existing_artist = db.query(Artist).filter(
                    Artist.spotify_artist_id == artist_data["id"]
                ).first()
                if not existing_artist:
                    full_artist = {"id": artist_data["id"], "name": artist_data["name"], "genres": [], "popularity": None}
                    upsert_artist(db, full_artist)

            album_data = track_data.get("album", {})
            if album_data.get("id"):
                upsert_album(db, album_data)

            track = upsert_track(db, track_data)
            add_listening_event(db, user.id, track.id, datetime.utcnow(), f"top_{time_range}")
            stats["tracks"] += 1

        db.commit()
        print(f"  {time_range}: {len(tracks)} tracks")

    print("Ingesting saved tracks...")
    saved = await get_saved_tracks(token)
    for item in saved:
        track_data = item.get("track", {})
        if not track_data.get("id"):
            continue

        artist_data = track_data.get("artists", [{}])[0]
        if artist_data.get("id"):
            existing_artist = db.query(Artist).filter(
                Artist.spotify_artist_id == artist_data["id"]
            ).first()
            if not existing_artist:
                full_artist = {"id": artist_data["id"], "name": artist_data["name"], "genres": [], "popularity": None}
                upsert_artist(db, full_artist)

        album_data = track_data.get("album", {})
        if album_data.get("id"):
            upsert_album(db, album_data)

        track = upsert_track(db, track_data)
        added_at = item.get("added_at")
        played_at = datetime.fromisoformat(added_at.replace("Z", "+00:00")) if added_at else datetime.utcnow()
        add_listening_event(db, user.id, track.id, played_at, "saved_tracks")
        stats["tracks"] += 1

    db.commit()
    print(f"  {len(saved)} saved tracks")

    print("Ingesting recently played...")
    recent = await get_recently_played(token)
    for item in recent:
        track_data = item.get("track", {})
        if not track_data.get("id"):
            continue

        artist_data = track_data.get("artists", [{}])[0]
        if artist_data.get("id"):
            existing_artist = db.query(Artist).filter(
                Artist.spotify_artist_id == artist_data["id"]
            ).first()
            if not existing_artist:
                full_artist = {"id": artist_data["id"], "name": artist_data["name"], "genres": [], "popularity": None}
                upsert_artist(db, full_artist)

        album_data = track_data.get("album", {})
        if album_data.get("id"):
            upsert_album(db, album_data)

        track = upsert_track(db, track_data)
        played_at_str = item.get("played_at")
        played_at = datetime.fromisoformat(played_at_str.replace("Z", "+00:00")) if played_at_str else datetime.utcnow()
        add_listening_event(db, user.id, track.id, played_at, "recently_played")
        stats["listening_events"] += 1

    db.commit()
    print(f"  {len(recent)} recently played tracks")

    print("Ingesting playlists...")
    playlists = await get_playlists(token)
    for playlist in playlists:
        if not playlist.get("id"):
            continue
        try:
            playlist_tracks = await get_playlist_tracks(token, playlist["id"])
        except Exception as e:
            print(f"  Skipping playlist '{playlist.get('name')}': {e}")
            continue

        for item in playlist_tracks:
            track_data = item.get("track", {})
            if not track_data or not track_data.get("id"):
                continue

            artist_data = track_data.get("artists", [{}])[0]
            if artist_data.get("id"):
                existing_artist = db.query(Artist).filter(
                    Artist.spotify_artist_id == artist_data["id"]
                ).first()
                if not existing_artist:
                    full_artist = {"id": artist_data["id"], "name": artist_data["name"], "genres": [], "popularity": None}
                    upsert_artist(db, full_artist)

            album_data = track_data.get("album", {})
            if album_data.get("id"):
                upsert_album(db, album_data)

            track = upsert_track(db, track_data)
            add_listening_event(db, user.id, track.id, datetime.utcnow(), f"playlist_{playlist['id']}")
            stats["tracks"] += 1

        db.commit()
        print(f"  Playlist '{playlist.get('name')}': {len(playlist_tracks)} tracks")

    print(f"\nIngestion complete: {stats}")
    return stats

async def enrich_artists(user_id: int, db: Session):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise Exception(f"User {user_id} not found")

    token = await get_valid_token(user, db)

    from app.services.spotify import get_artists_batch

    artists = db.query(Artist).filter(
        (Artist.genres == None) | (Artist.genres == [])
    ).all()

    print(f"Enriching {len(artists)} artists with full details...")

    artist_ids = [a.spotify_artist_id for a in artists]

    full_artists = await get_artists_batch(token, artist_ids)

    enriched = 0
    for artist_data in full_artists:
        if not artist_data:
            continue
        artist = db.query(Artist).filter(
            Artist.spotify_artist_id == artist_data["id"]
        ).first()
        if artist:
            artist.genres = artist_data.get("genres", [])
            artist.popularity = artist_data.get("popularity")
            enriched += 1

    db.commit()
    print(f"Enriched {enriched} artists with genres and popularity")
    return {"enriched": enriched}

async def enrich_artists_lastfm(user_id: int, db: Session):
    from app.services.lastfm import enrich_artists_with_lastfm

    artists = db.query(Artist).filter(
        (Artist.genres == None) | (Artist.genres == [])
    ).all()

    print(f"Enriching {len(artists)} artists with Last.fm tags...")

    results = await enrich_artists_with_lastfm(artists)

    enriched = 0
    for spotify_artist_id, tags in results.items():
        if tags:
            artist = db.query(Artist).filter(
                Artist.spotify_artist_id == spotify_artist_id
            ).first()
            if artist:
                artist.genres = tags
                enriched += 1

    db.commit()
    print(f"Enriched {enriched} artists with Last.fm tags")
    return {"enriched": enriched}