/**
 * A* Pathfinder Unit Tests
 * 
 * @module tests/unit/astar.test.js
 * @version 1.0.0
 */

const AStarPathfinder = require('../../services/AStarPathfinder');
const { OPTIMIZATION_MODES, SEGMENT_TYPES } = AStarPathfinder;
const FareCalculator = require('../../services/FareCalculator');
const StopwatchService = require('../../services/StopwatchService');

// Mock GraphService
const createMockGraphService = () => ({
  getConfig: jest.fn(() => ({
    transferPenaltyMinutes: 10,
    maxWalkingDistanceKm: 0.5,
    maxTransferWalkingKm: 0.2,
    walkingSpeedKmh: 4.5
  })),
  
  findNearestTransitNodes: jest.fn((lat, lon, maxDist, limit) => {
    // Return mock transit nodes near origin/destination
    if (lat === 14.42 && lon === 120.94) {
      return [
        { nodeId: 'entry1', lat: 14.421, lon: 120.941, distance: 0.15, transitRoutes: ['route1_out'] }
      ];
    }
    if (lat === 14.43 && lon === 120.95) {
      return [
        { nodeId: 'exit1', lat: 14.429, lon: 120.949, distance: 0.12, transitRoutes: ['route1_out'] }
      ];
    }
    return [];
  }),
  
  getTransitRoutesAtNode: jest.fn((nodeId) => {
    const transitMap = {
      'entry1': { transitRoutes: ['route1_out'], isTerminal: true, terminalFor: ['route1_out'] },
      'node2': { transitRoutes: ['route1_out', 'route2_out'], isTerminal: false, terminalFor: [] },
      'exit1': { transitRoutes: ['route1_out'], isTerminal: false, terminalFor: [] }
    };
    return transitMap[nodeId] || null;
  }),
  
  getRouteInfo: jest.fn((routeId) => {
    const routes = {
      'route1_out': {
        routeId: 'route1_out',
        routeName: 'Test Route 1',
        vehicleType: 'jeep',
        signboard: 'TR1',
        roadNodeSequence: ['entry1', 'node2', 'exit1'],
        totalDistanceKm: 1.5
      },
      'route2_out': {
        routeId: 'route2_out',
        routeName: 'Test Route 2',
        vehicleType: 'bus',
        signboard: 'TR2',
        roadNodeSequence: ['node2', 'node3', 'exit2'],
        totalDistanceKm: 2.0
      }
    };
    return routes[routeId] || null;
  }),
  
  getNodeCoords: jest.fn((nodeId) => {
    const coords = {
      'entry1': { lat: 14.421, lon: 120.941 },
      'node2': { lat: 14.425, lon: 120.945 },
      'exit1': { lat: 14.429, lon: 120.949 },
      'node3': { lat: 14.430, lon: 120.950 },
      'exit2': { lat: 14.432, lon: 120.952 }
    };
    return coords[nodeId] || null;
  }),
  
  getNeighbors: jest.fn((nodeId) => {
    const neighbors = {
      'entry1': { 'node2': 0.5 },
      'node2': { 'entry1': 0.5, 'exit1': 0.5 },
      'exit1': { 'node2': 0.5 }
    };
    return neighbors[nodeId] || null;
  })
});

// Mock StopwatchService to use estimates
jest.mock('../../services/StopwatchService', () => {
  return jest.fn().mockImplementation(() => ({
    getWalkingTime: jest.fn((distance) => ({
      timeSeconds: Math.round((distance / 4.5) * 3600),
      timeMinutes: Math.round((distance / 4.5) * 60 * 10) / 10
    })),
    getTimeForSegment: jest.fn((routeId, from, to, dist, type) => ({
      timeSeconds: Math.round((dist / 15) * 3600),
      timeMinutes: Math.round((dist / 15) * 60 * 10) / 10,
      source: 'estimated'
    })),
    getEstimatedTime: jest.fn((distance, vehicleType) => ({
      timeSeconds: Math.round((distance / 15) * 3600),
      timeMinutes: Math.round((distance / 15) * 60 * 10) / 10,
      source: 'estimated',
      speedKmh: 15
    }))
  }));
});

