"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useMapData, TrackPoint, ClusterInfo } from "@/hooks/useMapData";
import TrackSidebar from "./TrackSidebar";
import ClusterSidebar from "./ClusterSidebar";

const CLUSTER_COLORS = [
  "#60a5fa","#34d399","#f87171","#fbbf24","#a78bfa",
  "#f472b6","#38bdf8","#4ade80","#fb923c","#e879f9",
  "#22d3ee","#86efac","#fca5a5","#fde68a","#c4b5fd",
  "#f9a8d4","#7dd3fc","#6ee7b7","#fcd34d","#d8b4fe",
  "#93c5fd","#6ee7b7","#fca5a5","#fde68a","#ddd6fe",
];

export function getClusterColor(clusterId: number): string {
  if (clusterId === -1) return "#ffffff15";
  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

export default function GalaxyMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data, clusters, loading, error } = useMapData();
  const [selectedTrack, setSelectedTrack] = useState<TrackPoint | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<TrackPoint | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<TrackPoint | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);

  const transform = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const raf = useRef<number>(0);

  const PAD_LEFT = 260;
  const PAD = 60;

  const toScreen = useCallback((x: number, y: number, canvas: HTMLCanvasElement) => {
    const t = transform.current;
    const W = canvas.width - PAD_LEFT - PAD;
    const H = canvas.height - PAD * 2;
    return {
      sx: PAD_LEFT + (x / 1000) * W * t.scale + t.offsetX,
      sy: PAD + (y / 1000) * H * t.scale + t.offsetY,
    };
  }, [PAD_LEFT, PAD]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#07071a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const s = transform.current.scale;
    const baseSize = Math.max(1.5, Math.min(4, 2 * s));
    const hasFilter = selectedCluster !== null;
    const highlightId = searchResult?.id;

    for (const pt of data.points) {
      const { sx, sy } = toScreen(pt.x, pt.y, canvas);
      if (sx < -20 || sx > canvas.width + 20 || sy < -20 || sy > canvas.height + 20) continue;

      const inCluster = !hasFilter || pt.cluster_id === selectedCluster;
      const isNoise = pt.cluster_id === -1;
      const isPinned = pt.id === selectedTrack?.id || pt.id === highlightId;
      const isHovered = pt.id === hoveredTrack?.id;

      let color = getClusterColor(pt.cluster_id);
      let size = baseSize;
      let alpha = inCluster ? (isNoise ? 0.15 : 0.85) : 0.04;

      if (isPinned) { color = "#fff"; size = 7; alpha = 1; }
      else if (isHovered) { color = "#fff"; size = 5; alpha = 1; }

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    if (s > 1) {
      for (const cl of clusters) {
        if (hasFilter && cl.cluster_id !== selectedCluster) continue;
        const { sx, sy } = toScreen(cl.centroid_x, cl.centroid_y, canvas);
        if (sx < PAD_LEFT || sx > canvas.width - PAD || sy < PAD || sy > canvas.height - PAD) continue;
        const color = getClusterColor(cl.cluster_id);
        ctx.font = `500 ${Math.min(12, 9 * s)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        const label = cl.name ?? `${cl.cluster_id}`;
        ctx.fillText(label, sx, sy - baseSize - 5);
        ctx.globalAlpha = 1;
      }
    }
  }, [data, clusters, selectedTrack, hoveredTrack, searchResult, selectedCluster, toScreen, PAD_LEFT, PAD]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  const hitTest = useCallback((mx: number, my: number): TrackPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return null;
    const s = transform.current.scale;
    const thresh = Math.max(5, 7 * s);
    let closest: TrackPoint | null = null;
    let closestDist = thresh;

    for (const pt of data.points) {
      if (selectedCluster !== null && pt.cluster_id !== selectedCluster) continue;
      const { sx, sy } = toScreen(pt.x, pt.y, canvas);
      const dist = Math.hypot(sx - mx, sy - my);
      if (dist < closestDist) {
        closestDist = dist;
        closest = pt;
      }
    }
    return closest;
  }, [data, toScreen, selectedCluster]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isDragging.current) {
      const dx = mx - lastMouse.current.x;
      const dy = my - lastMouse.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved.current = true;
      transform.current.offsetX += dx;
      transform.current.offsetY += dy;
      lastMouse.current = { x: mx, y: my };
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(draw);
      return;
    }

    const hit = hitTest(mx, my);
    if (hit?.id !== hoveredTrack?.id) {
      setHoveredTrack(hit);
    }
    setTooltip({ x: e.clientX, y: e.clientY });
  }, [draw, hitTest]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    dragMoved.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = false;
    if (!dragMoved.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTest(mx, my);
      setSelectedTrack(hit ?? null);
    }
  }, [hitTest]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const t = transform.current;
    const newScale = Math.max(0.3, Math.min(25, t.scale * factor));
    const ratio = newScale / t.scale;
    t.offsetX = mx - ratio * (mx - t.offsetX);
    t.offsetY = my - ratio * (my - t.offsetY);
    t.scale = newScale;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  const flyTo = useCallback((x: number, y: number, zoom = 4) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width - PAD_LEFT - PAD;
    const H = canvas.height - PAD * 2;
    transform.current.scale = zoom;
    transform.current.offsetX = W / 2 - (x / 1000) * W * zoom;
    transform.current.offsetY = H / 2 - (y / 1000) * H * zoom;
    draw();
  }, [draw, PAD_LEFT, PAD]);

  const handleSelectCluster = useCallback((id: number | null) => {
    setSelectedCluster(id);
    setSelectedTrack(null);
    if (id !== null) {
      const cl = clusters.find(c => c.cluster_id === id);
      if (cl) flyTo(cl.centroid_x, cl.centroid_y, 4);
    }
  }, [clusters, flyTo]);

  const handleSearch = useCallback(() => {
    if (!data || !search.trim()) { setSearchResult(null); return; }
    const q = search.toLowerCase();
    const found = data.points.find(p =>
      p.name.toLowerCase().includes(q) || p.artist.toLowerCase().includes(q)
    );
    setSearchResult(found ?? null);
    if (found) flyTo(found.x, found.y, 6);
  }, [data, search, flyTo]);

  if (loading) return (
    <div className="w-full h-screen bg-[#07071a] flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-white/50 text-sm tracking-widest uppercase">Loading galaxy</div>
        <div className="text-white/20 text-xs">9,892 tracks · 204 clusters</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="w-full h-screen bg-[#07071a] flex items-center justify-center">
      <div className="text-red-400/80 text-sm">Could not load map — is the backend running?</div>
    </div>
  );

  return (
    <div className="relative w-full h-screen bg-[#07071a] overflow-hidden font-sans">
      <ClusterSidebar
        clusters={clusters}
        selectedCluster={selectedCluster}
        onSelectCluster={handleSelectCluster}
      />

      <div className="absolute top-5 z-10 flex items-center gap-2" style={{ left: 276 }}>
        <div className="flex items-center gap-0 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Search tracks or artists..."
            className="bg-transparent text-white/80 placeholder-white/20 text-sm px-4 py-2.5 w-64 focus:outline-none"
          />
          <button
            onClick={handleSearch}
            className="text-white/40 hover:text-white/80 text-sm px-4 py-2.5 border-l border-white/10 transition-colors"
          >
            ↵
          </button>
        </div>
        {searchResult && (
          <>
            <div className="text-white/40 text-xs">
              {searchResult.name} · {searchResult.artist}
            </div>
            <button
              onClick={() => { setSearch(""); setSearchResult(null); }}
              className="text-white/20 hover:text-white/60 text-xs transition-colors"
            >
              ✕
            </button>
          </>
        )}
      </div>

      <div className="absolute top-5 right-5 z-10 text-right">
        <div className="text-white/60 text-xs font-medium tracking-wider">SPOTIFY ATLAS</div>
        <div className="text-white/20 text-xs mt-0.5">
          {data?.total.toLocaleString()} tracks · {clusters.length} clusters
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: isDragging.current ? "grabbing" : "crosshair" }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { setHoveredTrack(null); }}
        onWheel={onWheel}
      />

      {hoveredTrack && (
        <div
          className="fixed z-20 pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 12 }}
        >
          <div className="bg-[#0d0d2b] border border-white/10 rounded-lg px-3 py-2 shadow-xl">
            <div className="text-white text-xs font-medium">{hoveredTrack.name}</div>
            <div className="text-white/40 text-xs mt-0.5">{hoveredTrack.artist}</div>
            <div
              className="text-xs mt-1 font-mono"
              style={{ color: getClusterColor(hoveredTrack.cluster_id) }}
            >
              {clusters.find(c => c.cluster_id === hoveredTrack.cluster_id)?.name ?? 
               (hoveredTrack.cluster_id === -1 ? "unclassified" : `cluster ${hoveredTrack.cluster_id}`)}
            </div>
          </div>
        </div>
      )}

      <TrackSidebar
        track={selectedTrack}
        cluster={clusters.find(c => c.cluster_id === selectedTrack?.cluster_id)}
        onClose={() => setSelectedTrack(null)}
      />
    </div>
  );
}