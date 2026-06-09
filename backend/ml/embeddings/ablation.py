import os
import sys
import asyncio
import httpx
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import Track, Artist, TrackEmbedding
from app.database.connection import Base

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings"
EMBED_MODEL = "text-embedding-3-small"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def get_artist_names(db) -> set:
    artists = db.query(Artist.name).all()
    names = set()
    for (name,) in artists:
        names.add(name.lower().strip())
        if " " in name:
            parts = name.lower().split()
            for part in parts:
                if len(part) > 3:
                    names.add(part)
    return names


def strip_artist_moods(moods_line: str, artist_names: set) -> str:
    if not moods_line.startswith("Moods: "):
        return moods_line
    tags = [t.strip() for t in moods_line[7:].split(",")]
    cleaned = [t for t in tags if t.lower() not in artist_names]
    if not cleaned:
        return ""
    return "Moods: " + ", ".join(cleaned)


def build_experiment_docs(tracks: list, artist_names: set, experiment: str) -> list:
    docs = []
    for track, artist in tracks:
        if not track.feature_document:
            continue

        lines = track.feature_document.split("\n")
        track_line = lines[0] if lines else ""
        artist_line = next((l for l in lines if l.startswith("Artist:")), "")
        genre_line = next((l for l in lines if l.startswith("Genres:")), "")
        moods_line = next((l for l in lines if l.startswith("Moods:")), "")

        if experiment == "baseline":
            docs.append(track.feature_document)

        elif experiment == "no_artist_name":
            parts = [track_line, genre_line, moods_line]
            docs.append("\n".join([p for p in parts if p]))

        elif experiment == "no_artist_moods":
            cleaned_moods = strip_artist_moods(moods_line, artist_names)
            parts = [track_line, artist_line, genre_line, cleaned_moods]
            docs.append("\n".join([p for p in parts if p]))

        elif experiment == "no_artist_anything":
            cleaned_moods = strip_artist_moods(moods_line, artist_names)
            parts = [track_line, genre_line, cleaned_moods]
            docs.append("\n".join([p for p in parts if p]))

    return docs


async def embed_texts(texts: list) -> np.ndarray:
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }

    all_embeddings = []
    batch_size = 100

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        payload = {"model": EMBED_MODEL, "input": batch}

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
                all_embeddings.extend(embeddings)
                break
            else:
                await asyncio.sleep(2 ** attempt)

        print(f"  Embedded {min(i+batch_size, len(texts))}/{len(texts)}")
        await asyncio.sleep(0.1)

    return np.array(all_embeddings)


def silhouette_score_sample(embeddings: np.ndarray, labels: list) -> float:
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import LabelEncoder

    le = LabelEncoder()
    encoded = le.fit_transform(labels)

    unique, counts = np.unique(encoded, return_counts=True)
    valid = unique[counts > 1]
    mask = np.isin(encoded, valid)

    if mask.sum() < 10:
        return -1.0

    return silhouette_score(
        embeddings[mask],
        encoded[mask],
        metric="cosine",
        sample_size=min(500, mask.sum())
    )


async def run_ablation():
    db = SessionLocal()

    print("Loading sample tracks...")
    artist_names = get_artist_names(db)
    print(f"Loaded {len(artist_names)} artist name tokens to filter")

    tracks_with_artists = (
        db.query(Track, Artist)
        .join(Artist, Track.artist_id == Artist.id)
        .filter(Track.feature_document != None)
        .order_by(Artist.name)
        .limit(500)
        .all()
    )

    print(f"Running ablation on {len(tracks_with_artists)} tracks")
    labels = [artist for _, artist in tracks_with_artists]
    label_names = [a.name for a in labels]

    experiments = ["baseline", "no_artist_name", "no_artist_moods", "no_artist_anything"]
    results = {}

    for exp in experiments:
        print(f"\n--- Experiment: {exp} ---")
        docs = build_experiment_docs(tracks_with_artists, artist_names, exp)
        print(f"Sample doc:\n{docs[0]}\n")

        embeddings = await embed_texts(docs)
        score = silhouette_score_sample(embeddings, label_names)
        results[exp] = {
            "silhouette_score": round(float(score), 4),
            "sample_doc": docs[0]
        }
        print(f"Silhouette score: {score:.4f}")

    db.close()

    print("\n=== ABLATION RESULTS ===")
    for exp, data in results.items():
        print(f"{exp}: {data['silhouette_score']}")

    winner = max(results, key=lambda x: results[x]["silhouette_score"])
    print(f"\nWINNER: {winner} (score: {results[winner]['silhouette_score']})")

    return results, winner


if __name__ == "__main__":
    asyncio.run(run_ablation())