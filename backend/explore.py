import psycopg2
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from collections import defaultdict

conn = psycopg2.connect('postgresql://spotify_atlas:spotify_atlas_password@127.0.0.1:5433/spotify_atlas')
cur = conn.cursor()

# Load 2D coordinates (scene UMAP geography)
print("Loading 2D coordinates...")
cur.execute("""
    SELECT tc.track_id, tc.x, tc.y
    FROM track_coordinates tc
""")
coord_rows = cur.fetchall()
coords = {r[0]: (r[1], r[2]) for r in coord_rows}
print(f"  Loaded {len(coords)} 2D coordinates")

# Load vibe cluster assignments (run 29)
print("Loading vibe cluster assignments (run 29)...")
cur.execute("""
    SELECT track_id, cluster_id
    FROM clustering_assignments
    WHERE run_id = 29
""")
vibe_rows = cur.fetchall()
vibe_assignments = {r[0]: r[1] for r in vibe_rows}
print(f"  Loaded {len(vibe_assignments)} vibe assignments")

# Load scene cluster assignments (run 18 / production)
print("Loading scene cluster assignments (run 18)...")
cur.execute("""
    SELECT track_id, cluster_id
    FROM track_clusters
    WHERE cluster_id != -1
""")
scene_rows = cur.fetchall()
scene_assignments = {r[0]: r[1] for r in scene_rows}

# Load artist names for hover info
cur.execute("""
    SELECT t.id, t.name, ar.name
    FROM tracks t
    JOIN artists ar ON ar.id = t.artist_id
""")
track_info = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

conn.close()

# Build plot data
track_ids = list(coords.keys())
xs = [coords[tid][0] for tid in track_ids]
ys = [coords[tid][1] for tid in track_ids]
vibe_clusters = [vibe_assignments.get(tid, -1) for tid in track_ids]

# Get unique vibe cluster IDs (excluding noise)
unique_vibes = sorted(set(v for v in vibe_clusters if v != -1))
n_clusters = len(unique_vibes)
print(f"\nVibe clusters to color: {n_clusters}")

# Generate color palette
cmap = plt.colormaps['tab20'].resampled(20)
colors_20 = [cmap(i) for i in range(20)]
# Extend with tab20b and tab20c for more colors
cmap2 = plt.colormaps['tab20b'].resampled(20)
cmap3 = plt.colormaps['tab20c'].resampled(20)
all_colors = colors_20 + [cmap2(i) for i in range(20)] + [cmap3(i) for i in range(20)]

cluster_to_color = {}
for i, cid in enumerate(unique_vibes):
    cluster_to_color[cid] = all_colors[i % len(all_colors)]

# Separate noise from clustered
noise_mask = [v == -1 for v in vibe_clusters]
clustered_mask = [v != -1 for v in vibe_clusters]

fig, axes = plt.subplots(1, 2, figsize=(24, 10))

# --- Plot 1: Vibe clusters on scene geography ---
ax1 = axes[0]
ax1.set_facecolor('#0a0a0a')
fig.patch.set_facecolor('#0a0a0a')

# Plot noise first (gray, small)
noise_xs = [xs[i] for i, m in enumerate(noise_mask) if m]
noise_ys = [ys[i] for i, m in enumerate(noise_mask) if m]
ax1.scatter(noise_xs, noise_ys, c='#2a2a2a', s=1, alpha=0.3, zorder=1)

# Plot clustered points colored by vibe cluster
cluster_xs = defaultdict(list)
cluster_ys = defaultdict(list)
for i, tid in enumerate(track_ids):
    v = vibe_clusters[i]
    if v != -1:
        cluster_xs[v].append(xs[i])
        cluster_ys[v].append(ys[i])

for cid in unique_vibes:
    color = cluster_to_color[cid]
    ax1.scatter(cluster_xs[cid], cluster_ys[cid],
                c=[color], s=2, alpha=0.6, zorder=2)

ax1.set_title('Vibe Clusters on Scene Geography\n(Run 29 colors, Run 18 2D layout)',
              color='white', fontsize=13, pad=10)
ax1.set_xticks([])
ax1.set_yticks([])
for spine in ax1.spines.values():
    spine.set_visible(False)

# --- Plot 2: Scene clusters on scene geography (for comparison) ---
ax2 = axes[1]
ax2.set_facecolor('#0a0a0a')

scene_cluster_list = sorted(set(v for v in scene_assignments.values() if v != -1))
scene_color_map = {cid: all_colors[i % len(all_colors)] for i, cid in enumerate(scene_cluster_list)}

scene_cluster_xs = defaultdict(list)
scene_cluster_ys = defaultdict(list)
scene_noise_xs = []
scene_noise_ys = []

for tid in track_ids:
    x, y = coords[tid]
    sc = scene_assignments.get(tid, -1)
    if sc == -1:
        scene_noise_xs.append(x)
        scene_noise_ys.append(y)
    else:
        scene_cluster_xs[sc].append(x)
        scene_cluster_ys[sc].append(y)

ax2.scatter(scene_noise_xs, scene_noise_ys, c='#2a2a2a', s=1, alpha=0.3, zorder=1)
for cid in scene_cluster_list:
    color = scene_color_map[cid]
    ax2.scatter(scene_cluster_xs[cid], scene_cluster_ys[cid],
                c=[color], s=2, alpha=0.6, zorder=2)

ax2.set_title('Scene Clusters on Scene Geography\n(Run 18 colors, Run 18 2D layout)',
              color='white', fontsize=13, pad=10)
ax2.set_xticks([])
ax2.set_yticks([])
for spine in ax2.spines.values():
    spine.set_visible(False)

plt.tight_layout(pad=2.0)
output_path = 'ml/visualization/vibe_vs_scene_comparison.png'
plt.savefig(output_path, dpi=150, bbox_inches='tight',
            facecolor='#0a0a0a', edgecolor='none')
plt.close()
print(f"\nSaved to {output_path}")
print("Open the file to compare vibe vs scene clustering on the same 2D geography")
