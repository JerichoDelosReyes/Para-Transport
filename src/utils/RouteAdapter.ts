/**
 * Route Adapter
 * 
 * Transforms backend API responses into data structures compatible with
 * react-native-maps and the Para UI components.
 * 
 * This is the "Translator" layer that bridges:
 * - Backend: { lat, lon } coordinates, [lon, lat] polylines
 * - Frontend: { latitude, longitude } for react-native-maps
 * 
 * @module utils/RouteAdapter
 * @version 1.0.0
 * @see docs/backend/FRONTEND_INTEGRATION_MANUAL.md
 */

import type {
  SearchResponse,
  RouteResult,
  Segment,
  SegmentType,
  Coordinate,
  GeoJSONCoordinate,
  AlternativeOptions,
} from '../types/api.types';
import type { MapCoordinate } from './geoUtils';

// =============================================================================
// Constants
// =============================================================================

/**
 * Colors for different segment types
 * Used for visual distinction on the map
 */
export const SEGMENT_COLORS: Record<SegmentType, string> = {
  WALK: '#4CAF50',      // Green - walking segments
  TRANSIT: '#2196F3',   // Blue - transit (jeepney/bus) segments
  TRANSFER: '#FF9800',  // Orange - transfer points
} as const;

/**
 * Stroke widths for different segment types
 */
export const SEGMENT_STROKE_WIDTHS: Record<SegmentType, number> = {
  WALK: 3,      // Thinner for walking
  TRANSIT: 5,   // Thicker for transit
  TRANSFER: 4,  // Medium for transfer
} as const;

/**
 * Line dash patterns for different segment types
 * Walking uses dashed line, transit uses solid
 */
export const SEGMENT_DASH_PATTERNS: Record<SegmentType, number[] | undefined> = {
  WALK: [10, 5],    // Dashed line for walking
  TRANSIT: undefined, // Solid line for transit
  TRANSFER: [5, 5],  // Short dashes for transfer
} as const;

// =============================================================================
// Coordinate Converters
// =============================================================================

/**
 * Convert API Coordinate { lat, lon } to MapCoordinate { latitude, longitude }
 * 
 * @param coord - Backend API coordinate
 * @returns react-native-maps compatible coordinate
 * 
 * @example
 * ```ts
 * const mapCoord = apiCoordinateToMap({ lat: 14.4207, lon: 120.9407 });
 * // Returns: { latitude: 14.4207, longitude: 120.9407 }
 * ```
 */
export const apiCoordinateToMap = (coord: Coordinate | null | undefined): MapCoordinate => {
  // Null safety: return default coordinates if undefined
  if (!coord || typeof coord.lat !== 'number' || typeof coord.lon !== 'number') {
    console.warn('[RouteAdapter] apiCoordinateToMap received invalid coordinate:', coord);
    return { latitude: 0, longitude: 0 };
  }
  return {
    latitude: coord.lat,
    longitude: coord.lon,
  };
};

/**
 * Convert MapCoordinate { latitude, longitude } to API Coordinate { lat, lon }
 * 
 * @param coord - react-native-maps coordinate
 * @returns Backend API compatible coordinate
 * 
 * @example
 * ```ts
 * const apiCoord = mapCoordinateToApi({ latitude: 14.4207, longitude: 120.9407 });
 * // Returns: { lat: 14.4207, lon: 120.9407 }
 * ```
 */
export const mapCoordinateToApi = (coord: MapCoordinate): Coordinate => ({
  lat: coord.latitude,
  lon: coord.longitude,
});

/**
 * Convert GeoJSON coordinate [lon, lat] to MapCoordinate { latitude, longitude }
 * 
 * @param geoCoord - GeoJSON coordinate array [longitude, latitude]
 * @returns react-native-maps compatible coordinate
 */
export const geoJSONToMapCoordinate = (geoCoord: GeoJSONCoordinate): MapCoordinate => ({
  latitude: geoCoord[1],
  longitude: geoCoord[0],
});

