"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

const NAV_LINKS = [
  { label: "Atlas", href: "/map" },
  { label: "Communities", href: "/communities" },
  { label: "Timeline", href: "/timeline" },
  { label: "Wrapped", href: "/wrapped" },
] as const;

export default function NavBar() {
  const pathname = usePathname();
  const [trackTotal, setTrackTotal] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/map`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d: { total: number }) => setTrackTotal(d.total))
      .catch(() => {});
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 h-16"
      style={{
        background: "rgba(5, 10, 20, 0.94)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
      }}
    >
      <div className="h-full max-w-screen-xl mx-auto px-6 flex items-center gap-6">
        {/* Wordmark */}
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 group"
          aria-label="Spotify Atlas home"
        >
          <span className="w-[22px] h-[22px] rounded-full bg-green flex items-center justify-center shadow-sm group-hover:shadow-green transition-shadow duration-150">
            <span className="w-[9px] h-[9px] rounded-full bg-white" />
          </span>
          <span className="font-ui font-semibold text-[15px] tracking-tight leading-none" style={{ color: "#f1f5f9" }}>
            Spotify Atlas
          </span>
        </Link>

        {/* Center nav */}
        <nav className="flex-1 flex items-center justify-center gap-0.5">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="px-4 py-[7px] rounded-full text-[13.5px] font-ui font-medium transition-colors duration-150"
              style={
                isActive(href)
                  ? { background: "rgba(29, 185, 84, 0.16)", color: "#4ade80", fontWeight: 600 }
                  : { color: "#94a3b8" }
              }
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right: track pill + avatar */}
        <div className="flex items-center gap-3 shrink-0">
          <span
            className="font-stat text-[12.5px] rounded-full px-3 py-[5px] leading-none flex items-center gap-1"
            style={{ background: "rgba(29, 185, 84, 0.14)", color: "#4ade80", border: "1px solid rgba(74, 222, 128, 0.22)" }}
          >
            <span style={{ fontWeight: 700, marginRight: 1 }}>+</span>
            {trackTotal !== null
              ? `${trackTotal.toLocaleString()} tracks`
              : "— tracks"}
          </span>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(148, 163, 184, 0.12)", border: "1px solid rgba(148, 163, 184, 0.24)" }}
            aria-label="User account"
          >
            <span className="text-[11px] font-semibold font-ui select-none" style={{ color: "#e2e8f0" }}>
              A
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
