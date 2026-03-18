/**
 * API Types - Shared Contract
 * 
 * TypeScript interfaces that define exactly what the Backend API sends and receives.
 * This is the SINGLE SOURCE OF TRUTH for API communication.
 * 
 * These types match the backend exactly as defined in:
 * docs/backend/FRONTEND_INTEGRATION_MANUAL.md (Section 5)
 * 
 * @module types/api.types
 * @version 1.0.0
 * @see docs/backend/FRONTEND_INTEGRATION_MANUAL.md
 */

// =============================================================================
// Coordinates
// =============================================================================

/**
 * API Coordinate format used by backend
 * Note: Different from MapCoordinate (latitude/longitude) - use adapters!
 */
export interface Coordinate {
  lat: number;
  lon: number;
}

/**
 * GeoJSON coordinate format [longitude, latitude]
 * Used for polylines and map rendering
 */
export type GeoJSONCoordinate = [number, number];

// =============================================================================
// Vehicle Types
// =============================================================================

/**
 * Vehicle types supported by the backend API
 * Note: Backend uses 'tricycle', not 'trike'
 */
export type ApiVehicleType = 
  | 'jeep' 
  | 'jeepney' 
  | 'bus' 
  | 'bus_aircon' 
  | 'uv' 
  | 'tricycle' 
  | 'cab';

// =============================================================================
// Search Request/Response
// =============================================================================

/**
 * Route search optimization modes
 */
export type OptimizationMode = 'TIME' | 'FARE' | 'DISTANCE';

/**
 * Request body for POST /api/commutes/search
 */
export interface SearchRequest {
  origin: Coordinate;
  destination: Coordinate;
  mode?: OptimizationMode;
  maxResults?: number;
  maxWalkingKm?: number;
}

/**
 * Response from POST /api/commutes/search
 */
export interface SearchResponse {
  success: boolean;
  data: {
    routes: RouteResult[];
    alternatives: AlternativeOptions;
    summary: SearchSummary;
  };
}

// =============================================================================
// Route Result
// =============================================================================

/**
 * A single route option from search results
 */
export interface RouteResult {
  rank: number;
  summary: RouteSummary;
  segments: Segment[];
}

/**
 * Summary metrics for a route
 */
export interface RouteSummary {
  totalTimeMinutes: number;
  totalFare: number;
  totalDistanceKm: number;
  transferCount: number;
}

/**
 * Segment types in a journey
 */
export type SegmentType = 'WALK' | 'TRANSIT' | 'TRANSFER';

/**
 * A segment of a journey (walking, transit ride, or transfer)
 */
export interface Segment {
  type: SegmentType;
  distanceKm: number;
  timeMinutes: number;
  from: Coordinate;
  to: Coordinate;
  
  // Transit-specific (only present when type === 'TRANSIT')
  routeId?: string;
  routeName?: string;
  vehicleType?: ApiVehicleType;
  signboard?: string;
  fare?: number;
  boardAt?: Coordinate;
  alightAt?: Coordinate;
  
  // Map rendering
  polyline?: GeoJSONCoordinate[];
  
  // Step-by-step instructions
  instruction?: string;
}

// =============================================================================
// Alternatives
// =============================================================================

/**
 * Alternative options when no direct routes found
 */
export interface AlternativeOptions {
  walkingOption: WalkingOption | null;
  nearbyOriginStops: NearbyStop[];
  nearbyDestinationStops: NearbyStop[];
  message: string;
}

/**
 * Walking-only option as alternative
 */
export interface WalkingOption {
  available: boolean;
  distanceKm: number;
  timeMinutes: number;
  message: string;
  polyline?: GeoJSONCoordinate[];
}

/**
 * A nearby transit stop
 */
export interface NearbyStop {
  nodeId: string;
  lat: number;
  lon: number;
  distanceKm: number;
  distanceMeters: number;
  isTerminal: boolean;
  routes: RouteInfo[];
}

/**
 * Basic route information for a stop
 */
export interface RouteInfo {
  routeId: string;
  routeName: string;
  vehicleType: ApiVehicleType;
  signboard: string;
}

