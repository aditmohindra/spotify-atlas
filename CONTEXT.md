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
backend/app/api/
  - health.py                      → GET /health
  - auth.py                        → GET /auth/login, /auth/callback, POST /auth/refresh, GET /auth/me
  - ingest.py                      → POST /ingest, /ingest/enrich-artists-lastfm, GET /ingest/status
  - features.py                    → POST /features/engineer, GET /features/status, /features/sample
  - clusters.py                    → GET /clusters/{id}/detail?layer=, /clusters/{id}/related?layer=, /clusters/archetypes?layer=
  - map.py                         → GET /galaxy?layer=vibe|scene (primary), GET /map (legacy)
  - profile.py                     → GET /profile/taste?layer=, GET /profile/summary
  - embeddings.py                  → POST /embed
  - qdrant.py                      → Qdrant similarity search endpoints
backend/app/services/
  - cluster_naming.py              → GPT-4o cluster naming, FILLER_SUFFIXES validator, diversity guard
  - cluster_relations.py           → Cluster centroid similarity (layer-aware)
  - archetype_generation.py        → Archetype generation
backend/ml/
  - clustering/
    - hdbscan_pipeline.py
    - umap_cluster_pipeline.py
    - run_experiment.py
    - promote_run.py
    - final_naming_pass.py         → --layer vibe|scene --resume, forbidden pool, cross-layer dedup
    - apply_name_fixes.py          → targeted rename script
    - soft_noise_assignment.py     → --threshold 0.85
    - fix_duplicate_names.py       → duplicate name cleanup
  - visualization/
    - umap_pipeline.py             → scene 2D coords → track_coordinates
    - umap_vibe_pipeline.py        → vibe 2D coords → track_vibe_coordinates

## Environment
- OS: Windows (PowerShell — use Invoke-WebRequest not curl)
- PostgreSQL runs on port 5433 (not 5432)
- Qdrant runs on port 6333
- Backend runs on port 8000
- Frontend runs on port 3000
- Use 127.0.0.1 not localhost (IPv6 conflict on Windows)
- uv for Python package management (never pip or conda)
- All Python commands run from backend/ directory
- All Node commands run from frontend/ directory

## Database connection
postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas

## Schema (key tables)
Core: users, artists, albums, tracks, listening_events
Embeddings: track_embeddings (document_type: original/scene/sound/behavior/vibe)
Coordinates:
  - track_coordinates        → scene 2D (visualization)
  - track_vibe_coordinates   → vibe 2D (visualization)
  - track_cluster_coordinates → 15D clustering space
Clusters:
  - track_clusters           → production scene assignments (Run 18, 171 communities)
  - clustering_assignments   → all run assignments (run_id=18 scene, run_id=29 vibe)
  - clustering_runs          → experiment metadata, cluster_layer column
  - cluster_labels           → unique on (cluster_id, cluster_layer) — both layers live here
  - cluster_labels_archive   → backup
  - cluster_centroids        → scene centroids (raw 1536D + umap15D + map2D)
  - vibe_cluster_centroids   → vibe centroids
  - cluster_archetypes       → 10 archetype definitions
  - community_archetype_assignments → cluster → archetype mapping
Taxonomy: user_eras (Phase 12, not yet built)

## Dual-layer architecture (CRITICAL)
Two independent clustering layers coexist:

SCENE layer (primary/Cultural Atlas):
  - Run 18, 171 communities
  - Assignments: track_clusters (production) OR clustering_assignments WHERE run_id=18
  - Coordinates: track_coordinates
  - Labels: cluster_labels WHERE cluster_layer='scene'
  - Centroids: cluster_centroids

VIBE layer (default/Vibe Atlas):
  - Run 29, 102 communities
  - Assignments: clustering_assignments WHERE run_id=29
  - Coordinates: track_vibe_coordinates
  - Labels: cluster_labels WHERE cluster_layer='vibe'
  - Centroids: vibe_cluster_centroids
  - Noise assignment: soft_noise_assignment.py (hard/soft/between_worlds)

