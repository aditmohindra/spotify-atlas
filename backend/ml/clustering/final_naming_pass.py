"""
Final naming pass for Phase 15.
1. Archives existing cluster_labels to cluster_labels_archive
2. Names archetypes (abstract identity labels)
3. Names communities with archetype context (culturally specific)

Usage:
    uv run python ml/clustering/final_naming_pass.py --dry-run   # test 3 clusters
    uv run python ml/clustering/final_naming_pass.py             # full run
"""
import argparse
import json
import os
import sys
import time
from collections import defaultdict

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import (
    ClusterLabel, ClusterLabelArchive,
    ClusterArchetype, CommunityArchetypeAssignment,
    TrackCluster, Track, Artist,
)
from app.services.cluster_naming import get_cluster_data, name_cluster_sync

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

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
# Archive step
# ---------------------------------------------------------------------------

def archive_labels(db, dry_run: bool) -> int:
    existing = db.query(ClusterLabel).all()
    if not existing:
        print("No existing cluster_labels to archive.")
        return 0

    if dry_run:
        print(f"[DRY RUN] Would archive {len(existing)} labels.")
        return len(existing)

    for label in existing:
        archive = ClusterLabelArchive(
            cluster_id=label.cluster_id,
            name=label.name,
            canonical_name=label.canonical_name,
            description=label.description,
            keywords=label.keywords,
            cluster_archetype=label.cluster_archetype,
            label_version=label.label_version or 1,
        )
        db.add(archive)

    db.query(ClusterLabel).delete()
    db.commit()
    print(f"Archived {len(existing)} labels to cluster_labels_archive.")
    return len(existing)


# ---------------------------------------------------------------------------
# Archetype naming
# ---------------------------------------------------------------------------

def get_top_artists_for_cluster(db, cluster_id: int, limit: int = 5) -> list[str]:
    track_ids = [
        r[0] for r in db.query(TrackCluster.track_id)
        .filter(TrackCluster.cluster_id == cluster_id).all()
    ]
    counts: dict[str, int] = defaultdict(int)
    for _, a in (
        db.query(Track, Artist)
        .join(Artist, Track.artist_id == Artist.id)
        .filter(Track.id.in_(track_ids)).all()
    ):
        counts[a.name] += 1
    return [n for n, _ in sorted(counts.items(), key=lambda x: -x[1])[:limit]]


def name_archetype(archetype_id: int, member_cluster_ids: list[int], db) -> dict:
    all_artists: dict[str, int] = defaultdict(int)
    sample_tracks: list[str] = []

    for cid in member_cluster_ids:
        track_ids = [
            r[0] for r in db.query(TrackCluster.track_id)
            .filter(TrackCluster.cluster_id == cid).all()
        ]
        for t, a in (
            db.query(Track, Artist)
            .join(Artist, Track.artist_id == Artist.id)
            .filter(Track.id.in_(track_ids)).all()
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
    text = data["choices"][0]["message"]["content"].strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])
    return json.loads(text)


# ---------------------------------------------------------------------------
# Community naming with archetype context
# ---------------------------------------------------------------------------

