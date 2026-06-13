import asyncio
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

client = AsyncOpenAI()

VIBE_PROMPT = """You are writing micro-descriptions for a personal music atlas.

Track: {track_name}
Artist: {artist_name}
Tags: {existing_tags}

Write 2-3 sentences describing how this track FEELS to listen to.
Rules:
- Do NOT mention the artist name, track title, album name, or any proper nouns
- Do NOT use genre labels (no "hip-hop", "R&B", "electronic", "rap", "trap", 
  "drill", "soul", "folk", "classical", "reggae", "punk", "metal")
- Describe only: emotional texture, time of day, energy level, physical setting, mood
- Be specific. Avoid clichés like "infectious", "catchy", "timeless", "hauntingly"
- Write as if describing the listening experience to someone who has never heard it

Respond with only the description. No preamble, no labels, no quotation marks."""


def parse_tags_from_feature_document(feature_document: str) -> str:
    if not feature_document:
        return ""

    genres = ""
    moods = ""
    for line in feature_document.splitlines():
        if line.startswith("Genres:"):
            genres = line[len("Genres:"):].strip()
        elif line.startswith("Moods:"):
            moods = line[len("Moods:"):].strip()

    parts = [p for p in [genres, moods] if p]
    return ", ".join(parts)


async def generate_vibe_description(track_name: str, artist_name: str, existing_tags: str) -> str | None:
    prompt = VIBE_PROMPT.format(
        track_name=track_name,
        artist_name=artist_name,
        existing_tags=existing_tags or "none",
    )

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.7,
        )
        text = response.choices[0].message.content
        return text.strip() if text else None
    except Exception as e:
        print(f"OpenAI error for '{track_name}' by '{artist_name}': {e}")
        return None


async def generate_vibe_descriptions_batch(tracks: list, db) -> dict:
    results = {}
    for i, track in enumerate(tracks):
        artist_name = track.artist.name if track.artist else ""
        existing_tags = parse_tags_from_feature_document(track.feature_document or "")
        description = await generate_vibe_description(track.name, artist_name, existing_tags)
        results[track.id] = description
        if (i + 1) % 100 == 0:
            print(f"  Generated vibe descriptions {i+1}/{len(tracks)}")
        await asyncio.sleep(0.5)
    return results
