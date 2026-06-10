"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ClusterInfo, getArchetypeColor } from "@/hooks/useMapData";

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
  const totalTracks = useMemo(
    () => clusters.reduce((sum, c) => sum + c.track_count, 0),
    [clusters],
  );

  // Group clusters by archetype, sorted by % descending
  const archetypeRows = useMemo(() => {
    const map = new Map<string, { communityCount: number; tracks: number }>();
    for (const c of clusters) {
      const key = c.cluster_archetype ?? "Unknown";
      const prev = map.get(key) ?? { communityCount: 0, tracks: 0 };
      map.set(key, {
        communityCount: prev.communityCount + 1,
        tracks: prev.tracks + c.track_count,
      });
    }
    return [...map.entries()]
      .map(([name, { communityCount, tracks }]) => ({
        name,
        communityCount,
        pct: totalTracks > 0 ? Math.round((tracks / totalTracks) * 100) : 0,
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [clusters, totalTracks]);

  const hasFilter = selectedCluster !== null || selectedArchetype !== null;

  return (
    <div
      style={{
        position: "absolute", top: 0, left: 0,
        width: 220, height: "100%",
        display: "flex", flexDirection: "column",
        background: "#ffffff",
        borderRight: "1px solid #e5e7eb",
        zIndex: 10,
      }}
    >
      {/* ── Header ── */}
      <div style={{ padding: "22px 18px 14px", flexShrink: 0 }}>
        <div style={{
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
          fontWeight: 700, fontSize: 15, color: "#111827", marginBottom: 3,
        }}>
          Atlas Regions
        </div>
        <div style={{
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
          fontSize: 11, color: "#9ca3af",
        }}>
          Click a region to explore
        </div>
      </div>

      {/* ── Active filter reset ── */}
      {hasFilter && (
        <div style={{ padding: "0 12px 10px", flexShrink: 0 }}>
          <button
            onClick={() => { onSelectCluster(null); onSelectArchetype(null); }}
            style={{
              width: "100%", textAlign: "left",
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 11, padding: "6px 10px", borderRadius: 8,
              background: "#f9fafb", color: "#6b7280",
              border: "none", cursor: "pointer",
            }}
          >
            ← Show all regions
          </button>
        </div>
      )}

      {/* ── Archetype list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 8px" }}>
        {archetypeRows.map(({ name, communityCount, pct }) => {
          const color = getArchetypeColor(name);
          const isActive = selectedArchetype === name;

          return (
            <button
              key={name}
              onClick={() => {
                if (isActive) {
                  onSelectArchetype(null);
                } else {
                  onSelectArchetype(name);
                  onSelectCluster(null);
                }
              }}
              style={{
                width: "100%", textAlign: "left",
                display: "flex", alignItems: "center", gap: 11,
                padding: "10px 10px",
                borderRadius: 10,
                border: "none", cursor: "pointer",
                background: isActive ? `${color}12` : "transparent",
                marginBottom: 1,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#f9fafb";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              {/* Color dot */}
              <div style={{
                width: 11, height: 11, borderRadius: "50%",
                background: color, flexShrink: 0, marginTop: 3,
                boxShadow: isActive ? `0 0 0 3px ${color}25` : "none",
                transition: "box-shadow 0.12s",
              }} />

              {/* Text column */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                  fontWeight: 700, fontSize: 19,
                  color: isActive ? color : "#111827",
                  lineHeight: 1.1,
                }}>
                  {pct}%
                </div>
                <div style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontWeight: 600, fontSize: 12,
                  color: isActive ? color : "#374151",
                  lineHeight: 1.3, marginTop: 2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {name}
                </div>
                <div style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 10.5, color: "#9ca3af", marginTop: 1,
                }}>
                  {communityCount} {communityCount === 1 ? "community" : "communities"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: "10px 12px 14px", borderTop: "1px solid #f3f4f6", flexShrink: 0 }}>
        <Link
          href="/communities"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px", borderRadius: 20,
            background: "#f0fdf4",
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: 12.5, fontWeight: 600, color: "#166534",
            textDecoration: "none",
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#dcfce7"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#f0fdf4"; }}
        >
          <span>All Communities</span>
          <span style={{ fontSize: 16, lineHeight: 1 }}>›</span>
        </Link>
      </div>
    </div>
  );
}
