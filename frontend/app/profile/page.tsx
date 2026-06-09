"use client";

import { useEffect, useState } from "react";

interface Community {
  cluster_id: number;
  name: string;
  canonical_name: string;
  description: string;
  keywords: string[];
  percentage: number;
  weight: number;
}

interface TasteProfile {
  user_id: number;
  total_weight: number;
  communities: Community[];
}

const CLUSTER_COLORS = [
  "#60a5fa","#34d399","#f87171","#fbbf24","#a78bfa",
  "#f472b6","#38bdf8","#4ade80","#fb923c","#e879f9",
  "#22d3ee","#86efac","#fca5a5","#fde68a","#c4b5fd",
  "#f9a8d4","#7dd3fc","#6ee7b7","#fcd34d","#d8b4fe",
];

function getColor(id: number) {
  return CLUSTER_COLORS[id % CLUSTER_COLORS.length];
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/profile/taste?user_id=1")
      .then(r => r.json())
      .then(data => { setProfile(data); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-[#07071a] flex items-center justify-center">
      <div className="text-white/30 text-sm tracking-widest uppercase">Loading your identity...</div>
    </div>
  );

  if (!profile) return null;

  const top5 = profile.communities.slice(0, 5);
  const rest = profile.communities.slice(5, 30);

  return (
    <div className="min-h-screen bg-[#07071a] text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">

        <div className="mb-12">
          <div className="text-white/30 text-xs tracking-widest uppercase mb-3">Spotify Atlas</div>
          <h1 className="text-3xl font-medium tracking-tight mb-2">Your Musical Identity</h1>
          <p className="text-white/40 text-sm">
            Based on {profile.communities.length} music communities across your listening history
          </p>
        </div>

        <div className="mb-10">
          <div className="text-white/30 text-xs tracking-widest uppercase mb-4">Top Communities</div>
          <div className="space-y-2">
            {top5.map((c, i) => {
              const color = getColor(c.cluster_id);
              const isExpanded = expanded === c.cluster_id;
              return (
                <button
                  key={c.cluster_id}
                  onClick={() => setExpanded(isExpanded ? null : c.cluster_id)}
                  className="w-full text-left rounded-xl p-4 transition-all"
                  style={{
                    background: isExpanded ? `${color}12` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isExpanded ? color + "30" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-white/20 text-sm font-mono w-5 flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: color }} />
                        <span className="text-white font-medium text-sm truncate">
                          {c.name}
                        </span>
                      </div>
                      <div className="text-white/35 text-xs pl-4">{c.canonical_name}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-white font-medium text-sm">{c.percentage}%</div>
                    </div>
                  </div>

                  <div className="mt-2 mx-5">
                    <div className="h-1 rounded-full overflow-hidden bg-white/5">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(c.percentage / top5[0].percentage) * 100}%`, background: color }}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 mx-5 pt-3 border-t border-white/5">
                      <p className="text-white/50 text-xs leading-relaxed mb-2">
                        {c.description}
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        {c.keywords.map(kw => (
                          <span key={kw} className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: `${color}20`, color }}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-white/30 text-xs tracking-widest uppercase mb-4">
            More Communities
          </div>
          <div className="space-y-1">
            {rest.map((c) => {
              const color = getColor(c.cluster_id);
              return (
                <div key={c.cluster_id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/3 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: color, opacity: 0.7 }} />
                  <span className="text-white/60 text-xs flex-1 truncate">{c.name}</span>
                  <span className="text-white/25 text-xs font-mono flex-shrink-0">
                    {c.percentage}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/5 flex justify-between items-center">
          <a href="/" className="text-white/30 hover:text-white/60 text-xs transition-colors">
            ← Back to galaxy
          </a>
          <span className="text-white/20 text-xs">
            {profile.communities.length} communities discovered
          </span>
        </div>

      </div>
    </div>
  );
}