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
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

const SEARCH_MAX_RESULTS = 10;

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

const MIN_VISIBLE_POINTS = 15;
const LABEL_MAX_DRIFT = 25;

type ScreenCentroid = { sx: number; sy: number; count: number };

/** Pick the screen point with the most neighbors — tracks visual density better than mean. */
function densityPeakCentroid(samples: Array<{ sx: number; sy: number }>): { sx: number; sy: number } {
  if (samples.length === 0) return { sx: 0, sy: 0 };
  if (samples.length === 1) return samples[0];
  const R = 36;
  let best = samples[0];
  let bestCount = 0;
  const step = samples.length > 240 ? Math.ceil(samples.length / 240) : 1;
  for (let i = 0; i < samples.length; i += step) {
    const p = samples[i];
    let count = 0;
    for (let j = 0; j < samples.length; j += step) {
      if (Math.hypot(samples[j].sx - p.sx, samples[j].sy - p.sy) <= R) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = p;
    }
  }
  return best;
}

/** Mean screen position of map points currently inside the canvas viewport. */
function computeViewportCentroids(
  points: TrackPoint[],
  canvas: HTMLCanvasElement,
  toScreen: (x: number, y: number, canvas: HTMLCanvasElement) => { sx: number; sy: number },
  bounds: { minSx: number; maxSx: number; minSy: number; maxSy: number }
): {
  byCluster: Map<number, ScreenCentroid>;
} {
  const samplesByCluster = new Map<number, Array<{ sx: number; sy: number }>>();

  for (const pt of points) {
    if (pt.cluster_id === -1) continue;
    const { sx, sy } = toScreen(pt.x, pt.y, canvas);
    if (sx < bounds.minSx || sx > bounds.maxSx || sy < bounds.minSy || sy > bounds.maxSy) continue;

    const list = samplesByCluster.get(pt.cluster_id) ?? [];
    list.push({ sx, sy });
    samplesByCluster.set(pt.cluster_id, list);
  }

  const byClusterOut = new Map<number, ScreenCentroid>();
  for (const [clusterId, samples] of samplesByCluster) {
    const peak = densityPeakCentroid(samples);
    byClusterOut.set(clusterId, { sx: peak.sx, sy: peak.sy, count: samples.length });
  }

  return { byCluster: byClusterOut };
}

/** Per-archetype anchor = centroid of the densest visible cluster in that archetype. */
function computeArchetypeAnchors(
  byCluster: Map<number, ScreenCentroid>,
  clusterArchetypeMap: Map<number, string | null>
): Map<string, ScreenCentroid> {
  const best = new Map<string, ScreenCentroid>();
  for (const [clusterId, centroid] of byCluster) {
    if (centroid.count < MIN_VISIBLE_POINTS) continue;
    const archetype = clusterArchetypeMap.get(clusterId) ?? null;
    if (!archetype || archetype === "Unknown") continue;
    const prev = best.get(archetype);
    if (!prev || centroid.count > prev.count) best.set(archetype, centroid);
  }
  return best;
}

