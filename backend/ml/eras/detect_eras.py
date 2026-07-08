"""
Life era detection from dated listening events + vibe embeddings.

Two source presets, selected via --source:
    discovery (default) - saved_tracks + recently_played. Excludes
        top_long_term / top_medium_term / top_short_term fake timestamps.
    listening - extended_history only (Spotify's official streaming
        history export; real played_at + ms_played per play).

Boundary detection uses relative statistics: a month-pair is a boundary when
its cosine similarity falls below (mean - std_multiplier * std_dev) across
the full similarity curve.

Usage:
    uv run python ml/eras/detect_eras.py --dry-run
    uv run python ml/eras/detect_eras.py --dry-run --std-multiplier 1.5
    uv run python ml/eras/detect_eras.py --dry-run --recursive-split
    uv run python ml/eras/detect_eras.py --dry-run --source listening
    uv run python ml/eras/detect_eras.py --user-id 1
"""
import argparse
import calendar
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime

import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from app.models.models import (
    ClusterLabel,
    ClusteringAssignment,
    EraLabel,
    ListeningEvent,
    TrackEmbedding,
    UserEra,
)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

SOURCE_PRESETS = {
    'discovery': ('saved_tracks', 'recently_played'),
    'listening': ('extended_history',),
}
DEFAULT_SOURCE = 'discovery'
VIBE_RUN_ID = 29
DEFAULT_STD_MULTIPLIER = 1.0
DEFAULT_MIN_EVENTS_PER_MONTH = 3
DEFAULT_MIN_ERA_EVENTS = 50
DEFAULT_MAX_ERA_MONTHS = 24
DEFAULT_MAX_ERA_EVENTS = 1000
MAX_RECURSIVE_SPLIT_PASSES = 3
DEFAULT_USER_ID = 1


def _int_to_roman(n: int) -> str:
    vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"]
    result = ""
    for val, sym in zip(vals, syms):
        count, n = divmod(n, val)
        result += sym * count
    return result


def _default_era_title(era_number: int) -> str:
    return f"Era {_int_to_roman(era_number)}"


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def month_key(dt: datetime) -> tuple[int, int]:
    return (dt.year, dt.month)


