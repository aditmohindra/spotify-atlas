"use client";

import { useEffect, useState } from "react";

interface RelatedCluster {
  cluster_id: number;
  name: string;
  canonical_name: string;
  similarity: number;
}

interface Community {
  cluster_id: number;
  name: string;
  canonical_name: string;
  description: string;
  keywords: string[];
  percentage: number;
  weight: number;
  top_artists: string[];
  rarity: string;
  track_count: number;
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

const TIME_RANGES = [
  { label: "All time", value: "all" },
  { label: "Last 6 months", value: "6months" },
  { label: "Last 30 days", value: "30days" },
];

export default function ProfilePage() {
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [timeRange, setTimeRange] = useState("all");
  const [relatedMap, setRelatedMap] = useState<Record<number, RelatedCluster[]>>({});

  useEffect(() => {
    setLoading(true);
    fetch(`http://127.0.0.1:8000/profile/taste?user_id=1&time_range=${timeRange}`)
      .then(r => r.json())
      .then(data => { setProfile(data); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
  }, [timeRange]);

  useEffect(() => {
    const cached = localStorage.getItem('taste_summary');
    if (cached) setSummary(cached);
  }, []);

  const loadSummary = () => {
    setSummaryLoading(true);
    fetch("http://127.0.0.1:8000/profile/summary?user_id=1")
      .then(r => r.json())
      .then(data => {
        setSummary(data.summary);
        localStorage.setItem('taste_summary', data.summary);
        setSummaryLoading(false);
      });
  };

  const handleExpand = (cluster_id: number) => {
    if (expanded === cluster_id) {
      setExpanded(null);
      return;
    }
    setExpanded(cluster_id);
    if (!relatedMap[cluster_id]) {
      fetch(`http://127.0.0.1:8000/clusters/${cluster_id}/related`)
        .then(r => r.json())
        .then(data => {
          setRelatedMap(prev => ({ ...prev, [cluster_id]: data.related }));
        });
    }
  };

  const top5 = profile?.communities.slice(0, 5) ?? [];
  const rest = profile?.communities.slice(5, 30) ?? [];

  return (
    <div className="min-h-screen bg-[#07071a] text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">

        <div className="mb-10">
          <div className="text-white/30 text-xs tracking-widest uppercase mb-3">Spotify Atlas</div>
          <h1 className="text-3xl font-medium tracking-tight mb-2">Your Musical Identity</h1>
          <p className="text-white/40 text-sm">
            Based on {profile?.communities.length ?? 0} music communities across your listening history
          </p>
        </div>

        <div className="mb-8 p-4 rounded-xl border border-white/6 bg-white/2">
          {summary ? (
            <div className="space-y-3">
              {summary.split("\n").map((line, i) => {
                if (line.startsWith("# ")) {
                  return (
                    <h3 key={i} className="text-white font-medium text-base">
                      {line.replace("# ", "").replace(/\*\*/g, "")}
                    </h3>
                  );
                }
                if (line.trim() === "") return null;
                return (
                  <p key={i} className="text-white/55 text-sm leading-relaxed">
                    {line.replace(/\*\*/g, "")}
                  </p>
                );
              })}
              <button
                onClick={() => {
                  localStorage.removeItem('taste_summary');
                  setSummary(null);
                }}
                className="text-white/20 hover:text-white/40 text-xs transition-colors mt-1"
              >
                ↺ Regenerate
              </button>
            </div>
          ) : (
            <button
              onClick={loadSummary}
              disabled={summaryLoading}
              className="text-white/50 hover:text-white/80 text-sm transition-colors disabled:opacity-40"
            >
              {summaryLoading ? "Generating summary..." : "✦ Generate AI taste summary"}
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-8">
          {TIME_RANGES.map(tr => (
            <button
              key={tr.value}
              onClick={() => setTimeRange(tr.value)}
              className="text-xs px-3 py-1.5 rounded-full border transition-all"
              style={{
                background: timeRange === tr.value ? "rgba(255,255,255,0.1)" : "transparent",
                borderColor: timeRange === tr.value ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
                color: timeRange === tr.value ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)"
              }}
            >
              {tr.label}
            </button>
          ))}
          <span className="ml-auto text-white/20 text-xs self-center">
            showing top 50 communities
          </span>
        </div>

        {loading ? (
          <div className="text-white/20 text-sm py-8 text-center">Loading...</div>
        ) : (
          <>
            <div className="mb-3">
              <div className="text-white/30 text-xs tracking-widest uppercase mb-4">Top Communities</div>
              <div className="space-y-2">
                {top5.map((c, i) => {
                  const color = getColor(c.cluster_id);
                  const isExpanded = expanded === c.cluster_id;
                  const related = relatedMap[c.cluster_id];
                  return (
                    <button
                      key={c.cluster_id}
                      onClick={() => handleExpand(c.cluster_id)}
                      className="w-full text-left rounded-xl p-4 transition-all"
                      style={{
                        background: isExpanded ? `${color}12` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isExpanded ? color + "30" : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-white/20 text-sm font-mono w-5 flex-shrink-0">{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span className="text-white font-medium text-sm truncate">{c.name}</span>
                            {(c.rarity === "Extremely Rare" || c.rarity === "Rare") && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: `${color}25`, color, fontSize: "10px" }}>
                                {c.rarity}
                              </span>
                            )}
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
                            className="h-full rounded-full"
                            style={{ width: `${(c.percentage / top5[0].percentage) * 100}%`, background: color }}
                          />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 mx-5 pt-3 border-t border-white/5 space-y-3">
                          {c.top_artists.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {c.top_artists.map(a => (
                                <span key={a} className="text-white/50 text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/8">
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-white/40 text-xs leading-relaxed">{c.description}</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {c.keywords.map(kw => (
                              <span key={kw} className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: `${color}20`, color }}>
                                {kw}
                              </span>
                            ))}
                          </div>
                          {related && related.length > 0 && (
                            <div className="pt-2 border-t border-white/5">
                              <div className="text-white/25 text-xs uppercase tracking-widest mb-2">
                                Closest Communities
                              </div>
                              <div className="space-y-1">
                                {related.map(r => (
                                  <div key={r.cluster_id} className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ background: getColor(r.cluster_id), opacity: 0.6 }} />
                                    <span className="text-white/50 text-xs flex-1 truncate">{r.name}</span>
                                    <span className="text-white/20 text-xs font-mono flex-shrink-0">
                                      {Math.round(r.similarity * 100)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8">
              <div className="text-white/30 text-xs tracking-widest uppercase mb-4">More Communities</div>
              <div className="space-y-1">
                {rest.map(c => {
                  const color = getColor(c.cluster_id);
                  return (
                    <div key={c.cluster_id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/3 transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: color, opacity: 0.7 }} />
                      <span className="text-white/60 text-xs flex-1 truncate">{c.name}</span>
                      {c.top_artists.length > 0 && (
                        <span className="text-white/25 text-xs truncate max-w-32 hidden sm:block">
                          {c.top_artists[0]}
                        </span>
                      )}
                      <span className="text-white/25 text-xs font-mono flex-shrink-0">{c.percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="mt-12 pt-6 border-t border-white/5 flex justify-between items-center">
          <a href="/" className="text-white/30 hover:text-white/60 text-xs transition-colors">← Back to galaxy</a>
          <span className="text-white/20 text-xs">{profile?.communities.length} communities discovered</span>
        </div>

      </div>
    </div>
  );
}