"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import BackgroundAudio, {
  type BackgroundAudioHandle,
} from "./BackgroundAudio";
import { ATLAS_ENTERED_KEY, ATLAS_ENTER_EVENT } from "@/lib/atlasEntry";

export { ATLAS_ENTERED_KEY, ATLAS_ENTER_EVENT } from "@/lib/atlasEntry";

const FADE_MS = 550;

type Phase = "checking" | "splash" | "fading" | "entered";

function dispatchEnter() {
  window.dispatchEvent(new CustomEvent(ATLAS_ENTER_EVENT));
}

/**
 * Session gate at the app root: one splash per browser session that unlocks
 * background audio and signals the map to play its entrance animation.
 */
export default function EnterSplash({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEmbed = pathname === "/map/embed";
  const audioRef = useRef<BackgroundAudioHandle>(null);
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    if (isEmbed) {
      setPhase("entered");
      return;
    }
    const already = sessionStorage.getItem(ATLAS_ENTERED_KEY) === "1";
    setPhase(already ? "entered" : "splash");
  }, [isEmbed]);

  const handleEnter = useCallback(() => {
    if (phase !== "splash") return;
    sessionStorage.setItem(ATLAS_ENTERED_KEY, "1");
    audioRef.current?.start();
    dispatchEnter();
    setPhase("fading");
  }, [phase]);

  useEffect(() => {
    if (phase !== "fading") return;
    const id = window.setTimeout(() => setPhase("entered"), FADE_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  const showOverlay = phase === "checking" || phase === "splash" || phase === "fading";
  const overlayVisible = phase === "checking" || phase === "splash";

  return (
    <>
      {children}
      <BackgroundAudio
        ref={audioRef}
        showToggle={!isEmbed && phase === "entered"}
      />
      {showOverlay && !isEmbed && (
        <SplashOverlay
          visible={overlayVisible}
          showContent={phase === "splash"}
          onEnter={handleEnter}
        />
      )}
    </>
  );
}

function SplashOverlay({
  visible,
  showContent,
  onEnter,
}: {
  visible: boolean;
  showContent: boolean;
  onEnter: () => void;
}) {
  const stars = useMemo(() => {
    const hash = (n: number) => {
      const v = Math.sin(n * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    return Array.from({ length: 80 }, (_, i) => ({
      left: `${(hash(i * 4 + 1) * 100).toFixed(3)}%`,
      top: `${(hash(i * 4 + 2) * 100).toFixed(3)}%`,
      size: `${(1 + hash(i * 4 + 3) * 2.2).toFixed(2)}px`,
      opacity: Number((0.15 + hash(i * 4 + 4) * 0.55).toFixed(3)),
      duration: `${(14 + hash(i * 5 + 1) * 18).toFixed(2)}s`,
      delay: `${(-hash(i * 5 + 2) * 20).toFixed(2)}s`,
      driftX: `${((hash(i * 6 + 1) - 0.5) * 40).toFixed(2)}px`,
      driftY: `${((hash(i * 6 + 2) - 0.5) * 30).toFixed(2)}px`,
    }));
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enter Spotify Atlas"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(165deg, #050913 0%, #0a1224 48%, #0f172a 100%)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    >
      {/* Soft green glow behind the wordmark */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 420,
          height: 280,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, rgba(29,185,84,0.14) 0%, transparent 68%)",
          animation: "atlas-glow-pulse 4.5s ease-in-out infinite",
        }}
      />

      {/* Drifting star field */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {stars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              opacity: s.opacity,
              animation: `atlas-star-drift ${s.duration} ease-in-out infinite`,
              animationDelay: s.delay,
              ["--drift-x" as string]: s.driftX,
              ["--drift-y" as string]: s.driftY,
            }}
          />
        ))}
      </div>

      {showContent && (
        <div className="relative z-10 flex flex-col items-center px-6 text-center">
          <div className="mb-5 flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full bg-green shadow-sm"
              style={{ boxShadow: "0 0 24px rgba(29,185,84,0.35)" }}
            >
              <span className="h-4 w-4 rounded-full bg-white" />
            </span>
            <h1
              className="font-ui text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]"
              style={{ color: "#f1f5f9" }}
            >
              Spotify Atlas
            </h1>
          </div>

          <p
            className="mb-10 max-w-sm font-ui text-[15px] leading-relaxed sm:text-base"
            style={{ color: "#94a3b8" }}
          >
            Your listening history, mapped.
          </p>

          <button
            type="button"
            onClick={onEnter}
            className="font-ui text-base font-semibold text-white transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: "#1db954",
              borderRadius: 999,
              padding: "14px 36px",
              boxShadow: "0 0 0 1px rgba(29,185,84,0.35), 0 8px 28px rgba(29,185,84,0.28)",
            }}
          >
            Enter Atlas
          </button>
        </div>
      )}
    </div>
  );
}