/** Push overlapping label anchors apart, clamped to maxDrift px from origin. */
function resolvePointCollisions(
  labels: Array<{ cx: number; cy: number; ox: number; oy: number }>,
  minDist: number,
  push: number,
  maxDrift: number,
  passes = 3
) {
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          a.cx -= nx * push;
          a.cy -= ny * push;
          b.cx += nx * push;
          b.cy += ny * push;
        }
      }
    }
    for (const lbl of labels) {
      const ddx = lbl.cx - lbl.ox;
      const ddy = lbl.cy - lbl.oy;
      const d = Math.hypot(ddx, ddy);
      if (d > maxDrift) {
        lbl.cx = lbl.ox + (ddx / d) * maxDrift;
        lbl.cy = lbl.oy + (ddy / d) * maxDrift;
      }
    }
  }
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

  const searchInputRef = useRef<HTMLInputElement>(null);
  const flyAnim = useRef<number | null>(null);
  const pulseAnim = useRef<number | null>(null);

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
      m.set(archetype, desaturateForNebula(getArchetypeColor(archetype), 0.85));
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

  const searchMatches = useMemo(() => {
    if (!data || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    const buckets: TrackPoint[][] = [[], [], [], []];
    for (const pt of data.points) {
      const name = pt.name.toLowerCase();
      const artist = pt.artist.toLowerCase();
      if (!name.includes(q) && !artist.includes(q)) continue;
      let rank = 3;
      if (name.startsWith(q)) rank = 0;
      else if (artist.startsWith(q)) rank = 1;
      else if (name.includes(q)) rank = 2;
      buckets[rank].push(pt);
    }
    const result: TrackPoint[] = [];
    for (const bucket of buckets) {
      for (const pt of bucket) {
        result.push(pt);
        if (result.length >= SEARCH_MAX_RESULTS) return result;
      }
    }
    return result;
  }, [data, search]);

  // Static background star field in data space (extends past the map bounds).
  // Pure hash of the index — no mutable seed — so it's stable across renders.
  const stars = useMemo(() => {
    const hash = (n: number) => {
      const v = Math.sin(n * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    return Array.from({ length: 500 }, (_, i) => ({
      x: -150 + hash(i * 4 + 1) * 1300,
      y: -150 + hash(i * 4 + 2) * 1300,
      r: 0.35 + hash(i * 4 + 3) * 1.0,
      a: 0.1 + hash(i * 4 + 4) * 0.38,
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
        c = desaturateForNebula(getArchetypeColor(archetype), 0.9);
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
      octx.globalAlpha = 0.0034;
      octx.beginPath();
      octx.arc(px, py, 8, 0, Math.PI * 2);
      octx.fill();
      octx.globalAlpha = 0.005;
      octx.beginPath();
      octx.arc(px, py, 3, 0, Math.PI * 2);
      octx.fill();
    }

    // Tone-map: even at low per-point alpha, thousands of overlapping additive
    // blobs in the densest cluster can still clip a channel to 255 (pure
    // white), erasing hue. Cap each channel so color always survives.
    const CHANNEL_CAP = 115;
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
      ctx.globalAlpha = 0.32;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(nebulaCanvas, x0, y0, x1 - x0, y1 - y0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    const baseSize = Math.max(1.55, Math.min(3.9, 2.05 * s)) + (isEmbed && !isSidebar ? 0.5 : 0);

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
        // Softened saturation at default zoom so points read as texture
        // within the nebula, but opaque enough to stay individually visible
        // inside dense clusters. Hovered/pinned stay at full brightness.
        color = (archetype && mutedPointColorMap.get(archetype)) || color;
        alpha = 0.64;
        glow = true;
      }

      // Soft halo behind pinned/hovered/normal (non-noise) points — kept
      // small and faint so individual points stay distinct instead of
      // merging into a bloom with their neighbors.
      if (glow) {
        ctx.globalAlpha = alpha * 0.07;
        ctx.beginPath();
        ctx.arc(sx, sy, size * 1.12, 0, Math.PI * 2);
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

    // Pulsing ring on search-selected track so it stays visible after fly-to.
    if (searchResult) {
      const { sx, sy } = toScreen(searchResult.x, searchResult.y, canvas);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 380);
      ctx.strokeStyle = "#1db954";
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.35 + pulse * 0.45;
      ctx.beginPath();
      ctx.arc(sx, sy, 12 + pulse * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.55 + pulse * 0.35;
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = "#1db954";
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const viewportBounds = {
      minSx: ATLAS_SIDEBAR + 10,
      maxSx: canvas.width - 10,
      minSy: PAD + 10,
      maxSy: canvas.height - 10,
    };
    const { byCluster: visibleClusterCentroids } = computeViewportCentroids(
      data.points,
      canvas,
      toScreen,
      viewportBounds
    );
    const visibleArchetypeAnchors = computeArchetypeAnchors(
      visibleClusterCentroids,
      clusterArchetypeMap
    );

    // Archetype region labels — major landmarks at very low zoom only; community
    // pills take over once zoomed in enough to distinguish individual clusters.
    if (isEmbed || isSidebar || s < 0.82) {
      const PILL_PX = 12;
      const PILL_PY = 7;
      const PILL_R = 22;
      const FONT = "700 17px 'DM Sans', system-ui, -apple-system, sans-serif";
      ctx.font = FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Build list of visible labels anchored to viewport-visible point centroids
      type LabelEntry = { archetype: string; cx: number; cy: number; ox: number; oy: number };
      const labels: LabelEntry[] = [];
      for (const [archetype, centroid] of visibleArchetypeAnchors) {
        const { sx, sy, count } = centroid;
        if (count < MIN_VISIBLE_POINTS) continue;
        if (sx < ATLAS_SIDEBAR + 20 || sx > canvas.width - PAD - 20) continue;
        if (sy < PAD + 20 || sy > canvas.height - PAD - 20) continue;
        labels.push({ archetype, cx: sx, cy: sy, ox: sx, oy: sy });
      }

      // Collision resolution: nudge overlapping pairs, clamp drift from true anchor
      resolvePointCollisions(labels, 100, 18, LABEL_MAX_DRIFT);

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

    // Community pills — show for every dense visible cluster once zoomed in slightly
    if (s >= 0.75) {
      const zoomedOut = s < 1.5;
      const PILL_FONT = zoomedOut
        ? "600 10px 'DM Sans', system-ui, -apple-system, sans-serif"
        : "600 11px 'DM Sans', system-ui, -apple-system, sans-serif";
      const PILL_PH = (zoomedOut ? 10 : 11) + 8; // fixed pill height
      const PILL_PAD_X = 6;
      const PILL_R = PILL_PH / 2;

      ctx.font = PILL_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 1. Dense visible clusters in viewport, respecting active filter
      let candidates = clusters.filter((cl) => {
        const visible = visibleClusterCentroids.get(cl.cluster_id);
        if (!visible || visible.count < MIN_VISIBLE_POINTS) return false;
        if (hasClusterFilter && cl.cluster_id !== selectedCluster) return false;
        if (hasArchFilter && (clusterArchetypeMap.get(cl.cluster_id) ?? null) !== selectedArchetype) return false;
        const { sx, sy } = visible;
        if (sx < ATLAS_SIDEBAR + 10 || sx > canvas.width - 10) return false;
        if (sy < PAD + 10 || sy > canvas.height - 10) return false;
        return true;
      });

      // 2. Sort by visible point count so densest in-view clusters win collisions
      candidates = candidates.slice().sort((a, b) => {
        const va = visibleClusterCentroids.get(a.cluster_id)?.count ?? 0;
        const vb = visibleClusterCentroids.get(b.cluster_id)?.count ?? 0;
        return vb - va || b.track_count - a.track_count;
      });

      // 3. Draw every dense visible cluster at its density-peak anchor (no nudging —
      // collision push was stacking labels off-cluster in crowded regions).
      for (const cl of candidates) {
        const visible = visibleClusterCentroids.get(cl.cluster_id)!;
        const sx = visible.sx;
        const sy = visible.sy;
        const label = cl.name ?? `${cl.cluster_id}`;
        const textW = ctx.measureText(label).width;
        const pillW = textW + PILL_PAD_X * 2;
        const pillX = sx - pillW / 2;
        const pillY = sy - PILL_PH / 2;

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
        ctx.fillText(label, sx, sy);
      }
    }

    ctx.globalAlpha = 1;
  }, [
    data,
    clusters,
    clusterArchetypeMap,
    mutedPointColorMap,
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

  useEffect(() => {
    if (!showSearch) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [showSearch]);

  // Keep the search-highlight pulse animating until the selection changes.
  useEffect(() => {
    if (!searchResult) return;
    const tick = () => {
      drawRef.current();
      pulseAnim.current = requestAnimationFrame(tick);
    };
    pulseAnim.current = requestAnimationFrame(tick);
    return () => {
      if (pulseAnim.current !== null) {
        cancelAnimationFrame(pulseAnim.current);
        pulseAnim.current = null;
      }
    };
  }, [searchResult]);

  useEffect(() => {
    return () => {
      if (flyAnim.current !== null) cancelAnimationFrame(flyAnim.current);
      if (pulseAnim.current !== null) cancelAnimationFrame(pulseAnim.current);
    };
  }, []);

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
    (x: number, y: number, zoom = 4, animated = false) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.width - ATLAS_SIDEBAR - PAD;
      const H = canvas.height - PAD * 2;
      const targetScale = zoom;
      const targetOffsetX = W / 2 - (x / 1000) * W * zoom;
      const targetOffsetY = H / 2 - (y / 1000) * H * zoom;

      if (flyAnim.current !== null) {
        cancelAnimationFrame(flyAnim.current);
        flyAnim.current = null;
      }

      if (!animated) {
        transform.current.scale = targetScale;
        transform.current.offsetX = targetOffsetX;
        transform.current.offsetY = targetOffsetY;
        setDisplayScale(targetScale);
        draw();
        return;
      }

      const start = {
        scale: transform.current.scale,
        offsetX: transform.current.offsetX,
        offsetY: transform.current.offsetY,
      };
      const startTime = performance.now();
      const duration = 720;
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration);
        const e = easeOutCubic(t);
        transform.current.scale = start.scale + (targetScale - start.scale) * e;
        transform.current.offsetX = start.offsetX + (targetOffsetX - start.offsetX) * e;
        transform.current.offsetY = start.offsetY + (targetOffsetY - start.offsetY) * e;
        setDisplayScale(transform.current.scale);
        draw();
        if (t < 1) {
          flyAnim.current = requestAnimationFrame(step);
        } else {
          flyAnim.current = null;
        }
      };

      flyAnim.current = requestAnimationFrame(step);
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

  const selectSearchResult = useCallback(
    (track: TrackPoint) => {
      setSearchResult(track);
      setSelectedTrack(track);
      setSearch("");
      setShowSearch(false);
      flyTo(track.x, track.y, 6, true);
    },
    [flyTo]
  );

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearch("");
  }, []);

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

          {/* Track search panel — opens above the bottom-right icon cluster */}
          {showSearch && (
            <div
              className="absolute z-20 flex flex-col overflow-hidden"
              style={{
                bottom: 132,
                right: 20,
                width: 340,
                background: "rgba(5, 10, 20, 0.88)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: 16,
                boxShadow: "0 12px 40px rgba(0,0,0,0.55), 0 0 32px rgba(37, 99, 235, 0.06)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.12)" }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ color: "#64748b", flexShrink: 0 }}>
                  <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchMatches[0]) selectSearchResult(searchMatches[0]);
                    if (e.key === "Escape") closeSearch();
                  }}
                  placeholder="Search for a track or artist..."
                  className="bg-transparent text-sm w-full focus:outline-none"
                  style={{ color: "#e2e8f0" }}
                />
              </div>

              {search.trim() && (
                <div
                  className="overflow-y-auto"
                  style={{ maxHeight: 320 }}
                >
                  {searchMatches.length === 0 ? (
                    <div className="px-4 py-5 text-sm text-center" style={{ color: "#64748b" }}>
                      No tracks found
                    </div>
                  ) : (
                    searchMatches.map((pt) => (
                      <button
                        key={pt.id}
                        type="button"
                        onClick={() => selectSearchResult(pt)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                        style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.08)" }}
                      >
                        <ImageWithFallback
                          src={pt.image_url}
                          alt={pt.name}
                          size={36}
                          shape="square"
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-medium truncate"
                            style={{ color: "#f1f5f9" }}
                          >
                            {pt.name}
                          </div>
                          <div
                            className="text-xs truncate mt-0.5"
                            style={{ color: "#94a3b8" }}
                          >
                            {pt.artist}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Bottom-right icons: search + crosshair */}
          <div
            className="absolute z-10 flex flex-col gap-2"
            style={{ bottom: 84, right: 20 }}
          >
            <button
              onClick={() => { setShowSearch((v) => !v); if (showSearch) closeSearch(); }}
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
