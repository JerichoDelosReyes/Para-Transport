/**
 * @fileoverview Integration Test: Backend → Stopwatch → Commute History
 * @description Tests the complete user journey: Search Route → Start Ride → Stop → Save to History
 * 
 * This test validates the data contract between:
 * - Backend: spatialFilter.js route objects (routeId, fare, vehicleType)
 * - Frontend: StopwatchService (timing logic)
 * - Storage: CommuteRecord schema (history persistence)
 * 
 * @module tests/integration.test
 * @version 1.0.0
 */

import { 
  StopwatchService, 
  generateId, 
  createCommuteSession,
  formatTime,
  formatDuration,
} from '../src/services/stopwatch';

import { 
  CommuteSession, 
  CommuteRecord,
  createCommuteRecord,
} from '../src/services/commuteHistory.design';

// ============================================================================
// MOCK BACKEND DATA
// ============================================================================

/**
 * Mock route data simulating the response from backend spatialFilter.js
 * These fields must match the actual backend contract
 */
const MOCK_ROUTE_DATA = {
  routeId: 'BDO-SMMOLINO-OUT',
  routeName: 'BDO Imus → SM Molino',
  vehicleType: 'jeepney' as const,
  fare: 13,
  geometry: {
    type: 'LineString',
    coordinates: [
      [120.9369, 14.4036],  // BDO Imus
      [120.9485, 14.4123],  // Midpoint
      [120.9612, 14.4201],  // SM Molino
    ],
  },
};

/**
 * Alternative mock for testing multiple routes
 */
