/**
 * Stopwatch Service
 * 
 * Tracks and stores real travel times for road segments.
 * Uses GPS traces from mobile app for automatic tracking.
 * Provides time estimates for A* algorithm.
 * 
 * Part of Phase 3: A* Pathfinder implementation.
 * 
 * @module services/StopwatchService
 * @version 1.0.0
 */

const SegmentTime = require('../models/SegmentTime');

/**
 * Default speed estimates (km/h) when no real data available
 */
const DEFAULT_SPEEDS = {
  jeep: { city: 15, highway: 25 },
  jeepney: { city: 15, highway: 25 },
  bus: { city: 20, highway: 40 },
  bus_aircon: { city: 20, highway: 40 },
  uv: { city: 25, highway: 50 },
  tricycle: { city: 12, highway: 12 },
  cab: { city: 25, highway: 50 },
  walking: { city: 4.5, highway: 4.5 }
};

class StopwatchService {
  constructor() {
    this.defaultSpeeds = DEFAULT_SPEEDS;
    console.log('[StopwatchService] Initialized with default speeds for', 
      Object.keys(this.defaultSpeeds).length, 'vehicle types');
  }

  /**
   * Record a completed segment (called when user finishes a segment)
   * @param {Object} data - Segment data
   * @param {string} data.routeId - Route ID
   * @param {string} data.fromNodeId - Starting node ID
   * @param {string} data.toNodeId - Ending node ID
   * @param {number} data.timeSeconds - Travel time in seconds
   * @param {string} data.vehicleType - Type of vehicle
   * @param {number} [data.distanceKm] - Distance in km (optional)
   * @returns {Promise<Object>} Recorded segment
   */
  async recordSegment(data) {
    const { routeId, fromNodeId, toNodeId, timeSeconds, vehicleType, distanceKm = 0 } = data;
    
    console.log(`[StopwatchService] Recording segment: ${routeId} ${fromNodeId} → ${toNodeId} (${timeSeconds}s)`);
    
    const segment = await SegmentTime.recordSample({
      routeId,
      fromNodeId,
      toNodeId,
      timeSeconds,
      vehicleType,
      distanceKm
    });
    
    return {
      routeId: segment.routeId,
      fromNodeId: segment.fromNodeId,
      toNodeId: segment.toNodeId,
      avgTimeSeconds: segment.avgTimeSeconds,
      sampleCount: segment.sampleCount
    };
  }

  /**
   * Get average time for a segment from recorded data
   * @param {string} routeId - Route ID
   * @param {string} fromNodeId - Starting node ID
   * @param {string} toNodeId - Ending node ID
   * @param {boolean} [useTimeOfDay=true] - Use time-of-day specific data
   * @returns {Promise<{ timeSeconds: number, source: string, sampleCount: number }|null>}
   */
  async getSegmentTime(routeId, fromNodeId, toNodeId, useTimeOfDay = true) {
    const segment = await SegmentTime.findOne({ routeId, fromNodeId, toNodeId });
    
    if (!segment || segment.sampleCount === 0) {
      return null;
    }

    if (useTimeOfDay) {
      const hour = new Date().getHours();
      const bucket = SegmentTime.getTimeOfDayBucket(hour);
      const bucketData = segment.timeOfDay[bucket];
      
      // Use time-of-day specific data if available (at least 3 samples)
      if (bucketData && bucketData.count >= 3) {
        return {
          timeSeconds: bucketData.avgSeconds,
          source: `recorded_${bucket}`,
          sampleCount: bucketData.count
        };
      }
    }

    // Fall back to overall average
    return {
      timeSeconds: segment.avgTimeSeconds,
      source: 'recorded_overall',
      sampleCount: segment.sampleCount
    };
  }

