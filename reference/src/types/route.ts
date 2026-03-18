/**
 * Route Types
 * 
 * TypeScript interfaces for route data, search results, and navigation.
 * Used throughout the map and navigation features.
 * 
 * ⚠️ MIGRATION NOTICE (2026-01-15):
 * For API communication with the backend, use types from './api.types.ts'.
 * Types in this file are for LOCAL route data and UI display.
 * See: docs/backend/FRONTEND_INTEGRATION_MANUAL.md
 * 
 * @module types/route
 */

// Re-export API types for convenience
// Use these for all backend API communication
export type { 
  Coordinate as ApiCoordinate,
  GeoJSONCoordinate as ApiGeoJSONCoordinate,
  ApiVehicleType,
  SearchRequest,
  SearchResponse,
  RouteResult,
  Segment,
  SegmentType,
  NearbyStop,
  HealthResponse,
  ApiErrorResponse,
  ApiErrorCode,
} from './api.types';

// =============================================================================
// Coordinate Types (Local/UI)
// =============================================================================

/**
 * GeoJSON coordinate format [longitude, latitude]
 * 
 * Note: For API communication, use Coordinate from api.types.ts
 * which uses { lat, lon } format.
 */
export type GeoJSONCoordinate = [number, number];

/**
 * Map coordinate format { latitude, longitude }
 */
export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

// =============================================================================
// Vehicle Types (Local/UI)
// =============================================================================

/**
 * Supported vehicle types for LOCAL UI display
 * 
 * ⚠️ Note: For API communication, use ApiVehicleType from api.types.ts
 * Backend uses: 'jeep' | 'jeepney' | 'bus' | 'bus_aircon' | 'uv' | 'tricycle' | 'cab'
 * Local uses: 'jeep' | 'bus' | 'uv' | 'trike' | 'fx'
 * 
 * Use mapApiVehicleToLocal() adapter when converting API responses.
 */
export type VehicleType = 'jeep' | 'bus' | 'uv' | 'trike' | 'fx';

/**
 * Map API vehicle types to local UI vehicle types
 */
export function mapApiVehicleToLocal(apiVehicle: string): VehicleType {
  const mapping: Record<string, VehicleType> = {
    'jeep': 'jeep',
    'jeepney': 'jeep',
    'bus': 'bus',
    'bus_aircon': 'bus',
    'uv': 'uv',
    'tricycle': 'trike',
    'cab': 'fx', // Map cab to fx as closest match
  };
  return mapping[apiVehicle] || 'jeep';
}

/**
 * Vehicle type display configuration
 */
export interface VehicleTypeConfig {
  label: string;
  icon: string;
  color: string;
}

/**
 * Vehicle type configurations for UI display
 */
export const VEHICLE_TYPE_CONFIG: Record<VehicleType, VehicleTypeConfig> = {
  jeep: { label: 'Jeepney', icon: '🚐', color: '#E9AE16' },
  bus: { label: 'Bus', icon: '🚌', color: '#4285F4' },
  uv: { label: 'UV Express', icon: '🚙', color: '#34A853' },
  trike: { label: 'Tricycle', icon: '🛺', color: '#EA4335' },
  fx: { label: 'FX', icon: '🚐', color: '#9C27B0' },
};

// =============================================================================
// Stop Types
// =============================================================================

/**
 * A stop along a route
 */
export interface RouteStop {
  /** Unique stop ID */
  stopId: string;
  /** Display name of the stop */
  name: string;
  /** GeoJSON coordinate [lng, lat] */
  coordinate: GeoJSONCoordinate;
  /** Whether this is a major stop/landmark */
  isMajor?: boolean;
}

// =============================================================================
// Route Types
// =============================================================================

/**
 * Route geometry in GeoJSON format
 */
export interface RouteGeometry {
  type: 'LineString';
  coordinates: GeoJSONCoordinate[];
}

/**
 * Base route information
 */
export interface Route {
  /** Unique route identifier */
  routeId: string;
  /** Full route name */
  routeName: string;
  /** Signboard text displayed on vehicle */
  signboard: string;
  /** Type of vehicle */
  vehicleType: VehicleType;
  /** Route geometry for map display */
  geometry: RouteGeometry;
  /** Stops along the route */
  stops?: RouteStop[];
  /** Base fare in PHP */
  fare: number;
  /** Whether route is active */
  isActive?: boolean;
}

/**
 * Route with calculated trip details
 */
