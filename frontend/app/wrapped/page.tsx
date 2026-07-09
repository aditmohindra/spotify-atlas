"use client";

import { useEffect, useMemo, useState } from "react";

import { AtlasCard } from "@/components/atlas/AtlasCard";
import { PageShell } from "@/components/atlas/PageShell";
import { SectionHeader } from "@/components/atlas/SectionHeader";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import {
  getWrappedMeta,
  getWrappedTopAlbums,
  getWrappedTopArtists,
  getWrappedTopTracks,
} from "@/lib/api";
import type {
  WrappedMeta,
  WrappedTopAlbum,
  WrappedTopArtist,
  WrappedTopTrack,
  WrappedWindow,
} from "@/lib/types";

const WINDOWS: { label: string; value: WrappedWindow; description: string }[] = [
  { label: "Last 4 Weeks", value: "short_term", description: "Spotify short-term snapshot" },
  { label: "Last 6 Months", value: "medium_term", description: "Spotify medium-term snapshot" },
  { label: "All Time", value: "long_term", description: "Spotify long-term snapshot" },
];

function formatAsOfDate(value: string | null): string {
  if (!value) return "No snapshot yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown refresh date";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-atlas-md"
          style={{
            height: 54,
            background: "#eef2ec",
            border: "1px solid #e4e7ec",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="font-ui text-sm leading-relaxed" style={{ color: "#667085" }}>
      {message}
    </p>
  );
}

function RankedList<T>({
  items,
  renderImage,
  renderPrimary,
  renderSecondary,
  renderTrailing,
}: {
  items: T[];
  renderImage?: (item: T) => React.ReactNode;
  renderPrimary: (item: T) => string;
  renderSecondary?: (item: T) => string | null;
  renderTrailing?: (item: T) => string | null;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-center gap-3 px-3 py-3 rounded-atlas-md"
          style={{
            background: "#ffffff",
            border: "1px solid #e4e7ec",
          }}
        >
          <span
            className="font-stat text-xs tabular-nums w-5 shrink-0"
            style={{ color: "#1db954" }}
          >
            {index + 1}
          </span>
          {renderImage && renderImage(item)}
          <div className="min-w-0 flex-1">
            <p className="font-ui text-sm truncate" style={{ color: "#101828" }}>
              {renderPrimary(item)}
            </p>
            {renderSecondary && (
              <p className="font-ui text-xs truncate mt-0.5" style={{ color: "#667085" }}>
                {renderSecondary(item)}
              </p>
            )}
          </div>
          {renderTrailing && (
            <span
              className="font-stat text-xs tabular-nums shrink-0"
              style={{ color: "#475467" }}
            >
              {renderTrailing(item)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function WrappedPage() {
  const [windowValue, setWindowValue] = useState<WrappedWindow>("short_term");
  const [tracks, setTracks] = useState<WrappedTopTrack[]>([]);
  const [artists, setArtists] = useState<WrappedTopArtist[]>([]);
  const [albums, setAlbums] = useState<WrappedTopAlbum[]>([]);
  const [meta, setMeta] = useState<WrappedMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectWindow = (nextWindow: WrappedWindow) => {
    if (nextWindow === windowValue) return;
    setLoading(true);
    setError(null);
    setWindowValue(nextWindow);
  };

  useEffect(() => {
    document.title = "Wrapped Dashboard · Spotify Atlas";
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getWrappedTopTracks(windowValue, 20),
      getWrappedTopArtists(windowValue, 20),
      getWrappedTopAlbums(windowValue, 10),
      getWrappedMeta(windowValue),
    ])
      .then(([trackData, artistData, albumData, metaData]) => {
        if (cancelled) return;
        setTracks(trackData);
        setArtists(artistData);
        setAlbums(albumData);
        setMeta(metaData);
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

  const activeWindow = useMemo(
    () => WINDOWS.find((item) => item.value === windowValue) ?? WINDOWS[0],
    [windowValue],
  );

  return (
    <div style={{ background: "#f7f8f5", minHeight: "100vh" }}>
      <PageShell maxWidth="xl" className="space-y-8">
        <AtlasCard
          variant="hero"
          padding="lg"
          style={{
            background: "#101828",
            borderColor: "#1f2937",
            color: "#ffffff",
          }}
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <span className="text-eyebrow" style={{ color: "#4ade80" }}>
                Wrapped Dashboard
              </span>
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1
                    className="font-hero leading-tight"
                    style={{
                      fontSize: "clamp(2rem, 4vw, 3.25rem)",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    Your current Spotify top snapshot
                  </h1>
                  <p
                    className="font-ui text-sm mt-3 max-w-3xl leading-relaxed"
                    style={{ color: "rgba(255,255,255,0.72)" }}
                  >
                    This view reflects Spotify&apos;s latest ranked snapshot for each window, not
                    a historical playback timeline. Use the as-of date below to see how fresh the
                    current snapshot is.
                  </p>
                </div>
                <div
                  className="font-ui text-xs px-3 py-2 rounded-full self-start md:self-auto"
                  style={{
                    background: "rgba(29,185,84,0.14)",
                    border: "1px solid rgba(74,222,128,0.24)",
                    color: "#86efac",
                  }}
                >
                  {activeWindow.description}
                </div>
              </div>
            </div>

            <div
              className="inline-flex items-center self-start"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 20,
                overflow: "hidden",
              }}
            >
              {WINDOWS.map((option, index) => {
                const active = option.value === windowValue;
                return (
                  <button
                    key={option.value}
                    onClick={() => selectWindow(option.value)}
                    style={{
                      padding: "8px 16px",
                      border: "none",
                      borderRight:
                        index < WINDOWS.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                      background: active ? "#f0fdf4" : "transparent",
                      color: active ? "#166534" : "rgba(255,255,255,0.72)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <p className="font-ui text-sm" style={{ color: "rgba(255,255,255,0.72)" }}>
              As of{" "}
              <span style={{ color: "#ffffff", fontWeight: 600 }}>
                {formatAsOfDate(meta?.as_of_date ?? null)}
              </span>
            </p>
          </div>
        </AtlasCard>

        {error && (
          <AtlasCard variant="default" padding="md">
            <p className="font-ui text-sm" style={{ color: "#b42318" }}>
              {error}
            </p>
          </AtlasCard>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <AtlasCard variant="default" padding="lg">
            <div className="space-y-5">
              <SectionHeader
                eyebrow="Snapshot"
                title="Top Tracks"
                subtitle="Spotify-ranked tracks for the selected window."
              />
              {loading ? (
                <LoadingRows count={8} />
              ) : tracks.length === 0 ? (
                <EmptyState message="No top-track snapshot is available for this window yet." />
              ) : (
                <RankedList
                  items={tracks}
                  renderImage={(item) => (
                    <ImageWithFallback
                      src={item.album_image_url}
                      alt={item.album_name ?? item.track_name}
                      size={40}
                      shape="square"
                    />
                  )}
                  renderPrimary={(item) => item.track_name}
                  renderSecondary={(item) =>
                    item.album_name
                      ? `${item.artist_name} · ${item.album_name}`
                      : item.artist_name
                  }
                />
              )}
            </div>
          </AtlasCard>

          <AtlasCard variant="default" padding="lg">
            <div className="space-y-5">
              <SectionHeader
                eyebrow="Snapshot"
                title="Top Artists"
                subtitle="Derived from the same ranked top-track snapshot."
              />
              {loading ? (
                <LoadingRows count={8} />
              ) : artists.length === 0 ? (
                <EmptyState message="No top-artist snapshot is available for this window yet." />
              ) : (
                <RankedList
                  items={artists}
                  renderImage={(item) => (
                    <ImageWithFallback
                      src={item.artist_image_url}
                      alt={item.artist_name}
                      size={40}
                      shape="circle"
                      fallbackText={item.artist_name}
                    />
                  )}
                  renderPrimary={(item) => item.artist_name}
                />
              )}
            </div>
          </AtlasCard>

          <AtlasCard variant="default" padding="lg">
            <div className="space-y-5">
              <SectionHeader
                eyebrow="Derived"
                title="Top Albums"
                subtitle="Ranked by how many selected top tracks belong to each album."
              />
              {loading ? (
                <LoadingRows count={6} />
              ) : albums.length === 0 ? (
                <EmptyState message="No album snapshot is available for this window yet." />
              ) : (
                <RankedList
                  items={albums}
                  renderImage={(item) => (
                    <ImageWithFallback
                      src={item.album_image_url}
                      alt={item.album_name}
                      size={40}
                      shape="square"
                    />
                  )}
                  renderPrimary={(item) => item.album_name}
                  renderSecondary={(item) => item.artist_name}
                  renderTrailing={(item) => `${item.track_count} tracks`}
                />
              )}
            </div>
          </AtlasCard>
        </div>
      </PageShell>
    </div>
  );
}
