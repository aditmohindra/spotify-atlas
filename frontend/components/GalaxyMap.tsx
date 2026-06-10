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

interface GalaxyMapProps {
  /**
   * "true"    → canvas-only embed: hides sidebar + all controls, fixed inset overlay
   * "sidebar" → dashboard embed: hides search/zoom controls but keeps Atlas Regions sidebar
   * undefined → full /map page (default)
   */
  embedMode?: string;
  /** @deprecated use embedMode="true" */
  hideUI?: boolean;
  /** @deprecated use embedMode="true" */
  hideControls?: boolean;
}

export default function GalaxyMap({ embedMode, hideUI = false, hideControls = false }: GalaxyMapProps) {
  /** Canvas-only mode: sidebar hidden, all controls hidden, fixed overlay */
  const isEmbed = hideUI || hideControls || embedMode === "true";
  /** Sidebar-only embed: Atlas Regions visible but search/zoom controls hidden, fixed overlay */
  const isSidebar = embedMode === "sidebar";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data, clusters, loading, error } = useMapData();

  const [selectedTrack, setSelectedTrack] = useState<TrackPoint | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<TrackPoint | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<TrackPoint | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [showSearch, setShowSearch] = useState(false);

  const transform = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const raf = useRef<number>(0);

  // canvas-only embed → no sidebar offset; sidebar embed → full 240px offset; full map → 240px
  const ATLAS_SIDEBAR = isEmbed ? 0 : 240;
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
    const baseSize = Math.max(1.5, Math.min(4, 2 * s)) + (isEmbed && !isSidebar ? 0.5 : 0);

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

    // Archetype region labels — always visible in embed modes; otherwise only at zoom < 2.0
    if (isEmbed || isSidebar || s < 2.0) {
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
    isEmbed,
    isSidebar,
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
      setDisplayScale(newScale);
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

  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const t = transform.current;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const newScale = Math.min(25, t.scale * 1.3);
    const ratio = newScale / t.scale;
    t.offsetX = cx - ratio * (cx - t.offsetX);
    t.offsetY = cy - ratio * (cy - t.offsetY);
    t.scale = newScale;
    setDisplayScale(newScale);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const t = transform.current;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const newScale = Math.max(0.3, t.scale / 1.3);
    const ratio = newScale / t.scale;
    t.offsetX = cx - ratio * (cx - t.offsetX);
    t.offsetY = cy - ratio * (cy - t.offsetY);
    t.scale = newScale;
    setDisplayScale(newScale);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  const handleResetView = useCallback(() => {
    transform.current = { scale: 1, offsetX: 0, offsetY: 0 };
    setDisplayScale(1);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  // Tooltip community info
  const hoveredCluster = hoveredTrack
    ? clusterInfoMap.get(hoveredTrack.cluster_id)
    : null;
  const hoveredArchetype = hoveredTrack
    ? (clusterArchetypeMap.get(hoveredTrack.cluster_id) ?? null)
    : null;
  const hoveredColor = getArchetypeColor(hoveredArchetype);

  const mapHeight = isEmbed || isSidebar ? "100vh" : "calc(100vh - 64px)";
  const mapTop = isEmbed || isSidebar ? 0 : 64;
  // Both embed modes use fixed positioning to cover the NavBar inside the iframe
  const embedFixed: React.CSSProperties =
    isEmbed || isSidebar
      ? { position: "fixed", inset: 0, zIndex: 9999, marginTop: 0, height: "100vh" }
      : {};

  if (loading)
    return (
      <div
        className="w-full flex items-center justify-center"
        style={{ background: "#f7f8f5", height: mapHeight, marginTop: mapTop, ...embedFixed }}
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
      className="relative w-full overflow-hidden font-sans"
      style={{ background: "#f7f8f5", height: mapHeight, marginTop: mapTop, ...embedFixed }}
    >
      {/* Atlas Regions sidebar — shown in full map and sidebar-embed modes */}
      {(!isEmbed || isSidebar) && (
        <ClusterSidebar
          clusters={clusters}
          selectedCluster={selectedCluster}
          selectedArchetype={selectedArchetype}
          onSelectCluster={handleSelectCluster}
          onSelectArchetype={handleSelectArchetype}
        />
      )}

      {/* Bottom controls — only shown on the full /map page (not in any embed mode) */}
      {!isEmbed && !isSidebar && (
        <>
          {/* Zoom controls — bottom center of canvas area */}
          <div
            className="absolute z-10 flex items-center gap-0"
            style={{
              bottom: 20,
              left: ATLAS_SIDEBAR + 20,
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 20,
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={handleZoomOut}
              style={{
                padding: "6px 14px", background: "none", border: "none",
                cursor: "pointer", color: "#374151", fontSize: 16, lineHeight: 1,
                borderRight: "1px solid #e5e7eb",
              }}
              aria-label="Zoom out"
            >
              −
            </button>
            <span
              style={{
                padding: "6px 12px",
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 12, color: "#374151", userSelect: "none",
                minWidth: 44, textAlign: "center",
              }}
            >
              {displayScale.toFixed(1)}x
            </span>
            <button
              onClick={handleZoomIn}
              style={{
                padding: "6px 14px", background: "none", border: "none",
                cursor: "pointer", color: "#374151", fontSize: 16, lineHeight: 1,
                borderLeft: "1px solid #e5e7eb",
              }}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>

          {/* Search input (expands above the icon when showSearch=true) */}
          {showSearch && (
            <div
              className="absolute z-10 flex items-center gap-0 overflow-hidden"
              style={{
                bottom: 64, right: 20,
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            >
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); if (e.key === "Escape") { setShowSearch(false); setSearch(""); setSearchResult(null); } }}
                placeholder="Search tracks or artists…"
                autoFocus
                className="bg-transparent text-sm px-4 py-2.5 w-56 focus:outline-none"
                style={{ color: "#374151" }}
              />
              <button
                onClick={handleSearch}
                style={{ padding: "0 12px", height: "100%", background: "none", border: "none", borderLeft: "1px solid #e5e7eb", cursor: "pointer", color: "#9ca3af", fontSize: 14 }}
              >
                ↵
              </button>
            </div>
          )}
          {showSearch && searchResult && (
            <div
              className="absolute z-10 text-xs"
              style={{ bottom: 116, right: 20, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", color: "#6b7280", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
            >
              {searchResult.name} · {searchResult.artist}
              <button onClick={() => { setSearch(""); setSearchResult(null); }} style={{ marginLeft: 8, color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>✕</button>
            </div>
          )}

          {/* Bottom-right icons: search + crosshair */}
          <div
            className="absolute z-10 flex flex-col gap-2"
            style={{ bottom: 20, right: 20 }}
          >
            <button
              onClick={() => { setShowSearch((v) => !v); if (showSearch) { setSearch(""); setSearchResult(null); } }}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: showSearch ? "#f0fdf4" : "#ffffff",
                border: `1px solid ${showSearch ? "#bbf7d0" : "#e5e7eb"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                color: showSearch ? "#166534" : "#6b7280",
              }}
              aria-label="Toggle search"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              onClick={handleResetView}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                color: "#6b7280",
              }}
              aria-label="Reset view"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="8" y1="2" x2="8" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="8" y1="12" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="2" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="12" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </>
      )}

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
