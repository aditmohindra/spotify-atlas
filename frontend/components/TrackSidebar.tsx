import { TrackPoint, ClusterInfo, getArchetypeColor } from "@/hooks/useMapData";

interface Props {
  track: TrackPoint | null;
  cluster?: ClusterInfo;
  onClose: () => void;
}

export default function TrackSidebar({ track, cluster, onClose }: Props) {
  if (!track) return null;
  const color = getArchetypeColor(cluster?.cluster_archetype ?? null);

  return (
    <div
      className="absolute top-0 right-0 h-full w-72 flex flex-col z-10"
      style={{
        background: "#ffffff",
        borderLeft: "1px solid #e5e7eb",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.06)",
      }}
    >
      <div
        className="px-5 pt-5 pb-4"
        style={{ borderBottom: "1px solid #f3f4f6" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2
              className="text-sm font-semibold leading-snug truncate"
              style={{ color: "#111827" }}
            >
              {track.name}
            </h2>
            <p className="text-xs mt-1 truncate" style={{ color: "#6b7280" }}>
              {track.artist}
            </p>
          </div>
          <button
            onClick={onClose}
            className="transition-colors text-lg leading-none mt-0.5 flex-shrink-0"
            style={{ color: "#9ca3af" }}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4 flex-1">
        <div>
          <div
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "#9ca3af" }}
          >
            Community
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: color, boxShadow: `0 0 6px ${color}80` }}
            />
            <span className="text-xs font-medium" style={{ color: "#111827" }}>
              {cluster?.name ??
                (track.cluster_id === -1
                  ? "Unclassified"
                  : `Community ${track.cluster_id}`)}
            </span>
          </div>
          {cluster?.canonical_name && (
            <p className="text-xs pl-4" style={{ color: "#9ca3af" }}>
              {cluster.canonical_name}
            </p>
          )}
          {cluster?.cluster_archetype && (
            <div className="mt-2 pl-4">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: `${color}18`, color }}
              >
                {cluster.cluster_archetype}
              </span>
            </div>
          )}
          {cluster?.description && (
            <p
              className="text-xs mt-2 leading-relaxed"
              style={{ color: "#6b7280" }}
            >
              {cluster.description}
            </p>
          )}
        </div>

        {cluster?.keywords && cluster.keywords.length > 0 && (
          <div>
            <div
              className="text-xs uppercase tracking-widest mb-2"
              style={{ color: "#9ca3af" }}
            >
              Keywords
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {cluster.keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: `${color}18`, color }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "#9ca3af" }}
          >
            Coordinates
          </div>
          <div
            className="text-xs"
            style={{
              color: "#6b7280",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {track.x.toFixed(1)}, {track.y.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        <a
          href={`https://open.spotify.com/track/${track.spotify_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-medium transition-all"
          style={{ background: "#1db954", color: "#000" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Open in Spotify
        </a>
      </div>
    </div>
  );
}
