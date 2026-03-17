/**
 * Fare Service
 * 
 * Handles fare calculation between origin and destination locations.
 * Uses existing spatialFilter for route matching and distance calculation.
 * 
 * Architecture:
 * - Works offline using local route data and geocoding
 * - Backend-ready: Can be swapped to real API endpoint when available
 * - Clean interface that mirrors future backend API structure
 * 
 * @module services/fareService
 */

import { geocodeLocation } from './routeSearch';
import {
  searchRoutes,
  calculateRouteDistance,
  calculateFare,
  RouteDocument,
} from './spatialFilter';
import { GeoJSONCoordinate, RouteGeometry } from '../types/route';
import { DEFAULT_FARE_RATES } from '../config/constants';

// Import route data for route matching
import routesData from '../data/routes.json';

// =============================================================================
// Types
// =============================================================================

/**
 * Fare calculation request
 */
export interface FareRequest {
  origin: string;
  destination: string;
}

/**
 * Fare breakdown details
 */
export interface FareBreakdown {
  baseFare: number;
  baseDistance: number;
  additionalDistance: number;
  additionalFare: number;
  totalFare: number;
}

/**
 * Route info in fare response
 */
export interface FareRouteInfo {
  routeId: string;
  routeName: string;
  vehicleType: string;
  signboard: string;
}

/**
 * Successful fare calculation response
 */
export interface FareResponse {
  success: true;
  data: {
    distance: number;
    fare: number;
    route: FareRouteInfo;
    breakdown: FareBreakdown;
    originName: string;
    destinationName: string;
  };
}

/**
 * Error codes for fare calculation
 */
export type FareErrorCode =
  | 'GEOCODING_FAILED'
  | 'NO_ROUTE_FOUND'
  | 'INVALID_INPUT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Error response from fare calculation
 */
export interface FareErrorResponse {
  success: false;
  error: {
    code: FareErrorCode;
    message: string;
  };
}

/**
 * Combined fare calculation result
 */
export type FareResult = FareResponse | FareErrorResponse;

// =============================================================================
// Configuration
// =============================================================================

/**
 * Toggle between local calculation and backend API
 * Set to true when backend is ready
 */
const USE_BACKEND_API = false;

/**
 * Backend API endpoint (for future use)
 */
const FARE_API_ENDPOINT = 'https://api.para.app/fare/calculate';

/**
 * Simulated API delay for realistic UX (milliseconds)
 */
const SIMULATED_DELAY = 800;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate fare breakdown from distance
 */
const calculateFareBreakdown = (distance: number): FareBreakdown => {
  const { BASE_FARE, BASE_DISTANCE_KM, ADDITIONAL_RATE_PER_KM } = DEFAULT_FARE_RATES;

  if (distance <= BASE_DISTANCE_KM) {
    return {
      baseFare: BASE_FARE,
      baseDistance: BASE_DISTANCE_KM,
      additionalDistance: 0,
      additionalFare: 0,
      totalFare: BASE_FARE,
    };
  }

  const additionalDistance = distance - BASE_DISTANCE_KM;
  const additionalFare = additionalDistance * ADDITIONAL_RATE_PER_KM;
  const totalFare = Math.ceil(BASE_FARE + additionalFare);

  return {
    baseFare: BASE_FARE,
    baseDistance: BASE_DISTANCE_KM,
    additionalDistance,
    additionalFare,
    totalFare,
  };
};

/**
 * Simulate network delay for realistic UX
 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Find a route that services both origin and destination
 * Uses buffer analysis from spatialFilter
 */
const findMatchingRoute = (
  originCoord: GeoJSONCoordinate,
  destinationCoord: GeoJSONCoordinate
): RouteDocument | null => {
  // Parse routes from GeoJSON format
  const routeFeatures = (routesData as any).features || [];
  const routes: RouteDocument[] = routeFeatures.map((feature: any) => ({
    routeId: feature.properties?.routeId || feature.id || '',
    routeName: feature.properties?.routeName || '',
    vehicleType: feature.properties?.vehicleType || 'jeep',
    signboard: feature.properties?.signboard || '',
    direction: feature.properties?.direction,
    geometry: feature.geometry,
  }));

  // Use the spatialFilter searchRoutes to find matching routes
  const result = searchRoutes(originCoord, destinationCoord, routes, 500);

  if (result.directRoutes.length > 0) {
    return result.directRoutes[0];
  }

  return null;
};

