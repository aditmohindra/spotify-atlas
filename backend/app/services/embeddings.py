import os
import asyncio
import httpx
from sqlalchemy.orm import Session
from app.models.models import Track, TrackEmbedding
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings"
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIMENSIONS = 1536


async def embed_batch(texts: list, track_ids: list) -> list:
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": EMBED_MODEL,
        "input": texts
    }

    for attempt in range(5):
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                OPENAI_EMBED_URL,
                headers=headers,
                json=payload
            )

        if response.status_code == 200:
            data = response.json()
            embeddings = [item["embedding"] for item in data["data"]]
            return embeddings
        elif response.status_code == 429:
            wait = 2 ** attempt
            print(f"Rate limited. Waiting {wait}s...")
            await asyncio.sleep(wait)
        else:
            print(f"OpenAI error {response.status_code}: {response.text}")
            await asyncio.sleep(2 ** attempt)

    raise Exception("Failed to get embeddings after 5 attempts")


async def run_embedding_pipeline(user_id: int, db: Session):
    already_embedded = {
        e.track_id for e in db.query(TrackEmbedding).all()
    }

    tracks = db.query(Track).filter(
        Track.feature_document != None,
        Track.feature_document != ""
    ).all()

    tracks_to_embed = [t for t in tracks if t.id not in already_embedded]
    print(f"Embedding {len(tracks_to_embed)} tracks ({len(already_embedded)} already done)...")

    batch_size = 100
    total_embedded = 0

    for i in range(0, len(tracks_to_embed), batch_size):
        batch = tracks_to_embed[i:i+batch_size]
        texts = [t.feature_document for t in batch]
        ids = [t.id for t in batch]

        try:
            embeddings = await embed_batch(texts, ids)

            for track, embedding in zip(batch, embeddings):
                db.add(TrackEmbedding(
                    track_id=track.id,
                    model=EMBED_MODEL,
                    vector=embedding
                ))

            db.commit()
            total_embedded += len(batch)
            print(f"  Embedded {total_embedded}/{len(tracks_to_embed)} tracks")

        except Exception as e:
            print(f"  Error on batch {i}: {e}")
            await asyncio.sleep(5)

        await asyncio.sleep(0.1)

    print(f"Embedding complete. Total: {total_embedded} tracks embedded.")
    return {"embedded": total_embedded}