/**
 * Convert array of GeoJSON coordinates to MapCoordinates
 * 
 * @param polyline - Array of [lon, lat] coordinates
 * @returns Array of MapCoordinates for Polyline component
 */
export const polylineToMapCoordinates = (polyline: GeoJSONCoordinate[]): MapCoordinate[] => {
  return polyline.map(geoJSONToMapCoordinate);
};

// =============================================================================
// Adapted Data Types
// =============================================================================

/**
 * Adapted segment ready for map rendering
 */
export interface AdaptedSegment {
  /** Segment type (WALK, TRANSIT, TRANSFER) */
  type: SegmentType;
  /** Coordinates for Polyline component */
  coordinates: MapCoordinate[];
  /** Color for this segment */
  color: string;
  /** Stroke width for this segment */
  strokeWidth: number;
  /** Dash pattern (undefined = solid line) */
  dashPattern?: number[];
  /** Starting point */
  from: MapCoordinate;
  /** Ending point */
  to: MapCoordinate;
  /** Distance in km */
  distanceKm: number;
  /** Time in minutes */
  timeMinutes: number;
  /** Instruction text (if available) */
  instruction?: string;
  
  // Transit-specific fields
  /** Route ID (for TRANSIT) */
  routeId?: string;
  /** Route name (for TRANSIT) */
  routeName?: string;
  /** Signboard text (for TRANSIT) */
  signboard?: string;
  /** Vehicle type (for TRANSIT) */
  vehicleType?: string;
  /** Fare for this segment (for TRANSIT) */
  fare?: number;
  /** Boarding point (for TRANSIT) */
  boardAt?: MapCoordinate;
  /** Alighting point (for TRANSIT) */
  alightAt?: MapCoordinate;
}

/**
 * Adapted route with all segments and metadata
 */
export interface AdaptedRoute {
  /** Rank/order of this route option */
  rank: number;
  /** All segments in this route */
  segments: AdaptedSegment[];
  /** Route summary/metadata */
  summary: {
    totalTimeMinutes: number;
    totalFare: number;
    totalDistanceKm: number;
    transferCount: number;
  };
  /** All coordinates flattened (for bounding box calculation) */
  allCoordinates: MapCoordinate[];
  /** Origin point */
  origin: MapCoordinate;
  /** Destination point */
  destination: MapCoordinate;
}

/**
 * Full adapted response from search API
 */
export interface AdaptedSearchResponse {
  /** All route options, adapted for map display */
  routes: AdaptedRoute[];
  /** Alternative options (walking, nearby stops) */
  alternatives: {
    walkingOption: {
      available: boolean;
      coordinates?: MapCoordinate[];
      distanceKm: number;
      timeMinutes: number;
      message: string;
    } | null;
    nearbyOriginStops: Array<{
      nodeId: string;
      coordinate: MapCoordinate;
      distanceMeters: number;
      isTerminal: boolean;
      routes: Array<{ routeId: string; routeName: string; signboard: string }>;
    }>;
    nearbyDestinationStops: Array<{
      nodeId: string;
      coordinate: MapCoordinate;
      distanceMeters: number;
      isTerminal: boolean;
      routes: Array<{ routeId: string; routeName: string; signboard: string }>;
    }>;
    message: string;
  };
  /** Search metadata */
  searchSummary: {
    totalRoutes: number;
    searchTimeMs: number;
    origin: MapCoordinate;
    destination: MapCoordinate;
  };
}

// =============================================================================
// Adapter Functions
// =============================================================================

/**
 * Adapt a single segment for map rendering
 * 
 * @param segment - Raw segment from API
 * @returns Adapted segment with MapCoordinates and styling
 */
