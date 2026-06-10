import Link from "next/link";
import { AtlasCard } from "@/components/atlas/AtlasCard";

export default function LandingPage() {
  return (
    <div className="pt-16 min-h-screen flex flex-col bg-background">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 py-28 overflow-hidden">
        {/* Decorative radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(29,185,84,0.10) 0%, transparent 70%)",
          }}
        />

        {/* Eyebrow */}
        <p className="text-eyebrow mb-5 relative z-10">
          Your musical universe, mapped
        </p>

        {/* Headline */}
        <h1
          className="font-hero text-ink relative z-10 max-w-3xl"
          style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", lineHeight: 1.1, letterSpacing: "-0.02em" }}
        >
          The map of your
          <br />
          <span style={{ color: "var(--green)" }}>musical identity.</span>
        </h1>

        {/* Sub-headline */}
        <p
          className="font-ui text-ink relative z-10 max-w-xl mt-6"
          style={{ fontSize: "1.0625rem", lineHeight: 1.65, opacity: 0.72 }}
        >
          Spotify Atlas turns your listening history into a living map of your
          taste, your communities, and the hidden worlds you keep returning to.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-10 relative z-10">
          <Link
            href="/identity"
            className="inline-flex items-center gap-2 h-12 px-7 rounded-atlas-md bg-green text-white text-[15px] font-ui font-semibold shadow-sm hover:bg-green-dark active:scale-[0.98] transition-all duration-150"
          >
            Explore Your Atlas
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2.5 7h9M7.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link
            href="/map"
            className="inline-flex items-center gap-2 h-12 px-7 rounded-atlas-md bg-surface text-ink text-[15px] font-ui font-medium border border-border shadow-card hover:bg-surface-soft active:scale-[0.98] transition-all duration-150"
          >
            View the Galaxy
          </Link>
        </div>
      </section>

      {/* ── Feature cards ──────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 max-w-screen-lg mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Identity */}
          <AtlasCard variant="default" padding="lg" hoverable className="flex flex-col gap-4 group">
            <div className="w-10 h-10 rounded-atlas-sm bg-green-soft flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <circle cx="9" cy="6.5" r="3" stroke="var(--green-dark)" strokeWidth="1.5"/>
                <path d="M3 15c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="var(--green-dark)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h3 className="font-ui font-semibold text-ink text-[15px] mb-1.5 leading-snug">
                Your Musical Identity
              </h3>
              <p className="font-ui text-sm leading-relaxed" style={{ color: "#374151" }}>
                Discover the communities, archetypes, and sonic threads that
                define who you are as a listener.
              </p>
            </div>
            <Link
              href="/identity"
              className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold font-ui text-green-dark hover:text-green transition-colors duration-150"
            >
              View identity
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 6h8M6 2.5l3.5 3.5L6 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </AtlasCard>

          {/* Card 2: Communities */}
          <AtlasCard variant="default" padding="lg" hoverable className="flex flex-col gap-4 group">
            <div className="w-10 h-10 rounded-atlas-sm bg-green-soft flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <circle cx="6" cy="7" r="2.5" stroke="var(--green-dark)" strokeWidth="1.5"/>
                <circle cx="12" cy="7" r="2.5" stroke="var(--green-dark)" strokeWidth="1.5"/>
                <path d="M1 15c0-2.76 2.24-5 5-5M12 10c2.76 0 5 2.24 5 5" stroke="var(--green-dark)" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M9 10c1.38 0 2.5 1.12 2.5 2.5" stroke="var(--green-dark)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h3 className="font-ui font-semibold text-ink text-[15px] mb-1.5 leading-snug">
                Hidden Communities
              </h3>
              <p className="font-ui text-sm leading-relaxed" style={{ color: "#374151" }}>
                204 worlds mapped from your listening history — each with its
                own culture, sound, and name.
              </p>
            </div>
            <Link
              href="/communities"
              className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold font-ui text-green-dark hover:text-green transition-colors duration-150"
            >
              Explore communities
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 6h8M6 2.5l3.5 3.5L6 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </AtlasCard>

          {/* Card 3: Galaxy */}
          <AtlasCard variant="default" padding="lg" hoverable className="flex flex-col gap-4 group">
            <div className="w-10 h-10 rounded-atlas-sm bg-green-soft flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <circle cx="9" cy="9" r="1.5" fill="var(--green-dark)"/>
                <circle cx="4" cy="5" r="1" fill="var(--green-dark)" opacity="0.6"/>
                <circle cx="14" cy="4" r="0.75" fill="var(--green-dark)" opacity="0.5"/>
                <circle cx="13" cy="13" r="1" fill="var(--green-dark)" opacity="0.7"/>
                <circle cx="5" cy="13" r="0.75" fill="var(--green-dark)" opacity="0.4"/>
                <circle cx="9" cy="3" r="0.75" fill="var(--green-dark)" opacity="0.5"/>
                <circle cx="3" cy="9" r="0.75" fill="var(--green-dark)" opacity="0.45"/>
                <circle cx="15" cy="9" r="0.75" fill="var(--green-dark)" opacity="0.45"/>
              </svg>
            </div>
            <div>
              <h3 className="font-ui font-semibold text-ink text-[15px] mb-1.5 leading-snug">
                The Galaxy
              </h3>
              <p className="font-ui text-sm leading-relaxed" style={{ color: "#374151" }}>
                Every track you&apos;ve ever saved, plotted in a living 2D star
                map — grouped by sound, not by genre.
              </p>
            </div>
            <Link
              href="/map"
              className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold font-ui text-green-dark hover:text-green transition-colors duration-150"
            >
              Open galaxy
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 6h8M6 2.5l3.5 3.5L6 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </AtlasCard>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-border bg-surface">
        <div className="max-w-screen-lg mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-green flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-white" />
            </span>
            <span className="font-ui font-semibold text-ink text-sm">
              Spotify Atlas
            </span>
          </div>
          <p className="font-ui text-faint text-xs text-center sm:text-right">
            Your musical identity, mapped.
          </p>
        </div>
      </footer>
    </div>
  );
}
