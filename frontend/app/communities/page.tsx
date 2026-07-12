"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Grid2x2,
  Music2,
  CircleDot,
  Shuffle,
  MapPin,
  ExternalLink,
  Search,
  Star,
  type LucideIcon,
} from "lucide-react";
import { getTasteProfile } from "@/lib/api";
import { getArchetypeColor, useMapData, type TrackPoint } from "@/hooks/useMapData";
import type { TasteProfile, Community } from "@/lib/types";
import CommunityMiniMap, {
  type MiniMapLabel,
  type MiniMapPoint,
} from "@/components/community/CommunityMiniMap";

// ── Theme ─────────────────────────────────────────────────────────────────────

const BG = "#0a0e1a";
const CARD_BG = "#111827";
const CARD_BORDER = "rgba(255,255,255,0.08)";
const GREEN = "#1db954";
const TEXT = "#f9fafb";
const MUTED = "#9ca3af";
const FONT = "var(--font-dm-sans), system-ui, sans-serif";
const MONO = "var(--font-jetbrains-mono), ui-monospace, monospace";

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

function genreLabel(archetype: string): string {
  return ARCHETYPE_GENRE_LABEL[archetype] ?? archetype;
}

type TabId = "overview" | "all" | "between";
type SortKey = "tracks" | "percentage";

const FEATURED_COUNT = 3;
const PAGE_SIZE = 24;

// ── Helpers ───────────────────────────────────────────────────────────────────

