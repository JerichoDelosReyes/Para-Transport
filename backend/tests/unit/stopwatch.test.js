/**
 * StopwatchService Unit Tests
 * 
 * @module tests/unit/stopwatch.test.js
 * @version 1.0.0
 */

const StopwatchService = require('../../services/StopwatchService');

// Mock SegmentTime model
jest.mock('../../models/SegmentTime', () => ({
  findOne: jest.fn(),
  recordSample: jest.fn(),
  find: jest.fn(),
  getTimeOfDayBucket: jest.fn((hour) => {
    if (hour >= 6 && hour < 9) return 'morning';
    if (hour >= 9 && hour < 16) return 'midday';
    if (hour >= 16 && hour < 20) return 'evening';
    return 'night';
  })
}));

const SegmentTime = require('../../models/SegmentTime');

describe('StopwatchService', () => {
  let stopwatchService;

  beforeEach(() => {
    stopwatchService = new StopwatchService();
    jest.clearAllMocks();
  });

  describe('getEstimatedTime', () => {
    test('should calculate time for jeep in city', () => {
      const result = stopwatchService.getEstimatedTime(3, 'jeep', 'city');
      
      // 3km at 15km/h = 0.2 hours = 12 minutes = 720 seconds
      expect(result.timeMinutes).toBe(12);
      expect(result.timeSeconds).toBe(720);
      expect(result.source).toBe('estimated');
      expect(result.speedKmh).toBe(15);
    });

    test('should calculate time for jeep on highway', () => {
      const result = stopwatchService.getEstimatedTime(5, 'jeep', 'highway');
      
      // 5km at 25km/h = 0.2 hours = 12 minutes
      expect(result.timeMinutes).toBe(12);
      expect(result.speedKmh).toBe(25);
    });

    test('should calculate time for bus', () => {
      const result = stopwatchService.getEstimatedTime(4, 'bus', 'city');
      
      // 4km at 20km/h = 0.2 hours = 12 minutes
      expect(result.timeMinutes).toBe(12);
      expect(result.speedKmh).toBe(20);
    });

    test('should calculate time for UV express', () => {
      const result = stopwatchService.getEstimatedTime(5, 'uv', 'city');
      
      // 5km at 25km/h = 0.2 hours = 12 minutes
      expect(result.timeMinutes).toBe(12);
      expect(result.speedKmh).toBe(25);
    });

    test('should calculate walking time', () => {
      const result = stopwatchService.getEstimatedTime(0.45, 'walking');
      
      // 0.45km at 4.5km/h = 0.1 hours = 6 minutes
      expect(result.timeMinutes).toBe(6);
      expect(result.speedKmh).toBe(4.5);
    });

    test('should fall back to jeep for unknown vehicle', () => {
      const result = stopwatchService.getEstimatedTime(3, 'unknown', 'city');
      
      expect(result.speedKmh).toBe(15); // Jeep city speed
    });
  });

  describe('getWalkingTime', () => {
    test('should calculate walking time correctly', () => {
      const result = stopwatchService.getWalkingTime(0.5);
      
      // 0.5km at 4.5km/h = ~6.67 minutes
      expect(result.timeMinutes).toBeCloseTo(6.7, 0);
      expect(result.timeSeconds).toBeGreaterThan(0);
    });
  });

  describe('getDefaultSpeed', () => {
    test('should return correct speeds for different vehicles', () => {
      expect(stopwatchService.getDefaultSpeed('jeep', 'city')).toBe(15);
      expect(stopwatchService.getDefaultSpeed('jeep', 'highway')).toBe(25);
      expect(stopwatchService.getDefaultSpeed('bus', 'city')).toBe(20);
      expect(stopwatchService.getDefaultSpeed('uv', 'highway')).toBe(50);
      expect(stopwatchService.getDefaultSpeed('walking')).toBe(4.5);
    });
  });

  describe('recordSegment', () => {
    test('should call SegmentTime.recordSample with correct data', async () => {
      SegmentTime.recordSample.mockResolvedValue({
        routeId: 'route1',
        fromNodeId: 'node1',
        toNodeId: 'node2',
        avgTimeSeconds: 120,
        sampleCount: 1
      });

      const result = await stopwatchService.recordSegment({
        routeId: 'route1',
        fromNodeId: 'node1',
        toNodeId: 'node2',
        timeSeconds: 120,
        vehicleType: 'jeep',
        distanceKm: 0.5
      });

      expect(SegmentTime.recordSample).toHaveBeenCalledWith({
        routeId: 'route1',
        fromNodeId: 'node1',
        toNodeId: 'node2',
        timeSeconds: 120,
        vehicleType: 'jeep',
        distanceKm: 0.5
      });
      expect(result.avgTimeSeconds).toBe(120);
    });
  });

  describe('getSegmentTime', () => {
    test('should return null when no data exists', async () => {
      SegmentTime.findOne.mockResolvedValue(null);

      const result = await stopwatchService.getSegmentTime('route1', 'node1', 'node2');
      
      expect(result).toBeNull();
    });

    test('should return recorded time when data exists', async () => {
      SegmentTime.findOne.mockResolvedValue({
        avgTimeSeconds: 180,
        sampleCount: 10,
        timeOfDay: {
          morning: { avgSeconds: 200, count: 2 },
          midday: { avgSeconds: 0, count: 0 },
          evening: { avgSeconds: 0, count: 0 },
          night: { avgSeconds: 0, count: 0 }
        }
      });

      const result = await stopwatchService.getSegmentTime('route1', 'node1', 'node2', false);
      
      expect(result.timeSeconds).toBe(180);
      expect(result.source).toBe('recorded_overall');
      expect(result.sampleCount).toBe(10);
    });
  });

  describe('getTimeForSegment', () => {
    test('should return recorded time when available', async () => {
      SegmentTime.findOne.mockResolvedValue({
        avgTimeSeconds: 120,
        sampleCount: 5,
        timeOfDay: {
          morning: { avgSeconds: 0, count: 0 },
          midday: { avgSeconds: 0, count: 0 },
          evening: { avgSeconds: 0, count: 0 },
          night: { avgSeconds: 0, count: 0 }
        }
      });

      const result = await stopwatchService.getTimeForSegment(
        'route1', 'node1', 'node2', 0.5, 'jeep'
      );
      
      expect(result.timeSeconds).toBe(120);
      expect(result.source).toBe('recorded_overall');
    });

    test('should fall back to estimate when no recorded data', async () => {
      SegmentTime.findOne.mockResolvedValue(null);

      const result = await stopwatchService.getTimeForSegment(
        'route1', 'node1', 'node2', 0.5, 'jeep'
      );
      
      expect(result.source).toBe('estimated');
      expect(result.timeMinutes).toBe(2); // 0.5km at 15km/h = 2 min
    });
  });

  describe('getRouteStats', () => {
    test('should return stats for route with data', async () => {
      SegmentTime.find.mockResolvedValue([
        { sampleCount: 10 },
        { sampleCount: 20 },
        { sampleCount: 5 }
      ]);

      const result = await stopwatchService.getRouteStats('route1');
      
      expect(result.routeId).toBe('route1');
      expect(result.segmentCount).toBe(3);
      expect(result.totalSamples).toBe(35);
      expect(result.hasData).toBe(true);
    });

    test('should return empty stats for route without data', async () => {
      SegmentTime.find.mockResolvedValue([]);

      const result = await stopwatchService.getRouteStats('route1');
      
      expect(result.segmentCount).toBe(0);
      expect(result.hasData).toBe(false);
    });
  });

  describe('recordGPSTrace', () => {
    test('should record valid segments from trace', async () => {
      SegmentTime.recordSample.mockResolvedValue({});

      // New format: object with routeId, vehicleType, trace (with nodeId already present)
      const trace = [
        { nodeId: 'node1', timestamp: 1000000 },
        { nodeId: 'node2', timestamp: 1060000 },  // 60 seconds later
        { nodeId: 'node3', timestamp: 1120000 }   // 60 seconds later
      ];

      const result = await stopwatchService.recordGPSTrace({
        routeId: 'route1',
        vehicleType: 'jeep',
        trace
      });
      
      expect(result.recordedSegments).toBe(2);
      expect(result.skippedSegments).toBe(0);
    });

    test('should skip unrealistic time segments', async () => {
      SegmentTime.recordSample.mockResolvedValue({});

      const trace = [
        { nodeId: 'node1', timestamp: 1000000 },
        { nodeId: 'node2', timestamp: 1000500 },  // 0.5 seconds - too fast
        { nodeId: 'node3', timestamp: 1060000 }
      ];

      const result = await stopwatchService.recordGPSTrace({
        routeId: 'route1',
        vehicleType: 'jeep',
        trace
      });
      
      expect(result.skippedSegments).toBeGreaterThan(0);
    });

    test('should handle empty trace', async () => {
      const result = await stopwatchService.recordGPSTrace({
        routeId: 'route1',
        vehicleType: 'jeep',
        trace: []
      });
      
      expect(result.recordedSegments).toBe(0);
      expect(result.skippedSegments).toBe(0);
      expect(result.warnings).toContain('Trace too short (< 2 points)');
    });

    test('should map GPS coordinates to nodes when graphService provided', async () => {
      SegmentTime.recordSample.mockResolvedValue({});
      
      // Mock graphService with findNearestNode
      const mockGraphService = {
        findNearestNode: jest.fn()
          .mockReturnValueOnce({ nodeId: 'mapped-node-1', distanceKm: 0.05 })
          .mockReturnValueOnce({ nodeId: 'mapped-node-2', distanceKm: 0.03 })
      };

      const trace = [
        { lat: 14.42, lon: 120.94, timestamp: 1000000 },
        { lat: 14.43, lon: 120.95, timestamp: 1060000 }
      ];

      const result = await stopwatchService.recordGPSTrace({
        routeId: 'route1',
        vehicleType: 'jeep',
        trace,
        graphService: mockGraphService
      });

      expect(mockGraphService.findNearestNode).toHaveBeenCalledTimes(2);
      expect(result.recordedSegments).toBe(1);
      expect(result.warnings.length).toBe(0);
    });

    test('should include warnings for GPS points far from road network', async () => {
      SegmentTime.recordSample.mockResolvedValue({});
      
      const mockGraphService = {
        findNearestNode: jest.fn()
          .mockReturnValueOnce({ nodeId: 'node-1', distanceKm: 0.05 })  // Within threshold
          .mockReturnValueOnce({ nodeId: 'node-2', distanceKm: 0.15 })  // > 100m threshold
      };

      const trace = [
        { lat: 14.42, lon: 120.94, timestamp: 1000000 },
        { lat: 14.43, lon: 120.95, timestamp: 1060000 }
      ];

      const result = await stopwatchService.recordGPSTrace({
        routeId: 'route1',
        vehicleType: 'jeep',
        trace,
        graphService: mockGraphService
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('150m from nearest road node');
    });
  });
});
