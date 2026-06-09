import { TrackPoint } from "@/hooks/useMapData";

interface TrackSidebarProps {
  track: TrackPoint | null;
  onClose: () => void;
}

export default function TrackSidebar({ track, onClose }: TrackSidebarProps) {
  if (!track) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-black/90 border-l border-white/10 p-6 z-10 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-white font-medium text-lg leading-tight">
            {track.name}
          </h2>
          <p className="text-white/60 text-sm mt-1">{track.artist}</p>
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white text-xl leading-none mt-1"
        >
          ×
        </button>
      </div>

      <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
        <div>
          <p className="text-white/40 text-xs uppercase tracking-wider mb-1">
            Cluster
          </p>
          <p className="text-white/80 text-sm">
            {track.cluster_id === -1 ? "Unclassified" : `Cluster ${track.cluster_id}`}
          </p>
        </div>

        <div>
          <p className="text-white/40 text-xs uppercase tracking-wider mb-1">
            Position
          </p>
          <p className="text-white/80 text-sm font-mono">
            {track.x.toFixed(1)}, {track.y.toFixed(1)}
          </p>
        </div>

        <div>
          <p className="text-white/40 text-xs uppercase tracking-wider mb-1">
            Track ID
          </p>
          <p className="text-white/80 text-sm font-mono">{track.id}</p>
        </div>
      </div>

      <div className="mt-auto">
        <a
          href={`https://open.spotify.com/track/${track.spotify_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center bg-green-500 hover:bg-green-400 text-black font-medium text-sm py-2.5 rounded-lg transition-colors"
        >
          Open in Spotify
        </a>
      </div>
    </div>
  );
}