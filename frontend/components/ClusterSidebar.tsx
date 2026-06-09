"use client";

import { useState } from "react";
import { ClusterInfo } from "@/hooks/useMapData";

const CLUSTER_COLORS = [
  "#60a5fa","#34d399","#f87171","#fbbf24","#a78bfa",
  "#f472b6","#38bdf8","#4ade80","#fb923c","#e879f9",
  "#22d3ee","#86efac","#fca5a5","#fde68a","#c4b5fd",
  "#f9a8d4","#7dd3fc","#6ee7b7","#fcd34d","#d8b4fe",
];

function getClusterColor(id: number): string {
  if (id === -1) return "#ffffff20";
  return CLUSTER_COLORS[id % CLUSTER_COLORS.length];
}

interface Props {
  clusters: ClusterInfo[];
  selectedCluster: number | null;
  onSelectCluster: (id: number | null) => void;
}

export default function ClusterSidebar({ clusters, selectedCluster, onSelectCluster }: Props) {
  const [query, setQuery] = useState("");

  const filtered = clusters.filter(c =>
    query === "" ||
    c.top_artists.some(a => a.toLowerCase().includes(query.toLowerCase())) ||
    String(c.cluster_id).includes(query)
  );

  return (
    <div className="absolute top-0 left-0 h-full w-64 flex flex-col z-10"
      style={{ background: "rgba(7,7,26,0.95)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

      <div className="px-5 pt-5 pb-4">
        <div className="text-white/80 text-sm font-medium tracking-wide">Communities</div>
        <div className="text-white/25 text-xs mt-0.5">{clusters.length} clusters discovered</div>

        <div className="mt-3 flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/8">
          <span className="text-white/20 text-xs">⌕</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by artist..."
            className="bg-transparent text-white/60 placeholder-white/20 text-xs flex-1 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4"
        style={{ scrollbarWidth: "none" }}>

        {selectedCluster !== null && (
          <button
            onClick={() => onSelectCluster(null)}
            className="w-full text-left px-3 py-2 mb-1 rounded-lg text-white/30 hover:text-white/60 text-xs transition-colors hover:bg-white/5"
          >
            ← Show all
          </button>
        )}

        {filtered.map(cluster => {
          const color = getClusterColor(cluster.cluster_id);
          const isSelected = selectedCluster === cluster.cluster_id;

          return (
            <button
              key={cluster.cluster_id}
              onClick={() => onSelectCluster(isSelected ? null : cluster.cluster_id)}
              className="w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-all group"
              style={{
                background: isSelected ? `${color}15` : "transparent",
                border: isSelected ? `1px solid ${color}30` : "1px solid transparent",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0 transition-all"
                  style={{
                    background: color,
                    opacity: isSelected ? 1 : 0.6,
                    boxShadow: isSelected ? `0 0 6px ${color}80` : "none"
                  }}
                />
                <span className="text-white/60 text-xs group-hover:text-white/80 transition-colors flex-1 truncate">
                  {cluster.top_artists[0] ?? `Cluster ${cluster.cluster_id}`}
                </span>
                <span className="text-white/20 text-xs flex-shrink-0 font-mono">
                  {cluster.track_count}
                </span>
              </div>
              {cluster.top_artists.length > 1 && (
                <div className="text-white/25 text-xs mt-0.5 pl-4.5 truncate">
                  {cluster.top_artists.slice(1, 3).join(" · ")}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}