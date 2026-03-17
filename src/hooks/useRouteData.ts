/**
 * useRouteData Hook
 * 
 * Loads and parses jeepney route data from local GeoJSON file.
 * NAV-004: Route data management
 * 
 * Architecture: Offline-First - Routes loaded from bundled JSON, not API
 * 
 * @module hooks/useRouteData
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { FeatureCollection, LineString, Position } from 'geojson';
import { positionsToCoordinates, type MapCoordinate } from '../utils/geoUtils';

// Import local route data (bundled with app)
import routesGeoJSON from '../data/routes.json';

/**
 * Route direction types
 */
export type RouteDirection = 'outbound' | 'inbound' | 'loop';

/**
 * Traffic status levels
 * NAV-010: Traffic overlay support
 */
export type TrafficStatus = 'normal' | 'moderate' | 'heavy';

/**
 * Vehicle types supported by the app
 */
export type VehicleType = 'jeep' | 'bus' | 'uv' | 'tricycle';

/**
 * Raw GeoJSON feature properties from routes.json
 */
export interface RouteProperties {
  routeId: string;
  routeName: string;
  vehicleType: VehicleType;
  signboard: string;
  direction: RouteDirection;
  /** Optional: predefined color for the route */
  color?: string;
  /** Optional: fare information */
  baseFare?: number;
  /** Optional: operating hours */
  operatingHours?: string;
}

/**
 * Parsed route feature ready for map rendering
 * NAV-005: Route data structure for polyline rendering
 */
export interface RouteFeature {
  /** Unique route identifier */
  id: string;
  /** Human-readable route name */
  name: string;
  /** Display name shown on jeepney signboard */
  signboard: string;
  /** Route line color (hex code) */
  color: string;
  /** Direction of travel */
  direction: RouteDirection;
  /** Vehicle type */
  vehicleType: VehicleType;
  /** Converted coordinates for react-native-maps */
  coordinates: MapCoordinate[];
  /** Original GeoJSON coordinates (for turf.js operations) */
  rawCoordinates: Position[];
  /** Current traffic status for this route */
  trafficStatus: TrafficStatus;
}

/**
 * Return type for useRouteData hook
 */
