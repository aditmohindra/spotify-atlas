"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

// ── Theme (matches /map NavBar + /communities dark shell) ─────────────────────

const SIDEBAR_BG = "#0a0e1a";
const BORDER = "rgba(148, 163, 184, 0.12)";
const TEXT = "#f1f5f9";
const MUTED = "#94a3b8";
const ACTIVE_BG = "rgba(29, 185, 84, 0.16)";
const ACTIVE_TEXT = "#4ade80";
const HOVER_BG = "rgba(255, 255, 255, 0.05)";
const FONT = "var(--font-dm-sans), system-ui, sans-serif";

// ── Icons ─────────────────────────────────────────────────────────────────────

function GalaxyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9h16.8M3.6 15h16.8" />
      <path d="M12 3c1.8 2.4 2.8 5.1 2.8 9s-1 6.6-2.8 9c-1.8-2.4-2.8-5.1-2.8-9s1-6.6 2.8-9z" />
    </svg>
  );
}

function CommunitiesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function TimelineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />
    </svg>
  );
}

function WrappedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="8" width="18" height="13" rx="1.5" />
      <path d="M3 8h18M12 8v13M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Atlas",       href: "/map",         icon: <GalaxyIcon /> },
  { label: "Communities", href: "/communities", icon: <CommunitiesIcon /> },
  { label: "Timeline",    href: "/timeline",    icon: <TimelineIcon /> },
  { label: "Wrapped",     href: "/wrapped",     icon: <WrappedIcon /> },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

export interface SidebarProps {
  /** Render as 64px icon-only strip (used on /map for max canvas space). */
  compact?: boolean;
}

export default function Sidebar({ compact = false }: SidebarProps) {
  const pathname = usePathname();
  const [trackTotal, setTrackTotal] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/map`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d: { total: number }) => setTrackTotal(d.total))
      .catch(() => {});
  }, []);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (pathname.startsWith(href + "/")) return true;
    // /community/[id] should highlight the Communities nav item
    if (href === "/communities" && pathname.startsWith("/community/")) return true;
    return false;
  };

  const width = compact ? 64 : 220;

  return (
    <aside
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width,
        height: "100%",
        background: SIDEBAR_BG,
        borderRight: `1px solid ${BORDER}`,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          padding: compact ? "0 20px" : "0 20px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          aria-label="Spotify Atlas home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          {/* Green orb */}
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "#1db954",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{ width: 9, height: 9, borderRadius: "50%", background: "#ffffff" }}
            />
          </span>

          {!compact && (
            <span
              style={{
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: "14.5px",
                color: TEXT,
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
              }}
            >
              Spotify Atlas
            </span>
          )}
        </Link>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav
        style={{
          padding: compact ? "10px 8px" : "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flexShrink: 0,
        }}
      >
        {NAV_ITEMS.map(({ label, href, icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={compact ? label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: compact ? "center" : "flex-start",
                gap: compact ? 0 : 10,
                padding: compact ? "10px 0" : "9px 10px",
                borderRadius: 12,
                textDecoration: "none",
                background: active ? ACTIVE_BG : "transparent",
                color: active ? ACTIVE_TEXT : MUTED,
                fontFamily: FONT,
                fontSize: 13.5,
                fontWeight: active ? 600 : 400,
                transition: "background 0.12s, color 0.12s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = HOVER_BG;
                  (e.currentTarget as HTMLElement).style.color = TEXT;
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = MUTED;
                }
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "inherit",
                }}
              >
                {icon}
              </span>
              {!compact && label}
            </Link>
          );
        })}
      </nav>

      {/* ── Spacer ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1 }} />

      {/* ── User section ─────────────────────────────────────────────────── */}
      <div
        style={{
          padding: compact ? "12px 0" : "12px 16px",
          borderTop: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: compact ? "center" : "flex-start",
          gap: compact ? 0 : 10,
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: ACTIVE_BG,
            border: `1px solid rgba(29, 185, 84, 0.28)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              color: ACTIVE_TEXT,
              userSelect: "none",
            }}
          >
            A
          </span>
        </div>

        {!compact && (
          <div>
            <p
              style={{
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: 500,
                color: TEXT,
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              @adit
            </p>
            <p
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 11,
                color: MUTED,
                lineHeight: 1.2,
                marginTop: 1,
                marginBottom: 0,
              }}
            >
              {trackTotal !== null
                ? `${trackTotal.toLocaleString()} tracks`
                : "—"}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
