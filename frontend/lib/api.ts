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
  CommunityDetail,
  LabelsResponse,
  MapClustersResponse,
  MapData,
  RelatedResponse,
  TasteProfile,
  TasteSummary,
  TasteTimeRange,
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

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Fetch the user's taste profile (top communities, weighted).
 * GET /profile/taste?user_id={userId}&time_range={timeRange}
 */
export function getTasteProfile(
  userId = 1,
  timeRange: TasteTimeRange = "all",
  init?: RequestInit,
): Promise<TasteProfile> {
  const params = new URLSearchParams({
    user_id: String(userId),
    time_range: timeRange,
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
 * GET /clusters/archetypes
 */
export function getArchetypes(init?: RequestInit): Promise<ArchetypesResponse> {
  return getJson<ArchetypesResponse>("/clusters/archetypes", init);
}

/**
 * Fetch full detail for a single community, hydrated with the user's weight.
 * GET /clusters/{communityId}/detail?user_id={userId}
 */
export function getCommunityDetail(
  communityId: number,
  userId = 1,
  init?: RequestInit,
): Promise<CommunityDetail> {
  const params = new URLSearchParams({ user_id: String(userId) });
  return getJson<CommunityDetail>(
    `/clusters/${communityId}/detail?${params.toString()}`,
    init,
  );
}

/**
 * Fetch communities most similar to a given community.
 * GET /clusters/{communityId}/related
 */
export function getRelatedCommunities(
  communityId: number,
  init?: RequestInit,
): Promise<RelatedResponse> {
  return getJson<RelatedResponse>(`/clusters/${communityId}/related`, init);
}

/**
 * Fetch all community labels (name, canonical name, archetype, keywords).
 * GET /clusters/labels
 */
export function getClusterLabels(init?: RequestInit): Promise<LabelsResponse> {
  return getJson<LabelsResponse>("/clusters/labels", init);
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
