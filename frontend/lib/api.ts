/**
 * Spotify Atlas — typed API client.
 *
 * Thin, typed fetch wrappers around the FastAPI backend. Every function returns
 * the parsed response typed against `lib/types.ts`. These helpers are
 * transport-only: no caching, no UI concerns. Wire them into React state or
 * React Query in later phases.
 */

import type {
  ArchetypesResponse,
  CommunitiesMeta,
  CommunityDetail,
  Era,
  EraDepth,
  EraLabelUpdate,
  EraPatchResponse,
  EraTimelineType,
  LabelsResponse,
  MapClustersResponse,
  MapData,
  RelatedResponse,
  TasteProfile,
  TasteSummary,
  TasteTimeRange,
  WrappedBounds,
  WrappedMeta,
  WrappedRangeParams,
  WrappedTopAlbum,
  WrappedTopArtist,
  WrappedTopTrack,
} from "./types";

/** Base URL for the backend. Override via NEXT_PUBLIC_API_BASE_URL if needed. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

/** Thrown when a request resolves with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Internal: GET a path and parse JSON, throwing `ApiError` on failure. */
async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    ...init,
  });

  if (!res.ok) {
    throw new ApiError(
      `Request to ${path} failed with status ${res.status}`,
      res.status,
      url,
    );
  }

  return (await res.json()) as T;
}

