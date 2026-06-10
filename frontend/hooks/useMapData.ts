import { useState, useEffect } from "react";

export const ARCHETYPE_COLORS: Record<string, string> = {
  "The Trap": "#f97316",
  "Terminally Online": "#8b5cf6",
  "Festival Regular": "#3b82f6",
  "Anime Passport": "#ec4899",
  "Toronto Winter Arc": "#14b8a6",
  "Lo-Fi Otaku": "#f59e0b",
  "Desi Household": "#ef4444",
  "Drip Report": "#6366f1",
  "Nostalgic Club Kid": "#22c55e",
  // Legacy DB names — kept as fallbacks in case old values appear
  "East Blue and Chill?": "#f59e0b",
  "Drippy": "#6366f1",
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

export function useMapData() {
  const [data, setData] = useState<MapData | null>(null);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [labels, setLabels] = useState<ClusterLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("http://127.0.0.1:8000/map").then((r) => r.json()),
      fetch("http://127.0.0.1:8000/map/clusters").then((r) => r.json()),
      fetch("http://127.0.0.1:8000/clusters/labels").then((r) => r.json()),
    ])
      .then(([mapData, clusterData, labelsData]) => {
        const labelsMap: Record<number, ClusterLabel> = {};
        for (const label of labelsData.labels as ClusterLabel[]) {
          labelsMap[label.cluster_id] = label;
        }

        const enriched: ClusterInfo[] = clusterData.clusters.map((c: ClusterInfo) => ({
          ...c,
          name: labelsMap[c.cluster_id]?.name,
          canonical_name: labelsMap[c.cluster_id]?.canonical_name,
          cluster_archetype: labelsMap[c.cluster_id]?.cluster_archetype ?? null,
        }));

        setData(mapData);
        setClusters(enriched);
        setLabels(labelsData.labels as ClusterLabel[]);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { data, clusters, labels, loading, error };
}
