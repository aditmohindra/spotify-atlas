"""
Final naming pass for Phase 15.
1. Archives existing cluster_labels for the target layer to cluster_labels_archive
2. Names archetypes (abstract identity labels) — scene layer only
3. Names communities with archetype context (culturally specific)

Usage:
    uv run python ml/clustering/final_naming_pass.py --layer scene          # full scene run (default)
    uv run python ml/clustering/final_naming_pass.py --layer vibe           # full vibe run
    uv run python ml/clustering/final_naming_pass.py --layer scene --dry-run
    uv run python ml/clustering/final_naming_pass.py --layer vibe --dry-run
"""
import argparse
import json
import os
import sys
import time
from collections import defaultdict

import httpx
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import (
    ClusterLabel, ClusterLabelArchive,
    ClusterArchetype, CommunityArchetypeAssignment,
    TrackCluster, ClusteringAssignment, Track, Artist,
)
from app.services.cluster_naming import get_cluster_data, name_cluster_sync

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Per-layer config: source_run_id written to cluster_labels, run_id used to
# load assignments (None = read from track_clusters).
LAYER_CONFIG = {
    'scene': {'source_run_id': 18, 'run_id': None},
    'vibe':  {'source_run_id': 29, 'run_id': 29},
}

DRY_RUN_CLUSTERS = {
    'scene': [22, 102, 111, 0, 35],
    'vibe':  [35, 47, 71, 89, 21],
}

ARCHETYPE_PROMPT = """\
You are naming a meta-identity archetype for a personal music atlas.

This archetype contains {n_communities} music communities. Combined top artists:
{top_artists}

Sample community top tracks:
{sample_tracks}

Name this archetype as an abstract identity label — NOT a genre bucket.
Think: what kind of person listens to all of these? What identity do they share?

Good archetype names: "Festival Regular", "Terminally Online", "Lo-Fi Otaku",
"Desi Household", "Toronto Winter Arc", "The Trap", "Nostalgic Club Kid"

Bad archetype names: "Electronic Music Fan", "Hip-Hop Listener", "Diverse Tastes"

Return ONLY valid JSON:
{{
    "name": "2-3 word identity label",
    "description": "One sentence describing this listener archetype"
}}"""


# ---------------------------------------------------------------------------
# Cluster data loading — supports both TrackCluster and ClusteringAssignment
# ---------------------------------------------------------------------------

def get_cluster_data_for_run(cluster_id: int, run_id: int, db) -> dict:
    """Like get_cluster_data but reads track_ids from clustering_assignments for run_id."""
    track_ids = [
        r[0] for r in db.query(ClusteringAssignment.track_id)
        .filter(
            ClusteringAssignment.run_id == run_id,
            ClusteringAssignment.cluster_id == cluster_id,
        )
        .all()
    ]

    tracks_with_artists = (
        db.query(Track, Artist)
        .join(Artist, Track.artist_id == Artist.id)
        .filter(Track.id.in_(track_ids))
        .all()
    )

    artist_counts: dict[str, int] = defaultdict(int)
    genres: set[str] = set()
    moods: set[str] = set()
    track_names: list[str] = []

    for track, artist in tracks_with_artists:
        artist_counts[artist.name] += 1
        track_names.append(track.name)
        if artist.genres:
            for g in artist.genres:
                genres.add(g)
        if track.feature_document:
            for line in track.feature_document.split("\n"):
                if line.startswith("Moods:"):
                    for tag in [t.strip() for t in line[7:].split(",")][:4]:
                        moods.add(tag)

    top_artists = sorted(artist_counts.items(), key=lambda x: x[1], reverse=True)[:8]

    return {
        "cluster_id": cluster_id,
        "track_count": len(track_ids),
        "top_artists": [a for a, _ in top_artists],
        "top_tracks": track_names[:10],
        "genres": list(genres)[:15],
        "moods": list(moods)[:15],
    }


