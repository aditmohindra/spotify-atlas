"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getCommunityDetail,
  getRelatedCommunities,
  getTasteProfile,
  ApiError,
} from "@/lib/api";
import type { CommunityDetail, RelatedCommunity, Rarity } from "@/lib/types";
import { PageShell } from "@/components/atlas/PageShell";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { CommunityListModal } from "@/components/community/CommunityListModal";

// ── Constants ─────────────────────────────────────────────────────────────────

const CLUSTER_COLORS = [
  "#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa",
  "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#e879f9",
  "#22d3ee", "#86efac", "#fca5a5", "#fde68a", "#c4b5fd",
  "#f9a8d4", "#7dd3fc", "#6ee7b7", "#fcd34d", "#d8b4fe",
];

function clusterColor(id: number): string {
  if (id === -1) return "#dde6dd";
  return CLUSTER_COLORS[id % CLUSTER_COLORS.length];
}

const RARITY_STYLES: Record<Rarity, { bg: string; text: string; border: string }> = {
  "Extremely Rare": { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  "Rare":           { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  "Niche":          { bg: "#faf5ff", text: "#6b21a8", border: "#e9d5ff" },
  "Underground":    { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  "Core":           { bg: "#f9fafb", text: "#374151", border: "#e5e7eb" },
};

function rarityFromTrackCount(count: number): Rarity {
  if (count < 50) return "Extremely Rare";
  if (count < 200) return "Rare";
  if (count < 500) return "Niche";
  if (count < 1500) return "Underground";
  return "Core";
}

// ── Spotify icon ──────────────────────────────────────────────────────────────

function SpotifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#1db954" />
      <path
        d="M7.5 15.5c2.5-1 5.5-.8 8 .8M7 12.5c3-1.2 6.5-1 9 .8M7.5 9.5c3.5-1.5 7.5-1.2 10 .8"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Section header label ──────────────────────────────────────────────────────

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

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DetailPageSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "#f7f8f5" }}>
      <PageShell maxWidth="xl" className="py-8">
        <div className="space-y-8 animate-pulse">
          <div className="h-4 w-28 rounded-full" style={{ background: "#dde6dd" }} />

          {/* Hero skeleton */}
          <div className="rounded-[28px] overflow-hidden" style={{ background: "#0f172a", opacity: 0.4 }}>
            <div className="px-12 py-10 space-y-4">
              <div className="flex justify-between">
                <div className="h-6 w-32 rounded-full" style={{ background: "#1e293b" }} />
                <div className="h-14 w-24 rounded-xl" style={{ background: "#1e293b" }} />
              </div>
              <div className="h-12 w-3/4 rounded-xl mt-6" style={{ background: "#1e293b" }} />
              <div className="h-4 w-40 rounded-full" style={{ background: "#1e293b" }} />
              <div className="h-16 w-full rounded-xl mt-4" style={{ background: "#1e293b" }} />
            </div>
          </div>

          {/* Content skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="space-y-3">
                <div className="h-3 w-24 rounded-full" style={{ background: "#dde6dd" }} />
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 rounded-xl" style={{ background: "#dde6dd" }} />
                ))}
              </div>
              <div className="space-y-3">
                <div className="h-3 w-36 rounded-full" style={{ background: "#dde6dd" }} />
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-14 rounded-xl" style={{ background: "#dde6dd" }} />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-40 rounded-2xl" style={{ background: "#dde6dd" }} />
              <div className="h-56 rounded-2xl" style={{ background: "#dde6dd" }} />
            </div>
          </div>
        </div>
      </PageShell>
    </div>
  );
}

// ── 404 / not found ───────────────────────────────────────────────────────────

function NotFoundState() {
  return (
    <div className="min-h-screen" style={{ background: "#f7f8f5" }}>
      <PageShell maxWidth="xl" className="py-10">
        <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
          <span className="text-5xl" aria-hidden>🌌</span>
          <h1
            className="font-hero"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", color: "#0f172a", letterSpacing: "-0.02em" }}
          >
            World Not Found
          </h1>
          <p className="font-ui text-base max-w-sm leading-relaxed" style={{ color: "#667085" }}>
            This community doesn&apos;t exist in the atlas yet.
          </p>
          <Link
            href="/communities"
            className="mt-2 font-ui text-sm font-medium px-5 py-2.5 rounded-full border transition-colors hover:bg-white"
            style={{ color: "#344054", borderColor: "#dde6dd" }}
          >
            ← Back to Worlds
          </Link>
        </div>
      </PageShell>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CommunityDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const clusterId = typeof rawId === "string" ? parseInt(rawId, 10) : NaN;

  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [related, setRelated] = useState<RelatedCommunity[]>([]);
  const [percentage, setPercentage] = useState<number | null>(null);
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [openModal, setOpenModal] = useState<"artists" | "tracks" | null>(null);

  useEffect(() => {
    if (detail?.name) {
      document.title = `${detail.name} · Spotify Atlas`;
    } else {
      document.title = "Community · Spotify Atlas";
    }
  }, [detail?.name]);

  useEffect(() => {
    if (isNaN(clusterId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    Promise.all([
      getCommunityDetail(clusterId, 1, "vibe", { signal }),
      getRelatedCommunities(clusterId, "vibe", { signal }),
      getTasteProfile(1, "all", "vibe", { signal }),
    ])
      .then(([detailData, relatedData, tasteData]) => {
        setDetail(detailData);
        setRelated(relatedData.related.slice(0, 5));

        const match = tasteData.communities.find((c) => c.cluster_id === clusterId);
        if (match) {
          setPercentage(match.percentage);
          setRarity(match.rarity);
        } else {
          setRarity(rarityFromTrackCount(detailData.track_count));
        }
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [clusterId]);

  if (loading) return <DetailPageSkeleton />;
  if (notFound || !detail) return <NotFoundState />;

  const color = clusterColor(clusterId);
  const resolvedRarity = rarity ?? rarityFromTrackCount(detail.track_count);
  const rarityStyle = RARITY_STYLES[resolvedRarity] ?? RARITY_STYLES["Core"];

  return (
    <div className="min-h-screen" style={{ background: "#f7f8f5" }}>
      {/* Subtle green radial glow */}
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

          {/* ── 1. Back button ─────────────────────────────────────────────── */}
          <Link
            href="/communities"
            className="inline-flex items-center gap-1.5 font-ui text-sm transition-colors hover:opacity-80"
            style={{ color: "#98a2b3" }}
          >
            <span aria-hidden>←</span>
            Back to Worlds
          </Link>

          {/* ── 2. Hero card ───────────────────────────────────────────────── */}
          <div
            className="relative rounded-[28px] overflow-hidden"
            style={{ background: "#0f172a" }}
          >
            {/* Left colored accent bar */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ background: color }}
              aria-hidden
            />

            <div className="pl-8 pr-6 py-8 md:pl-12 md:pr-10 md:py-10">

              {/* Top row: archetype + taste badge */}
              <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
                <div className="flex items-center gap-2 flex-wrap">
                  {detail.archetype && (
                    <span
                      className="inline-flex items-center font-ui font-semibold text-xs px-3 py-1.5 rounded-full"
                      style={{ background: "#1db954", color: "#ffffff" }}
                    >
                      {detail.archetype}
                    </span>
                  )}
                  <span
                    className="font-ui text-xs px-3 py-1.5 rounded-full"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.4)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {detail.track_count.toLocaleString()} tracks
                  </span>
                </div>

                {percentage !== null && (
                  <div
                    className="flex flex-col items-end rounded-xl px-4 py-2.5 shrink-0"
                    style={{
                      background: "rgba(29,185,84,0.1)",
                      border: "1px solid rgba(29,185,84,0.2)",
                    }}
                  >
                    <span
                      className="font-stat font-bold tabular-nums leading-none"
                      style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", color: "#1db954" }}
                    >
                      {percentage.toFixed(1)}%
                    </span>
                    <span
                      className="font-ui text-[10px] mt-0.5 tracking-wide uppercase"
                      style={{ color: "#4ade80" }}
                    >
                      of your taste
                    </span>
                  </div>
                )}
              </div>

              {/* Canonical name — primary title */}
              <h1
                className="font-hero leading-[1.05]"
                style={{
                  fontSize: "clamp(2rem, 4.5vw, 3.5rem)",
                  letterSpacing: "-0.02em",
                  color: "#ffffff",
                }}
              >
                {detail.canonical_name}
              </h1>

              {/* Community nickname — secondary chip */}
              <span
                className="font-ui inline-block mt-3"
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.55)",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 20,
                  padding: "3px 10px",
                }}
              >
                {detail.name}
              </span>

              {/* Description */}
              {detail.description && (
                <p
                  className="font-ui leading-relaxed mt-5 max-w-2xl"
                  style={{ fontSize: "1rem", color: "rgba(255,255,255,0.65)" }}
                >
                  {detail.description}
                </p>
              )}

              {/* Keyword chips */}
              {detail.keywords.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-5">
                  {detail.keywords.slice(0, 7).map((kw) => (
                    <span
                      key={kw}
                      className="font-ui text-[11px] px-2.5 py-1 rounded-full"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.45)",
                        border: "1px solid rgba(255,255,255,0.09)",
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Main content grid ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Left 2/3: Artists + Tracks */}
            <div className="lg:col-span-2 space-y-8">

              {/* ── 3. Core Artists ──────────────────────────────────────── */}
              {detail.top_artists.length > 0 && (
                <section>
                  <SectionLabel>Core Artists</SectionLabel>
                  <div className="space-y-2">
                    {detail.top_artists.slice(0, 5).map((artist, idx) => (
                      <div
                        key={artist.name}
                        className="flex items-center gap-4 px-4 py-3 rounded-xl transition-shadow hover:shadow-sm"
                        style={{ background: "#ffffff", border: "1px solid #dde6dd" }}
                      >
                        <span
                          className="font-stat text-sm tabular-nums w-6 text-right shrink-0"
                          style={{ color: color }}
                        >
                          {idx + 1}
                        </span>
                        <ImageWithFallback
                          src={artist.artist_image_url}
                          alt={artist.name}
                          size={40}
                          shape="circle"
                          fallbackText={artist.name}
                        />
                        <span
                          className="font-ui font-medium text-sm"
                          style={{ color: "#1a2b1a" }}
                        >
                          {artist.name}
                        </span>
                      </div>
                    ))}
                  </div>
                  {detail.all_artists.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setOpenModal("artists")}
                      className="mt-3 font-ui text-xs font-medium transition-colors hover:underline"
                      style={{ color: "#98a2b3" }}
                    >
                      View all {detail.all_artists.length} artists →
                    </button>
                  )}
                </section>
              )}

              {/* ── 4. Representative Tracks ─────────────────────────────── */}
              {detail.sample_tracks.length > 0 && (
                <section>
                  <SectionLabel>Representative Tracks</SectionLabel>
                  <div className="space-y-1.5">
                    {detail.sample_tracks.slice(0, 8).map((track, idx) => (
                      <div
                        key={`${track.name}-${idx}`}
                        className="group flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:shadow-sm"
                        style={{ background: "#ffffff", border: "1px solid #dde6dd" }}
                      >
                        <span
                          className="font-stat text-xs tabular-nums w-5 text-right shrink-0"
                          style={{ color: "#c5d2c5" }}
                        >
                          {idx + 1}
                        </span>

                        <ImageWithFallback
                          src={track.album_image_url}
                          alt={track.name}
                          size={40}
                          shape="square"
                        />

                        <div className="flex-1 min-w-0">
                          <p
                            className="font-ui font-medium text-sm truncate leading-tight"
                            style={{ color: "#1a2b1a" }}
                          >
                            {track.name}
                          </p>
                          <p
                            className="font-ui text-xs truncate mt-0.5"
                            style={{ color: "#98a2b3" }}
                          >
                            {track.artist}
                          </p>
                        </div>

                        <a
                          href={`https://open.spotify.com/track/${track.spotify_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Open on Spotify"
                          aria-label={`Open ${track.name} on Spotify`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SpotifyIcon />
                        </a>
                      </div>
                    ))}
                  </div>
                  {detail.all_tracks.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setOpenModal("tracks")}
                      className="mt-3 font-ui text-xs font-medium transition-colors hover:underline"
                      style={{ color: "#98a2b3" }}
                    >
                      View all {detail.all_tracks.length} tracks →
                    </button>
                  )}
                </section>
              )}
            </div>

            {/* Right 1/3: Stats + Related */}
            <div className="space-y-6">

              {/* ── 6. Stats strip ───────────────────────────────────────── */}
              <section
                className="rounded-2xl p-5 space-y-4"
                style={{ background: "#ffffff", border: "1px solid #dde6dd" }}
              >
                <SectionLabel>Stats</SectionLabel>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-ui text-xs" style={{ color: "#667085" }}>
                      Track Count
                    </span>
                    <span
                      className="font-stat text-sm font-semibold tabular-nums"
                      style={{ color: "#1a2b1a" }}
                    >
                      {detail.track_count.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="font-ui text-xs" style={{ color: "#667085" }}>
                      Rarity
                    </span>
                    <span
                      className="font-ui text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                      style={{
                        background: rarityStyle.bg,
                        color: rarityStyle.text,
                        borderColor: rarityStyle.border,
                      }}
                    >
                      {resolvedRarity}
                    </span>
                  </div>

                  {percentage !== null && (
                    <div className="flex items-center justify-between">
                      <span className="font-ui text-xs" style={{ color: "#667085" }}>
                        Your Share
                      </span>
                      <span
                        className="font-stat text-sm font-semibold tabular-nums"
                        style={{ color }}
                      >
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  <div
                    className="pt-3 mt-1"
                    style={{ borderTop: "1px solid #dde6dd" }}
                  >
                    <p className="font-ui text-[10px] uppercase tracking-wide mb-1" style={{ color: "#c5d2c5" }}>
                      Listening Weight
                    </p>
                    <p
                      className="font-stat text-xl font-bold tabular-nums"
                      style={{ color: "#1a2b1a" }}
                    >
                      {detail.user_weight.toFixed(2)}
                    </p>
                  </div>
                </div>
              </section>

              {/* ── 5. Related Worlds ────────────────────────────────────── */}
              {related.length > 0 && (
                <section>
                  <SectionLabel>Related Worlds</SectionLabel>
                  <div className="space-y-2">
                    {related.map((rel) => {
                      const relColor = clusterColor(rel.cluster_id);
                      return (
                        <Link
                          key={rel.cluster_id}
                          href={`/community/${rel.cluster_id}`}
                          className="block group"
                        >
                          <div
                            className="relative rounded-xl px-4 py-3 overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
                            style={{ background: "#ffffff", border: "1px solid #dde6dd" }}
                          >
                            <div
                              className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
                              style={{ background: relColor }}
                              aria-hidden
                            />
                            <div className="ml-1">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className="font-ui font-medium text-sm truncate"
                                  style={{ color: "#1a2b1a" }}
                                >
                                  {rel.name}
                                </span>
                                <span
                                  className="font-stat text-xs tabular-nums shrink-0 font-semibold"
                                  style={{ color: relColor }}
                                >
                                  {Math.round(rel.similarity * 100)}%
                                </span>
                              </div>
                              <p
                                className="font-ui text-xs truncate mt-0.5"
                                style={{ color: "#98a2b3" }}
                              >
                                {rel.canonical_name}
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                </div>
                </section>
              )}
            </div>
          </div>

          {/* ── 7. CTAs ────────────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between pt-6 gap-4 flex-wrap"
            style={{ borderTop: "1px solid #dde6dd" }}
          >
            <Link
              href="/communities"
              className="inline-flex items-center gap-2 font-ui text-sm font-medium px-5 py-2.5 rounded-full border transition-colors hover:bg-white"
              style={{ color: "#344054", borderColor: "#dde6dd" }}
            >
              <span aria-hidden>←</span>
              Back to Worlds
            </Link>

            <Link
              href="/map"
              className="inline-flex items-center gap-2 font-ui text-sm font-medium px-5 py-2.5 rounded-full transition-all hover:opacity-90 hover:-translate-y-px"
              style={{ background: "#1db954", color: "#ffffff" }}
            >
              View in Galaxy
              <span aria-hidden>→</span>
            </Link>
          </div>

        </div>
      </PageShell>

      <CommunityListModal
        isOpen={openModal === "artists"}
        onClose={() => setOpenModal(null)}
        title="All Artists"
        items={detail.all_artists}
        type="artists"
        accentColor={color}
      />
      <CommunityListModal
        isOpen={openModal === "tracks"}
        onClose={() => setOpenModal(null)}
        title="All Representative Tracks"
        items={detail.all_tracks}
        type="tracks"
        accentColor={color}
      />
    </div>
  );
}
