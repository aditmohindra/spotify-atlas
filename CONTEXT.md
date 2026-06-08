# Spotify Atlas — Cursor Context

## Project
AI-powered music identity platform. Transforms Spotify listening history into
semantic embeddings, clusters them into music communities, and visualizes them
as an interactive galaxy map.

## Stack
- Backend: FastAPI + Python 3.12 + SQLAlchemy + Alembic + PostgreSQL
- Frontend: Next.js + TypeScript + Tailwind + shadcn/ui + React Query
- Vector DB: Qdrant (running in Docker)
- ML: OpenAI embeddings (text-embedding-3-small), UMAP, HDBSCAN
- Genre/Mood data: Last.fm API (replacing deprecated Spotify audio features)
- Infrastructure: Docker Compose (Windows)

## Repo structure
frontend/                      → Next.js 16 app with shadcn/ui (Nova preset)
backend/app/api/               → FastAPI route handlers
  - health.py                  → GET /health
  - auth.py                    → GET /auth/login, /auth/callback, POST /auth/refresh, GET /auth/me
  - ingest.py                  → POST /ingest, /ingest/enrich-artists-lastfm, GET /ingest/status
  - features.py                → POST /features/engineer, GET /features/status, /features/sample
backend/app/services/          → Business logic
  - spotify.py                 → Spotify API calls, token refresh, pagination, rate limiting
  - ingestion.py               → Upsert logic for artists/albums/tracks/listening events
  - lastfm.py                  → Last.fm artist tags + track mood tags
  - features.py                → Feature document builder, audio feature bucketing
backend/app/models/models.py   → All SQLAlchemy models
backend/app/database/          → DB connection, get_db session
backend/ml/                    → embedding, clustering, UMAP, era scripts (Phase 4+)
backend/scripts/               → one-off pipeline runners
backend/alembic/               → DB migrations

## Environment
- OS: Windows (PowerShell — use Invoke-WebRequest not curl)
- PostgreSQL runs on port 5433 (not 5432 — conflict with local Postgres installation)
- Qdrant runs on port 6333
- Backend runs on port 8000
- Frontend runs on port 3000
- Use 127.0.0.1 not localhost (IPv6 conflict on Windows)
- uv for Python package management (never pip or conda)
- All commands run from backend/ directory for Python, frontend/ for Node

## Database
- PostgreSQL 16 in Docker
- 10 tables: users, artists, albums, tracks, listening_events,
  track_embeddings, track_coordinates, track_clusters, cluster_labels, user_eras
- Alembic for all migrations — never raw SQL schema changes

## Current data (as of Phase 3)
- 9,903 tracks
- 2,679 artists (2,165 with Last.fm genre tags, 514 obscure/unknown)
- 20,400 listening events
- Feature documents: being generated via Last.fm track mood tags (may be complete)
- Top artists: Drake (264), Future (143), Kanye West (131), Gunna (130)
- Top genres: electronic (491), rap (383), hip-hop (380), house (329)
- 1,128 unique genres across library
- Library spans 1930s–2020s, heavily weighted to 2020s (4,468 tracks)

## Current phase
Phase 3 — Feature Engineering (in progress / check status endpoint first)
Next up: Phase 4 — Embedding Pipeline

## Phase 3 status check
Run this first when resuming:
  Invoke-WebRequest -Method GET "http://127.0.0.1:8000/features/status" -UseBasicParsing
If tracks_with_documents < 9903, re-trigger:
  Invoke-WebRequest -Method POST "http://127.0.0.1:8000/features/engineer?user_id=1" -UseBasicParsing

## Phase 4 plan (next)
- Use OpenAI text-embedding-3-small to embed all track feature documents
- Store embeddings in track_embeddings table (vector as ARRAY of Float)
- Also push to Qdrant for similarity search
- Batch process 100 tracks per API call
- Estimate cost: ~$0.02 per 1M tokens, 9903 tracks × ~50 tokens = negligible
- API key: OPENAI_API_KEY in backend/.env

## Key decisions made
- Spotify audio features endpoint deprecated Nov 2024 — using Last.fm track tags instead
- Spotify genre data unavailable in dev mode — using Last.fm artist tags
- Feature documents use text format (Track/Artist/Genres/Moods) not raw numbers
- Text-based documents produce better embeddings than numeric vectors for LLMs
- Postgres on port 5433 to avoid conflict with local Postgres on 5432
- Tokens stored in DB, never in frontend localStorage
- Re-authentication needed if token_expires_at is in the past
- To re-auth: visit http://127.0.0.1:8000/auth/login in browser

## How to start services
cd C:\Users\aditm\OneDrive\Desktop\Career\Projects\Spotify-Atlas
docker compose up -d         # starts Postgres (5433) + Qdrant (6333)
cd backend
uv run uvicorn app.main:app --reload --port 8000

## Do not
- Use localStorage for tokens
- Skip Alembic migrations — no raw SQL schema changes
- Add features beyond the current phase
- Use pip or conda — always use uv
- Use curl in PowerShell — use Invoke-WebRequest instead
- Use localhost — use 127.0.0.1
- Hardcode credentials — always use .env

## API keys in backend/.env
- SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET
- SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/auth/callback
- DATABASE_URL=postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas
- QDRANT_URL=http://localhost:6333
- OPENAI_API_KEY (needed for Phase 4)
- ANTHROPIC_API_KEY (needed for Phase 10+)
- LASTFM_API_KEY