"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getEras, getEraDepth, ApiError } from "@/lib/api";
import type { Era, EraDepth, EraTimelineType } from "@/lib/types";
import { HorizontalTimeline } from "@/components/timeline/HorizontalTimeline";
import { EraDetailModal } from "@/components/timeline/EraDetailModal";

const HEADER_HEIGHT = 88;
const SIDEBAR_WIDTH = 220;

export default function TimelinePage() {
  const [eraType, setEraType] = useState<EraTimelineType>("discovery");
  const [eras, setEras] = useState<Era[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEraId, setSelectedEraId] = useState<number | null>(null);
  const [depth, setDepth] = useState<EraDepth | null>(null);
  const [depthLoading, setDepthLoading] = useState(false);
  const [depthError, setDepthError] = useState<string | null>(null);
  const selectedEraIdRef = useRef<number | null>(null);
  selectedEraIdRef.current = selectedEraId;

  useEffect(() => {
    document.title = "Timeline · Spotify Atlas";
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    // Switching timelines invalidates any open era detail — clear it directly
    // rather than relying on the selectedEraId-driven effect below to cascade.
    setSelectedEraId(null);
    setDepth(null);
    setDepthLoading(false);
    setDepthError(null);
    getEras(1, eraType, { signal: controller.signal })
      .then(setEras)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiError
            ? `Could not load timeline (${err.status}).`
            : "Could not load timeline.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [eraType]);

  useEffect(() => {
    if (selectedEraId === null) {
      setDepth(null);
      setDepthLoading(false);
      setDepthError(null);
      return;
    }

    const eraId = selectedEraId;
    setDepth(null);
    setDepthLoading(true);
    setDepthError(null);

    getEraDepth(eraId, 3)
      .then((data) => {
        if (selectedEraIdRef.current === eraId) {
          setDepth(data);
          setDepthError(null);
        }
      })
      .catch((err: unknown) => {
        if (selectedEraIdRef.current === eraId) {
          setDepth(null);
          setDepthError(err instanceof Error ? err.message : "Request failed");
        }
      })
      .finally(() => {
        if (selectedEraIdRef.current === eraId) setDepthLoading(false);
      });
  }, [selectedEraId]);

  const handleSelectEra = useCallback((id: number) => {
    setSelectedEraId(id);
    setDepth(null);
    setDepthLoading(true);
    setDepthError(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedEraId(null);
    setDepth(null);
    setDepthLoading(false);
    setDepthError(null);
  }, []);

  const handleEraUpdate = useCallback((eraId: number, patch: Partial<Era>) => {
    setEras((prev) => prev.map((e) => (e.era_id === eraId ? { ...e, ...patch } : e)));
  }, []);

  const selectedEra = eras.find((e) => e.era_id === selectedEraId) ?? null;
  const namedCount = eras.filter((e) => e.is_named).length;

  return (
    <>
      {/* Pinned header */}
      <header
        className="fixed z-20 pointer-events-none"
        style={{
          left: SIDEBAR_WIDTH,
          top: 0,
          right: 0,
          height: HEADER_HEIGHT,
          background: "#0f172a",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 12px 32px rgba(15,23,42,0.65)",
        }}
      >
        <div
          className="h-full flex flex-col justify-center px-6 sm:px-8 pointer-events-auto"
          style={{
            background: "rgba(15,23,42,0.97)",
          }}
        >
          <p
            className="font-ui text-[10px] font-semibold tracking-[0.14em] uppercase"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Your Listening History
          </p>
          <div className="flex items-baseline justify-between gap-4 flex-wrap mt-0.5">
            <h1
              className="font-hero leading-none"
              style={{
                fontSize: "clamp(1.35rem, 2.5vw, 1.75rem)",
                letterSpacing: "-0.02em",
                color: "#ffffff",
              }}
            >
              Timeline
            </h1>
            <div className="flex items-center gap-3">
              {!loading && eras.length > 0 && (
                <p className="font-ui text-xs" style={{ color: "rgba(255,255,255,0.58)" }}>
                  {namedCount} of {eras.length} eras named
                </p>
              )}
              <div
                className="flex items-center"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 20,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setEraType("discovery")}
                  style={{
                    padding: "5px 12px",
                    background: eraType === "discovery" ? "rgba(29,185,84,0.16)" : "none",
                    border: "none",
                    borderRight: "1px solid rgba(255,255,255,0.1)",
                    cursor: "pointer",
                    color: eraType === "discovery" ? "#1db954" : "rgba(255,255,255,0.5)",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: eraType === "discovery" ? 600 : 400,
                  }}
                >
                  Discovery
                </button>
                <button
                  onClick={() => setEraType("listening")}
                  style={{
                    padding: "5px 12px",
                    background: eraType === "listening" ? "rgba(29,185,84,0.16)" : "none",
                    border: "none",
                    cursor: "pointer",
                    color: eraType === "listening" ? "#1db954" : "rgba(255,255,255,0.5)",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: eraType === "listening" ? 600 : 400,
                  }}
                >
                  Listening
                </button>
              </div>
            </div>
          </div>
          <p
            className="font-ui text-xs mt-1 hidden sm:block"
            style={{ color: "rgba(255,255,255,0.52)" }}
          >
            {eraType === "discovery"
              ? "Drag through nine years of listening — click a planet to explore an era."
              : "Real play-volume eras from your extended streaming history — click a planet to explore an era."}
          </p>
        </div>
      </header>

      {loading && (
        <div
          className="fixed z-10 animate-pulse"
          style={{
            left: SIDEBAR_WIDTH,
            top: HEADER_HEIGHT,
            right: 0,
            bottom: 0,
            background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)",
          }}
        />
      )}

      {error && (
        <div
          className="fixed z-30 flex items-center justify-center"
          style={{
            left: SIDEBAR_WIDTH,
            top: HEADER_HEIGHT,
            right: 0,
            bottom: 0,
            background: "#0f1724",
          }}
        >
          <p className="font-ui text-base px-6 text-center" style={{ color: "rgba(255,255,255,0.55)" }}>
            {error}
          </p>
        </div>
      )}

      {!loading && !error && eras.length > 0 && (
        <HorizontalTimeline
          eras={eras}
          selectedEraId={selectedEraId}
          onSelectEra={handleSelectEra}
          headerHeight={HEADER_HEIGHT}
          sidebarWidth={SIDEBAR_WIDTH}
        />
      )}

      <EraDetailModal
        open={selectedEraId !== null}
        era={selectedEra}
        depth={depth}
        depthLoading={depthLoading}
        depthError={depthError}
        onClose={handleCloseModal}
        onEraUpdate={handleEraUpdate}
      />
    </>
  );
}
