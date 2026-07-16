# Spotify Atlas

https://spotify-atlas.vercel.app/map

AI-powered music identity platform that transforms Spotify listening history
into semantic embeddings, discovers latent music communities, and visualizes
personal music taste as an interactive galaxy.

## Stack
- **Backend:** FastAPI + PostgreSQL + SQLAlchemy
- **Frontend:** Next.js + TypeScript + Tailwind
- **ML:** OpenAI Embeddings + UMAP + HDBSCAN
- **Vector DB:** Qdrant

## Quick start

### Prerequisites
- Docker Desktop
- Node.js v20+
- uv (Python package manager)

### Run infrastructure
```bash
docker compose up -d
```

### Run backend
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

### Run frontend
```bash
cd frontend
npm install
npm run dev
```

## Phases
See CONTEXT.md for current build phase and decisions.

## Data Sources
- [GetSongBPM](https://getsongbpm.com) — audio features (BPM, energy, danceability, acousticness, liveness)
- [Last.fm](https://last.fm) — genre and mood tags
- [OpenAI](https://openai.com) — embeddings and cluster naming
