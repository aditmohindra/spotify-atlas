"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { getTasteProfile } from "@/lib/api";
import { getArchetypeColor } from "@/hooks/useMapData";
import type { TasteProfile, Community } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const CLUSTER_COLORS = [
  "#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa",
  "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#e879f9",
  "#22d3ee", "#86efac", "#fca5a5", "#fde68a", "#c4b5fd",
  "#f9a8d4", "#7dd3fc", "#6ee7b7", "#fcd34d", "#d8b4fe",
];

const PAGE_SIZE = 25;

function clusterColor(id: number): string {
  if (id === -1) return "#9ca3af";
  return CLUSTER_COLORS[id % CLUSTER_COLORS.length];
}

function archetypeColor(name: string): string {
  return getArchetypeColor(name);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        display: "flex",
        gap: 12,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    >
      <div style={{ width: 72, height: 72, borderRadius: 12, background: "#f3f4f6", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
        <div style={{ height: 14, width: "55%", background: "#f3f4f6", borderRadius: 6 }} />
        <div style={{ height: 11, width: "40%", background: "#f3f4f6", borderRadius: 5 }} />
        <div style={{ height: 20, width: "35%", background: "#f3f4f6", borderRadius: 20 }} />
      </div>
    </div>
  );
}

// ── Artist avatar stack ───────────────────────────────────────────────────────

function AvatarStack({ artists }: { artists: string[] }) {
  const shown = artists.slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((artist, i) => (
        <div
          key={artist}
          title={artist}
          style={{
            width: 20, height: 20, borderRadius: "50%",
            background: "#e5e7eb",
            border: "1.5px solid #ffffff",
            marginLeft: i === 0 ? 0 : -6,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, zIndex: shown.length - i,
            position: "relative",
          }}
        >
          <span style={{ fontSize: 8, fontWeight: 600, color: "#374151", userSelect: "none", fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
            {artist.charAt(0).toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Community card ────────────────────────────────────────────────────────────

function CommunityCard({ community, rank }: { community: Community; rank: number }) {
  const [hovered, setHovered] = useState(false);
  const color = clusterColor(community.cluster_id);
  const firstLetter = community.name.charAt(0).toUpperCase();
  const archColor = community.archetype ? archetypeColor(community.archetype) : "#9ca3af";

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
          gap: 12,
          transition: "box-shadow 0.18s, transform 0.18s",
          boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.04)",
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
          cursor: "pointer",
        }}
      >
        {/* ── Thumbnail ── */}
        <div
          style={{
            width: 72, height: 72, borderRadius: 12,
            background: "#111827",
            flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Subtle rank number top-left */}
          <span
            style={{
              position: "absolute", top: 5, left: 7,
              fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
              fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.25)",
              lineHeight: 1,
            }}
          >
            {rank}
          </span>
          <span
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 28, fontWeight: 700, color,
              lineHeight: 1, userSelect: "none",
            }}
          >
            {firstLetter}
          </span>
        </div>

        {/* ── Info ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          {/* Row 1: name + percentage */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontWeight: 600, fontSize: 13.5, color: "#111827",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {community.name}
            </span>
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

          {/* Row 2: canonical name + track count */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
            <span
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 11, color: "#6b7280",
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

          {/* Row 3: archetype pill + artist avatars */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
            {community.archetype ? (
              <span
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 10, fontWeight: 500,
                  color: archColor,
                  background: `${archColor}18`,
                  border: `1px solid ${archColor}30`,
                  borderRadius: 20,
                  padding: "2px 8px",
                  whiteSpace: "nowrap",
                  lineHeight: 1.6,
                }}
              >
                {community.archetype}
              </span>
            ) : (
              <span />
            )}
            <AvatarStack artists={community.top_artists ?? []} />
          </div>
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

function FilterBar({ archetypes, selectedArchetype, onSelectArchetype, searchQuery, onSearchChange }: FilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Archetype pills row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* All pill */}
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
              }}
            >
              {a}
            </button>
          );
        })}
      </div>

      {/* Search */}
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

  useEffect(() => {
    document.title = "Worlds · Spotify Atlas";
  }, []);

  useEffect(() => {
    getTasteProfile(1)
      .then(setTasteData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedArchetype, searchQuery]);

  const allCommunities = useMemo<Community[]>(
    () => [...(tasteData?.communities ?? [])].sort((a, b) => b.percentage - a.percentage),
    [tasteData],
  );

  const archetypes = useMemo<string[]>(() => {
    const seen = new Map<string, number>();
    for (const c of allCommunities) {
      if (!c.archetype) continue;
      seen.set(c.archetype, (seen.get(c.archetype) ?? 0) + c.percentage);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [allCommunities]);

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

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8f5" }}>
      {/* Green glow */}
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
        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1db954", margin: "0 0 8px" }}>
            Your Worlds
          </p>
          <h1
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
              lineHeight: 1.1, letterSpacing: "-0.02em",
              color: "#111827", margin: "0 0 6px",
            }}
          >
            All Worlds
          </h1>
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "0.9375rem", color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
            Discover the communities and cultures that shape your identity.
          </p>
        </div>

        {/* ── Filter bar ───────────────────────────────────────────────────── */}
        {!loading && archetypes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <FilterBar
              archetypes={archetypes}
              selectedArchetype={selectedArchetype}
              onSelectArchetype={setSelectedArchetype}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>
        )}

        {/* Community count label */}
        {!loading && (
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 12, color: "#9ca3af", margin: "0 0 16px" }}>
            {countLabel}
          </p>
        )}

        {/* ── Grid ─────────────────────────────────────────────────────────── */}
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
              {visible.map((community, i) => (
                <CommunityCard key={community.cluster_id} community={community} rank={i + 1} />
              ))}
            </div>

            {/* Load More */}
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

            {/* All shown indicator */}
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
