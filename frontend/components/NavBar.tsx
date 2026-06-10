"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api";

const NAV_LINKS = [
  { label: "Identity", href: "/identity" },
  { label: "Galaxy", href: "/map" },
  { label: "Communities", href: "/communities" },
  { label: "Insights", href: "/insights" },
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
    <header className="fixed top-0 inset-x-0 z-50 h-16 bg-surface border-b border-border">
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
          <span className="font-ui font-semibold text-ink text-[15px] tracking-tight leading-none">
            Spotify Atlas
          </span>
        </Link>

        {/* Center nav */}
        <nav className="flex-1 flex items-center justify-center gap-0.5">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-4 py-[7px] rounded-full text-[13.5px] font-ui transition-colors duration-150",
                isActive(href)
                  ? "bg-green-soft text-green-dark font-semibold"
                  : "text-muted hover:text-ink hover:bg-surface-soft font-medium",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right: track pill + avatar */}
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={cn(
              "font-stat text-[12.5px] border border-border rounded-full px-3 py-[5px] leading-none transition-colors duration-300",
              trackTotal !== null ? "text-muted" : "text-faint",
            )}
          >
            {trackTotal !== null
              ? `${trackTotal.toLocaleString()} tracks`
              : "— tracks"}
          </span>
          <div
            className="w-8 h-8 rounded-full bg-green-soft border border-border flex items-center justify-center shrink-0"
            aria-label="User account"
          >
            <span className="text-green-dark text-[11px] font-semibold font-ui select-none">
              U
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