function genreTags(community: Community): string[] {
  const fromKeywords = (community.keywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (fromKeywords.length > 0) return fromKeywords;
  if (community.archetype) return [genreLabel(community.archetype)];
  return [];
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ── Header stat card ──────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  iconColor,
  value,
  label,
}: {
  icon: LucideIcon;
  iconColor: string;
  value: string;
  label: string;
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `${iconColor}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={18} color={iconColor} strokeWidth={2.25} aria-hidden />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 20,
            color: TEXT,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {value}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED, marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Hero mini atlas ───────────────────────────────────────────────────────────

function HeroMiniAtlas({
  points,
  labels,
  loading,
}: {
  points: MiniMapPoint[];
  labels: MiniMapLabel[];
  loading: boolean;
}) {
  return (
    <div
      className="communities-hero"
      style={{
        position: "relative",
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        overflow: "hidden",
        minHeight: 168,
        height: "100%",
      }}
    >
      {loading || points.length === 0 ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            minHeight: 168,
            background: "linear-gradient(135deg, #0c1220 0%, #111827 100%)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ) : (
        <CommunityMiniMap
          points={points}
          width={420}
          height={168}
          fill
          maxPoints={3500}
          labels={labels}
        />
      )}
      <Link
        href="/map"
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          borderRadius: 8,
          background: "rgba(10,14,26,0.82)",
          border: `1px solid ${CARD_BORDER}`,
          color: TEXT,
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
          backdropFilter: "blur(8px)",
        }}
      >
        Open Atlas map
        <ExternalLink size={12} aria-hidden />
      </Link>
    </div>
  );
}

// ── Community card ────────────────────────────────────────────────────────────

function CommunityCard({
  community,
  points,
  featured = false,
  featuredLarge = false,
}: {
  community: Community;
  points: MiniMapPoint[];
  featured?: boolean;
  featuredLarge?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const router = useRouter();
  const color = getArchetypeColor(community.archetype);
  const tags = genreTags(community);
  const topArtists = (community.top_artists ?? []).slice(0, 3);
  const mapW = featuredLarge ? 160 : 280;
  const mapH = featuredLarge ? 140 : 110;

  const goToMap = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push("/map");
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: CARD_BG,
        border: `1px solid ${featured ? `${GREEN}55` : CARD_BORDER}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: featuredLarge ? "row" : "column",
        transition: "box-shadow 0.18s, transform 0.18s, border-color 0.18s",
        boxShadow: hovered
          ? `0 8px 28px rgba(0,0,0,0.35)${featured ? `, 0 0 0 1px ${GREEN}33` : ""}`
          : "none",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        position: "relative",
        height: "100%",
      }}
    >
      {featured && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 2,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 6,
            background: GREEN,
            color: "#04120a",
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <Star size={10} fill="currentColor" aria-hidden />
          Featured
        </div>
      )}

      <div
        style={{
          flexShrink: 0,
          width: featuredLarge ? mapW : "100%",
          height: mapH,
          background: "#060a14",
          borderRight: featuredLarge ? `1px solid ${CARD_BORDER}` : undefined,
          borderBottom: featuredLarge ? undefined : `1px solid ${CARD_BORDER}`,
        }}
      >
        <CommunityMiniMap
          points={points}
          color={color}
          width={mapW}
          height={mapH}
          fill={!featuredLarge}
          maxPoints={400}
        />
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: featuredLarge ? "16px 18px" : "14px 14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: featuredLarge ? 16 : 13.5,
              color: TEXT,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: featuredLarge ? "normal" : "nowrap",
            }}
          >
            {community.canonical_name}
          </div>
          <div
            style={{
              marginTop: 6,
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: 999,
              background: `${GREEN}18`,
              border: `1px solid ${GREEN}33`,
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: 500,
              color: GREEN,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {community.name}
          </div>
        </div>

        {topArtists.length > 0 && (
          <div
            style={{
              fontFamily: FONT,
              fontSize: 11.5,
              color: MUTED,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {topArtists.join(" · ")}
          </div>
        )}

        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontFamily: FONT,
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: "#cbd5e1",
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${CARD_BORDER}`,
                  borderRadius: 999,
                  padding: "2px 8px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: "auto",
            paddingTop: 4,
            fontFamily: MONO,
            fontSize: 11,
            color: MUTED,
          }}
        >
          <span>
            <span style={{ color: TEXT, fontWeight: 700 }}>
              {community.track_count.toLocaleString()}
            </span>{" "}
            Tracks
          </span>
          <span style={{ opacity: 0.35 }}>·</span>
          <span>
            <span style={{ color: TEXT, fontWeight: 700 }}>
              {formatPct(community.percentage)}
            </span>{" "}
            Of library
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={goToMap}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${CARD_BORDER}`,
              background: "transparent",
              color: TEXT,
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <MapPin size={12} aria-hidden />
            View on map
          </button>
          <Link
            href={`/community/${community.cluster_id}`}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: GREEN,
              color: "#04120a",
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Explore →
          </Link>
        </div>
      </div>
    </div>
  );
}

function CardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: featured ? "row" : "column",
        animation: "pulse 1.5s ease-in-out infinite",
        minHeight: featured ? 160 : 280,
      }}
    >
      <div
        style={{
          width: featured ? 160 : "100%",
          height: featured ? 160 : 110,
          background: "#161f2e",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 14, width: "70%", background: "#1a2333", borderRadius: 6 }} />
        <div style={{ height: 20, width: "40%", background: "#1a2333", borderRadius: 999 }} />
        <div style={{ height: 11, width: "55%", background: "#1a2333", borderRadius: 5 }} />
        <div style={{ marginTop: "auto", height: 32, background: "#1a2333", borderRadius: 8 }} />
      </div>
    </div>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

