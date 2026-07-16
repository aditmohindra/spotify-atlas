"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Check,
  Disc3,
  Info,
  Music2,
  Plus,
  Sparkles,
  Tag,
  User,
  type LucideIcon,
} from "lucide-react";

import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  getTasteProfile,
  getWrappedMeta,
  getWrappedTopAlbums,
  getWrappedTopArtists,
  getWrappedTopTracks,
} from "@/lib/api";
import type {
  TasteTimeRange,
  WrappedMeta,
  WrappedTopAlbum,
  WrappedTopArtist,
  WrappedTopTrack,
  WrappedWindow,
} from "@/lib/types";

// ── Theme (matches /communities dark shell) ───────────────────────────────────

const BG = "#070d1b";
const PAGE_BG = `
  radial-gradient(circle at 75% 0%, rgba(38, 92, 130, 0.18), transparent 34%),
  radial-gradient(circle at 42% 12%, rgba(92, 60, 150, 0.12), transparent 28%),
  radial-gradient(ellipse 42% 34% at 100% 100%, rgba(29, 185, 84, 0.07), transparent 60%),
  #070d1b
`;
const CARD_BG =
  "linear-gradient(145deg, rgba(18, 28, 47, 0.98), rgba(10, 17, 31, 0.98))";
const CARD_BORDER = "rgba(148, 163, 184, 0.18)";
const CARD_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.03), 0 14px 36px rgba(0,0,0,0.2)";
const RANK_NUMBER = "#94a3b8";
const GREEN = "#1db954";
const GREEN_BRIGHT = "#22c55e";
const PURPLE = "#a855f7";
const BLUE = "#3b82f6";
const ORANGE = "#f97316";
const CYAN = "#22d3ee";
const PINK = "#ec4899";
const TEXT = "#ffffff";
const MUTED = "#9ca3af";
const FONT = "var(--font-dm-sans), system-ui, sans-serif";
const MONO = "var(--font-jetbrains-mono), ui-monospace, monospace";

const GENRE_BAR_COLORS = [GREEN_BRIGHT, PURPLE, CYAN, PINK, ORANGE];

const ARCHETYPE_GENRE_LABEL: Record<string, string> = {
  "Trap Dynasty": "Trap & Rap",
  "Festival Regular": "Electronic",
  "Terminally Online": "Internet Scenes",
  "Late Night Romantic": "Late-Night R&B",
  "Indie Main Character": "Indie & Alt",
  "Rap Canon Devotee": "Rap Essentials",
  "K-Pop Citizen": "K-Pop",
  "Side Quest Soul": "Anime & Games",
  "Lo-Fi Otaku": "Lo-Fi",
  "Desi Household": "South Asian",
  "Anime Passport": "Anime & J-Pop",
  "Club Circuit": "Club & House",
};

const WINDOWS: {
  label: string;
  value: WrappedWindow;
  badge: string;
  tasteRange: TasteTimeRange;
}[] = [
  {
    label: "Last 4 Weeks",
    value: "short_term",
    badge: "Extended Streaming History",
    tasteRange: "30days",
  },
  {
    label: "Last 6 Months",
    value: "medium_term",
    badge: "Extended Streaming History",
    tasteRange: "6months",
  },
  {
    label: "All Time",
    value: "long_term",
    badge: "Extended Streaming History",
    tasteRange: "all",
  },
];

const LISTENING_NOTES = [
  "Built from your imported Spotify Extended Streaming History.",
  "Track, artist, and album rankings reflect cumulative listening across your full history.",
  "Time filters recalculate views from the same full dataset rather than switching between separate Spotify snapshots.",
  "Genres and albums are derived from the tracks in your imported listening history.",
] as const;

/** Visible ranked rows in the collapsed single-viewport layout. */
const PREVIEW_LIMIT = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: string | null): string {
  if (!value) return "No history yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function genreLabel(archetype: string): string {
  return ARCHETYPE_GENRE_LABEL[archetype] ?? archetype;
}

// ── Decorative visuals ────────────────────────────────────────────────────────

