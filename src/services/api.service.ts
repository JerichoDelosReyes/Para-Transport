import { auth } from '../config/firebase';
import { API_BASE_URL } from '../config/constants';
import type {
  ApiErrorCode,
  ApiErrorResponse,
  HealthResponse,
  SearchRequest,
  SearchResponse,
} from '../types/api.types';

const DEFAULT_TIMEOUT_MS = 30000;
const HEALTH_TIMEOUT_MS = 10000;

const resolvedBaseUrl =
  process.env.EXPO_PUBLIC_API_URL?.trim() || API_BASE_URL;

export class ApiServiceError extends Error {
  code: ApiErrorCode;
  details?: unknown;
  status?: number;

  constructor(message: string, code: ApiErrorCode, options?: { details?: unknown; status?: number }) {
    super(message);
    this.name = 'ApiServiceError';
    this.code = code;
    this.details = options?.details;
    this.status = options?.status;
  }

  get isColdStartTimeout(): boolean {
    return this.code === 'SERVICE_INITIALIZING' || this.code === 'SERVICE_UNAVAILABLE';
  }
}

const buildUrl = (path: string): string => {
  const base = resolvedBaseUrl.replace(/\/$/, '');
  return `${base}${path}`;
};

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn('[api.service] Failed to get auth token:', error);
  }

  return headers;
};

const parseErrorResponse = async (response: Response): Promise<ApiErrorResponse | null> => {
  try {
    const data = (await response.json()) as ApiErrorResponse;
    if (data && data.success === false && data.error && data.message) {
      return data;
    }
  } catch {
    // Ignore JSON parse failures and use fallback below.
  }

  return null;
};

const mapTimeoutToError = (path: string, timeoutMs: number): ApiServiceError => {
  const isHealthCheck = path === '/api/health';

  return new ApiServiceError(
    isHealthCheck
      ? 'The backend health check timed out.'
      : 'The route server is starting up. Please try again in a few seconds.',
    'SERVICE_UNAVAILABLE',
    { details: { path, timeoutMs } }
  );
};

const request = async <T>(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(path), {
      ...init,
      headers: {
        ...(await getAuthHeaders()),
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const apiError = await parseErrorResponse(response);

      throw new ApiServiceError(
        apiError?.message || `Request failed with status ${response.status}`,
        apiError?.error || (response.status === 401 ? 'UNAUTHORIZED' : 'SERVER_ERROR'),
        {
          details: apiError?.details,
          status: response.status,
        }
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiServiceError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw mapTimeoutToError(path, timeoutMs);
    }

    throw new ApiServiceError(
      error instanceof Error ? error.message : 'Network request failed',
      'SERVICE_UNAVAILABLE',
      { details: error }
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

class ApiService {
  async searchRoutes(payload: SearchRequest): Promise<SearchResponse> {
    try {
      return await request<SearchResponse>(
        '/api/commutes/search',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        DEFAULT_TIMEOUT_MS
      );
    } catch (error) {
      // Fallback: Return mock routes for development/testing
      console.warn('[api.service] Backend unavailable, returning mock routes for testing');
      
      // Calculate a simple mock route with 2 stops
      const mockRoute: SearchResponse = {
        success: true,
        errorCode: null,
        statusCode: 200,
        data: {
          routes: [
            {
              id: 'mock-route-1',
              origin: payload.origin,
              destination: payload.destination,
              totalDistance: 8.5,
              estimatedTime: 1800, // 30 minutes in seconds
              fare: 45,
              stops: [
                {
                  stopId: 'stop-1',
                  nodeName: 'Starting Route',
                  coordinates: payload.origin.coordinates,
                  sequenceIndex: 0,
                  distanceFromStart: 0,
                  estimatedSeconds: 0,
                  stopType: 'origin',
                },
                {
                  stopId: 'stop-2',
                  nodeName: 'Mid-point Junction',
                  coordinates: [
                    (payload.origin.coordinates[0] + payload.destination.coordinates[0]) / 2,
                    (payload.origin.coordinates[1] + payload.destination.coordinates[1]) / 2,
                  ],
                  sequenceIndex: 1,
                  distanceFromStart: 4.25,
                  estimatedSeconds: 900,
                  stopType: 'intermediate',
                },
                {
                  stopId: 'stop-3',
                  nodeName: 'Final Destination',
                  coordinates: payload.destination.coordinates,
                  sequenceIndex: 2,
                  distanceFromStart: 8.5,
                  estimatedSeconds: 1800,
                  stopType: 'destination',
                },
              ],
              routePath: {
                type: 'LineString',
                coordinates: [
                  payload.origin.coordinates,
                  [
                    (payload.origin.coordinates[0] + payload.destination.coordinates[0]) / 2,
                    (payload.origin.coordinates[1] + payload.destination.coordinates[1]) / 2,
                  ],
                  payload.destination.coordinates,
                ],
              },
              routeType: 'jeepney',
              available: true,
              vehicleCount: 3,
              description: '[MOCK] Sample route for testing without backend',
            },
          ],
        },
      };
      
      return mockRoute;
    }
  }

  async isServerReady(): Promise<boolean> {
    try {
      const response = await request<HealthResponse>('/api/health', { method: 'GET' }, HEALTH_TIMEOUT_MS);
      return response.status === 'ready';
    } catch (error) {
      console.warn('[api.service] Health check failed:', error);
      return false;
    }
  }
}

export const apiService = new ApiService();