function FiltersRow({
  archetypes,
  selectedArchetype,
  onSelectArchetype,
  searchQuery,
  onSearchChange,
  sortKey,
  onSortChange,
}: {
  archetypes: string[];
  selectedArchetype: string | null;
  onSelectArchetype: (a: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortKey: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectStyle: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: 12.5,
    fontWeight: 500,
    color: TEXT,
    background: CARD_BG,
    border: `1px solid ${CARD_BORDER}`,
    borderRadius: 999,
    padding: "8px 14px",
    outline: "none",
    cursor: "pointer",
    appearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: 32,
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        marginBottom: 20,
      }}
    >
      <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
        <Search
          size={14}
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: MUTED,
            pointerEvents: "none",
          }}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search communities..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            paddingLeft: 34,
            paddingRight: searchQuery ? 32 : 14,
            paddingTop: 8,
            paddingBottom: 8,
            borderRadius: 999,
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            fontFamily: FONT,
            fontSize: 13,
            color: TEXT,
            outline: "none",
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              onSearchChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: MUTED,
              padding: 0,
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      <select
        value={selectedArchetype ?? ""}
        onChange={(e) => onSelectArchetype(e.target.value || null)}
        aria-label="Filter by genre"
        style={selectStyle}
      >
        <option value="">All genres</option>
        {archetypes.map((a) => (
          <option key={a} value={a}>
            {genreLabel(a)}
          </option>
        ))}
      </select>

      <select
        value={sortKey}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
        aria-label="Sort communities"
        style={selectStyle}
      >
        <option value="percentage">Sort by: % of library</option>
        <option value="tracks">Sort by: Track count</option>
      </select>
    </div>
  );
}

// ── Between Worlds list ───────────────────────────────────────────────────────

