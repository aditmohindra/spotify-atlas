# Spotify Atlas — Cursor Context

## Project
AI-powered music identity platform. Transforms Spotify listening history into
semantic embeddings, clusters them into music communities, and visualizes them
as an interactive galaxy map with AI-generated identity profiles.

## Stack
- Backend: FastAPI + Python 3.12 + SQLAlchemy + Alembic + PostgreSQL
- Frontend: Next.js + TypeScript + Tailwind v4 + shadcn/ui + React Query
- Vector DB: Qdrant (running in Docker)
- ML: OpenAI embeddings (text-embedding-3-small, 1536D), UMAP, HDBSCAN
- Genre/Mood data: Last.fm API (replacing deprecated Spotify audio features)
- Infrastructure: Docker Compose (Windows)

## Repo structure
frontend/                          → Next.js app with shadcn/ui
backend/app/api/                   → FastAPI route handlers
  - health.py                      → GET /health
  - auth.py                        → GET /auth/login, /auth/callback, POST /auth/refresh, GET /auth/me
  - ingest.py                      → POST /ingest, /ingest/enrich-artists-lastfm, GET /ingest/status
  - features.py                    → POST /features/engineer, GET /features/status, /features/sample
  - clusters.py                    → GET /clusters, cluster detail endpoints
  - map.py                         → GET /map (track coordinates + metadata)
  - profile.py                     → GET /taste-profile, identity summary
  - embeddings.py                  → POST /embed
  - qdrant.py                      → Qdrant similarity search endpoints
backend/app/services/              → Business logic
  - spotify.py                     → Spotify API calls, token refresh, pagination, rate limiting
  - ingestion.py                   → Upsert logic for artists/albums/tracks/listening events
  - lastfm.py                      → Last.fm artist tags + track mood tags
  - features.py                    → Feature document builder, audio feature bucketing
  - feature_engineering_v2.py      → Scene / Sound / Behavior document builders (ML-2b)
  - embeddings.py                  → OpenAI embedding calls, batch processing
  - qdrant.py                      → Qdrant client, upsert, search
  - cluster_naming.py              → GPT-4o cluster naming with banned word list
  - archetype_generation.py        → 9 archetype generation
  - cluster_relations.py           → Cluster centroid similarity
  - getsongbpm.py                  → GetSongBPM API (audio features — in progress)
backend/app/models/models.py       → All SQLAlchemy models
backend/app/database/              → DB connection, get_db session
backend/ml/
  - clustering/
    - hdbscan_pipeline.py          → HDBSCAN on 15D coords, writes to experiment tables
    - umap_cluster_pipeline.py     → UMAP to 15D for clustering (separate from viz)
    - run_experiment.py            → End-to-end experiment runner with full CLI args
    - experiment_grid.py           → Systematic grid search across param combinations
    - compare_runs.py              → Formatted summary table of all runs
    - promote_run.py               → Promotes a run to production track_clusters (confirmation gate)
    - score_coherence.py           → GPT-4o-mini LLM coherence scoring per cluster
  - embeddings/
    - ablation.py                  → Ablation experiments (Phase 5.5)
    - embedding_pipeline_v2.py     → Embeds scene/sound/behavior document types
    - run_ml2b.py                  → ML-2b orchestration runner
  - enrichment/
    - enrich_audio_features.py     → GetSongBPM enrichment script (in progress)
  - visualization/
    - umap_pipeline.py             → UMAP to 2D for galaxy map visualization only
  - eras/                          → Phase 12+ era detection (not started)
backend/alembic/versions/          → DB migrations

## Environment
- OS: Windows (PowerShell — use Invoke-WebRequest not curl)
- PostgreSQL runs on port 5433 (not 5432 — conflict with local Postgres)
- Qdrant runs on port 6333
- Backend runs on port 8000
- Frontend runs on port 3000
- Use 127.0.0.1 not localhost (IPv6 conflict on Windows)
- uv for Python package management (never pip or conda)
- All Python commands run from backend/ directory
- All Node commands run from frontend/ directory

## Database connection
postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas

## Current schema (17 tables)
Core: users, artists, albums, tracks, listening_events
Embeddings: track_embeddings (document_type discriminator: original/scene/sound/behavior/vibe)
Coordinates: track_coordinates (2D viz), track_cluster_coordinates (15D clustering)
Clusters: track_clusters (production), cluster_labels, clustering_runs, clustering_assignments
Taxonomy: user_eras
Audio enrichment columns on tracks: bpm, audio_energy, audio_danceability,
  audio_acousticness, audio_liveness, audio_key, getsongbpm_id, audio_features_source
Vibe columns on tracks: vibe_document, vibe_combined_document, vibe_source,
  vibe_generated_at, vibe_edited_at
Document columns on tracks: feature_document, scene_document, sound_document, behavior_document