  /**
   * Get estimated time using default speed (fallback when no data)
   * @param {number} distanceKm - Distance in kilometers
   * @param {string} vehicleType - Type of vehicle
   * @param {string} [roadType='city'] - Road type ('city' or 'highway')
   * @returns {{ timeSeconds: number, timeMinutes: number, source: string }}
   */
  getEstimatedTime(distanceKm, vehicleType, roadType = 'city') {
    const speeds = this.defaultSpeeds[vehicleType] || this.defaultSpeeds.jeep;
    const speedKmh = speeds[roadType] || speeds.city;
    
    const timeHours = distanceKm / speedKmh;
    const timeMinutes = timeHours * 60;
    const timeSeconds = timeMinutes * 60;
    
    return {
      timeSeconds: Math.round(timeSeconds),
      timeMinutes: Math.round(timeMinutes * 10) / 10,  // 1 decimal place
      source: 'estimated',
      speedKmh
    };
  }

  /**
   * Get time for a segment (tries recorded data first, falls back to estimate)
   * @param {string} routeId - Route ID
   * @param {string} fromNodeId - Starting node ID
   * @param {string} toNodeId - Ending node ID
   * @param {number} distanceKm - Distance in km
   * @param {string} vehicleType - Type of vehicle
   * @returns {Promise<{ timeSeconds: number, timeMinutes: number, source: string }>}
   */
  async getTimeForSegment(routeId, fromNodeId, toNodeId, distanceKm, vehicleType) {
    // Try recorded data first
    const recorded = await this.getSegmentTime(routeId, fromNodeId, toNodeId);
    
    if (recorded) {
      return {
        timeSeconds: recorded.timeSeconds,
        timeMinutes: Math.round(recorded.timeSeconds / 6) / 10,
        source: recorded.source,
        sampleCount: recorded.sampleCount
      };
    }
    
    // Fall back to estimate
    return this.getEstimatedTime(distanceKm, vehicleType);
  }

