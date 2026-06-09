import { useState, useEffect } from "react";

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
}

export interface MapData {
  total: number;
  points: TrackPoint[];
}

export function useMapData() {
  const [data, setData] = useState<MapData | null>(null);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("http://127.0.0.1:8000/map").then((r) => r.json()),
      fetch("http://127.0.0.1:8000/map/clusters").then((r) => r.json()),
    ])
      .then(([mapData, clusterData]) => {
        setData(mapData);
        setClusters(clusterData.clusters);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { data, clusters, loading, error };
}