def name_community_with_context(
    cluster_id: int,
    archetype_name: str,
    archetype_description: str,
    sibling_top_artists: list[str],
    db,
) -> dict:
    cluster_data = get_cluster_data(cluster_id, db)
    cluster_data["archetype_name"] = archetype_name
    cluster_data["archetype_description"] = archetype_description
    cluster_data["sibling_top_artists"] = sibling_top_artists

    # Prepend archetype context block to the cluster_data so name_cluster_sync
    # sees it via the 'top_artists' and 'moods' keys — we inject a context preamble
    # by temporarily adding it as the first element of top_artists display.
    # We do NOT modify the prompt in cluster_naming.py; instead we annotate the
    # data dict so the caller (this file) can log it.
    context_block = (
        f"\nARCHETYPE CONTEXT:\n"
        f"This community belongs to the \"{archetype_name}\" archetype.\n"
        f"Archetype description: {archetype_description}\n"
        f"Other communities in this archetype include artists like: "
        f"{', '.join(sibling_top_artists[:8])}\n"
        f"Use this context to make the name feel like it belongs to a broader cultural family.\n"
    )
    # Inject context into moods so it flows through name_cluster_sync's prompt
    original_moods = cluster_data.get("moods", [])
    cluster_data["moods"] = [context_block] + original_moods

    result = name_cluster_sync(cluster_data)
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Final naming pass — Phase 15.")
    parser.add_argument("--dry-run", action="store_true", help="Test on 3 clusters, no DB writes.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        # --- Verify archetypes exist ---
        assignments = db.query(CommunityArchetypeAssignment).all()
        if not assignments:
            print("ERROR: community_archetype_assignments is empty.")
            print("Run: uv run python ml/clustering/archetype_clustering.py --promote <method> <k>")
            sys.exit(1)

        archetype_to_clusters: dict[int, list[int]] = defaultdict(list)
        for a in assignments:
            archetype_to_clusters[a.archetype_id].append(a.cluster_id)

        print(
            f"Found {len(assignments)} community assignments across "
            f"{len(archetype_to_clusters)} archetypes."
        )

        # --- Archive existing labels ---
        archive_labels(db, dry_run=args.dry_run)

        # --- Name archetypes ---
        archetype_names: dict[int, str] = {}
        archetype_descriptions: dict[int, str] = {}

        arch_ids = sorted(archetype_to_clusters.keys())
        if args.dry_run:
            arch_ids = arch_ids[:1]

        print(f"\nNaming {len(arch_ids)} archetypes...")
        for arch_id in arch_ids:
            members = archetype_to_clusters[arch_id]
            print(f"  Archetype {arch_id} ({len(members)} communities)...", end=" ", flush=True)
            try:
                result = name_archetype(arch_id, members, db)
                name = result["name"]
                desc = result["description"]
                archetype_names[arch_id] = name
                archetype_descriptions[arch_id] = desc
                print(f'"{name}"')

                if not args.dry_run:
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

        # --- Name communities ---
        all_cluster_ids = [a.cluster_id for a in assignments]
        if args.dry_run:
            all_cluster_ids = all_cluster_ids[:2]

        print(f"\nNaming {len(all_cluster_ids)} communities with archetype context...")
        named = 0
        failed = 0

        # Build sibling lookup: for each cluster, get top artists from OTHER clusters in same archetype
        sibling_artists_cache: dict[int, list[str]] = {}
        for arch_id, members in archetype_to_clusters.items():
            for cid in members:
                siblings = [c for c in members if c != cid]
                sibling_artist_counts: dict[str, int] = defaultdict(int)
                for scid in siblings[:6]:
                    for a in get_top_artists_for_cluster(db, scid, limit=3):
                        sibling_artist_counts[a] += 1
                sibling_artists_cache[cid] = [
                    a for a, _ in sorted(sibling_artist_counts.items(), key=lambda x: -x[1])[:8]
                ]

        for cluster_id in all_cluster_ids:
            arch_id = next(
                a.archetype_id for a in assignments if a.cluster_id == cluster_id
            )
            arch_name = archetype_names.get(arch_id, f"Archetype {arch_id}")
            arch_desc = archetype_descriptions.get(arch_id, "")
            siblings = sibling_artists_cache.get(cluster_id, [])

            try:
                result = name_community_with_context(
                    cluster_id, arch_name, arch_desc, siblings, db
                )
                display = result["display_name"]
                canonical = result.get("canonical_name", "")
                named += 1
                print(
                    f"  [{named}/{len(all_cluster_ids)}] "
                    f"cluster {cluster_id} [{arch_name}]: "
                    f"{display} / {canonical}"
                )

                if not args.dry_run:
                    label = ClusterLabel(
                        cluster_id=cluster_id,
                        name=display,
                        canonical_name=canonical,
                        description=result.get("description", ""),
                        keywords=result.get("keywords", []),
                        cluster_archetype=arch_name,
                        label_version=2,
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
            print("No DB writes performed.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