function BetweenWorldsList({
  tracks,
  totalTracks,
}: {
  tracks: TrackPoint[];
  totalTracks: number;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q),
    );
  }, [tracks, query]);

  const pct =
    totalTracks > 0 ? ((tracks.length / totalTracks) * 100).toFixed(1) : "0.0";

  return (
    <div>
      <div
        style={{
          background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 14,
          padding: "20px 22px",
          marginBottom: 20,
        }}
      >
        <h2
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 18,
            color: TEXT,
            margin: "0 0 6px",
          }}
        >
          Tracks that don&apos;t fit neatly into one world
        </h2>
        <p
          style={{
            fontFamily: FONT,
            fontSize: 13.5,
            color: MUTED,
            margin: "0 0 16px",
            lineHeight: 1.55,
            maxWidth: 560,
          }}
        >
          These {tracks.length.toLocaleString()} tracks sit between communities —
          soft noise that wasn&apos;t confidently assigned to a single neighborhood.
          Bridge connections between worlds are coming later.
        </p>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 22, color: TEXT }}>
              {tracks.length.toLocaleString()}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED }}>
              Between Worlds tracks
            </div>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 22, color: TEXT }}>
              {pct}%
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED }}>
              of your library
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", maxWidth: 360, marginBottom: 14 }}>
        <Search
          size={14}
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: MUTED,
            pointerEvents: "none",
          }}
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tracks or artists..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            paddingLeft: 34,
            paddingRight: 14,
            paddingTop: 8,
            paddingBottom: 8,
            borderRadius: 999,
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            fontFamily: FONT,
            fontSize: 13,
            color: TEXT,
            outline: "none",
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontFamily: FONT, color: MUTED, fontSize: 14 }}>
          {query.trim()
            ? `No Between Worlds tracks match "${query.trim()}".`
            : "No Between Worlds tracks found."}
        </p>
      ) : (
        <div
          style={{
            background: CARD_BG,
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {filtered.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 16px",
                borderTop: i === 0 ? "none" : `1px solid ${CARD_BORDER}`,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#f97316",
                  flexShrink: 0,
                  opacity: 0.85,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT,
                    fontWeight: 600,
                    fontSize: 13.5,
                    color: TEXT,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.name}
                </div>
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: 12,
                    color: MUTED,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.artist}
                </div>
              </div>
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 11,
                  color: MUTED,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                Unassigned
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CommunitiesPage() {
  const [tasteData, setTasteData] = useState<TasteProfile | null>(null);
  const [tasteLoading, setTasteLoading] = useState(true);
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("percentage");
  const [tab, setTab] = useState<TabId>("overview");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: mapData, labels: clusterLabels, stats, loading: mapLoading } =
    useMapData("vibe");

  useEffect(() => {
    document.title = "Communities · Spotify Atlas";
  }, []);

  useEffect(() => {
    getTasteProfile(1)
      .then(setTasteData)
      .catch(() => {})
      .finally(() => setTasteLoading(false));
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedArchetype, searchQuery, sortKey, tab]);

  const allCommunities = useMemo<Community[]>(
    () => [...(tasteData?.communities ?? [])],
    [tasteData],
  );

  const archetypeNames = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of allCommunities) {
      if (!c.archetype) continue;
      map.set(c.archetype, (map.get(c.archetype) ?? 0) + c.percentage);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [allCommunities]);

  const pointsByCluster = useMemo(() => {
    const map = new Map<number, MiniMapPoint[]>();
    for (const pt of mapData?.points ?? []) {
      const list = map.get(pt.cluster_id);
      if (list) list.push({ x: pt.x, y: pt.y });
      else map.set(pt.cluster_id, [{ x: pt.x, y: pt.y }]);
    }
    return map;
  }, [mapData]);

  const betweenWorldsTracks = useMemo(
    () => (mapData?.points ?? []).filter((p) => p.cluster_id === -1),
    [mapData],
  );

  const heroPoints = useMemo<MiniMapPoint[]>(() => {
    if (!mapData?.points) return [];
    const archetypeByCluster = new Map<number, string | null | undefined>();
    for (const c of clusterLabels) {
      archetypeByCluster.set(c.cluster_id, c.cluster_archetype);
    }
    return mapData.points.map((p) => ({
      x: p.x,
      y: p.y,
      color:
        p.cluster_id === -1
          ? "#94a3b8"
          : getArchetypeColor(archetypeByCluster.get(p.cluster_id)),
    }));
  }, [mapData, clusterLabels]);

  const heroLabels = useMemo<MiniMapLabel[]>(() => {
    if (!mapData?.points?.length) return [];
    const archetypeByCluster = new Map<number, string | null | undefined>();
    for (const c of clusterLabels) {
      archetypeByCluster.set(c.cluster_id, c.cluster_archetype);
    }

    const acc = new Map<string, { sumX: number; sumY: number; count: number }>();
    for (const p of mapData.points) {
      if (p.cluster_id === -1) continue;
      const arch = archetypeByCluster.get(p.cluster_id);
      if (!arch) continue;
      const prev = acc.get(arch) ?? { sumX: 0, sumY: 0, count: 0 };
      acc.set(arch, {
        sumX: prev.sumX + p.x,
        sumY: prev.sumY + p.y,
        count: prev.count + 1,
      });
    }

    return [...acc.entries()]
      .filter(([, v]) => v.count >= 80)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([arch, v]) => ({
        x: v.sumX / v.count,
        y: v.sumY / v.count,
        text: genreLabel(arch),
        color: getArchetypeColor(arch),
      }));
  }, [mapData, clusterLabels]);

  const sortedFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allCommunities.filter((c) => {
      const matchesArchetype =
        selectedArchetype === null || c.archetype === selectedArchetype;
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.canonical_name.toLowerCase().includes(q) ||
        (c.keywords ?? []).some((k) => k.toLowerCase().includes(q));
      return matchesArchetype && matchesSearch;
    });

    list.sort((a, b) =>
      sortKey === "tracks"
        ? b.track_count - a.track_count
        : b.percentage - a.percentage,
    );
    return list;
  }, [allCommunities, selectedArchetype, searchQuery, sortKey]);

  const featuredIds = useMemo(() => {
    const byWeight = [...allCommunities].sort((a, b) => b.percentage - a.percentage);
    return new Set(byWeight.slice(0, FEATURED_COUNT).map((c) => c.cluster_id));
  }, [allCommunities]);

  const overviewFeatured = useMemo(
    () => sortedFiltered.filter((c) => featuredIds.has(c.cluster_id)),
    [sortedFiltered, featuredIds],
  );

  const overviewRest = useMemo(
    () => sortedFiltered.filter((c) => !featuredIds.has(c.cluster_id)),
    [sortedFiltered, featuredIds],
  );

  const allVisible = sortedFiltered.slice(0, visibleCount);
  const hasMore = visibleCount < sortedFiltered.length;

  const totalCommunities = allCommunities.length;
  const totalTracks = stats?.totalTracks ?? mapData?.total ?? 0;
  const betweenCount = betweenWorldsTracks.length;
  const assignedPct =
    totalTracks > 0
      ? ((totalTracks - betweenCount) / totalTracks) * 100
      : 100;

  const loading = tasteLoading;
  const isFiltering = selectedArchetype !== null || searchQuery.trim().length > 0;

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "all", label: "All Communities" },
    { id: "between", label: "Between Worlds" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT }}>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(ellipse 50% 30% at 70% 0%, rgba(29,185,84,0.07) 0%, transparent 55%)",
        }}
      />

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "36px 28px 72px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <h1
            style={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: "clamp(1.75rem, 3vw, 2.35rem)",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: TEXT,
              margin: "0 0 8px",
            }}
          >
            Communities
          </h1>
          <p style={{ fontFamily: FONT, fontSize: "0.9375rem", color: MUTED, margin: 0, lineHeight: 1.5 }}>
            ML-discovered neighborhoods in your listening universe.
          </p>
        </div>

        {/* Stats + hero atlas */}
        <div
          className="communities-header-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(260px, 0.85fr)",
            gap: 14,
            marginBottom: 28,
          }}
        >
          <div
            className="communities-stats-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <StatCard
              icon={Grid2x2}
              iconColor={GREEN}
              value={loading ? "—" : String(totalCommunities)}
              label="Communities"
            />
            <StatCard
              icon={Music2}
              iconColor="#a78bfa"
              value={mapLoading && !totalTracks ? "—" : totalTracks.toLocaleString()}
              label="Tracks mapped"
            />
            <StatCard
              icon={CircleDot}
              iconColor="#38bdf8"
              value={
                mapLoading && !totalTracks ? "—" : formatPct(assignedPct)
              }
              label="Assigned to a community"
            />
            <StatCard
              icon={Shuffle}
              iconColor="#fb923c"
              value={mapLoading && !mapData ? "—" : String(betweenCount)}
              label="Between Worlds"
            />
          </div>
          <HeroMiniAtlas
            points={heroPoints}
            labels={heroLabels}
            loading={mapLoading && heroPoints.length === 0}
          />
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            borderBottom: `1px solid ${CARD_BORDER}`,
            marginBottom: 18,
          }}
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  fontFamily: FONT,
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? TEXT : MUTED,
                  background: "none",
                  border: "none",
                  borderBottom: active ? `2px solid ${GREEN}` : "2px solid transparent",
                  padding: "10px 14px",
                  marginBottom: -1,
                  cursor: "pointer",
                }}
              >
                {t.label}
                {t.id === "between" && betweenCount > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontFamily: MONO,
                      fontSize: 11,
                      color: active ? GREEN : MUTED,
                    }}
                  >
                    {betweenCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {tab === "between" ? (
          mapLoading && !mapData ? (
            <div style={{ color: MUTED, fontFamily: FONT, padding: "40px 0" }}>
              Loading Between Worlds tracks…
            </div>
          ) : (
            <BetweenWorldsList
              tracks={betweenWorldsTracks}
              totalTracks={totalTracks}
            />
          )
        ) : (
          <>
            {!loading && (
              <FiltersRow
                archetypes={archetypeNames}
                selectedArchetype={selectedArchetype}
                onSelectArchetype={setSelectedArchetype}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                sortKey={sortKey}
                onSortChange={setSortKey}
              />
            )}

            {!loading && (
              <p
                style={{
                  fontFamily: FONT,
                  fontSize: 12,
                  color: MUTED,
                  margin: "0 0 14px",
                }}
              >
                {isFiltering
                  ? `${sortedFiltered.length} of ${totalCommunities} communities`
                  : tab === "overview"
                    ? `${totalCommunities} communities`
                    : `All ${totalCommunities} communities`}
              </p>
            )}

            {loading ? (
              <div
                className="communities-card-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 14,
                }}
              >
                <div style={{ gridColumn: "1 / -1" }}>
                  <CardSkeleton featured />
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : sortedFiltered.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "80px 0",
                  gap: 12,
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontFamily: FONT,
                    fontWeight: 600,
                    fontSize: 17,
                    color: TEXT,
                    margin: 0,
                  }}
                >
                  {searchQuery.trim()
                    ? `No communities found for "${searchQuery.trim()}"`
                    : "No communities in this genre"}
                </p>
                <p
                  style={{
                    fontFamily: FONT,
                    fontSize: 13.5,
                    color: MUTED,
                    maxWidth: 300,
                    lineHeight: 1.55,
                    margin: 0,
                  }}
                >
                  Try a different search or clear your filters.
                </p>
                {isFiltering && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedArchetype(null);
                      setSearchQuery("");
                    }}
                    style={{
                      marginTop: 8,
                      fontFamily: FONT,
                      fontSize: 13,
                      color: TEXT,
                      background: CARD_BG,
                      border: `1px solid ${CARD_BORDER}`,
                      borderRadius: 20,
                      padding: "8px 18px",
                      cursor: "pointer",
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : tab === "overview" ? (
              <>
                {overviewFeatured.length > 0 && (
                  <div
                    className="communities-featured-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        overviewFeatured.length === 1
                          ? "1fr"
                          : overviewFeatured.length === 2
                            ? "minmax(0, 1.4fr) minmax(0, 1fr)"
                            : "minmax(0, 1.4fr) repeat(2, minmax(0, 1fr))",
                      gap: 14,
                      marginBottom: 14,
                    }}
                  >
                    {overviewFeatured.map((community, idx) => (
                      <CommunityCard
                        key={community.cluster_id}
                        community={community}
                        points={pointsByCluster.get(community.cluster_id) ?? []}
                        featured
                        featuredLarge={idx === 0}
                      />
                    ))}
                  </div>
                )}

                <div
                  className="communities-card-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 14,
                  }}
                >
                  {overviewRest.map((community) => (
                    <CommunityCard
                      key={community.cluster_id}
                      community={community}
                      points={pointsByCluster.get(community.cluster_id) ?? []}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div
                  className="communities-card-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 14,
                  }}
                >
                  {allVisible.map((community) => (
                    <CommunityCard
                      key={community.cluster_id}
                      community={community}
                      points={pointsByCluster.get(community.cluster_id) ?? []}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
                    <button
                      type="button"
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                      style={{
                        fontFamily: FONT,
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: TEXT,
                        background: CARD_BG,
                        border: `1px solid ${CARD_BORDER}`,
                        borderRadius: 20,
                        padding: "9px 24px",
                        cursor: "pointer",
                      }}
                    >
                      Load more ↓
                    </button>
                  </div>
                )}

                {!hasMore && sortedFiltered.length > PAGE_SIZE && (
                  <p
                    style={{
                      textAlign: "center",
                      marginTop: 24,
                      fontFamily: FONT,
                      fontSize: 12,
                      color: MUTED,
                    }}
                  >
                    All {sortedFiltered.length} communities shown
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        @media (max-width: 980px) {
          .communities-header-grid {
            grid-template-columns: 1fr !important;
          }
          .communities-hero {
            min-height: 200px !important;
          }
          .communities-card-grid,
          .communities-featured-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 640px) {
          .communities-stats-grid {
            grid-template-columns: 1fr !important;
          }
          .communities-card-grid,
          .communities-featured-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