def format_month(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def first_day(year: int, month: int) -> datetime:
    return datetime(year, month, 1)


def last_day(year: int, month: int) -> datetime:
    last = calendar.monthrange(year, month)[1]
    return datetime(year, month, last, 23, 59, 59)


def load_reliable_events(db, user_id: int, sources: tuple[str, ...]) -> list[tuple[int, datetime]]:
    rows = (
        db.query(ListeningEvent.track_id, ListeningEvent.played_at)
        .filter(
            ListeningEvent.user_id == user_id,
            ListeningEvent.source.in_(sources),
            ListeningEvent.played_at.isnot(None),
        )
        .all()
    )
    return [(r[0], r[1]) for r in rows if r[1] is not None]


def load_vibe_embeddings(db, track_ids: set[int]) -> dict[int, np.ndarray]:
    if not track_ids:
        return {}
    rows = (
        db.query(TrackEmbedding.track_id, TrackEmbedding.vector)
        .filter(
            TrackEmbedding.track_id.in_(track_ids),
            TrackEmbedding.document_type == 'vibe',
        )
        .all()
    )
    return {r[0]: np.array(r[1], dtype=np.float64) for r in rows}


def load_cluster_names(db) -> dict[int, str]:
    rows = (
        db.query(ClusterLabel.cluster_id, ClusterLabel.name)
        .filter(ClusterLabel.cluster_layer == 'vibe')
        .all()
    )
    return {r[0]: r[1] for r in rows}


def load_track_clusters(db, track_ids: set[int]) -> dict[int, int]:
    if not track_ids:
        return {}
    rows = (
        db.query(ClusteringAssignment.track_id, ClusteringAssignment.cluster_id)
        .filter(
            ClusteringAssignment.run_id == VIBE_RUN_ID,
            ClusteringAssignment.track_id.in_(track_ids),
        )
        .all()
    )
    return {r[0]: r[1] for r in rows}


def compute_month_centroids(
    db,
    events: list[tuple[int, datetime]],
    min_events_per_month: int,
) -> tuple[list[tuple[int, int]], dict[tuple[int, int], np.ndarray], dict[tuple[int, int], list[tuple[int, datetime]]]]:
    """Return qualifying months, their centroids, and raw events per month."""
    by_month: dict[tuple[int, int], list[tuple[int, datetime]]] = defaultdict(list)
    for track_id, played_at in events:
        by_month[month_key(played_at)].append((track_id, played_at))

    qualifying = sorted(
        m for m, evts in by_month.items() if len(evts) >= min_events_per_month
    )

    all_track_ids = {tid for m in qualifying for tid, _ in by_month[m]}
    embeddings = load_vibe_embeddings(db, all_track_ids)

    centroids: dict[tuple[int, int], np.ndarray] = {}
    for m in qualifying:
        track_ids = {tid for tid, _ in by_month[m]}
        vecs = [embeddings[tid] for tid in track_ids if tid in embeddings]
        if not vecs:
            continue
        centroids[m] = np.mean(np.stack(vecs), axis=0)

    qualifying = [m for m in qualifying if m in centroids]
    month_events = {m: by_month[m] for m in qualifying}
    return qualifying, centroids, month_events


def detect_boundaries(
    months: list[tuple[int, int]],
    centroids: dict[tuple[int, int], np.ndarray],
    std_multiplier: float,
) -> tuple[list[int], list[tuple[str, float, bool]], dict[str, float]]:
    """
    Return boundary indices (after month[i]), similarity log entries, and stats.
    Each log entry: (label, similarity, is_boundary).
    """
    labels: list[str] = []
    scores: list[float] = []

    for i in range(len(months) - 1):
        m_a, m_b = months[i], months[i + 1]
        sim = cosine_similarity(centroids[m_a], centroids[m_b])
        labels.append(f"{format_month(*m_a)} -> {format_month(*m_b)}")
        scores.append(sim)

    if not scores:
        return [], [], {'mean': 0.0, 'std_dev': 0.0, 'cutoff': 0.0}

    mean_sim = float(np.mean(scores))
    std_dev = float(np.std(scores))
    cutoff = mean_sim - std_multiplier * std_dev

    boundaries: list[int] = []
    similarities: list[tuple[str, float, bool]] = []
    for i, (label, sim) in enumerate(zip(labels, scores)):
        is_boundary = sim < cutoff
        similarities.append((label, sim, is_boundary))
        if is_boundary:
            boundaries.append(i)

    stats = {'mean': mean_sim, 'std_dev': std_dev, 'cutoff': cutoff}
    return boundaries, similarities, stats


def group_eras(
    months: list[tuple[int, int]],
    boundaries: list[int],
    month_events: dict[tuple[int, int], list[tuple[int, datetime]]],
    centroids: dict[tuple[int, int], np.ndarray],
) -> list[dict]:
    """Split months into eras at boundary indices."""
    if not months:
        return []

    split_points = boundaries + [len(months) - 1]
    eras = []
    start_idx = 0

    for end_idx in split_points:
        era_months = months[start_idx:end_idx + 1]
        if not era_months:
            continue

        all_events = [e for m in era_months for e in month_events[m]]
        era_centroid = np.mean(
            np.stack([centroids[m] for m in era_months]), axis=0
        )

        eras.append({
            'months': era_months,
            'start_date': first_day(*era_months[0]),
            'end_date': last_day(*era_months[-1]),
            'event_count': len(all_events),
            'events': all_events,
            'centroid_vector': era_centroid.tolist(),
        })
        start_idx = end_idx + 1

    return eras


def dominant_clusters_for_era(
    events: list[tuple[int, datetime]],
    track_clusters: dict[int, int],
    top_n: int = 3,
) -> list[int]:
    counts: Counter[int] = Counter()
    for track_id, _ in events:
        cid = track_clusters.get(track_id)
        if cid is not None and cid != -1:
            counts[cid] += 1
    return [cid for cid, _ in counts.most_common(top_n)]


def format_era_range(era: dict) -> str:
    start_m = format_month(*era['months'][0])
    end_m = format_month(*era['months'][-1])
    return f"{start_m} to {end_m}"


def merge_two_eras(earlier: dict, later: dict) -> dict:
    """Merge two chronologically adjacent eras; centroid is event-weighted mean."""
    count_a = earlier['event_count']
    count_b = later['event_count']
    centroid_a = np.array(earlier['centroid_vector'], dtype=np.float64)
    centroid_b = np.array(later['centroid_vector'], dtype=np.float64)
    weighted = (count_a * centroid_a + count_b * centroid_b) / (count_a + count_b)

    return {
        'months': earlier['months'] + later['months'],
        'start_date': earlier['start_date'],
        'end_date': later['end_date'],
        'event_count': count_a + count_b,
        'events': earlier['events'] + later['events'],
        'centroid_vector': weighted.tolist(),
    }


def merge_small_eras(
    eras: list[dict],
    min_era_events: int,
    max_passes: int = 2,
) -> tuple[list[dict], list[str]]:
    """Merge eras below min_era_events into the most similar adjacent neighbor."""
    eras = [dict(e) for e in eras]
    merge_log: list[str] = []

    for pass_num in range(1, max_passes + 1):
        pass_merges = 0
        i = 0
        while i < len(eras):
            if eras[i]['event_count'] >= min_era_events or len(eras) == 1:
                i += 1
                continue

            small = eras[i]
            small_centroid = np.array(small['centroid_vector'], dtype=np.float64)
            small_label = (
                f"Era {i + 1} ({small['event_count']} events, {format_era_range(small)})"
            )

            prev_sim = next_sim = None
            if i > 0:
                prev_centroid = np.array(eras[i - 1]['centroid_vector'], dtype=np.float64)
                prev_sim = cosine_similarity(small_centroid, prev_centroid)
            if i < len(eras) - 1:
                next_centroid = np.array(eras[i + 1]['centroid_vector'], dtype=np.float64)
                next_sim = cosine_similarity(small_centroid, next_centroid)

            if prev_sim is not None and next_sim is not None:
                if prev_sim >= next_sim:
                    target_idx = i - 1
                    direction = 'previous'
                    sim = prev_sim
                else:
                    target_idx = i + 1
                    direction = 'next'
                    sim = next_sim
            elif prev_sim is not None:
                target_idx = i - 1
                direction = 'previous'
                sim = prev_sim
            else:
                target_idx = i + 1
                direction = 'next'
                sim = next_sim

            target = eras[target_idx]
            target_label = (
                f"Era {target_idx + 1} ({target['event_count']} events, "
                f"{format_era_range(target)})"
            )

            if target_idx < i:
                eras[target_idx] = merge_two_eras(target, small)
                eras.pop(i)
            else:
                eras[target_idx] = merge_two_eras(small, target)
                eras.pop(i)

            merge_log.append(
                f"Pass {pass_num}: {small_label} merged into {direction} "
                f"{target_label} (centroid similarity={sim:.4f})"
            )
            pass_merges += 1

        if pass_merges == 0:
            break

    return eras, merge_log


def era_needs_split(era: dict, max_era_months: int, max_era_events: int) -> bool:
    return (
        len(era['months']) > max_era_months
        or era['event_count'] > max_era_events
    )


def split_oversized_era(
    era: dict,
    centroids: dict[tuple[int, int], np.ndarray],
    month_events: dict[tuple[int, int], list[tuple[int, datetime]]],
    std_multiplier: float,
    min_era_events: int,
) -> tuple[list[dict], dict[str, float], list[tuple[str, float, bool]], list[str], bool]:
    """
    Re-run local statistical boundary detection within one era.
    Returns (sub_eras, stats, similarities, merge_log, did_split).
    """
    months = era['months']
    if len(months) < 2:
        return [era], {}, [], [], False

    boundaries, similarities, stats = detect_boundaries(months, centroids, std_multiplier)
    sub_eras = group_eras(months, boundaries, month_events, centroids)

    if len(sub_eras) <= 1:
        return [era], stats, similarities, [], False

    merged_sub, merge_log = merge_small_eras(sub_eras, min_era_events, max_passes=2)

    if len(merged_sub) <= 1:
        return [era], stats, similarities, merge_log, False

    return merged_sub, stats, similarities, merge_log, True


def print_recursive_split_detail(
    era_label: str,
    before: dict,
    after_eras: list[dict],
    cluster_names: dict[int, str],
    stats: dict[str, float],
    similarities: list[tuple[str, float, bool]],
    merge_log: list[str],
    did_split: bool,
) -> None:
    print(f"\n--- Recursive split: {era_label} ---")
    print(
        f"Before: {format_era_range(before)} "
        f"({len(before['months'])} months, {before['event_count']} events)"
    )
    dominant = before.get('dominant_cluster_ids', [])
    if dominant:
        names = [f"[{cid}, {cluster_names.get(cid, 'unknown')}]" for cid in dominant]
        print(f"  Dominant clusters: {', '.join(names)}")

    if stats:
        print(
            f"Local stats: mean={stats['mean']:.4f}, "
            f"std={stats['std_dev']:.4f}, cutoff={stats['cutoff']:.4f}"
        )

    below = [(label, sim) for label, sim, is_b in similarities if is_b]
    if below:
        print("Local month-pairs below cutoff:")
        for label, sim in below:
            print(f"  {label}: {sim:.4f}")
    elif similarities:
        print("Local month-pairs below cutoff: (none)")

    if merge_log:
        print("Sub-era merge actions:")
        for entry in merge_log:
            print(f"  {entry}")

    if did_split:
        print(f"After ({len(after_eras)} sub-eras):")
        for i, sub in enumerate(after_eras, start=1):
            start_m = format_month(*sub['months'][0])
            end_m = format_month(*sub['months'][-1])
            n_months = len(sub['months'])
            print(
                f"  Sub-era {i}: {start_m} to {end_m} "
                f"({n_months} months, {sub['event_count']} events)"
            )
            dom = sub.get('dominant_cluster_ids', [])
            if dom:
                names = [f"[{cid}, {cluster_names.get(cid, 'unknown')}]" for cid in dom]
                print(f"    Dominant clusters: {', '.join(names)}")
    else:
        print("After: unchanged (no genuine sub-boundaries survived merge)")


def apply_recursive_splits(
    eras: list[dict],
    centroids: dict[tuple[int, int], np.ndarray],
    month_events: dict[tuple[int, int], list[tuple[int, datetime]]],
    cluster_names: dict[int, str],
    track_clusters: dict[int, int],
    std_multiplier: float,
    min_era_events: int,
    max_era_months: int,
    max_era_events: int,
) -> list[dict]:
    """Cascade-split oversized eras, re-checking sub-eras each pass (max 3 passes)."""
    current = [dict(e) for e in eras]

    for pass_num in range(1, MAX_RECURSIVE_SPLIT_PASSES + 1):
        next_eras: list[dict] = []
        any_split = False

        for era in current:
            if not era_needs_split(era, max_era_months, max_era_events):
                next_eras.append(era)
                continue

            era_label = (
                f"Pass {pass_num}: {format_era_range(era)} "
                f"({len(era['months'])} months, {era['event_count']} events)"
            )
            sub_eras, stats, similarities, merge_log, did_split = split_oversized_era(
                era, centroids, month_events, std_multiplier, min_era_events,
            )

            if did_split:
                any_split = True
                for sub in sub_eras:
                    sub['dominant_cluster_ids'] = dominant_clusters_for_era(
                        sub['events'], track_clusters
                    )

            print_recursive_split_detail(
                era_label, era, sub_eras if did_split else [era],
                cluster_names, stats, similarities, merge_log, did_split,
            )
            next_eras.extend(sub_eras if did_split else [era])

        current = next_eras
        if not any_split:
            break

    for i, era in enumerate(current, start=1):
        era['era_number'] = i

    return current


def print_era_list(
    eras: list[dict],
    cluster_names: dict[int, str],
    title: str,
) -> None:
    print(title)
    for i, era in enumerate(eras, start=1):
        start_m = format_month(*era['months'][0])
        end_m = format_month(*era['months'][-1])
        n_months = len(era['months'])
        print(f"  Era {i}: {start_m} to {end_m} ({n_months} months, {era['event_count']} events)")
        dominant = era.get('dominant_cluster_ids', [])
        if dominant:
            names = [f"[{cid}, {cluster_names.get(cid, 'unknown')}]" for cid in dominant]
            print(f"    Dominant clusters: {', '.join(names)}")
    print()


def print_dry_run_summary(
    final_eras: list[dict],
    original_eras: list[dict],
    merge_log: list[str],
    cluster_names: dict[int, str],
    std_multiplier: float,
    min_era_events: int,
    stats: dict[str, float],
    similarities: list[tuple[str, float, bool]],
) -> None:
    print_era_list(original_eras, cluster_names, f"Before merge ({len(original_eras)} eras):")

    if merge_log:
        print("Merge actions:")
        for entry in merge_log:
            print(f"  {entry}")
        print()
    else:
        print("Merge actions: (none needed)")
        print()

    print_era_list(final_eras, cluster_names, f"After merge ({len(final_eras)} eras):")

    print(f"Total eras detected: {len(final_eras)} (was {len(original_eras)} before merge)")
    print(f"Min era events: {min_era_events}")
    print(f"Std multiplier: {std_multiplier}")
    print(f"Mean similarity: {stats['mean']:.4f}")
    print(f"Std dev: {stats['std_dev']:.4f}")
    print(f"Cutoff (mean - {std_multiplier} * std_dev): {stats['cutoff']:.4f}")
    print()

    below_cutoff = [(label, sim) for label, sim, is_b in similarities if is_b]
    if below_cutoff:
        print("Month-pairs below cutoff:")
        for label, sim in below_cutoff:
            print(f"  {label}: {sim:.4f}")
    else:
        print("Month-pairs below cutoff: (none)")
    print()

    boundary_sims = [sim for _, sim, is_b in similarities if is_b]
    print(f"Boundary similarity scores: {[round(s, 4) for s in boundary_sims]}")
    print()
    print("Month-by-month similarity scores:")
    for label, sim, is_b in similarities:
        marker = "  <- BOUNDARY" if is_b else ""
        print(f"  {label}: {sim:.4f}{marker}")


def detect_eras(
    user_id: int,
    std_multiplier: float,
    min_events_per_month: int,
    min_era_events: int,
    recursive_split: bool,
    max_era_months: int,
    max_era_events: int,
    dry_run: bool,
    source: str = DEFAULT_SOURCE,
) -> list[dict]:
    sources = SOURCE_PRESETS[source]
    db = SessionLocal()
    try:
        events = load_reliable_events(db, user_id, sources)
        print(f"Loaded {len(events)} reliable dated events "
              f"(source preset: {source}, sources: {', '.join(sources)})")

        months, centroids, month_events = compute_month_centroids(
            db, events, min_events_per_month
        )
        print(f"Qualifying months (>={min_events_per_month} events): {len(months)}")

        if len(months) < 2:
            print("Need at least 2 qualifying months to detect era boundaries.")
            return []

        boundaries, similarities, stats = detect_boundaries(
            months, centroids, std_multiplier
        )
        eras = group_eras(months, boundaries, month_events, centroids)
        original_eras = [dict(e) for e in eras]

        merged_eras, merge_log = merge_small_eras(eras, min_era_events, max_passes=2)

        all_track_ids = {tid for era in merged_eras for tid, _ in era['events']}
        track_clusters = load_track_clusters(db, all_track_ids)
        cluster_names = load_cluster_names(db)

        for i, era in enumerate(original_eras, start=1):
            era['era_number'] = i
            era['dominant_cluster_ids'] = dominant_clusters_for_era(
                era['events'], track_clusters
            )

        for i, era in enumerate(merged_eras, start=1):
            era['era_number'] = i
            era['dominant_cluster_ids'] = dominant_clusters_for_era(
                era['events'], track_clusters
            )

        print_dry_run_summary(
            merged_eras, original_eras, merge_log, cluster_names,
            std_multiplier, min_era_events, stats, similarities,
        )

        final_eras = merged_eras
        if recursive_split:
            pre_split_count = len(merged_eras)
            final_eras = apply_recursive_splits(
                merged_eras, centroids, month_events, cluster_names,
                track_clusters, std_multiplier, min_era_events,
                max_era_months, max_era_events,
            )
            print(
                f"\nAfter recursive split: {len(final_eras)} eras "
                f"(was {pre_split_count} before split)"
            )
            print_era_list(
                final_eras, cluster_names,
                f"Final era list ({len(final_eras)} eras):",
            )

        if not dry_run:
            old_era_ids = [
                row[0] for row in db.query(UserEra.id).filter(
                    UserEra.user_id == user_id,
                    UserEra.era_type == source,
                ).all()
            ]
            if old_era_ids:
                db.query(EraLabel).filter(
                    EraLabel.era_id.in_(old_era_ids)
                ).delete(synchronize_session=False)
                db.query(UserEra).filter(
                    UserEra.id.in_(old_era_ids)
                ).delete(synchronize_session=False)

            for era in final_eras:
                user_era = UserEra(
                    user_id=user_id,
                    era_type=source,
                    era_number=era['era_number'],
                    start_date=era['start_date'],
                    end_date=era['end_date'],
                    event_count=era['event_count'],
                    dominant_cluster_ids=era['dominant_cluster_ids'],
                    centroid_vector=era['centroid_vector'],
                )
                db.add(user_era)
                db.flush()

                db.add(EraLabel(
                    era_id=user_era.id,
                    title=_default_era_title(era['era_number']),
                    description=None,
                    mood=None,
                    era_type=source,
                ))

            db.commit()
            print(
                f"\nWrote {len(final_eras)} eras (era_type={source}) to user_eras, "
                f"seeded {len(final_eras)} default era_labels "
                f"(replaced {len(old_era_ids)} prior {source} rows; other era_type rows untouched)."
            )

        return final_eras

    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Detect life eras from listening history")
    parser.add_argument('--dry-run', action='store_true',
                        help='Print results without writing to DB')
    parser.add_argument('--std-multiplier', type=float,
                        default=DEFAULT_STD_MULTIPLIER,
                        help='Boundary cutoff = mean - N * std_dev (default 1.0)')
    parser.add_argument('--min-events-per-month', type=int,
                        default=DEFAULT_MIN_EVENTS_PER_MONTH)
    parser.add_argument('--min-era-events', type=int,
                        default=DEFAULT_MIN_ERA_EVENTS,
                        help='Merge eras with fewer events into nearest neighbor (default 50)')
    parser.add_argument('--recursive-split', action='store_true',
                        help='Re-split oversized eras using local boundary detection')
    parser.add_argument('--max-era-months', type=int, default=DEFAULT_MAX_ERA_MONTHS,
                        help='Split eras exceeding this many months (default 24)')
    parser.add_argument('--max-era-events', type=int, default=DEFAULT_MAX_ERA_EVENTS,
                        help='Split eras exceeding this many events (default 1000)')
    parser.add_argument('--user-id', type=int, default=DEFAULT_USER_ID)
    parser.add_argument('--source', choices=sorted(SOURCE_PRESETS.keys()),
                        default=DEFAULT_SOURCE,
                        help='discovery = saved_tracks + recently_played (default); '
                             'listening = extended_history only')
    args = parser.parse_args()

    detect_eras(
        user_id=args.user_id,
        std_multiplier=args.std_multiplier,
        min_events_per_month=args.min_events_per_month,
        min_era_events=args.min_era_events,
        recursive_split=args.recursive_split,
        max_era_months=args.max_era_months,
        max_era_events=args.max_era_events,
        dry_run=args.dry_run,
        source=args.source,
    )


if __name__ == "__main__":
    main()
