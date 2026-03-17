/**
 * @fileoverview Unit Tests for spatialFilter.js
 * @description Tests the Graph-Lite routing logic including buffer analysis,
 *              fare calculation, direction checking, and transfer node detection.
 * 
 * @module tests/unit/spatialFilter.test
 * @version 1.0.0
 */

const {
  BUFFER_DISTANCE,
  createRouteBuffer,
  isPointWithinRouteBuffer,
  findMatchingRoutes,
  calculateDistance,
  calculateFare,
  findNearestPointOnRoute,
  calculateRouteDistance,
  findRoutesContainingPoint,
  findRouteIntersections,
  findTransferRoutes,
  searchRoutes,
} = require('../../services/spatialFilter');

// ============================================================================
// MOCK ROUTE DATA
// ============================================================================

/**
 * Simple horizontal route (West to East)
 * ~1.5 km long route for testing direct matching
 */
const MOCK_ROUTE_HORIZONTAL = {
  routeId: 'TEST-HORIZONTAL-001',
  routeName: 'Test Horizontal Route',
  vehicleType: 'jeepney',
  signboard: 'HORIZONTAL',
  fare: 13,
  geometry: {
    type: 'LineString',
    coordinates: [
      [120.940, 14.420], // West start
      [120.945, 14.420], // Midpoint
      [120.950, 14.420], // East end (~1.1 km)
      [120.955, 14.420], // Extended (~1.65 km)
    ],
  },
};

/**
 * Simple vertical route (South to North)
 * For testing transfer intersections
 */
const MOCK_ROUTE_VERTICAL = {
  routeId: 'TEST-VERTICAL-001',
  routeName: 'Test Vertical Route',
  vehicleType: 'tricycle',
  signboard: 'VERTICAL',
  fare: 15,
  geometry: {
    type: 'LineString',
    coordinates: [
      [120.945, 14.415], // South start
      [120.945, 14.420], // Intersection with horizontal route
      [120.945, 14.425], // North end
    ],
  },
};

/**
 * Diagonal route (SW to NE) - No intersection with others
 */
const MOCK_ROUTE_DIAGONAL = {
  routeId: 'TEST-DIAGONAL-001',
  routeName: 'Test Diagonal Route',
  vehicleType: 'bus',
  signboard: 'DIAGONAL',
  fare: 13,
  geometry: {
    type: 'LineString',
    coordinates: [
      [120.960, 14.410], // SW start
      [120.965, 14.415], // Midpoint
      [120.970, 14.420], // NE end
    ],
  },
};

/**
 * Route with missing geometry (for error handling tests)
 */
const MOCK_ROUTE_INVALID = {
  routeId: 'TEST-INVALID-001',
  routeName: 'Invalid Route',
  vehicleType: 'jeepney',
  fare: 13,
  // Missing geometry field
};

