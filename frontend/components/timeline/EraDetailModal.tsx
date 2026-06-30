"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Era, EraDepth } from "@/lib/types";
import { EraDepthContent } from "./EraDepthContent";
import { EraEditForm } from "./EraEditForm";

export interface EraDetailModalProps {
  open: boolean;
  era: Era | null;
  depth: EraDepth | null;
  depthLoading: boolean;
  depthError: string | null;
  onClose: () => void;
  onEraUpdate: (eraId: number, patch: Partial<Era>) => void;
}

export function EraDetailModal({
  open,
  era,
  depth,
  depthLoading,
  depthError,
  onClose,
  onEraUpdate,
}: EraDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), 280);
    return () => window.clearTimeout(timer);
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!mounted || !era) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="era-modal-title"
    >
      <button
        type="button"
        aria-label="Close era details"
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
          className="relative w-full max-w-3xl pointer-events-auto transition-all duration-300 ease-out my-auto"
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
              style={{ background: "#1db954" }}
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

            <div className="relative pl-8 pr-6 py-8 md:pl-10 md:pr-10 md:py-10 max-h-[min(85vh,900px)] overflow-y-auto">
              {depthLoading && (
                <div className="space-y-4 animate-pulse">
                  <div className="h-8 w-48 rounded-lg" style={{ background: "#1e293b" }} />
                  <div className="h-32 rounded-xl" style={{ background: "#1e293b" }} />
                  <div className="h-48 rounded-xl" style={{ background: "#1e293b" }} />
                </div>
              )}

              {!depthLoading && depth && (
                <>
                  <div className="mb-6">
                    <EraEditForm era={era} onUpdate={onEraUpdate} />
                  </div>
                  <div id="era-modal-title">
                    <EraDepthContent era={era} depth={depth} showFullLink />
                  </div>
                </>
              )}

              {!depthLoading && !depth && (
                <p className="font-ui text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {depthError ?? "Could not load era details."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
