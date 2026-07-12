"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Info,
  Music2,
  Sparkles,
  Target,
  Users,
  CircleDot,
} from "lucide-react";
import {
  getCommunityDetail,
  getRelatedCommunities,
  getTasteProfile,
  ApiError,
} from "@/lib/api";
import type { CommunityDetail, RelatedCommunity } from "@/lib/types";
import { getArchetypeColor, useMapData } from "@/hooks/useMapData";
import { PageShell } from "@/components/atlas/PageShell";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { CommunityListModal } from "@/components/community/CommunityListModal";
import { RelatedCommunitiesModal } from "@/components/community/RelatedCommunitiesModal";
import CommunityMiniMap, {
  type MiniMapPoint,
} from "@/components/community/CommunityMiniMap";

// ── Theme ─────────────────────────────────────────────────────────────────────

const BG = "#0a0e1a";
const CARD_BG = "#111827";
const CARD_BORDER = "rgba(255,255,255,0.08)";
const GREEN = "#1db954";
const TEXT = "#f9fafb";
const MUTED = "#9ca3af";
const COHESION_ORANGE = "#f59e0b";
const PURPLE = "#a78bfa";

// ── Icons helpers ─────────────────────────────────────────────────────────────

function SpotifyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function CardShell({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({
  icon,
  iconColor,
  children,
  subtitle,
}: {
  icon: React.ReactNode;
  iconColor: string;
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <span style={{ color: iconColor }} className="shrink-0 flex">
          {icon}
        </span>
        <h2 className="font-ui text-[15px] font-semibold" style={{ color: TEXT }}>
          {children}
        </h2>
      </div>
      {subtitle && (
        <p className="font-ui text-[11px] mt-1 ml-6" style={{ color: MUTED }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function ViewAllLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 font-ui text-xs font-medium transition-opacity hover:opacity-80"
      style={{ color: GREEN }}
    >
      {children}
    </button>
  );
}

function CohesionTooltip({ score }: { score: number | null }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="What is cohesion?"
        className="inline-flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
        style={{ width: 16, height: 16, color: MUTED }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info size={12} aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg px-3 py-2 font-ui text-[11px] leading-relaxed shadow-xl"
          style={{
            background: "#1e293b",
            color: "rgba(255,255,255,0.85)",
            border: `1px solid ${CARD_BORDER}`,
          }}
        >
          Cohesion measures how tightly tracks cluster around the community
          centroid (average cosine similarity of vibe embeddings). Higher =
          more sonically consistent. Shown on a 0–10 scale stretched from the
          typical 0.88–1.0 cosine band so differences are readable.
          {score !== null && (
            <span className="block mt-1 tabular-nums" style={{ color: MUTED }}>
              Score: {score.toFixed(2)} / 10
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// ── Loading / 404 ─────────────────────────────────────────────────────────────

function DetailPageSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <PageShell maxWidth="xl" className="py-8">
        <div className="space-y-6 animate-pulse">
          <div className="h-4 w-36 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-64 rounded-2xl" style={{ background: CARD_BG }} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-2xl" style={{ background: CARD_BG }} />
            ))}
          </div>
        </div>
      </PageShell>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <PageShell maxWidth="xl" className="py-10">
        <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
          <h1
            className="font-hero"
            style={{
              fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
              color: TEXT,
              letterSpacing: "-0.02em",
            }}
          >
            Community Not Found
          </h1>
          <p className="font-ui text-base max-w-sm leading-relaxed" style={{ color: MUTED }}>
            This community doesn&apos;t exist in the atlas yet.
          </p>
          <Link
            href="/communities"
            className="mt-2 font-ui text-sm font-medium px-5 py-2.5 rounded-full transition-opacity hover:opacity-80"
            style={{ color: GREEN, border: `1px solid ${GREEN}55` }}
          >
            ← Back to Communities
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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [openModal, setOpenModal] = useState<"artists" | "tracks" | "related" | null>(null);

  const { data: mapData } = useMapData("vibe");

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
      getRelatedCommunities(clusterId, "vibe", { signal }, 20),
      getTasteProfile(1, "all", "vibe", { signal }),
    ])
      .then(([detailData, relatedData, tasteData]) => {
        setDetail(detailData);
        setRelated(relatedData.related);

        const match = tasteData.communities.find((c) => c.cluster_id === clusterId);
        if (match) setPercentage(match.percentage);
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

  const archetypeColor = getArchetypeColor(detail?.archetype);
  const miniMapPoints = useMemo<MiniMapPoint[]>(() => {
    if (!mapData?.points) return [];
    // Show this community brightly + a light subsample of the rest for context
    const own: MiniMapPoint[] = [];
    const others: MiniMapPoint[] = [];
    for (const p of mapData.points) {
      if (p.cluster_id === clusterId) {
        own.push({ x: p.x, y: p.y, color: archetypeColor });
      } else if (p.cluster_id !== -1 && others.length < 400) {
        others.push({ x: p.x, y: p.y, color: "rgba(148,163,184,0.28)" });
      }
    }
    return [...others, ...own];
  }, [mapData, clusterId, archetypeColor]);

  if (loading) return <DetailPageSkeleton />;
  if (notFound || !detail) return <NotFoundState />;

  const cohesion = detail.cohesion_score;
  const nearest = related.slice(0, 3);
  const relatedTop5 = related.slice(0, 5);
  const coreArtists = detail.top_artists.slice(0, 3);
  const repArtists = detail.top_artists.slice(0, 5);
  const repTracks = detail.sample_tracks.slice(0, 5);

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 70% 0%, rgba(29,185,84,0.06) 0%, transparent 55%)",
        }}
      />

      <PageShell maxWidth="xl" className="py-8 relative z-10">
        <div className="space-y-5">
          {/* Back */}
          <Link
            href="/communities"
            className="inline-flex items-center gap-1.5 font-ui text-sm transition-opacity hover:opacity-80"
            style={{ color: MUTED }}
          >
            <ArrowLeft size={14} aria-hidden />
            Back to Communities
          </Link>

          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <section
            className="relative rounded-2xl overflow-hidden"
            style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 p-6 md:p-8">
              {/* Left: meta */}
              <div className="min-w-0 flex flex-col">
                {detail.archetype && (
                  <span
                    className="inline-flex self-start items-center font-ui font-semibold text-xs px-3 py-1.5 rounded-full mb-4"
                    style={{
                      background: `${archetypeColor}22`,
                      color: archetypeColor,
                      border: `1px solid ${archetypeColor}44`,
                    }}
                  >
                    {detail.archetype}
                  </span>
                )}

                <h1
                  className="font-ui font-bold leading-[1.1]"
                  style={{
                    fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)",
                    letterSpacing: "-0.02em",
                    color: TEXT,
                  }}
                >
                  {detail.canonical_name}
                </h1>

                <span
                  className="font-ui inline-flex self-start mt-3 text-xs font-medium px-2.5 py-1 rounded-md"
                  style={{
                    background: `${GREEN}18`,
                    color: GREEN,
                    border: `1px solid ${GREEN}33`,
                  }}
                >
                  {detail.name}
                </span>

                {detail.description && (
                  <p
                    className="font-ui leading-relaxed mt-4 max-w-2xl"
                    style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.65)" }}
                  >
                    {detail.description}
                  </p>
                )}

                {detail.keywords.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mt-4">
                    {detail.keywords.slice(0, 8).map((kw) => (
                      <span
                        key={kw}
                        className="font-ui text-[11px] px-2.5 py-1 rounded-md"
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          color: "rgba(255,255,255,0.55)",
                          border: `1px solid ${CARD_BORDER}`,
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats row */}
                <div
                  className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-6 pt-5"
                  style={{ borderTop: `1px solid ${CARD_BORDER}` }}
                >
                  <div className="flex items-center gap-2">
                    <Music2 size={16} style={{ color: PURPLE }} aria-hidden />
                    <span className="font-stat text-sm font-semibold tabular-nums" style={{ color: TEXT }}>
                      {detail.track_count.toLocaleString()}
                    </span>
                    <span className="font-ui text-xs" style={{ color: MUTED }}>
                      Tracks
                    </span>
                  </div>

                  {percentage !== null && (
                    <div className="flex items-center gap-2">
                      <CircleDot size={16} style={{ color: "#60a5fa" }} aria-hidden />
                      <span className="font-stat text-sm font-semibold tabular-nums" style={{ color: TEXT }}>
                        {percentage.toFixed(1)}%
                      </span>
                      <span className="font-ui text-xs" style={{ color: MUTED }}>
                        of library
                      </span>
                    </div>
                  )}

                  {cohesion !== null && (
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} style={{ color: COHESION_ORANGE }} aria-hidden />
                      <span className="font-stat text-sm font-semibold tabular-nums" style={{ color: TEXT }}>
                        {cohesion.toFixed(2)}
                      </span>
                      <span className="font-ui text-xs" style={{ color: MUTED }}>
                        Cohesion
                      </span>
                      <CohesionTooltip score={cohesion} />
                    </div>
                  )}
                </div>
              </div>

              {/* Right: mini-map */}
              <div
                className="relative rounded-xl overflow-hidden shrink-0"
                style={{
                  background: "#060a14",
                  border: `1px solid ${CARD_BORDER}`,
                  minHeight: 220,
                  height: "100%",
                }}
              >
                <CommunityMiniMap
                  points={miniMapPoints}
                  color={archetypeColor}
                  fill
                  maxPoints={800}
                  className="absolute inset-0"
                />
                <Link
                  href="/map"
                  className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 font-ui text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
                  style={{
                    background: "rgba(8,12,20,0.82)",
                    color: TEXT,
                    border: `1px solid ${CARD_BORDER}`,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  View on Atlas Map
                  <ExternalLink size={11} aria-hidden />
                </Link>
              </div>
            </div>
          </section>

          {/* ── Row 1: Core Artists | Nearest | Cohesion ─────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Core Artists */}
            <CardShell>
              <CardTitle icon={<Users size={15} />} iconColor={GREEN}>
                Core artists
              </CardTitle>
              <div className="space-y-2.5">
                {coreArtists.map((artist, idx) => (
                  <div key={artist.name} className="flex items-center gap-3">
                    <span
                      className="font-stat text-xs tabular-nums w-4 shrink-0"
                      style={{ color: MUTED }}
                    >
                      {idx + 1}
                    </span>
                    <ImageWithFallback
                      src={artist.artist_image_url}
                      alt={artist.name}
                      size={36}
                      shape="circle"
                      fallbackText={artist.name}
                    />
                    <span className="font-ui text-sm font-medium truncate" style={{ color: TEXT }}>
                      {artist.name}
                    </span>
                  </div>
                ))}
                {coreArtists.length === 0 && (
                  <p className="font-ui text-xs" style={{ color: MUTED }}>
                    No artists yet
                  </p>
                )}
              </div>
              {detail.all_artists.length > 3 && (
                <ViewAllLink onClick={() => setOpenModal("artists")}>
                  View all {detail.all_artists.length} artists →
                </ViewAllLink>
              )}
            </CardShell>

            {/* Nearest Communities */}
            <CardShell>
              <CardTitle
                icon={<Target size={15} />}
                iconColor={PURPLE}
                subtitle="Based on centroid similarity"
              >
                Nearest communities
              </CardTitle>
              <div className="space-y-2.5">
                {nearest.map((rel, idx) => (
                  <Link
                    key={rel.cluster_id}
                    href={`/community/${rel.cluster_id}`}
                    className="flex items-center justify-between gap-2 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="font-stat text-xs tabular-nums w-4 shrink-0"
                        style={{ color: MUTED }}
                      >
                        {idx + 1}
                      </span>
                      <span
                        className="font-ui text-sm truncate group-hover:underline"
                        style={{ color: TEXT }}
                      >
                        {rel.name}
                      </span>
                    </div>
                    <span
                      className="font-stat text-xs font-semibold tabular-nums shrink-0"
                      style={{ color: GREEN }}
                    >
                      {Math.round(rel.similarity * 100)}%
                    </span>
                  </Link>
                ))}
                {nearest.length === 0 && (
                  <p className="font-ui text-xs" style={{ color: MUTED }}>
                    No nearby communities
                  </p>
                )}
              </div>
              {related.length > 3 && (
                <ViewAllLink onClick={() => setOpenModal("related")}>
                  View all nearby →
                </ViewAllLink>
              )}
            </CardShell>

            {/* Cohesion */}
            <CardShell>
              <CardTitle icon={<Sparkles size={15} />} iconColor={COHESION_ORANGE}>
                Cohesion
              </CardTitle>
              {cohesion !== null ? (
                <div>
                  <p
                    className="font-stat font-bold tabular-nums leading-none"
                    style={{ fontSize: "2.75rem", color: TEXT }}
                  >
                    {cohesion.toFixed(2)}
                  </p>
                  <p
                    className="font-ui text-xs mt-3 flex items-center gap-1.5"
                    style={{ color: MUTED }}
                  >
                    average similarity within the community
                    <CohesionTooltip score={cohesion} />
                  </p>
                </div>
              ) : (
                <p className="font-ui text-sm" style={{ color: MUTED }}>
                  Cohesion not yet computed
                </p>
              )}
            </CardShell>
          </div>

          {/* ── Row 2: Rep content | Related + Snapshot ──────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Representative Artists + Tracks */}
            <div className="space-y-4">
              <CardShell>
                <CardTitle icon={<Users size={15} />} iconColor={GREEN}>
                  Representative Artists
                </CardTitle>
                <div className="space-y-2.5">
                  {repArtists.map((artist, idx) => (
                    <div key={artist.name} className="flex items-center gap-3">
                      <span
                        className="font-stat text-xs tabular-nums w-4 shrink-0"
                        style={{ color: MUTED }}
                      >
                        {idx + 1}
                      </span>
                      <ImageWithFallback
                        src={artist.artist_image_url}
                        alt={artist.name}
                        size={36}
                        shape="circle"
                        fallbackText={artist.name}
                      />
                      <span className="font-ui text-sm font-medium truncate" style={{ color: TEXT }}>
                        {artist.name}
                      </span>
                    </div>
                  ))}
                </div>
                {detail.all_artists.length > 5 && (
                  <ViewAllLink onClick={() => setOpenModal("artists")}>
                    View all artists →
                  </ViewAllLink>
                )}
              </CardShell>

              <CardShell>
                <CardTitle icon={<Music2 size={15} />} iconColor={GREEN}>
                  Representative Tracks
                </CardTitle>
                <div className="space-y-2">
                  {repTracks.map((track, idx) => (
                    <div
                      key={`${track.name}-${idx}`}
                      className="group flex items-center gap-3"
                    >
                      <span
                        className="font-stat text-xs tabular-nums w-4 shrink-0"
                        style={{ color: MUTED }}
                      >
                        {idx + 1}
                      </span>
                      <ImageWithFallback
                        src={track.album_image_url}
                        alt={track.name}
                        size={36}
                        shape="square"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-ui text-sm font-medium truncate" style={{ color: TEXT }}>
                          {track.name}
                        </p>
                      </div>
                      <p
                        className="font-ui text-xs truncate max-w-[40%] text-right"
                        style={{ color: MUTED }}
                      >
                        {track.artist}
                      </p>
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
                  <ViewAllLink onClick={() => setOpenModal("tracks")}>
                    View all tracks →
                  </ViewAllLink>
                )}
              </CardShell>
            </div>

            {/* Right: Related + Snapshot */}
            <div className="space-y-4">
              <CardShell>
                <CardTitle icon={<Target size={15} />} iconColor={PURPLE}>
                  Related Communities
                </CardTitle>
                <div className="space-y-3">
                  {relatedTop5.map((rel) => (
                    <Link
                      key={rel.cluster_id}
                      href={`/community/${rel.cluster_id}`}
                      className="flex items-start justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <p
                          className="font-ui text-sm font-medium truncate group-hover:underline"
                          style={{ color: TEXT }}
                        >
                          {rel.name}
                        </p>
                        <p className="font-ui text-xs truncate mt-0.5" style={{ color: MUTED }}>
                          {rel.canonical_name}
                        </p>
                      </div>
                      <span
                        className="font-stat text-sm font-semibold tabular-nums shrink-0"
                        style={{ color: GREEN }}
                      >
                        {Math.round(rel.similarity * 100)}%
                      </span>
                    </Link>
                  ))}
                  {relatedTop5.length === 0 && (
                    <p className="font-ui text-xs" style={{ color: MUTED }}>
                      No related communities
                    </p>
                  )}
                </div>
                {related.length > 5 && (
                  <ViewAllLink onClick={() => setOpenModal("related")}>
                    View all related →
                  </ViewAllLink>
                )}
              </CardShell>

              <CardShell>
                <CardTitle icon={<Info size={15} />} iconColor={GREEN}>
                  Community Snapshot
                </CardTitle>
                <dl className="space-y-3">
                  {detail.keywords.length > 0 && (
                    <div>
                      <dt className="font-ui text-[11px] uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>
                        Top tags
                      </dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {detail.keywords.slice(0, 6).map((kw) => (
                          <span
                            key={kw}
                            className="font-ui text-[11px] px-2 py-0.5 rounded"
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              color: "rgba(255,255,255,0.6)",
                              border: `1px solid ${CARD_BORDER}`,
                            }}
                          >
                            {kw}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  {detail.top_artists.length > 0 && (
                    <div>
                      <dt className="font-ui text-[11px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>
                        Top artists
                      </dt>
                      <dd className="font-ui text-sm" style={{ color: TEXT }}>
                        {detail.top_artists
                          .slice(0, 5)
                          .map((a) => a.name)
                          .join(", ")}
                      </dd>
                    </div>
                  )}
                  <div className="flex gap-8 pt-1">
                    <div>
                      <dt className="font-ui text-[11px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>
                        Tracks
                      </dt>
                      <dd className="font-stat text-sm font-semibold tabular-nums" style={{ color: TEXT }}>
                        {detail.track_count.toLocaleString()}
                      </dd>
                    </div>
                    {percentage !== null && (
                      <div>
                        <dt className="font-ui text-[11px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>
                          Percent of library
                        </dt>
                        <dd className="font-stat text-sm font-semibold tabular-nums" style={{ color: TEXT }}>
                          {percentage.toFixed(1)}%
                        </dd>
                      </div>
                    )}
                  </div>
                </dl>
              </CardShell>
            </div>
          </div>
        </div>
      </PageShell>

      <CommunityListModal
        isOpen={openModal === "artists"}
        onClose={() => setOpenModal(null)}
        title="All Artists"
        items={detail.all_artists}
        type="artists"
        accentColor={archetypeColor}
      />
      <CommunityListModal
        isOpen={openModal === "tracks"}
        onClose={() => setOpenModal(null)}
        title="All Representative Tracks"
        items={detail.all_tracks}
        type="tracks"
        accentColor={archetypeColor}
      />
      <RelatedCommunitiesModal
        isOpen={openModal === "related"}
        onClose={() => setOpenModal(null)}
        title="Related Communities"
        items={related}
        accentColor={GREEN}
      />
    </div>
  );
}
