// Re-export types from canonical location
export type { RouteCoord, StopPoint, RouteProperties, JeepneyRoute } from '../types/routes';

// Re-export hook for backward compatibility
export { useRoutes as useJeepneyRoutes } from './useRoutes';