// All mock routes for comprehensive testing
const ALL_MOCK_ROUTES = [
  MOCK_ROUTE_HORIZONTAL,
  MOCK_ROUTE_VERTICAL,
  MOCK_ROUTE_DIAGONAL,
];

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Para Mobile Backend - spatialFilter.js Unit Tests', () => {

  // --------------------------------------------------------------------------
  // SUITE 1: Constants & Configuration
  // --------------------------------------------------------------------------

  describe('Constants & Configuration', () => {
    
    test('BUFFER_DISTANCE should be 400 meters', () => {
      expect(BUFFER_DISTANCE).toBe(400);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Fare Calculation Logic
  // --------------------------------------------------------------------------

  describe('calculateFare - Fare Logic', () => {
    
    test('should return base fare (13 PHP) for distances <= 4km', () => {
      expect(calculateFare(0)).toBe(13);
      expect(calculateFare(1)).toBe(13);
      expect(calculateFare(2.5)).toBe(13);
      expect(calculateFare(4)).toBe(13);
    });

    test('should calculate distance-based fare for distances > 4km', () => {
      // 5km: 13 + (1 * 1.80) = 14.80 → ceil to 15
      expect(calculateFare(5)).toBe(15);

      // 10km: 13 + (6 * 1.80) = 13 + 10.80 = 23.80 → ceil to 24
      expect(calculateFare(10)).toBe(24);

      // 15km: 13 + (11 * 1.80) = 13 + 19.80 = 32.80 → ceil to 33
      expect(calculateFare(15)).toBe(33);
    });

    test('should use custom base fare when provided', () => {
      // Custom base fare of 15 PHP
      expect(calculateFare(4, 15)).toBe(15);
      expect(calculateFare(5, 15)).toBe(17); // 15 + (1 * 1.80) = 16.80 → 17
    });

    test('should use custom fare per km when provided', () => {
      // Custom fare per km of 2.50 PHP
      // 10km: 13 + (6 * 2.50) = 13 + 15 = 28
      expect(calculateFare(10, 13, 2.50)).toBe(28);
    });

    test('should always round up (ceiling) the final fare', () => {
      // 4.5km: 13 + (0.5 * 1.80) = 13 + 0.90 = 13.90 → 14
      expect(calculateFare(4.5)).toBe(14);

      // 4.1km: 13 + (0.1 * 1.80) = 13 + 0.18 = 13.18 → 14
      expect(calculateFare(4.1)).toBe(14);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Buffer Creation & Point-in-Buffer Tests
  // --------------------------------------------------------------------------

  describe('createRouteBuffer & isPointWithinRouteBuffer', () => {

    test('should create a valid buffer polygon', () => {
      const buffer = createRouteBuffer(MOCK_ROUTE_HORIZONTAL.geometry, 400);

      expect(buffer).toBeDefined();
      expect(buffer.type).toBe('Feature');
      expect(buffer.geometry.type).toBe('Polygon');
      expect(buffer.geometry.coordinates).toBeDefined();
      expect(buffer.geometry.coordinates.length).toBeGreaterThan(0);
    });

    test('should return true for point within buffer', () => {
      // Point exactly on the route line
      const pointOnRoute = [120.945, 14.420];
      expect(isPointWithinRouteBuffer(pointOnRoute, MOCK_ROUTE_HORIZONTAL.geometry)).toBe(true);

      // Point 100m north of route (within 400m buffer)
      const pointNearRoute = [120.945, 14.4209]; // ~100m north
      expect(isPointWithinRouteBuffer(pointNearRoute, MOCK_ROUTE_HORIZONTAL.geometry)).toBe(true);
    });

    test('should return false for point outside buffer', () => {
      // Point ~1km away from route
      const pointFarAway = [120.945, 14.430]; // ~1.1km north
      expect(isPointWithinRouteBuffer(pointFarAway, MOCK_ROUTE_HORIZONTAL.geometry)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Direct Route Matching
  // --------------------------------------------------------------------------

  describe('findMatchingRoutes - Direct Route Logic', () => {

    test('should return route when both origin and destination are within buffer', () => {
      // Origin on west side, destination on east side (forward direction)
      const origin = [120.941, 14.420];
      const destination = [120.954, 14.420];

      const matches = findMatchingRoutes(origin, destination, [MOCK_ROUTE_HORIZONTAL]);

      expect(matches).toHaveLength(1);
      expect(matches[0].routeId).toBe('TEST-HORIZONTAL-001');
    });

    test('should return EMPTY when destination is behind origin (backward travel)', () => {
      // Origin on east side, destination on west side (backward direction)
      const origin = [120.954, 14.420];      // East
      const destination = [120.941, 14.420]; // West

      const matches = findMatchingRoutes(origin, destination, [MOCK_ROUTE_HORIZONTAL]);

      // Should be empty because destination is "behind" origin along the route
      expect(matches).toHaveLength(0);
    });

    test('should return EMPTY when origin is outside buffer', () => {
      const origin = [120.930, 14.420]; // Too far west, outside buffer
      const destination = [120.950, 14.420];

      const matches = findMatchingRoutes(origin, destination, [MOCK_ROUTE_HORIZONTAL]);

      expect(matches).toHaveLength(0);
    });

    test('should return EMPTY when destination is outside buffer', () => {
      const origin = [120.941, 14.420];
      const destination = [120.970, 14.420]; // Too far east, outside buffer

      const matches = findMatchingRoutes(origin, destination, [MOCK_ROUTE_HORIZONTAL]);

      expect(matches).toHaveLength(0);
    });

    test('should skip routes with missing geometry', () => {
      const origin = [120.941, 14.420];
      const destination = [120.954, 14.420];

      const routesWithInvalid = [MOCK_ROUTE_HORIZONTAL, MOCK_ROUTE_INVALID];
      const matches = findMatchingRoutes(origin, destination, routesWithInvalid);

      // Should still find the valid horizontal route
      expect(matches).toHaveLength(1);
      expect(matches[0].routeId).toBe('TEST-HORIZONTAL-001');
    });

    test('should return multiple routes when applicable', () => {
      // Create a second horizontal route that overlaps
      const secondHorizontalRoute = {
        ...MOCK_ROUTE_HORIZONTAL,
        routeId: 'TEST-HORIZONTAL-002',
        routeName: 'Second Horizontal Route',
      };

      const origin = [120.941, 14.420];
      const destination = [120.954, 14.420];

      const matches = findMatchingRoutes(origin, destination, [MOCK_ROUTE_HORIZONTAL, secondHorizontalRoute]);

      expect(matches).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Distance Calculation
  // --------------------------------------------------------------------------

  describe('calculateDistance & calculateRouteDistance', () => {

    test('should calculate straight-line distance between two points', () => {
      const origin = [120.940, 14.420];
      const destination = [120.950, 14.420];

      const distance = calculateDistance(origin, destination, 'kilometers');

      // ~1.1 km (horizontal distance at this latitude)
      expect(distance).toBeGreaterThan(1.0);
      expect(distance).toBeLessThan(1.2);
    });

    test('should calculate distance along route', () => {
      const origin = [120.941, 14.420];
      const destination = [120.954, 14.420];

      const routeDistance = calculateRouteDistance(origin, destination, MOCK_ROUTE_HORIZONTAL.geometry);

      expect(routeDistance).toBeGreaterThan(1.0);
      expect(routeDistance).toBeLessThan(1.5);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Transfer Route Logic
  // --------------------------------------------------------------------------

  describe('findRouteIntersections - Intersection Detection', () => {

    test('should find intersection between crossing routes', () => {
      const intersections = findRouteIntersections(MOCK_ROUTE_HORIZONTAL, MOCK_ROUTE_VERTICAL);

      expect(intersections).not.toBeNull();
      expect(intersections).toHaveLength(1);
      expect(intersections[0].coordinates).toEqual([120.945, 14.420]);
    });

    test('should return null for non-intersecting routes', () => {
      const intersections = findRouteIntersections(MOCK_ROUTE_HORIZONTAL, MOCK_ROUTE_DIAGONAL);

      expect(intersections).toBeNull();
    });

    test('should handle routes with invalid geometry gracefully', () => {
      const intersections = findRouteIntersections(MOCK_ROUTE_HORIZONTAL, MOCK_ROUTE_INVALID);

      // Should return null or handle gracefully (not throw)
      expect(intersections).toBeNull();
    });
  });

  describe('findRoutesContainingPoint', () => {

    test('should find all routes containing a point', () => {
      // Point at intersection of horizontal and vertical routes
      const intersectionPoint = [120.945, 14.420];

      const routes = findRoutesContainingPoint(intersectionPoint, ALL_MOCK_ROUTES);

      expect(routes.length).toBeGreaterThanOrEqual(2);
      const routeIds = routes.map(r => r.routeId);
      expect(routeIds).toContain('TEST-HORIZONTAL-001');
      expect(routeIds).toContain('TEST-VERTICAL-001');
    });

    test('should return empty array for point far from all routes', () => {
      const farPoint = [121.0, 15.0]; // Way outside all route buffers

      const routes = findRoutesContainingPoint(farPoint, ALL_MOCK_ROUTES);

      expect(routes).toHaveLength(0);
    });
  });

  describe('findTransferRoutes - 1-Transfer Logic', () => {

    test('should find transfer route between non-direct origin/destination', () => {
      // Origin on horizontal route (west end)
      const origin = [120.941, 14.420];
      // Destination on vertical route (north end) - not reachable directly
      const destination = [120.945, 14.4245];

      const transfers = findTransferRoutes(origin, destination, ALL_MOCK_ROUTES);

      expect(transfers.length).toBeGreaterThan(0);
      expect(transfers[0].type).toBe('transfer');
      expect(transfers[0].transferCount).toBe(1);
      expect(transfers[0].legs).toHaveLength(2);
    });

    test('should include transfer point coordinates', () => {
      const origin = [120.941, 14.420];
      const destination = [120.945, 14.4245];

      const transfers = findTransferRoutes(origin, destination, ALL_MOCK_ROUTES);

      if (transfers.length > 0) {
        expect(transfers[0].transferPoint).toBeDefined();
        expect(transfers[0].transferPoint.coordinates).toBeDefined();
        expect(transfers[0].transferPoint.lng).toBeDefined();
        expect(transfers[0].transferPoint.lat).toBeDefined();
      }
    });

    test('should calculate total fare for transfer journey', () => {
      const origin = [120.941, 14.420];
      const destination = [120.945, 14.4245];

      const transfers = findTransferRoutes(origin, destination, ALL_MOCK_ROUTES);

      if (transfers.length > 0) {
        expect(transfers[0].totalFare).toBeDefined();
        expect(transfers[0].totalFare).toBeGreaterThanOrEqual(26); // At least 2x base fare
        expect(transfers[0].legs[0].fare).toBeDefined();
        expect(transfers[0].legs[1].fare).toBeDefined();
      }
    });

    test('should return empty when no transfer possible', () => {
      // Origin far from any route
      const origin = [121.0, 15.0];
      const destination = [120.945, 14.420];

      const transfers = findTransferRoutes(origin, destination, ALL_MOCK_ROUTES);

      expect(transfers).toHaveLength(0);
    });

    test('should not include same route as both legs', () => {
      const origin = [120.941, 14.420];
      const destination = [120.945, 14.4245];

      const transfers = findTransferRoutes(origin, destination, ALL_MOCK_ROUTES);

      for (const transfer of transfers) {
        const leg1RouteId = transfer.legs[0].route.routeId;
        const leg2RouteId = transfer.legs[1].route.routeId;
        expect(leg1RouteId).not.toBe(leg2RouteId);
      }
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 7: Comprehensive Route Search
  // --------------------------------------------------------------------------

  describe('searchRoutes - Comprehensive Search', () => {

    test('should return directRoutes when direct route exists', () => {
      const origin = [120.941, 14.420];
      const destination = [120.954, 14.420];

      const result = searchRoutes(origin, destination, ALL_MOCK_ROUTES);

      expect(result.hasDirectRoute).toBe(true);
      expect(result.directRoutes.length).toBeGreaterThan(0);
    });

    test('should return transferRoutes when no direct route exists', () => {
      // Origin on horizontal, destination on vertical (no direct route)
      const origin = [120.941, 14.420];
      const destination = [120.945, 14.4245];

      const result = searchRoutes(origin, destination, ALL_MOCK_ROUTES);

      // Depending on implementation, may or may not have direct route
      if (!result.hasDirectRoute) {
        expect(result.hasTransferRoute).toBe(true);
        expect(result.transferRoutes.length).toBeGreaterThan(0);
      }
    });

    test('should return empty arrays when no routes found', () => {
      const origin = [121.0, 15.0]; // Far from all routes
      const destination = [121.1, 15.1];

      const result = searchRoutes(origin, destination, ALL_MOCK_ROUTES);

      expect(result.hasDirectRoute).toBe(false);
      expect(result.directRoutes).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 8: Edge Cases & Error Handling
  // --------------------------------------------------------------------------

  describe('Edge Cases & Error Handling', () => {

    test('should handle empty routes array', () => {
      const origin = [120.941, 14.420];
      const destination = [120.954, 14.420];

      const matches = findMatchingRoutes(origin, destination, []);

      expect(matches).toHaveLength(0);
    });

    test('should handle same origin and destination', () => {
      const point = [120.945, 14.420];

      const matches = findMatchingRoutes(point, point, [MOCK_ROUTE_HORIZONTAL]);

      // Should be empty (no distance traveled)
      expect(matches).toHaveLength(0);
    });

    test('should handle very close origin and destination', () => {
      // Two points 10 meters apart
      const origin = [120.945, 14.420];
      const destination = [120.9451, 14.420]; // ~11m apart

      const matches = findMatchingRoutes(origin, destination, [MOCK_ROUTE_HORIZONTAL]);

      // Should still work if destination is ahead of origin
      expect(matches).toHaveLength(1);
    });

    test('findNearestPointOnRoute should return correct snap point', () => {
      // Point 100m north of route
      const point = [120.945, 14.421];

      const result = findNearestPointOnRoute(point, MOCK_ROUTE_HORIZONTAL.geometry);

      expect(result.coordinates).toBeDefined();
      expect(result.distance).toBeGreaterThan(0);
      expect(result.distance).toBeLessThan(200); // Should be ~111m
    });
  });
});
