/**
 * API Service
 * 
 * Central service for all backend API communication.
 * Handles authentication, request/response processing, and error handling.
 * 
 * @module services/api.service
 * @version 1.0.0
 * @see docs/backend/FRONTEND_INTEGRATION_MANUAL.md (Section 6.1)
 */

import { API_CONFIG, ENDPOINTS, buildUrl, buildUrlWithParams } from '../config/api.config';
import type {
  SearchRequest,
  SearchResponse,
  HealthResponse,
  FareResponse,
  NearbyResponse,
  ConfigResponse,
  StopwatchRequest,
  StopwatchResponse,
  ApiErrorResponse,
  ApiErrorCode,
  isApiError,
} from '../types/api.types';

// =============================================================================
// Error Class
// =============================================================================

/**
 * Custom error class for API errors
 * Provides structured error information from backend
 */
export class ApiServiceError extends Error {
  /** Error code from backend */
  code: ApiErrorCode;
  /** Additional error details */
  details?: string;
  /** HTTP status code */
  statusCode?: number;
  /** Whether this is a network/timeout error */
  isNetworkError: boolean;
  /** Whether this is a cold start timeout */
  isColdStartTimeout: boolean;

  constructor(
    message: string,
    code: ApiErrorCode = 'SERVER_ERROR',
    options?: {
      details?: string;
      statusCode?: number;
      isNetworkError?: boolean;
      isColdStartTimeout?: boolean;
    }
  ) {
    super(message);
    this.name = 'ApiServiceError';
    this.code = code;
    this.details = options?.details;
    this.statusCode = options?.statusCode;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isColdStartTimeout = options?.isColdStartTimeout ?? false;
  }
}

// =============================================================================
// API Service Class
// =============================================================================

/**
 * Central API service for backend communication
 * 
 * Features:
 * - Firebase Auth token integration
 * - Automatic timeout handling (30s for Render cold start)
 * - Structured error handling
 * - Type-safe request/response
 */
class ApiService {
  private authToken: string | null = null;
  private tokenGetter: (() => Promise<string | null>) | null = null;

  /**
   * Set a static auth token
   * Use this for simple token management
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  /**
   * Set a dynamic token getter function
   * Use this with Firebase Auth: setTokenGetter(() => user.getIdToken())
   */
  setTokenGetter(getter: () => Promise<string | null>): void {
    this.tokenGetter = getter;
  }

  /**
   * Get the current auth token
   * Prefers dynamic getter over static token
   */
  private async getToken(): Promise<string | null> {
    if (this.tokenGetter) {
      try {
        return await this.tokenGetter();
      } catch (error) {
        console.warn('[ApiService] Token getter failed:', error);
        return this.authToken;
      }
    }
    return this.authToken;
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    };

    const url = buildUrl(endpoint);
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, API_CONFIG.TIMEOUT);

    try {
      if (__DEV__) {
        console.log(`[ApiService] ${options.method || 'GET'} ${url}`);
      }

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        // Handle API error response
        const errorData = data as ApiErrorResponse;
        throw new ApiServiceError(
          errorData.message || 'Request failed',
          errorData.error || 'SERVER_ERROR',
          {
            details: errorData.details,
            statusCode: response.status,
          }
        );
      }

      if (__DEV__) {
        console.log(`[ApiService] Response OK from ${endpoint}`);
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiServiceError(
          'Request timed out. The server may be starting up (cold start).',
          'SERVICE_UNAVAILABLE',
          {
            isNetworkError: true,
            isColdStartTimeout: true,
          }
        );
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ApiServiceError(
          'Network error. Please check your connection.',
          'SERVICE_UNAVAILABLE',
          { isNetworkError: true }
        );
      }

      // Re-throw ApiServiceError as-is
      if (error instanceof ApiServiceError) {
        throw error;
      }

      // Unknown error
      throw new ApiServiceError(
        error instanceof Error ? error.message : 'An unexpected error occurred',
        'SERVER_ERROR'
      );
    }
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  /**
   * Check if the backend server is ready
   * Use this before making other requests
   */
  async checkHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>(ENDPOINTS.HEALTH);
  }

  /**
   * Check if server is ready (returns boolean)
   * Useful for initialization checks
   */
  async isServerReady(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      return health.status === 'ready';
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Route Search
  // ===========================================================================

  /**
   * Search for routes between two points
   * This is the main search endpoint using A* pathfinding
   * 
   * @param request - Search parameters (origin, destination, mode)
   * @returns Search response with routes and alternatives
   */
  async searchRoutes(request: SearchRequest): Promise<SearchResponse> {
    return this.request<SearchResponse>(ENDPOINTS.SEARCH, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // ===========================================================================
  // Nearby Stops
  // ===========================================================================

  /**
   * Find transit stops near a location
   * 
   * @param lat - Latitude
   * @param lon - Longitude
   * @param radius - Search radius in km (default: 0.5)
   */
  async findNearbyStops(
    lat: number,
    lon: number,
    radius: number = 0.5
  ): Promise<NearbyResponse> {
    const url = buildUrlWithParams(ENDPOINTS.NEARBY, { lat, lon, radius });
    return this.request<NearbyResponse>(url.replace(buildUrl(''), ''));
  }

  // ===========================================================================
  // Fare Calculation
  // ===========================================================================

  /**
   * Calculate fare for a specific vehicle type and distance
   * 
   * @param vehicleType - Type of vehicle (jeep, bus, etc.)
   * @param distanceKm - Distance in kilometers
   */
  async calculateFare(
    vehicleType: string,
    distanceKm: number
  ): Promise<FareResponse> {
    const url = buildUrlWithParams(ENDPOINTS.FARE, { vehicleType, distanceKm });
    return this.request<FareResponse>(url.replace(buildUrl(''), ''));
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Get routing configuration from backend
   */
  async getConfig(): Promise<ConfigResponse> {
    return this.request<ConfigResponse>(ENDPOINTS.CONFIG);
  }

  // ===========================================================================
  // Stopwatch / GPS Trace Recording
  // ===========================================================================

  /**
   * Record a GPS trace for a transit route
   * Used by the stopwatch feature to collect real-world timing data
   * 
   * @param routeId - The transit route ID being recorded
   * @param vehicleType - Type of vehicle (jeep, bus, etc.)
   * @param trace - Array of GPS points with timestamps
   * @returns Recording result with segment counts
   */
  async recordGPSTrace(
    routeId: string,
    vehicleType: string,
    trace: Array<{ lat: number; lon: number; timestamp: number }>
  ): Promise<StopwatchResponse> {
    const request: StopwatchRequest = {
      routeId,
      vehicleType,
      trace,
    };
    
    return this.request<StopwatchResponse>(ENDPOINTS.STOPWATCH, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Singleton instance of ApiService
 * Import and use: `import { apiService } from '../services/api.service'`
 */
export const apiService = new ApiService();

// =============================================================================
// Console Log Verification (Development only)
// =============================================================================

if (__DEV__) {
  console.log('✅ [api.service.ts] API Service loaded');
  console.log(`   Base URL: ${API_CONFIG.BASE_URL}`);
  console.log(`   Timeout: ${API_CONFIG.TIMEOUT}ms`);
}
