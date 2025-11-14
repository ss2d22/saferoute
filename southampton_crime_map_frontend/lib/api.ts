const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// Types
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
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
  lookback_months?: number;
  time_of_day?: "night" | "morning" | "day" | "evening";
}

export interface SafetyCell {
  id: string;
  safety_score: number;
  risk_score: number;
  crime_count: number;
  crime_count_weighted: number;
  months_data: number;
  crime_breakdown: Record<string, number>;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface SafetySnapshotResponse {
  cells: SafetyCell[];
  summary: {
    total_cells: number;
    total_crimes: number;
    avg_safety_score: number;
    highest_risk_cell: string;
    lowest_risk_cell: string;
  };
  meta: {
    bbox: [number, number, number, number];
    cell_size_m: number;
    grid_type: string;
    lookback_months: number;
    time_filter: string | null;
    months_included: number;
  };
}

export interface SafeRoutePayload {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode?: "foot-walking" | "cycling-regular";
  departure_time?: string;
  preferences?: {
    safety_weight?: number;
    lookback_months?: number;
    time_of_day_sensitive?: boolean;
    category_weights?: Record<string, number>;
  };
}

export interface RouteSegment {
  segment_index: number;
  start_point: [number, number];
  end_point: [number, number];
  risk_score: number;
}

export interface Hotspot {
  segment_index: number; // Added segment_index from API response
  location: [number, number];
  risk_level: "high" | "critical";
  description: string;
  risk_score: number;
}

export interface SafeRoute {
  route_id: string;
  safety_score: number;
  risk_class: "low" | "medium" | "high";
  is_recommended: boolean;
  distance_m: number;
  duration_s: number;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  stats: {
    segments: RouteSegment[];
    hotspots: Hotspot[];
    crime_breakdown: Record<string, number>;
    total_weighted_risk?: number; // Added optional fields from API
    max_segment_risk?: number;
    avg_segment_risk?: number;
    segment_count?: number;
  };
  instructions?: Array<{
    distance: number;
    duration?: number; // Made duration optional to match API
    instruction: string;
    name?: string; // Renamed from street_name to match API response
  }>;
}

export interface UserSettings {
  save_history: boolean;
  default_mode: "foot-walking" | "cycling-regular";
  safety_preferences: {
    lookback_months: number;
    time_of_day_sensitive: boolean;
  };
}

export interface RouteHistoryItem {
  id: string;
  created_at: string;
  origin: {
    lat: number;
    lng: number;
  };
  destination: {
    lat: number;
    lng: number;
  };
  mode: string;
  safety_score_best: number;
  distance_m_best: number;
  duration_s_best: number;
}

export interface RouteHistoryResponse {
  items: RouteHistoryItem[];
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
      headers.set("Authorization", `Bearer ${tokens.access_token}`);
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
    if (tokens?.refresh_token) {
      try {
        const newTokens = await refreshToken(tokens.refresh_token);
        setTokens(newTokens);

        // Retry original request with new token
        headers.set("Authorization", `Bearer ${newTokens.access_token}`);
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
    body: JSON.stringify({ refresh_token: refreshToken }),
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
  const searchParams = new URLSearchParams();
  searchParams.set("bbox", params.bbox);
  if (params.lookback_months)
    searchParams.set("lookback_months", params.lookback_months.toString());
  if (params.time_of_day) searchParams.set("time_of_day", params.time_of_day);

  const response = await apiFetch(
    `/api/v1/safety/snapshot?${searchParams.toString()}`
  );
  return response.json();
}

export async function getSafeRoutes(
  payload: SafeRoutePayload
): Promise<SafeRoute[]> {
  const tokens = getTokens();
  const requiresAuth = !!tokens; // Only add auth if user is logged in
  
  const response = await apiFetch("/api/v1/routes/safe", {
    method: "POST",
    body: JSON.stringify(payload),
  }, requiresAuth); // Pass requiresAuth flag
  return response.json();
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
    `/api/v1/users/me/history?${searchParams.toString()}`,
    {},
    true
  );
  return response.json();
}

export async function deleteRouteHistoryItem(id: string): Promise<void> {
  await apiFetch(`/api/v1/users/me/history/${id}`, {
    method: "DELETE",
  }, true);
}

export async function deleteAllRouteHistory(): Promise<void> {
  await apiFetch("/api/v1/users/me/history", {
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