## Current data
- 9,892 tracks (deduplicated)
- ~2,679 artists
- 20,400+ listening events
- 39,568 embeddings (original + scene + sound + behavior × 9,892 tracks)
- 3 Qdrant collections: tracks_scene, tracks_sound, tracks_behavior
- Production clusters: 171 clusters (run 18), silhouette 0.7378, coherence 7.61
- Top artists: Drake (264), Future (143), Kanye West (131), Gunna (130)

## ML pipeline architecture (critical — do not change)
WRONG (old): embeddings → UMAP 2D → HDBSCAN → track_clusters
CORRECT (current):
  embeddings → UMAP 15D (umap_cluster_pipeline.py) → HDBSCAN → clustering_assignments
  embeddings → UMAP 2D (umap_pipeline.py) → track_coordinates (visualization only)
  promote_run.py → copies winning run's assignments to production track_clusters

## Current production clustering (run 18)
- Document type: scene
- UMAP: n_components=15, n_neighbors=50, min_dist=0.0
- HDBSCAN: min_cluster_size=15, min_samples=5
- Result: 171 clusters, 23.0% noise, silhouette=0.7378, coherence=7.61
- Status: promoted to production track_clusters

## Experiment framework
All clustering experiments are tracked in clustering_runs table.
NEVER overwrite track_clusters directly — always use promote_run.py with confirmation.
Run experiments: uv run python ml/clustering/run_experiment.py --document-type scene --umap-n-neighbors 50 --umap-min-dist 0.0 --hdbscan-min-cluster-size 15 --hdbscan-min-samples 5
Reuse UMAP coords: uv run python ml/clustering/run_experiment.py --reuse-coordinates-from-run <id> --hdbscan-min-cluster-size 10
Compare: uv run python ml/clustering/compare_runs.py
Promote: uv run python ml/clustering/promote_run.py <run_id>
Score: uv run python ml/clustering/score_coherence.py --run-id <id>

## Current phase: ML-2d — Data Enrichment
Goal: Enrich tracks with audio features + LLM vibe descriptions, build combined
vibe document, run final clustering experiment. Clusters are unnamed (intentional)
until final cluster set is locked.

Active work:
1. LLM vibe descriptions — 50-track test next (GPT-4o-mini, ~$0.05)
2. Combined vibe document — after both enrichments complete
3. Final clustering experiment on vibe embeddings
4. Musashi test: Self Care / Saint Pablo / HOUSTONFORNICATION / Do Not Disturb / Nights
   must land in same or adjacent clusters

## Remaining sequence (do not skip ahead)
1. ML-2d complete → lock final cluster set
2. Phase 15 — Recursive clustering (communities → archetypes, 2-level hierarchy)
3. Final naming pass — ONE pass names all communities + archetypes simultaneously
4. Phase 12 — Life era detection
5. Phase 13 — Era labeling + timeline UI
6. Phase 16 — Dual map (scene clusters vs vibe clusters)
7. Phase 17 — Taxonomy browser UI

## Key ML decisions (do not revisit)
- Cluster on 15D UMAP, visualize on 2D UMAP — permanently separated
- Scene document is best standalone clustering signal (silhouette 0.7378)
- Artist dominance problem identified — LLM vibe descriptions + audio features fix it
- Naming happens LAST — clusters stay as integer IDs until final cluster set locked
- Vibe document: NO artist name, NO track title, NO genre labels, NO proper nouns
- One naming pass only — burns API budget once on the final cluster set
- Recursive clustering before naming — taxonomy context improves name quality

## Key product decisions (do not revisit)
- Product framing: "worlds you belong to" — not playlists, not genres
- Copy: use "worlds", "communities", "atlas", "identity", "region" — never "cluster"
- Design: Spotify green #1db954 primary, DM Sans + Playfair Display + JetBrains Mono
- Light theme: #f7f8f5 background
- CSS text colors hardcoded as hex (Tailwind v4 CSS variable conflict)
- Violet #7c6af7 retained as per-archetype accent color (revert point commented in code)
- AI identity summary: PMD/Kingdom Hearts-style second-person prose
- Cluster names: culturally specific (e.g. "Velvet Room Visitor", "Berghain Queue")
  banned words enforced, no generic suffixes

## API keys in backend/.env
- SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET
- SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/auth/callback
- DATABASE_URL=postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas
- QDRANT_URL=http://127.0.0.1:6333
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- LASTFM_API_KEY
- GETSONGBPM_API_KEY (pending registration)

## How to start services
cd C:\Users\aditm\OneDrive\Desktop\Career\Projects\Spotify-Atlas
docker compose up -d
cd backend
uv run uvicorn app.main:app --reload --port 8000

## Hard rules — never violate
- Never use localStorage for tokens
- Never skip Alembic migrations — no raw SQL schema changes
- Never use pip or conda — always uv
- Never use curl in PowerShell — use Invoke-WebRequest
- Never use localhost — always 127.0.0.1
- Never hardcode credentials — always .env
- Never touch track_clusters except via promote_run.py with confirmation
- Never re-run LLM enrichment on tracks where vibe_source = 'human'
- Never add features beyond the current phase