function HeroNebulaBanner() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 20,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            linear-gradient(105deg, ${BG} 0%, ${BG} 26%, transparent 66%),
            radial-gradient(ellipse 60% 130% at 86% 45%, rgba(34,211,238,0.30) 0%, transparent 58%),
            radial-gradient(ellipse 52% 105% at 70% 28%, rgba(168,85,247,0.36) 0%, transparent 60%),
            radial-gradient(ellipse 40% 80% at 92% 72%, rgba(29,185,84,0.20) 0%, transparent 52%),
            linear-gradient(100deg, #070d1b 0%, #12102a 45%, #0a1a28 100%)
          `,
        }}
      />
      {/* Soft teal glow behind Spotify mark */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          right: 42,
          transform: "translateY(-50%)",
          width: 240,
          height: 240,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(34,211,238,0.24) 0%, rgba(168,85,247,0.12) 45%, transparent 70%)",
        }}
      />
    </div>
  );
}

function HeroSpotifyBadge() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: "50%",
        right: 48,
        transform: "translateY(-50%)",
        width: 116,
        height: 116,
        borderRadius: "50%",
        background: "#0b1220",
        border: "1px solid rgba(255,255,255,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
        boxShadow:
          "0 0 0 1px rgba(29,185,84,0.15), 0 0 44px rgba(34,211,238,0.4), 0 0 72px rgba(168,85,247,0.24)",
        flexShrink: 0,
      }}
    >
      <svg width="62" height="62" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          fill={GREEN}
          d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
        />
      </svg>
    </div>
  );
}

function OrbitDecoration() {
  const nodes = [
    { r: 22, angle: 20, color: PURPLE, size: 4 },
    { r: 22, angle: 160, color: CYAN, size: 3 },
    { r: 34, angle: 70, color: GREEN, size: 4 },
    { r: 34, angle: 220, color: ORANGE, size: 3 },
    { r: 46, angle: 110, color: PINK, size: 3 },
    { r: 46, angle: 300, color: CYAN, size: 4 },
  ];

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        right: 8,
        bottom: 8,
        width: 108,
        height: 108,
        pointerEvents: "none",
        opacity: 0.85,
      }}
    >
      <svg width="108" height="108" viewBox="0 0 108 108" fill="none">
        {[22, 34, 46].map((r) => (
          <circle
            key={r}
            cx="54"
            cy="54"
            r={r}
            stroke="rgba(148,163,184,0.22)"
            strokeWidth="1"
          />
        ))}
        <circle cx="54" cy="54" r="2.5" fill={GREEN} opacity="0.7" />
        {nodes.map((n, i) => {
          const rad = (n.angle * Math.PI) / 180;
          const x = 54 + Math.round(n.r * Math.cos(rad) * 1000) / 1000;
          const y = 54 + Math.round(n.r * Math.sin(rad) * 1000) / 1000;
          return <circle key={i} cx={x} cy={y} r={n.size / 2} fill={n.color} />;
        })}
      </svg>
    </div>
  );
}

// ── Small UI pieces ───────────────────────────────────────────────────────────

function CompactStatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  secondary,
  secondaryColor,
  tertiary,
  tertiaryColor,
  imageSrc,
  imageShape = "square",
  imageFallback,
}: {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: string;
  secondary: string;
  secondaryColor?: string;
  tertiary?: string;
  tertiaryColor?: string;
  imageSrc?: string | null;
  imageShape?: "square" | "circle";
  imageFallback?: string;
}) {
  const showArt = imageSrc !== undefined;

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 16,
        boxShadow: CARD_SHADOW,
        padding: "20px 24px",
        minHeight: 118,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Icon size={15} color={iconColor} strokeWidth={2.25} aria-hidden />
          <span
            style={{
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: 600,
              color: MUTED,
              letterSpacing: "0.02em",
            }}
          >
            {label}
          </span>
        </div>
        <Plus size={13} color="rgba(148,163,184,0.5)" strokeWidth={2} aria-hidden />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        {showArt && (
          <div
            style={{
              flexShrink: 0,
              borderRadius: imageShape === "circle" ? 9999 : 10,
              overflow: "hidden",
              width: 64,
              height: 64,
            }}
          >
            <ImageWithFallback
              src={imageSrc}
              alt={value}
              size={64}
              shape={imageShape}
              fallbackText={imageFallback}
            />
          </div>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 22,
              color: TEXT,
              lineHeight: 1.15,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value}
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 12,
              color: secondaryColor ?? iconColor,
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 600,
            }}
          >
            {secondary}
          </div>
          {tertiary && (
            <div
              style={{
                fontFamily: FONT,
                fontSize: 11,
                color: tertiaryColor ?? MUTED,
                marginTop: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: tertiaryColor ? 600 : 400,
              }}
            >
              {tertiary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          style={{
            height: 34,
            borderRadius: 6,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${CARD_BORDER}`,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p style={{ fontFamily: FONT, fontSize: 12, color: MUTED, lineHeight: 1.45 }}>
      {message}
    </p>
  );
}

