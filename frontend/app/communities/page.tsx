"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Flame, Music, Wifi, Moon, Headphones, Mic, Star, Gamepad, Coffee, Music2, Sparkles, Zap,
  type LucideIcon,
} from "lucide-react";
import { getTasteProfile, getCommunityDetail, getCommunitiesMeta } from "@/lib/api";
import { getArchetypeColor } from "@/hooks/useMapData";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import type { TasteProfile, Community, CommunityDetail, CommunitiesMeta } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const CLUSTER_COLORS = [
  "#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa",
  "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#e879f9",
  "#22d3ee", "#86efac", "#fca5a5", "#fde68a", "#c4b5fd",
  "#f9a8d4", "#7dd3fc", "#6ee7b7", "#fcd34d", "#d8b4fe",
];

const PAGE_SIZE = 25;
const FEATURED_COUNT = 3;

const ARCHETYPE_ICONS: Record<string, LucideIcon> = {
  "Trap Dynasty": Flame,
  "Festival Regular": Music,
  "Terminally Online": Wifi,
  "Late Night Romantic": Moon,
  "Indie Main Character": Headphones,
  "Rap Canon Devotee": Mic,
  "K-Pop Citizen": Star,
  "Side Quest Soul": Gamepad,
  "Lo-Fi Otaku": Coffee,
  "Desi Household": Music2,
  "Anime Passport": Sparkles,
  "Club Circuit": Zap,
};

// Plain genre label shown on badges/pills — the real archetype name (used for
// color/icon lookup and filter logic) stays as the underlying value everywhere.
const ARCHETYPE_GENRE_LABEL: Record<string, string> = {
  "Trap Dynasty": "Trap & Rap",
  "Festival Regular": "Electronic",
  "Terminally Online": "Internet Scenes",
  "Late Night Romantic": "Late-Night R&B",
  "Indie Main Character": "Indie & Alt",
  "Rap Canon Devotee": "Rap Essentials",
  "K-Pop Citizen": "K-Pop",
  "Side Quest Soul": "Anime & Games",
  "Lo-Fi Otaku": "Lo-Fi",
  "Desi Household": "South Asian",
  "Anime Passport": "Anime & J-Pop",
  "Club Circuit": "Club & House",
};

// Lowercase, sentence-friendly genre phrase used only in the taste-summary paragraph.
const ARCHETYPE_GENRE_PHRASE: Record<string, string> = {
  "Trap Dynasty": "trap & rap",
  "Side Quest Soul": "anime, games & J-pop",
  "Festival Regular": "electronic & festival",
  "Late Night Romantic": "late-night R&B",
  "Terminally Online": "internet scenes",
  "Rap Canon Devotee": "rap essentials",
  "K-Pop Citizen": "K-pop & pop",
  "Indie Main Character": "indie & alternative",
  "Lo-Fi Otaku": "lo-fi & chill",
  "Desi Household": "South Asian music",
  "Anime Passport": "anime & J-pop",
  "Club Circuit": "club & house",
};

function clusterColor(id: number): string {
  if (id === -1) return "#9ca3af";
  return CLUSTER_COLORS[id % CLUSTER_COLORS.length];
}

function archetypeColor(name: string): string {
  return getArchetypeColor(name);
}

function genreLabel(archetype: string): string {
  return ARCHETYPE_GENRE_LABEL[archetype] ?? archetype;
}

