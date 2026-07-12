"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

const MUTE_KEY = "atlas-audio-muted";
const AUDIO_SRC = "/audio/Deference for Darkness.mp3";
const VOLUME = 0.35;

export type BackgroundAudioHandle = {
  /** Start (or resume) playback — must be called from a user gesture. */
  start: () => void;
};

type Props = {
  /** When false, the mute toggle is hidden (e.g. while splash is up). */
  showToggle?: boolean;
};

const BackgroundAudio = forwardRef<BackgroundAudioHandle, Props>(
  function BackgroundAudio({ showToggle = true }, ref) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [muted, setMuted] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
      setHydrated(true);
    }, []);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = VOLUME;
      audio.muted = muted;
    }, [muted]);

    const start = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = VOLUME;
      audio.muted = localStorage.getItem(MUTE_KEY) === "1";
      void audio.play().catch(() => {
        /* Autoplay may still fail if called outside a gesture */
      });
    }, []);

    useImperativeHandle(ref, () => ({ start }), [start]);

    const toggleMute = () => {
      const next = !muted;
      setMuted(next);
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      const audio = audioRef.current;
      if (!audio) return;
      audio.muted = next;
      // Unmute click is a user gesture — resume if playback never started
      // (e.g. session refresh where splash was skipped).
      if (!next && audio.paused) {
        audio.volume = VOLUME;
        void audio.play().catch(() => {});
      }
    };

    return (
      <>
        <audio
          ref={audioRef}
          src={AUDIO_SRC}
          loop
          preload="auto"
          playsInline
        />
        {hydrated && showToggle && (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute background audio" : "Mute background audio"}
            aria-pressed={muted}
            className="fixed z-[90] flex items-center justify-center transition-opacity hover:opacity-100"
            style={{
              bottom: 20,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 999,
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              color: muted ? "#94a3b8" : "#e2e8f0",
              opacity: 0.85,
              backdropFilter: "blur(10px)",
              cursor: "pointer",
            }}
          >
            {muted ? <MuteIcon /> : <UnmuteIcon />}
          </button>
        )}
      </>
    );
  },
);

export default BackgroundAudio;

function UnmuteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10v4h3.5L12 18V6L7.5 10H4z"
        fill="currentColor"
      />
      <path
        d="M15.5 8.5a5 5 0 010 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M17.8 6a8 8 0 010 12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10v4h3.5L12 18V6L7.5 10H4z"
        fill="currentColor"
      />
      <path
        d="M16 9.5l5 5M21 9.5l-5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
