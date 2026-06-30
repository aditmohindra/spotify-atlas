"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import type { Era } from "@/lib/types";
import {
  dateToMs,
  msToFraction,
  displayTitle,
  formatDateRange,
} from "./timelineUtils";

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;
const CANVAS_WIDTH = 5200;
const MIN_RADIUS = 6;
const MAX_RADIUS = 32;
const FRICTION = 0.91;
const VELOCITY_STOP = 0.12;
const YEAR_LABEL_BOTTOM = 88;

const PLANET_GRADIENT_NAMED =
  "radial-gradient(circle at 38% 32%, #6ef0a4 0%, #1db954 48%, #0d6b34 100%)";
const PLANET_GRADIENT_UNNAMED =
  "radial-gradient(circle at 38% 32%, #4fd68f 0%, #1aad52 55%, #0a5c2c 100%)";

interface EraNodeLayout {
  era: Era;
  x: number;
  y: number;
  radius: number;
}

export interface HorizontalTimelineProps {
  eras: Era[];
  selectedEraId: number | null;
  onSelectEra: (eraId: number) => void;
  headerHeight?: number;
  sidebarWidth?: number;
}

function eraCenterMs(era: Era): number {
  const start = dateToMs(era.start_date);
  const end = dateToMs(era.end_date);
  return start + (end - start) / 2;
}

function eraDurationMonths(era: Era): number {
  const start = dateToMs(era.start_date);
  const end = dateToMs(era.end_date);
  const days = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
  return days / 30.44;
}

/** Higher = more listening intensity per month → higher visual peak on the wave. */
function eraShapeIntensity(era: Era): number {
  return era.event_count / eraDurationMonths(era);
}

function scaleRadius(eventCount: number, minCount: number, maxCount: number): number {
  const sqrt = Math.sqrt(eventCount);
  const sqrtMin = Math.sqrt(Math.max(1, minCount));
  const sqrtMax = Math.sqrt(Math.max(1, maxCount));
  if (sqrtMax <= sqrtMin) return (MIN_RADIUS + MAX_RADIUS) / 2;
  const t = (sqrt - sqrtMin) / (sqrtMax - sqrtMin);
  return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
}

function buildSplinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function clampOffset(
  offsetX: number,
  scale: number,
  viewportW: number,
  canvasW: number,
): number {
  const scaledW = canvasW * scale;
  const pad = 120;
  if (scaledW <= viewportW) {
    return (viewportW - scaledW) / 2;
  }
  const minX = viewportW - scaledW - pad;
  const maxX = pad;
  return Math.max(minX, Math.min(maxX, offsetX));
}

