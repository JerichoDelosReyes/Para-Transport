/**
 * Commute Routes API Test Suite
 * 
 * Phase 4: API Integration Tests
 * 
 * @module tests/unit/commuteRoutes.test
 */

const express = require('express');
const request = require('supertest');

// Mock config
const mockConfig = {
  transferPenaltyMinutes: 10,
  maxWalkingDistanceKm: 0.5,
  maxTransferWalkingKm: 0.3,
  routeMappingToleranceKm: 0.1,
  walkingSpeedKmh: 4.5,
};

const mockRoutes = [
  {
    routeId: 'BDO-SMMOLINO-OUT',
    routeName: 'BDO TO SM MOLINO',
    vehicleType: 'jeep',
    signboard: 'SM MOLINO',
    direction: 'outbound',
    startTerminal: 'BDO Imus',
    endTerminal: 'SM Molino',
  },
  {
    routeId: 'MANGGAHAN-SMMOLINO-IN',
    routeName: 'MANGGAHAN TO SM MOLINO',
    vehicleType: 'jeep',
    signboard: 'MANGGAHAN',
    direction: 'inbound',
    startTerminal: 'Manggahan',
    endTerminal: 'SM Molino',
  },
];

const mockNearbyNodes = [
  {
    nodeId: 'osm_12345',
    lat: 14.4207,
    lon: 120.9407,
    distance: 0.05,
    transitRoutes: ['BDO-SMMOLINO-OUT'],
    isTerminal: false,
  },
];

const mockSearchResults = {
  success: true,
  results: [
    {
      rank: 1,
      summary: {
        totalTimeMinutes: 25,
        totalFare: 26,
        totalDistanceKm: 5.5,
        transferCount: 1,
      },
      segments: [
        { type: 'WALK', distanceKm: 0.1, timeMinutes: 1.5 },
        { type: 'TRANSIT', routeId: 'BDO-SMMOLINO-OUT', distanceKm: 5.0, fare: 13 },
        { type: 'WALK', distanceKm: 0.1, timeMinutes: 1.5 },
      ],
    },
  ],
  searchTimeMs: 50,
};

// Mock GraphService
jest.mock('../../services/GraphService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(),
    getConfig: jest.fn().mockReturnValue(mockConfig),
    getAllRoutes: jest.fn().mockReturnValue(mockRoutes),
    getRouteInfo: jest.fn().mockImplementation(id => mockRoutes.find(r => r.routeId === id)),
    findNearestTransitNodes: jest.fn().mockReturnValue(mockNearbyNodes),
  }));
});

// Mock AStarPathfinder
jest.mock('../../services/AStarPathfinder', () => {
  return jest.fn().mockImplementation(() => ({
    findPath: jest.fn().mockResolvedValue(mockSearchResults),
  }));
});

// Mock FareCalculator
jest.mock('../../services/FareCalculator', () => {
  return jest.fn().mockImplementation(() => ({
    getSupportedVehicleTypes: jest.fn().mockReturnValue(['jeep', 'bus', 'uv', 'tricycle']),
    getFareBreakdown: jest.fn().mockReturnValue({
      vehicleType: 'jeep',
      distanceKm: 5,
      baseFare: 13,
      additionalFare: 1.8,
      totalFare: 14.8,
    }),
  }));
});

// Mock StopwatchService
jest.mock('../../services/StopwatchService', () => {
  return jest.fn().mockImplementation(() => ({
    recordGPSTrace: jest.fn().mockResolvedValue({
      recordedSegments: 5,
      skippedSegments: 1,
    }),
  }));
});

// Now import the router after mocks are set up
const commuteRouter = require('../../routes/commuteRoutes');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/commutes', commuteRouter);

