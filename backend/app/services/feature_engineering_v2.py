import re
from sqlalchemy.orm import Session, joinedload
from app.models.models import Track, ListeningEvent
from app.services.features import bucket_energy, bucket_valence, bucket_tempo


CONTEXT_MAP = {
    'top_short': ['currently obsessed', 'heavy rotation', 'recent favorite'],
    'top_medium': ['regular rotation', 'consistent listen', 'familiar favorite'],
    'top_long': ['long-term favorite', 'all-time listen', 'deeply embedded'],
    'saved_tracks': ['intentionally saved', 'library staple', 'keeper'],
    'recently_played': ['recently played', 'current listen'],
}

PLAYLIST_KEYWORDS = {
    'gym': ['high energy', 'workout', 'physical'],
    'workout': ['high energy', 'workout', 'physical'],
    'run': ['high energy', 'running', 'physical'],
    'sleep': ['late night', 'sleep', 'calm', 'ambient'],
    'night': ['late night', 'nighttime', 'after hours'],
    'chill': ['chill', 'relaxed', 'low energy'],
    'study': ['focus', 'concentration', 'background'],
    'focus': ['focus', 'concentration', 'background'],
    'sad': ['melancholic', 'emotional', 'introspective'],
    'hype': ['high energy', 'hype', 'intense'],
    'party': ['party', 'social', 'high energy'],
    'vibe': ['vibes', 'mood', 'atmospheric'],
    'anime': ['anime', 'japanese', 'otaku'],
    'rap': ['hip-hop', 'rap', 'urban'],
    'rnb': ['r&b', 'soul', 'smooth'],
}


def parse_tags_from_feature_document(feature_document: str) -> tuple[list, list]:
    if not feature_document:
        return [], []

    genres = []
    moods = []

    for line in feature_document.split('\n'):
        if line.startswith('Genres:'):
            raw = line[len('Genres:'):].strip()
            genres = [g.strip() for g in raw.split(',') if g.strip()]
        elif line.startswith('Moods:'):
            raw = line[len('Moods:'):].strip()
            moods = [m.strip() for m in raw.split(',') if m.strip()]

    return genres, moods


def build_scene_document(track, artist, genres: list, moods: list, source_signals: list) -> str:
    lines = []
    lines.append(f"Track: {track.name}")
    lines.append(f"Artist: {artist.name}")

    for genre in genres[:6]:
        lines.append(f"Genre: {genre}")
        lines.append(f"Genre: {genre}")
        lines.append(f"Genre: {genre}")

    for mood in moods[:8]:
        lines.append(f"Mood: {mood}")
        lines.append(f"Mood: {mood}")

    for signal in source_signals:
        lines.append(f"Context: {signal}")
        lines.append(f"Context: {signal}")

    return "\n".join(lines)


def build_sound_document(track, artist, genres: list, moods: list) -> str:
    lines = []
    lines.append(f"Track: {track.name}")

    for mood in moods[:8]:
        lines.append(f"Mood: {mood}")
        lines.append(f"Mood: {mood}")
        lines.append(f"Mood: {mood}")

    for genre in genres[:6]:
        lines.append(f"Genre: {genre}")
        lines.append(f"Genre: {genre}")

    if track.energy is not None:
        lines.append(f"Energy: {bucket_energy(track.energy)}")
    if track.valence is not None:
        lines.append(f"Valence: {bucket_valence(track.valence)}")
    if track.tempo is not None:
        lines.append(f"Tempo: {bucket_tempo(track.tempo)}")

    return "\n".join(lines)


def infer_context_tags(source: str) -> list[str]:
    if not source:
        return ['general listening']

    if source in CONTEXT_MAP:
        return CONTEXT_MAP[source]

    source_lower = source.lower()
    matched = []
    for keyword, tags in PLAYLIST_KEYWORDS.items():
        if keyword in source_lower:
            matched.extend(tags)

    if matched:
        return list(dict.fromkeys(matched))

    return ['general listening']


def build_behavior_document(track, source_events: list[str]) -> str:
    lines = []
    lines.append(f"Track: {track.name}")

    if not source_events:
        source_events_for_tags = ['untracked listen']
    else:
        source_events_for_tags = source_events

    all_tags = []
    for source in source_events_for_tags:
        all_tags.extend(infer_context_tags(source))

    unique_tags = list(dict.fromkeys(all_tags))

    distinct_sources = len(set(source_events)) if source_events else 0
    if distinct_sources >= 3:
        frequency_bucket = 'heavy rotation'
    elif distinct_sources == 2:
        frequency_bucket = 'moderate listening'
    else:
        frequency_bucket = 'single context listen'

    lines.append(f"Listening Pattern: {frequency_bucket}")

    for tag in unique_tags:
        lines.append(f"Context: {tag}")
        lines.append(f"Context: {tag}")

    return "\n".join(lines)


async def build_all_documents(db: Session) -> dict:
    tracks = db.query(Track).options(joinedload(Track.artist)).all()
    print(f"Loaded {len(tracks)} tracks")

    events = db.query(ListeningEvent.track_id, ListeningEvent.source).all()
    sources_by_track: dict[int, list[str]] = {}
    for track_id, source in events:
        if track_id not in sources_by_track:
            sources_by_track[track_id] = []
        if source:
            sources_by_track[track_id].append(source)

    print(f"Loaded listening events for {len(sources_by_track)} tracks")

    scene_count = 0
    sound_count = 0
    behavior_count = 0

    for i, track in enumerate(tracks):
        artist = track.artist
        if artist is None:
            continue

        genres, moods = parse_tags_from_feature_document(track.feature_document)

        source_events = sources_by_track.get(track.id, [])

        unique_signals: list[str] = []
        seen_signals: set[str] = set()
        for src in source_events:
            for tag in infer_context_tags(src):
                if tag not in seen_signals:
                    seen_signals.add(tag)
                    unique_signals.append(tag)

        track.scene_document = build_scene_document(track, artist, genres, moods, unique_signals)
        scene_count += 1

        track.sound_document = build_sound_document(track, artist, genres, moods)
        sound_count += 1

        track.behavior_document = build_behavior_document(track, source_events)
        behavior_count += 1

        if (i + 1) % 500 == 0:
            db.commit()
            print(f"  Progress: {i + 1}/{len(tracks)} tracks processed")

    db.commit()
    print(f"Document build complete: scene={scene_count}, sound={sound_count}, behavior={behavior_count}")

    return {
        "total": len(tracks),
        "scene": scene_count,
        "sound": sound_count,
        "behavior": behavior_count,
    }
