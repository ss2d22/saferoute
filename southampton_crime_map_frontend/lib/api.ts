const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// Types - Updated to match NestJS backend camelCase format
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn?: number;
}

export interface User {
  id: string;
  email: string;
  isActive?: boolean;
  isAdmin?: boolean;
  createdAt: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SafetySnapshotParams {
  bbox: string;
  lookbackMonths?: number;
  month?: string; // Format: YYYY-MM
  timeOfDay?: "night" | "morning" | "day" | "evening";
}

export interface SafetyCell {
  cellId: string;
  safetyScore: number;
  riskScore: number;
  crimeCount: number;
  crimeCountWeighted: number;
  categoryBreakdown: Record<string, number>;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface SafetySnapshotResponse {
  cells: SafetyCell[];
  count: number;
  summary?: {
    totalCells: number;
    totalCrimes: number;
    avgSafetyScore: number;
    highestRiskCell: string;
    lowestRiskCell: string;
  };
  meta?: {
    bbox: [number, number, number, number];
    cellSizeM: number;
    gridType: string;
    lookbackMonths: number;
    timeFilter: string | null;
    monthsIncluded: number;
  };
}

export interface SafeRoutePayload {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode?: "foot-walking" | "cycling-regular";
  departureTime?: string;
  preferences?: {
    safetyWeight?: number;
    lookbackMonths?: number;
    categoryWeights?: Record<string, number>;
  };
}

export interface RouteSegment {
  segmentIndex: number;
  startPoint: [number, number];
  endPoint: [number, number];
  riskScore: number;
}

export interface Hotspot {
  segmentIndex: number;
  location: [number, number];
  riskLevel: "high" | "critical";
  description: string;
  riskScore: number;
}

export interface SegmentSafety {
  index: number;
  safetyScore: number;
  riskScore: number;
  coordinates: number[][];
}

export interface RouteOption {
  distanceM: number;
  durationS: number;
  safetyScore: number;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  instructions?: Array<{
    distance: number;
    duration?: number;
    instruction: string;
    name?: string;
  }>;
  rank: number;
  segments?: SegmentSafety[];
  googleMapsUrl?: string;
}

export interface SafeRouteResponse {
  routes: RouteOption[];
  safetyWeight: number;
  lookbackMonths: number;
  timeOfDay: string;
  timestamp: string;
}

// Legacy format for backward compatibility
export interface SafeRoute {
  routeId: string;
  safetyScore: number;
  riskClass: "low" | "medium" | "high";
  isRecommended: boolean;
  distanceM: number;
  durationS: number;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  stats: {
    segments: RouteSegment[];
    hotspots: Hotspot[];
    crimeBreakdown: Record<string, number>;
    totalWeightedRisk?: number;
    maxSegmentRisk?: number;
    avgSegmentRisk?: number;
    segmentCount?: number;
  };
  instructions?: Array<{
    distance: number;
    duration?: number;
    instruction: string;
    name?: string;
  }>;
}

export interface UserSettings {
  saveHistory: boolean;
  defaultMode: "foot-walking" | "cycling-regular";
  safetyPreferences: {
    lookbackMonths: number;
  };
}

export interface RouteHistoryItem {
  id: string;
  createdAt: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  mode: string;
  safetyScoreBest: number;
  distanceMBest: number;
  durationSBest: number;
}

export interface RouteHistoryResponse {
  history: RouteHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

// Token management
const TOKEN_KEY = "saferoute_tokens";

export function getTokens(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  const tokens = localStorage.getItem(TOKEN_KEY);
  return tokens ? JSON.parse(tokens) : null;
}

export function setTokens(tokens: AuthTokens): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

// API error handling
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
  }
}

// Fetch wrapper with auth and token refresh
async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  requiresAuth = false
): Promise<Response> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers);

  if (requiresAuth) {
    const tokens = getTokens();
    if (tokens) {
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }
  }

  headers.set("Content-Type", "application/json");

  let response = await fetch(url, {
    ...options,
    headers,
  });

  // Try to refresh token on 401
  if (response.status === 401 && requiresAuth) {
    const tokens = getTokens();
    if (tokens?.refreshToken) {
      try {
        const newTokens = await refreshToken(tokens.refreshToken);
        setTokens(newTokens);

        // Retry original request with new token
        headers.set("Authorization", `Bearer ${newTokens.accessToken}`);
        response = await fetch(url, {
          ...options,
          headers,
        });
      } catch (error) {
        clearTokens();
        throw error;
      }
    }
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, response.statusText, data);
  }

  return response;
}