// =============================================================================
// Main API
// =============================================================================

/**
 * Calculate fare between two locations
 * 
 * @param request - Origin and destination location strings
 * @returns FareResult with fare breakdown or error
 * 
 * @example
 * const result = await calculateFareBetween({
 *   origin: 'Imus',
 *   destination: 'Bacoor'
 * });
 * 
 * if (result.success) {
 *   console.log('Fare:', result.data.fare);
 * } else {
 *   console.log('Error:', result.error.message);
 * }
 */
export const calculateFareBetween = async (
  request: FareRequest
): Promise<FareResult> => {
  const { origin, destination } = request;

  // Validate input
  if (!origin?.trim() || !destination?.trim()) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Please enter both origin and destination.',
      },
    };
  }

  // Simulate API delay for realistic UX
  await delay(SIMULATED_DELAY);

  // If using backend API (future implementation)
  if (USE_BACKEND_API) {
    try {
      const response = await fetch(FARE_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ origin, destination }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Unable to connect to server. Please check your internet connection.',
        },
      };
    }
  }

  // Local calculation (current implementation)
  try {
    console.log('[FareService] Starting fare calculation...');
    console.log('[FareService] Origin:', origin);
    console.log('[FareService] Destination:', destination);

    // Step 1: Geocode origin
    console.log('[FareService] Step 1: Geocoding origin...');
    const originResult = await geocodeLocation(origin);
    console.log('[FareService] Origin result:', originResult);
    
    if (!originResult || originResult.confidence < 0.5) {
      console.log('[FareService] Origin geocoding failed or low confidence');
      return {
        success: false,
        error: {
          code: 'GEOCODING_FAILED',
          message: `We couldn't find "${origin}". Please try a more specific location name like "SM Molino" or "Robinsons Paliparan".`,
        },
      };
    }

    // Step 2: Geocode destination
    console.log('[FareService] Step 2: Geocoding destination...');
    const destResult = await geocodeLocation(destination);
    console.log('[FareService] Destination result:', destResult);
    
    if (!destResult || destResult.confidence < 0.5) {
      console.log('[FareService] Destination geocoding failed or low confidence');
      return {
        success: false,
        error: {
          code: 'GEOCODING_FAILED',
          message: `We couldn't find "${destination}". Please try a more specific location name like "SM Molino" or "Robinsons Paliparan".`,
        },
      };
    }

    // Step 3: Find matching route
    console.log('[FareService] Step 3: Finding matching route...');
    const matchingRoute = findMatchingRoute(
      originResult.coordinate,
      destResult.coordinate
    );
    console.log('[FareService] Matching route:', matchingRoute?.routeName || 'None found');

    if (!matchingRoute) {
      return {
        success: false,
        error: {
          code: 'NO_ROUTE_FOUND',
          message: `No jeepney route found between "${originResult.displayName}" and "${destResult.displayName}". Try nearby landmarks or major destinations.`,
        },
      };
    }

    // Step 4: Calculate distance along route
    const distance = calculateRouteDistance(
      originResult.coordinate,
      destResult.coordinate,
      matchingRoute.geometry
    );

    // Step 5: Calculate fare breakdown
    const breakdown = calculateFareBreakdown(distance);

    // Step 6: Return success response
    return {
      success: true,
      data: {
        distance: Math.round(distance * 10) / 10, // Round to 1 decimal
        fare: breakdown.totalFare,
        route: {
          routeId: matchingRoute.routeId,
          routeName: matchingRoute.routeName,
          vehicleType: matchingRoute.vehicleType,
          signboard: matchingRoute.signboard,
        },
        breakdown,
        originName: originResult.displayName,
        destinationName: destResult.displayName,
      },
    };
  } catch (error) {
    console.error('[FareService] Calculation error:', error);
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'Something went wrong. Please try again.',
      },
    };
  }
};

// =============================================================================
// Exports
// =============================================================================

export default {
  calculateFareBetween,
};
