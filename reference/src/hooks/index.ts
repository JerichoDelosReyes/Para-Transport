/**
 * Hooks Index
 * 
 * Central export point for all custom hooks.
 * @module hooks
 */

export { useUserLocation, type UseUserLocationResult, type UserCoordinates, type PermissionStatus } from './useUserLocation';
export { 
  useRouteData, 
  type UseRouteDataResult, 
  type RouteFeature, 
  type RouteDirection, 
  type VehicleType,
  type RouteProperties,
  type TrafficStatus,
} from './useRouteData';

// Future exports (placeholder hooks to be implemented)
// export { useMapCamera } from './useMapCamera';         // NAV-012