export interface RouteWithDetails extends Route {
  /** Type indicator for direct vs transfer */
  type: 'direct' | 'transfer';
  /** Calculated distance for this trip in km */
  calculatedDistance: number;
  /** Calculated fare for this trip in PHP */
  calculatedFare: number;
  /** Estimated time in minutes */
  estimatedTime: number;
}

// =============================================================================
// Transfer Route Types (Segmented Journey Support)
// =============================================================================

/**
 * Waypoint in a journey (origin, transfer, or destination)
 */
export interface JourneyWaypoint {
  /** Type of waypoint */
  type: 'origin' | 'transfer' | 'destination';
  /** Coordinate [lng, lat] */
  coordinates: GeoJSONCoordinate;
  /** Longitude */
  lng: number;
  /** Latitude */
  lat: number;
  /** Optional name/label for the waypoint */
  name?: string;
}

/**
 * A single leg of a transfer route (enhanced for segmented display)
 */
export interface TransferLeg {
  /** Order of this leg in the journey (1, 2, etc.) */
  order: number;
  /** Route information for this leg */
  route: {
    routeId: string;
    routeName: string;
    vehicleType: VehicleType;
    signboard: string;
    trafficLevel?: string;
    geometry: RouteGeometry;
  };
  /** Starting point of this leg */
  from: JourneyWaypoint;
  /** Ending point of this leg */
  to: JourneyWaypoint;
  /** Distance for this leg in km */
  distance: number;
  /** Fare for this leg in PHP */
  fare: number;
  /** Estimated time for this leg in minutes */
  estimatedTime?: number;
  
  // Legacy fields for backward compatibility
  /** @deprecated Use from.coordinates */
  boardAt?: GeoJSONCoordinate;
  /** @deprecated Use to.coordinates */
  alightAt?: GeoJSONCoordinate;
}

/**
 * Transfer point between routes
 */
export interface TransferPoint {
  /** Transfer point name */
  name?: string;
  /** Coordinate of transfer [lng, lat] */
  coordinate?: GeoJSONCoordinate;
  /** Coordinates (alias for spatialFilter output) */
  coordinates?: GeoJSONCoordinate;
  /** Longitude */
  lng?: number;
  /** Latitude */
  lat?: number;
  /** From vehicle type */
  fromVehicle?: VehicleType;
  /** To vehicle type */
  toVehicle?: VehicleType;
  /** Walking distance to next stop in meters */
  walkingDistance?: number;
  /** Walking time estimate in minutes */
  walkingTime?: number;
}

/**
 * A route requiring transfers (segmented journey)
 */
export interface TransferRoute {
  /** Type indicator */
  type: 'transfer';
  /** Number of transfers required */
  transferCount?: number;
  /** Route legs (segments) */
  legs: TransferLeg[];
  /** Transfer points between legs */
  transferPoints?: TransferPoint[];
  /** Single transfer point (for 1-transfer journeys) */
  transferPoint?: TransferPoint;
  /** Total distance in km */
  totalDistance: number;
  /** Total fare in PHP */
  totalFare: number;
  /** Total estimated time in minutes */
  totalTime: number;
  /** Walking time at transfer points in minutes */
  walkingTime?: number;
}

/**
 * Segment color configuration for multi-colored polylines
 */
export interface SegmentColor {
  /** Segment index (0-based) */
  index: number;
  /** Color hex code */
  color: string;
  /** Vehicle type for this segment */
  vehicleType: VehicleType;
}

/**
 * Default segment colors by order (10 distinct colors for multi-segment routes)
 */
export const SEGMENT_COLORS: string[] = [
  '#FF6B6B', // Coral Red
  '#4ECDC4', // Teal
  '#45B7D1', // Sky Blue
  '#96CEB4', // Sage Green
  '#FFEAA7', // Pale Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Mustard
  '#BB8FCE', // Lavender
  '#85C1E9', // Light Blue
];

/**
 * Get a random segment color by index (cycles through if index > 10)
 */
export const getSegmentColor = (index: number): string => {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
};

/**
 * Get segment color by vehicle type
 */
export const getSegmentColorByVehicle = (vehicleType: VehicleType): string => {
  const colors: Record<VehicleType, string> = {
    jeep: '#E9AE16',    // Para Brand Yellow
    bus: '#4285F4',     // Blue
    uv: '#34A853',      // Green
    trike: '#EA4335',   // Red
    fx: '#9C27B0',      // Purple
  };
  return colors[vehicleType] || '#6B7280';
};

// =============================================================================
// Search Types
// =============================================================================

/**
 * Route search request payload
 */
