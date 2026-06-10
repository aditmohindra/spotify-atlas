"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { getTasteProfile } from "@/lib/api";
import type { TasteProfile, Community, Rarity } from "@/lib/types";
import { PageShell } from "@/components/atlas/PageShell";
import { cn } from "@/lib/utils";

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

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CommunityCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-atlas-lg p-5 shadow-card animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-[3px] h-full self-stretch bg-border rounded-full shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-40 bg-border rounded-full" />
            <div className="h-4 w-12 bg-border rounded-full" />
          </div>
          <div className="h-3 w-52 bg-border rounded-full" />
          <div className="flex gap-2">
            <div className="h-5 w-24 bg-border rounded-full" />
            <div className="h-5 w-16 bg-border rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-3 w-28 bg-border rounded-full" />
            <div className="h-3 w-16 bg-border rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Community Card ─────────────────────────────────────────────────────────────

interface CommunityCardProps {
  community: Community;
}

function CommunityCard({ community }: CommunityCardProps) {
  const [hovered, setHovered] = useState(false);
  const color = clusterColor(community.cluster_id);

  return (
    <Link
      href={`/community/${community.cluster_id}`}
      className="block group outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded-atlas-lg"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "relative bg-surface border border-border rounded-atlas-lg shadow-card overflow-hidden transition-all duration-200",
          hovered ? "shadow-lg -translate-y-0.5" : "",
        )}
      >
        {/* Left accent border */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-atlas-lg"
          style={{ background: color }}
          aria-hidden
        />

        <div className="pl-5 pr-5 pt-4 pb-4 ml-[3px]">
          {/* Row 1: name + percentage */}
          <div className="flex items-baseline justify-between gap-3 min-w-0">
            <span className="font-ui font-bold text-ink text-[14.5px] leading-tight truncate">
              {community.name}
            </span>
            <span className="font-stat font-semibold text-ink text-sm tabular-nums shrink-0">
              {community.percentage.toFixed(1)}%
            </span>
          </div>

          {/* Row 2: canonical name */}
          <p className="font-ui text-xs text-faint mt-0.5 truncate">
            {community.canonical_name}
          </p>

          {/* Row 3: archetype pill + rarity badge */}
          <div className="flex items-center gap-2 flex-wrap mt-2.5">
            {community.archetype && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0] font-medium leading-none whitespace-nowrap">
                {community.archetype}
              </span>
            )}
            {(() => {
              const s = RARITY_STYLES[community.rarity] ?? RARITY_STYLES["Core"];
              return (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold leading-none whitespace-nowrap border"
                  style={{ background: s.bg, color: s.text, borderColor: s.border }}
                >
                  {community.rarity}
                </span>
              );
            })()}
          </div>

          {/* Row 4: top artist + track count */}
          <div className="flex items-center justify-between mt-2.5 gap-3">
            <span className="font-ui text-xs truncate" style={{ color: "#98a2b3" }}>
              {community.top_artists[0] ?? "—"}
            </span>
            <span className="font-stat text-xs tabular-nums shrink-0" style={{ color: "#98a2b3" }}>
              {community.track_count.toLocaleString()} tracks
            </span>
          </div>

          {/* Hover: inline description */}
          {community.description && (
            <div
              className={cn(
                "overflow-hidden transition-all duration-200",
                hovered ? "max-h-24 opacity-100 mt-3" : "max-h-0 opacity-0",
              )}
            >
              <p className="font-ui text-xs leading-relaxed line-clamp-3 border-t border-border pt-3" style={{ color: "#667085" }}>
                {community.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </Link>
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

function FilterBar({
  archetypes,
  selectedArchetype,
  onSelectArchetype,
  searchQuery,
  onSearchChange,
}: FilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3 sm:gap-0 sm:flex-row sm:items-center sm:justify-between">
      {/* Archetype pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => onSelectArchetype(null)}
          className="inline-flex items-center rounded-full font-ui font-medium text-xs px-3 py-1.5 border transition-colors duration-150 whitespace-nowrap"
          style={
            selectedArchetype === null
              ? { background: "#e8f8ef", color: "#0f7f3a", borderColor: "transparent" }
              : { background: "transparent", color: "#667085", borderColor: "#dde6dd" }
          }
        >
          All
        </button>
        {archetypes.map((a) => (
          <button
            key={a}
            onClick={() => onSelectArchetype(a === selectedArchetype ? null : a)}
            className="inline-flex items-center rounded-full font-ui font-medium text-xs px-3 py-1.5 border transition-colors duration-150 whitespace-nowrap"
            style={
              selectedArchetype === a
                ? { background: "#e8f8ef", color: "#0f7f3a", borderColor: "transparent" }
                : { background: "transparent", color: "#667085", borderColor: "#dde6dd" }
            }
          >
            {a}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative shrink-0 sm:ml-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "#98a2b3" }}
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          aria-hidden
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
          className="w-full sm:w-52 pl-8 pr-3 py-2 rounded-full border border-border bg-surface font-ui text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500/50 transition-all duration-150"
        />
        {searchQuery && (
          <button
            onClick={() => {
              onSearchChange("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors"
            aria-label="Clear search"
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

  useEffect(() => {
    getTasteProfile(1)
      .then(setTasteData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Sorted by percentage descending
  const allCommunities = useMemo<Community[]>(
    () => [...(tasteData?.communities ?? [])].sort((a, b) => b.percentage - a.percentage),
    [tasteData],
  );

  // Unique archetypes in percentage order
  const archetypes = useMemo<string[]>(() => {
    const seen = new Map<string, number>();
    for (const c of allCommunities) {
      if (!c.archetype) continue;
      seen.set(c.archetype, (seen.get(c.archetype) ?? 0) + c.percentage);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [allCommunities]);

  // AND-logic filter (archetype + search)
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

  const totalCount = allCommunities.length;
  const filteredCount = filtered.length;

  // Header title: "X Worlds Found" — shows filtered count when a filter is active
  const isFiltering = selectedArchetype !== null || searchQuery.trim().length > 0;

  return (
    <div className="pt-16 min-h-screen bg-background">
      {/* Subtle green glow at top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 55% 40% at 80% 0%, rgba(29,185,84,0.07) 0%, transparent 60%)",
        }}
      />

      <PageShell maxWidth="xl" className="py-12 relative z-10">
        <div className="space-y-8">

          {/* ── 1. PAGE HEADER ──────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <p className="text-eyebrow" style={{ color: "var(--green)" }}>
              YOUR WORLDS
            </p>
            <h1
              className="font-hero text-ink"
              style={{
                fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              {loading ? (
                <span className="inline-block w-56 h-9 bg-border rounded-xl animate-pulse align-bottom" />
              ) : isFiltering ? (
                <>
                  <span className="font-stat">{filteredCount}</span>{" "}
                  {filteredCount === 1 ? "World" : "Worlds"} Found
                </>
              ) : (
                <>
                  <span className="font-stat">{totalCount}</span>{" "}
                  {totalCount === 1 ? "World" : "Worlds"} Found
                </>
              )}
            </h1>
            <p className="font-ui text-muted text-[0.9375rem] leading-relaxed">
              Every music community discovered in your listening history.
            </p>
          </div>

          {/* ── 2. FILTER BAR ────────────────────────────────────────────── */}
          {!loading && archetypes.length > 0 && (
            <FilterBar
              archetypes={archetypes}
              selectedArchetype={selectedArchetype}
              onSelectArchetype={setSelectedArchetype}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          )}

          {/* ── 3. COMMUNITY GRID ────────────────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <CommunityCardSkeleton key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            /* ── 4. EMPTY STATES ──────────────────────────────────────────── */
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <span className="text-3xl" aria-hidden>
                🌌
              </span>
              <p className="font-ui font-semibold text-ink text-lg">
                {searchQuery.trim()
                  ? `No worlds found for "${searchQuery.trim()}"`
                  : "No worlds in this region yet"}
              </p>
              <p className="font-ui text-muted text-sm max-w-xs leading-relaxed">
                {searchQuery.trim()
                  ? "Try a different name or clear your search."
                  : "This archetype has no communities in your taste profile."}
              </p>
              {(selectedArchetype !== null || searchQuery.trim()) && (
                <button
                  onClick={() => {
                    setSelectedArchetype(null);
                    setSearchQuery("");
                  }}
                  className="mt-2 font-ui text-sm text-muted hover:text-ink border border-border rounded-full px-4 py-2 transition-colors hover:bg-surface-soft"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((community) => (
                <CommunityCard key={community.cluster_id} community={community} />
              ))}
            </div>
          )}

          {/* Count footer when filtered */}
          {!loading && isFiltering && filtered.length > 0 && (
            <p className="text-center font-ui text-xs text-faint">
              Showing {filteredCount} of {totalCount} worlds
            </p>
          )}

        </div>
      </PageShell>
    </div>
  );
}
