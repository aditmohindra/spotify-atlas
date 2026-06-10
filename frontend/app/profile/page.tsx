"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  getTasteProfile,
  getTasteSummary,
  getRelatedCommunities,
  API_BASE_URL,
} from "@/lib/api";
import type {
  TasteProfile,
  TasteSummary,
  Community,
  RelatedCommunity,
  TasteTimeRange,
} from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUMMARY_CACHE_KEY = "atlas_summary";

const ARCHETYPE_DESCRIPTIONS: Record<string, string> = {
  "The Trap": "Southern rap ecosystems, ambition music, and the mythology of coming up.",
  "Terminally Online": "Internet rabbit holes, SoundCloud discoveries, and digital underground scenes.",
  "Festival Regular": "Dance floors, euphoric drops, and music that feels like collective release.",
  "Anime Passport": "Anime soundtracks, J-Pop, and the worlds that shaped your imagination.",
  "Toronto Winter Arc": "Late-night Toronto R&B, OVO melancholy, and songs for empty streets.",
  "Lo-Fi Otaku": "Lofi beats, game soundtracks, and the ambient worlds you study and sleep to.",
  "Desi Household": "Bollywood, bhangra, and the soundtrack of two cultures living in one person.",
  "Drip Report": "Streetwear-adjacent rap, flexing anthems, and music that sounds expensive.",
  "Nostalgic Club Kid": "2000s dancefloors, pop anthems, and the music that made you who you are.",
};

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
];

const RARITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  "Extremely Rare": { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  "Rare":           { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  "Niche":          { bg: "#faf5ff", text: "#6b21a8", border: "#e9d5ff" },
  "Underground":    { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  "Core":           { bg: "#f9fafb", text: "#374151", border: "#e5e7eb" },
};

const TIME_RANGES: { label: string; value: TasteTimeRange }[] = [
  { label: "All time",      value: "all" },
  { label: "Last 6 months", value: "6months" },
  { label: "Last 30 days",  value: "30days" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function clusterColor(id: number): string {
  if (id === -1) return "#dde6dd";
  return CLUSTER_COLORS[id % CLUSTER_COLORS.length];
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

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Pulse({
  width = "100%",
  height = 12,
  radius = 6,
}: {
  width?: string | number;
  height?: number;
  radius?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        background: "#e5e7eb",
        borderRadius: radius,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ── Expandable community card ──────────────────────────────────────────────────

interface CommunityCardProps {
  community: Community;
  rank: number;
  maxPct: number;
}

function CommunityCard({ community, rank, maxPct }: CommunityCardProps) {
  const [open, setOpen] = useState(false);
  const [related, setRelated] = useState<RelatedCommunity[] | null>(null);
  const [relLoading, setRelLoading] = useState(false);

  const dotColor = clusterColor(community.cluster_id);
  const rarityStyle = RARITY_STYLES[community.rarity] ?? RARITY_STYLES["Core"];

  const toggle = useCallback(async () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && related === null) {
        setRelLoading(true);
        getRelatedCommunities(community.cluster_id)
          .then((r) => setRelated(r.related.slice(0, 4)))
          .catch(() => setRelated([]))
          .finally(() => setRelLoading(false));
      }
      return next;
    });
  }, [community.cluster_id, related]);

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        overflow: "hidden",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* ── Header row ── */}
      <button
        onClick={toggle}
        style={{
          width: "100%",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Rank */}
        <span
          style={{
            fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
            fontSize: 11,
            color: "#d1d5db",
            width: 18,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {rank}
        </span>

        {/* Color dot */}
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />

        {/* Name + progress bar */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 5,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontWeight: 600,
                fontSize: 13.5,
                color: "#101828",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {community.name}
            </span>
            <span
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 12,
                fontWeight: 700,
                color: "#374151",
                flexShrink: 0,
              }}
            >
              {community.percentage.toFixed(1)}%
            </span>
          </div>
          {/* Progress bar */}
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: "#f3f4f6",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(community.percentage / maxPct) * 100}%`,
                height: "100%",
                background: dotColor,
                opacity: 0.7,
                borderRadius: 2,
                transition: "width 0.5s",
              }}
            />
          </div>
        </div>

        {/* Archetype pill */}
        {community.archetype && (
          <span
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 9.5,
              color: "#9ca3af",
              background: "#f3f4f6",
              border: "1px solid #e5e7eb",
              borderRadius: 20,
              padding: "2px 7px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {community.archetype}
          </span>
        )}

        {/* Rarity badge */}
        {community.rarity && community.rarity !== "Core" && (
          <span
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 9.5,
              background: rarityStyle.bg,
              color: rarityStyle.text,
              border: `1px solid ${rarityStyle.border}`,
              borderRadius: 20,
              padding: "2px 7px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {community.rarity}
          </span>
        )}

        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          style={{
            flexShrink: 0,
            color: "#9ca3af",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.18s",
          }}
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div
          style={{
            borderTop: "1px solid #f3f4f6",
            padding: "14px 16px 16px",
            background: "#fafafa",
          }}
        >
          {/* Description */}
          {community.description && (
            <p
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 12.5,
                color: "#374151",
                lineHeight: 1.65,
                margin: "0 0 12px",
              }}
            >
              {community.description}
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Top artists */}
            {community.top_artists.length > 0 && (
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "#9ca3af",
                    margin: "0 0 6px",
                  }}
                >
                  Top Artists
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {community.top_artists.slice(0, 5).map((artist) => (
                    <span
                      key={artist}
                      style={{
                        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                        fontSize: 12,
                        color: "#374151",
                      }}
                    >
                      {artist}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Keywords */}
            {community.keywords.length > 0 && (
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "#9ca3af",
                    margin: "0 0 6px",
                  }}
                >
                  Sounds Like
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {community.keywords.slice(0, 8).map((kw) => (
                    <span
                      key={kw}
                      style={{
                        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                        fontSize: 10.5,
                        background: "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        borderRadius: 20,
                        padding: "2px 8px",
                        color: "#6b7280",
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Related communities */}
          <div style={{ marginTop: 14 }}>
            <p
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "#9ca3af",
                margin: "0 0 7px",
              }}
            >
              Related Worlds
            </p>
            {relLoading ? (
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3].map((i) => (
                  <Pulse key={i} width={90} height={28} radius={20} />
                ))}
              </div>
            ) : related && related.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {related.map((r) => (
                  <Link
                    key={r.cluster_id}
                    href={`/community/${r.cluster_id}`}
                    style={{
                      fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                      fontSize: 11.5,
                      color: "#374151",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 20,
                      padding: "4px 10px",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      transition: "border-color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.borderColor = "#1db954";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#1db954";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.borderColor = "#e5e7eb";
                      (e.currentTarget as HTMLAnchorElement).style.color = "#374151";
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: clusterColor(r.cluster_id),
                        flexShrink: 0,
                      }}
                    />
                    {r.name}
                  </Link>
                ))}
              </div>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 11.5,
                  color: "#d1d5db",
                }}
              >
                No related worlds found.
              </p>
            )}
          </div>

          {/* Link to full community page */}
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <Link
              href={`/community/${community.cluster_id}`}
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 11.5,
                fontWeight: 600,
                color: "#1db954",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Explore this world
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M2 6h8M6 2.5l3.5 3.5L6 9.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [tasteData, setTasteData] = useState<TasteProfile | null>(null);
  const [summary, setSummary] = useState<TasteSummary | null>(null);
  const [tasteLoading, setTasteLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TasteTimeRange>("all");
  const [showAll, setShowAll] = useState(false);
  const [mapTotal, setMapTotal] = useState<number>(9892);

  useEffect(() => {
    document.title = "Profile · Spotify Atlas";
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/map`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d: { total: number }) => setMapTotal(d.total))
      .catch(() => {});
  }, []);

  // ── Summary (cached) ──────────────────────────────────────────────────────
  const doFetchSummary = useCallback(async (force = false) => {
    if (force) {
      try { localStorage.removeItem(SUMMARY_CACHE_KEY); } catch { /* private browsing */ }
      setSummary(null);
    }
    setSummaryLoading(true);
    try {
      const data = await getTasteSummary(1);
      setSummary(data);
      try { localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
    } catch { /* cold start — leave skeleton */ }
    finally { setSummaryLoading(false); }
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
    } catch { /* corrupt cache — fall through */ }
    doFetchSummary();
  }, [doFetchSummary]);

  // ── Taste profile (re-fetched on time range change) ───────────────────────
  useEffect(() => {
    setTasteLoading(true);
    getTasteProfile(1, timeRange)
      .then((data) => setTasteData(data))
      .catch(() => {})
      .finally(() => setTasteLoading(false));
  }, [timeRange]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const communities = tasteData?.communities ?? [];
  const archetypes = useMemo(() => computeArchetypes(communities), [communities]);
  const top3Archetypes = archetypes.slice(0, 3);
  const restArchetypes = archetypes.slice(3);
  const maxRestPct = Math.max(...restArchetypes.map((a) => a.percentage), 1);
  const maxArchPct = Math.max(...archetypes.map((a) => a.percentage), 1);
  const worldsFound = communities.filter((c) => c.percentage > 0).length;
  const displayedCommunities = showAll ? communities : communities.slice(0, 10);
  const maxCommPct = Math.max(...communities.map((c) => c.percentage), 1);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f9fafb",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
      }}
    >
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          padding: "40px 48px 36px",
        }}
      >
        {/* Eyebrow */}
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "#1db954",
            margin: "0 0 10px",
          }}
        >
          Your Musical Identity
        </p>

        {/* Title */}
        <h1
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: "clamp(2rem, 3.5vw, 2.75rem)",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#101828",
            margin: "0 0 10px",
          }}
        >
          {summaryLoading ? (
            <Pulse width={320} height={42} radius={8} />
          ) : (
            summary?.title ?? "Your Atlas"
          )}
        </h1>

        {/* Subtitle */}
        <p style={{ fontSize: "0.9375rem", color: "#6b7280", lineHeight: 1.6, margin: "0 0 20px" }}>
          You don&apos;t just listen to songs. You collect places to disappear into.
        </p>

        {/* Stats strip */}
        <div style={{ display: "flex", gap: 36, flexWrap: "wrap" }}>
          {[
            { val: mapTotal.toLocaleString(), label: "tracks mapped" },
            { val: tasteLoading ? "—" : String(worldsFound), label: "worlds found" },
            { val: tasteLoading ? "—" : (archetypes[0]?.name ?? "—"), label: "dominant identity" },
          ].map(({ val, label }) => (
            <div key={label}>
              <div
                style={{
                  fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                  fontWeight: 700,
                  fontSize: "1.2rem",
                  color: "#101828",
                  lineHeight: 1,
                  marginBottom: 3,
                }}
              >
                {val}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 48px 64px" }}>

        {/* ── Atlas Read card ─────────────────────────────────────────────── */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderLeft: "3px solid #1db954",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 36,
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "#9ca3af",
              margin: "0 0 8px",
            }}
          >
            Atlas Read
          </p>
          {summaryLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Pulse width="100%" height={13} />
              <Pulse width="94%" height={13} />
              <Pulse width="80%" height={13} />
            </div>
          ) : (
            <p
              style={{
                fontSize: "0.875rem",
                color: "#374151",
                lineHeight: 1.75,
                margin: 0,
              }}
            >
              {summary?.summary ?? "Your atlas read could not be loaded."}
            </p>
          )}
          {!summaryLoading && (
            <button
              onClick={() => doFetchSummary(true)}
              style={{
                marginTop: 10,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 11.5,
                color: "#9ca3af",
              }}
            >
              ↺ Regenerate
            </button>
          )}
        </div>

        {/* ── Archetypes ───────────────────────────────────────────────────── */}
        <h2
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "#1db954",
            margin: "0 0 14px",
          }}
        >
          Your Archetypes
        </h2>

        {/* Top 3 tinted cards */}
        {tasteLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            <Pulse height={100} radius={12} />
            <Pulse height={100} radius={12} />
            <Pulse height={100} radius={12} />
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {top3Archetypes.map((arch, i) => {
              const palette = ARCHETYPE_PALETTE[i % ARCHETYPE_PALETTE.length];
              return (
                <div
                  key={arch.name}
                  style={{
                    background: palette.bg,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 12,
                    padding: "16px 18px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                      fontWeight: 700,
                      fontSize: "1.4rem",
                      color: palette.accent,
                      lineHeight: 1,
                      marginBottom: 5,
                    }}
                  >
                    {arch.percentage.toFixed(1)}%
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: "#101828",
                      lineHeight: 1.3,
                      marginBottom: 4,
                    }}
                  >
                    {arch.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
                    {arch.communityCount} {arch.communityCount === 1 ? "world" : "worlds"}
                  </div>
                  <div
                    style={{
                      height: 3,
                      borderRadius: 2,
                      background: "rgba(0,0,0,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${(arch.percentage / maxArchPct) * 100}%`,
                        height: "100%",
                        background: palette.accent,
                        opacity: 0.5,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  {arch.description && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        lineHeight: 1.55,
                        margin: "8px 0 0",
                      }}
                    >
                      {arch.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Remaining archetype bars */}
        {!tasteLoading && restArchetypes.length > 0 && (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 36,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {restArchetypes.map((arch) => (
              <div
                key={arch.name}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "#374151",
                    width: 160,
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {arch.name}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 3,
                    background: "#f3f4f6",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(arch.percentage / maxRestPct) * 100}%`,
                      height: "100%",
                      background: "#1db954",
                      opacity: 0.4,
                      borderRadius: 3,
                      transition: "width 0.5s",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                    fontSize: 11,
                    color: "#9ca3af",
                    width: 40,
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {arch.percentage.toFixed(1)}%
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#d1d5db",
                    width: 70,
                    flexShrink: 0,
                  }}
                >
                  {arch.communityCount} {arch.communityCount === 1 ? "world" : "worlds"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Communities ──────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "#1db954",
              margin: 0,
            }}
          >
            Your Worlds
          </h2>

          {/* Time range tabs */}
          <div
            style={{
              display: "flex",
              background: "#f3f4f6",
              borderRadius: 20,
              padding: 3,
              gap: 2,
            }}
          >
            {TIME_RANGES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setTimeRange(value)}
                style={{
                  fontSize: 11.5,
                  fontWeight: timeRange === value ? 600 : 400,
                  color: timeRange === value ? "#101828" : "#6b7280",
                  background: timeRange === value ? "#ffffff" : "transparent",
                  border: "none",
                  borderRadius: 16,
                  padding: "5px 12px",
                  cursor: "pointer",
                  boxShadow: timeRange === value ? "0 1px 3px rgba(0,0,0,0.10)" : "none",
                  transition: "background 0.12s, color 0.12s",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tasteLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Pulse key={i} height={52} radius={12} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {displayedCommunities.map((community, i) => (
              <CommunityCard
                key={community.cluster_id}
                community={community}
                rank={i + 1}
                maxPct={maxCommPct}
              />
            ))}
          </div>
        )}

        {/* Show all / collapse toggle */}
        {!tasteLoading && communities.length > 10 && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button
              onClick={() => setShowAll((v) => !v)}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 20,
                padding: "8px 22px",
                fontSize: 13,
                color: "#374151",
                cursor: "pointer",
                transition: "border-color 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#1db954";
                (e.currentTarget as HTMLButtonElement).style.color = "#1db954";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb";
                (e.currentTarget as HTMLButtonElement).style.color = "#374151";
              }}
            >
              {showAll
                ? "↑ Show fewer worlds"
                : `Show all ${communities.length} worlds ↓`}
            </button>
          </div>
        )}

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <div
          style={{
            marginTop: 48,
            padding: "28px 32px",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "#1db954",
                margin: "0 0 6px",
              }}
            >
              Galaxy Map
            </p>
            <h3
              style={{
                fontFamily: "var(--font-playfair), Georgia, serif",
                fontSize: "1.35rem",
                fontWeight: 700,
                color: "#101828",
                margin: "0 0 6px",
              }}
            >
              Every track, mapped.
            </h3>
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0, lineHeight: 1.55 }}>
              {mapTotal.toLocaleString()} tracks visualised across{" "}
              {tasteLoading ? "—" : worldsFound} communities in your taste universe.
            </p>
          </div>
          <Link
            href="/map"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 40,
              padding: "0 20px",
              borderRadius: 20,
              background: "#1db954",
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Open the Atlas
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2 6h8M6 2.5l3.5 3.5L6 9.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