def _get_cluster_data(cluster_id: int, run_id: int | None, db) -> dict:
    """Dispatch to the right data loader based on run_id."""
    if run_id is not None:
        return get_cluster_data_for_run(cluster_id, run_id, db)
    return get_cluster_data(cluster_id, db)


def _get_cluster_ids_for_layer(run_id: int | None, db) -> list[int]:
    """Return all non-noise cluster_ids for this layer."""
    if run_id is not None:
        return sorted(set(
            r[0] for r in db.query(ClusteringAssignment.cluster_id)
            .filter(
                ClusteringAssignment.run_id == run_id,
                ClusteringAssignment.cluster_id != -1,
            )
            .distinct()
            .all()
        ))
    return sorted(set(
        r[0] for r in db.query(TrackCluster.cluster_id)
        .filter(TrackCluster.cluster_id != -1)
        .distinct()
        .all()
    ))


# ---------------------------------------------------------------------------
# Archive step — scoped to the layer being named
# ---------------------------------------------------------------------------

def archive_labels(db, layer: str, dry_run: bool) -> int:
    existing = db.query(ClusterLabel).filter(ClusterLabel.cluster_layer == layer).all()
    if not existing:
        print(f"No existing cluster_labels with cluster_layer='{layer}' to archive.")
        return 0

    if dry_run:
        print(f"[DRY RUN] Would archive {len(existing)} labels (layer={layer}).")
        return len(existing)

    # Archive first, then delete
    for label in existing:
        archive = ClusterLabelArchive(
            cluster_id=label.cluster_id,
            name=label.name,
            canonical_name=label.canonical_name,
            description=label.description,
            keywords=label.keywords,
            cluster_archetype=label.cluster_archetype,
            label_version=label.label_version or 1,
            source_run_id=label.source_run_id,
            cluster_layer=label.cluster_layer,
        )
        db.add(archive)
    db.flush()

    db.query(ClusterLabel).filter(ClusterLabel.cluster_layer == layer).delete()
    db.commit()
    print(f"Archived {len(existing)} labels (layer='{layer}') to cluster_labels_archive.")
    return len(existing)


# ---------------------------------------------------------------------------
# Archetype helpers
# ---------------------------------------------------------------------------

def get_top_artists_for_cluster(db, cluster_id: int, run_id: int | None, limit: int = 5) -> list[str]:
    if run_id is not None:
        track_ids = [
            r[0] for r in db.query(ClusteringAssignment.track_id)
            .filter(
                ClusteringAssignment.run_id == run_id,
                ClusteringAssignment.cluster_id == cluster_id,
            )
            .all()
        ]
    else:
        track_ids = [
            r[0] for r in db.query(TrackCluster.track_id)
            .filter(TrackCluster.cluster_id == cluster_id)
            .all()
        ]

    counts: dict[str, int] = defaultdict(int)
    for _, a in (
        db.query(Track, Artist)
        .join(Artist, Track.artist_id == Artist.id)
        .filter(Track.id.in_(track_ids))
        .all()
    ):
        counts[a.name] += 1
    return [n for n, _ in sorted(counts.items(), key=lambda x: -x[1])[:limit]]


def name_archetype(archetype_id: int, member_cluster_ids: list[int], run_id: int | None, db) -> dict:
    all_artists: dict[str, int] = defaultdict(int)
    sample_tracks: list[str] = []

    for cid in member_cluster_ids:
        if run_id is not None:
            track_ids = [
                r[0] for r in db.query(ClusteringAssignment.track_id)
                .filter(
                    ClusteringAssignment.run_id == run_id,
                    ClusteringAssignment.cluster_id == cid,
                )
                .all()
            ]
        else:
            track_ids = [
                r[0] for r in db.query(TrackCluster.track_id)
                .filter(TrackCluster.cluster_id == cid)
                .all()
            ]

        for t, a in (
            db.query(Track, Artist)
            .join(Artist, Track.artist_id == Artist.id)
            .filter(Track.id.in_(track_ids))
            .all()
        ):
            all_artists[a.name] += 1
            if len(sample_tracks) < 20:
                sample_tracks.append(t.name)

    top_artists_str = ", ".join(
        a for a, _ in sorted(all_artists.items(), key=lambda x: -x[1])[:20]
    )
    tracks_str = ", ".join(sample_tracks[:15])

    prompt = ARCHETYPE_PROMPT.format(
        n_communities=len(member_cluster_ids),
        top_artists=top_artists_str,
        sample_tracks=tracks_str,
    )

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 200,
            "temperature": 0.9,
        },
        timeout=30.0,
    )
    data = response.json()
    raw = data["choices"][0]["message"]["content"].strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1])
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Community naming with archetype context
# ---------------------------------------------------------------------------

