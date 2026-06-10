"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { getTasteProfile, getTasteSummary, API_BASE_URL } from "@/lib/api";
import type {
  TasteProfile,
  TasteSummary,
  TasteTimeRange,
  Community,
} from "@/lib/types";
import { AtlasCard } from "@/components/atlas/AtlasCard";
import { AtlasPill } from "@/components/atlas/AtlasPill";
import { StatBlock } from "@/components/atlas/StatBlock";
import { SectionHeader } from "@/components/atlas/SectionHeader";
import { LoadingSkeleton } from "@/components/atlas/LoadingSkeleton";
import { PageShell } from "@/components/atlas/PageShell";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const SUMMARY_CACHE_KEY = "atlas_summary";

const ARCHETYPE_DESCRIPTIONS: Record<string, string> = {
  "The Trap":
    "Southern rap ecosystems, ambition music, and the mythology of coming up.",
  "Terminally Online":
    "Internet rabbit holes, SoundCloud discoveries, and digital underground scenes.",
  "Festival Regular":
    "Dance floors, euphoric drops, and music that feels like collective release.",
  "Anime Passport":
    "Anime soundtracks, J-Pop, and the worlds that shaped your imagination.",
  "Toronto Winter Arc":
    "Late-night Toronto R&B, OVO melancholy, and songs for empty streets.",
  "Lo-Fi Otaku":
    "Lofi beats, game soundtracks, and the ambient worlds you study and sleep to.",
  "Desi Household":
    "Bollywood, bhangra, and the soundtrack of two cultures living in one person.",
  "Drip Report":
    "Streetwear-adjacent rap, flexing anthems, and music that sounds expensive.",
  "Nostalgic Club Kid":
    "2000s dancefloors, pop anthems, and the music that made you who you are.",
};

// Soft tinted palettes for archetype cards — green is reserved for Spotify accent
const ARCHETYPE_PALETTE = [
  { bg: "#fef9ec", border: "#fde68a", accent: "#b45309" },
  { bg: "#eef3fb", border: "#bfdbfe", accent: "#1d4ed8" },
  { bg: "#f5f0fb", border: "#ddd6fe", accent: "#7c3aed" },
  { bg: "#fef2f2", border: "#fecaca", accent: "#dc2626" },
  { bg: "#f0fdf4", border: "#bbf7d0", accent: "#15803d" },
  { bg: "#fff7ed", border: "#fed7aa", accent: "#ea580c" },
  { bg: "#f0f9ff", border: "#bae6fd", accent: "#0284c7" },
  { bg: "#fdf4ff", border: "#f5d0fe", accent: "#a21caf" },
  { bg: "#fffbeb", border: "#fef08a", accent: "#ca8a04" },
] as const;

const CLUSTER_COLORS = [
  "#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa",
  "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#e879f9",
  "#22d3ee", "#86efac", "#fca5a5", "#fde68a", "#c4b5fd",
  "#f9a8d4", "#7dd3fc", "#6ee7b7", "#fcd34d", "#d8b4fe",
  "#93c5fd", "#6ee7b7", "#fca5a5", "#fde68a", "#ddd6fe",
];

