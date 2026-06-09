import os
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from sqlalchemy.orm import Session
from app.models.models import Track, TrackEmbedding, Artist
from dotenv import load_dotenv

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = "tracks"
VECTOR_SIZE = 1536

client = QdrantClient(url=QDRANT_URL)


def create_collection():
    collections = client.get_collections().collections
    names = [c.name for c in collections]

    if COLLECTION_NAME not in names:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(
                size=VECTOR_SIZE,
                distance=Distance.COSINE
            )
        )
        print(f"Created Qdrant collection: {COLLECTION_NAME}")
    else:
        print(f"Collection {COLLECTION_NAME} already exists")


def upsert_embeddings(db: Session):
    create_collection()

    embeddings = db.query(TrackEmbedding).all()
    print(f"Upserting {len(embeddings)} embeddings into Qdrant...")

    batch_size = 100
    for i in range(0, len(embeddings), batch_size):
        batch = embeddings[i:i+batch_size]
        points = []

        for emb in batch:
            track = db.query(Track).filter(Track.id == emb.track_id).first()
            artist = db.query(Artist).filter(Artist.id == track.artist_id).first() if track else None

            points.append(PointStruct(
                id=emb.track_id,
                vector=emb.vector,
                payload={
                    "track_id": emb.track_id,
                    "name": track.name if track else "",
                    "artist": artist.name if artist else "",
                    "spotify_track_id": track.spotify_track_id if track else ""
                }
            ))

        client.upsert(
            collection_name=COLLECTION_NAME,
            points=points
        )
        print(f"  Upserted {min(i+batch_size, len(embeddings))}/{len(embeddings)}")

    print("Qdrant upsert complete")
    return {"upserted": len(embeddings)}


def search_similar(track_id: int, limit: int = 10) -> list:
    vector = get_vector_by_track_id(track_id)
    
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=vector,
        limit=limit + 1
    ).points
    
    return [
        {
            "track_id": r.id,
            "name": r.payload.get("name"),
            "artist": r.payload.get("artist"),
            "score": round(r.score, 4)
        }
        for r in results
        if r.id != track_id
    ][:limit]


def get_vector_by_track_id(track_id: int) -> list:
    results = client.retrieve(
        collection_name=COLLECTION_NAME,
        ids=[track_id],
        with_vectors=True
    )
    if not results:
        raise Exception(f"Track {track_id} not found in Qdrant")
    return results[0].vector