export interface RouteSearchRequest {
  /** Origin coordinate [lng, lat] */
  origin: GeoJSONCoordinate;
  /** Destination coordinate [lng, lat] */
  destination: GeoJSONCoordinate;
  /** Buffer distance in meters (default 400) */
  bufferDistance?: number;
  /** Include transfer routes (default true) */
  includeTransfers?: boolean;
}

/**
 * Route search response from backend
 */
export interface RouteSearchResponse {
  success: boolean;
  origin: {
    coordinates: GeoJSONCoordinate;
    lng: number;
    lat: number;
  };
  destination: {
    coordinates: GeoJSONCoordinate;
    lng: number;
    lat: number;
  };
  bufferDistance: number;
  summary: {
    directRoutesCount: number;
    transferRoutesCount: number;
    hasDirectRoute: boolean;
    hasTransferRoute: boolean;
  };
  directRoutes: RouteWithDetails[];
  transferRoutes?: TransferRoute[];
  recommendation?: RouteRecommendation | null;
  message?: string;
}

/**
 * Backend recommendation for best route
 */
export interface RouteRecommendation {
  type: 'direct' | 'transfer';
  routeId?: string;
  routeName?: string;
  signboard?: string;
  vehicleType?: VehicleType;
  distance: number;
  fare: number;
  reason: string;
  legs?: Array<{
    routeId: string;
    routeName: string;
    signboard: string;
    vehicleType: VehicleType;
  }>;
  transferPoint?: TransferPoint;
}

// =============================================================================
// Geocoding Types
// =============================================================================

/**
 * Geocoding result
 */
export interface GeocodingResult {
  /** Display name for the location */
  displayName: string;
  /** Coordinate [lng, lat] */
  coordinate: GeoJSONCoordinate;
  /** Type of result (known_location, nominatim, fallback) */
  type: string;
  /** Confidence score 0-1 */
  confidence: number;
}

// =============================================================================
// Navigation Types
// =============================================================================

/**
 * Navigation state for Digital Para mode
 */
export type NavigationZone = 'far' | 'approaching' | 'para';

/**
 * Navigation state details
 */
export interface NavigationState {
  /** Current navigation zone */
  zone: NavigationZone;
  /** Distance to destination in meters */
  distanceToDestination: number;
  /** Current position */
  currentPosition: MapCoordinate;
  /** Destination position */
  destination: MapCoordinate;
  /** Active route being navigated */
  activeRoute: RouteWithDetails | TransferRoute;
  /** Whether PARA alert has been triggered */
  paraTriggered: boolean;
}

/**
 * Zone thresholds in meters
 */
export const NAVIGATION_ZONES = {
  /** Far zone - normal navigation */
  FAR: 400,
  /** Approaching zone - prepare to alight */
  APPROACHING: 100,
  /** PARA zone - time to get off */
  PARA: 100,
} as const;

// =============================================================================
// UI State Types
// =============================================================================

/**
 * Drawer state for RouteSelectionDrawer
 */
export type DrawerState = 'collapsed' | 'expanded' | 'hidden';

/**
 * Map screen mode
 */
export type MapMode = 'idle' | 'searching' | 'route-selected' | 'navigating';

/**
 * Selected route for navigation (can be direct or transfer)
 */
export type SelectedRoute = RouteWithDetails | TransferRoute;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert GeoJSON coordinate to MapCoordinate
 */
export const toMapCoordinate = (coord: GeoJSONCoordinate): MapCoordinate => ({
  latitude: coord[1],
  longitude: coord[0],
});

/**
 * Convert MapCoordinate to GeoJSON coordinate
 */
export const toGeoJSONCoordinate = (coord: MapCoordinate): GeoJSONCoordinate => [
  coord.longitude,
  coord.latitude,
];

/**
 * Convert array of GeoJSON coordinates to MapCoordinates
 */
export const toMapCoordinates = (coords: GeoJSONCoordinate[]): MapCoordinate[] =>
  coords.map(toMapCoordinate);

/**
 * Check if a route is a transfer route
 */
export const isTransferRoute = (route: SelectedRoute): route is TransferRoute =>
  'legs' in route && Array.isArray(route.legs);

/**
 * Get total fare from a selected route
 */
export const getRouteFare = (route: SelectedRoute): number =>
  isTransferRoute(route) ? route.totalFare : route.calculatedFare;

/**
 * Get total distance from a selected route
 */
export const getRouteDistance = (route: SelectedRoute): number =>
  isTransferRoute(route) ? route.totalDistance : route.calculatedDistance;

/**
 * Get estimated time from a selected route
 */
export const getRouteTime = (route: SelectedRoute): number =>
  isTransferRoute(route) ? route.totalTime : route.estimatedTime;
