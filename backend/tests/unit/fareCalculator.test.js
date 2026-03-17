/**
 * FareCalculator Unit Tests
 * 
 * @module tests/unit/fareCalculator.test.js
 * @version 1.0.0
 */

const FareCalculator = require('../../services/FareCalculator');

describe('FareCalculator', () => {
  let fareCalculator;

  beforeEach(() => {
    fareCalculator = new FareCalculator();
  });

  describe('calculateFare', () => {
    describe('jeepney fares', () => {
      test('should return base fare for distance within base distance', () => {
        // Jeep: ₱13 for first 4km
        expect(fareCalculator.calculateFare('jeep', 2)).toBe(13.00);
        expect(fareCalculator.calculateFare('jeep', 4)).toBe(13.00);
      });

      test('should calculate additional fare for distance exceeding base', () => {
        // Jeep: ₱13 + ₱1.80/km after 4km
        // 5km = 13 + (1 * 1.80) = 14.80
        expect(fareCalculator.calculateFare('jeep', 5)).toBe(14.80);
        
        // 10km = 13 + (6 * 1.80) = 13 + 10.80 = 23.80
        expect(fareCalculator.calculateFare('jeep', 10)).toBe(23.80);
      });

      test('should round up additional kilometers', () => {
        // 4.5km = 13 + (1 * 1.80) = 14.80 (ceil of 0.5 = 1)
        expect(fareCalculator.calculateFare('jeep', 4.5)).toBe(14.80);
      });
    });

    describe('bus fares', () => {
      test('should return base fare for regular bus', () => {
        expect(fareCalculator.calculateFare('bus', 3)).toBe(15.00);
        expect(fareCalculator.calculateFare('bus', 5)).toBe(15.00);
      });

      test('should calculate additional fare for regular bus', () => {
        // Bus: ₱15 + ₱2.65/km after 5km
        // 7km = 15 + (2 * 2.65) = 15 + 5.30 = 20.30
        expect(fareCalculator.calculateFare('bus', 7)).toBe(20.30);
      });

      test('should calculate aircon bus fare', () => {
        // Bus aircon: ₱18 for first 5km
        expect(fareCalculator.calculateFare('bus_aircon', 3)).toBe(18.00);
        
        // 8km = 18 + (3 * 3.00) = 18 + 9 = 27
        expect(fareCalculator.calculateFare('bus_aircon', 8)).toBe(27.00);
      });
    });

    describe('UV express fares', () => {
      test('should return base fare for UV', () => {
        expect(fareCalculator.calculateFare('uv', 2)).toBe(30.00);
        expect(fareCalculator.calculateFare('uv', 4)).toBe(30.00);
      });

      test('should calculate additional fare for UV', () => {
        // UV: ₱30 + ₱2.50/km after 4km
        // 6km = 30 + (2 * 2.50) = 30 + 5 = 35
        expect(fareCalculator.calculateFare('uv', 6)).toBe(35.00);
      });
    });

    describe('unknown vehicle type', () => {
      test('should fall back to jeep rates for unknown type', () => {
        expect(fareCalculator.calculateFare('unknown', 4)).toBe(13.00);
      });
    });
  });

  describe('calculateTotalFare', () => {
    test('should calculate total fare for multiple transit segments', () => {
      const segments = [
        { type: 'WALK', distanceKm: 0.2 },
        { type: 'TRANSIT', vehicleType: 'jeep', distanceKm: 5, routeId: 'route1' },
        { type: 'TRANSFER', distanceKm: 0.1 },
        { type: 'TRANSIT', vehicleType: 'jeep', distanceKm: 3, routeId: 'route2' }
      ];

      const result = fareCalculator.calculateTotalFare(segments);
      
      // First jeep: 5km = 13 + 1.80 = 14.80
      // Second jeep: 3km = 13 (within base)
      // Total = 14.80 + 13 = 27.80
      expect(result.total).toBe(27.80);
      expect(result.breakdown.length).toBe(2);
    });

    test('should return zero for walking-only journey', () => {
      const segments = [
        { type: 'WALK', distanceKm: 0.5 }
      ];

      const result = fareCalculator.calculateTotalFare(segments);
      expect(result.total).toBe(0);
      expect(result.breakdown.length).toBe(0);
    });
  });

  describe('getFareBreakdown', () => {
    test('should return detailed breakdown for jeep', () => {
      const breakdown = fareCalculator.getFareBreakdown('jeep', 7);
      
      expect(breakdown.vehicleType).toBe('jeep');
      expect(breakdown.distanceKm).toBe(7);
      expect(breakdown.baseFare).toBe(13.00);
      expect(breakdown.baseDistanceKm).toBe(4);
      expect(breakdown.additionalKm).toBe(3);
      expect(breakdown.additionalRate).toBe(1.80);
      expect(breakdown.additionalFare).toBe(5.40);
      expect(breakdown.totalFare).toBe(18.40);
    });
  });

  describe('utility methods', () => {
    test('getSupportedVehicleTypes should return all types', () => {
      const types = fareCalculator.getSupportedVehicleTypes();
      expect(types).toContain('jeep');
      expect(types).toContain('bus');
      expect(types).toContain('uv');
    });

    test('getAverageFarePerKm should return additional rate', () => {
      expect(fareCalculator.getAverageFarePerKm('jeep')).toBe(1.80);
      expect(fareCalculator.getAverageFarePerKm('bus')).toBe(2.65);
    });

    test('getBaseFare should return base fare', () => {
      expect(fareCalculator.getBaseFare('jeep')).toBe(13.00);
      expect(fareCalculator.getBaseFare('uv')).toBe(30.00);
    });
  });
});
