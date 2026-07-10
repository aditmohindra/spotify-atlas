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
        position: "absolute", top: 16, left: 16, bottom: 16,
        width: 272,
        display: "flex", flexDirection: "column",
        background: "rgba(5, 10, 20, 0.78)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        borderRadius: 22,
        boxShadow: "0 20px 50px rgba(0,0,0,0.45), 0 0 1px rgba(148,163,184,0.3) inset",
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      {/* ── Header ── */}
      <div style={{ padding: "24px 20px 14px", flexShrink: 0 }}>
        <div style={{
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
          fontWeight: 700, fontSize: 16, color: "#f1f5f9", marginBottom: 4,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          Atlas Regions
          <span style={{ color: "#4ade80", fontSize: 13 }}>✦</span>
        </div>
        <div style={{
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
          fontSize: 11.5, color: "#64748b", lineHeight: 1.4,
        }}>
          Your library mapped to musical communities.
        </div>
      </div>

      {/* ── Active filter reset ── */}
      {hasFilter && (
        <div style={{ padding: "0 14px 10px", flexShrink: 0 }}>
          <button
            onClick={() => { onSelectCluster(null); onSelectArchetype(null); }}
            style={{
              width: "100%", textAlign: "left",
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 11, padding: "6px 10px", borderRadius: 8,
              background: "rgba(148, 163, 184, 0.08)", color: "#94a3b8",
              border: "1px solid rgba(148, 163, 184, 0.14)", cursor: "pointer",
            }}
          >
            ← Show all regions
          </button>
        </div>
      )}

      {/* ── Ranked archetype list ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 12px 8px" }}>
        {archetypeRows.map(({ name, communityCount, pct }, i) => {
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
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 10px",
                borderRadius: 12,
                border: "1px solid transparent",
                cursor: "pointer",
                background: isActive ? `${color}1a` : "transparent",
                marginBottom: 2,
                transition: "background 0.12s, border-color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(148, 163, 184, 0.08)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              {/* Rank index */}
              <div style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 10.5, color: "#475569", width: 12, marginTop: 4, flexShrink: 0,
              }}>
                {i + 1}
              </div>

              {/* Color dot */}
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: color, flexShrink: 0, marginTop: 5,
                boxShadow: isActive ? `0 0 0 3px ${color}25, 0 0 8px ${color}80` : `0 0 5px ${color}60`,
                transition: "box-shadow 0.12s",
              }} />

              {/* Text column */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                  fontWeight: 700, fontSize: 19,
                  color: isActive ? color : "#f1f5f9",
                  lineHeight: 1.1,
                }}>
                  {pct}%
                </div>
                <div style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontWeight: 600, fontSize: 12.5,
                  color: isActive ? color : "#e2e8f0",
                  lineHeight: 1.3, marginTop: 2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {name}
                </div>
                <div style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: 10.5, color: "#64748b", marginTop: 1,
                }}>
                  {communityCount} {communityCount === 1 ? "community" : "communities"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: "12px 14px 16px", borderTop: "1px solid rgba(148, 163, 184, 0.14)", flexShrink: 0 }}>
        <Link
          href="/communities"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 20,
            background: "rgba(29, 185, 84, 0.14)",
            border: "1px solid rgba(74, 222, 128, 0.22)",
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: 12.5, fontWeight: 600, color: "#4ade80",
            textDecoration: "none",
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(29, 185, 84, 0.22)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(29, 185, 84, 0.14)"; }}
        >
          <span>Explore all communities</span>
          <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>
        </Link>
      </div>
    </div>
  );
}
