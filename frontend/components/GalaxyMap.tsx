"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  useMapData,
  TrackPoint,
  ClusterInfo,
  getArchetypeColor,
  ARCHETYPE_COLORS,
} from "@/hooks/useMapData";
import TrackSidebar from "./TrackSidebar";
import ClusterSidebar from "./ClusterSidebar";

export default function GalaxyMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data, clusters, loading, error } = useMapData();

  const [selectedTrack, setSelectedTrack] = useState<TrackPoint | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<TrackPoint | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<TrackPoint | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);

  const transform = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const raf = useRef<number>(0);

  const ATLAS_SIDEBAR = 240;
  const PAD = 60;

  // Build lookup: cluster_id → archetype color
  const clusterArchetypeMap = useMemo(() => {
    const m = new Map<number, string | null>();
    for (const c of clusters) {
      m.set(c.cluster_id, c.cluster_archetype ?? null);
    }
    return m;
  }, [clusters]);

  // Build lookup: cluster_id → ClusterInfo (for tooltip / labels)
  const clusterInfoMap = useMemo(() => {
    const m = new Map<number, ClusterInfo>();
    for (const c of clusters) m.set(c.cluster_id, c);
    return m;
  }, [clusters]);

  // Archetype centroids — mean of ALL non-noise map points per archetype
  const archetypeCentroids = useMemo(() => {
    if (!data) return new Map<string, { x: number; y: number }>();
    const acc = new Map<string, { sumX: number; sumY: number; count: number }>();
    for (const pt of data.points) {
      if (pt.cluster_id === -1) continue; // exclude noise
      const archetype = clusterArchetypeMap.get(pt.cluster_id) ?? null;
      if (!archetype) continue;
      const prev = acc.get(archetype) ?? { sumX: 0, sumY: 0, count: 0 };
      acc.set(archetype, {
        sumX: prev.sumX + pt.x,
        sumY: prev.sumY + pt.y,
        count: prev.count + 1,
      });
    }
    const result = new Map<string, { x: number; y: number }>();
    for (const [key, { sumX, sumY, count }] of acc) {
      if (count > 0) result.set(key, { x: sumX / count, y: sumY / count });
    }
    return result;
  }, [data, clusterArchetypeMap]);

  const toScreen = useCallback(
    (x: number, y: number, canvas: HTMLCanvasElement) => {
      const t = transform.current;
      const W = canvas.width - ATLAS_SIDEBAR - PAD;
      const H = canvas.height - PAD * 2;
      return {
        sx: ATLAS_SIDEBAR + (x / 1000) * W * t.scale + t.offsetX,
        sy: PAD + (y / 1000) * H * t.scale + t.offsetY,
      };
    },
    [ATLAS_SIDEBAR, PAD]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Light warm background
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#f3f5f9");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const s = transform.current.scale;
    const baseSize = Math.max(1.5, Math.min(4, 2 * s));

    const hasClusterFilter = selectedCluster !== null;
    const hasArchFilter = selectedArchetype !== null;
    const hasFilter = hasClusterFilter || hasArchFilter;
    const highlightId = searchResult?.id;

    // Draw points
    for (const pt of data.points) {
      const { sx, sy } = toScreen(pt.x, pt.y, canvas);
      if (sx < -20 || sx > canvas.width + 20 || sy < -20 || sy > canvas.height + 20) continue;

      const isNoise = pt.cluster_id === -1;
      const archetype = clusterArchetypeMap.get(pt.cluster_id) ?? null;
      const inFilter = hasClusterFilter
        ? pt.cluster_id === selectedCluster
        : hasArchFilter
        ? archetype === selectedArchetype
        : true;

      const isPinned = pt.id === selectedTrack?.id || pt.id === highlightId;
      const isHovered = pt.id === hoveredTrack?.id;

      const archetypeColor = getArchetypeColor(archetype);
      let color = isNoise ? "#94a3b8" : archetypeColor;
      let size = baseSize;
      let alpha: number;

      if (isNoise) {
        // Noise points: nearly invisible on light background, never highlighted
        alpha = 0.08;
      } else if (isPinned) {
        color = "#1db954";
        size = 7;
        alpha = 1;
      } else if (isHovered) {
        color = archetypeColor !== "#94a3b8" ? archetypeColor : "#1db954";
        size = baseSize + 2;
        alpha = 1;
      } else if (!inFilter && hasFilter) {
        alpha = 0.04;
      } else {
        alpha = 0.75;
      }

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Archetype region labels — pill style, only at zoom < 2.0
    if (s < 2.0) {
      const PILL_PX = 6;
      const PILL_PY = 4;
      const PILL_R = 20;
      const FONT = "600 14px 'DM Sans', system-ui, -apple-system, sans-serif";
      ctx.font = FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Build list of visible labels with initial screen positions
      type LabelEntry = { archetype: string; cx: number; cy: number; ox: number; oy: number };
      const labels: LabelEntry[] = [];
      for (const [archetype, centroid] of archetypeCentroids) {
        if (archetype === "Unknown") continue;
        const { sx, sy } = toScreen(centroid.x, centroid.y, canvas);
        if (sx < ATLAS_SIDEBAR + 20 || sx > canvas.width - PAD - 20) continue;
        if (sy < PAD + 20 || sy > canvas.height - PAD - 20) continue;
        labels.push({ archetype, cx: sx, cy: sy, ox: sx, oy: sy });
      }

      // 3-pass collision resolution: push overlapping pairs apart
      const MIN_DIST = 100;
      const PUSH = 25;
      const MAX_DRIFT = 60; // never stray more than this from true centroid
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) {
            const a = labels[i];
            const b = labels[j];
            const dx = b.cx - a.cx;
            const dy = b.cy - a.cy;
            const dist = Math.hypot(dx, dy);
            if (dist < MIN_DIST && dist > 0) {
              const nx = dx / dist;
              const ny = dy / dist;
              a.cx -= nx * PUSH;
              a.cy -= ny * PUSH;
              b.cx += nx * PUSH;
              b.cy += ny * PUSH;
            }
          }
        }
        // After each pass clamp every label to MAX_DRIFT from its origin
        for (const lbl of labels) {
          const ddx = lbl.cx - lbl.ox;
          const ddy = lbl.cy - lbl.oy;
          const d = Math.hypot(ddx, ddy);
          if (d > MAX_DRIFT) {
            lbl.cx = lbl.ox + (ddx / d) * MAX_DRIFT;
            lbl.cy = lbl.oy + (ddy / d) * MAX_DRIFT;
          }
        }
      }

      for (const { archetype, cx: sx, cy: sy } of labels) {

        const color = getArchetypeColor(archetype);
        const textW = ctx.measureText(archetype).width;
        const pillW = textW + PILL_PX * 2;
        const pillH = 14 + PILL_PY * 2;
        const pillX = sx - pillW / 2;
        const pillY = sy - pillH / 2;

        // Helper: rounded rect path
        const rr = (x: number, y: number, w: number, h: number, r: number) => {
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + w - r, y);
          ctx.quadraticCurveTo(x + w, y, x + w, y + r);
          ctx.lineTo(x + w, y + h - r);
          ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          ctx.lineTo(x + r, y + h);
          ctx.quadraticCurveTo(x, y + h, x, y + h - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
        };

        // 1. Fill
        rr(pillX, pillY, pillW, pillH, PILL_R);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        // 2. Stroke (archetype color @ 60%)
        rr(pillX, pillY, pillW, pillH, PILL_R);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 3. Text (archetype color @ 90%)
        ctx.font = FONT;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.fillText(archetype, sx, sy);

        ctx.globalAlpha = 1;
      }
    }

    // Community pills — tiered by zoom level
    if (s >= 1.5) {
      const PILL_FONT = "600 11px 'DM Sans', system-ui, -apple-system, sans-serif";
      const PILL_PH = 11 + 8; // fixed pill height
      const PILL_PAD_X = 6;
      const PILL_R = PILL_PH / 2;

      ctx.font = PILL_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 1. Filter to candidates visible in viewport, respecting active filter
      let candidates = clusters.filter((cl) => {
        if (cl.track_count < 15) return false;
        if (hasClusterFilter && cl.cluster_id !== selectedCluster) return false;
        if (hasArchFilter && (clusterArchetypeMap.get(cl.cluster_id) ?? null) !== selectedArchetype) return false;
        const { sx, sy } = toScreen(cl.centroid_x, cl.centroid_y, canvas);
        if (sx < ATLAS_SIDEBAR + 10 || sx > canvas.width - 10) return false;
        if (sy < PAD + 10 || sy > canvas.height - 10) return false;
        return true;
      });

      // 2. Sort by track_count descending so higher-priority labels win collisions
      candidates = candidates.slice().sort((a, b) => b.track_count - a.track_count);

      // 3. Zoom-based cap: 1.5–2.5 → top 30 only; >2.5 → all visible
      if (s < 2.5) candidates = candidates.slice(0, 30);

      // 4. Draw with collision rejection
      const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

      for (const cl of candidates) {
        const { sx, sy } = toScreen(cl.centroid_x, cl.centroid_y, canvas);
        const label = cl.name ?? `${cl.cluster_id}`;
        const textW = ctx.measureText(label).width;
        const pillW = textW + PILL_PAD_X * 2;
        const pillX = sx - pillW / 2;
        const pillY = sy - baseSize - PILL_PH - 2;

        // Collision check against already-placed pills (with 2px gutter)
        const GUTTER = 2;
        const overlaps = placed.some(
          (r) =>
            pillX - GUTTER < r.x + r.w &&
            pillX + pillW + GUTTER > r.x &&
            pillY - GUTTER < r.y + r.h &&
            pillY + PILL_PH + GUTTER > r.y
        );
        if (overlaps) continue;
        placed.push({ x: pillX, y: pillY, w: pillW, h: PILL_PH });

        const color = getArchetypeColor(cl.cluster_archetype ?? null);

        // Pill background
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(pillX + PILL_R, pillY);
        ctx.lineTo(pillX + pillW - PILL_R, pillY);
        ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + PILL_PH, PILL_R);
        ctx.lineTo(pillX + pillW, pillY + PILL_R);
        ctx.arcTo(pillX + pillW, pillY + PILL_PH, pillX + pillW - PILL_R, pillY + PILL_PH, PILL_R);
        ctx.lineTo(pillX + PILL_R, pillY + PILL_PH);
        ctx.arcTo(pillX, pillY + PILL_PH, pillX, pillY + PILL_PH - PILL_R, PILL_R);
        ctx.lineTo(pillX, pillY + PILL_R);
        ctx.arcTo(pillX, pillY, pillX + PILL_R, pillY, PILL_R);
        ctx.closePath();
        ctx.fill();

        // Pill text
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.font = PILL_FONT;
        ctx.fillText(label, sx, pillY + PILL_PH / 2);
      }
    }

    ctx.globalAlpha = 1;
  }, [
    data,
    clusters,
    clusterArchetypeMap,
    archetypeCentroids,
    selectedTrack,
    hoveredTrack,
    searchResult,
    selectedCluster,
    selectedArchetype,
    toScreen,
    ATLAS_SIDEBAR,
    PAD,
  ]);

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

  const hitTest = useCallback(
    (mx: number, my: number): TrackPoint | null => {
      const canvas = canvasRef.current;
      if (!canvas || !data) return null;
      const s = transform.current.scale;
      const thresh = Math.max(5, 7 * s);
      let closest: TrackPoint | null = null;
      let closestDist = thresh;

      for (const pt of data.points) {
        if (pt.cluster_id === -1) continue; // noise points are not hoverable
        if (selectedCluster !== null && pt.cluster_id !== selectedCluster) continue;
        if (selectedArchetype !== null) {
          const arch = clusterArchetypeMap.get(pt.cluster_id) ?? null;
          if (arch !== selectedArchetype) continue;
        }
        const { sx, sy } = toScreen(pt.x, pt.y, canvas);
        const dist = Math.hypot(sx - mx, sy - my);
        if (dist < closestDist) {
          closestDist = dist;
          closest = pt;
        }
      }
      return closest;
    },
    [data, toScreen, selectedCluster, selectedArchetype, clusterArchetypeMap]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      if (hit?.id !== hoveredTrack?.id) setHoveredTrack(hit);
      setTooltip({ x: e.clientX, y: e.clientY });
    },
    [draw, hitTest, hoveredTrack]
  );

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    dragMoved.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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
    },
    [hitTest]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
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
    },
    [draw]
  );

  const flyTo = useCallback(
    (x: number, y: number, zoom = 4) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.width - ATLAS_SIDEBAR - PAD;
      const H = canvas.height - PAD * 2;
      transform.current.scale = zoom;
      transform.current.offsetX = W / 2 - (x / 1000) * W * zoom;
      transform.current.offsetY = H / 2 - (y / 1000) * H * zoom;
      draw();
    },
    [draw, ATLAS_SIDEBAR, PAD]
  );

  const handleSelectCluster = useCallback(
    (id: number | null) => {
      setSelectedCluster(id);
      setSelectedTrack(null);
      if (id !== null) {
        const cl = clusters.find((c) => c.cluster_id === id);
        if (cl) flyTo(cl.centroid_x, cl.centroid_y, 4);
      }
    },
    [clusters, flyTo]
  );

  const handleSelectArchetype = useCallback(
    (archetype: string | null) => {
      setSelectedArchetype(archetype);
      setSelectedCluster(null);
      setSelectedTrack(null);
      if (archetype !== null) {
        const centroid = archetypeCentroids.get(archetype);
        if (centroid) flyTo(centroid.x, centroid.y, 2);
      }
    },
    [archetypeCentroids, flyTo]
  );

  const handleSearch = useCallback(() => {
    if (!data || !search.trim()) { setSearchResult(null); return; }
    const q = search.toLowerCase();
    const found = data.points.find(
      (p) =>
        p.name.toLowerCase().includes(q) || p.artist.toLowerCase().includes(q)
    );
    setSearchResult(found ?? null);
    if (found) flyTo(found.x, found.y, 6);
  }, [data, search, flyTo]);

  // Tooltip community info
  const hoveredCluster = hoveredTrack
    ? clusterInfoMap.get(hoveredTrack.cluster_id)
    : null;
  const hoveredArchetype = hoveredTrack
    ? (clusterArchetypeMap.get(hoveredTrack.cluster_id) ?? null)
    : null;
  const hoveredColor = getArchetypeColor(hoveredArchetype);

  if (loading)
    return (
      <div
        className="w-full h-screen flex items-center justify-center"
        style={{ background: "#f7f8f5" }}
      >
        <div className="text-center space-y-2">
          <div
            className="text-sm tracking-widest uppercase"
            style={{ color: "#9ca3af" }}
          >
            Loading Atlas
          </div>
          <div className="text-xs" style={{ color: "#d1d5db" }}>
            9,892 tracks · 204 communities
          </div>
        </div>
      </div>
    );

  if (error)
    return (
      <div
        className="w-full h-screen flex items-center justify-center"
        style={{ background: "#f7f8f5" }}
      >
        <div className="text-sm" style={{ color: "#ef4444" }}>
          Could not load map — is the backend running?
        </div>
      </div>
    );

  return (
    <div
      className="relative w-full h-screen overflow-hidden font-sans"
      style={{ background: "#f7f8f5" }}
    >
      {/* Atlas sidebar — inside GalaxyMap, to the left of canvas */}
      <ClusterSidebar
        clusters={clusters}
        selectedCluster={selectedCluster}
        selectedArchetype={selectedArchetype}
        onSelectCluster={handleSelectCluster}
        onSelectArchetype={handleSelectArchetype}
      />

      {/* Search bar */}
      <div
        className="absolute top-4 z-10 flex items-center gap-2"
        style={{ left: ATLAS_SIDEBAR + 16 }}
      >
        <div
          className="flex items-center gap-0 rounded-xl overflow-hidden"
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search tracks or artists..."
            className="bg-transparent text-sm px-4 py-2.5 w-60 focus:outline-none"
            style={{ color: "#374151" }}
          />
          <button
            onClick={handleSearch}
            className="text-sm px-4 py-2.5 transition-colors"
            style={{
              color: "#9ca3af",
              borderLeft: "1px solid #e5e7eb",
            }}
          >
            ↵
          </button>
        </div>
        {searchResult && (
          <>
            <div className="text-xs" style={{ color: "#6b7280" }}>
              {searchResult.name} · {searchResult.artist}
            </div>
            <button
              onClick={() => { setSearch(""); setSearchResult(null); }}
              className="text-xs transition-colors"
              style={{ color: "#9ca3af" }}
            >
              ✕
            </button>
          </>
        )}
      </div>

      {/* Top-right label */}
      <div className="absolute top-4 right-5 z-10 text-right">
        <div
          className="text-xs font-semibold tracking-wider"
          style={{ color: "#374151" }}
        >
          SPOTIFY ATLAS
        </div>
        <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
          {data?.total.toLocaleString()} tracks · {clusters.length} communities
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: isDragging.current ? "grabbing" : "crosshair" }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => setHoveredTrack(null)}
        onWheel={onWheel}
      />

      {/* Tooltip */}
      {hoveredTrack && (
        <div
          className="fixed z-20 pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 12 }}
        >
          <div
            className="rounded-xl px-3 py-2.5"
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              minWidth: 160,
            }}
          >
            <div
              className="text-xs font-semibold"
              style={{ color: "#111827" }}
            >
              {hoveredTrack.name}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              {hoveredTrack.artist}
            </div>

            {hoveredCluster && (
              <>
                <div
                  className="text-xs mt-1.5 font-medium truncate"
                  style={{ color: "#374151" }}
                >
                  {hoveredCluster.name ?? `Community ${hoveredTrack.cluster_id}`}
                </div>
                {hoveredCluster.canonical_name && (
                  <div
                    className="text-xs mt-0.5 truncate"
                    style={{ color: "#9ca3af" }}
                  >
                    {hoveredCluster.canonical_name}
                  </div>
                )}
                <div className="flex items-center justify-between mt-2 gap-2">
                  {hoveredArchetype && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: `${hoveredColor}18`,
                        color: hoveredColor,
                      }}
                    >
                      {hoveredArchetype}
                    </span>
                  )}
                  <span
                    className="text-xs"
                    style={{
                      color: "#9ca3af",
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    {hoveredCluster.track_count} tracks
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Track detail sidebar */}
      <TrackSidebar
        track={selectedTrack}
        cluster={clusters.find((c) => c.cluster_id === selectedTrack?.cluster_id)}
        onClose={() => setSelectedTrack(null)}
      />
    </div>
  );
}
