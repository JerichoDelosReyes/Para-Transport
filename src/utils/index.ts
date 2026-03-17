/**
 * Utilities Index
 * 
 * Central export point for all utility functions.
 * @module utils
 */

// Geo Utilities - Coordinate transformations and calculations
export {
  // Constants
  IMUS_CENTER,
  IMUS_DEFAULT_REGION,
  // Type conversions
  positionToCoordinate,
  coordinateToPosition,
  positionsToCoordinates,
  // Calculations
  calculateDistance,
  isWithinRadius,
  findNearestPointOnLine,
  calculateBoundingRegion,
  // Formatting
  formatDistance,
  formatDuration,
  // Placeholders (traffic-aware calculations)
  calculateTrafficWeightedDistance,
  calculateETA,
  // Types
  type MapCoordinate,
  type MapRegion,
  type BoundingBox,
} from './geoUtils';

// Route Adapter - API response to Map data transformation
export {
  // Constants
  SEGMENT_COLORS,
  SEGMENT_STROKE_WIDTHS,
  SEGMENT_DASH_PATTERNS,
  // Coordinate converters
  apiCoordinateToMap,
  mapCoordinateToApi,
  geoJSONToMapCoordinate,
  polylineToMapCoordinates,
  // Segment/Route adapters
  adaptSegment,
  adaptRoute,
  adaptSearchResponse,
  // Utility functions
  getBestRoute,
  hasRoutes,
  getTransitSegments,
  getTotalWalkingDistance,
  // Types
  type AdaptedSegment,
  type AdaptedRoute,
  type AdaptedSearchResponse,
} from './RouteAdapter';
