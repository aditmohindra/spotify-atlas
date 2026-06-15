"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { getTasteProfile, getTasteSummary, API_BASE_URL } from "@/lib/api";
import { getArchetypeColor } from "@/hooks/useMapData";
import type { TasteProfile, TasteSummary, Community } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUMMARY_CACHE_KEY = "atlas_summary";

const ARCHETYPE_DESCRIPTIONS: Record<string, string> = {
  "The Trap": "Southern rap ecosystems, ambition music, and the mythology of coming up.",
  "Terminally Online": "Internet rabbit holes, SoundCloud discoveries, and digital underground scenes.",
  "Festival Regular": "Dance floors, euphoric drops, and music that feels like collective release.",
  "Anime Passport": "Anime soundtracks, J-Pop, and the worlds that shaped your imagination.",
  "Toronto Winter Arc": "Late-night Toronto R&B, OVO melancholy, and songs for empty streets.",
  "Lo-Fi Otaku": "Lofi beats, game soundtracks, and the ambient worlds you study and sleep to.",
  "Desi Household": "Bollywood, bhangra, and the soundtrack of two cultures living in one person.",
  "Drip Report": "Streetwear-adjacent rap, flexing anthems, and music that sounds expensive.",
  "Nostalgic Club Kid": "2000s dancefloors, pop anthems, and the music that made you who you are.",
};

