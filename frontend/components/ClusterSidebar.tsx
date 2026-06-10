"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ClusterInfo, ARCHETYPE_COLORS, getArchetypeColor } from "@/hooks/useMapData";

const ARCHETYPE_ORDER = [
  "The Trap",
  "Terminally Online",
  "Festival Regular",
  "Anime Passport",
  "Toronto Winter Arc",
  "Lo-Fi Otaku",
  "Desi Household",
  "Drip Report",
  "Nostalgic Club Kid",
];

interface Props {
  clusters: ClusterInfo[];
  selectedCluster: number | null;
  selectedArchetype: string | null;
  onSelectCluster: (id: number | null) => void;
  onSelectArchetype: (archetype: string | null) => void;
}

export default function ClusterSidebar({
  clusters,
  selectedCluster,
  selectedArchetype,
  onSelectCluster,
  onSelectArchetype,
}: Props) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const totalTracks = useMemo(
    () => clusters.reduce((sum, c) => sum + c.track_count, 0),
    [clusters]
  );

  const archetypeGroups = useMemo(() => {
    const map = new Map<string, ClusterInfo[]>();
    for (const c of clusters) {
      const key = c.cluster_archetype ?? "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const ordered: Array<{ archetype: string; communities: ClusterInfo[] }> = [];
    for (const name of ARCHETYPE_ORDER) {
      if (map.has(name)) {
        ordered.push({ archetype: name, communities: map.get(name)! });
        map.delete(name);
      }
    }
    for (const [name, communities] of map.entries()) {
      ordered.push({ archetype: name, communities });
    }
    return ordered;
  }, [clusters]);

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return archetypeGroups;
    const q = query.toLowerCase();
    return archetypeGroups
      .map((g) => ({
        ...g,
        communities: g.communities.filter(
          (c) =>
            (c.name ?? "").toLowerCase().includes(q) ||
            (c.canonical_name ?? "").toLowerCase().includes(q) ||
            c.top_artists.some((a) => a.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.communities.length > 0);
  }, [archetypeGroups, query]);

  const toggleExpanded = (archetype: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(archetype)) next.delete(archetype);
      else next.add(archetype);
      return next;
    });
  };

  return (
    <div
      className="absolute top-0 left-0 h-full w-60 flex flex-col z-10"
      style={{
        background: "#ffffff",
        borderRight: "1px solid #e5e7eb",
      }}
    >
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div
          className="text-sm font-bold tracking-wide"
          style={{ color: "#111827", fontFamily: "DM Sans, sans-serif" }}
        >
          Atlas Regions
        </div>
        <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
          Click a region to explore
        </div>

        {/* Search */}
        <div
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: "#f3f4f6", border: "1px solid #e5e7eb" }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search communities..."
            className="bg-transparent text-xs flex-1 focus:outline-none"
            style={{ color: "#374151" }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-xs"
              style={{ color: "#9ca3af" }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Reset filter */}
      {(selectedCluster !== null || selectedArchetype !== null) && (
        <div className="px-3 pb-2">
          <button
            onClick={() => {
              onSelectCluster(null);
              onSelectArchetype(null);
            }}
            className="w-full text-left text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "#6b7280", background: "#f9fafb" }}
          >
            ← Show all regions
          </button>
        </div>
      )}

      {/* Groups */}
      <div
        className="flex-1 overflow-y-auto pb-4"
        style={{ scrollbarWidth: "none" }}
      >
        {filteredGroups.map(({ archetype, communities }) => {
          const color = getArchetypeColor(archetype);
          const isArchSelected = selectedArchetype === archetype;
          const archetypeTracks = communities.reduce(
            (s, c) => s + c.track_count,
            0
          );
          const pct =
            totalTracks > 0
              ? Math.round((archetypeTracks / totalTracks) * 100)
              : 0;
          const isOpen = expanded.has(archetype) || !!query.trim();

          return (
            <div key={archetype} className="mb-0.5">
              {/* Archetype header */}
              <button
                onClick={() => {
                  if (isArchSelected) {
                    onSelectArchetype(null);
                  } else {
                    onSelectArchetype(archetype);
                    onSelectCluster(null);
                  }
                  if (!query.trim()) toggleExpanded(archetype);
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 transition-all text-left"
                style={{
                  background: isArchSelected ? `${color}12` : "transparent",
                }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    background: color,
                    boxShadow: isArchSelected ? `0 0 6px ${color}80` : "none",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-xs font-semibold truncate"
                    style={{
                      color: isArchSelected ? color : "#111827",
                      fontFamily: "DM Sans, sans-serif",
                    }}
                  >
                    {archetype}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs" style={{ color: "#9ca3af" }}>
                      {communities.length} communities
                    </span>
                    <span
                      className="text-xs font-mono"
                      style={{ color: color, opacity: 0.7 }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9ca3af"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 150ms",
                    flexShrink: 0,
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Communities within archetype */}
              {isOpen && (
                <div className="pb-1">
                  {communities.map((c) => {
                    const isClusterSel = selectedCluster === c.cluster_id;
                    return (
                      <button
                        key={c.cluster_id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCluster(isClusterSel ? null : c.cluster_id);
                          if (!isClusterSel) onSelectArchetype(null);
                        }}
                        className="w-full text-left flex items-center gap-2 px-4 py-1.5 transition-all"
                        style={{
                          paddingLeft: "2rem",
                          background: isClusterSel
                            ? `${color}10`
                            : "transparent",
                          borderLeft: isClusterSel
                            ? `2px solid ${color}`
                            : "2px solid transparent",
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-xs truncate"
                            style={{
                              color: isClusterSel ? color : "#374151",
                              fontWeight: isClusterSel ? 600 : 400,
                            }}
                          >
                            {c.name ?? `Community ${c.cluster_id}`}
                          </div>
                          {c.canonical_name && (
                            <div
                              className="text-xs truncate mt-0.5"
                              style={{ color: "#9ca3af" }}
                            >
                              {c.canonical_name}
                            </div>
                          )}
                        </div>
                        <span
                          className="text-xs flex-shrink-0"
                          style={{
                            color: "#9ca3af",
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          {c.track_count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3" style={{ borderTop: "1px solid #f3f4f6" }}>
        <Link
          href="/communities"
          className="flex items-center justify-between text-xs transition-colors"
          style={{ color: "#1db954" }}
        >
          <span>All Communities</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
