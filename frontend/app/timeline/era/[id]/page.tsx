"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getEras,
  getEraDepth,
  getCommunityDetail,
  ApiError,
} from "@/lib/api";
import type { Era, EraDepth, CommunityDetail } from "@/lib/types";
import { PageShell } from "@/components/atlas/PageShell";
import { EraDepthContent } from "@/components/timeline/EraDepthContent";
import { EraEditForm } from "@/components/timeline/EraEditForm";
import { getArchetypeColor } from "@/hooks/useMapData";
import { formatDateRange } from "@/components/timeline/timelineUtils";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-ui text-[11px] font-semibold tracking-[0.12em] uppercase mb-4"
      style={{ color: "#98a2b3" }}
    >
      {children}
    </p>
  );
}

export default function EraDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const eraId = typeof rawId === "string" ? parseInt(rawId, 10) : NaN;

  const [era, setEra] = useState<Era | null>(null);
  const [depth, setDepth] = useState<EraDepth | null>(null);
  const [communities, setCommunities] = useState<CommunityDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (isNaN(eraId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    Promise.all([getEras(1, { signal }), getEraDepth(eraId, 10, 10, { signal })])
      .then(async ([eras, depthData]) => {
        const match = eras.find((e) => e.era_id === eraId);
        if (!match) {
          setNotFound(true);
          return;
        }
        setEra(match);
        setDepth(depthData);

        const details = await Promise.all(
          depthData.dominant_communities.map((c) =>
            getCommunityDetail(c.cluster_id, 1, "vibe", { signal }).catch(() => null),
          ),
        );
        setCommunities(details.filter((d): d is CommunityDetail => d !== null));
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setNotFound(true);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [eraId]);

  useEffect(() => {
    if (era) {
      document.title = `${era.title ?? `Era ${era.era_number}`} · Timeline · Spotify Atlas`;
    }
  }, [era]);

  const handleEraUpdate = useCallback((id: number, patch: Partial<Era>) => {
    setEra((prev) => (prev && prev.era_id === id ? { ...prev, ...patch } : prev));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "#f7f8f5" }}>
        <PageShell maxWidth="xl" className="py-10">
          <div className="space-y-6 animate-pulse">
            <div className="h-4 w-32 rounded-full" style={{ background: "#dde6dd" }} />
            <div className="rounded-[28px] h-96" style={{ background: "#0f172a", opacity: 0.35 }} />
          </div>
        </PageShell>
      </div>
    );
  }

  if (notFound || !era || !depth) {
    return (
      <div className="min-h-screen" style={{ background: "#f7f8f5" }}>
        <PageShell maxWidth="xl" className="py-10">
          <div className="text-center py-24">
            <h1 className="font-hero text-2xl" style={{ color: "#0f172a" }}>
              Era Not Found
            </h1>
            <Link
              href="/timeline"
              className="inline-block mt-4 font-ui text-sm"
              style={{ color: "#667085" }}
            >
              ← Back to Timeline
            </Link>
          </div>
        </PageShell>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f7f8f5" }}>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 55% 40% at 80% 0%, rgba(29,185,84,0.07) 0%, transparent 60%)",
        }}
      />

      <PageShell maxWidth="xl" className="py-10 relative z-10">
        <div className="space-y-8">
          <Link
            href="/timeline"
            className="inline-flex items-center gap-1.5 font-ui text-sm transition-colors hover:opacity-80"
            style={{ color: "#98a2b3" }}
          >
            <span aria-hidden>←</span>
            Back to Timeline
          </Link>

          <div
            className="relative rounded-[28px] overflow-hidden"
            style={{ background: "#0f172a" }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ background: "#1db954" }}
              aria-hidden
            />
            <div className="pl-8 pr-6 py-8 md:pl-10 md:pr-8 md:py-10 space-y-6">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="font-ui text-xs px-3 py-1.5 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.45)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {formatDateRange(era.start_date, era.end_date)}
                </span>
                <span
                  className="font-ui text-xs px-3 py-1.5 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.45)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {era.event_count.toLocaleString()} events
                </span>
              </div>

              <EraEditForm era={era} onUpdate={handleEraUpdate} />
              <EraDepthContent era={era} depth={depth} />
            </div>
          </div>

          {communities.length > 0 && (
            <section>
              <SectionLabel>Dominant Worlds</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {communities.map((c) => {
                  const color = getArchetypeColor(c.archetype);
                  return (
                    <Link
                      key={c.cluster_id}
                      href={`/community/${c.cluster_id}`}
                      className="block group"
                    >
                      <div
                        className="relative rounded-2xl p-5 h-full transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md overflow-hidden"
                        style={{ background: "#ffffff", border: "1px solid #dde6dd" }}
                      >
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1"
                          style={{ background: color }}
                          aria-hidden
                        />
                        <div className="ml-2">
                          {c.archetype && (
                            <span
                              className="font-ui text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: `${color}22`, color }}
                            >
                              {c.archetype}
                            </span>
                          )}
                          <h3
                            className="font-ui font-semibold text-base mt-2 group-hover:opacity-80"
                            style={{ color: "#1a2b1a" }}
                          >
                            {c.name}
                          </h3>
                          <p
                            className="font-ui text-xs mt-0.5"
                            style={{ color: "#98a2b3" }}
                          >
                            {c.canonical_name}
                          </p>
                          {c.description && (
                            <p
                              className="font-ui text-sm mt-3 leading-relaxed line-clamp-3"
                              style={{ color: "#667085" }}
                            >
                              {c.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </PageShell>
    </div>
  );
}