function ViewAllLink({
  label,
  onClick,
  variant = "pill",
}: {
  label: string;
  onClick?: () => void;
  variant?: "pill" | "plain";
}) {
  const pill = variant === "pill";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 600,
        color: "#8fa2b8",
        background: "none",
        border: pill ? "1px solid rgba(148,163,184,0.14)" : "none",
        borderRadius: pill ? 999 : 0,
        cursor: onClick ? "pointer" : "default",
        padding: pill ? "6px 10px" : 0,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function RankedListCard<T>({
  title,
  icon: Icon,
  iconColor,
  accentColor,
  items,
  loading,
  emptyMessage,
  expanded,
  onToggleExpand,
  footerLabel,
  renderImage,
  renderPrimary,
  renderSecondary,
  renderTrailing,
}: {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  accentColor: string;
  items: T[];
  loading: boolean;
  emptyMessage: string;
  expanded: boolean;
  onToggleExpand: () => void;
  footerLabel: string;
  renderImage?: (item: T) => React.ReactNode;
  renderPrimary: (item: T) => string;
  renderSecondary?: (item: T) => string | null;
  renderTrailing?: (item: T) => string | null;
}) {
  const visible = expanded ? items : items.slice(0, PREVIEW_LIMIT);
  const canExpand = items.length > PREVIEW_LIMIT;

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 16,
        boxShadow: CARD_SHADOW,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 430,
        alignSelf: "start",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Icon size={16} color={iconColor} strokeWidth={2.25} aria-hidden />
          <h2
            style={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 15,
              color: TEXT,
              margin: 0,
            }}
          >
            {title}
          </h2>
        </div>
        {canExpand ? (
          <ViewAllLink
            label={expanded ? "Show less" : "View all"}
            onClick={onToggleExpand}
          />
        ) : (
          <ViewAllLink label="View all" />
        )}
      </div>

      <div
        style={{
          flex: 1,
          maxHeight: expanded ? 460 : undefined,
          overflowY: expanded ? "auto" : "visible",
        }}
      >
        {loading ? (
          <LoadingRows count={PREVIEW_LIMIT} />
        ) : items.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {visible.map((item, index) => (
              <li
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 48,
                  padding: "10px 0",
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    fontWeight: 600,
                    color: RANK_NUMBER,
                    width: 26,
                    flexShrink: 0,
                    textAlign: "right",
                  }}
                >
                  {index + 1}
                </span>
                {renderImage?.(item)}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      fontFamily: FONT,
                      fontSize: 13,
                      fontWeight: 600,
                      color: TEXT,
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: 1.3,
                    }}
                  >
                    {renderPrimary(item)}
                  </p>
                  {renderSecondary && (
                    <p
                      style={{
                        fontFamily: FONT,
                        fontSize: 11,
                        color: MUTED,
                        margin: "2px 0 0",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.3,
                      }}
                    >
                      {renderSecondary(item)}
                    </p>
                  )}
                </div>
                {renderTrailing && (
                  <span
                    style={{
                      fontFamily: FONT,
                      fontSize: 12,
                      fontWeight: 600,
                      color: accentColor,
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {renderTrailing(item)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && items.length > 0 && (
        <div
          style={{
            textAlign: "center",
            marginTop: 10,
            paddingTop: 8,
            flexShrink: 0,
          }}
        >
          <ViewAllLink
            label={expanded && canExpand ? "Show less" : footerLabel}
            onClick={canExpand ? onToggleExpand : undefined}
            variant="plain"
          />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WrappedPage() {
  const [windowValue, setWindowValue] = useState<WrappedWindow>("short_term");
  const [tracks, setTracks] = useState<WrappedTopTrack[]>([]);
  const [artists, setArtists] = useState<WrappedTopArtist[]>([]);
  const [albums, setAlbums] = useState<WrappedTopAlbum[]>([]);
  const [meta, setMeta] = useState<WrappedMeta | null>(null);
  const [genres, setGenres] = useState<{ name: string; pct: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState({
    tracks: false,
    artists: false,
    albums: false,
  });

  const activeWindow = useMemo(
    () => WINDOWS.find((item) => item.value === windowValue) ?? WINDOWS[0],
    [windowValue],
  );

  const selectWindow = (nextWindow: WrappedWindow) => {
    if (nextWindow === windowValue) return;
    setLoading(true);
    setError(null);
    setExpanded({ tracks: false, artists: false, albums: false });
    setWindowValue(nextWindow);
  };

  useEffect(() => {
    document.title = "Wrapped Dashboard · Spotify Atlas";
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tasteRange = WINDOWS.find((w) => w.value === windowValue)?.tasteRange ?? "all";

    Promise.all([
      getWrappedTopTracks(windowValue, 20),
      getWrappedTopArtists(windowValue, 20),
      getWrappedTopAlbums(windowValue, 10),
      getWrappedMeta(windowValue),
      getTasteProfile(1, tasteRange).catch(() => null),
    ])
      .then(([trackData, artistData, albumData, metaData, tasteData]) => {
        if (cancelled) return;
        setTracks(trackData);
        setArtists(artistData);
        setAlbums(albumData);
        setMeta(metaData);

        if (tasteData?.communities?.length) {
          const map = new Map<string, number>();
          for (const c of tasteData.communities) {
            if (!c.archetype) continue;
            const label = genreLabel(c.archetype);
            map.set(label, (map.get(label) ?? 0) + c.percentage);
          }
          const ranked = [...map.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, pct]) => ({ name, pct }));
          // Normalize so bars reflect share of the displayed top set
          const total = ranked.reduce((sum, g) => sum + g.pct, 0) || 1;
          setGenres(
            ranked.map((g) => ({
              name: g.name,
              pct: (g.pct / total) * 100,
            })),
          );
        } else {
          setGenres([]);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load wrapped snapshot");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [windowValue]);

  const topArtist = artists[0];
  const topTrack = tracks[0];
  const topAlbum = albums[0];

  const dateRangeSecondary =
    meta?.start_date && meta?.end_date
      ? `${formatShortDate(meta.start_date)} – ${formatShortDate(meta.end_date)}`
      : "No history yet";

  return (
    <div
      style={{
        background: PAGE_BG,
        minHeight: "100vh",
        position: "relative",
        overflowX: "hidden",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 45% 28% at 82% 0%, rgba(29,185,84,0.06) 0%, transparent 55%)",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          width: "100%",
          maxWidth: 1540,
          margin: "0 auto",
          padding: "24px 40px 48px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxSizing: "border-box",
        }}
      >
        {/* ── Hero banner ──────────────────────────────────────────────────── */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          {/* Ambient bleed behind the hero, centered on the orb, so the hero
              separates from the flat page background rather than sitting flush. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "-15%",
              right: "-4%",
              width: "50%",
              height: "130%",
              pointerEvents: "none",
              zIndex: 0,
              background:
                "radial-gradient(circle, rgba(34,211,238,0.12) 0%, rgba(168,85,247,0.07) 45%, transparent 72%)",
              filter: "blur(6px)",
            }}
          />
          <section
            style={{
              position: "relative",
              zIndex: 1,
              minHeight: 190,
              borderRadius: 20,
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              padding: "28px 36px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
          <HeroNebulaBanner />
          <HeroSpotifyBadge />

          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              paddingRight: 190,
              maxWidth: 760,
            }}
          >
            <div>
              <h1
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 39,
                  color: TEXT,
                  letterSpacing: "-0.02em",
                  margin: 0,
                  lineHeight: 1.05,
                  whiteSpace: "nowrap",
                }}
              >
                Wrapped Dashboard
              </h1>
              <p
                style={{
                  fontFamily: FONT,
                  fontSize: 14,
                  color: TEXT,
                  fontWeight: 600,
                  margin: "12px 0 0",
                  lineHeight: 1.5,
                  maxWidth: 620,
                }}
              >
                Your listening, ranked across any chapter of your history.
              </p>
              <p
                style={{
                  fontFamily: FONT,
                  fontSize: 13,
                  color: MUTED,
                  margin: "4px 0 0",
                  lineHeight: 1.5,
                  maxWidth: 620,
                }}
              >
                Explore your top tracks, artists, albums, and genres across flexible time
                windows.
              </p>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                alignSelf: "flex-start",
                borderRadius: 999,
                border: `1px solid ${CARD_BORDER}`,
                background: "rgba(10,14,26,0.55)",
                padding: 3,
                gap: 2,
              }}
            >
              {WINDOWS.map((option) => {
                const active = option.value === windowValue;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectWindow(option.value)}
                    style={{
                      padding: "6px 15px",
                      border: "none",
                      borderRadius: 999,
                      background: active ? GREEN_BRIGHT : "transparent",
                      color: active ? "#052e16" : MUTED,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      fontFamily: FONT,
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: FONT,
                  fontSize: 11,
                  color: MUTED,
                }}
              >
                <Calendar size={12} color={MUTED} aria-hidden />
                As of {formatDate(meta?.as_of_date ?? meta?.end_date ?? null)}
              </div>
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 600,
                  color: GREEN_BRIGHT,
                  border: `1px solid ${GREEN}66`,
                  borderRadius: 999,
                  padding: "3px 10px",
                  background: "rgba(29,185,84,0.10)",
                }}
              >
                {activeWindow.badge}
              </span>
            </div>
          </div>
          </section>
        </div>

        {/* ── Stat cards ───────────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 16,
            flexShrink: 0,
          }}
          className="wrapped-stat-grid"
        >
          <CompactStatCard
            icon={User}
            iconColor={PURPLE}
            label="Top Artist"
            value={loading ? "—" : topArtist?.artist_name ?? "—"}
            secondary={
              loading
                ? "…"
                : topArtist
                  ? `${topArtist.play_count.toLocaleString()} plays`
                  : "No data"
            }
            imageSrc={loading ? null : topArtist?.artist_image_url ?? null}
            imageShape="circle"
            imageFallback={topArtist?.artist_name}
          />
          <CompactStatCard
            icon={Music2}
            iconColor={GREEN}
            label="Top Track"
            value={loading ? "—" : topTrack?.track_name ?? "—"}
            secondary={loading ? "…" : topTrack?.artist_name ?? "No data"}
            secondaryColor={MUTED}
            tertiary={
              loading
                ? undefined
                : topTrack
                  ? `${topTrack.play_count.toLocaleString()} plays`
                  : undefined
            }
            tertiaryColor={GREEN}
            imageSrc={loading ? null : topTrack?.album_image_url ?? null}
            imageShape="square"
          />
          <CompactStatCard
            icon={Disc3}
            iconColor={BLUE}
            label="Top Album"
            value={loading ? "—" : topAlbum?.album_name ?? "—"}
            secondary={loading ? "…" : topAlbum?.artist_name ?? "No data"}
            secondaryColor={MUTED}
            tertiary={
              loading
                ? undefined
                : topAlbum
                  ? `${topAlbum.track_count.toLocaleString()} tracks`
                  : undefined
            }
            tertiaryColor={BLUE}
            imageSrc={loading ? null : topAlbum?.album_image_url ?? null}
            imageShape="square"
          />
          <CompactStatCard
            icon={Calendar}
            iconColor={ORANGE}
            label="Snapshot Window"
            value={activeWindow.label}
            secondary={dateRangeSecondary}
            secondaryColor={MUTED}
            tertiary={`Ranked entries: Top ${Math.max(tracks.length, artists.length, 20)}`}
            tertiaryColor={ORANGE}
          />
        </div>

        {error && (
          <div
            style={{
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 10,
              padding: "8px 12px",
              flexShrink: 0,
            }}
          >
            <p style={{ fontFamily: FONT, fontSize: 12, color: "#f87171", margin: 0 }}>
              {error}
            </p>
          </div>
        )}

        {/* ── Ranked lists (size to content, no empty stretch) ─────────────── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 16,
            flexShrink: 0,
            alignItems: "start",
          }}
          className="wrapped-lists-grid"
        >
          <RankedListCard
            title="Top Tracks"
            icon={Music2}
            iconColor={GREEN}
            accentColor={GREEN_BRIGHT}
            items={tracks}
            loading={loading}
            emptyMessage="No listening history is available for this window yet."
            expanded={expanded.tracks}
            onToggleExpand={() =>
              setExpanded((prev) => ({ ...prev, tracks: !prev.tracks }))
            }
            footerLabel="See all Top Tracks →"
            renderImage={(item) => (
              <ImageWithFallback
                src={item.album_image_url}
                alt={item.album_name ?? item.track_name}
                size={34}
                shape="square"
              />
            )}
            renderPrimary={(item) => item.track_name}
            renderSecondary={(item) =>
              item.album_name
                ? `${item.artist_name} · ${item.album_name}`
                : item.artist_name
            }
            renderTrailing={(item) => `${item.play_count} plays`}
          />

          <RankedListCard
            title="Top Artists"
            icon={User}
            iconColor={PURPLE}
            accentColor={PURPLE}
            items={artists}
            loading={loading}
            emptyMessage="No listening history is available for this window yet."
            expanded={expanded.artists}
            onToggleExpand={() =>
              setExpanded((prev) => ({ ...prev, artists: !prev.artists }))
            }
            footerLabel="See all Top Artists →"
            renderImage={(item) => (
              <ImageWithFallback
                src={item.artist_image_url}
                alt={item.artist_name}
                size={34}
                shape="circle"
                fallbackText={item.artist_name}
              />
            )}
            renderPrimary={(item) => item.artist_name}
            renderTrailing={(item) => `${item.play_count} plays`}
          />

          <RankedListCard
            title="Top Albums"
            icon={Disc3}
            iconColor={BLUE}
            accentColor={BLUE}
            items={albums}
            loading={loading}
            emptyMessage="No album data is available for this window yet."
            expanded={expanded.albums}
            onToggleExpand={() =>
              setExpanded((prev) => ({ ...prev, albums: !prev.albums }))
            }
            footerLabel="See all Top Albums →"
            renderImage={(item) => (
              <ImageWithFallback
                src={item.album_image_url}
                alt={item.album_name}
                size={34}
                shape="square"
              />
            )}
            renderPrimary={(item) => item.album_name}
            renderSecondary={(item) => item.artist_name}
            renderTrailing={(item) => `${item.track_count} tracks`}
          />
        </section>

        {/* ── Bottom row ───────────────────────────────────────────────────── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "0.9fr 1.15fr 1.15fr",
            gap: 16,
            flexShrink: 0,
          }}
          className="wrapped-bottom-grid"
        >
          {/* Top Genres */}
          <div
            style={{
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 16,
              boxShadow: CARD_SHADOW,
              padding: "22px 24px",
              minHeight: 220,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Tag size={16} color={GREEN} strokeWidth={2.25} aria-hidden />
                <h2
                  style={{
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: 16,
                    color: TEXT,
                    margin: 0,
                  }}
                >
                  Top Genres
                </h2>
              </div>
              <Link
                href="/communities"
                style={{
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#8fa2b8",
                  textDecoration: "none",
                  border: "1px solid rgba(148,163,184,0.14)",
                  borderRadius: 999,
                  padding: "6px 10px",
                }}
              >
                View all
              </Link>
            </div>

            {loading ? (
              <LoadingRows count={5} />
            ) : genres.length === 0 ? (
              <EmptyState message="Genre mix will appear once taste communities are available." />
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                }}
              >
                {genres.map((genre, index) => {
                  const color = GENRE_BAR_COLORS[index % GENRE_BAR_COLORS.length];
                  // Absolute share of the top-genre set (already normalized 0–100)
                  const widthPct = Math.max(4, Math.min(100, genre.pct));
                  return (
                    <li key={genre.name} style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: FONT,
                            fontSize: 12,
                            fontWeight: 600,
                            color: TEXT,
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {genre.name}
                        </span>
                        <span
                          style={{
                            fontFamily: FONT,
                            fontSize: 11,
                            fontWeight: 600,
                            color: TEXT,
                            flexShrink: 0,
                          }}
                        >
                          {Math.round(genre.pct)}%
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: 6,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.06)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${widthPct}%`,
                            minWidth: widthPct > 0 ? 8 : 0,
                            height: "100%",
                            borderRadius: 999,
                            background: color,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Listening History Notes */}
          <div
            style={{
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 16,
              boxShadow: CARD_SHADOW,
              padding: "22px 24px",
              minHeight: 220,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Sparkles size={16} color={GREEN} strokeWidth={2.25} aria-hidden />
              <h2
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 16,
                  color: TEXT,
                  margin: 0,
                }}
              >
                Listening History Notes
              </h2>
            </div>

            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 7,
                flex: 1,
              }}
            >
              {LISTENING_NOTES.map((note) => (
                <li
                  key={note}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: "50%",
                      background: "rgba(29,185,84,0.16)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <Check size={9} color={GREEN_BRIGHT} strokeWidth={3} aria-hidden />
                  </span>
                  <span
                    style={{
                      fontFamily: FONT,
                      fontSize: 11,
                      color: TEXT,
                      lineHeight: 1.4,
                    }}
                  >
                    {note}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              href="#about-data"
              style={{
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 600,
                color: "#8fa2b8",
                textDecoration: "none",
                marginTop: 12,
                display: "inline-block",
              }}
            >
              Learn more about your listening history import →
            </Link>
          </div>

          {/* About This Data */}
          <div
            id="about-data"
            style={{
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 16,
              boxShadow: CARD_SHADOW,
              padding: "22px 24px",
              minHeight: 220,
              minWidth: 0,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Info size={16} color={PURPLE} strokeWidth={2.25} aria-hidden />
              <h2
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 16,
                  color: TEXT,
                  margin: 0,
                }}
              >
                About This Data
              </h2>
            </div>

            <p
              style={{
                fontFamily: FONT,
                fontSize: 11,
                color: MUTED,
                lineHeight: 1.45,
                margin: "0 0 10px",
                maxWidth: "88%",
              }}
            >
              This dashboard is built from your imported Spotify Extended Streaming History
              rather than a temporary ranked Spotify snapshot. Use the time selector above to
              recalculate this Wrapped view across different ranges of the same full dataset.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                position: "relative",
                zIndex: 1,
              }}
            >
              {[
                { icon: Disc3, text: "Source: Spotify Extended Streaming History" },
                { icon: Music2, text: "Scope: All imported listening events" },
                { icon: Calendar, text: "View: Recomputed from your full dataset" },
              ].map((row) => (
                <div
                  key={row.text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: FONT,
                    fontSize: 10,
                    color: MUTED,
                  }}
                >
                  <row.icon size={11} color={MUTED} aria-hidden />
                  {row.text}
                </div>
              ))}
            </div>

            <OrbitDecoration />
          </div>
        </section>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .wrapped-stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .wrapped-lists-grid,
          .wrapped-bottom-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 640px) {
          .wrapped-stat-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