function genrePhrase(archetype: string): string {
  return ARCHETYPE_GENRE_PHRASE[archetype] ?? archetype;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

interface ArchetypeShare {
  name: string;
  percentage: number;
}

function computeArchetypeBreakdown(communities: Community[]): ArchetypeShare[] {
  const map = new Map<string, number>();
  for (const c of communities) {
    if (!c.archetype) continue;
    map.set(c.archetype, (map.get(c.archetype) ?? 0) + c.percentage);
  }
  return [...map.entries()]
    .map(([name, percentage]) => ({ name, percentage: Math.round(percentage * 10) / 10 }))
    .sort((a, b) => b.percentage - a.percentage);
}

// ── Name chip (community/"Atlas" name, shown as quiet metadata) ──────────────

function NameChip({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        fontSize: 11,
        fontWeight: 500,
        color: dark ? "rgba(255,255,255,0.5)" : "#6b7280",
        background: dark ? "rgba(255,255,255,0.08)" : "#f3f4f6",
        border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : "#e5e7eb"}`,
        borderRadius: 20,
        padding: "3px 10px",
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label}
    </span>
  );
}

// ── Archetype badge ───────────────────────────────────────────────────────────

function ArchetypeBadge({ archetype, size = "md" }: { archetype: string | null; size?: "sm" | "md" }) {
  if (!archetype) return null;
  const color = archetypeColor(archetype);
  const Icon = ARCHETYPE_ICONS[archetype];
  const fontSize = size === "sm" ? 10 : 11;
  const iconSize = size === "sm" ? 12 : 14;

  return (
    <span
      className="inline-flex items-center shrink-0"
      style={{
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        fontSize,
        fontWeight: 600,
        color,
        background: `${color}1a`,
        border: `1px solid ${color}40`,
        borderRadius: 20,
        padding: size === "sm" ? "3px 9px" : "4px 11px",
        gap: 5,
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      {Icon && <Icon size={iconSize} color={color} strokeWidth={2.25} aria-hidden />}
      {genreLabel(archetype)}
    </span>
  );
}

// ── Archetype breakdown bar ───────────────────────────────────────────────────

function ArchetypeBar({
  breakdown,
  selected,
  onSelect,
}: {
  breakdown: ArchetypeShare[];
  selected: string | null;
  onSelect: (a: string | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (breakdown.length === 0) return null;

  const hoveredShare = breakdown.find((b) => b.name === hovered);

  return (
    <div style={{ marginBottom: 32 }}>
      <div
        style={{
          display: "flex",
          height: 14,
          borderRadius: 999,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          background: "#eef1ec",
        }}
      >
        {breakdown.map((b) => {
          const color = archetypeColor(b.name);
          const active = selected === b.name;
          const dimmed = selected !== null && !active;
          return (
            <button
              key={b.name}
              title={`${b.name}: ${b.percentage}%`}
              onClick={() => onSelect(active ? null : b.name)}
              onMouseEnter={() => setHovered(b.name)}
              onMouseLeave={() => setHovered((h) => (h === b.name ? null : h))}
              style={{
                width: `${b.percentage}%`,
                minWidth: b.percentage > 0 ? 3 : 0,
                background: color,
                opacity: dimmed ? 0.35 : 1,
                border: "none",
                borderRight: "1px solid rgba(255,255,255,0.5)",
                cursor: "pointer",
                padding: 0,
                transition: "opacity 0.15s",
              }}
              aria-label={`Filter by ${b.name}, ${b.percentage}% of your taste`}
            />
          );
        })}
      </div>
      <div style={{ height: 20, marginTop: 6, display: "flex", alignItems: "center" }}>
        {hoveredShare ? (
          <span
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 12.5,
              fontWeight: 600,
              color: archetypeColor(hoveredShare.name),
            }}
          >
            {hoveredShare.name} · {hoveredShare.percentage}%
          </span>
        ) : (
          <span
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 11.5,
              color: "#9ca3af",
            }}
          >
            Hover a segment to see its share · click to filter
          </span>
        )}
      </div>
    </div>
  );
}

// ── Featured world card ───────────────────────────────────────────────────────

function FeaturedCard({
  community,
  detail,
  large = false,
}: {
  community: Community;
  detail: CommunityDetail | null | undefined;
  large?: boolean;
}) {
  const color = archetypeColor(community.archetype ?? "");
  const topArtists = detail?.top_artists?.slice(0, 3) ?? [];

  return (
    <Link
      href={`/community/${community.cluster_id}`}
      className="group block h-full"
      style={{ textDecoration: "none" }}
    >
      <div
        className="relative h-full overflow-hidden transition-transform duration-200 group-hover:-translate-y-1"
        style={{
          borderRadius: 24,
          background: `linear-gradient(135deg, ${color}66 0%, #0f172a 60%)`,
          border: `1px solid ${color}40`,
          minHeight: large ? 320 : 150,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 75% 65% at 88% -10%, ${color}70 0%, transparent 60%)`,
          }}
        />
        <div
          className="relative h-full flex flex-col justify-between"
          style={{ padding: large ? "28px 28px" : "20px 22px", gap: 16 }}
        >
          <div>
            {/* Line 1: canonical name — primary label, large bold DM Sans (not Playfair) */}
            <h3
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontWeight: 700,
                fontSize: large ? "1.625rem" : "1.125rem",
                lineHeight: 1.15,
                letterSpacing: "-0.01em",
                color: "#ffffff",
                margin: 0,
              }}
            >
              {community.canonical_name}
            </h3>

            {/* Line 2: top artists */}
            {topArtists.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", marginTop: 12 }}>
                {topArtists.map((a, i) => (
                  <div key={a.name} style={{ marginLeft: i === 0 ? 0 : -8, position: "relative", zIndex: topArtists.length - i }}>
                    <ImageWithFallback
                      src={a.artist_image_url}
                      alt={a.name}
                      size={32}
                      shape="circle"
                      fallbackText={a.name}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Line 3: community name — quiet metadata chip, not the headline */}
            <div style={{ marginTop: 10 }}>
              <NameChip label={community.name} dark />
            </div>
          </div>

          {/* Line 4: archetype badge + track count + share % */}
          <div className="flex items-end justify-between gap-4">
            <ArchetypeBadge archetype={community.archetype} />

            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                  fontSize: large ? 20 : 15,
                  fontWeight: 700,
                  color: "#ffffff",
                  lineHeight: 1,
                }}
              >
                {community.percentage.toFixed(1)}%
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: 10.5,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.5)",
                    marginLeft: 5,
                  }}
                >
                  of your taste
                </span>
              </span>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                {community.track_count.toLocaleString()} tracks
              </span>
              <span
                className="transition-opacity group-hover:opacity-100"
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#ffffff",
                  opacity: 0.85,
                }}
              >
                View →
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function FeaturedSkeleton({ large = false }: { large?: boolean }) {
  return (
    <div
      style={{
        borderRadius: 24,
        background: "#0f172a",
        opacity: 0.4,
        minHeight: large ? 320 : 150,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ── Gradient orb (grid card thumbnail) ────────────────────────────────────────

function GradientOrb({ color, letter }: { color: string; letter: string }) {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 9999,
        flexShrink: 0,
        position: "relative",
        background: `radial-gradient(circle at 32% 28%, ${color}f2 0%, ${color}99 45%, #0f172a 100%)`,
        boxShadow: `inset 0 0 14px ${color}80, 0 0 0 1px ${color}33`,
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 22,
          color: "#ffffff",
          textShadow: "0 1px 5px rgba(0,0,0,0.4)",
          userSelect: "none",
        }}
      >
        {letter}
      </span>
    </div>
  );
}

