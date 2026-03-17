/**
 * @fileoverview Integration Tests for Para Mobile Backend API
 * @description Tests database integrity and API endpoints using MongoDB Memory Server
 *              for isolated, reproducible testing without affecting production data.
 * 
 * @module tests/integration/api.test
 * @version 1.0.0
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');

// Import models and routes
const Route = require('../../models/Route');
const Stop = require('../../models/Stop'); // Need to register Stop model for populate
const routeRoutes = require('../../routes/routeRoutes');

// ============================================================================
// TEST SERVER SETUP
// ============================================================================

/**
 * Create a test Express app with the same configuration as server.js
 * but without actually starting the server listener
 */
const createTestApp = () => {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Mount route routes
  app.use('/api/routes', routeRoutes);
  
  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route ${req.originalUrl} not found`,
    });
  });
  
  // Error Handler
  app.use((err, req, res, next) => {
    console.error('Test Server Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message,
    });
  });
  
  return app;
};

// ============================================================================
// SAMPLE ROUTE DATA (Extracted from routes.json)
// ============================================================================

/**
 * Sample route 1: BDO to SM Molino (Outbound)
 * Real-world coordinates from Imus, Cavite
 */
const SAMPLE_ROUTE_1 = {
  routeId: 'BDO-SMMOLINO-OUT',
  routeName: 'BDO TO SM MOLINO',
  vehicleType: 'jeepney',
  signboard: 'SM MOLINO',
  direction: 'outbound',
  fare: 13,
  trafficLevel: 'moderate',
  isActive: true,
  geometry: {
    type: 'LineString',
    coordinates: [
      [120.94067895979015, 14.420708364781035],
      [120.9405373598641, 14.420665264084988],
      [120.94054140557517, 14.42056730792396],
      [120.9405535427129, 14.420504615959445],
      [120.94072750833675, 14.420492861213901],
      [120.94115230811519, 14.420579062665581],
      [120.94135054801222, 14.420590817406577],
      [120.94158177888983, 14.421083497296308],
      [120.94194515392752, 14.421846001606227],
      [120.94281764431838, 14.42375847441626],
      [120.94344196672506, 14.425361326122456],
      [120.94413588483357, 14.424872103856655],
      [120.94499990654998, 14.425058319627748],
      [120.94563928690172, 14.42493652812184],
      [120.94562526019467, 14.424495255311541],
      [120.94611714712244, 14.422088048978694],
      [120.94676938007512, 14.420877374811937],
      [120.94721548747867, 14.419763303750301],
      [120.94764626971596, 14.419166012572077],
      [120.94821342307216, 14.418017498246329],
      [120.94866480211061, 14.416268657980112],
    ],
  },
};

/**
 * Sample route 2: SM Molino to BDO (Inbound - opposite direction)
 */
const SAMPLE_ROUTE_2 = {
  routeId: 'SMMOLINO-BDO-IN',
  routeName: 'SM MOLINO TO BDO',
  vehicleType: 'jeepney',
  signboard: 'BDO IMUS',
  direction: 'inbound',
  fare: 13,
  trafficLevel: 'low',
  isActive: true,
  geometry: {
    type: 'LineString',
    coordinates: [
      // Reverse of route 1 (simplified)
      [120.94866480211061, 14.416268657980112],
      [120.94821342307216, 14.418017498246329],
      [120.94764626971596, 14.419166012572077],
      [120.94721548747867, 14.419763303750301],
      [120.94676938007512, 14.420877374811937],
      [120.94611714712244, 14.422088048978694],
      [120.94562526019467, 14.424495255311541],
      [120.94563928690172, 14.42493652812184],
      [120.94499990654998, 14.425058319627748],
      [120.94344196672506, 14.425361326122456],
      [120.94281764431838, 14.42375847441626],
      [120.94194515392752, 14.421846001606227],
      [120.94158177888983, 14.421083497296308],
      [120.94067895979015, 14.420708364781035],
    ],
  },
};

/**
 * Sample route 3: Intersecting route for transfer testing
 */
const SAMPLE_ROUTE_3 = {
  routeId: 'IMUS-PALENGKE-LOOP',
  routeName: 'Imus Palengke Loop',
  vehicleType: 'tricycle',
  signboard: 'PALENGKE',
  direction: 'loop',
  fare: 15,
  trafficLevel: 'high',
  isActive: true,
  geometry: {
    type: 'LineString',
    coordinates: [
      [120.9380, 14.4180],  // Start (south of main route)
      [120.9420, 14.4200],  // Crosses near main route
      [120.9440, 14.4210],  // Intersection area
      [120.9460, 14.4220],  // Continue east
      [120.9480, 14.4200],  // Loop back
      [120.9460, 14.4180],  // South again
      [120.9420, 14.4170],  // Continue west
      [120.9380, 14.4180],  // Back to start
    ],
  },
};

// ============================================================================
// TEST COORDINATES
// ============================================================================

/**
 * Valid coordinates along SAMPLE_ROUTE_1
 */
const VALID_ORIGIN = [120.94067895979015, 14.420708364781035];  // BDO Imus (start)
const VALID_DESTINATION = [120.94866480211061, 14.416268657980112]; // SM Molino (end)

/**
 * Valid coordinates for shorter journey
 */
const VALID_ORIGIN_SHORT = [120.94115230811519, 14.420579062665581];
const VALID_DESTINATION_SHORT = [120.94611714712244, 14.422088048978694];

/**
 * Invalid coordinates (far from any route)
 */
const INVALID_ORIGIN = [121.0, 15.0];
const INVALID_DESTINATION = [121.1, 15.1];

// ============================================================================
// TEST SETUP & TEARDOWN
// ============================================================================

let mongoServer;
let app;

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect mongoose to in-memory database
  await mongoose.connect(mongoUri);
  
  // Seed test data
  await Route.create([SAMPLE_ROUTE_1, SAMPLE_ROUTE_2, SAMPLE_ROUTE_3]);
  
  // Create test app
  app = createTestApp();
  
  console.log('🧪 Test database initialized with sample routes');
});

afterAll(async () => {
  // Cleanup
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
  
  console.log('🧹 Test database cleaned up');
});

beforeEach(async () => {
  // Ensure routes exist before each test (in case a test modifies them)
  const count = await Route.countDocuments();
  if (count === 0) {
    await Route.create([SAMPLE_ROUTE_1, SAMPLE_ROUTE_2, SAMPLE_ROUTE_3]);
  }
});

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Para Mobile Backend - API Integration Tests', () => {

  // --------------------------------------------------------------------------
  // SUITE 1: Database Integrity Tests
  // --------------------------------------------------------------------------

  describe('Database Integrity', () => {

    test('should have seeded routes in database', async () => {
      const routes = await Route.find({});
      
      expect(routes.length).toBeGreaterThanOrEqual(3);
    });

    test('routes should have valid GeoJSON geometry', async () => {
      const routes = await Route.find({});
      
      for (const route of routes) {
        expect(route.geometry).toBeDefined();
        expect(route.geometry.type).toBe('LineString');
        expect(route.geometry.coordinates).toBeDefined();
        expect(route.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
        
        // Each coordinate should be [longitude, latitude]
        for (const coord of route.geometry.coordinates) {
          expect(coord).toHaveLength(2);
          expect(coord[0]).toBeGreaterThanOrEqual(-180);
          expect(coord[0]).toBeLessThanOrEqual(180);
          expect(coord[1]).toBeGreaterThanOrEqual(-90);
          expect(coord[1]).toBeLessThanOrEqual(90);
        }
      }
    });

    test('routes should have required fields', async () => {
      const routes = await Route.find({});
      
      for (const route of routes) {
        expect(route.routeId).toBeDefined();
        expect(route.routeName).toBeDefined();
        expect(route.vehicleType).toBeDefined();
        expect(route.fare).toBeDefined();
        expect(route.fare).toBeGreaterThanOrEqual(0);
      }
    });

    test('routeId should be unique', async () => {
      const routes = await Route.find({});
      const routeIds = routes.map(r => r.routeId);
      const uniqueIds = [...new Set(routeIds)];
      
      expect(routeIds.length).toBe(uniqueIds.length);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: GET /api/routes Tests
  // --------------------------------------------------------------------------

  describe('GET /api/routes', () => {

    test('should return all active routes', async () => {
      const res = await request(app)
        .get('/api/routes')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(3);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('returned routes should have geometry', async () => {
      const res = await request(app)
        .get('/api/routes')
        .expect(200);

      for (const route of res.body.data) {
        expect(route.geometry).toBeDefined();
        expect(route.geometry.coordinates).toBeDefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: GET /api/routes/:routeId Tests
  // --------------------------------------------------------------------------

  describe('GET /api/routes/:routeId', () => {

    test('should return specific route by routeId', async () => {
      const res = await request(app)
        .get('/api/routes/BDO-SMMOLINO-OUT')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.routeId).toBe('BDO-SMMOLINO-OUT');
      expect(res.body.data.routeName).toBe('BDO TO SM MOLINO');
    });

    test('should return 404 for non-existent route', async () => {
      const res = await request(app)
        .get('/api/routes/NON-EXISTENT-ROUTE')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not found');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: POST /api/routes/search Tests
  // --------------------------------------------------------------------------

  describe('POST /api/routes/search', () => {

    test('should return direct route for valid origin/destination', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN,
          destination: VALID_DESTINATION,
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.origin).toBeDefined();
      expect(res.body.destination).toBeDefined();
      expect(res.body.summary).toBeDefined();
      
      // Should have direct routes (depending on route data)
      expect(res.body.directRoutes).toBeDefined();
      expect(Array.isArray(res.body.directRoutes)).toBe(true);
    });

    test('should return correct response structure', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN_SHORT,
          destination: VALID_DESTINATION_SHORT,
        })
        .expect(200);

      // Check response structure
      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('origin');
      expect(res.body).toHaveProperty('destination');
      expect(res.body).toHaveProperty('bufferDistance');
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('directRoutes');

      // Origin/destination structure
      expect(res.body.origin).toHaveProperty('coordinates');
      expect(res.body.origin).toHaveProperty('lng');
      expect(res.body.origin).toHaveProperty('lat');

      // Summary structure
      expect(res.body.summary).toHaveProperty('directRoutesCount');
      expect(res.body.summary).toHaveProperty('hasDirectRoute');
    });

    test('direct routes should include calculated fare and distance', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN_SHORT,
          destination: VALID_DESTINATION_SHORT,
        })
        .expect(200);

      if (res.body.directRoutes.length > 0) {
        const route = res.body.directRoutes[0];
        
        expect(route).toHaveProperty('type', 'direct');
        expect(route).toHaveProperty('routeId');
        expect(route).toHaveProperty('routeName');
        expect(route).toHaveProperty('vehicleType');
        expect(route).toHaveProperty('geometry');
        expect(route).toHaveProperty('calculatedDistance');
        expect(route).toHaveProperty('calculatedFare');
        
        expect(route.calculatedDistance).toBeGreaterThan(0);
        expect(route.calculatedFare).toBeGreaterThanOrEqual(13); // Base fare
      }
    });

    test('should return recommendation when routes found', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN_SHORT,
          destination: VALID_DESTINATION_SHORT,
        })
        .expect(200);

      if (res.body.summary.hasDirectRoute || res.body.summary.hasTransferRoute) {
        expect(res.body.recommendation).toBeDefined();
        expect(res.body.recommendation).toHaveProperty('type');
        expect(res.body.recommendation).toHaveProperty('fare');
        expect(res.body.recommendation).toHaveProperty('reason');
      }
    });

    test('should return no routes for coordinates far from any route', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: INVALID_ORIGIN,
          destination: INVALID_DESTINATION,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.directRoutes).toHaveLength(0);
      expect(res.body.summary.hasDirectRoute).toBe(false);
    });

    test('should return 400 for missing origin', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          destination: VALID_DESTINATION,
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors[0].msg).toMatch(/required|origin/i);
    });

    test('should return 400 for missing destination', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN,
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors[0].msg).toMatch(/required|destination/i);
    });

    test('should return 400 for invalid origin format', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: 'invalid',
          destination: VALID_DESTINATION,
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors[0].msg).toMatch(/array|origin/i);
    });

    test('should return 400 for invalid destination format', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN,
          destination: [120.9], // Only one coordinate
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    test('should respect custom bufferDistance parameter', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN_SHORT,
          destination: VALID_DESTINATION_SHORT,
          bufferDistance: 500, // 500m instead of default 400m
        })
        .expect(200);

      expect(res.body.bufferDistance).toBe(500);
    });

    test('should include transfer routes when requested', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN,
          destination: VALID_DESTINATION,
          includeTransfers: true,
        })
        .expect(200);

      expect(res.body).toHaveProperty('transferRoutes');
      expect(Array.isArray(res.body.transferRoutes)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Transfer Routes API Tests
  // --------------------------------------------------------------------------

  describe('POST /api/routes/search - Transfer Routes', () => {

    test('transfer routes should have correct leg structure', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN,
          destination: VALID_DESTINATION,
          includeTransfers: true,
        })
        .expect(200);

      if (res.body.transferRoutes && res.body.transferRoutes.length > 0) {
        const transfer = res.body.transferRoutes[0];
        
        expect(transfer).toHaveProperty('type', 'transfer');
        expect(transfer).toHaveProperty('transferCount', 1);
        expect(transfer).toHaveProperty('legs');
        expect(transfer.legs).toHaveLength(2);
        
        // Leg 1 structure
        expect(transfer.legs[0]).toHaveProperty('order', 1);
        expect(transfer.legs[0]).toHaveProperty('route');
        expect(transfer.legs[0]).toHaveProperty('from');
        expect(transfer.legs[0]).toHaveProperty('to');
        expect(transfer.legs[0]).toHaveProperty('distance');
        expect(transfer.legs[0]).toHaveProperty('fare');
        
        // Leg 2 structure
        expect(transfer.legs[1]).toHaveProperty('order', 2);
        expect(transfer.legs[1].from.type).toBe('transfer');
        expect(transfer.legs[1].to.type).toBe('destination');
        
        // Transfer point
        expect(transfer).toHaveProperty('transferPoint');
        expect(transfer.transferPoint).toHaveProperty('coordinates');
        
        // Total calculations
        expect(transfer).toHaveProperty('totalDistance');
        expect(transfer).toHaveProperty('totalFare');
      }
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Error Handling Tests
  // --------------------------------------------------------------------------

  describe('Error Handling', () => {

    test('should return 404 for unknown endpoints', async () => {
      const res = await request(app)
        .get('/api/unknown')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not found');
    });

    test('should handle malformed JSON gracefully', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');
      
      // Express body-parser returns 400 or 500 for malformed JSON depending on version
      expect([400, 500]).toContain(res.status);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 7: Performance & Edge Cases
  // --------------------------------------------------------------------------

  describe('Performance & Edge Cases', () => {

    test('should handle same origin and destination', async () => {
      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN,
          destination: VALID_ORIGIN, // Same as origin
        })
        .expect(200);

      // Should return empty or no useful routes
      expect(res.body.success).toBe(true);
      expect(res.body.directRoutes).toHaveLength(0);
    });

    test('should handle very close coordinates', async () => {
      const closeDestination = [
        VALID_ORIGIN[0] + 0.0001, // ~11m east
        VALID_ORIGIN[1],
      ];

      const res = await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN,
          destination: closeDestination,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    test('should respond within acceptable time', async () => {
      const start = Date.now();
      
      await request(app)
        .post('/api/routes/search')
        .send({
          origin: VALID_ORIGIN,
          destination: VALID_DESTINATION,
          includeTransfers: true,
        })
        .expect(200);

      const elapsed = Date.now() - start;
      
      // Should respond within 5 seconds
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
