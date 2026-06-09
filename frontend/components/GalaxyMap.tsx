"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useMapData, TrackPoint } from "@/hooks/useMapData";
import TrackSidebar from "./TrackSidebar";

const CLUSTER_COLORS = [
  "#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa",
  "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#e879f9",
  "#22d3ee", "#86efac", "#fca5a5", "#fde68a", "#c4b5fd",
  "#f9a8d4", "#7dd3fc", "#6ee7b7", "#fcd34d", "#d8b4fe",
];

function getClusterColor(clusterId: number): string {
  if (clusterId === -1) return "#ffffff20";
  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

export default function GalaxyMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data, loading, error } = useMapData();
  const [selectedTrack, setSelectedTrack] = useState<TrackPoint | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<TrackPoint | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<TrackPoint | null>(null);

  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number>(0);

  const toScreen = useCallback((x: number, y: number, canvas: HTMLCanvasElement) => {
    const t = transformRef.current;
    const padding = 60;
    const scaleX = (canvas.width - padding * 2) / 1000;
    const scaleY = (canvas.height - padding * 2) / 1000;
    return {
      sx: padding + x * scaleX * t.scale + t.offsetX,
      sy: padding + y * scaleY * t.scale + t.offsetY,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#050510";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = transformRef.current.scale;
    const pointSize = Math.max(1, Math.min(3, 2 * scale));

    const highlightId = searchResult?.id;

    for (const point of data.points) {
      const { sx, sy } = toScreen(point.x, point.y, canvas);
      if (sx < -10 || sx > canvas.width + 10) continue;
      if (sy < -10 || sy > canvas.height + 10) continue;

      const isHighlighted = highlightId === point.id;
      const isSelected = selectedTrack?.id === point.id;

      let color = getClusterColor(point.cluster_id);
      let size = pointSize;

      if (isHighlighted || isSelected) {
        color = "#ffffff";
        size = 6;
      } else if (hoveredTrack?.id === point.id) {
        color = "#ffffff";
        size = 4;
      } else if (highlightId && !isHighlighted) {
        color = getClusterColor(point.cluster_id) + "30";
      }

      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }, [data, selectedTrack, hoveredTrack, searchResult, toScreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    draw();
  }, [data, draw]);

  useEffect(() => {
    draw();
  }, [draw, selectedTrack, hoveredTrack, searchResult]);

  const getPointAtMouse = useCallback((mx: number, my: number): TrackPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return null;
    const scale = transformRef.current.scale;
    const threshold = Math.max(4, 6 * scale);

    for (let i = data.points.length - 1; i >= 0; i--) {
      const point = data.points[i];
      const { sx, sy } = toScreen(point.x, point.y, canvas);
      const dx = sx - mx;
      const dy = sy - my;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) {
        return point;
      }
    }
    return null;
  }, [data, toScreen]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isDragging.current) {
      transformRef.current.offsetX += mx - lastMouse.current.x;
      transformRef.current.offsetY += my - lastMouse.current.y;
      lastMouse.current = { x: mx, y: my };
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    const hit = getPointAtMouse(mx, my);
    setHoveredTrack(hit);
    setTooltip({ x: e.clientX, y: e.clientY });
  }, [draw, getPointAtMouse]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = Math.abs(mx - lastMouse.current.x);
    const dy = Math.abs(my - lastMouse.current.y);

    if (dx < 3 && dy < 3) {
      const hit = getPointAtMouse(mx, my);
      if (hit) setSelectedTrack(hit);
      else setSelectedTrack(null);
    }

    isDragging.current = false;
  }, [getPointAtMouse]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    transformRef.current.scale = Math.max(0.3, Math.min(20, transformRef.current.scale * delta));
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  const handleSearch = useCallback(() => {
    if (!data || !search.trim()) {
      setSearchResult(null);
      return;
    }
    const found = data.points.find(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.artist.toLowerCase().includes(search.toLowerCase())
    );
    setSearchResult(found || null);
    if (found) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const padding = 60;
      const scaleX = (canvas.width - padding * 2) / 1000;
      const scaleY = (canvas.height - padding * 2) / 1000;
      transformRef.current.offsetX = canvas.width / 2 - found.x * scaleX * transformRef.current.scale - padding;
      transformRef.current.offsetY = canvas.height / 2 - found.y * scaleY * transformRef.current.scale - padding;
      draw();
    }
  }, [data, search, draw]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#050510] flex items-center justify-center">
        <div className="text-center">
          <div className="text-white/40 text-sm mb-2">Loading your music galaxy</div>
          <div className="text-white/20 text-xs">Fetching 9,892 tracks...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen bg-[#050510] flex items-center justify-center">
        <div className="text-red-400 text-sm">Failed to load map: {error}</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-[#050510] overflow-hidden">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search tracks or artists..."
            className="bg-white/10 text-white placeholder-white/30 text-sm px-3 py-2 rounded-lg border border-white/10 w-64 focus:outline-none focus:border-white/30"
          />
          <button
            onClick={handleSearch}
            className="bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-2 rounded-lg border border-white/10 transition-colors"
          >
            Find
          </button>
          {searchResult && (
            <button
              onClick={() => { setSearch(""); setSearchResult(null); }}
              className="bg-white/10 hover:bg-white/20 text-white/60 text-sm px-3 py-2 rounded-lg border border-white/10 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        {searchResult && (
          <div className="text-white/60 text-xs px-1">
            Found: {searchResult.name} by {searchResult.artist}
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 z-10 text-white/20 text-xs text-right">
        <div>Spotify Atlas</div>
        <div>{data?.total.toLocaleString()} tracks</div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {hoveredTrack && !isDragging.current && (
        <div
          className="fixed z-20 bg-black/90 text-white text-xs px-2.5 py-1.5 rounded-lg pointer-events-none border border-white/10"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="font-medium">{hoveredTrack.name}</div>
          <div className="text-white/50">{hoveredTrack.artist}</div>
        </div>
      )}

      <TrackSidebar
        track={selectedTrack}
        onClose={() => setSelectedTrack(null)}
      />
    </div>
  );
}