describe('Phase 4: Commute Routes API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/commutes/search', () => {
    test('should find routes between two points', async () => {
      const response = await request(app)
        .post('/api/commutes/search')
        .send({
          origin: { lat: 14.4207, lon: 120.9407 },
          destination: { lat: 14.3841, lon: 120.9777 },
          mode: 'TIME',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.routes).toBeDefined();
      expect(response.body.data.summary.mode).toBe('TIME');
    });

    test('should return 400 for missing origin', async () => {
      const response = await request(app)
        .post('/api/commutes/search')
        .send({
          destination: { lat: 14.3841, lon: 120.9777 },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should return 400 for invalid coordinates', async () => {
      const response = await request(app)
        .post('/api/commutes/search')
        .send({
          origin: { lat: 'invalid', lon: 120.9407 },
          destination: { lat: 14.3841, lon: 120.9777 },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should accept different optimization modes', async () => {
      for (const mode of ['TIME', 'FARE', 'DISTANCE']) {
        const response = await request(app)
          .post('/api/commutes/search')
          .send({
            origin: { lat: 14.4207, lon: 120.9407 },
            destination: { lat: 14.3841, lon: 120.9777 },
            mode,
          });

        expect(response.status).toBe(200);
        expect(response.body.data.summary.mode).toBe(mode);
      }
    });

    test('should return 400 for invalid mode', async () => {
      const response = await request(app)
        .post('/api/commutes/search')
        .send({
          origin: { lat: 14.4207, lon: 120.9407 },
          destination: { lat: 14.3841, lon: 120.9777 },
          mode: 'INVALID',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/commutes/routes', () => {
    test('should list all transit routes', async () => {
      const response = await request(app).get('/api/commutes/routes');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.routes).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
    });

    test('should filter by vehicleType', async () => {
      const response = await request(app)
        .get('/api/commutes/routes')
        .query({ vehicleType: 'jeep' });

      expect(response.status).toBe(200);
      expect(response.body.data.filters.vehicleType).toBe('jeep');
    });

    test('should filter by direction', async () => {
      const response = await request(app)
        .get('/api/commutes/routes')
        .query({ direction: 'outbound' });

      expect(response.status).toBe(200);
      expect(response.body.data.filters.direction).toBe('outbound');
    });
  });

  describe('GET /api/commutes/nearby', () => {
    test('should find nearby transit stops', async () => {
      const response = await request(app)
        .get('/api/commutes/nearby')
        .query({ lat: 14.4207, lon: 120.9407 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toBeDefined();
    });

    test('should return 400 for missing coordinates', async () => {
      const response = await request(app)
        .get('/api/commutes/nearby')
        .query({ lat: 14.4207 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should accept custom radius and limit', async () => {
      const response = await request(app)
        .get('/api/commutes/nearby')
        .query({ lat: 14.4207, lon: 120.9407, radius: 1.0, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data.radius).toBe(1.0);
    });
  });

  describe('GET /api/commutes/config', () => {
    test('should return routing configuration', async () => {
      const response = await request(app).get('/api/commutes/config');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transferPenaltyMinutes).toBe(10);
      expect(response.body.data.maxWalkingDistanceKm).toBe(0.5);
      expect(response.body.data.supportedVehicleTypes).toBeDefined();
    });
  });

  describe('GET /api/commutes/fare', () => {
    test('should calculate fare for given distance', async () => {
      const response = await request(app)
        .get('/api/commutes/fare')
        .query({ vehicleType: 'jeep', distanceKm: 5 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalFare).toBeDefined();
    });

    test('should return 400 for missing parameters', async () => {
      const response = await request(app)
        .get('/api/commutes/fare')
        .query({ vehicleType: 'jeep' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/commutes/stopwatch', () => {
    test('should record GPS trace data', async () => {
      const response = await request(app)
        .post('/api/commutes/stopwatch')
        .send({
          routeId: 'BDO-SMMOLINO-OUT',
          vehicleType: 'jeep',
          trace: [
            { lat: 14.4207, lon: 120.9407, timestamp: Date.now() - 60000 },
            { lat: 14.4210, lon: 120.9410, timestamp: Date.now() },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.recordedSegments).toBeDefined();
    });

    test('should return 400 for missing routeId', async () => {
      const response = await request(app)
        .post('/api/commutes/stopwatch')
        .send({
          vehicleType: 'jeep',
          trace: [{ lat: 14.4207, lon: 120.9407, timestamp: Date.now() }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should return 400 for invalid trace', async () => {
      const response = await request(app)
        .post('/api/commutes/stopwatch')
        .send({
          routeId: 'BDO-SMMOLINO-OUT',
          vehicleType: 'jeep',
          trace: [{ lat: 14.4207, lon: 120.9407, timestamp: Date.now() }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  // Legacy endpoint tests
  describe('POST /api/commutes (legacy session save)', () => {
    test('should save commute session', async () => {
      const response = await request(app)
        .post('/api/commutes')
        .send({
          id: 'session-123',
          startTime: new Date().toISOString(),
          duration: 1800000,
          route: { routeName: 'BDO TO SM MOLINO' },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('session-123');
    });
  });

  describe('GET /api/commutes (legacy session list)', () => {
    test('should list saved sessions', async () => {
      const response = await request(app).get('/api/commutes');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });
});