export const adaptSegment = (segment: Segment): AdaptedSegment => {
  // Safety check
  if (!segment) {
    console.warn('[RouteAdapter] adaptSegment received undefined segment');
    return {
      type: 'WALK',
      coordinates: [],
      color: SEGMENT_COLORS.WALK,
      strokeWidth: SEGMENT_STROKE_WIDTHS.WALK,
      dashPattern: SEGMENT_DASH_PATTERNS.WALK,
      from: { latitude: 0, longitude: 0 },
      to: { latitude: 0, longitude: 0 },
      distanceKm: 0,
      timeMinutes: 0,
    };
  }

  // Convert polyline coordinates if available
  const coordinates = segment.polyline 
    ? polylineToMapCoordinates(segment.polyline)
    : [apiCoordinateToMap(segment.from), apiCoordinateToMap(segment.to)];

  const segmentType = segment.type || 'WALK';

  return {
    type: segmentType,
    coordinates,
    color: SEGMENT_COLORS[segmentType] || SEGMENT_COLORS.WALK,
    strokeWidth: SEGMENT_STROKE_WIDTHS[segmentType] || SEGMENT_STROKE_WIDTHS.WALK,
    dashPattern: SEGMENT_DASH_PATTERNS[segmentType],
    from: apiCoordinateToMap(segment.from),
    to: apiCoordinateToMap(segment.to),
    distanceKm: segment.distanceKm ?? 0,
    timeMinutes: segment.timeMinutes ?? 0,
    instruction: segment.instruction,
    
    // Transit-specific
    routeId: segment.routeId,
    routeName: segment.routeName,
    signboard: segment.signboard,
    vehicleType: segment.vehicleType,
    fare: segment.fare,
    boardAt: segment.boardAt ? apiCoordinateToMap(segment.boardAt) : undefined,
    alightAt: segment.alightAt ? apiCoordinateToMap(segment.alightAt) : undefined,
  };
};

/**
 * Adapt a single route result for map rendering
 * 
 * @param route - Raw route result from API
 * @returns Adapted route with all segments and metadata
 */
export const adaptRoute = (route: RouteResult): AdaptedRoute => {
  // Safety check
  if (!route) {
    console.warn('[RouteAdapter] adaptRoute received undefined route');
    return {
      rank: 0,
      segments: [],
      summary: {
        totalTimeMinutes: 0,
        totalFare: 0,
        totalDistanceKm: 0,
        transferCount: 0,
      },
      allCoordinates: [],
      origin: { latitude: 0, longitude: 0 },
      destination: { latitude: 0, longitude: 0 },
    };
  }

  const segments = (route.segments || []).map(adaptSegment);
  
  // Flatten all coordinates for bounding box calculation
  const allCoordinates = segments.flatMap(seg => seg.coordinates);
  
  // Get origin and destination from first and last segments
  const origin = segments.length > 0 ? segments[0].from : { latitude: 0, longitude: 0 };
  const destination = segments.length > 0 
    ? segments[segments.length - 1].to 
    : { latitude: 0, longitude: 0 };

  const summary = route.summary || {
    totalTimeMinutes: 0,
    totalFare: 0,
    totalDistanceKm: 0,
    transferCount: 0,
  };

  return {
    rank: route.rank ?? 0,
    segments,
    summary: {
      totalTimeMinutes: summary.totalTimeMinutes ?? 0,
      totalFare: summary.totalFare ?? 0,
      totalDistanceKm: summary.totalDistanceKm ?? 0,
      transferCount: summary.transferCount ?? 0,
    },
    allCoordinates,
    origin,
    destination,
  };
};

/**
 * Adapt the full search response for frontend use
 * 
 * This is the main function to use when receiving data from
 * POST /api/commutes/search
 * 
 * @param response - Raw SearchResponse from API
 * @returns Fully adapted response ready for map rendering
 * 
 * @example
 * ```ts
 * const apiResponse = await fetch('/api/commutes/search', { ... });
 * const data = await apiResponse.json();
 * 
 * if (data.success) {
 *   const adapted = adaptSearchResponse(data);
 *   // Use adapted.routes[0].segments for Polylines
 *   // Use adapted.routes[0].summary for stats display
 * }
 * ```
 */
