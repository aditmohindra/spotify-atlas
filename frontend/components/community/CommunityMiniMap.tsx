"use client";

import { useEffect, useRef, useState } from "react";

export interface MiniMapPoint {
  x: number;
  y: number;
  /** Overrides the default `color` prop when set (used for multi-archetype previews). */
  color?: string;
}

export interface MiniMapLabel {
  x: number;
  y: number;
  text: string;
  color: string;
}

interface CommunityMiniMapProps {
  points: MiniMapPoint[];
  /** Fallback fill when a point has no per-point color. */
  color?: string;
  width?: number;
  height?: number;
  /**
   * When true, fill the parent and redraw on resize (hero atlas).
   * `width`/`height` become fallbacks until the first measure.
   */
  fill?: boolean;
  /** Optional text labels in data-space coordinates (hero atlas). */
  labels?: MiniMapLabel[];
  /** Cap points drawn for performance; keeps a deterministic subsample. */
  maxPoints?: number;
  className?: string;
  style?: React.CSSProperties;
}

function subsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    out.push(items[Math.floor(i * step)]!);
  }
  return out;
}

/**
 * Lightweight canvas thumbnail of galaxy track points, auto-scaled to fit.
 * Used for per-community cards and the header hero atlas preview.
 */
export default function CommunityMiniMap({
  points,
  color = "#1db954",
  width: widthProp = 200,
  height: heightProp = 120,
  fill = false,
  labels,
  maxPoints = 800,
  className,
  style,
}: CommunityMiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: widthProp, h: heightProp });

  useEffect(() => {
    if (!fill) {
      setSize({ w: widthProp, h: heightProp });
      return;
    }
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;

    const measure = () => {
      const rect = parent.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [fill, widthProp, heightProp]);

  const width = size.w;
  const height = size.h;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Dark galaxy backdrop
    ctx.fillStyle = "#060a14";
    ctx.fillRect(0, 0, width, height);

    // Soft vignette
    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      Math.min(width, height) * 0.15,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.7,
    );
    vignette.addColorStop(0, "rgba(29,185,84,0.04)");
    vignette.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    if (points.length === 0) return;

    const drawn = subsample(points, maxPoints);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of drawn) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    // Include label positions in bounds so text stays inside the frame
    if (labels) {
      for (const l of labels) {
        if (l.x < minX) minX = l.x;
        if (l.x > maxX) maxX = l.x;
        if (l.y < minY) minY = l.y;
        if (l.y > maxY) maxY = l.y;
      }
    }

    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    const pad = 10;
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;

    const project = (x: number, y: number) => ({
      px: offsetX + (x - minX) * scale,
      py: offsetY + (y - minY) * scale,
    });

    const radius = points.length > 2000 ? 0.9 : points.length > 400 ? 1.15 : 1.6;

    for (const p of drawn) {
      const { px, py } = project(p.x, p.y);
      ctx.beginPath();
      ctx.fillStyle = p.color ?? color;
      ctx.globalAlpha = 0.85;
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (labels && labels.length > 0) {
      ctx.font = `600 9px var(--font-dm-sans), system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const label of labels) {
        const { px, py } = project(label.x, label.y);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillText(label.text, px + 0.5, py + 0.5);
        ctx.fillStyle = label.color;
        ctx.globalAlpha = 0.95;
        ctx.fillText(label.text, px, py);
      }
      ctx.globalAlpha = 1;
    }
  }, [points, color, width, height, labels, maxPoints]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{
        width: fill ? "100%" : width,
        height: fill ? "100%" : height,
        display: "block",
        borderRadius: "inherit",
        ...style,
      }}
      aria-hidden
    />
  );
}