const MOCK_ROUTE_DATA_2 = {
  routeId: 'IMUS-BACOOR-MAIN',
  routeName: 'Imus Palengke → Bacoor',
  vehicleType: 'tricycle' as const,
  fare: 20,
  geometry: {
    type: 'LineString',
    coordinates: [
      [120.9380, 14.4050],
      [120.9500, 14.4150],
    ],
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sleep helper for real-time tests (not using fake timers)
 */
const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Para Mobile Integration Tests', () => {
  
  // --------------------------------------------------------------------------
  // SUITE 1: StopwatchService Unit Tests
  // --------------------------------------------------------------------------
  
  describe('StopwatchService - Core Functionality', () => {
    let stopwatch: StopwatchService;
    
    beforeEach(() => {
      stopwatch = new StopwatchService();
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      stopwatch.dispose();
      jest.useRealTimers();
    });
    
    test('should initialize in stopped state', () => {
      expect(stopwatch.isRunning()).toBe(false);
      expect(stopwatch.isPaused()).toBe(false);
      expect(stopwatch.getElapsedTime()).toBe(0);
    });
    
    test('should start and track time correctly', () => {
      stopwatch.start();
      
      expect(stopwatch.isRunning()).toBe(true);
      expect(stopwatch.isPaused()).toBe(false);
      
      // Advance time by 5 seconds
      jest.advanceTimersByTime(5000);
      
      // Allow small margin for execution overhead
      const elapsed = stopwatch.getElapsedTime();
      expect(elapsed).toBeGreaterThanOrEqual(4900);
      expect(elapsed).toBeLessThanOrEqual(5200);
    });
    
    test('should pause and resume without losing time', () => {
      stopwatch.start();
      
      // Run for 2 seconds
      jest.advanceTimersByTime(2000);
      
      // Pause
      stopwatch.pause();
      expect(stopwatch.isPaused()).toBe(true);
      expect(stopwatch.isRunning()).toBe(false);
      
      const timeAtPause = stopwatch.getElapsedTime();
      
      // Advance time while paused (should not count)
      jest.advanceTimersByTime(3000);
      
      expect(stopwatch.getElapsedTime()).toBe(timeAtPause);
      
      // Resume
      stopwatch.resume();
      expect(stopwatch.isRunning()).toBe(true);
      expect(stopwatch.isPaused()).toBe(false);
      
      // Run for 1 more second
      jest.advanceTimersByTime(1000);
      
      // Total should be ~3 seconds (2 before pause + 1 after resume)
      const finalTime = stopwatch.getElapsedTime();
      expect(finalTime).toBeGreaterThanOrEqual(2900);
      expect(finalTime).toBeLessThanOrEqual(3200);
    });
    
    test('should stop and return final duration', () => {
      stopwatch.start();
      jest.advanceTimersByTime(4000);
      
      const duration = stopwatch.stop();
      
      expect(duration).toBeGreaterThanOrEqual(3900);
      expect(duration).toBeLessThanOrEqual(4200);
      expect(stopwatch.isRunning()).toBe(false);
      expect(stopwatch.isPaused()).toBe(false);
    });
    
    test('should reset to initial state', () => {
      stopwatch.start();
      jest.advanceTimersByTime(2000);
      stopwatch.pause();
      
      stopwatch.reset();
      
      expect(stopwatch.isRunning()).toBe(false);
      expect(stopwatch.isPaused()).toBe(false);
      expect(stopwatch.getElapsedTime()).toBe(0);
    });
    
    test('should format time correctly', () => {
      expect(formatTime(0)).toBe('00:00:00');
      expect(formatTime(1000)).toBe('00:00:01');
      expect(formatTime(65000)).toBe('00:01:05');
      expect(formatTime(3661000)).toBe('01:01:01');
    });
    
    test('should format duration correctly', () => {
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(65000)).toBe('1m 5s');
      expect(formatDuration(3661000)).toBe('1h 1m');
    });
    
    test('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });
  
  // --------------------------------------------------------------------------
  // SUITE 2: CommuteSession Factory Tests
  // --------------------------------------------------------------------------
  
  describe('CommuteSession - Factory Functions', () => {
    
    test('should create session with default values', () => {
      const session = createCommuteSession();
      
      expect(session.id).toBeTruthy();
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.duration).toBe(0);
      expect(session.isPaused).toBe(false);
      expect(session.pausedDuration).toBe(0);
    });
    
    test('should create session with route metadata', () => {
      const session = createCommuteSession({
        route: MOCK_ROUTE_DATA.routeName,
        routeId: MOCK_ROUTE_DATA.routeId,
        origin: 'BDO Imus',
        destination: 'SM Molino',
      });
      
      expect(session.route).toBe(MOCK_ROUTE_DATA.routeName);
      expect(session.routeId).toBe(MOCK_ROUTE_DATA.routeId);
      expect(session.origin).toBe('BDO Imus');
      expect(session.destination).toBe('SM Molino');
    });
    
    test('should allow overriding default values', () => {
      const customStartTime = new Date('2025-01-01T08:00:00Z');
      const session = createCommuteSession({
        startTime: customStartTime,
        duration: 5000,
        isPaused: true,
      });
      
      expect(session.startTime).toEqual(customStartTime);
      expect(session.duration).toBe(5000);
      expect(session.isPaused).toBe(true);
    });
  });
  
  // --------------------------------------------------------------------------
  // SUITE 3: CommuteRecord Creation Tests
  // --------------------------------------------------------------------------
  
  describe('CommuteRecord - History Schema', () => {
    
    test('should create record with required fields', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 600000); // 10 minutes later
      
      const record = createCommuteRecord({
        startTime,
        endTime,
        duration: 600000,
      });
      
      expect(record.id).toBeTruthy();
      expect(record.startTime).toEqual(startTime);
      expect(record.endTime).toEqual(endTime);
      expect(record.duration).toBe(600000);
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.updatedAt).toBeInstanceOf(Date);
    });
    
    test('should create record with backend route data', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 900000); // 15 minutes
      
      const record = createCommuteRecord({
        startTime,
        endTime,
        duration: 900000,
        route: MOCK_ROUTE_DATA.routeName,
        vehicleType: MOCK_ROUTE_DATA.vehicleType,
        fare: MOCK_ROUTE_DATA.fare,
      });
      
      expect(record.route).toBe(MOCK_ROUTE_DATA.routeName);
      expect(record.vehicleType).toBe('jeepney');
      expect(record.fare).toBe(13);
    });
    
    test('should preserve custom ID if provided', () => {
      const customId = 'custom-record-123';
      
      const record = createCommuteRecord({
        id: customId,
        startTime: new Date(),
        endTime: new Date(),
        duration: 5000,
      });
      
      expect(record.id).toBe(customId);
    });
  });
  
  // --------------------------------------------------------------------------
  // SUITE 4: Full Integration Test - User Journey
  // --------------------------------------------------------------------------
  
  describe('Integration: Search → Ride → Save Journey', () => {
    
    test('should complete full user journey with backend data', () => {
      jest.useFakeTimers();
      
      // ========== PHASE 1: User Searches & Selects Route ==========
      // (Simulating spatialFilter.js response)
      const selectedRoute = MOCK_ROUTE_DATA;
      
      expect(selectedRoute.routeId).toBe('BDO-SMMOLINO-OUT');
      expect(selectedRoute.fare).toBe(13);
      expect(selectedRoute.vehicleType).toBe('jeepney');
      
      // ========== PHASE 2: User Starts Ride ==========
      const stopwatch = new StopwatchService();
      const sessionStartTime = new Date();
      
      // Create session linked to backend route
      const session = createCommuteSession({
        route: selectedRoute.routeName,
        routeId: selectedRoute.routeId,
        origin: 'BDO Imus',
        destination: 'SM Molino',
        startTime: sessionStartTime,
      });
      
      stopwatch.start();
      
      // ========== PHASE 3: Simulate 10-Minute Ride ==========
      const RIDE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
      jest.advanceTimersByTime(RIDE_DURATION_MS);
      
      // ========== PHASE 4: User Stops Ride ==========
      const finalDuration = stopwatch.stop();
      const sessionEndTime = new Date(sessionStartTime.getTime() + finalDuration);
      
      // Validate duration
      expect(finalDuration).toBeGreaterThanOrEqual(RIDE_DURATION_MS - 100);
      expect(finalDuration).toBeLessThanOrEqual(RIDE_DURATION_MS + 100);
      
      // ========== PHASE 5: Save to History ==========
      const historyRecord = createCommuteRecord({
        id: session.id,
        startTime: session.startTime,
        endTime: sessionEndTime,
        duration: finalDuration,
        route: session.route,
        origin: session.origin,
        destination: session.destination,
        // Merge backend data
        vehicleType: selectedRoute.vehicleType,
        fare: selectedRoute.fare,
      });
      
      // ========== ASSERTIONS: Validate Data Contract ==========
      
      // Session data preserved
      expect(historyRecord.id).toBe(session.id);
      expect(historyRecord.startTime).toEqual(session.startTime);
      expect(historyRecord.route).toBe('BDO Imus → SM Molino');
      expect(historyRecord.origin).toBe('BDO Imus');
      expect(historyRecord.destination).toBe('SM Molino');
      
      // Duration matches stopwatch
      expect(historyRecord.duration).toBe(finalDuration);
      
      // Backend data preserved
      expect(historyRecord.vehicleType).toBe('jeepney');
      expect(historyRecord.fare).toBe(13);
      
      // Metadata generated
      expect(historyRecord.createdAt).toBeInstanceOf(Date);
      expect(historyRecord.updatedAt).toBeInstanceOf(Date);
      
      // Cleanup
      stopwatch.dispose();
      jest.useRealTimers();
    });
    
    test('should handle pause/resume during ride', () => {
      jest.useFakeTimers();
      
      const stopwatch = new StopwatchService();
      const selectedRoute = MOCK_ROUTE_DATA;
      
      const session = createCommuteSession({
        route: selectedRoute.routeName,
        routeId: selectedRoute.routeId,
      });
      
      // Start ride
      stopwatch.start();
      
      // Ride for 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);
      
      // Traffic stop - pause for 2 minutes
      stopwatch.pause();
      jest.advanceTimersByTime(2 * 60 * 1000);
      
      // Resume riding for 3 more minutes
      stopwatch.resume();
      jest.advanceTimersByTime(3 * 60 * 1000);
      
      // Stop
      const finalDuration = stopwatch.stop();
      
      // Total ACTIVE time should be ~8 minutes (5 + 3), NOT 10 minutes
      const expectedDuration = 8 * 60 * 1000;
      expect(finalDuration).toBeGreaterThanOrEqual(expectedDuration - 100);
      expect(finalDuration).toBeLessThanOrEqual(expectedDuration + 100);
      
      // Create history record
      const record = createCommuteRecord({
        id: session.id,
        startTime: session.startTime,
        endTime: new Date(),
        duration: finalDuration,
        route: session.route,
        vehicleType: selectedRoute.vehicleType,
        fare: selectedRoute.fare,
      });
      
      expect(record.duration).toBe(finalDuration);
      expect(record.fare).toBe(13);
      
      stopwatch.dispose();
      jest.useRealTimers();
    });
    
    test('should handle multiple sequential rides', () => {
      jest.useFakeTimers();
      
      const stopwatch = new StopwatchService();
      const records: CommuteRecord[] = [];
      
      // First ride
      const route1 = MOCK_ROUTE_DATA;
      stopwatch.start();
      jest.advanceTimersByTime(5 * 60 * 1000);
      const duration1 = stopwatch.stop();
      
      records.push(createCommuteRecord({
        startTime: new Date(),
        endTime: new Date(),
        duration: duration1,
        route: route1.routeName,
        fare: route1.fare,
        vehicleType: route1.vehicleType,
      }));
      
      // Reset and second ride
      stopwatch.reset();
      const route2 = MOCK_ROUTE_DATA_2;
      stopwatch.start();
      jest.advanceTimersByTime(7 * 60 * 1000);
      const duration2 = stopwatch.stop();
      
      records.push(createCommuteRecord({
        startTime: new Date(),
        endTime: new Date(),
        duration: duration2,
        route: route2.routeName,
        fare: route2.fare,
        vehicleType: route2.vehicleType,
      }));
      
      // Assertions
      expect(records).toHaveLength(2);
      expect(records[0].route).toBe('BDO Imus → SM Molino');
      expect(records[0].fare).toBe(13);
      expect(records[0].vehicleType).toBe('jeepney');
      expect(records[1].route).toBe('Imus Palengke → Bacoor');
      expect(records[1].fare).toBe(20);
      expect(records[1].vehicleType).toBe('tricycle');
      
      // IDs should be unique
      expect(records[0].id).not.toBe(records[1].id);
      
      stopwatch.dispose();
      jest.useRealTimers();
    });
  });
  
  // --------------------------------------------------------------------------
  // SUITE 5: Edge Cases & Error Handling
  // --------------------------------------------------------------------------
  
  describe('Edge Cases & Error Handling', () => {
    
    test('should handle zero-duration rides', () => {
      jest.useFakeTimers();
      
      const stopwatch = new StopwatchService();
      stopwatch.start();
      const duration = stopwatch.stop();
      
      // Should be valid even with minimal duration
      const record = createCommuteRecord({
        startTime: new Date(),
        endTime: new Date(),
        duration,
        route: MOCK_ROUTE_DATA.routeName,
      });
      
      expect(record.duration).toBeGreaterThanOrEqual(0);
      expect(record.id).toBeTruthy();
      
      stopwatch.dispose();
      jest.useRealTimers();
    });
    
    test('should handle missing optional fields', () => {
      const record = createCommuteRecord({
        startTime: new Date(),
        endTime: new Date(),
        duration: 5000,
        // No route, fare, vehicleType
      });
      
      expect(record.id).toBeTruthy();
      expect(record.duration).toBe(5000);
      expect(record.route).toBeUndefined();
      expect(record.fare).toBeUndefined();
      expect(record.vehicleType).toBeUndefined();
    });
    
    test('should handle negative time formatting gracefully', () => {
      // The formatTime function should handle edge cases
      expect(formatTime(-1000)).toBe('00:00:00');
      expect(formatDuration(-1000)).toBe('0s');
    });
    
    test('should not count time if never started', () => {
      const stopwatch = new StopwatchService();
      
      expect(stopwatch.getElapsedTime()).toBe(0);
      expect(stopwatch.isRunning()).toBe(false);
      
      // Stopping without starting should return 0
      const duration = stopwatch.stop();
      expect(duration).toBe(0);
      
      stopwatch.dispose();
    });
  });
  
  // --------------------------------------------------------------------------
  // SUITE 6: toCommuteSession Method Tests
  // --------------------------------------------------------------------------
  
  describe('StopwatchService.toCommuteSession()', () => {
    
    test('should generate session from current stopwatch state', () => {
      jest.useFakeTimers();
      
      const stopwatch = new StopwatchService();
      stopwatch.start();
      jest.advanceTimersByTime(3000);
      
      const session = stopwatch.toCommuteSession({
        route: MOCK_ROUTE_DATA.routeName,
        routeId: MOCK_ROUTE_DATA.routeId,
        origin: 'Start Point',
        destination: 'End Point',
      });
      
      expect(session.id).toBeTruthy();
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.duration).toBeGreaterThanOrEqual(2900);
      expect(session.duration).toBeLessThanOrEqual(3200);
      expect(session.route).toBe(MOCK_ROUTE_DATA.routeName);
      expect(session.routeId).toBe(MOCK_ROUTE_DATA.routeId);
      expect(session.origin).toBe('Start Point');
      expect(session.destination).toBe('End Point');
      expect(session.isPaused).toBe(false);
      
      stopwatch.dispose();
      jest.useRealTimers();
    });
    
    test('should reflect paused state in generated session', () => {
      jest.useFakeTimers();
      
      const stopwatch = new StopwatchService();
      stopwatch.start();
      jest.advanceTimersByTime(2000);
      stopwatch.pause();
      
      const session = stopwatch.toCommuteSession();
      
      expect(session.isPaused).toBe(true);
      
      stopwatch.dispose();
      jest.useRealTimers();
    });
  });
});

// ============================================================================
// REAL-TIME TEST (Optional - uses actual timers)
// ============================================================================

describe('Real-Time Integration (Optional)', () => {
  
  test.skip('should track real elapsed time (2 second test)', async () => {
    const stopwatch = new StopwatchService();
    
    stopwatch.start();
    await sleep(2000);
    const duration = stopwatch.stop();
    
    // Allow 200ms margin for execution overhead
    expect(duration).toBeGreaterThanOrEqual(1800);
    expect(duration).toBeLessThanOrEqual(2200);
    
    stopwatch.dispose();
  });
});
