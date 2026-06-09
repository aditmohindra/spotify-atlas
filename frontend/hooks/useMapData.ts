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
    name?: string;
    canonical_name?: string;
    description?: string;
    keywords?: string[];
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
        fetch("http://127.0.0.1:8000/clusters/labels").then((r) => r.json()),
      ])
        .then(([mapData, clusterData, labelsData]) => {
          const labelsMap: Record<number, any> = {};
          for (const label of labelsData.labels) {
            labelsMap[label.cluster_id] = label;
          }
  
          const enriched = clusterData.clusters.map((c: ClusterInfo) => ({
            ...c,
            name: labelsMap[c.cluster_id]?.name,
            canonical_name: labelsMap[c.cluster_id]?.canonical_name,
            description: labelsMap[c.cluster_id]?.description,
            keywords: labelsMap[c.cluster_id]?.keywords,
          }));
  
          setData(mapData);
          setClusters(enriched);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }, []);
  
    return { data, clusters, loading, error };
  }