describe('AStarPathfinder', () => {
  let pathfinder;
  let mockGraphService;
  let fareCalculator;
  let stopwatchService;

  beforeEach(() => {
    mockGraphService = createMockGraphService();
    fareCalculator = new FareCalculator();
    stopwatchService = new StopwatchService();
    pathfinder = new AStarPathfinder(mockGraphService, fareCalculator, stopwatchService);
  });

  describe('initialization', () => {
    test('should initialize with required services', () => {
      expect(pathfinder.graphService).toBeDefined();
      expect(pathfinder.fareCalculator).toBeDefined();
      expect(pathfinder.stopwatchService).toBeDefined();
    });
  });

  describe('findPath', () => {
    test('should return error when no entry points found', async () => {
      mockGraphService.findNearestTransitNodes.mockReturnValue([]);
      
      const result = await pathfinder.findPath(0, 0, 1, 1);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('origin');
    });

    test('should return error when no exit points found', async () => {
      mockGraphService.findNearestTransitNodes
        .mockReturnValueOnce([{ nodeId: 'entry1', distance: 0.1, transitRoutes: ['route1'] }])
        .mockReturnValueOnce([]);
      
      const result = await pathfinder.findPath(14.42, 120.94, 0, 0);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('destination');
    });

    test('should find path with valid origin and destination', async () => {
      const result = await pathfinder.findPath(
        14.42, 120.94,  // Origin
        14.43, 120.95,  // Destination
        { mode: 'DISTANCE', maxResults: 1 }
      );
      
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.searchTimeMs).toBeDefined();
    });

    test('should include search time in results', async () => {
      const result = await pathfinder.findPath(14.42, 120.94, 14.43, 120.95);
      
      expect(result.searchTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('optimization modes', () => {
    test('TIME mode should be default', async () => {
      const result = await pathfinder.findPath(14.42, 120.94, 14.43, 120.95);
      
      expect(result.mode).toBe(OPTIMIZATION_MODES.TIME);
    });

    test('should accept DISTANCE mode', async () => {
      const result = await pathfinder.findPath(
        14.42, 120.94, 14.43, 120.95,
        { mode: OPTIMIZATION_MODES.DISTANCE }
      );
      
      expect(result.mode).toBe(OPTIMIZATION_MODES.DISTANCE);
    });

    test('should accept FARE mode', async () => {
      const result = await pathfinder.findPath(
        14.42, 120.94, 14.43, 120.95,
        { mode: OPTIMIZATION_MODES.FARE }
      );
      
      expect(result.mode).toBe(OPTIMIZATION_MODES.FARE);
    });
  });

  describe('result structure', () => {
    test('should include summary in results', async () => {
      const result = await pathfinder.findPath(14.42, 120.94, 14.43, 120.95);
      
      if (result.success && result.results.length > 0) {
        const path = result.results[0];
        expect(path.summary).toBeDefined();
        expect(path.summary.totalDistanceKm).toBeDefined();
        expect(path.summary.totalTimeMinutes).toBeDefined();
        expect(path.summary.totalFare).toBeDefined();
        expect(path.summary.transferCount).toBeDefined();
        expect(path.summary.walkingDistanceKm).toBeDefined();
      }
    });

    test('should include segments in results', async () => {
      const result = await pathfinder.findPath(14.42, 120.94, 14.43, 120.95);
      
      if (result.success && result.results.length > 0) {
        const path = result.results[0];
        expect(path.segments).toBeDefined();
        expect(Array.isArray(path.segments)).toBe(true);
      }
    });

    test('should rank results', async () => {
      const result = await pathfinder.findPath(14.42, 120.94, 14.43, 120.95);
      
      if (result.success && result.results.length > 0) {
        expect(result.results[0].rank).toBe(1);
      }
    });
  });

  describe('segment types', () => {
    test('SEGMENT_TYPES should be exported', () => {
      expect(SEGMENT_TYPES.WALK).toBe('WALK');
      expect(SEGMENT_TYPES.TRANSIT).toBe('TRANSIT');
      expect(SEGMENT_TYPES.TRANSFER).toBe('TRANSFER');
    });
  });
});

describe('FareCalculator integration with A*', () => {
  let fareCalculator;

  beforeEach(() => {
    fareCalculator = new FareCalculator();
  });

  test('should calculate transfer cost as additional base fare', () => {
    // First ride: 5km jeep = ₱14.80
    // Transfer: new base fare = ₱13
    // Second ride: 3km jeep = ₱13
    // Total: 14.80 + 13 = 27.80 (but second ride is separate fare)
    
    const fare1 = fareCalculator.calculateFare('jeep', 5);
    const fare2 = fareCalculator.calculateFare('jeep', 3);
    
    expect(fare1 + fare2).toBe(27.80);
  });
});

describe('StopwatchService integration with A*', () => {
  let stopwatchService;

  beforeEach(() => {
    stopwatchService = new StopwatchService();
  });

  test('should estimate walking time', () => {
    const result = stopwatchService.getWalkingTime(0.2);
    
    // 200m at 4.5km/h = ~2.67 minutes
    expect(result.timeMinutes).toBeCloseTo(2.7, 0);
  });
});
