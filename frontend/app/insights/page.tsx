"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getTasteProfile } from "@/lib/api";
import { getArchetypeColor } from "@/hooks/useMapData";
import type { TasteProfile, Community } from "@/lib/types";
import { AtlasCard } from "@/components/atlas/AtlasCard";
import { SectionHeader } from "@/components/atlas/SectionHeader";
import { PageShell } from "@/components/atlas/PageShell";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ComputedArchetype {
  name: string;
  percentage: number;
}

interface Signals {
  rareCount: number;
  obscurityTier: string;
  topCommunity: Community | null;
  bridgeCount: number;
  bridgeArch1: string;
  bridgeArch2: string | null;
  archetypes: ComputedArchetype[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeArchetypes(communities: Community[]): ComputedArchetype[] {
  const map = new Map<string, number>();
  for (const c of communities) {
    if (!c.archetype) continue;
    map.set(c.archetype, (map.get(c.archetype) ?? 0) + c.percentage);
  }
  return [...map.entries()]
    .map(([name, pct]) => ({ name, percentage: Math.round(pct * 10) / 10 }))
    .sort((a, b) => b.percentage - a.percentage);
}

function computeSignals(communities: Community[]): Signals {
  const rareCount = communities.filter(
    (c) => c.rarity === "Rare" || c.rarity === "Extremely Rare",
  ).length;

  let obscurityTier = "Top 50%";
  if (rareCount > 10) obscurityTier = "Top 2%";
  else if (rareCount > 5) obscurityTier = "Top 10%";
  else if (rareCount > 2) obscurityTier = "Top 25%";

  const topCommunity = communities[0] ?? null;
  const archetypes = computeArchetypes(communities);
  const topArchetype = archetypes[0]?.name ?? null;

  const top20 = communities.slice(0, 20);
  const crossCommunities = top20.filter(
    (c) => c.archetype && c.archetype !== topArchetype,
  );
  const bridgeCount = crossCommunities.length;

  const distinctCrossArchetypes = [
    ...new Set(crossCommunities.map((c) => c.archetype).filter((a): a is string => a !== null)),
  ];
  const bridgeArch1 = topArchetype ?? "—";
  const bridgeArch2 = distinctCrossArchetypes[0] ?? null;

  return { rareCount, obscurityTier, topCommunity, bridgeCount, bridgeArch1, bridgeArch2, archetypes };
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SignalCardProps {
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  label: string;
  stat: string;
  statSub: string;
  description: React.ReactNode;
}

function SignalCard({ icon, iconBg, iconBorder, label, stat, statSub, description }: SignalCardProps) {
  return (
    <div
      className="rounded-atlas-hero p-8 flex flex-col gap-5 border"
      style={{ background: "#ffffff", borderColor: "#dde6dd" }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: iconBg, border: `1px solid ${iconBorder}` }}
      >
        {icon}
      </div>
      <div>
        <p className="font-ui text-sm font-medium mb-3" style={{ color: "#667085" }}>
          {label}
        </p>
        <span
          className="font-stat font-bold leading-none block tabular-nums"
          style={{ fontSize: "3rem", color: "#111827" }}
        >
          {stat}
        </span>
        <p className="font-ui text-xs mt-1" style={{ color: "#9ca3af" }}>
          {statSub}
        </p>
      </div>
      <p className="font-ui text-sm leading-relaxed" style={{ color: "#374151" }}>
        {description}
      </p>
    </div>
  );
}

interface TimelineEntryProps {
  label: string;
  period: string;
  community: Community | null;
  description: string;
  accentColor: string;
}

function TimelineEntry({ label, period, community, description, accentColor }: TimelineEntryProps) {
  const pillColor = community?.archetype ? getArchetypeColor(community.archetype) : "#9ca3af";

  return (
    <div
      className="bg-surface border border-border rounded-atlas-md px-6 py-5 flex items-center gap-6"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <div className="shrink-0 w-24 text-right">
        <span
          className="font-ui text-xs font-semibold uppercase tracking-wide block"
          style={{ color: accentColor }}
        >
          {label}
        </span>
        <span className="font-ui text-xs" style={{ color: "#9ca3af" }}>
          {period}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        {community ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-ui font-semibold text-ink text-[15px]">
              {community.name}
            </span>
            {community.archetype && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium leading-none whitespace-nowrap border"
                style={{
                  color: pillColor,
                  borderColor: `${pillColor}40`,
                  background: `${pillColor}12`,
                }}
              >
                {community.archetype}
              </span>
            )}
          </div>
        ) : (
          <span className="font-ui text-sm" style={{ color: "#9ca3af" }}>
            No data for this period
          </span>
        )}
        <p className="font-ui text-xs mt-0.5" style={{ color: "#9ca3af" }}>
          {description}
        </p>
      </div>

      {community && (
        <span
          className="font-stat text-sm font-semibold shrink-0 tabular-nums"
          style={{ color: "#374151" }}
        >
          {community.percentage.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [allProfile, setAllProfile] = useState<TasteProfile | null>(null);
  const [monthProfile, setMonthProfile] = useState<TasteProfile | null>(null);
  const [sixMonthProfile, setSixMonthProfile] = useState<TasteProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Signals · Spotify Atlas";
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getTasteProfile(1, "all"),
      getTasteProfile(1, "30days"),
      getTasteProfile(1, "6months"),
    ])
      .then(([all, month, sixMonth]) => {
        setAllProfile(all);
        setMonthProfile(month);
        setSixMonthProfile(sixMonth);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signals = useMemo<Signals | null>(
    () => (allProfile ? computeSignals(allProfile.communities) : null),
    [allProfile],
  );

  const archetypes = signals?.archetypes ?? [];
  const totalPct = archetypes.reduce((sum, a) => sum + a.percentage, 0);

  const thisMonthTop = monthProfile?.communities[0] ?? null;
  const sixMonthTop = sixMonthProfile?.communities[0] ?? null;
  const allTimeTop = allProfile?.communities[0] ?? null;

  return (
    <div className="min-h-screen" style={{ background: "#f7f8f5" }}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 65% 80% at 25% -10%, rgba(29,185,84,0.09) 0%, transparent 60%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-16 sm:py-20 relative z-10">
          <p
            className="text-eyebrow mb-4"
            style={{ color: "#1db954" }}
          >
            SIGNALS
          </p>
          <h1
            className="font-hero"
            style={{
              fontSize: "clamp(2.25rem, 4.5vw, 3.25rem)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "#111827",
            }}
          >
            Deeper patterns in your
            <br />
            listening universe.
          </h1>
          <p
            className="mt-4 font-ui text-[1rem]"
            style={{ color: "#667085" }}
          >
            What your taste reveals beyond the surface.
          </p>
        </div>
      </section>

      <PageShell maxWidth="xl" className="pt-0 pb-24">
        <div className="space-y-12">

          {/* ── 1. Signal Cards ───────────────────────────────────────────── */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-surface border border-border rounded-atlas-hero p-8 animate-pulse"
                >
                  <div className="w-9 h-9 rounded-full bg-border mb-5" />
                  <div className="h-3.5 w-32 bg-border rounded-full mb-4" />
                  <div className="h-12 w-20 bg-border rounded-xl mb-1" />
                  <div className="h-3 w-16 bg-border rounded-full mb-5" />
                  <div className="h-3 w-full bg-border rounded-full mb-1.5" />
                  <div className="h-3 w-3/4 bg-border rounded-full" />
                </div>
              ))}
            </div>
          ) : signals !== null && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

              {/* Card 1 — Rabbit Hole Velocity */}
              <SignalCard
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M2 11L6 7l3 3 5-5" stroke="#15803d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M11 6h3v3" stroke="#15803d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
                iconBg="#f0fdf4"
                iconBorder="#bbf7d0"
                label="Rabbit Hole Velocity"
                stat={String(signals.rareCount)}
                statSub="rare worlds"
                description={
                  <>
                    You have{" "}
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {signals.rareCount} rare{" "}
                      {signals.rareCount === 1 ? "community" : "communities"}
                    </span>{" "}
                    in your top 50. Most listeners never find these worlds.
                  </>
                }
              />

              {/* Card 2 — Obscurity Signal */}
              <SignalCard
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M4.05 4.05l1.06 1.06M10.89 10.89l1.06 1.06M4.05 11.95l1.06-1.06M10.89 5.11l1.06-1.06" stroke="#a21caf" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="8" cy="8" r="2.2" stroke="#a21caf" strokeWidth="1.4" />
                  </svg>
                }
                iconBg="#fdf4ff"
                iconBorder="#f5d0fe"
                label="Obscurity Signal"
                stat={signals.obscurityTier}
                statSub="of all listeners"
                description="Your taste reaches into communities that most listeners never encounter."
              />

              {/* Card 3 — World Immersion */}
              <SignalCard
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="8" cy="8" r="6" stroke="#ea580c" strokeWidth="1.5" />
                    <path d="M8 5v3.2l2.2 2.2" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
                iconBg="#fff7ed"
                iconBorder="#fed7aa"
                label="World Immersion"
                stat={`${signals.topCommunity?.percentage.toFixed(1) ?? "—"}%`}
                statSub="dominant"
                description={
                  <>
                    Your most listened world is{" "}
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {signals.topCommunity?.name ?? "—"}
                    </span>
                    . You don&apos;t sample — you immerse.
                  </>
                }
              />

              {/* Card 4 — Bridge Communities */}
              <SignalCard
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="3" cy="8" r="2" stroke="#1d4ed8" strokeWidth="1.4" />
                    <circle cx="13" cy="8" r="2" stroke="#1d4ed8" strokeWidth="1.4" />
                    <path d="M5 8h6" stroke="#1d4ed8" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M9 6l2 2-2 2" stroke="#1d4ed8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
                iconBg="#eef3fb"
                iconBorder="#bfdbfe"
                label="Bridge Communities"
                stat={String(signals.bridgeCount)}
                statSub="cross-archetype worlds"
                description={
                  <>
                    You connect{" "}
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {signals.bridgeCount} worlds
                    </span>{" "}
                    that rarely overlap
                    {signals.bridgeArch2 !== null ? (
                      <>
                        , spanning{" "}
                        <span style={{ fontWeight: 600, color: "#111827" }}>
                          {signals.bridgeArch1}
                        </span>{" "}
                        and{" "}
                        <span style={{ fontWeight: 600, color: "#111827" }}>
                          {signals.bridgeArch2}
                        </span>
                        .
                      </>
                    ) : (
                      <>.</>
                    )}
                  </>
                }
              />

            </div>
          )}

          {/* ── 2. Discovery Timeline ─────────────────────────────────────── */}
          <div className="space-y-5">
            <SectionHeader
              eyebrow="DISCOVERY TIMELINE"
              title="How your taste has evolved"
              subtitle="Different windows into your listening history."
            />

            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="bg-surface border border-border rounded-atlas-md px-6 py-5 animate-pulse"
                    style={{ borderLeft: "3px solid #dde6dd" }}
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-24 space-y-1.5">
                        <div className="h-3 w-16 bg-border rounded-full ml-auto" />
                        <div className="h-3 w-12 bg-border rounded-full ml-auto" />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-44 bg-border rounded-full" />
                        <div className="h-3 w-28 bg-border rounded-full" />
                      </div>
                      <div className="h-4 w-10 bg-border rounded-full shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <TimelineEntry
                  label="Breakout"
                  period="This Month"
                  community={thisMonthTop}
                  description="Your fastest-growing world this month"
                  accentColor="#1db954"
                />
                <TimelineEntry
                  label="Emerging"
                  period="Last 6 Months"
                  community={sixMonthTop}
                  description="Rising in your listening history"
                  accentColor="#3b82f6"
                />
                <TimelineEntry
                  label="Foundation"
                  period="All Time"
                  community={allTimeTop}
                  description="The world that defines your core taste"
                  accentColor="#8b5cf6"
                />
              </div>
            )}
          </div>

          {/* ── 3. Identity Spectrum ──────────────────────────────────────── */}
          <div className="space-y-5">
            <SectionHeader
              eyebrow="IDENTITY SPECTRUM"
              title="Your taste composition"
              subtitle="All archetypes weighted by listening time — a DNA bar of your musical identity."
            />

            {loading ? (
              <div className="bg-surface border border-border rounded-atlas-lg p-8 animate-pulse">
                <div className="h-8 w-full rounded-full bg-border mb-5" />
                <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-border" />
                      <div className="h-3 w-20 bg-border rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            ) : archetypes.length > 0 && (
              <AtlasCard variant="default" padding="lg">
                <div className="space-y-5">
                  {/* DNA bar */}
                  <div className="flex rounded-full overflow-hidden h-8">
                    {archetypes.map((arch, i) => {
                      const pct = totalPct > 0 ? (arch.percentage / totalPct) * 100 : 0;
                      const color = getArchetypeColor(arch.name);
                      if (pct < 0.5) return null;
                      return (
                        <div
                          key={arch.name}
                          title={`${arch.name}: ${arch.percentage.toFixed(1)}%`}
                          style={{
                            width: `${pct}%`,
                            background: color,
                            marginLeft: i > 0 ? "2px" : 0,
                          }}
                          className="transition-all duration-500 shrink-0"
                        />
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                    {archetypes.map((arch) => {
                      const color = getArchetypeColor(arch.name);
                      const pct = totalPct > 0 ? (arch.percentage / totalPct) * 100 : 0;
                      if (pct < 0.5) return null;
                      return (
                        <div key={arch.name} className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: color }}
                          />
                          <span className="font-ui text-xs" style={{ color: "#374151" }}>
                            {arch.name}
                          </span>
                          <span
                            className="font-stat text-xs tabular-nums"
                            style={{ color: "#9ca3af" }}
                          >
                            {arch.percentage.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </AtlasCard>
            )}
          </div>

          {/* ── 4. CTA ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/communities"
              className="group flex items-center justify-between rounded-atlas-lg border px-6 py-5 transition-all duration-150 hover-lift"
              style={{ background: "#ffffff", borderColor: "#dde6dd" }}
            >
              <div>
                <p className="font-ui font-semibold text-ink text-base mb-0.5">
                  Explore Your Worlds
                </p>
                <p className="font-ui text-sm" style={{ color: "#667085" }}>
                  Browse all your communities
                </p>
              </div>
              <span
                className="font-stat text-lg font-medium transition-transform duration-150 group-hover:translate-x-0.5"
                style={{ color: "#1db954" }}
                aria-hidden
              >
                →
              </span>
            </Link>

            <Link
              href="/map"
              className="group flex items-center justify-between rounded-atlas-lg border px-6 py-5 transition-all duration-150 hover-lift"
              style={{
                background: "rgba(29,185,84,0.04)",
                borderColor: "rgba(29,185,84,0.22)",
              }}
            >
              <div>
                <p className="font-ui font-semibold text-ink text-base mb-0.5">
                  Open the Atlas
                </p>
                <p className="font-ui text-sm" style={{ color: "#667085" }}>
                  See the galaxy map
                </p>
              </div>
              <span
                className="font-stat text-lg font-medium transition-transform duration-150 group-hover:translate-x-0.5"
                style={{ color: "#1db954" }}
                aria-hidden
              >
                →
              </span>
            </Link>
          </div>

        </div>
      </PageShell>
    </div>
  );
}