const TIME_RANGE_OPTIONS: { key: TasteTimeRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "6months", label: "Last 6 months" },
  { key: "30days", label: "Last 30 days" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getClusterColor(clusterId: number): string {
  if (clusterId === -1) return "#dde6dd";
  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

interface ComputedArchetype {
  name: string;
  percentage: number;
  communityCount: number;
  description: string;
}

function computeArchetypes(communities: Community[]): ComputedArchetype[] {
  const map = new Map<string, { pct: number; count: number }>();
  for (const c of communities) {
    if (!c.archetype) continue;
    const existing = map.get(c.archetype);
    if (existing) {
      existing.pct += c.percentage;
      existing.count += 1;
    } else {
      map.set(c.archetype, { pct: c.percentage, count: 1 });
    }
  }
  return [...map.entries()]
    .map(([name, { pct, count }]) => ({
      name,
      percentage: Math.round(pct * 10) / 10,
      communityCount: count,
      description: ARCHETYPE_DESCRIPTIONS[name] ?? "",
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IdentityPage() {
  const [timeRange, setTimeRange] = useState<TasteTimeRange>("all");
  const [tasteData, setTasteData] = useState<TasteProfile | null>(null);
  const [summary, setSummary] = useState<TasteSummary | null>(null);
  const [tasteLoading, setTasteLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [showAllCommunities, setShowAllCommunities] = useState(false);
  const [mapTotal, setMapTotal] = useState<number>(9892);

  // ── Fetch map total for stats strip ────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE_URL}/map`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d: { total: number }) => setMapTotal(d.total))
      .catch(() => {});
  }, []);

  // ── Summary: load from localStorage cache or fetch ─────────────────────
  const doFetchSummary = useCallback(async (force = false) => {
    if (force) {
      try {
        localStorage.removeItem(SUMMARY_CACHE_KEY);
      } catch {
        /* private browsing */
      }
      setSummary(null);
    }
    setSummaryLoading(true);
    try {
      const data = await getTasteSummary(1);
      setSummary(data);
      try {
        localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(data));
      } catch {
        /* storage quota */
      }
    } catch {
      // leave skeleton visible; backend may still be cold-starting
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SUMMARY_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TasteSummary;
        if (parsed.title && parsed.summary) {
          setSummary(parsed);
          setSummaryLoading(false);
          return;
        }
      }
    } catch {
      /* corrupt cache — fall through to fetch */
    }
    doFetchSummary();
  }, [doFetchSummary]);

  // ── Taste profile: re-fetches on time range change ─────────────────────
  useEffect(() => {
    setTasteLoading(true);
    getTasteProfile(1, timeRange)
      .then((data) => setTasteData(data))
      .catch(() => {})
      .finally(() => setTasteLoading(false));
  }, [timeRange]);

  // ── Derived data ────────────────────────────────────────────────────────
  const archetypes = useMemo(
    () => (tasteData ? computeArchetypes(tasteData.communities) : []),
    [tasteData],
  );
  const topArchetypes = archetypes.slice(0, 3);
  const restArchetypes = archetypes.slice(3);

  const communities = tasteData?.communities ?? [];
  const visibleCommunities = showAllCommunities
    ? communities
    : communities.slice(0, 10);

  const worldsFound = communities.filter((c) => c.percentage > 0).length;
  const dominantIdentity = archetypes[0]?.name ?? "—";

  // Hero: top 3 community names for the floating chips
  const heroChips = communities.slice(0, 3).map((c) => c.name);

  // Scale community progress bars relative to the top community
  const maxCommunityPct = Math.max(...communities.map((c) => c.percentage), 1);

  // Scale archetype compact bars relative to the top archetype (restArchetypes only)
  const maxRestPct = Math.max(...restArchetypes.map((a) => a.percentage), 1);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="pt-16 min-h-screen bg-background">

      {/* ── 1. HERO ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 70% at 70% 0%, rgba(29,185,84,0.10) 0%, transparent 65%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-16 sm:py-24 flex flex-col lg:flex-row items-center gap-12 lg:gap-20 relative z-10">
          {/* Left: text */}
          <div className="flex-1 min-w-0">
            <p className="text-eyebrow mb-4" style={{ color: "var(--green)" }}>
              YOUR MUSICAL IDENTITY
            </p>
            <h1
              className="font-hero text-ink"
              style={{
                fontSize: "clamp(2.25rem, 4.5vw, 3.5rem)",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              {summaryLoading ? (
                <span className="block w-72 h-12 bg-border rounded-xl animate-pulse" />
              ) : (
                (summary?.title ?? "Your Atlas")
              )}
            </h1>
            <div className="mt-5 space-y-0.5">
              <p className="font-ui text-[1.0625rem] leading-snug" style={{ color: "#374151" }}>
                You don&apos;t just listen to songs.
              </p>
              <p className="font-ui text-[1.0625rem] leading-snug" style={{ color: "#374151" }}>
                You collect places to disappear into.
              </p>
            </div>
          </div>

          {/* Right: orb + community name chips */}
          <div className="relative shrink-0 w-[300px] h-[300px] flex items-center justify-center">
            <div
              className="w-56 h-56 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 38% 38%, rgba(29,185,84,0.32) 0%, rgba(29,185,84,0.10) 48%, transparent 68%)",
                boxShadow: "0 0 72px 24px rgba(29,185,84,0.11)",
              }}
            />
            {/* Chip — top right */}
            {heroChips[0] && (
              <span className="absolute top-6 right-0 font-ui text-[11.5px] font-medium bg-surface border border-border text-ink rounded-full px-3 py-1.5 shadow-card whitespace-nowrap leading-none">
                {heroChips[0]}
              </span>
            )}
            {/* Chip — bottom left */}
            {heroChips[1] && (
              <span className="absolute bottom-10 left-0 font-ui text-[11.5px] font-medium bg-surface border border-border text-ink rounded-full px-3 py-1.5 shadow-card whitespace-nowrap leading-none">
                {heroChips[1]}
              </span>
            )}
            {/* Chip — mid right (green tint = active/dominant) */}
            {heroChips[2] && (
              <span
                className="absolute top-1/2 -translate-y-1/2 -right-6 font-ui text-[11.5px] font-semibold rounded-full px-3 py-1.5 shadow-card whitespace-nowrap leading-none border"
                style={{
                  background: "var(--green-soft)",
                  borderColor: "rgba(29,185,84,0.20)",
                  color: "var(--green-dark)",
                }}
              >
                {heroChips[2]}
              </span>
            )}
          </div>
        </div>
      </section>

      <PageShell maxWidth="xl" className="pt-0 pb-24">
        <div className="space-y-10">

          {/* ── 2. AI SUMMARY CARD ───────────────────────────────────────── */}
          <AtlasCard
            variant="default"
            padding="lg"
            style={{ borderLeft: "3px solid var(--green)" }}
          >
            <div className="flex flex-col gap-4">
              <p className="text-eyebrow">ATLAS READ</p>
              {summaryLoading ? (
                <LoadingSkeleton lines={3} className="h-[18px]" />
              ) : (
                <p
                  className="font-ui text-ink leading-[1.75]"
                  style={{ fontSize: "1rem" }}
                >
                  {summary?.summary ?? "Your atlas read could not be loaded."}
                </p>
              )}
              {!summaryLoading && (
                <button
                  onClick={() => doFetchSummary(true)}
                  className="self-start flex items-center gap-1 font-ui text-[12px] transition-colors duration-150"
                  style={{ color: "#98a2b3" }}
                >
                  <span aria-hidden>↺</span> Regenerate
                </button>
              )}
            </div>
          </AtlasCard>

          {/* ── 3. TOP 3 ARCHETYPE CARDS ─────────────────────────────────── */}
          {tasteLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-atlas-hero p-8 border border-border bg-surface animate-pulse"
                >
                  <div className="h-12 w-28 bg-border rounded-full mb-5" />
                  <div className="h-5 w-36 bg-border rounded-full mb-3" />
                  <div className="h-4 w-full bg-border rounded-full mb-1.5" />
                  <div className="h-4 w-4/5 bg-border rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {topArchetypes.map((arch, i) => {
                const palette = ARCHETYPE_PALETTE[i % ARCHETYPE_PALETTE.length];
                return (
                  <div
                    key={arch.name}
                    className="rounded-atlas-hero p-8 flex flex-col gap-4 border"
                    style={{ background: palette.bg, borderColor: palette.border }}
                  >
                    {/* Large percentage */}
                    <span
                      className="font-stat font-semibold leading-none"
                      style={{ fontSize: "3rem", color: palette.accent }}
                    >
                      {arch.percentage.toFixed(1)}%
                    </span>
                    {/* Name + description */}
                    <div className="flex-1">
                      <h3 className="font-ui font-bold text-ink text-lg leading-tight mb-2">
                        {arch.name}
                      </h3>
                      {arch.description && (
                        <p className="font-ui text-sm leading-relaxed" style={{ color: "#667085" }}>
                          {arch.description}
                        </p>
                      )}
                    </div>
                    {/* Community count pill */}
                    <span
                      className="self-start font-ui text-xs font-medium px-2.5 py-1 rounded-full border"
                      style={{
                        color: palette.accent,
                        borderColor: palette.border,
                        background: "rgba(255,255,255,0.55)",
                      }}
                    >
                      {arch.communityCount}{" "}
                      {arch.communityCount === 1 ? "world" : "worlds"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 4. REMAINING ARCHETYPES (compact bars) ───────────────────── */}
          {!tasteLoading && restArchetypes.length > 0 && (
            <div className="space-y-2 px-1">
              {restArchetypes.map((arch) => (
                <div key={arch.name} className="flex items-center gap-3 py-0.5">
                  <span className="font-ui text-sm w-40 shrink-0 truncate" style={{ color: "#667085" }}>
                    {arch.name}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(arch.percentage / maxRestPct) * 100}%`,
                        background: "var(--green)",
                        opacity: 0.35,
                      }}
                    />
                  </div>
                  <span className="font-stat text-xs w-12 text-right shrink-0 tabular-nums" style={{ color: "#667085" }}>
                    {arch.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── 5. STATS STRIP ───────────────────────────────────────────── */}
          <AtlasCard variant="soft" padding="lg">
            <div className="flex flex-wrap gap-8 sm:gap-16">
              <StatBlock
                value={mapTotal.toLocaleString()}
                label="tracks mapped"
                size="md"
              />
              <StatBlock
                value={tasteLoading ? "—" : worldsFound.toString()}
                label="worlds found"
                size="md"
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-stat font-semibold text-ink text-3xl tabular-nums leading-tight">
                  {tasteLoading ? "—" : dominantIdentity}
                </span>
                <span
                  className="font-ui uppercase tracking-wide"
                  style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", color: "#667085" }}
                >
                  dominant identity
                </span>
              </div>
            </div>
          </AtlasCard>

          {/* ── 6. TIME RANGE TABS ───────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 pt-2">
            {TIME_RANGE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  setShowAllCommunities(false);
                  setTimeRange(key);
                }}
                style={timeRange === key ? {} : { color: "#667085" }}
                className={cn(
                  "px-4 py-2 rounded-full text-[13.5px] font-ui font-medium transition-colors duration-150",
                  timeRange === key
                    ? "bg-green-soft text-green-dark"
                    : "hover:text-ink hover:bg-surface-soft",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── 7. TOP COMMUNITIES ───────────────────────────────────────── */}
          <div className="space-y-5">
            <SectionHeader
              eyebrow="YOUR WORLDS"
              title="Top Communities"
              subtitle="The music worlds you inhabit most."
            />

            {tasteLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-surface border border-border rounded-atlas-md p-5 animate-pulse"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-5 h-4 bg-border rounded-full shrink-0" />
                      <div className="w-2.5 h-2.5 rounded-full bg-border shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-48 bg-border rounded-full" />
                        <div className="h-3 w-32 bg-border rounded-full" />
                      </div>
                      <div className="h-4 w-12 bg-border rounded-full" />
                    </div>
                    <div className="mt-3 ml-[52px] h-[3px] bg-border rounded-full" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {visibleCommunities.map((community, i) => {
                    const dotColor = getClusterColor(community.cluster_id);
                    return (
                      <Link
                        key={community.cluster_id}
                        href={`/community/${community.cluster_id}`}
                        className="block group"
                      >
                        <div className="bg-surface border border-border rounded-atlas-md px-5 py-4 hover-lift">
                          <div className="flex items-center gap-4">
                            {/* Rank */}
                            <span className="font-stat text-sm w-5 text-right shrink-0 tabular-nums" style={{ color: "#98a2b3" }}>
                              {i + 1}
                            </span>
                            {/* Cluster color dot */}
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: dotColor }}
                            />
                            {/* Name + meta */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-ui font-semibold text-ink text-[14.5px] leading-tight truncate">
                                  {community.name}
                                </span>
                                {community.archetype && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium leading-none whitespace-nowrap" style={{ background: "#f1f5f0", color: "#667085", border: "1px solid #dde6dd" }}>
                                    {community.archetype}
                                  </span>
                                )}
                              </div>
                              <p className="font-ui text-xs mt-0.5 truncate" style={{ color: "#98a2b3" }}>
                                {community.canonical_name}
                                {community.top_artists[0] && (
                                  <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                    · {community.top_artists[0]}
                                  </span>
                                )}
                              </p>
                            </div>
                            {/* Percentage */}
                            <span className="font-stat text-sm text-ink font-semibold shrink-0 tabular-nums">
                              {community.percentage.toFixed(1)}%
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-3 ml-[52px] h-[3px] rounded-full bg-border overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${(community.percentage / maxCommunityPct) * 100}%`,
                                background: dotColor,
                              }}
                            />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Expand/collapse toggle */}
                {communities.length > 10 && (
                  <button
                    onClick={() => setShowAllCommunities((v) => !v)}
                    className="w-full py-3.5 font-ui text-sm hover:text-ink transition-colors duration-150 flex items-center justify-center gap-1.5 border border-border rounded-atlas-md hover:bg-surface-soft"
                    style={{ color: "#667085" }}
                  >
                    {showAllCommunities
                      ? "Show top 10 only ↑"
                      : `Show all ${communities.length} worlds ↓`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── 8. OPEN ATLAS CTA ────────────────────────────────────────── */}
          <div
            className="rounded-atlas-lg border p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
            style={{
              background: "var(--green-soft)",
              borderColor: "rgba(29,185,84,0.20)",
            }}
          >
            <div>
              <h3 className="font-ui font-bold text-ink text-xl mb-1.5">
                Explore the Galaxy
              </h3>
              <p className="font-ui text-[0.9375rem] leading-relaxed" style={{ color: "#667085" }}>
                See how your worlds connect in the full atlas map.
              </p>
            </div>
            <Link
              href="/map"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-atlas-md bg-green text-white text-sm font-ui font-semibold shadow-sm hover:bg-green-dark active:scale-[0.98] transition-all duration-150 shrink-0"
            >
              Open the Atlas
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2.5 7h9M7.5 3l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>

        </div>
      </PageShell>
    </div>
  );
}
