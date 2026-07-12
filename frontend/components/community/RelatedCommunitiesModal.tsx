"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { RelatedCommunity } from "@/lib/types";

export interface RelatedCommunitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  items: RelatedCommunity[];
  accentColor?: string;
}

export function RelatedCommunitiesModal({
  isOpen,
  onClose,
  title = "Related Communities",
  items,
  accentColor = "#1db954",
}: RelatedCommunitiesModalProps) {
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
    return items.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.canonical_name ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="related-communities-modal-title"
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

      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8 pointer-events-none overflow-y-auto">
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
                "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
            }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ background: accentColor }}
              aria-hidden
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
              <div className="mb-5 pr-10 shrink-0">
                <h2
                  id="related-communities-modal-title"
                  className="font-hero"
                  style={{
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    color: "#ffffff",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {title}
                </h2>
                <p
                  className="font-stat text-xs mt-1 tabular-nums"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  {items.length} communities
                </p>
              </div>

              <div className="mb-4 shrink-0">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search communities…"
                  className="w-full font-ui text-sm rounded-xl px-4 py-2.5 outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#ffffff",
                  }}
                />
              </div>

              <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
                {filtered.length === 0 ? (
                  <p className="font-ui text-sm py-8 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                    No matches
                  </p>
                ) : (
                  filtered.map((rel) => (
                    <Link
                      key={rel.cluster_id}
                      href={`/community/${rel.cluster_id}`}
                      onClick={onClose}
                      className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="min-w-0">
                        <p className="font-ui text-sm font-medium truncate" style={{ color: "#f9fafb" }}>
                          {rel.name}
                        </p>
                        <p className="font-ui text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {rel.canonical_name}
                        </p>
                      </div>
                      <span
                        className="font-stat text-sm font-semibold tabular-nums shrink-0"
                        style={{ color: accentColor }}
                      >
                        {Math.round(rel.similarity * 100)}%
                      </span>
                    </Link>
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
