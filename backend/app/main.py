from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.ingest import router as ingest_router
from app.api.features import router as features_router
from app.api.embeddings import router as embeddings_router
from app.api.qdrant import router as qdrant_router
from app.api.map import router as map_router
from app.api.clusters import router as clusters_router
from app.api.profile import router as profile_router
from app.api.eras import router as eras_router
from app.api.wrapped import router as wrapped_router

app = FastAPI(
    title="Spotify Atlas",
    description="AI-powered music identity platform",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://spotify-atlas.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(ingest_router)
app.include_router(features_router)
app.include_router(embeddings_router)
app.include_router(qdrant_router)
app.include_router(map_router)
app.include_router(clusters_router)
app.include_router(profile_router)
app.include_router(eras_router)
app.include_router(wrapped_router)

@app.get("/")
def root():
    return {"message": "Spotify Atlas API"}