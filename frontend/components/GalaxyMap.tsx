"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  useMapData,
  TrackPoint,
  ClusterInfo,
  getArchetypeColor,
} from "@/hooks/useMapData";
import { getCommunityDetail } from "@/lib/api";
import type { CommunityDetail } from "@/lib/types";
import TrackSidebar from "./TrackSidebar";
import ClusterSidebar from "./ClusterSidebar";

// Mixes a hex color toward its own gray value to soften saturation — used for
// map-label text so labels read as subtle cartography, not saturated badges.
function desaturateColor(hex: string, amount = 0.45): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const gray = (r + g + b) / 3;
  const mr = Math.round(r + (gray - r) * amount);
  const mg = Math.round(g + (gray - g) * amount);
  const mb = Math.round(b + (gray - b) * amount);
  return `rgb(${mr}, ${mg}, ${mb})`;
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgbString(h: number, s: number, l: number): string {
  if (s === 0) {
    const v = Math.round(l * 255);
    return `rgb(${v}, ${v}, ${v})`;
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

// Reduces HSL saturation of a hex color — used only for the nebula cloud
// layer so archetype colors read as muted atmosphere rather than neon.
function desaturateForNebula(hex: string, satMult = 0.8): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToRgbString(h, s * satMult, l);
}

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
  layer?: "vibe" | "scene";
  onLayerChange?: (layer: "vibe" | "scene") => void;
}

