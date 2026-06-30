"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getEras, getEraDepth, ApiError } from "@/lib/api";
import type { Era, EraDepth } from "@/lib/types";
import { HorizontalTimeline } from "@/components/timeline/HorizontalTimeline";
import { EraDetailModal } from "@/components/timeline/EraDetailModal";

const HEADER_HEIGHT = 88;
const SIDEBAR_WIDTH = 220;

export default function TimelinePage() {
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
    getEras(1, { signal: controller.signal })
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
  }, []);

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
            {!loading && eras.length > 0 && (
              <p className="font-ui text-xs" style={{ color: "rgba(255,255,255,0.58)" }}>
                {namedCount} of {eras.length} eras named
              </p>
            )}
          </div>
          <p
            className="font-ui text-xs mt-1 hidden sm:block"
            style={{ color: "rgba(255,255,255,0.52)" }}
          >
            Drag through nine years of listening — click a planet to explore an era.
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