/**
 * Search summary metadata
 */
export interface SearchSummary {
  totalRoutes: number;
  searchTimeMs: number;
  origin: Coordinate;
  destination: Coordinate;
  mode: OptimizationMode;
}

// =============================================================================
// Transit Routes List
// =============================================================================

/**
 * Response from GET /api/commutes/routes
 */
export interface RoutesListResponse {
  success: boolean;
  data: {
    routes: TransitRouteInfo[];
    total: number;
    filters: {
      vehicleType: string | null;
      direction: string | null;
    };
  };
}

/**
 * Transit route information
 */
export interface TransitRouteInfo {
  routeId: string;
  routeName: string;
  vehicleType: ApiVehicleType;
  signboard: string;
  direction: 'inbound' | 'outbound';
  startTerminal: string;
  endTerminal: string;
  nodeCount?: number;
}

// =============================================================================
// Nearby Stops
// =============================================================================

/**
 * Response from GET /api/commutes/nearby
 */
export interface NearbyResponse {
  success: boolean;
  data: {
    location: Coordinate;
    radius: number;
    results: NearbyStop[];
    total: number;
  };
}

// =============================================================================
// Fare Calculation
// =============================================================================

/**
 * Response from GET /api/commutes/fare
 */
export interface FareResponse {
  success: boolean;
  data: {
    vehicleType: string;
    distanceKm: number;
    baseFare: number;
    baseDistance: number;
    additionalKm: number;
    additionalFare: number;
    totalFare: number;
  };
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Response from GET /api/commutes/config
 */
export interface ConfigResponse {
  success: boolean;
  data: {
    transferPenaltyMinutes: number;
    maxWalkingDistanceKm: number;
    maxTransferWalkingKm: number;
    routeMappingToleranceKm: number;
    walkingSpeedKmh: number;
    supportedVehicleTypes: string[];
  };
}

// =============================================================================
// Health & Status
// =============================================================================

/**
 * Service status values
 */
export type ServiceStatus = 'ready' | 'initializing' | 'failed';

/**
 * Response from GET /api/health
 */
export interface HealthResponse {
  status: ServiceStatus;
  environment: string;
  services: {
    mongodb: { connected: boolean };
    graphService: {
      initialized: boolean;
      nodeCount: number;
      routeCount: number;
    };
  };
  uptime: number;
  timestamp: string;
}

// =============================================================================
// Stopwatch / GPS Tracking
// =============================================================================

/**
 * GPS point for trace recording
 */
export interface GPSPoint {
  lat: number;
  lon: number;
  timestamp: number; // Unix timestamp in milliseconds
}

/**
 * Request body for POST /api/commutes/stopwatch
 */
export interface StopwatchRequest {
  routeId: string;
  vehicleType: string;
  trace: GPSPoint[];
}

/**
 * Response from POST /api/commutes/stopwatch
 */
export interface StopwatchResponse {
  success: boolean;
  data: {
    routeId: string;
    recordedSegments: number;
    skippedSegments: number;
    warnings: string[];
    message: string;
  };
}

// =============================================================================
// Error Handling
// =============================================================================

/**
 * API error codes from backend
 */
export type ApiErrorCode = 
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'NO_ROUTE_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'SERVICE_INITIALIZING'
  | 'UNAUTHORIZED'
  | 'SERVER_ERROR';

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false;
  error: ApiErrorCode;
  message: string;
  details?: string;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Generic API response wrapper
 */
export type ApiResponse<T> = 
  | { success: true; data: T }
  | ApiErrorResponse;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if response is an error
 */
export function isApiError(response: unknown): response is ApiErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as ApiErrorResponse).success === false
  );
}

/**
 * Type guard to check if response is successful
 */
export function isApiSuccess<T>(response: ApiResponse<T>): response is { success: true; data: T } {
  return response.success === true;
}

// =============================================================================
// Console Log Verification (Remove in production)
// =============================================================================

if (__DEV__) {
  console.log('✅ [api.types.ts] API Types loaded - Shared Contract established');
}