// Auth APIs
export async function register(payload: RegisterPayload): Promise<AuthTokens> {
  const response = await apiFetch("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function login(payload: LoginPayload): Promise<AuthTokens> {
  const response = await apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function refreshToken(refreshToken: string): Promise<AuthTokens> {
  const response = await apiFetch("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  return response.json();
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", {
    method: "POST",
  }, true);
}

export async function getCurrentUser(): Promise<User> {
  const response = await apiFetch("/api/v1/auth/me", {}, true);
  return response.json();
}

// Safety & Routes APIs
export async function getSafetySnapshot(
  params: SafetySnapshotParams
): Promise<SafetySnapshotResponse> {
  // Parse bbox: "minLat,minLng,maxLat,maxLng"
  const bboxParts = params.bbox.split(',').map(Number);
  const [minLat, minLng, maxLat, maxLng] = bboxParts;

  const searchParams = new URLSearchParams();
  searchParams.set("minLat", minLat.toString());
  searchParams.set("minLng", minLng.toString());
  searchParams.set("maxLat", maxLat.toString());
  searchParams.set("maxLng", maxLng.toString());

  // Use month parameter instead of lookback_months
  if (params.month) {
    searchParams.set("month", params.month);
  }

  // Call the new H3 grid endpoint
  const response = await apiFetch(
    `/api/v1/h3-grids/cells?${searchParams.toString()}`
  );

  const data = await response.json();

  // Transform NestJS response to match expected format
  // Filter out cells with zero crimes
  const cells: SafetyCell[] = data.cells
    .filter((cell: any) => cell.crimeCount && cell.crimeCount > 0)
    .map((cell: any) => ({
      cellId: cell.cellId,
      safetyScore: cell.stats.safetyScore,
      riskScore: cell.stats.riskScore,
      crimeCount: cell.crimeCount,
      crimeCountWeighted: cell.crimeCountWeighted,
      categoryBreakdown: cell.stats.categoryBreakdown || {},
      geometry: cell.geometry,
    }));

  // Calculate summary statistics
  const totalCrimes = cells.reduce((sum, cell) => sum + cell.crimeCount, 0);
  const avgSafetyScore = cells.length > 0
    ? cells.reduce((sum, cell) => sum + cell.safetyScore, 0) / cells.length
    : 0;

  const sortedByRisk = [...cells].sort((a, b) => b.riskScore - a.riskScore);
  const highestRiskCell = sortedByRisk[0]?.cellId || '';
  const lowestRiskCell = sortedByRisk[sortedByRisk.length - 1]?.cellId || '';

  return {
    cells,
    count: data.count,
    summary: {
      totalCells: data.count,
      totalCrimes,
      avgSafetyScore,
      highestRiskCell,
      lowestRiskCell,
    },
    meta: {
      bbox: [minLat, minLng, maxLat, maxLng],
      cellSizeM: 73, // H3 resolution 9 average cell edge length
      gridType: "h3",
      lookbackMonths: params.lookbackMonths || 12,
      timeFilter: params.timeOfDay || null,
      monthsIncluded: 1,
    },
  };
}

export async function getSafeRoutes(
  payload: SafeRoutePayload
): Promise<RouteOption[]> {
  const tokens = getTokens();
  const requiresAuth = !!tokens; // Only add auth if user is logged in

  const response = await apiFetch("/api/v1/routes/safe", {
    method: "POST",
    body: JSON.stringify(payload),
  }, requiresAuth);

  const data: SafeRouteResponse = await response.json();

  // Return the routes array from the response
  return data.routes;
}

// User Settings APIs
export async function getUserSettings(): Promise<UserSettings> {
  const response = await apiFetch("/api/v1/users/me/settings", {}, true);
  return response.json();
}

export async function updateUserSettings(
  settings: Partial<UserSettings>
): Promise<UserSettings> {
  const response = await apiFetch("/api/v1/users/me/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  }, true);
  return response.json();
}

// History APIs
export async function getRouteHistory(params?: {
  limit?: number;
  offset?: number;
}): Promise<RouteHistoryResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const response = await apiFetch(
    `/api/v1/routes/history?${searchParams.toString()}`,
    {},
    true
  );
  return response.json();
}

export async function deleteRouteHistoryItem(id: string): Promise<void> {
  await apiFetch(`/api/v1/routes/history/${id}`, {
    method: "DELETE",
  }, true);
}

export async function deleteAllRouteHistory(): Promise<void> {
  await apiFetch("/api/v1/routes/history", {
    method: "DELETE",
  }, true);
}

export async function deleteAccount(password: string): Promise<void> {
  await apiFetch("/api/v1/users/me", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  }, true);
}

// Health check
export async function getHealthStatus(): Promise<{ status: string }> {
  const response = await apiFetch("/health");
  return response.json();
}

export { register as apiRegister };