// ── Community grid card ───────────────────────────────────────────────────────

function CommunityCard({ community }: { community: Community }) {
  const [hovered, setHovered] = useState(false);
  const orbColor = community.archetype ? archetypeColor(community.archetype) : clusterColor(community.cluster_id);
  const firstLetter = community.name.charAt(0).toUpperCase();
  const topArtists = (community.top_artists ?? []).slice(0, 3);

  return (
    <Link
      href={`/community/${community.cluster_id}`}
      style={{ textDecoration: "none", display: "block", outline: "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          display: "flex",
          gap: 14,
          transition: "box-shadow 0.18s, transform 0.18s",
          boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.04)",
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
          cursor: "pointer",
        }}
      >
        <GradientOrb color={orbColor} letter={firstLetter} />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          {/* Top line: canonical name — primary label, bold */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontWeight: 700, fontSize: 13.5, color: "#111827",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {community.canonical_name}
            </span>
            <span
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 10, color: "#9ca3af",
                flexShrink: 0,
              }}
            >
              {community.track_count.toLocaleString()} tracks
            </span>
          </div>

          {/* Second line: community name — quiet metadata chip, not the headline */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <NameChip label={community.name} />
            </div>
            <span
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontWeight: 700, fontSize: 13, color: "#111827",
                flexShrink: 0,
              }}
            >
              {community.percentage.toFixed(1)}%
            </span>
          </div>

          {topArtists.length > 0 && (
            <p
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 11, color: "#9ca3af",
                margin: "5px 0 0",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {topArtists.join(" · ")}
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
            <ArchetypeBadge archetype={community.archetype} size="sm" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        display: "flex",
        gap: 14,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    >
      <div style={{ width: 64, height: 64, borderRadius: 9999, background: "#f3f4f6", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
        <div style={{ height: 14, width: "55%", background: "#f3f4f6", borderRadius: 6 }} />
        <div style={{ height: 11, width: "40%", background: "#f3f4f6", borderRadius: 5 }} />
        <div style={{ height: 20, width: "35%", background: "#f3f4f6", borderRadius: 20 }} />
      </div>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  archetypes: string[];
  selectedArchetype: string | null;
  onSelectArchetype: (a: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

function FilterBar({ archetypes, selectedArchetype, onSelectArchetype, searchQuery, onSearchChange }: FilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button
          onClick={() => onSelectArchetype(null)}
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: 12, fontWeight: 500,
            padding: "5px 13px",
            borderRadius: 20,
            border: "1px solid",
            cursor: "pointer",
            transition: "all 0.12s",
            whiteSpace: "nowrap",
            ...(selectedArchetype === null
              ? { background: "#111827", color: "#ffffff", borderColor: "#111827" }
              : { background: "transparent", color: "#6b7280", borderColor: "#e5e7eb" }),
          }}
        >
          All
        </button>

        {archetypes.map((a) => {
          const color = archetypeColor(a);
          const active = selectedArchetype === a;
          const Icon = ARCHETYPE_ICONS[a];
          return (
            <button
              key={a}
              onClick={() => onSelectArchetype(active ? null : a)}
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 12, fontWeight: 500,
                padding: "5px 13px",
                borderRadius: 20,
                border: `1px solid ${active ? `${color}40` : "#e5e7eb"}`,
                cursor: "pointer",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
                background: active ? `${color}20` : "transparent",
                color: active ? color : "#6b7280",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {Icon && <Icon size={12} color={active ? color : "#9ca3af"} strokeWidth={2.25} aria-hidden />}
              {genreLabel(a)}
            </button>
          );
        })}
      </div>

      <div style={{ position: "relative", width: 220 }}>
        <svg
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9ca3af" }}
          width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden
        >
          <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search worlds…"
          style={{
            width: "100%",
            paddingLeft: 30, paddingRight: searchQuery ? 30 : 12,
            paddingTop: 7, paddingBottom: 7,
            borderRadius: 20,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: 13, color: "#111827",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {searchQuery && (
          <button
            onClick={() => { onSearchChange(""); inputRef.current?.focus(); }}
            aria-label="Clear search"
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0, display: "flex" }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CommunitiesPage() {
  const [tasteData, setTasteData] = useState<TasteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [featuredDetails, setFeaturedDetails] = useState<Record<number, CommunityDetail | null>>({});
  const [communitiesMeta, setCommunitiesMeta] = useState<CommunitiesMeta | null>(null);

  useEffect(() => {
    document.title = "Worlds · Spotify Atlas";
  }, []);

  useEffect(() => {
    getTasteProfile(1)
      .then(setTasteData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getCommunitiesMeta()
      .then(setCommunitiesMeta)
      .catch(() => {});
  }, []);

  const allCommunities = useMemo<Community[]>(
    () => [...(tasteData?.communities ?? [])].sort((a, b) => b.percentage - a.percentage),
    [tasteData],
  );

  const featured = useMemo(() => allCommunities.slice(0, FEATURED_COUNT), [allCommunities]);

  // Fetch full detail (with artist images) for just the featured communities.
  useEffect(() => {
    if (featured.length === 0) return;
    let cancelled = false;

    Promise.all(
      featured.map((c) =>
        getCommunityDetail(c.cluster_id)
          .then((d) => [c.cluster_id, d] as const)
          .catch(() => [c.cluster_id, null] as const),
      ),
    ).then((results) => {
      if (cancelled) return;
      setFeaturedDetails(Object.fromEntries(results));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured.map((c) => c.cluster_id).join(",")]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedArchetype, searchQuery]);

  const archetypeBreakdown = useMemo(() => computeArchetypeBreakdown(allCommunities), [allCommunities]);
  const archetypeNames = useMemo(() => archetypeBreakdown.map((a) => a.name), [archetypeBreakdown]);

  const filtered = useMemo<Community[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    return allCommunities.filter((c) => {
      const matchesArchetype = selectedArchetype === null || c.archetype === selectedArchetype;
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.canonical_name.toLowerCase().includes(q);
      return matchesArchetype && matchesSearch;
    });
  }, [allCommunities, selectedArchetype, searchQuery]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const totalCount = allCommunities.length;
  const isFiltering = selectedArchetype !== null || searchQuery.trim().length > 0;
  const countLabel = isFiltering
    ? `${filtered.length} of ${totalCount} communities`
    : `${totalCount} communities`;

  const tasteSummaryText = useMemo(() => {
    const topGenrePhrases = archetypeBreakdown.slice(0, 3).map((a) => genrePhrase(a.name));
    const topCanonicalNames = allCommunities.slice(0, 3).map((c) => c.canonical_name);
    if (topGenrePhrases.length === 0 || topCanonicalNames.length === 0) return null;
    let text = `Your library leans heavily toward ${formatList(topGenrePhrases)}. The largest communities are ${formatList(topCanonicalNames)}.`;
    if (communitiesMeta) {
      text += ` You've entered ${communitiesMeta.new_communities_this_year} new communities so far in ${communitiesMeta.year}.`;
    }
    return text;
  }, [archetypeBreakdown, allCommunities, communitiesMeta]);

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8f5" }}>
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          background: "radial-gradient(ellipse 55% 35% at 75% 0%, rgba(29,185,84,0.06) 0%, transparent 60%)",
        }}
      />

      <div
        style={{
          maxWidth: 1152, margin: "0 auto",
          padding: "40px 32px 64px",
          position: "relative", zIndex: 1,
        }}
      >
        {/* ── Section 1: Page header ───────────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1db954", margin: "0 0 8px" }}>
            Your Worlds
          </p>
          <h1
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: "clamp(2rem, 3.6vw, 3rem)",
              lineHeight: 1.1, letterSpacing: "-0.02em",
              color: "#111827", margin: "0 0 8px",
            }}
          >
            Listening Map
          </h1>
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "0.9375rem", color: "#6b7280", margin: "0 0 10px", lineHeight: 1.5 }}>
            {loading ? "…" : totalCount} music communities discovered from your Spotify library.
          </p>
          {!loading && tasteSummaryText && (
            <p
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 15, color: "#374151", lineHeight: 1.6,
                maxWidth: 680, margin: 0,
              }}
            >
              {tasteSummaryText}
            </p>
          )}
        </div>

        {/* ── Section 2: Archetype breakdown bar ───────────────────────────── */}
        {!loading && archetypeBreakdown.length > 0 && (
          <ArchetypeBar
            breakdown={archetypeBreakdown}
            selected={selectedArchetype}
            onSelect={setSelectedArchetype}
          />
        )}

        {/* ── Section 3: Featured Worlds ────────────────────────────────────── */}
        {(loading || featured.length > 0) && (
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", margin: "0 0 14px" }}>
              Featured Communities
            </p>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2"><FeaturedSkeleton large /></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <FeaturedSkeleton />
                  <FeaturedSkeleton />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2">
                  <FeaturedCard community={featured[0]} detail={featuredDetails[featured[0].cluster_id]} large />
                </div>
                {featured.length > 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {featured.slice(1, 3).map((c) => (
                      <FeaturedCard key={c.cluster_id} community={c} detail={featuredDetails[c.cluster_id]} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Section 4: Community Explorer ────────────────────────────────── */}
        <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", margin: "0 0 14px" }}>
          Community Explorer
        </p>

        {!loading && archetypeNames.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <FilterBar
              archetypes={archetypeNames}
              selectedArchetype={selectedArchetype}
              onSelectArchetype={setSelectedArchetype}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>
        )}

        {!loading && (
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 12, color: "#9ca3af", margin: "0 0 16px" }}>
            {countLabel}
          </p>
        )}

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12, textAlign: "center" }}>
            <span style={{ fontSize: 32 }} aria-hidden>🌌</span>
            <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontWeight: 600, fontSize: 17, color: "#111827", margin: 0 }}>
              {searchQuery.trim() ? `No worlds found for "${searchQuery.trim()}"` : "No worlds in this region"}
            </p>
            <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 13.5, color: "#9ca3af", maxWidth: 280, lineHeight: 1.55, margin: 0 }}>
              {searchQuery.trim() ? "Try a different name or clear your search." : "This archetype has no communities in your taste profile."}
            </p>
            {(selectedArchetype !== null || searchQuery.trim()) && (
              <button
                onClick={() => { setSelectedArchetype(null); setSearchQuery(""); }}
                style={{ marginTop: 8, fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 13, color: "#6b7280", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "8px 18px", cursor: "pointer" }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              {visible.map((community) => (
                <CommunityCard key={community.cluster_id} community={community} />
              ))}
            </div>

            {hasMore && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
                <button
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  style={{
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: 13.5, fontWeight: 500, color: "#374151",
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 20,
                    padding: "9px 24px",
                    cursor: "pointer",
                    transition: "box-shadow 0.15s, border-color 0.15s",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#d1d5db";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb";
                  }}
                >
                  Load More Worlds
                  <span aria-hidden>↓</span>
                </button>
              </div>
            )}

            {!hasMore && filtered.length > PAGE_SIZE && (
              <p style={{ textAlign: "center", marginTop: 24, fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 12, color: "#9ca3af" }}>
                All {filtered.length} worlds shown
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
