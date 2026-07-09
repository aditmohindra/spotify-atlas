"use client";

import { useState } from "react";

export interface ImageWithFallbackProps {
  src: string | null | undefined;
  alt: string;
  /** Square size in px (width and height are equal). */
  size: number;
  shape: "square" | "circle";
  /** First letter is shown when there's no image; used for artists. */
  fallbackText?: string;
}

const FALLBACK_BG = "#1a2332";
const FALLBACK_FG = "rgba(255,255,255,0.4)";

function MusicNoteIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.42);
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z"
        stroke={FALLBACK_FG}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Album/artist thumbnail with a dark placeholder fallback for missing or
 * failed images (iTunes-sourced art doesn't cover every track/artist).
 */
export function ImageWithFallback({ src, alt, size, shape, fallbackText }: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);
  const borderRadius = shape === "circle" ? 9999 : 8;

  if (!src || failed) {
    return (
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: size, height: size, minWidth: size, background: FALLBACK_BG, borderRadius }}
      >
        {fallbackText ? (
          <span
            className="font-ui font-semibold uppercase"
            style={{ color: FALLBACK_FG, fontSize: Math.round(size * 0.4), lineHeight: 1 }}
          >
            {fallbackText.charAt(0)}
          </span>
        ) : (
          <MusicNoteIcon size={size} />
        )}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="object-cover shrink-0"
      style={{ width: size, height: size, minWidth: size, borderRadius }}
      onError={() => setFailed(true)}
    />
  );
}