export function HorizontalTimeline({
  eras,
  selectedEraId,
  onSelectEra,
  headerHeight = 88,
  sidebarWidth = 220,
}: HorizontalTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ scale: 1, offsetX: 80 });
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0, t: 0 });
  const velocity = useRef(0);
  const raf = useRef(0);
  const inertiaRaf = useRef(0);

  const [viewportSize, setViewportSize] = useState({ w: 1200, h: 600 });
  const [hoveredEraId, setHoveredEraId] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0, visible: false });
  const [, tick] = useState(0);
  const forceRedraw = useCallback(() => tick((n) => n + 1), []);

  const yPeak = viewportSize.h * 0.30;
  const yTrough = viewportSize.h * 0.70;
  const yearLabelTop = viewportSize.h - YEAR_LABEL_BOTTOM;

  const { minMs, maxMs, yearMarkers } = useMemo(() => {
    if (eras.length === 0) {
      return { minMs: 0, maxMs: 1, yearMarkers: [] as number[] };
    }
    const min = dateToMs(eras[0].start_date);
    const max = dateToMs(eras[eras.length - 1].end_date);
    const startYear = new Date(min).getFullYear();
    const endYear = new Date(max).getFullYear();
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) years.push(new Date(y, 0, 1).getTime());
    return { minMs: min, maxMs: max, yearMarkers: years };
  }, [eras]);

  const eventBounds = useMemo(() => {
    if (eras.length === 0) return { min: 0, max: 1 };
    const counts = eras.map((e) => e.event_count);
    return { min: Math.min(...counts), max: Math.max(...counts) };
  }, [eras]);

  const eraNodes: EraNodeLayout[] = useMemo(() => {
    if (eras.length === 0) return [];

    const intensities = eras.map(eraShapeIntensity);
    const minIntensity = Math.min(...intensities);
    const maxIntensity = Math.max(...intensities);
    const intensitySpan = maxIntensity - minIntensity || 1;

    return eras.map((era) => {
      const intensity = eraShapeIntensity(era);
      const t = (intensity - minIntensity) / intensitySpan;
      const y = yTrough - t * (yTrough - yPeak);

      return {
        era,
        x: msToFraction(eraCenterMs(era), minMs, maxMs) * CANVAS_WIDTH,
        y,
        radius: scaleRadius(era.event_count, eventBounds.min, eventBounds.max),
      };
    });
  }, [eras, minMs, maxMs, eventBounds, yPeak, yTrough]);

  const spinePath = useMemo(() => {
    if (eraNodes.length === 0) return "";

    const sorted = [...eraNodes].sort((a, b) => a.x - b.x);
    const points = sorted.map((n) => ({ x: n.x, y: n.y }));

    const last = points[points.length - 1];
    const extended = [
      ...points,
      { x: Math.min(CANVAS_WIDTH, last.x + 80), y: last.y },
    ];

    return buildSplinePath(extended);
  }, [eraNodes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const applyTransform = useCallback(() => {
    const t = transform.current;
    t.offsetX = clampOffset(t.offsetX, t.scale, viewportSize.w, CANVAS_WIDTH);
    forceRedraw();
  }, [viewportSize.w, forceRedraw]);

  const stopInertia = useCallback(() => {
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    inertiaRaf.current = 0;
  }, []);

  const startInertia = useCallback(() => {
    stopInertia();
    const step = () => {
      velocity.current *= FRICTION;
      if (Math.abs(velocity.current) < VELOCITY_STOP) {
        velocity.current = 0;
        return;
      }
      transform.current.offsetX += velocity.current;
      applyTransform();
      inertiaRaf.current = requestAnimationFrame(step);
    };
    step();
  }, [applyTransform, stopInertia]);

  useEffect(() => {
    applyTransform();
  }, [viewportSize.w, applyTransform]);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    stopInertia();
  }, [stopInertia]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      stopInertia();
      const el = containerRef.current;
      if (!el) return;

      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        const t = transform.current;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
        const ratio = newScale / t.scale;
        t.offsetX = mx - ratio * (mx - t.offsetX);
        t.scale = newScale;
        applyTransform();
        return;
      }

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      transform.current.offsetX -= delta * 0.85;
      applyTransform();
    },
    [applyTransform, stopInertia],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button[data-era-node]")) return;
      stopInertia();
      isDragging.current = true;
      dragMoved.current = false;
      const rect = containerRef.current?.getBoundingClientRect();
      const mx = rect ? e.clientX - rect.left : e.clientX;
      lastMouse.current = { x: mx, y: e.clientY, t: performance.now() };
      velocity.current = 0;
    },
    [stopInertia],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;

      if (isDragging.current) {
        const now = performance.now();
        const dx = mx - lastMouse.current.x;
        if (Math.abs(dx) > 2) dragMoved.current = true;
        const dt = Math.max(1, now - lastMouse.current.t);
        velocity.current = (dx / dt) * 16;

        transform.current.offsetX += dx;
        lastMouse.current = { x: mx, y: e.clientY, t: now };
        applyTransform();
      }
    },
    [applyTransform],
  );

  const onMouseUp = useCallback(() => {
    if (isDragging.current && dragMoved.current) {
      startInertia();
    }
    isDragging.current = false;
  }, [startInertia]);

  const zoomBy = useCallback(
    (factor: number) => {
      stopInertia();
      const el = containerRef.current;
      if (!el) return;
      const cx = el.clientWidth / 2;
      const t = transform.current;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
      const ratio = newScale / t.scale;
      t.offsetX = cx - ratio * (cx - t.offsetX);
      t.scale = newScale;
      applyTransform();
    },
    [applyTransform, stopInertia],
  );

  const resetView = useCallback(() => {
    stopInertia();
    transform.current = { scale: 1, offsetX: 80 };
    applyTransform();
  }, [applyTransform, stopInertia]);

  const t = transform.current;
  const hoveredNode = eraNodes.find((n) => n.era.era_id === hoveredEraId);

  const canvasStyle: React.CSSProperties = {
    position: "fixed",
    left: sidebarWidth,
    top: headerHeight,
    right: 0,
    bottom: 0,
    zIndex: 1,
    overflow: "hidden",
    cursor: isDragging.current ? "grabbing" : "grab",
    touchAction: "none",
    background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)",
  };

  return (
    <div
      ref={containerRef}
      style={canvasStyle}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => {
        if (isDragging.current && dragMoved.current) startInertia();
        isDragging.current = false;
        setHoveredEraId(null);
        setTooltip((prev) => ({ ...prev, visible: false }));
      }}
    >
      {/* Zoom controls */}
      <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => zoomBy(1.15)}
          className="font-ui text-sm w-9 h-9 rounded-full transition-all hover:scale-105"
          style={{
            color: "rgba(255,255,255,0.85)",
            background: "rgba(15,23,42,0.55)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(8px)",
          }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.15)}
          className="font-ui text-sm w-9 h-9 rounded-full transition-all hover:scale-105"
          style={{
            color: "rgba(255,255,255,0.85)",
            background: "rgba(15,23,42,0.55)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(8px)",
          }}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          className="font-ui text-xs px-3 h-9 rounded-full transition-all hover:scale-105"
          style={{
            color: "rgba(255,255,255,0.65)",
            background: "rgba(15,23,42,0.55)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(8px)",
          }}
        >
          Reset
        </button>
      </div>

      <p
        className="absolute bottom-6 left-6 z-20 font-ui text-[11px] pointer-events-none hidden sm:block"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        Drag to scroll · Ctrl+wheel to zoom
      </p>

      <div
        style={{
          transform: `translateX(${t.offsetX}px) scale(${t.scale})`,
          transformOrigin: "0 0",
          width: CANVAS_WIDTH,
          height: "100%",
          position: "relative",
        }}
      >
        {/* Year axis ticks */}
        {yearMarkers.map((ms) => {
          const x = msToFraction(ms, minMs, maxMs) * CANVAS_WIDTH;
          const year = new Date(ms).getFullYear();
          return (
            <div
              key={`y-${ms}`}
              className="absolute pointer-events-none select-none"
              style={{ left: x, top: yearLabelTop, transform: "translateX(-50%)" }}
            >
              <div
                style={{
                  width: 1,
                  height: 8,
                  margin: "0 auto",
                  background: "rgba(255,255,255,0.2)",
                }}
              />
              <span
                className="font-stat text-[11px] tabular-nums block mt-1.5 text-center"
                style={{ color: "rgba(255,255,255,0.65)", letterSpacing: "0.02em" }}
              >
                {year}
              </span>
            </div>
          );
        })}

        {/* Spine — smooth wave (glow + core) */}
        {spinePath && (
          <svg
            className="absolute left-0 top-0 pointer-events-none overflow-visible"
            width={CANVAS_WIDTH}
            height={viewportSize.h}
            aria-hidden
          >
            <defs>
              <linearGradient id="spine-fade" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(29,185,84,0)" />
                <stop offset="8%" stopColor="rgba(29,185,84,0.45)" />
                <stop offset="50%" stopColor="#1db954" />
                <stop offset="92%" stopColor="rgba(29,185,84,0.45)" />
                <stop offset="100%" stopColor="rgba(29,185,84,0)" />
              </linearGradient>
            </defs>
            <path
              d={spinePath}
              fill="none"
              stroke="rgba(29,185,84,0.22)"
              strokeWidth={8}
              strokeLinecap="round"
              style={{ filter: "blur(4px)" }}
            />
            <path
              d={spinePath}
              fill="none"
              stroke="url(#spine-fade)"
              strokeWidth={2}
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 8px rgba(29,185,84,0.35))" }}
            />
          </svg>
        )}

        {/* Era nodes */}
        {eraNodes.map((node) => {
          const selected = selectedEraId === node.era.era_id;
          const hovered = hoveredEraId === node.era.era_id;
          const named = node.era.is_named;
          const d = node.radius * 2;

          return (
            <button
              type="button"
              key={node.era.era_id}
              data-era-node
              aria-label={`${displayTitle(node.era)}, ${formatDateRange(node.era.start_date, node.era.end_date)}`}
              aria-pressed={selected}
              onClick={(e) => {
                e.stopPropagation();
                onSelectEra(node.era.era_id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onMouseEnter={(e) => {
                setHoveredEraId(node.era.era_id);
                setTooltip({ x: e.clientX, y: e.clientY, visible: true });
              }}
              onMouseLeave={() => {
                setHoveredEraId(null);
                setTooltip((prev) => ({ ...prev, visible: false }));
              }}
              className="absolute p-0 border-0 cursor-pointer rounded-full"
              style={{
                left: node.x - node.radius,
                top: node.y - node.radius,
                width: d,
                height: d,
                background: named ? PLANET_GRADIENT_NAMED : PLANET_GRADIENT_UNNAMED,
                opacity: selected ? 1 : hovered ? 0.98 : named ? 0.95 : 0.55,
                boxShadow: selected
                  ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px rgba(29,185,84,0.45), 0 0 16px rgba(29,185,84,0.4)`
                  : named
                    ? hovered
                      ? `0 0 0 2px rgba(255,255,255,0.75), 0 0 12px rgba(29,185,84,0.35)`
                      : `0 0 0 1px rgba(255,255,255,0.35), 0 0 8px rgba(29,185,84,0.2)`
                    : hovered
                      ? `0 0 0 2px rgba(255,255,255,0.5), 0 0 10px rgba(29,185,84,0.25)`
                      : `0 0 0 1px rgba(255,255,255,0.15), 0 0 4px rgba(29,185,84,0.1)`,
                animation:
                  hovered && !selected
                    ? "timeline-planet-breathe 2.2s ease-in-out infinite"
                    : undefined,
                zIndex: selected ? 30 : hovered ? 20 : named ? 12 : 8,
                transition: "opacity 0.2s ease, box-shadow 0.25s ease",
              }}
            >
              {!named && (
                <>
                  <span
                    className="absolute inset-0 rounded-full border border-dashed pointer-events-none"
                    style={{ borderColor: "rgba(143,168,143,0.65)" }}
                    aria-hidden
                  />
                  {hovered && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 font-ui text-[9px] font-medium whitespace-nowrap px-2 py-0.5 rounded-full pointer-events-none"
                      style={{
                        top: d + 6,
                        color: "rgba(255,255,255,0.75)",
                        background: "rgba(15,23,42,0.75)",
                        border: "1px solid rgba(29,185,84,0.3)",
                      }}
                    >
                      Name me
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {tooltip.visible && hoveredNode && hoveredEraId !== selectedEraId && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl px-3 py-2 shadow-lg"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            background: "rgba(15,23,42,0.92)",
            border: "1px solid rgba(29,185,84,0.25)",
            backdropFilter: "blur(10px)",
            maxWidth: 260,
          }}
        >
          <p className="font-ui text-sm font-medium" style={{ color: "#ffffff" }}>
            {displayTitle(hoveredNode.era)}
          </p>
          <p className="font-ui text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
            {formatDateRange(hoveredNode.era.start_date, hoveredNode.era.end_date)}
          </p>
          <p className="font-stat text-xs tabular-nums mt-1" style={{ color: "#4ade80" }}>
            {hoveredNode.era.event_count.toLocaleString()} events
          </p>
        </div>
      )}
    </div>
  );
}