export const adaptSearchResponse = (response: SearchResponse): AdaptedSearchResponse => {
  // Safety check for response structure
  if (!response?.data) {
    console.warn('[RouteAdapter] adaptSearchResponse received invalid response:', response);
    return {
      routes: [],
      alternatives: {
        walkingOption: null,
        nearbyOriginStops: [],
        nearbyDestinationStops: [],
        message: 'Invalid response from server',
      },
      searchSummary: {
        totalRoutes: 0,
        searchTimeMs: 0,
        origin: { latitude: 0, longitude: 0 },
        destination: { latitude: 0, longitude: 0 },
      },
    };
  }

  const routes = (response.data.routes || []).map(adaptRoute);
  const alternatives = response.data.alternatives || {
    walkingOption: null,
    nearbyOriginStops: [],
    nearbyDestinationStops: [],
    message: '',
  };
  const summary = response.data.summary || {
    totalRoutes: 0,
    searchTimeMs: 0,
    origin: { lat: 0, lon: 0 },
    destination: { lat: 0, lon: 0 },
  };

  // Adapt walking option
  const adaptedWalkingOption = alternatives.walkingOption ? {
    available: alternatives.walkingOption.available,
    coordinates: alternatives.walkingOption.polyline 
      ? polylineToMapCoordinates(alternatives.walkingOption.polyline)
      : undefined,
    distanceKm: alternatives.walkingOption.distanceKm,
    timeMinutes: alternatives.walkingOption.timeMinutes,
    message: alternatives.walkingOption.message,
  } : null;

  // Adapt nearby stops with null safety
  const adaptNearbyStop = (stop: any) => ({
    nodeId: stop?.nodeId || '',
    coordinate: { 
      latitude: stop?.lat ?? 0, 
      longitude: stop?.lon ?? 0 
    },
    distanceMeters: stop?.distanceMeters ?? 0,
    isTerminal: stop?.isTerminal ?? false,
    routes: (stop?.routes || []).map((r: any) => ({
      routeId: r?.routeId || '',
      routeName: r?.routeName || '',
      signboard: r?.signboard || '',
    })),
  });

  return {
    routes,
    alternatives: {
      walkingOption: adaptedWalkingOption,
      nearbyOriginStops: (alternatives.nearbyOriginStops || []).map(adaptNearbyStop),
      nearbyDestinationStops: (alternatives.nearbyDestinationStops || []).map(adaptNearbyStop),
      message: alternatives.message || '',
    },
    searchSummary: {
      totalRoutes: summary.totalRoutes ?? 0,
      searchTimeMs: summary.searchTimeMs ?? 0,
      origin: apiCoordinateToMap(summary.origin),
      destination: apiCoordinateToMap(summary.destination),
    },
  };
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the best (first ranked) route from adapted response
 * 
 * @param adapted - Adapted search response
 * @returns Best route or null if no routes
 */
export const getBestRoute = (adapted: AdaptedSearchResponse): AdaptedRoute | null => {
  return adapted.routes.length > 0 ? adapted.routes[0] : null;
};

/**
 * Check if adapted response has valid routes
 * 
 * @param adapted - Adapted search response
 * @returns True if at least one route exists
 */
export const hasRoutes = (adapted: AdaptedSearchResponse): boolean => {
  return adapted.routes.length > 0;
};

/**
 * Get transit segments only from a route
 * Useful for displaying vehicle information
 * 
 * @param route - Adapted route
 * @returns Array of TRANSIT segments only
 */
export const getTransitSegments = (route: AdaptedRoute): AdaptedSegment[] => {
  return route.segments.filter(seg => seg.type === 'TRANSIT');
};

/**
 * Calculate total walking distance in a route
 * 
 * @param route - Adapted route
 * @returns Total walking distance in km
 */
export const getTotalWalkingDistance = (route: AdaptedRoute): number => {
  return route.segments
    .filter(seg => seg.type === 'WALK')
    .reduce((total, seg) => total + seg.distanceKm, 0);
};

// =============================================================================
// Console Log Verification (Development only)
// =============================================================================

if (__DEV__) {
  console.log('✅ [RouteAdapter.ts] Route Adapter loaded - Translator ready');
}
