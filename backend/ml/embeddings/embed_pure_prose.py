"""
Embed pure_prose_document for all tracks.
Stores in track_embeddings with document_type='pure_prose'.
Pushes to Qdrant collection tracks_pure_prose.

Usage:
    uv run python ml/embeddings/embed_pure_prose.py
"""

import os
import sys
import asyncio
import httpx

sys.stdout.reconfigure(encoding="utf-8")

load_env_path = os.path.join(os.path.dirname(__file__), "../../.env")
sys.path.append(os.path.join(os.path.dirname(__file__), "../.."))

from dotenv import load_dotenv
load_dotenv(dotenv_path=load_env_path)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.models import Track, TrackEmbedding, Artist
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings"
EMBED_MODEL = "text-embedding-3-small"
VECTOR_SIZE = 1536
DOCUMENT_TYPE = "pure_prose"
COLLECTION_NAME = "tracks_pure_prose"
BATCH_SIZE = 100

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


async def embed_batch(texts: list) -> list:
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": EMBED_MODEL, "input": texts}

    for attempt in range(5):
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(OPENAI_EMBED_URL, headers=headers, json=payload)

        if response.status_code == 200:
            data = response.json()
            return [item["embedding"] for item in data["data"]]
        elif response.status_code == 429:
            wait = 2 ** attempt
            print(f"  Rate limited. Waiting {wait}s...")
            await asyncio.sleep(wait)
        else:
            print(f"  OpenAI error {response.status_code}: {response.text}")
            await asyncio.sleep(2 ** attempt)

    raise Exception("Failed to get embeddings after 5 attempts")


async def embed_pure_prose_documents() -> int:
    db = SessionLocal()

    try:
        existing_ids = {
            row[0]
            for row in db.query(TrackEmbedding.track_id)
            .filter(TrackEmbedding.document_type == DOCUMENT_TYPE)
            .all()
        }

        tracks = (
            db.query(Track)
            .filter(Track.pure_prose_document.isnot(None))
            .all()
        )

        tracks_to_embed = [t for t in tracks if t.id not in existing_ids]
        print(f"[pure_prose] {len(tracks_to_embed)} tracks to embed ({len(existing_ids)} already done)")

        total_embedded = 0

        for i in range(0, len(tracks_to_embed), BATCH_SIZE):
            batch = tracks_to_embed[i:i + BATCH_SIZE]
            texts = [t.pure_prose_document for t in batch]

            try:
                embeddings = await embed_batch(texts)

                for track, vector in zip(batch, embeddings):
                    db.add(TrackEmbedding(
                        track_id=track.id,
                        model=EMBED_MODEL,
                        vector=vector,
                        document_type=DOCUMENT_TYPE,
                    ))

                db.commit()
                total_embedded += len(batch)
                print(f"  [pure_prose] Embedded {total_embedded}/{len(tracks_to_embed)}")

            except Exception as e:
                print(f"  [pure_prose] Error on batch {i}: {e}")
                db.rollback()
                await asyncio.sleep(5)

            await asyncio.sleep(0.1)

        print(f"[pure_prose] Done. Total embedded: {total_embedded}")
        return total_embedded

    finally:
        db.close()


def push_to_qdrant() -> int:
    db = SessionLocal()
    qdrant = QdrantClient(url=QDRANT_URL)

    try:
        collections = qdrant.get_collections().collections
        existing_names = [c.name for c in collections]

        if COLLECTION_NAME not in existing_names:
            qdrant.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )
            print(f"[qdrant] Created collection: {COLLECTION_NAME}")
        else:
            print(f"[qdrant] Collection {COLLECTION_NAME} already exists")

        embeddings = (
            db.query(TrackEmbedding)
            .filter(TrackEmbedding.document_type == DOCUMENT_TYPE)
            .all()
        )
        print(f"[qdrant] Upserting {len(embeddings)} vectors into {COLLECTION_NAME}...")

        for i in range(0, len(embeddings), BATCH_SIZE):
            batch = embeddings[i:i + BATCH_SIZE]
            points = []

            for emb in batch:
                track = db.query(Track).filter(Track.id == emb.track_id).first()
                artist = (
                    db.query(Artist).filter(Artist.id == track.artist_id).first()
                    if track and track.artist_id
                    else None
                )
                points.append(PointStruct(
                    id=emb.id,
                    vector=emb.vector,
                    payload={
                        "track_id": emb.track_id,
                        "name": track.name if track else "",
                        "artist": artist.name if artist else "",
                        "document_type": DOCUMENT_TYPE,
                    },
                ))

            qdrant.upsert(collection_name=COLLECTION_NAME, points=points)
            print(f"  [qdrant] Upserted {min(i + BATCH_SIZE, len(embeddings))}/{len(embeddings)}")

        print(f"[qdrant] {COLLECTION_NAME} upsert complete")
        return len(embeddings)

    finally:
        db.close()


async def main():
    embedded = await embed_pure_prose_documents()
    pushed = push_to_qdrant()
    print(f"\nEmbedded {embedded} tracks, pushed {pushed} vectors to {COLLECTION_NAME} collection")


if __name__ == "__main__":
    asyncio.run(main())
