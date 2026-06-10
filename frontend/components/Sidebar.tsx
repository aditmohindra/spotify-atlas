"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

// ── Icons ─────────────────────────────────────────────────────────────────────

function IdentityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" />
    </svg>
  );
}

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

function InsightsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 17l4-6 4 4 4-7 4 3" />
      <path d="M3 21h18" />
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
  { label: "Identity",    href: "/identity",    icon: <IdentityIcon /> },
  { label: "Galaxy",      href: "/map",         icon: <GalaxyIcon /> },
  { label: "Communities", href: "/communities", icon: <CommunitiesIcon /> },
  { label: "Insights",    href: "/insights",    icon: <InsightsIcon /> },
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
        background: "#ffffff",
        borderRight: "1px solid #dde6dd",
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
          borderBottom: "1px solid #dde6dd",
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
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontWeight: 600,
                fontSize: "14.5px",
                color: "#101828",
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
                background: active ? "#f0fdf4" : "transparent",
                color: active ? "#166534" : "#374151",
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 13.5,
                fontWeight: active ? 500 : 400,
                transition: "background 0.12s, color 0.12s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
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
                  color: active ? "#166534" : "#6b7280",
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
          borderTop: "1px solid #dde6dd",
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
            background: "#e8f8ef",
            border: "1px solid #dde6dd",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              color: "#166534",
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
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: "#101828",
                lineHeight: 1.2,
              }}
            >
              @adit
            </p>
            <p
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 11,
                color: "#6b7280",
                lineHeight: 1.2,
                marginTop: 1,
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