  /**
   * Record multiple segments from a GPS trace (automatic tracking)
   * 
   * Accepts raw GPS coordinates and maps them to road nodes.
   * GPS points that are too far from the road network will be included
   * with a warning.
   * 
   * @param {Object} params - Recording parameters
   * @param {string} params.routeId - Route ID being tracked
   * @param {string} params.vehicleType - Type of vehicle
   * @param {Array<{lat: number, lon: number, timestamp: number}>} params.trace - GPS trace points
   * @param {Object} [params.graphService] - GraphService instance for GPS-to-node mapping
   * @param {number} [params.maxMappingDistanceKm=0.1] - Max distance to map GPS to node (km)
   * @returns {Promise<{ recordedSegments: number, skippedSegments: number, warnings: string[] }>}
   */
  async recordGPSTrace(params) {
    const { 
      routeId, 
      vehicleType, 
      trace, 
      graphService, 
      maxMappingDistanceKm = 0.1 
    } = params;
    
    const warnings = [];
    
    if (!trace || trace.length < 2) {
      return { recordedSegments: 0, skippedSegments: 0, warnings: ['Trace too short (< 2 points)'] };
    }

    // Map GPS points to road nodes
    const mappedTrace = [];
    
    for (let i = 0; i < trace.length; i++) {
      const point = trace[i];
      
      // Check if timestamp is valid
      if (typeof point.timestamp !== 'number') {
        warnings.push(`Point ${i}: Missing timestamp`);
        continue;
      }
      
      // Check if nodeId is already provided (legacy format / pre-mapped)
      if (point.nodeId) {
        mappedTrace.push({
          nodeId: point.nodeId,
          timestamp: point.timestamp,
        });
        continue;
      }
      
      // If no nodeId, we need lat/lon to map
      if (typeof point.lat !== 'number' || typeof point.lon !== 'number') {
        warnings.push(`Point ${i}: Missing both nodeId and lat/lon coordinates`);
        continue;
      }
      
      // If graphService provided, map GPS to nearest road node
      if (graphService && typeof graphService.findNearestNode === 'function') {
        const nearest = graphService.findNearestNode(point.lat, point.lon);
        
        if (!nearest || !nearest.nodeId) {
          warnings.push(`Point ${i}: No nearby road node found`);
          continue;
        }
        
        const distanceKm = nearest.distanceKm || 0;
        
        // Check if too far from road network
        if (distanceKm > maxMappingDistanceKm) {
          const distanceM = Math.round(distanceKm * 1000);
          warnings.push(`Point ${i}: ${distanceM}m from nearest road node (>${maxMappingDistanceKm * 1000}m threshold)`);
          // Include with warning rather than skip
        }
        
        mappedTrace.push({
          nodeId: nearest.nodeId,
          timestamp: point.timestamp,
          originalLat: point.lat,
          originalLon: point.lon,
          mappingDistanceKm: distanceKm,
        });
      } else {
        // No graphService to map GPS coordinates
        warnings.push(`Point ${i}: Has lat/lon but no graphService to map to nodes`);
      }
    }
    
    if (mappedTrace.length < 2) {
      return { 
        recordedSegments: 0, 
        skippedSegments: trace.length, 
        warnings: [...warnings, 'Not enough valid points after mapping'] 
      };
    }

    let recordedSegments = 0;
    let skippedSegments = 0;

    for (let i = 0; i < mappedTrace.length - 1; i++) {
      const from = mappedTrace[i];
      const to = mappedTrace[i + 1];
      
      // Calculate time difference in seconds
      const timeSeconds = Math.abs(to.timestamp - from.timestamp) / 1000;
      
      // Skip unrealistic times (< 1 second or > 1 hour per segment)
      if (timeSeconds < 1 || timeSeconds > 3600) {
        skippedSegments++;
        continue;
      }

      try {
        await this.recordSegment({
          routeId,
          fromNodeId: from.nodeId,
          toNodeId: to.nodeId,
          timeSeconds,
          vehicleType,
          distanceKm: from.distanceToNext || 0
        });
        recordedSegments++;
      } catch (error) {
        console.error(`[StopwatchService] Error recording segment: ${error.message}`);
        skippedSegments++;
      }
    }

    console.log(`[StopwatchService] GPS trace processed: ${recordedSegments} recorded, ${skippedSegments} skipped, ${warnings.length} warnings`);
    return { recordedSegments, skippedSegments, warnings };
  }

  /**
   * Get statistics for a route
   * @param {string} routeId - Route ID
   * @returns {Promise<Object>} Route statistics
   */
  async getRouteStats(routeId) {
    const segments = await SegmentTime.find({ routeId });
    
    if (segments.length === 0) {
      return {
        routeId,
        segmentCount: 0,
        totalSamples: 0,
        hasData: false
      };
    }

    const totalSamples = segments.reduce((sum, s) => sum + s.sampleCount, 0);
    const avgSamplesPerSegment = totalSamples / segments.length;
    
    return {
      routeId,
      segmentCount: segments.length,
      totalSamples,
      avgSamplesPerSegment: Math.round(avgSamplesPerSegment * 10) / 10,
      hasData: totalSamples > 0
    };
  }

  /**
   * Get default speed for a vehicle type
   * @param {string} vehicleType - Type of vehicle
   * @param {string} [roadType='city'] - Road type
   * @returns {number} Speed in km/h
   */
  getDefaultSpeed(vehicleType, roadType = 'city') {
    const speeds = this.defaultSpeeds[vehicleType] || this.defaultSpeeds.jeep;
    return speeds[roadType] || speeds.city;
  }

  /**
   * Get walking time estimate
   * @param {number} distanceKm - Distance in km
   * @returns {{ timeSeconds: number, timeMinutes: number }}
   */
  getWalkingTime(distanceKm) {
    const result = this.getEstimatedTime(distanceKm, 'walking');
    return {
      timeSeconds: result.timeSeconds,
      timeMinutes: result.timeMinutes
    };
  }
}

module.exports = StopwatchService;