/** Internal: PATCH a path with JSON body, throwing `ApiError` on failure. */
async function patchJson<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    ...init,
  });

  if (!res.ok) {
    throw new ApiError(
      `Request to ${path} failed with status ${res.status}`,
      res.status,
      url,
    );
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Atlas layer: vibe (Run 29) or scene (Run 18). */
export type AtlasLayer = "vibe" | "scene";

/**
 * Fetch the user's taste profile (top communities, weighted).
 * GET /profile/taste?user_id={userId}&time_range={timeRange}&layer={layer}
 */
export function getTasteProfile(
  userId = 1,
  timeRange: TasteTimeRange = "all",
  layer: AtlasLayer = "vibe",
  init?: RequestInit,
): Promise<TasteProfile> {
  const params = new URLSearchParams({
    user_id: String(userId),
    time_range: timeRange,
    layer,
  });
  return getJson<TasteProfile>(`/profile/taste?${params.toString()}`, init);
}

/**
 * Fetch the AI-written identity title + summary.
 * GET /profile/summary?user_id={userId}
 * Returns `{ title: string, summary: string }`.
 * NOTE: triggers an LLM call on the backend — can take several seconds.
 */
export function getTasteSummary(
  userId = 1,
  init?: RequestInit,
): Promise<TasteSummary> {
  const params = new URLSearchParams({ user_id: String(userId) });
  return getJson<TasteSummary>(`/profile/summary?${params.toString()}`, init);
}

// ---------------------------------------------------------------------------
// Communities / Archetypes
// ---------------------------------------------------------------------------

/**
 * Fetch all archetypes and the communities grouped under each.
 * GET /clusters/archetypes?layer={layer}
 */
export function getArchetypes(
  layer: AtlasLayer = "vibe",
  init?: RequestInit,
): Promise<ArchetypesResponse> {
  const params = new URLSearchParams({ layer });
  return getJson<ArchetypesResponse>(`/clusters/archetypes?${params.toString()}`, init);
}

/**
 * Fetch full detail for a single community, hydrated with the user's weight.
 * GET /clusters/{communityId}/detail?user_id={userId}&layer={layer}
 */
export function getCommunityDetail(
  communityId: number,
  userId = 1,
  layer: AtlasLayer = "vibe",
  init?: RequestInit,
): Promise<CommunityDetail> {
  const params = new URLSearchParams({
    user_id: String(userId),
    layer,
  });
  return getJson<CommunityDetail>(
    `/clusters/${communityId}/detail?${params.toString()}`,
    init,
  );
}

/**
 * Fetch communities most similar to a given community.
 * GET /clusters/{communityId}/related?layer={layer}&top_n={topN}
 */
export function getRelatedCommunities(
  communityId: number,
  layer: AtlasLayer = "vibe",
  init?: RequestInit,
  topN = 5,
): Promise<RelatedResponse> {
  const params = new URLSearchParams({ layer, top_n: String(topN) });
  return getJson<RelatedResponse>(
    `/clusters/${communityId}/related?${params.toString()}`,
    init,
  );
}

/**
 * Fetch all community labels (name, canonical name, archetype, keywords).
 * GET /clusters/labels
 */
export function getClusterLabels(init?: RequestInit): Promise<LabelsResponse> {
  return getJson<LabelsResponse>("/clusters/labels", init);
}

/**
 * Fetch community list metadata (e.g. how many new communities were entered this year).
 * GET /communities/meta
 */
export function getCommunitiesMeta(init?: RequestInit): Promise<CommunitiesMeta> {
  return getJson<CommunitiesMeta>("/communities/meta", init);
}

// ---------------------------------------------------------------------------
// Galaxy map (Phase U6)
// ---------------------------------------------------------------------------

/**
 * Fetch all plotted track points for the galaxy map.
 * GET /map
 */
export function getMapData(init?: RequestInit): Promise<MapData> {
  return getJson<MapData>("/map", init);
}

/**
 * Fetch aggregated community nodes (centroids) for the galaxy map.
 * GET /map/clusters
 */
export function getMapClusters(
  init?: RequestInit,
): Promise<MapClustersResponse> {
  return getJson<MapClustersResponse>("/map/clusters", init);
}

// ---------------------------------------------------------------------------
// Timeline eras (Phase 13)
// ---------------------------------------------------------------------------

/**
 * Fetch all listening eras for a user, oldest first.
 * GET /eras?user_id={userId}&type={type}
 */
export function getEras(
  userId = 1,
  type: EraTimelineType = "discovery",
  init?: RequestInit,
): Promise<Era[]> {
  const params = new URLSearchParams({ user_id: String(userId), type });
  return getJson<Era[]>(`/eras?${params.toString()}`, init);
}

/**
 * Update an era's title, description, and/or mood.
 * PATCH /eras/{eraId}
 */
export function patchEra(
  eraId: number,
  updates: EraLabelUpdate,
  init?: RequestInit,
): Promise<EraPatchResponse> {
  return patchJson<EraPatchResponse>(`/eras/${eraId}`, updates, init);
}

/**
 * Fetch deep era analytics (artists, tracks, tags, archetype breakdown).
 * GET /eras/{eraId}/depth?limit={limit}&track_limit={trackLimit}
 */
export function getEraDepth(
  eraId: number,
  limit = 3,
  trackLimit = 5,
  init?: RequestInit,
): Promise<EraDepth> {
  const params = new URLSearchParams({
    limit: String(limit),
    track_limit: String(trackLimit),
  });
  return getJson<EraDepth>(`/eras/${eraId}/depth?${params.toString()}`, init);
}

// ---------------------------------------------------------------------------
// Wrapped analytics (Phase 19; re-derived from real extended_history play
// counts in Task 1, windows anchored to the latest real event timestamp)
// ---------------------------------------------------------------------------

/** Build the shared `window` or `start_date`/`end_date` query params for a
 * Wrapped range. */
function rangeSearchParams(range: WrappedRangeParams): URLSearchParams {
  return range.window
    ? new URLSearchParams({ window: range.window })
    : new URLSearchParams({
        start_date: range.startDate,
        end_date: range.endDate,
      });
}

/**
 * Fetch ranked top tracks by real play count within one window or custom
 * date range.
 * GET /wrapped/top-tracks?window={window}&limit={limit}
 * GET /wrapped/top-tracks?start_date={startDate}&end_date={endDate}&limit={limit}
 */
export function getWrappedTopTracks(
  range: WrappedRangeParams,
  limit = 20,
  init?: RequestInit,
): Promise<WrappedTopTrack[]> {
  const params = rangeSearchParams(range);
  params.set("limit", String(limit));
  return getJson<WrappedTopTrack[]>(`/wrapped/top-tracks?${params.toString()}`, init);
}

/**
 * Fetch ranked top artists by real play count within one window or custom
 * date range.
 * GET /wrapped/top-artists?window={window}&limit={limit}
 * GET /wrapped/top-artists?start_date={startDate}&end_date={endDate}&limit={limit}
 */
export function getWrappedTopArtists(
  range: WrappedRangeParams,
  limit = 20,
  init?: RequestInit,
): Promise<WrappedTopArtist[]> {
  const params = rangeSearchParams(range);
  params.set("limit", String(limit));
  return getJson<WrappedTopArtist[]>(`/wrapped/top-artists?${params.toString()}`, init);
}

/**
 * Fetch derived top albums, ranked by how many of the real top tracks
 * belong to each album, for one window or custom date range.
 * GET /wrapped/top-albums?window={window}&limit={limit}
 * GET /wrapped/top-albums?start_date={startDate}&end_date={endDate}&limit={limit}
 */
export function getWrappedTopAlbums(
  range: WrappedRangeParams,
  limit = 10,
  init?: RequestInit,
): Promise<WrappedTopAlbum[]> {
  const params = rangeSearchParams(range);
  params.set("limit", String(limit));
  return getJson<WrappedTopAlbum[]>(`/wrapped/top-albums?${params.toString()}`, init);
}

/**
 * Fetch the real computed date range and event count for one window or
 * custom date range.
 * GET /wrapped/meta?window={window}
 * GET /wrapped/meta?start_date={startDate}&end_date={endDate}
 */
export function getWrappedMeta(
  range: WrappedRangeParams,
  init?: RequestInit,
): Promise<WrappedMeta> {
  const params = rangeSearchParams(range);
  return getJson<WrappedMeta>(`/wrapped/meta?${params.toString()}`, init);
}

/**
 * Fetch the earliest/latest real extended_history event dates, used to
 * clamp the custom-range date picker to data that can return results.
 * GET /wrapped/bounds
 */
export function getWrappedBounds(init?: RequestInit): Promise<WrappedBounds> {
  return getJson<WrappedBounds>("/wrapped/bounds", init);
}