const CLUSTER_COLORS = [
  "#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa",
  "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#e879f9",
  "#22d3ee", "#86efac", "#fca5a5", "#fde68a", "#c4b5fd",
  "#f9a8d4", "#7dd3fc", "#6ee7b7", "#fcd34d", "#d8b4fe",
  "#93c5fd", "#6ee7b7", "#fca5a5", "#fde68a", "#ddd6fe",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClusterColor(clusterId: number): string {
  if (clusterId === -1) return "#dde6dd";
  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

interface ComputedArchetype {
  name: string;
  percentage: number;
  communityCount: number;
  description: string;
}

function computeArchetypes(communities: Community[]): ComputedArchetype[] {
  const map = new Map<string, { pct: number; count: number }>();
  for (const c of communities) {
    if (!c.archetype) continue;
    const existing = map.get(c.archetype);
    if (existing) {
      existing.pct += c.percentage;
      existing.count += 1;
    } else {
      map.set(c.archetype, { pct: c.percentage, count: 1 });
    }
  }
  return [...map.entries()]
    .map(([name, { pct, count }]) => ({
      name,
      percentage: Math.round(pct * 10) / 10,
      communityCount: count,
      description: ARCHETYPE_DESCRIPTIONS[name] ?? "",
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

function computeObscurityTier(communities: Community[]): string {
  const rareCount = communities.filter(
    (c) => c.rarity === "Rare" || c.rarity === "Extremely Rare",
  ).length;
  if (rareCount > 10) return "Top 2%";
  if (rareCount > 5) return "Top 10%";
  if (rareCount > 2) return "Top 25%";
  return "Top 50%";
}

function computeBridgeCount(communities: Community[]): number {
  const archetypeMap = new Map<string, number>();
  for (const c of communities) {
    if (!c.archetype) continue;
    archetypeMap.set(c.archetype, (archetypeMap.get(c.archetype) ?? 0) + c.percentage);
  }
  const topArch = [...archetypeMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return communities.slice(0, 20).filter((c) => c.archetype && c.archetype !== topArch).length;
}

// ── Skeleton helpers ──────────────────────────────────────────────────────────

function Pulse({ width = "100%", height = 12, radius = 6 }: { width?: string | number; height?: number; radius?: number }) {
  return (
    <div
      style={{
        width,
        height,
        background: "#e5e7eb",
        borderRadius: radius,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IdentityPage() {
  const [tasteData, setTasteData] = useState<TasteProfile | null>(null);
  const [summary, setSummary] = useState<TasteSummary | null>(null);
  const [tasteLoading, setTasteLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [mapTotal, setMapTotal] = useState<number>(9892);

  useEffect(() => {
    document.title = "Musical Identity · Spotify Atlas";
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/map`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d: { total: number }) => setMapTotal(d.total))
      .catch(() => {});
  }, []);

  const doFetchSummary = useCallback(async (force = false) => {
    if (force) {
      try { localStorage.removeItem(SUMMARY_CACHE_KEY); } catch { /* private browsing */ }
      setSummary(null);
    }
    setSummaryLoading(true);
    try {
      const data = await getTasteSummary(1);
      setSummary(data);
      try { localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
    } catch { /* cold start — leave skeleton */ }
    finally { setSummaryLoading(false); }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SUMMARY_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TasteSummary;
        if (parsed.title && parsed.summary) {
          setSummary(parsed);
          setSummaryLoading(false);
          return;
        }
      }
    } catch { /* corrupt cache — fall through */ }
    doFetchSummary();
  }, [doFetchSummary]);

  useEffect(() => {
    setTasteLoading(true);
    getTasteProfile(1, "all")
      .then((data) => setTasteData(data))
      .catch(() => {})
      .finally(() => setTasteLoading(false));
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const archetypes = useMemo(
    () => (tasteData ? computeArchetypes(tasteData.communities) : []),
    [tasteData],
  );
  const communities = tasteData?.communities ?? [];
  const top8 = communities.slice(0, 8);
  const top3Archetypes = archetypes.slice(0, 3);
  const restArchetypes = archetypes.slice(3);
  const maxRestPct = Math.max(...restArchetypes.map((a) => a.percentage), 1);
  const worldsFound = communities.filter((c) => c.percentage > 0).length;

  const rareCount = useMemo(
    () => communities.filter((c) => c.rarity === "Rare" || c.rarity === "Extremely Rare").length,
    [communities],
  );
  const obscurityTier = useMemo(() => computeObscurityTier(communities), [communities]);
  const bridgeCount = useMemo(() => computeBridgeCount(communities), [communities]);
  const topCommunity = communities[0] ?? null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "60vh 40vh",
        height: "100vh",
        overflow: "hidden",
        width: "100%",
      }}
    >

      {/* ══ CELL 1: Identity Panel — Top Left ════════════════════════════════ */}
      <div
        style={{
          background: "#ffffff",
          borderRight: "1px solid #dde6dd",
          borderBottom: "1px solid #dde6dd",
          padding: "28px 32px",
          overflowY: "auto",
        }}
      >
        {/* Eyebrow */}
        <p style={{
          fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
          fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#1db954", margin: "0 0 8px",
        }}>
          Your Musical Identity
        </p>

        {/* Playfair title */}
        <h1 style={{
          fontFamily: "var(--font-playfair), Georgia, serif",
          fontSize: "clamp(1.6rem, 2.2vw, 2.25rem)",
          lineHeight: 1.1, letterSpacing: "-0.02em",
          color: "#101828", margin: "0 0 8px",
        }}>
          {summaryLoading
            ? <Pulse width={220} height={34} radius={8} />
            : (summary?.title ?? "Your Atlas")}
        </h1>

        {/* Subtitle lines */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "0.875rem", color: "#374151", lineHeight: 1.5, margin: 0 }}>
            You don&apos;t just listen to songs.
          </p>
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "0.875rem", color: "#374151", lineHeight: 1.5, margin: 0 }}>
            You collect places to disappear into.
          </p>
        </div>

        {/* Atlas Read card */}
        <div style={{
          background: "#f9fafb", border: "1px solid #e5e7eb",
          borderLeft: "3px solid #1db954", borderRadius: 10,
          padding: "12px 14px", marginBottom: 18,
        }}>
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", margin: "0 0 7px" }}>
            Atlas Read
          </p>
          {summaryLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <Pulse width="100%" height={11} />
              <Pulse width="92%" height={11} />
              <Pulse width="76%" height={11} />
            </div>
          ) : (
            <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "0.8125rem", color: "#374151", lineHeight: 1.7, margin: 0 }}>
              {summary?.summary ?? "Your atlas read could not be loaded."}
            </p>
          )}
          {!summaryLoading && (
            <button
              onClick={() => doFetchSummary(true)}
              style={{ marginTop: 7, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, color: "#9ca3af" }}
            >
              ↺ Regenerate
            </button>
          )}
        </div>

        {/* Top 3 archetype cards */}
        {tasteLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            <Pulse height={80} radius={10} />
            <Pulse height={80} radius={10} />
            <Pulse height={80} radius={10} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            {top3Archetypes.map((arch) => {
              const color = getArchetypeColor(arch.name);
              return (
                <div
                  key={arch.name}
                  style={{ background: `${color}12`, border: `1px solid ${color}40`, borderRadius: 10, padding: "11px 13px" }}
                >
                  <div style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontWeight: 700, fontSize: "1.1rem", color, lineHeight: 1, marginBottom: 4 }}>
                    {arch.percentage.toFixed(1)}%
                  </div>
                  <div style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontWeight: 600, fontSize: 11, color: "#101828", lineHeight: 1.3 }}>
                    {arch.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 10, color: "#9ca3af", marginTop: 3 }}>
                    {arch.communityCount} {arch.communityCount === 1 ? "world" : "worlds"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Compact archetype bars (4–9) */}
        {!tasteLoading && restArchetypes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 18 }}>
            {restArchetypes.map((arch) => (
              <div key={arch.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, color: "#9ca3af", width: 120, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {arch.name}
                </span>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#f3f4f6", overflow: "hidden" }}>
                  <div style={{ width: `${(arch.percentage / maxRestPct) * 100}%`, height: "100%", background: getArchetypeColor(arch.name), opacity: 0.85, borderRadius: 2, transition: "width 0.5s" }} />
                </div>
                <span style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontSize: 10, color: "#9ca3af", width: 36, textAlign: "right", flexShrink: 0 }}>
                  {arch.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Stats strip */}
        <div style={{ display: "flex", gap: 24, paddingTop: 14, borderTop: "1px solid #f3f4f6", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontWeight: 700, fontSize: "1.15rem", color: "#101828", lineHeight: 1 }}>
              {mapTotal.toLocaleString()}
            </div>
            <div style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 10, color: "#9ca3af", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              tracks mapped
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontWeight: 700, fontSize: "1.15rem", color: "#101828", lineHeight: 1 }}>
              {tasteLoading ? "—" : worldsFound}
            </div>
            <div style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 10, color: "#9ca3af", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              worlds found
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontWeight: 700, fontSize: "0.9rem", color: "#101828", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tasteLoading ? "—" : (archetypes[0]?.name ?? "—")}
            </div>
            <div style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 10, color: "#9ca3af", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              dominant identity
            </div>
          </div>
        </div>
      </div>

      {/* ══ CELL 2: Galaxy Map — Top Right ═══════════════════════════════════ */}
      <div
        style={{
          background: "#f7f8f5",
          overflow: "hidden",
          position: "relative",
          borderBottom: "1px solid #dde6dd",
        }}
      >
        <iframe
          src="/map?embed=sidebar"
          title="Galaxy preview"
          style={{ width: "100%", height: "100%", border: "none", display: "block", pointerEvents: "none" }}
          tabIndex={-1}
          aria-hidden
        />
        <Link
          href="/map"
          style={{
            position: "absolute", bottom: 16, right: 16,
            display: "inline-flex", alignItems: "center", gap: 5,
            height: 32, padding: "0 14px", borderRadius: 20,
            background: "#ffffff", color: "#1db954",
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: 12, fontWeight: 600, textDecoration: "none",
            boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
            border: "1px solid #dde6dd",
            whiteSpace: "nowrap",
          }}
        >
          Open Full Atlas
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 6h8M6 2.5l3.5 3.5L6 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>

      {/* ══ CELL 3: Worlds Panel — Bottom Left ═══════════════════════════════ */}
      <div
        style={{
          background: "#ffffff",
          borderRight: "1px solid #dde6dd",
          padding: "20px 24px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1db954", margin: "0 0 10px" }}>
          Your Worlds
        </p>

        {tasteLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => <Pulse key={i} height={34} radius={8} />)}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
            {top8.map((community, i) => {
              const dotColor = getClusterColor(community.cluster_id);
              return (
                <Link
                  key={community.cluster_id}
                  href={`/community/${community.cluster_id}`}
                  style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 8 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontSize: 10, color: "#d1d5db", width: 14, textAlign: "right", flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 12.5, fontWeight: 500, color: "#101828", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {community.name}
                  </span>
                  {community.archetype && (
                    <span style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 9.5, color: "#9ca3af", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 20, padding: "2px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {community.archetype}
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontSize: 11, fontWeight: 600, color: "#374151", flexShrink: 0, minWidth: 36, textAlign: "right" }}>
                    {community.percentage.toFixed(1)}%
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        <Link
          href="/communities"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11.5, fontWeight: 600, color: "#1db954", textDecoration: "none" }}
        >
          Browse all 204 worlds
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 6h8M6 2.5l3.5 3.5L6 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>

      {/* ══ CELL 4: Signals + Era — Bottom Right ═════════════════════════════ */}
      <div
        style={{
          background: "#f7f8f5",
          padding: "20px 24px",
          overflowY: "auto",
        }}
      >
        {/* Signals section */}
        <div style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1db954", margin: 0 }}>
              Signals
            </p>
            <Link
              href="/insights"
              style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, fontWeight: 600, color: "#1db954", textDecoration: "none" }}
            >
              View all →
            </Link>
          </div>

          {tasteLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              <Pulse height={66} radius={9} />
              <Pulse height={66} radius={9} />
              <Pulse height={66} radius={9} />
              <Pulse height={66} radius={9} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {/* Rabbit Hole Velocity */}
              <div style={{ background: "#ffffff", border: "1px solid #dde6dd", borderRadius: 9, padding: "11px 13px" }}>
                <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 9.5, color: "#9ca3af", margin: "0 0 3px", fontWeight: 500, lineHeight: 1.2 }}>Rabbit Hole Velocity</p>
                <div style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontWeight: 700, fontSize: "1.35rem", color: "#111827", lineHeight: 1 }}>
                  {rareCount}
                </div>
                <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 9.5, color: "#d1d5db", margin: "3px 0 0" }}>rare worlds</p>
              </div>

              {/* Obscurity Signal */}
              <div style={{ background: "#ffffff", border: "1px solid #dde6dd", borderRadius: 9, padding: "11px 13px" }}>
                <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 9.5, color: "#9ca3af", margin: "0 0 3px", fontWeight: 500, lineHeight: 1.2 }}>Obscurity Signal</p>
                <div style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontWeight: 700, fontSize: "1.35rem", color: "#111827", lineHeight: 1 }}>
                  {obscurityTier}
                </div>
                <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 9.5, color: "#d1d5db", margin: "3px 0 0" }}>of all listeners</p>
              </div>

              {/* World Immersion */}
              <div style={{ background: "#ffffff", border: "1px solid #dde6dd", borderRadius: 9, padding: "11px 13px" }}>
                <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 9.5, color: "#9ca3af", margin: "0 0 3px", fontWeight: 500, lineHeight: 1.2 }}>World Immersion</p>
                <div style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontWeight: 700, fontSize: "1.35rem", color: "#111827", lineHeight: 1 }}>
                  {topCommunity ? `${topCommunity.percentage.toFixed(1)}%` : "—"}
                </div>
                <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 9.5, color: "#d1d5db", margin: "3px 0 0" }}>dominant world</p>
              </div>

              {/* Bridge Communities */}
              <div style={{ background: "#ffffff", border: "1px solid #dde6dd", borderRadius: 9, padding: "11px 13px" }}>
                <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 9.5, color: "#9ca3af", margin: "0 0 3px", fontWeight: 500, lineHeight: 1.2 }}>Bridge Communities</p>
                <div style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontWeight: 700, fontSize: "1.35rem", color: "#111827", lineHeight: 1 }}>
                  {bridgeCount}
                </div>
                <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 9.5, color: "#d1d5db", margin: "3px 0 0" }}>cross-archetype worlds</p>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #e5e7eb", margin: "14px 0" }} />

        {/* Listening Eras placeholder */}
        <div>
          <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1db954", margin: "0 0 10px" }}>
            Listening Eras
          </p>
          <div
            style={{
              border: "1.5px dashed #dde6dd",
              borderRadius: 10,
              padding: "14px 16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 11,
              background: "rgba(255,255,255,0.55)",
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#f3f4f6", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="6" stroke="#9ca3af" strokeWidth="1.4"/>
                <path d="M8 5v3.2l2.2 2.2" stroke="#9ca3af" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontWeight: 600, fontSize: 12.5, color: "#374151", margin: "0 0 4px" }}>
                Coming in Phase 12
              </p>
              <p style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: 11.5, color: "#9ca3af", lineHeight: 1.5, margin: 0 }}>
                Your musical biography — life chapters defined by how your taste evolved.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
