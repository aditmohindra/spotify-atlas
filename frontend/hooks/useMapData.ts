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

export interface MapData {
  total: number;
  points: TrackPoint[];
}

export function useMapData() {
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/map")
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}