def name_community_with_context(
    cluster_id: int,
    archetype_name: str,
    archetype_description: str,
    sibling_top_artists: list[str],
    run_id: int | None,
    db,
) -> dict:
    cluster_data = _get_cluster_data(cluster_id, run_id, db)
    context_block = (
        f"\nARCHETYPE CONTEXT:\n"
        f"This community belongs to the \"{archetype_name}\" archetype.\n"
        f"Archetype description: {archetype_description}\n"
        f"Other communities in this archetype include artists like: "
        f"{', '.join(sibling_top_artists[:8])}\n"
        f"Use this context to make the name feel like it belongs to a broader cultural family.\n"
    )
    cluster_data["moods"] = [context_block] + cluster_data.get("moods", [])
    return name_cluster_sync(cluster_data)


# ---------------------------------------------------------------------------
# Dry-run printer
# ---------------------------------------------------------------------------

def print_dry_run_results(results: list[dict]):
    print()
    header = f"{'cluster_id':>10} | {'display_name':<30} | {'canonical_name':<35} | {'password':<25} | description"
    print(header)
    print("-" * len(header))
    for r in results:
        cid    = str(r.get("cluster_id", "?"))
        name   = r.get("display_name", "")[:30]
        canon  = r.get("canonical_name", "")[:35]
        pw     = r.get("password", "")[:25]
        desc   = r.get("description", "")
        print(f"{cid:>10} | {name:<30} | {canon:<35} | {pw:<25} | {desc}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Final naming pass — Phase 15.")
    parser.add_argument(
        "--layer",
        choices=["scene", "vibe"],
        default="scene",
        help="Which cluster layer to name (default: scene).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process 5 diverse clusters without writing to DB.",
    )
    args = parser.parse_args()

    layer = args.layer
    cfg = LAYER_CONFIG[layer]
    source_run_id = cfg["source_run_id"]
    run_id = cfg["run_id"]

    print(f"Layer: {layer}  |  source_run_id: {source_run_id}  |  run_id: {run_id or 'track_clusters'}")

    db = SessionLocal()
    try:
        # --- Verify archetype assignments (optional for vibe layer) ---
        assignments = db.query(CommunityArchetypeAssignment).all()
        has_archetypes = bool(assignments)

        archetype_to_clusters: dict[int, list[int]] = defaultdict(list)
        if has_archetypes:
            for a in assignments:
                archetype_to_clusters[a.archetype_id].append(a.cluster_id)
            print(
                f"Found {len(assignments)} community assignments across "
                f"{len(archetype_to_clusters)} archetypes."
            )
        else:
            print("No archetype assignments found — skipping archetype naming step.")

        # --- Archive existing labels for this layer ---
        archive_labels(db, layer=layer, dry_run=args.dry_run)

        # --- Determine cluster IDs to name ---
        if args.dry_run:
            all_cluster_ids = DRY_RUN_CLUSTERS[layer]
            print(f"\n[DRY RUN] Processing {len(all_cluster_ids)} clusters: {all_cluster_ids}")
        else:
            all_cluster_ids = _get_cluster_ids_for_layer(run_id, db)
            print(f"\nFound {len(all_cluster_ids)} clusters to name (layer={layer})")

        # --- Name archetypes (scene layer / when archetypes exist) ---
        archetype_names: dict[int, str] = {}
        archetype_descriptions: dict[int, str] = {}

        if has_archetypes and not args.dry_run:
            arch_ids = sorted(archetype_to_clusters.keys())
            print(f"\nNaming {len(arch_ids)} archetypes...")
            for arch_id in arch_ids:
                members = archetype_to_clusters[arch_id]
                print(f"  Archetype {arch_id} ({len(members)} communities)...", end=" ", flush=True)
                try:
                    result = name_archetype(arch_id, members, run_id, db)
                    name = result["name"]
                    desc = result["description"]
                    archetype_names[arch_id] = name
                    archetype_descriptions[arch_id] = desc
                    print(f'"{name}"')

                    row = db.query(ClusterArchetype).filter(
                        ClusterArchetype.archetype_id == arch_id
                    ).first()
                    if row:
                        row.name = name
                        row.description = desc
                    db.commit()
                    time.sleep(0.5)
                except Exception as e:
                    print(f"FAILED — {e}")
                    archetype_names[arch_id] = f"Archetype {arch_id}"
                    archetype_descriptions[arch_id] = ""

        # --- Build sibling artist cache ---
        sibling_artists_cache: dict[int, list[str]] = {}
        if has_archetypes:
            for arch_id, members in archetype_to_clusters.items():
                for cid in members:
                    siblings = [c for c in members if c != cid]
                    sibling_artist_counts: dict[str, int] = defaultdict(int)
                    for scid in siblings[:6]:
                        for a in get_top_artists_for_cluster(db, scid, run_id, limit=3):
                            sibling_artist_counts[a] += 1
                    sibling_artists_cache[cid] = [
                        a for a, _ in sorted(sibling_artist_counts.items(), key=lambda x: -x[1])[:8]
                    ]

        # --- Name communities ---
        print(f"\nNaming {len(all_cluster_ids)} communities...")
        named = 0
        failed = 0
        dry_run_results: list[dict] = []

        for cluster_id in all_cluster_ids:
            # Archetype context (best-effort)
            arch_name = "Unknown"
            arch_desc = ""
            if has_archetypes:
                matched = next(
                    (a for a in assignments if a.cluster_id == cluster_id), None
                )
                if matched:
                    arch_name = archetype_names.get(matched.archetype_id, f"Archetype {matched.archetype_id}")
                    arch_desc = archetype_descriptions.get(matched.archetype_id, "")
            siblings = sibling_artists_cache.get(cluster_id, [])

            try:
                result = name_community_with_context(
                    cluster_id, arch_name, arch_desc, siblings, run_id, db
                )
                display  = result["display_name"]
                canonical = result.get("canonical_name", "")
                named += 1

                print(
                    f"  [{named}/{len(all_cluster_ids)}] "
                    f"cluster {cluster_id}: {display} / {canonical}"
                )

                if args.dry_run:
                    dry_run_results.append({
                        "cluster_id":    cluster_id,
                        "display_name":  display,
                        "canonical_name": canonical,
                        "password":      result.get("password", ""),
                        "description":   result.get("description", ""),
                    })
                else:
                    label = ClusterLabel(
                        cluster_id=cluster_id,
                        name=display,
                        canonical_name=canonical,
                        description=result.get("description", ""),
                        keywords=result.get("keywords", []),
                        cluster_archetype=arch_name,
                        label_version=2,
                        source_run_id=source_run_id,
                        cluster_layer=layer,
                    )
                    db.add(label)
                    db.commit()

                time.sleep(0.5)

            except Exception as e:
                failed += 1
                print(f"  FAILED cluster {cluster_id}: {e}")
                if not args.dry_run:
                    db.rollback()

        print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Naming complete: {named} named, {failed} failed")

        if args.dry_run:
            print_dry_run_results(dry_run_results)
            print("\nNo DB writes performed.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