ALL endpoints accept ?layer=vibe|scene, default='vibe':
  GET /galaxy?layer=vibe          → vibe coords + vibe labels (DEFAULT)
  GET /galaxy?layer=scene         → scene coords + scene labels
  GET /clusters/{id}/detail?layer=vibe
  GET /clusters/{id}/related?layer=vibe
  GET /clusters/archetypes?layer=vibe
  GET /profile/taste?layer=vibe

## Current data
- 9,892 tracks (deduplicated)
- ~2,679 artists
- 20,400+ listening events
- Vibe noise assignment: 8,153 hard + 1,692 soft + 47 between_worlds
- 273 total community names (102 vibe + 171 scene)
- 12 identity archetypes (manually curated, both layers)

## Identity archetypes (12 total)
These are the ONLY valid archetype names. Both layers use the same set.
Trap Dynasty, Festival Regular, Terminally Online, Late Night Romantic,
Indie Main Character, Rap Canon Devotee, K-Pop Citizen, Side Quest Soul,
Lo-Fi Otaku, Desi Household, Anime Passport, Club Circuit

ARCHETYPE_COLORS in hooks/useMapData.ts must match these exactly.

## Community naming standards
Names are cultural passwords, not genre labels. Good examples:
  Vibe: Rapp Snitch Knishes, OVOXO, Dearly Beloved, Animal Crossing at 8PM,
        Subwoofer Lullaby, U8 Hermannplatz, Frank's Blonded Radio, Glock 19,
        Velvet Room Visitor, Magic City Mondays
  Scene: Harlem Renaissance, Chipmunk Soul, Berghain Queue, Traverse Town,
         Hyrule Melodies, Dreamville, October's Very Own, Dipset Diplomats

FILLER_SUFFIXES enforced: Anthem, Vibe, Wave, Chronicles, Odyssey, Dreamscape,
  Realm, Nexus, Vault, Matrix, Pulse, Echo, Aesthetic, Lore, Files, Archive,
  Tape, Tribute, Session

## ML pipeline architecture (do not change)
WRONG (old): embeddings → UMAP 2D → HDBSCAN
CORRECT:
  embeddings → UMAP 15D → HDBSCAN → clustering_assignments
  embeddings → UMAP 2D → track_coordinates / track_vibe_coordinates (viz only)
  promote_run.py → copies winning run to track_clusters

## Galaxy API (_CACHE_TTL_SECONDS)
Currently set to 0 (debugging). Reset to 300 after any cache-sensitive work.
File: backend/app/api/map.py line ~13

## Rarity thresholds (atlas-wide track_count, not user track count)
< 50    → Extremely Rare
< 200   → Rare
< 500   → Niche
< 1500  → Underground
else    → Core

## Frontend layer wiring
- Default layer: 'vibe' everywhere
- MapWrapper.tsx holds layer state, passes to GalaxyMap
- useMapData(layer) fetches /galaxy?layer=${layer}
- All community/profile API calls pass layer='vibe' by default
- GalaxyMap: layer toggle bottom-left ("Vibe Atlas" / "Cultural Atlas")
- Layer switch resets transform + clears all filters

## Key product decisions (do not revisit)
- Vibe layer is PRIMARY — all pages default to vibe
- Product framing: "worlds you belong to" — not playlists, not genres
- Copy: use "worlds", "communities", "atlas", "identity", "region" — never "cluster"
- Design: Spotify green #1db954 primary, DM Sans + Playfair Display + JetBrains Mono
- Light theme: #f7f8f5 background
- CSS text colors hardcoded as hex (Tailwind v4 CSS variable conflict)
- AI identity summary: PMD/Kingdom Hearts-style second-person prose
- Between Worlds tracks (47): cluster_id=-1, shown as "Between Worlds" community

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
- Never name clusters before the final cluster set is locked
- _CACHE_TTL_SECONDS = 300 in production (set to 0 only for debugging)
- All endpoints default to layer='vibe' — never default to scene