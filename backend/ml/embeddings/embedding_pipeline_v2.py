import os
import sys
import asyncio
import httpx
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import Track, TrackEmbedding, Artist
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings"
EMBED_MODEL = "text-embedding-3-small"
VECTOR_SIZE = 1536

DOCUMENT_TYPES = ['scene', 'sound', 'behavior']
DOCUMENT_COLUMNS = {
    'scene': 'scene_document',
    'sound': 'sound_document',
    'behavior': 'behavior_document',
}

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


async def embed_document_type(document_type: str) -> int:
    db = SessionLocal()
    column = DOCUMENT_COLUMNS[document_type]

    try:
        existing_ids = {
            row[0]
            for row in db.query(TrackEmbedding.track_id)
            .filter(TrackEmbedding.document_type == document_type)
            .all()
        }

        tracks = (
            db.query(Track)
            .filter(text(f"{column} IS NOT NULL"))
            .all()
        )

        tracks_to_embed = [t for t in tracks if t.id not in existing_ids]
        print(f"[{document_type}] {len(tracks_to_embed)} tracks to embed ({len(existing_ids)} already done)")

        batch_size = 100
        total_embedded = 0

        for i in range(0, len(tracks_to_embed), batch_size):
            batch = tracks_to_embed[i:i + batch_size]
            texts = [getattr(t, column) for t in batch]

            try:
                embeddings = await embed_batch(texts)

                for track, vector in zip(batch, embeddings):
                    db.add(TrackEmbedding(
                        track_id=track.id,
                        model=EMBED_MODEL,
                        vector=vector,
                        document_type=document_type,
                    ))

                db.commit()
                total_embedded += len(batch)
                print(f"  [{document_type}] Embedded {total_embedded}/{len(tracks_to_embed)}")

            except Exception as e:
                print(f"  [{document_type}] Error on batch {i}: {e}")
                db.rollback()
                await asyncio.sleep(5)

            await asyncio.sleep(0.1)

        print(f"[{document_type}] Done. Total embedded: {total_embedded}")
        return total_embedded

    finally:
        db.close()


def push_to_qdrant(document_type: str):
    db = SessionLocal()
    qdrant = QdrantClient(url=QDRANT_URL)
    collection_name = f"tracks_{document_type}"

    try:
        collections = qdrant.get_collections().collections
        existing_names = [c.name for c in collections]

        if collection_name not in existing_names:
            qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )
            print(f"[qdrant] Created collection: {collection_name}")
        else:
            print(f"[qdrant] Collection {collection_name} already exists")

        embeddings = (
            db.query(TrackEmbedding)
            .filter(TrackEmbedding.document_type == document_type)
            .all()
        )
        print(f"[qdrant] Upserting {len(embeddings)} vectors into {collection_name}...")

        batch_size = 100
        for i in range(0, len(embeddings), batch_size):
            batch = embeddings[i:i + batch_size]
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
                        "document_type": document_type,
                    },
                ))

            qdrant.upsert(collection_name=collection_name, points=points)
            print(f"  [qdrant] Upserted {min(i + batch_size, len(embeddings))}/{len(embeddings)}")

        print(f"[qdrant] {collection_name} upsert complete")
        return len(embeddings)

    finally:
        db.close()


async def run_embedding_pipeline_v2() -> dict:
    results = {}

    for doc_type in DOCUMENT_TYPES:
        print(f"\n=== Embedding: {doc_type} ===")
        count = await embed_document_type(doc_type)
        results[f"embedded_{doc_type}"] = count

    print("\n=== Pushing to Qdrant ===")
    for doc_type in DOCUMENT_TYPES:
        print(f"\n--- Qdrant push: {doc_type} ---")
        count = push_to_qdrant(doc_type)
        results[f"qdrant_{doc_type}"] = count

    return results


if __name__ == "__main__":
    asyncio.run(run_embedding_pipeline_v2())
