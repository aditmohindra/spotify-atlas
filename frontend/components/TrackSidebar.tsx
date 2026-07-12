import Link from "next/link";
import { TrackPoint, ClusterInfo, getArchetypeColor } from "@/hooks/useMapData";
import type { CommunityDetail } from "@/lib/types";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

interface Props {
  track: TrackPoint | null;
  cluster?: ClusterInfo;
  detail?: CommunityDetail | null;
  detailLoading?: boolean;
  totalTracks?: number;
  onClose: () => void;
}

const TOP_ARTISTS_VISIBLE = 4;

export default function TrackSidebar({
  track,
  cluster,
  detail,
  detailLoading = false,
  totalTracks = 0,
  onClose,
}: Props) {
  if (!track) return null;
  const color = getArchetypeColor(detail?.archetype ?? cluster?.cluster_archetype ?? null);

  const primaryTitle =
    detail?.canonical_name ??
    cluster?.canonical_name ??
    cluster?.name ??
    (track.cluster_id === -1 ? "Unclassified" : `Community ${track.cluster_id}`);
  const nickname =
    detail?.name && detail.name !== primaryTitle
      ? detail.name
      : cluster?.name && cluster.name !== primaryTitle
      ? cluster.name
      : null;
  const trackCount = detail?.track_count ?? cluster?.track_count;
  const pct =
    trackCount != null && totalTracks > 0
      ? ((trackCount / totalTracks) * 100).toFixed(1)
      : null;
  const archetype = detail?.archetype ?? cluster?.cluster_archetype ?? null;
  const clusterId = detail?.cluster_id ?? cluster?.cluster_id;
  const communityHref = clusterId != null ? `/community/${clusterId}` : "/communities";

  const topArtists = detail?.top_artists ?? [];
  const visibleArtists = topArtists.slice(0, TOP_ARTISTS_VISIBLE);
  const overflowCount = topArtists.length - visibleArtists.length;

  return (
    <div
      className="absolute flex flex-col z-10"
      style={{
        top: 148, right: 24,
        width: 460,
        maxHeight: "calc(100vh - 188px)",
        background: "rgba(5, 10, 20, 0.82)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        borderRadius: 26,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(37, 99, 235, 0.08)",
        overflow: "hidden",
      }}
    >
      <div
        className="px-9 pt-8 pb-5 flex items-start justify-between gap-4"
        style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.14)" }}
      >
        <div
          className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-widest"
          style={{ color }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
          Selected Region
        </div>
        <button
          onClick={onClose}
          className="transition-colors text-lg leading-none flex-shrink-0"
          style={{ color: "#64748b" }}
        >
          ✕
        </button>
      </div>

      <div className="px-9 py-9 flex flex-col gap-8 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3.5">
          <h2
            className="text-[22px] font-bold leading-[1.35]"
            style={{ color: "#f1f5f9" }}
          >
            {primaryTitle}
          </h2>
          {nickname && (
            <span
              className="inline-block w-fit text-sm px-3 py-1.5 rounded-full font-semibold"
              style={{ background: `${color}22`, color }}
            >
              {nickname}
            </span>
          )}
          {trackCount != null && (
            <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
              {trackCount.toLocaleString()} tracks
              {pct !== null && <> · {pct}% of your library</>}
            </p>
          )}
          {archetype && (
            <div>
              <span
                className="text-sm px-3 py-1 rounded-full font-medium"
                style={{ background: `${color}18`, color }}
              >
                {archetype}
              </span>
            </div>
          )}
        </div>

        {(detailLoading || visibleArtists.length > 0) && (
          <div>
            <div
              className="text-xs uppercase tracking-widest mb-4 font-semibold"
              style={{ color: "#64748b" }}
            >
              Top Artists
            </div>
            {detailLoading ? (
              <div className="flex gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 68, height: 68, borderRadius: "50%",
                      background: "rgba(148, 163, 184, 0.12)",
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-start gap-4">
                {visibleArtists.map((artist) => (
                  <div key={artist.name} className="flex flex-col items-center gap-2" style={{ width: 72 }}>
                    <ImageWithFallback
                      src={artist.artist_image_url}
                      alt={artist.name}
                      size={68}
                      shape="circle"
                      fallbackText={artist.name}
                    />
                    <span
                      className="text-[11px] text-center leading-snug truncate w-full"
                      style={{ color: "#94a3b8" }}
                    >
                      {artist.name}
                    </span>
                  </div>
                ))}
                {overflowCount > 0 && (
                  <div className="flex flex-col items-center gap-2" style={{ width: 72 }}>
                    <div
                      className="flex items-center justify-center"
                      style={{
                        width: 68, height: 68, borderRadius: "50%",
                        background: "rgba(148, 163, 184, 0.12)",
                        color: "#94a3b8",
                      }}
                    >
                      <span className="text-sm font-semibold">+{overflowCount}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(detailLoading || detail?.description) && (
          <div>
            <div
              className="text-xs uppercase tracking-widest mb-3 font-semibold"
              style={{ color: "#64748b" }}
            >
              About this region
            </div>
            {detailLoading ? (
              <div className="flex flex-col gap-2.5">
                <div style={{ height: 12, borderRadius: 4, background: "rgba(148, 163, 184, 0.1)", width: "100%" }} />
                <div style={{ height: 12, borderRadius: 4, background: "rgba(148, 163, 184, 0.1)", width: "85%" }} />
                <div style={{ height: 12, borderRadius: 4, background: "rgba(148, 163, 184, 0.1)", width: "60%" }} />
              </div>
            ) : (
              <p className="text-sm leading-[1.65]" style={{ color: "#94a3b8" }}>
                {detail!.description}
              </p>
            )}
          </div>
        )}

        <Link
          href={communityHref}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: `${color}22`, color, border: `1px solid ${color}40` }}
        >
          Explore this community
          <span style={{ fontSize: 14, lineHeight: 1 }}>→</span>
        </Link>
      </div>
    </div>
  );
}
