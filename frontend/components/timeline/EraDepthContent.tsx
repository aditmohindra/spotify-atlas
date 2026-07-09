"use client";

import Link from "next/link";
import { getArchetypeColor } from "@/hooks/useMapData";
import type { Era, EraDepth } from "@/lib/types";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { displayTitle, formatDateRange } from "./timelineUtils";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-ui text-[11px] font-semibold tracking-[0.12em] uppercase mb-3"
      style={{ color: "#98a2b3" }}
    >
      {children}
    </p>
  );
}

function EmptyList() {
  return (
    <p className="font-ui text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
      No data
    </p>
  );
}

function ArchetypeBar({ breakdown }: { breakdown: EraDepth["archetype_breakdown"] }) {
  if (breakdown.length === 0) return null;
  return (
    <div>
      <SectionLabel>Archetype Fingerprint</SectionLabel>
      <div
        className="flex h-3 rounded-full overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.1)" }}
      >
        {breakdown.map((item) => (
          <div
            key={item.archetype}
            title={`${item.archetype}: ${item.percentage}%`}
            style={{
              width: `${item.percentage}%`,
              background: getArchetypeColor(item.archetype),
              minWidth: item.percentage > 0 ? 2 : 0,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {breakdown.slice(0, 6).map((item) => (
          <span
            key={item.archetype}
            className="font-ui text-[10px] flex items-center gap-1.5"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: getArchetypeColor(item.archetype) }}
            />
            {item.archetype} {item.percentage}%
          </span>
        ))}
      </div>
    </div>
  );
}

export interface EraDepthContentProps {
  era: Era;
  depth: EraDepth;
  /** Show "View full era" link (main timeline page). */
  showFullLink?: boolean;
  compact?: boolean;
}

export function EraDepthContent({
  era,
  depth,
  showFullLink = false,
}: EraDepthContentProps) {
  const title = displayTitle(era);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2
            className="font-hero leading-tight"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
              letterSpacing: "-0.02em",
              color: era.is_named ? "#ffffff" : "rgba(255,255,255,0.7)",
            }}
          >
            {title}
          </h2>
          <p className="font-ui text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
            {formatDateRange(era.start_date, era.end_date)}
            <span className="mx-2 opacity-40">·</span>
            {era.event_count.toLocaleString()} events
          </p>
          {era.description && (
            <p
              className="font-ui italic text-sm mt-3 max-w-xl leading-relaxed"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              {era.description}
            </p>
          )}
          {era.mood && (
            <span
              className="inline-flex font-ui text-xs font-medium px-3 py-1 rounded-full mt-3"
              style={{
                background: "rgba(29,185,84,0.12)",
                color: "#4ade80",
                border: "1px solid rgba(29,185,84,0.25)",
              }}
            >
              {era.mood}
            </span>
          )}
        </div>
        {showFullLink && (
          <Link
            href={`/timeline/era/${era.era_id}`}
            className="font-ui text-sm font-medium px-4 py-2 rounded-full shrink-0 transition-opacity hover:opacity-90"
            style={{ background: "#1db954", color: "#ffffff" }}
          >
            View full era →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <SectionLabel>Heavy Rotation — Artists</SectionLabel>
          {depth.top_artists_by_volume.length === 0 ? (
            <EmptyList />
          ) : (
            <ul className="space-y-2">
              {depth.top_artists_by_volume.map((a, i) => (
              <li
                key={a.name}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="font-stat text-xs tabular-nums w-4" style={{ color: "#4ade80" }}>
                    {i + 1}
                  </span>
                  <ImageWithFallback
                    src={a.artist_image_url}
                    alt={a.name}
                    size={36}
                    shape="circle"
                    fallbackText={a.name}
                  />
                  <span className="font-ui text-sm truncate" style={{ color: "#ffffff" }}>
                    {a.name}
                  </span>
                </span>
                <span className="font-stat text-xs tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {a.event_count}
                </span>
              </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionLabel>What Made This Era Different — Artists</SectionLabel>
          {depth.top_artists_by_distinctiveness.length === 0 ? (
            <EmptyList />
          ) : (
            <ul className="space-y-2">
              {depth.top_artists_by_distinctiveness.map((a, i) => (
              <li
                key={a.name}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="font-stat text-xs tabular-nums w-4" style={{ color: "#a78bfa" }}>
                    {i + 1}
                  </span>
                  <ImageWithFallback
                    src={a.artist_image_url}
                    alt={a.name}
                    size={36}
                    shape="circle"
                    fallbackText={a.name}
                  />
                  <span className="font-ui text-sm truncate" style={{ color: "#ffffff" }}>
                    {a.name}
                  </span>
                </span>
                <span className="font-stat text-xs tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {a.distinctiveness_score.toFixed(1)}×
                </span>
              </li>
              ))}
            </ul>
          )}
        </div>

        <div className="md:col-span-2">
          <SectionLabel>Representative Tracks</SectionLabel>
          {depth.representative_tracks.length === 0 ? (
            <EmptyList />
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {depth.representative_tracks.map((t, i) => (
                <li
                  key={`${t.name}-${t.artist}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <span className="font-stat text-xs tabular-nums w-4 shrink-0" style={{ color: "#60a5fa" }}>
                    {i + 1}
                  </span>
                  <ImageWithFallback
                    src={t.album_image_url}
                    alt={t.name}
                    size={36}
                    shape="square"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-ui text-sm truncate" style={{ color: "#ffffff" }}>
                      {t.name}
                    </p>
                    <p className="font-ui text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {t.artist}
                    </p>
                  </div>
                  <span className="font-stat text-xs tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {t.distinctiveness_score.toFixed(1)}×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {depth.top_genres_moods.length > 0 && (
        <div>
          <SectionLabel>Genre & Mood Signal</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {depth.top_genres_moods.map((tag) => (
              <span
                key={tag.tag}
                className="font-ui text-[11px] px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.55)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                {tag.tag}
                <span className="font-stat ml-1.5 opacity-60">{tag.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <ArchetypeBar breakdown={depth.archetype_breakdown} />
    </div>
  );
}
