from collections import defaultdict
from sqlalchemy.orm import Session, joinedload
from app.models.models import Track
from app.services.feature_engineering_v2 import parse_tags_from_feature_document


GENRE_LABELS = {
    "hip-hop", "hip hop", "rap", "r&b", "rnb", "electronic", "pop", "jazz", "rock",
    "metal", "classical", "folk", "country", "reggae", "punk", "soul", "funk", "blues",
    "ambient", "house", "techno", "trance", "drum and bass", "dubstep", "trap", "drill",
    "grime", "indie",
}


def compute_cross_artist_tag_filter(db: Session) -> set[str]:
    tracks = (
        db.query(Track)
        .options(joinedload(Track.artist))
        .filter(Track.feature_document.isnot(None))
        .all()
    )

    tag_to_artists: dict[str, set[int]] = defaultdict(set)

    for track in tracks:
        if not track.artist_id:
            continue
        genres, moods = parse_tags_from_feature_document(track.feature_document)
        for tag in genres + moods:
            tag_lower = tag.lower().strip()
            if tag_lower:
                tag_to_artists[tag_lower].add(track.artist_id)

    total = len(tag_to_artists)
    valid_tags = {tag for tag, artists in tag_to_artists.items() if len(artists) >= 5}
    retained_pct = len(valid_tags) / total * 100 if total else 0

    print(
        f"Cross-artist filter: keeping {len(valid_tags)} tags out of {total} total "
        f"({retained_pct:.1f}% retained)"
    )
    return valid_tags


JAPANESE_TAGS = {'japanese', 'j-pop', 'j-rock', 'anime', 'japanese music', 'japan'}
KOREAN_TAGS   = {'korean', 'k-pop', 'kpop', 'korean music'}


def _detect_culture(raw_tags: list[str]) -> str | None:
    """Return 'japanese' or 'korean' if the raw tag list signals cultural origin."""
    lowered = {t.lower().strip() for t in raw_tags}
    if lowered & JAPANESE_TAGS:
        return 'japanese'
    if lowered & KOREAN_TAGS:
        return 'korean'
    return None


def build_vibe_combined_document(
    track,
    vibe_prose: str,
    tags: list[str],
    valid_tags: set[str],
) -> str:
    filtered = [
        t for t in tags
        if t.lower().strip() in valid_tags
        and t.lower().strip() not in GENRE_LABELS
    ]
    # Deduplicate while preserving order
    seen: set[str] = set()
    deduped: list[str] = []
    for t in filtered:
        key = t.lower().strip()
        if key not in seen:
            seen.add(key)
            deduped.append(t)

    chosen = deduped[:6]

    lines = [f"Vibe: {vibe_prose}"]
    if chosen:
        lines.append(f"Mood: {', '.join(chosen)}")

    # Cultural anchor — checked against raw tags before cross-artist filtering
    culture = _detect_culture(tags)
    if culture:
        lines.append(f"Culture: {culture}")

    return "\n".join(lines)


async def build_all_vibe_combined_documents(db: Session) -> dict:
    valid_tags = compute_cross_artist_tag_filter(db)

    tracks = (
        db.query(Track)
        .options(joinedload(Track.artist))
        .all()
    )
    print(f"Building combined documents for {len(tracks)} tracks...")

    total = 0
    with_mood = 0
    prose_only = 0

    for i, track in enumerate(tracks):
        if not track.vibe_document:
            continue

        genres, moods = parse_tags_from_feature_document(track.feature_document or "")
        all_tags = genres + moods

        doc = build_vibe_combined_document(track, track.vibe_document, all_tags, valid_tags)
        track.vibe_combined_document = doc
        total += 1

        if "\nMood:" in doc:
            with_mood += 1
        else:
            prose_only += 1

        if (i + 1) % 500 == 0:
            db.commit()
            print(f"  Progress: {i + 1}/{len(tracks)} tracks processed")

    db.commit()
    print(f"Combined document build complete: {total} total, {with_mood} with mood tags, {prose_only} prose-only")

    return {"total": total, "with_mood_tags": with_mood, "prose_only": prose_only}