export interface UseRouteDataResult {
  /** Parsed route features ready for rendering */
  routes: RouteFeature[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if parsing fails */
  error: string | null;
  /** Get a specific route by ID */
  getRouteById: (id: string) => RouteFeature | undefined;
  /** Filter routes by direction */
  getRoutesByDirection: (direction: RouteDirection) => RouteFeature[];
  /** Filter routes by vehicle type */
  getRoutesByVehicleType: (type: VehicleType) => RouteFeature[];
  /** Get traffic status for a route */
  getTrafficStatus: (routeId: string) => TrafficStatus;
  /** Refresh traffic data (triggers re-fetch when backend is ready) */
  refreshTrafficData: () => void;
}

/**
 * Default route colors by index (cycling palette)
 * Used when route doesn't have a predefined color
 */
const ROUTE_COLOR_PALETTE: string[] = [
  '#E53935', // Red
  '#1E88E5', // Blue
  '#43A047', // Green
  '#FB8C00', // Orange
  '#8E24AA', // Purple
  '#00ACC1', // Cyan
  '#F4511E', // Deep Orange
  '#3949AB', // Indigo
  '#7CB342', // Light Green
  '#FFB300', // Amber
  '#5E35B1', // Deep Purple
  '#039BE5', // Light Blue
];

/**
 * Get a consistent color for a route based on its ID
 * Uses hash to ensure same route always gets same color
 */
// =============================================================================
// [PLACEHOLDER] - Traffic Logic
// TODO: Connect to Backend API /traffic-status endpoint
// Currently returns mock/random status for UI testing
// =============================================================================

/**
 * Mock traffic status generator
 * 
 * This is a placeholder that returns random traffic status for UI testing.
 * In production, this will be replaced with actual API calls to the
 * crowdsourced traffic layer (Stopwatch Data -> Backend Traffic Layer).
 * 
 * @param routeId - Route identifier
 * @returns Traffic status ('normal' | 'moderate' | 'heavy')
 */
const getMockTrafficStatus = (routeId: string): TrafficStatus => {
  // [PLACEHOLDER] - Traffic Logic
  // TODO: Replace with actual API call to backend traffic endpoint
  // Backend will aggregate crowdsourced stopwatch data to determine traffic
  // Currently returns deterministic status based on routeId hash for consistent UI
  
  // Use hash for deterministic "random" status (same route = same status per session)
  let hash = 0;
  for (let i = 0; i < routeId.length; i++) {
    const char = routeId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // Add time-based variation (changes every 5 minutes for demo purposes)
  const timeSlot = Math.floor(Date.now() / (5 * 60 * 1000));
  const combined = Math.abs(hash + timeSlot);
  
  // 60% normal, 30% moderate, 10% heavy
  const rand = combined % 100;
  if (rand < 60) return 'normal';
  if (rand < 90) return 'moderate';
  return 'heavy';
};

const getRouteColor = (routeId: string, predefinedColor?: string): string => {
  if (predefinedColor) {
    return predefinedColor;
  }
  
  // Simple hash function for consistent color assignment
  let hash = 0;
  for (let i = 0; i < routeId.length; i++) {
    const char = routeId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const index = Math.abs(hash) % ROUTE_COLOR_PALETTE.length;
  return ROUTE_COLOR_PALETTE[index];
};

/**
 * Parse GeoJSON FeatureCollection into RouteFeature array
 */
const parseRouteFeatures = (geoJSON: FeatureCollection<LineString, RouteProperties>): RouteFeature[] => {
  return geoJSON.features
    .filter((feature) => {
      // Validate feature has required properties and geometry
      return (
        feature.type === 'Feature' &&
        feature.geometry?.type === 'LineString' &&
        feature.geometry?.coordinates?.length > 0 &&
        feature.properties?.routeId
      );
    })
    .map((feature) => {
      const props = feature.properties;
      const rawCoordinates = feature.geometry.coordinates;
      
      return {
        id: props.routeId,
        name: props.routeName || props.routeId,
        signboard: props.signboard || props.routeName,
        color: getRouteColor(props.routeId, props.color),
        direction: props.direction || 'outbound',
        vehicleType: props.vehicleType || 'jeep',
        coordinates: positionsToCoordinates(rawCoordinates),
        rawCoordinates,
        trafficStatus: getMockTrafficStatus(props.routeId),
      };
    });
};

/**
 * Custom hook for loading and managing route data
 * 
 * Loads jeepney routes from bundled GeoJSON file and provides
 * parsed data ready for map rendering.
 * 
 * @returns {UseRouteDataResult} Route data and helper functions
 * 
 * @example
 * ```tsx
 * const { routes, isLoading, error, getRouteById } = useRouteData();
 * 
 * if (isLoading) return <LoadingSpinner />;
 * if (error) return <ErrorMessage message={error} />;
 * 
 * return routes.map(route => (
 *   <RoutePolyline
 *     key={route.id}
 *     coordinates={route.coordinates}
 *     color={route.color}
 *   />
 * ));
 * ```
 */
export const useRouteData = (): UseRouteDataResult => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteFeature[]>([]);

  /**
   * Parse routes on mount
   */
  useEffect(() => {
    try {
      setIsLoading(true);
      setError(null);

      // Type assertion for imported JSON
      const geoJSON = routesGeoJSON as FeatureCollection<LineString, RouteProperties>;

      // Validate GeoJSON structure
      if (geoJSON.type !== 'FeatureCollection' || !Array.isArray(geoJSON.features)) {
        throw new Error('Invalid GeoJSON: Expected FeatureCollection');
      }

      const parsedRoutes = parseRouteFeatures(geoJSON);
      
      if (parsedRoutes.length === 0) {
        throw new Error('No valid routes found in data');
      }

      setRoutes(parsedRoutes);
      console.log(`[useRouteData] Loaded ${parsedRoutes.length} routes`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load route data';
      setError(message);
      console.error('[useRouteData] Error:', message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get route by ID - memoized for performance
   */
  const getRouteById = useMemo(() => {
    const routeMap = new Map<string, RouteFeature>(routes.map((r: RouteFeature) => [r.id, r]));
    return (id: string): RouteFeature | undefined => routeMap.get(id);
  }, [routes]);

  /**
   * Get routes filtered by direction
   */
  const getRoutesByDirection = useMemo(() => {
    return (direction: RouteDirection): RouteFeature[] =>
      routes.filter((r: RouteFeature) => r.direction === direction);
  }, [routes]);

  /**
   * Get routes filtered by vehicle type
   */
  const getRoutesByVehicleType = useMemo(() => {
    return (type: VehicleType): RouteFeature[] =>
      routes.filter((r: RouteFeature) => r.vehicleType === type);
  }, [routes]);

  /**
   * Get traffic status for a specific route
   * 
   * [PLACEHOLDER] - Currently uses mock data
   * TODO: Integrate with backend traffic API when available
   */
  const getTrafficStatus = useMemo(() => {
    return (routeId: string): TrafficStatus => {
      const route = routes.find((r: RouteFeature) => r.id === routeId);
      return route?.trafficStatus ?? 'normal';
    };
  }, [routes]);

  /**
   * Refresh traffic data
   * 
   * [PLACEHOLDER] - Traffic Data Refresh
   * TODO: Call backend API to get updated traffic status
   * Currently regenerates mock traffic status for all routes
   */
  const refreshTrafficData = useCallback(() => {
    // [PLACEHOLDER] - Traffic Refresh Logic
    // TODO: Fetch from backend API /api/traffic-status
    // For now, regenerate mock status by updating routes
    setRoutes((prevRoutes: RouteFeature[]) =>
      prevRoutes.map((route: RouteFeature) => ({
        ...route,
        trafficStatus: getMockTrafficStatus(route.id),
      }))
    );
    console.log('[useRouteData] Traffic data refreshed (mock)');
  }, []);

  return {
    routes,
    isLoading,
    error,
    getRouteById,
    getRoutesByDirection,
    getRoutesByVehicleType,
    getTrafficStatus,
    refreshTrafficData,
  };
};

export default useRouteData;
