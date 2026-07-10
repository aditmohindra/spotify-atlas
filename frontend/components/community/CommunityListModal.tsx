"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import type { CommunityAllArtist, CommunityAllTrack } from "@/lib/types";

function SpotifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#1db954" />
      <path
        d="M7.5 15.5c2.5-1 5.5-.8 8 .8M7 12.5c3-1.2 6.5-1 9 .8M7.5 9.5c3.5-1.5 7.5-1.2 10 .8"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface CommunityListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: CommunityAllArtist[] | CommunityAllTrack[];
  type: "artists" | "tracks";
  /** Accent color for the left rail and glow — defaults to Spotify green. */
  accentColor?: string;
}

export function CommunityListModal({
  isOpen,
  onClose,
  title,
  items,
  type,
  accentColor = "#1db954",
}: CommunityListModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setSearch("");
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), 280);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    if (type === "artists") {
      return (items as CommunityAllArtist[]).filter((a) =>
        a.name.toLowerCase().includes(q),
      );
    }
    return (items as CommunityAllTrack[]).filter(
      (t) => t.name.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q),
    );
  }, [items, search, type]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="community-list-modal-title"
    >
      <button
        type="button"
        aria-label={`Close ${title}`}
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{
          background: "rgba(8, 12, 20, 0.62)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          opacity: visible ? 1 : 0,
        }}
        onClick={onClose}
      />

      <div
        className="absolute inset-0 flex items-center justify-center p-4 sm:p-8 pointer-events-none overflow-y-auto"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div
          className="relative w-full max-w-2xl pointer-events-auto transition-all duration-300 ease-out my-auto"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "scale(1) translateY(0)" : "scale(0.96) translateY(12px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="relative rounded-[28px] overflow-hidden shadow-2xl"
            style={{
              background: "#0f172a",
              boxShadow:
                "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06), 0 0 120px rgba(29,185,84,0.08)",
            }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ background: accentColor }}
              aria-hidden
            />

            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 85% 0%, rgba(29,185,84,0.14) 0%, transparent 55%)",
              }}
            />

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-5 right-5 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              style={{
                color: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M1 1l12 12M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="relative pl-8 pr-6 py-8 md:pl-10 md:pr-10 md:py-9 max-h-[min(85vh,900px)] flex flex-col">
              {/* Header */}
              <div className="mb-5 pr-10 shrink-0">
                <h2
                  id="community-list-modal-title"
                  className="font-hero"
                  style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", color: "#ffffff", letterSpacing: "-0.01em" }}
                >
                  {title}
                </h2>
                <p className="font-stat text-xs mt-1 tabular-nums" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {items.length} {type === "artists" ? "artists" : "tracks"}
                </p>
              </div>

              {/* Search */}
              <div className="mb-4 shrink-0">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={type === "artists" ? "Search artists…" : "Search tracks or artists…"}
                  autoFocus
                  className="w-full font-ui text-sm rounded-xl px-4 py-2.5 focus:outline-none transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#ffffff",
                  }}
                />
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-1.5">
                {filtered.length === 0 ? (
                  <p
                    className="font-ui text-sm text-center py-10"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    No results for &ldquo;{search}&rdquo;
                  </p>
                ) : type === "artists" ? (
                  (filtered as CommunityAllArtist[]).map((artist, idx) => (
                    <div
                      key={`${artist.name}-${idx}`}
                      className="flex items-center gap-4 px-4 py-2.5 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <span
                        className="font-stat text-sm tabular-nums w-7 text-right shrink-0"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                      >
                        {idx + 1}
                      </span>
                      <ImageWithFallback
                        src={artist.artist_image_url}
                        alt={artist.name}
                        size={40}
                        shape="circle"
                        fallbackText={artist.name}
                      />
                      <span
                        className="font-ui font-medium text-sm flex-1 min-w-0 truncate"
                        style={{ color: "#f1f5f9" }}
                      >
                        {artist.name}
                      </span>
                      <span
                        className="font-stat text-xs tabular-nums shrink-0"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        {artist.track_count.toLocaleString()} tracks
                      </span>
                    </div>
                  ))
                ) : (
                  (filtered as CommunityAllTrack[]).map((track, idx) => (
                    <div
                      key={`${track.spotify_id}-${idx}`}
                      className="group flex items-center gap-3 px-4 py-2.5 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <span
                        className="font-stat text-xs tabular-nums w-6 text-right shrink-0"
                        style={{ color: "rgba(255,255,255,0.25)" }}
                      >
                        {idx + 1}
                      </span>
                      <ImageWithFallback
                        src={track.album_image_url}
                        alt={track.name}
                        size={40}
                        shape="square"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-ui font-medium text-sm truncate leading-tight"
                          style={{ color: "#f1f5f9" }}
                        >
                          {track.name}
                        </p>
                        <p
                          className="font-ui text-xs truncate mt-0.5"
                          style={{ color: "rgba(255,255,255,0.4)" }}
                        >
                          {track.artist}
                        </p>
                      </div>
                      <a
                        href={`https://open.spotify.com/track/${track.spotify_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Open on Spotify"
                        aria-label={`Open ${track.name} on Spotify`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SpotifyIcon />
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
