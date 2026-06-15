import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";

export const ARCHETYPE_COLORS: Record<string, string> = {
  "Trap Dynasty":        "#f97316",
  "Terminally Online":   "#8b5cf6",
  "Festival Regular":    "#3b82f6",
  "Anime Passport":      "#ec4899",
  "Lo-Fi Otaku":         "#f59e0b",
  "Desi Household":      "#ef4444",
  "Rap Canon Devotee":   "#6366f1",
  "K-Pop Citizen":       "#22c55e",
  "Side Quest Soul":     "#14b8a6",
  "Late Night Romantic": "#e11d48",
  "Indie Main Character":"#a855f7",
  "Club Circuit":        "#0ea5e9",
};

export function getArchetypeColor(archetype: string | null | undefined): string {
  if (!archetype) return "#94a3b8";
  return ARCHETYPE_COLORS[archetype] ?? "#94a3b8";
}

export interface TrackPoint {
  id: number;
  name: string;
  artist: string;
  x: number;
  y: number;
  cluster_id: number;
  spotify_id: string;
}

export interface ClusterInfo {
  cluster_id: number;
  track_count: number;
  centroid_x: number;
  centroid_y: number;
  top_artists: string[];
  sample_tracks: { name: string; artist: string }[];
  name?: string;
  canonical_name?: string;
  description?: string;
  keywords?: string[];
  cluster_archetype?: string | null;
}

export interface ClusterLabel {
  cluster_id: number;
  name?: string;
  canonical_name?: string;
  cluster_archetype?: string | null;
}

export interface MapData {
  total: number;
  points: TrackPoint[];
}

interface GalaxyTrack {
  track_id: number;
  spotify_track_id: string;
  name: string;
  artist: string;
  x: number;
  y: number;
  cluster_id: number;
  community_name: string;
  assignment_type: "hard" | "soft" | "between_worlds";
}

interface GalaxyCommunity {
  cluster_id: number;
  name: string;
  canonical_name: string | null;
  cluster_archetype: string | null;
  track_count: number;
}

interface GalaxyResponse {
  layer: string;
  total_tracks: number;
  total_communities: number;
  tracks: GalaxyTrack[];
  communities: GalaxyCommunity[];
}

export function useMapData(layer: "vibe" | "scene" = "vibe") {
  const [data, setData] = useState<MapData | null>(null);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [labels, setLabels] = useState<ClusterLabel[]>([]);
  const [stats, setStats] = useState<{
    totalTracks: number;
    totalCommunities: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setStats(null);

    fetch(`${API_BASE_URL}/galaxy?layer=${layer}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed with status ${r.status}`);
        return r.json() as Promise<GalaxyResponse>;
      })
      .then((response) => {
        const points: TrackPoint[] = response.tracks.map((t) => ({
          id: t.track_id,
          name: t.name,
          artist: t.artist,
          x: t.x,
          y: t.y,
          cluster_id: t.cluster_id,
          spotify_id: t.spotify_track_id,
        }));

        const centroidAcc = new Map<
          number,
          { sumX: number; sumY: number; count: number }
        >();
        for (const pt of points) {
          if (pt.cluster_id === -1) continue;
          const prev = centroidAcc.get(pt.cluster_id) ?? {
            sumX: 0,
            sumY: 0,
            count: 0,
          };
          centroidAcc.set(pt.cluster_id, {
            sumX: prev.sumX + pt.x,
            sumY: prev.sumY + pt.y,
            count: prev.count + 1,
          });
        }

        const enriched: ClusterInfo[] = response.communities.map((c) => {
          const acc = centroidAcc.get(c.cluster_id);
          return {
            cluster_id: c.cluster_id,
            track_count: c.track_count,
            centroid_x: acc ? acc.sumX / acc.count : 0,
            centroid_y: acc ? acc.sumY / acc.count : 0,
            top_artists: [],
            sample_tracks: [],
            name: c.name,
            canonical_name: c.canonical_name ?? undefined,
            cluster_archetype: c.cluster_archetype ?? null,
          };
        });

        const clusterLabels: ClusterLabel[] = response.communities.map((c) => ({
          cluster_id: c.cluster_id,
          name: c.name,
          canonical_name: c.canonical_name ?? undefined,
          cluster_archetype: c.cluster_archetype ?? null,
        }));

        setData({ total: response.total_tracks, points });
        setClusters(enriched);
        setLabels(clusterLabels);
        setStats({
          totalTracks: response.total_tracks,
          totalCommunities: response.total_communities,
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [layer]);

  return { data, clusters, labels, stats, loading, error };
}
