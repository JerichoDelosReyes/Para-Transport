/**
 * Fare Calculator Service
 * 
 * Calculates transit fares based on vehicle type and distance.
 * Uses Philippine standard fare matrices.
 * 
 * Part of Phase 3: A* Pathfinder implementation.
 * 
 * @module services/FareCalculator
 * @version 1.0.0
 */

/**
 * Fare structure per vehicle type
 * Based on LTFRB standard rates
 */
const FARE_MATRIX = {
  jeep: {
    baseFare: 13.00,      // ₱13.00
    baseDistanceKm: 4,    // First 4 km
    additionalPerKm: 1.80 // ₱1.80 per additional km
  },
  jeepney: {
    baseFare: 13.00,      // Same as jeep
    baseDistanceKm: 4,
    additionalPerKm: 1.80
  },
  bus: {
    baseFare: 15.00,
    baseDistanceKm: 5,
    additionalPerKm: 2.65
  },
  bus_aircon: {
    baseFare: 18.00,
    baseDistanceKm: 5,
    additionalPerKm: 3.00
  },
  uv: {
    baseFare: 30.00,
    baseDistanceKm: 4,
    additionalPerKm: 2.50
  },
  tricycle: {
    baseFare: 15.00,
    baseDistanceKm: 2,
    additionalPerKm: 5.00
  },
  cab: {
    baseFare: 40.00,      // Flag down rate
    baseDistanceKm: 0.5,  // First 500m
    additionalPerKm: 13.50
  }
};

class FareCalculator {
  constructor() {
    this.fareMatrix = FARE_MATRIX;
    console.log('[FareCalculator] Initialized with', Object.keys(this.fareMatrix).length, 'vehicle types');
  }

  /**
   * Calculate fare for a single segment
   * @param {string} vehicleType - Type of vehicle (jeep, bus, etc.)
   * @param {number} distanceKm - Distance in kilometers
   * @returns {number} Fare in Philippine Peso
   */
  calculateFare(vehicleType, distanceKm) {
    const matrix = this.fareMatrix[vehicleType];
    
    if (!matrix) {
      console.warn(`[FareCalculator] Unknown vehicle type: ${vehicleType}, using jeep rates`);
      return this.calculateFare('jeep', distanceKm);
    }

    if (distanceKm <= matrix.baseDistanceKm) {
      return matrix.baseFare;
    }

    const additionalKm = distanceKm - matrix.baseDistanceKm;
    const additionalFare = Math.ceil(additionalKm) * matrix.additionalPerKm;
    
    return matrix.baseFare + additionalFare;
  }

  /**
   * Calculate total fare for a journey with multiple segments
   * Each transit segment incurs its own fare (transfers = multiple fares)
   * @param {Array<Object>} segments - Array of segment objects
   * @returns {{ total: number, breakdown: Array }}
   */
  calculateTotalFare(segments) {
    const breakdown = [];
    let total = 0;

    for (const segment of segments) {
      // Only transit segments have fares (walking is free)
      if (segment.type === 'TRANSIT') {
        const fare = this.calculateFare(segment.vehicleType, segment.distanceKm);
        breakdown.push({
          routeId: segment.routeId,
          routeName: segment.routeName,
          vehicleType: segment.vehicleType,
          distanceKm: segment.distanceKm,
          fare
        });
        total += fare;
      }
    }

    return { total, breakdown };
  }

  /**
   * Get detailed fare breakdown for a single trip
   * @param {string} vehicleType - Type of vehicle
   * @param {number} distanceKm - Distance in kilometers
   * @returns {Object} Fare breakdown
   */
  getFareBreakdown(vehicleType, distanceKm) {
    const matrix = this.fareMatrix[vehicleType] || this.fareMatrix.jeep;
    
    const baseFare = matrix.baseFare;
    const baseDistanceKm = Math.min(distanceKm, matrix.baseDistanceKm);
    const additionalKm = Math.max(0, distanceKm - matrix.baseDistanceKm);
    const additionalFare = Math.ceil(additionalKm) * matrix.additionalPerKm;
    const totalFare = baseFare + additionalFare;

    return {
      vehicleType,
      distanceKm,
      baseFare,
      baseDistanceKm,
      additionalKm: Math.ceil(additionalKm),
      additionalRate: matrix.additionalPerKm,
      additionalFare,
      totalFare
    };
  }

  /**
   * Get the fare matrix for a vehicle type
   * @param {string} vehicleType - Type of vehicle
   * @returns {Object|null} Fare matrix
   */
  getFareMatrix(vehicleType) {
    return this.fareMatrix[vehicleType] || null;
  }

  /**
   * Get all supported vehicle types
   * @returns {string[]} Array of vehicle type names
   */
  getSupportedVehicleTypes() {
    return Object.keys(this.fareMatrix);
  }

  /**
   * Get average fare per km for a vehicle type
   * Used by A* heuristic in FARE mode
   * @param {string} vehicleType - Type of vehicle
   * @returns {number} Average fare per km
   */
  getAverageFarePerKm(vehicleType) {
    const matrix = this.fareMatrix[vehicleType] || this.fareMatrix.jeep;
    // Use additional rate as average (more accurate for longer trips)
    return matrix.additionalPerKm;
  }

  /**
   * Get base fare for a vehicle type (used for transfer cost calculation)
   * @param {string} vehicleType - Type of vehicle
   * @returns {number} Base fare
   */
  getBaseFare(vehicleType) {
    const matrix = this.fareMatrix[vehicleType] || this.fareMatrix.jeep;
    return matrix.baseFare;
  }
}

module.exports = FareCalculator;
