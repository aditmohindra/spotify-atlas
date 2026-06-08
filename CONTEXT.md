# Spotify Atlas — Cursor Context

## Project
AI-powered music identity platform. Transforms Spotify listening history into
semantic embeddings, clusters them into music communities, and visualizes them
as an interactive galaxy map.

## Stack
- Backend: FastAPI + Python 3.12 + SQLAlchemy + Alembic + PostgreSQL
- Frontend: Next.js + TypeScript + Tailwind + shadcn/ui + React Query
- Vector DB: Qdrant (running in Docker)
- ML: OpenAI embeddings, UMAP, HDBSCAN
- Infrastructure: Docker Compose

## Repo structure
frontend/          → Next.js app
backend/app/       → FastAPI routes, services, models
backend/app/api/   → route handlers
backend/app/services/ → business logic
backend/app/models/   → SQLAlchemy models
backend/app/database/ → DB connection and session
backend/ml/        → embedding, clustering, UMAP, era scripts
backend/scripts/   → one-off pipeline runners

## Current phase
Stage 0 — Project scaffold complete. Starting backend setup.

## Decisions made
- Windows development environment
- Using uv for Python package management (not pip/poetry)
- OpenAI text-embedding-3-small for embeddings
- Alembic for all DB migrations — no raw SQL schema changes
- Tokens stored in DB, never in frontend localStorage
- PostgreSQL + Qdrant both run in Docker

## Do not
- Use localStorage for tokens
- Skip Alembic migrations
- Add features beyond the current phase
- Use pip or conda — always use uv