export default function GalaxyMap({
  embedMode,
  hideUI = false,
  hideControls = false,
  layer,
  onLayerChange,
}: GalaxyMapProps) {
  /** Canvas-only mode: sidebar hidden, all controls hidden, fixed overlay */
  const isEmbed = hideUI || hideControls || embedMode === "true";
  /** Sidebar-only embed: Atlas Regions visible but search/zoom controls hidden, fixed overlay */
  const isSidebar = embedMode === "sidebar";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data, clusters, stats, loading, error } = useMapData(layer ?? "vibe");
  const activeLayer = layer ?? "vibe";

  const [selectedTrack, setSelectedTrack] = useState<TrackPoint | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<TrackPoint | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<TrackPoint | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [showSearch, setShowSearch] = useState(false);

  // Full community detail (description, top artists) for the selected
  // region's panel — fetched lazily from the same endpoint /community/[id]
  // uses, and cached per cluster_id so re-selecting a region within the
  // same session doesn't refetch.
  const [detailCache, setDetailCache] = useState<Map<number, CommunityDetail>>(new Map());
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  const transform = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const raf = useRef<number>(0);

  // canvas-only embed → no sidebar offset; sidebar embed → full 240px offset; full map → 240px
  // Matches ClusterSidebar's floating footprint: 16px margin + 272px panel
  // width + a little breathing room before the canvas content starts.
  const ATLAS_SIDEBAR = isEmbed ? 0 : 304;
  const PAD = 60;

  // Muted per-archetype point color — non-hovered points render with this
  // instead of the full-saturation archetype color, so at default zoom they
  // read as texture within the nebula rather than bright neon dots. Hovered
  // and pinned points still use the vivid archetype/green color untouched.
  const mutedPointColorMap = useMemo(() => {
    const m = new Map<string, string>();
    const archetypes = new Set<string>();
    for (const c of clusters) {
      if (c.cluster_archetype) archetypes.add(c.cluster_archetype);
    }
    for (const archetype of archetypes) {
      m.set(archetype, desaturateForNebula(getArchetypeColor(archetype), 0.55));
    }
    return m;
  }, [clusters]);

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

  // Data-space bounding box of clustered points, for the fit-to-data viewport
  const dataBounds = useMemo(() => {
    if (!data) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of data.points) {
      if (pt.cluster_id === -1) continue;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    if (!Number.isFinite(minX) || maxX - minX < 1 || maxY - minY < 1) return null;
    return { minX, maxX, minY, maxY };
  }, [data]);

  // Static background star field in data space (extends past the map bounds).
  // Pure hash of the index — no mutable seed — so it's stable across renders.
  const stars = useMemo(() => {
    const hash = (n: number) => {
      const v = Math.sin(n * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    return Array.from({ length: 260 }, (_, i) => ({
      x: -150 + hash(i * 4 + 1) * 1300,
      y: -150 + hash(i * 4 + 2) * 1300,
      r: 0.3 + hash(i * 4 + 3) * 0.9,
      a: 0.06 + hash(i * 4 + 4) * 0.3,
    }));
  }, []);

  // Offscreen nebula/density layer: additive per-point blobs rendered once per
  // data load at low resolution, then drawn each frame as a single upscaled
  // (and therefore soft) image. Keeps the glow effect O(1) per frame.
  const nebulaCanvas = useMemo(() => {
    if (!data || typeof document === "undefined") return null;
    const SIZE = 256;
    const off = document.createElement("canvas");
    off.width = SIZE;
    off.height = SIZE;
    const octx = off.getContext("2d");
    if (!octx) return null;
    octx.globalCompositeOperation = "lighter";

    // Muted per-archetype color, computed once per archetype and reused for
    // every point — desaturated in HSL space so the cloud reads as soft
    // atmosphere instead of neon.
    const nebulaColorCache = new Map<string, string>();
    const nebulaColor = (archetype: string) => {
      let c = nebulaColorCache.get(archetype);
      if (!c) {
        c = desaturateForNebula(getArchetypeColor(archetype), 0.5);
        nebulaColorCache.set(archetype, c);
      }
      return c;
    };

    for (const pt of data.points) {
      if (pt.cluster_id === -1) continue;
      const archetype = clusterArchetypeMap.get(pt.cluster_id) ?? null;
      if (!archetype || archetype === "Unknown") continue;
      const px = (pt.x / 1000) * SIZE;
      const py = (pt.y / 1000) * SIZE;
      octx.fillStyle = nebulaColor(archetype);
      octx.globalAlpha = 0.0028;
      octx.beginPath();
      octx.arc(px, py, 8, 0, Math.PI * 2);
      octx.fill();
      octx.globalAlpha = 0.004;
      octx.beginPath();
      octx.arc(px, py, 3, 0, Math.PI * 2);
      octx.fill();
    }

    // Tone-map: even at low per-point alpha, thousands of overlapping additive
    // blobs in the densest cluster can still clip a channel to 255 (pure
    // white), erasing hue. Cap each channel so color always survives.
    const CHANNEL_CAP = 95;
    const imgData = octx.getImageData(0, 0, SIZE, SIZE);
    const px8 = imgData.data;
    for (let i = 0; i < px8.length; i += 4) {
      if (px8[i] > CHANNEL_CAP) px8[i] = CHANNEL_CAP;
      if (px8[i + 1] > CHANNEL_CAP) px8[i + 1] = CHANNEL_CAP;
      if (px8[i + 2] > CHANNEL_CAP) px8[i + 2] = CHANNEL_CAP;
    }
    octx.putImageData(imgData, 0, 0);

    // Soften pass: blur the accumulated texture so it blends into smooth
    // clouds rather than reading as stacked dots.
    const softened = document.createElement("canvas");
    softened.width = SIZE;
    softened.height = SIZE;
    const sctx = softened.getContext("2d");
    if (sctx) {
      sctx.filter = "blur(2.2px)";
      sctx.drawImage(off, 0, 0);
      return softened;
    }

    return off;
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

    // ── 1. Deep atlas background ───────────────────────────────────────────
    const bgGrad = ctx.createRadialGradient(
      canvas.width * 0.5, canvas.height * 0.42, 0,
      canvas.width * 0.5, canvas.height * 0.42, Math.max(canvas.width, canvas.height) * 0.75
    );
    bgGrad.addColorStop(0, "#0a1428");
    bgGrad.addColorStop(0.5, "#050b16");
    bgGrad.addColorStop(1, "#030712");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Faint fixed-in-viewport atmospheric color glows — ambient depth, not
    // tied to data/pan/zoom, so they read as deep-space haze behind everything.
    const atmoGlows: Array<[number, number, number, string]> = [
      [0.28, 0.22, 0.42, "rgba(37, 99, 235, 0.09)"],
      [0.72, 0.58, 0.38, "rgba(20, 184, 166, 0.06)"],
      [0.5, 0.15, 0.32, "rgba(249, 115, 22, 0.05)"],
    ];
    for (const [fx, fy, fr, rgba] of atmoGlows) {
      const g = ctx.createRadialGradient(
        canvas.width * fx, canvas.height * fy, 0,
        canvas.width * fx, canvas.height * fy, canvas.width * fr
      );
      g.addColorStop(0, rgba);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const s = transform.current.scale;

    // ── 2. Static star field (subtle, parallax-free, data-space so it pans/zooms with content) ──
    ctx.globalAlpha = 1;
    for (const star of stars) {
      const { sx, sy } = toScreen(star.x, star.y, canvas);
      if (sx < -10 || sx > canvas.width + 10 || sy < -10 || sy > canvas.height + 10) continue;
      ctx.globalAlpha = star.a;
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── 3. Nebula / density halo layer ─────────────────────────────────────
    // Precomputed offscreen additive-blend image, stretched to cover the
    // current data viewport — a cheap way to get soft colored clouds behind
    // dense clusters without per-point shadows.
    if (nebulaCanvas) {
      const { sx: x0, sy: y0 } = toScreen(0, 0, canvas);
      const { sx: x1, sy: y1 } = toScreen(1000, 1000, canvas);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.24;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(nebulaCanvas, x0, y0, x1 - x0, y1 - y0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    const baseSize = Math.max(1.4, Math.min(3.6, 1.8 * s)) + (isEmbed && !isSidebar ? 0.5 : 0);

    const hasClusterFilter = selectedCluster !== null;
    const hasArchFilter = selectedArchetype !== null;
    const hasFilter = hasClusterFilter || hasArchFilter;
    const highlightId = searchResult?.id;

    // ── 4. Track points — luminous particles (core + soft additive glow) ──
    // "screen" instead of "lighter": in the densest clusters thousands of
    // overlapping points/halos land on the same few pixels, and unbounded
    // additive blending clips straight to white no matter how low each
    // point's own alpha is. "screen" is self-limiting — it still lets a
    // single bright point pop, but stacking many no longer runs away to 255.
    ctx.globalCompositeOperation = "screen";
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
      let color = isNoise ? "#64748b" : archetypeColor;
      let size = baseSize;
      let alpha: number;
      let glow = false;

      if (isNoise) {
        // Noise points: faint on the dark background, never highlighted
        alpha = 0.1;
      } else if (isPinned) {
        color = "#1db954";
        size = 7.5;
        alpha = 1;
        glow = true;
      } else if (isHovered) {
        color = archetypeColor !== "#64748b" ? archetypeColor : "#1db954";
        size = baseSize + 2.5;
        alpha = 1;
        glow = true;
      } else if (!inFilter && hasFilter) {
        alpha = 0.03;
      } else {
        // Kept dim and desaturated at default zoom so points read as
        // texture/grain within the nebula rather than standing out as
        // bright saturated dots — hovered/pinned points above stay at full
        // brightness/saturation so selection feedback is unaffected.
        color = (archetype && mutedPointColorMap.get(archetype)) || color;
        alpha = 0.36;
        glow = true;
      }

      // Soft halo behind pinned/hovered/normal (non-noise) points — kept
      // small and faint so individual points stay distinct instead of
      // merging into a bloom with their neighbors.
      if (glow) {
        ctx.globalAlpha = alpha * 0.1;
        ctx.beginPath();
        ctx.arc(sx, sy, size * 1.15, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // Archetype region labels — always visible in embed modes; otherwise only at zoom < 2.0
    // These are the "major" landmark labels, so they render larger and more
    // vividly than the community pills below.
    if (isEmbed || isSidebar || s < 2.0) {
      const PILL_PX = 12;
      const PILL_PY = 7;
      const PILL_R = 22;
      const FONT = "700 17px 'DM Sans', system-ui, -apple-system, sans-serif";
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
        const isSelected = selectedArchetype === archetype;
        const isDimmed = selectedArchetype !== null && !isSelected;
        const textW = ctx.measureText(archetype).width;
        const pillW = textW + PILL_PX * 2;
        const pillH = 17 + PILL_PY * 2;
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

        // 1. Fill — dark, muted map-label background
        rr(pillX, pillY, pillW, pillH, PILL_R);
        ctx.globalAlpha = isDimmed ? 0.55 : 1;
        ctx.fillStyle = isSelected ? `${color}22` : "rgba(8, 13, 25, 0.85)";
        ctx.fill();

        // 2. Stroke — hint of archetype color, brighter/thicker when selected
        rr(pillX, pillY, pillW, pillH, PILL_R);
        ctx.globalAlpha = isDimmed ? 0.18 : isSelected ? 0.9 : 0.4;
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 1.75 : 1.25;
        ctx.stroke();

        // 3. Text — vivid archetype color so major labels read as prominent
        // landmarks; dims when a different archetype is selected.
        ctx.font = FONT;
        ctx.globalAlpha = isDimmed ? 0.35 : 1;
        ctx.fillStyle = isSelected ? color : desaturateColor(color, 0.2);
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
        const isSelectedCluster = selectedCluster === cl.cluster_id;

        // Pill background — dark, muted map-label background
        ctx.globalAlpha = 1;
        ctx.fillStyle = isSelectedCluster ? `${color}22` : "rgba(8, 13, 25, 0.85)";
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
        // Stroke — thin, low-opacity hint of archetype color; brighter if selected
        ctx.globalAlpha = isSelectedCluster ? 0.85 : 0.3;
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelectedCluster ? 1.5 : 1;
        ctx.stroke();

        // Pill text — subtle by default; vivid when this community is selected
        ctx.globalAlpha = isSelectedCluster ? 1 : 0.85;
        ctx.fillStyle = isSelectedCluster ? color : desaturateColor(color, 0.5);
        ctx.font = PILL_FONT;
        ctx.fillText(label, sx, pillY + PILL_PH / 2);
      }
    }

    ctx.globalAlpha = 1;
  }, [
    data,
    clusters,
    clusterArchetypeMap,
    mutedPointColorMap,
    archetypeCentroids,
    stars,
    nebulaCanvas,
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

  // Fit the camera to the data's bounding box so the map fills the viewport
  // dramatically instead of floating in empty space. Runs once per data load.
  const fitToData = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!dataBounds) {
      transform.current = { scale: 1, offsetX: 0, offsetY: 0 };
      setDisplayScale(1);
      return;
    }
    const W = canvas.width - ATLAS_SIDEBAR - PAD;
    const H = canvas.height - PAD * 2;
    const bw = Math.max(1, dataBounds.maxX - dataBounds.minX);
    const bh = Math.max(1, dataBounds.maxY - dataBounds.minY);
    const MARGIN = 0.06; // 6% breathing room on each side
    const scaleX = ((1 - MARGIN * 2) * 1000) / bw;
    const scaleY = ((1 - MARGIN * 2) * 1000) / bh;
    const scale = Math.max(0.3, Math.min(25, Math.min(scaleX, scaleY)));
    const cx = (dataBounds.minX + dataBounds.maxX) / 2;
    const cy = (dataBounds.minY + dataBounds.maxY) / 2;
    transform.current = {
      scale,
      offsetX: W / 2 - (cx / 1000) * W * scale,
      offsetY: H / 2 - (cy / 1000) * H * scale,
    };
    setDisplayScale(scale);
  }, [dataBounds, ATLAS_SIDEBAR, PAD]);

  // `draw` gets a new identity on every hover/selection change (it's a
  // dependency of itself). Effects that should only run once — resize setup,
  // the initial camera fit — must call the LATEST draw via this ref instead
  // of listing `draw` in their dependency array, otherwise they'd re-fire
  // (and, for the fit effect, reset the camera) on every mouse move.
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  // The <canvas> only mounts once `loading` becomes false, so a plain
  // mount-time effect (deps: []) can miss it entirely if it fires before the
  // canvas exists. A callback ref instead runs exactly when the DOM node
  // attaches, whenever that happens, so the size is always set correctly.
  const setCanvasNode = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (node) {
      node.width = node.offsetWidth;
      node.height = node.offsetHeight;
      drawRef.current();
    }
  }, []);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      drawRef.current();
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => { draw(); }, [draw]);

  // Fit the camera once data (and its bounding box) becomes available —
  // covers both the initial load and every subsequent layer switch. Must
  // depend ONLY on dataBounds: it should never re-run just because the user
  // hovered a point (which changes fitToData/draw identity but not the data).
  useEffect(() => {
    if (!dataBounds) return;
    fitToData();
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(drawRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes fitToData/draw, see comment above
  }, [dataBounds]);

  useEffect(() => {
    setSelectedCluster(null);
    setSelectedArchetype(null);
    setSelectedTrack(null);
    setSearchResult(null);
    setSearch("");
    setShowSearch(false);
    // Cluster IDs aren't comparable across layers (vibe/scene use different
    // community sets), so any cached detail from the previous layer is stale.
    setDetailCache(new Map());
    setDetailLoadingId(null);
  }, [activeLayer]);

  // Fetch full community detail (description + top artists) for the
  // selected region, once per cluster_id per session.
  useEffect(() => {
    if (!selectedTrack || selectedTrack.cluster_id === -1) return;
    const clusterId = selectedTrack.cluster_id;
    if (detailCache.has(clusterId)) return;
    let cancelled = false;
    setDetailLoadingId(clusterId);
    getCommunityDetail(clusterId, 1, activeLayer)
      .then((detail) => {
        if (cancelled) return;
        setDetailCache((prev) => new Map(prev).set(clusterId, detail));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetailLoadingId((id) => (id === clusterId ? null : id));
      });
    return () => { cancelled = true; };
  }, [selectedTrack, activeLayer, detailCache]);

  const selectedDetail =
    selectedTrack && selectedTrack.cluster_id !== -1
      ? detailCache.get(selectedTrack.cluster_id) ?? null
      : null;
  const selectedDetailLoading = selectedTrack != null && detailLoadingId === selectedTrack.cluster_id;

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
    fitToData();
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [fitToData, draw]);

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

  if (loading) {
    const isScene = activeLayer === "scene";
    const communityFallback = isScene ? 171 : 102;
    const totalCommunities = stats?.totalCommunities ?? communityFallback;
    const totalTracks = stats?.totalTracks;

    return (
      <div
        className="w-full flex items-center justify-center"
        style={{ background: "#050913", height: mapHeight, marginTop: mapTop, ...embedFixed }}
      >
        <div className="text-center space-y-2">
          <div
            className="text-sm tracking-widest uppercase"
            style={{ color: "#94a3b8" }}
          >
            Loading {isScene ? "Cultural Atlas" : "Vibe Atlas"} · {totalCommunities}{" "}
            communities
          </div>
          {totalTracks != null && (
            <div className="text-xs" style={{ color: "#475569" }}>
              {totalTracks.toLocaleString()} tracks · {totalCommunities} communities
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error)
    return (
      <div
        className="w-full h-screen flex items-center justify-center"
        style={{ background: "#050913" }}
      >
        <div className="text-sm" style={{ color: "#f87171" }}>
          Could not load map — is the backend running?
        </div>
      </div>
    );

  return (
    <div
      className="relative w-full overflow-hidden font-sans"
      style={{ background: "#050913", height: mapHeight, marginTop: mapTop, ...embedFixed }}
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
          {/* Layer toggle — bottom left */}
          <div
            className="absolute z-10 flex items-center"
            style={{
              bottom: 20,
              left: ATLAS_SIDEBAR + 20,
              background: "rgba(8, 13, 25, 0.82)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: 20,
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => onLayerChange?.("vibe")}
              style={{
                padding: "8px 16px",
                background: activeLayer === "vibe" ? "rgba(29, 185, 84, 0.24)" : "none",
                border: activeLayer === "vibe" ? "1px solid rgba(74, 222, 128, 0.35)" : "1px solid transparent",
                cursor: "pointer",
                color: activeLayer === "vibe" ? "#4ade80" : "#94a3b8",
                fontSize: 12,
                fontWeight: activeLayer === "vibe" ? 700 : 500,
              }}
            >
              Vibe Atlas
            </button>
            <button
              onClick={() => onLayerChange?.("scene")}
              style={{
                padding: "8px 16px",
                background: activeLayer === "scene" ? "rgba(29, 185, 84, 0.24)" : "none",
                border: activeLayer === "scene" ? "1px solid rgba(74, 222, 128, 0.35)" : "1px solid transparent",
                cursor: "pointer",
                color: activeLayer === "scene" ? "#4ade80" : "#94a3b8",
                fontSize: 12,
                fontWeight: activeLayer === "scene" ? 700 : 500,
              }}
            >
              Cultural Atlas
            </button>
          </div>

          {/* Zoom controls — stacked above the layer toggle */}
          <div
            className="absolute z-10 flex items-center gap-0"
            style={{
              bottom: 64,
              left: ATLAS_SIDEBAR + 20,
              background: "rgba(8, 13, 25, 0.82)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: 20,
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={handleZoomOut}
              style={{
                padding: "8px 14px", background: "none", border: "none",
                cursor: "pointer", color: "#cbd5e1", fontSize: 16, lineHeight: 1,
                borderRight: "1px solid rgba(148, 163, 184, 0.18)",
              }}
              aria-label="Zoom out"
            >
              −
            </button>
            <span
              style={{
                padding: "8px 12px",
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 12, color: "#cbd5e1", userSelect: "none",
                minWidth: 44, textAlign: "center",
              }}
            >
              {displayScale.toFixed(1)}x
            </span>
            <button
              onClick={handleZoomIn}
              style={{
                padding: "8px 14px", background: "none", border: "none",
                cursor: "pointer", color: "#cbd5e1", fontSize: 16, lineHeight: 1,
                borderLeft: "1px solid rgba(148, 163, 184, 0.18)",
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
                background: "rgba(8, 13, 25, 0.9)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: 12,
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
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
                style={{ color: "#e2e8f0" }}
              />
              <button
                onClick={handleSearch}
                style={{ padding: "0 12px", height: "100%", background: "none", border: "none", borderLeft: "1px solid rgba(148, 163, 184, 0.18)", cursor: "pointer", color: "#94a3b8", fontSize: 14 }}
              >
                ↵
              </button>
            </div>
          )}
          {showSearch && searchResult && (
            <div
              className="absolute z-10 text-xs"
              style={{ bottom: 116, right: 20, background: "rgba(8, 13, 25, 0.9)", border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: 8, padding: "6px 10px", color: "#94a3b8", boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}
            >
              {searchResult.name} · {searchResult.artist}
              <button onClick={() => { setSearch(""); setSearchResult(null); }} style={{ marginLeft: 8, color: "#64748b", background: "none", border: "none", cursor: "pointer" }}>✕</button>
            </div>
          )}

          {/* Bottom-right icons: search + crosshair */}
          <div
            className="absolute z-10 flex flex-col gap-2"
            style={{ bottom: 84, right: 20 }}
          >
            <button
              onClick={() => { setShowSearch((v) => !v); if (showSearch) { setSearch(""); setSearchResult(null); } }}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: showSearch ? "rgba(29, 185, 84, 0.16)" : "rgba(8, 13, 25, 0.82)",
                backdropFilter: "blur(10px)",
                border: `1px solid ${showSearch ? "rgba(74, 222, 128, 0.4)" : "rgba(148, 163, 184, 0.18)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                color: showSearch ? "#4ade80" : "#94a3b8",
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
                background: "rgba(8, 13, 25, 0.82)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                color: "#94a3b8",
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

          {/* Legend — bottom-right, above the icon stack */}
          <div
            className="absolute z-10 flex items-start gap-2"
            style={{
              bottom: 20, right: 20,
              background: "rgba(8, 13, 25, 0.82)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: 12,
              padding: "10px 14px",
              maxWidth: 220,
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#4ade80", marginTop: 5, flexShrink: 0,
                boxShadow: "0 0 6px rgba(74, 222, 128, 0.7)",
              }}
            />
            <div style={{ fontSize: 11, lineHeight: 1.5, color: "#94a3b8" }}>
              Each dot is a track.<br />Colors show ML-discovered communities.
            </div>
          </div>
        </>
      )}

      {/* Canvas */}
      <canvas
        ref={setCanvasNode}
        className="w-full h-full"
        style={{ cursor: isDragging.current ? "grabbing" : "pointer" }}
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
              background: "rgba(8, 13, 25, 0.94)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              minWidth: 160,
            }}
          >
            <div
              className="text-xs font-semibold"
              style={{ color: "#f1f5f9" }}
            >
              {hoveredTrack.name}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>
              {hoveredTrack.artist}
            </div>

            {hoveredCluster && (
              <>
                <div
                  className="text-xs mt-1.5 font-medium truncate"
                  style={{ color: "#cbd5e1" }}
                >
                  {hoveredCluster.name ?? `Community ${hoveredTrack.cluster_id}`}
                </div>
                {hoveredCluster.canonical_name && (
                  <div
                    className="text-xs mt-0.5 truncate"
                    style={{ color: "#64748b" }}
                  >
                    {hoveredCluster.canonical_name}
                  </div>
                )}
                <div className="flex items-center justify-between mt-2 gap-2">
                  {hoveredArchetype && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: `${hoveredColor}22`,
                        color: hoveredColor,
                      }}
                    >
                      {hoveredArchetype}
                    </span>
                  )}
                  <span
                    className="text-xs"
                    style={{
                      color: "#64748b",
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

      {/* Selected region detail sidebar */}
      <TrackSidebar
        track={selectedTrack}
        cluster={clusters.find((c) => c.cluster_id === selectedTrack?.cluster_id)}
        detail={selectedDetail}
        detailLoading={selectedDetailLoading}
        totalTracks={data?.total ?? 0}
        onClose={() => setSelectedTrack(null)}
      />
    </div>
  );
}
