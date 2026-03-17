/**
 * A* Pathfinder Service
 * 
 * Main pathfinding algorithm for transit routing.
 * Supports three optimization modes: TIME, FARE, DISTANCE.
 * Returns top 3 alternative routes.
 * 
 * Part of Phase 3: A* Pathfinder implementation.
 * 
 * @module services/AStarPathfinder
 * @version 1.0.0
 */

/**
 * Optimization modes
 */
const OPTIMIZATION_MODES = {
  TIME: 'TIME',
  FARE: 'FARE',
  DISTANCE: 'DISTANCE'
};

/**
 * Segment types
 */
const SEGMENT_TYPES = {
  WALK: 'WALK',
  TRANSIT: 'TRANSIT',
  TRANSFER: 'TRANSFER'
};

/**
 * Priority Queue implementation (Min-Heap)
 */
class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  push(item, priority) {
    this.heap.push({ item, priority });
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._bubbleDown(0);
    }
    return top.item;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[index].priority) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < length && this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }
      if (rightChild < length && this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

/**
 * Calculate Haversine distance between two coordinates
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class AStarPathfinder {
  /**
   * @param {Object} graphService - GraphService instance
   * @param {Object} fareCalculator - FareCalculator instance
   * @param {Object} stopwatchService - StopwatchService instance
   */
  constructor(graphService, fareCalculator, stopwatchService) {
    this.graphService = graphService;
    this.fareCalculator = fareCalculator;
    this.stopwatchService = stopwatchService;
    
    console.log('[AStarPathfinder] Initialized');
  }

  /**
   * Find optimal paths from origin to destination
   * @param {number} originLat - Origin latitude
   * @param {number} originLon - Origin longitude
   * @param {number} destLat - Destination latitude
   * @param {number} destLon - Destination longitude
   * @param {Object} [options] - Search options
   * @param {string} [options.mode='TIME'] - Optimization mode
   * @param {number} [options.maxResults=3] - Maximum number of results
   * @returns {Promise<Object>} Search results
   */
  async findPath(originLat, originLon, destLat, destLon, options = {}) {
    const startTime = Date.now();
    const mode = options.mode || OPTIMIZATION_MODES.TIME;
    const maxResults = options.maxResults || 3;
    
    console.log(`[AStarPathfinder] Finding path: (${originLat}, ${originLon}) → (${destLat}, ${destLon})`);
    console.log(`[AStarPathfinder] Mode: ${mode}, Max results: ${maxResults}`);

    // Get config
    const config = this.graphService.getConfig();
    const maxWalkingKm = options.maxWalkingKm || config.maxWalkingDistanceKm;
    const maxTransferWalkingKm = options.maxTransferWalkingKm || config.maxTransferWalkingKm;
    const transferPenaltyMin = config.transferPenaltyMinutes;

    // Step 1: Find transit entry points near origin
    const entryPoints = this.graphService.findNearestTransitNodes(
      originLat, originLon, maxWalkingKm, 5
    );

    if (entryPoints.length === 0) {
      console.log('[AStarPathfinder] No transit entry points found near origin');
      return {
        success: false,
        error: 'No transit routes found near origin',
        results: []
      };
    }

    // Step 2: Find transit exit points near destination
    const exitPoints = this.graphService.findNearestTransitNodes(
      destLat, destLon, maxWalkingKm, 5
    );

    if (exitPoints.length === 0) {
      console.log('[AStarPathfinder] No transit exit points found near destination');
      return {
        success: false,
        error: 'No transit routes found near destination',
        results: []
      };
    }

    console.log(`[AStarPathfinder] Entry points: ${entryPoints.length}, Exit points: ${exitPoints.length}`);

    // Step 3: Run A* for each mode variant to get diverse results
    const allPaths = [];
    
    // Primary search with requested mode
    const primaryPath = await this._astarSearch(
      originLat, originLon, destLat, destLon,
      entryPoints, exitPoints, mode, config
    );
    
    if (primaryPath) {
      allPaths.push(primaryPath);
    }

    // Get alternative paths with different modes
    const alternativeModes = Object.values(OPTIMIZATION_MODES).filter(m => m !== mode);
    
    for (const altMode of alternativeModes) {
      const altPath = await this._astarSearch(
        originLat, originLon, destLat, destLon,
        entryPoints, exitPoints, altMode, config
      );
      
      if (altPath && !this._isDuplicatePath(altPath, allPaths)) {
        allPaths.push(altPath);
      }
      
      if (allPaths.length >= maxResults) break;
    }

    // Step 4: Sort and rank results
    const rankedResults = this._rankResults(allPaths, mode);
    
    const elapsed = Date.now() - startTime;
    console.log(`[AStarPathfinder] Search completed in ${elapsed}ms, found ${rankedResults.length} paths`);

    return {
      success: rankedResults.length > 0,
      searchTimeMs: elapsed,
      mode,
      results: rankedResults.slice(0, maxResults)
    };
  }

  /**
   * Core A* search algorithm
   * @private
   */
  async _astarSearch(originLat, originLon, destLat, destLon, entryPoints, exitPoints, mode, config) {
    const openSet = new PriorityQueue();
    const closedSet = new Map(); // nodeId:routeId -> best cost
    const cameFrom = new Map();  // For path reconstruction
    
    // Create exit point set for quick lookup
    const exitNodeIds = new Set(exitPoints.map(p => p.nodeId));

    // Initialize with walking to entry points
    for (const entry of entryPoints) {
      const walkDist = entry.distance;
      const walkTime = this.stopwatchService.getWalkingTime(walkDist);
      const walkCost = this._calculateCost(walkDist, walkTime.timeMinutes, 0, mode, 'walking');
      
      const state = {
        nodeId: entry.nodeId,
        routeId: null,  // Walking, not on transit yet
        g: walkCost,
        h: this._heuristic(entry.lat, entry.lon, destLat, destLon, mode),
        walkFromOrigin: walkDist,
        transfers: 0,
        segmentType: SEGMENT_TYPES.WALK
      };
      state.f = state.g + state.h;
      
      openSet.push(state, state.f);
      
      // Store initial segment info
      cameFrom.set(this._stateKey(state), {
        parent: null,
        segment: {
          type: SEGMENT_TYPES.WALK,
          fromLat: originLat,
          fromLon: originLon,
          toLat: entry.lat,
          toLon: entry.lon,
          toNodeId: entry.nodeId,
          distanceKm: walkDist,
          timeMinutes: walkTime.timeMinutes
        }
      });
    }

    let iterations = 0;
    const maxIterations = 50000;

    while (!openSet.isEmpty() && iterations < maxIterations) {
      iterations++;
      const current = openSet.pop();

      // Check if we reached a destination
      if (exitNodeIds.has(current.nodeId)) {
        // Add final walking segment to actual destination
        const exitPoint = exitPoints.find(p => p.nodeId === current.nodeId);
        const finalWalkDist = haversineDistance(
          exitPoint.lat, exitPoint.lon, destLat, destLon
        );
        
        return this._reconstructPath(
          current, cameFrom, originLat, originLon, destLat, destLon, 
          finalWalkDist, mode
        );
      }

      const stateKey = this._stateKey(current);
      const existingCost = closedSet.get(stateKey);
      
      if (existingCost !== undefined && existingCost <= current.g) {
        continue;
      }
      closedSet.set(stateKey, current.g);

      // Expand neighbors
      const neighbors = await this._getNeighbors(current, config, destLat, destLon, mode);
      
      for (const neighbor of neighbors) {
        const neighborKey = this._stateKey(neighbor);
        const existingNeighborCost = closedSet.get(neighborKey);
        
        if (existingNeighborCost !== undefined && existingNeighborCost <= neighbor.g) {
          continue;
        }

        openSet.push(neighbor, neighbor.f);
        cameFrom.set(neighborKey, {
          parent: current,
          segment: neighbor.segment
        });
      }
    }

    console.log(`[AStarPathfinder] Search exhausted after ${iterations} iterations`);
    return null;
  }

  /**
   * Get valid neighbor states from current state
   * @private
   */
  async _getNeighbors(current, config, destLat, destLon, mode) {
    const neighbors = [];
    const nodeCoords = this.graphService.getNodeCoords(current.nodeId);
    
    if (!nodeCoords) return neighbors;

    // Case 1: Currently walking (not on transit)
    if (current.routeId === null) {
      // Can board any transit route at this node
      const transitInfo = this.graphService.getTransitRoutesAtNode(current.nodeId);
      
      if (transitInfo) {
        for (const routeId of transitInfo.transitRoutes) {
          const routeInfo = this.graphService.getRouteInfo(routeId);
          if (!routeInfo) continue;

          const state = {
            nodeId: current.nodeId,
            routeId,
            g: current.g,  // No additional cost to board
            transfers: current.transfers,
            segmentType: SEGMENT_TYPES.TRANSIT
          };
          state.h = this._heuristic(nodeCoords.lat, nodeCoords.lon, destLat, destLon, mode);
          state.f = state.g + state.h;
          state.segment = {
            type: SEGMENT_TYPES.TRANSIT,
            routeId,
            routeName: routeInfo.routeName,
            vehicleType: routeInfo.vehicleType,
            signboard: routeInfo.signboard,
            fromNodeId: current.nodeId,
            fromLat: nodeCoords.lat,
            fromLon: nodeCoords.lon,
            distanceKm: 0,
            timeMinutes: 0
          };
          
          neighbors.push(state);
        }
      }
    }
    // Case 2: On a transit route
    else {
      const routeInfo = this.graphService.getRouteInfo(current.routeId);
      
      if (routeInfo) {
        // Find current position in route sequence
        const sequence = routeInfo.roadNodeSequence;
        const currentIndex = sequence.indexOf(current.nodeId);
        
        // Option A: Continue on route (next node in sequence)
        if (currentIndex !== -1 && currentIndex < sequence.length - 1) {
          const nextNodeId = sequence[currentIndex + 1];
          const nextCoords = this.graphService.getNodeCoords(nextNodeId);
          
          if (nextCoords) {
            const segmentDist = haversineDistance(
              nodeCoords.lat, nodeCoords.lon,
              nextCoords.lat, nextCoords.lon
            );
            
            // Get time (from stopwatch or estimate)
            const timeData = await this.stopwatchService.getTimeForSegment(
              current.routeId, current.nodeId, nextNodeId,
              segmentDist, routeInfo.vehicleType
            );
            
            const cost = this._calculateCost(
              segmentDist, timeData.timeMinutes, 
              this.fareCalculator.getAverageFarePerKm(routeInfo.vehicleType) * segmentDist,
              mode, routeInfo.vehicleType
            );

            const state = {
              nodeId: nextNodeId,
              routeId: current.routeId,
              g: current.g + cost,
              transfers: current.transfers,
              segmentType: SEGMENT_TYPES.TRANSIT
            };
            state.h = this._heuristic(nextCoords.lat, nextCoords.lon, destLat, destLon, mode);
            state.f = state.g + state.h;
            state.segment = {
              type: SEGMENT_TYPES.TRANSIT,
              routeId: current.routeId,
              routeName: routeInfo.routeName,
              vehicleType: routeInfo.vehicleType,
              signboard: routeInfo.signboard,
              fromNodeId: current.nodeId,
              toNodeId: nextNodeId,
              fromLat: nodeCoords.lat,
              fromLon: nodeCoords.lon,
              toLat: nextCoords.lat,
              toLon: nextCoords.lon,
              distanceKm: segmentDist,
              timeMinutes: timeData.timeMinutes
            };
            
            neighbors.push(state);
          }
        }

        // Option B: Transfer to another route (at this node)
        const transitInfo = this.graphService.getTransitRoutesAtNode(current.nodeId);
        
        if (transitInfo && transitInfo.transitRoutes.length > 1) {
          for (const altRouteId of transitInfo.transitRoutes) {
            if (altRouteId === current.routeId) continue;  // Skip current route
            
            const altRouteInfo = this.graphService.getRouteInfo(altRouteId);
            if (!altRouteInfo) continue;

            // Transfer cost (penalty + new base fare in FARE mode)
            const transferCost = this._calculateTransferCost(
              config.transferPenaltyMinutes,
              altRouteInfo.vehicleType,
              mode
            );

            const state = {
              nodeId: current.nodeId,
              routeId: altRouteId,
              g: current.g + transferCost,
              transfers: current.transfers + 1,
              segmentType: SEGMENT_TYPES.TRANSFER
            };
            state.h = this._heuristic(nodeCoords.lat, nodeCoords.lon, destLat, destLon, mode);
            state.f = state.g + state.h;
            state.segment = {
              type: SEGMENT_TYPES.TRANSFER,
              fromRouteId: current.routeId,
              toRouteId: altRouteId,
              toRouteName: altRouteInfo.routeName,
              toVehicleType: altRouteInfo.vehicleType,
              nodeId: current.nodeId,
              lat: nodeCoords.lat,
              lon: nodeCoords.lon,
              timeMinutes: config.transferPenaltyMinutes,
              walkingMinutes: 0,
              waitingMinutes: config.transferPenaltyMinutes
            };
            
            neighbors.push(state);
          }
        }

        // Option C: Exit transit and walk (for potential transfer at nearby node)
        // Only if within transfer walking distance
        const roadNeighbors = this.graphService.getNeighbors(current.nodeId);
        
        if (roadNeighbors) {
          for (const [neighborId, distance] of Object.entries(roadNeighbors)) {
            if (distance > config.maxTransferWalkingKm) continue;
            
            const neighborCoords = this.graphService.getNodeCoords(neighborId);
            const neighborTransit = this.graphService.getTransitRoutesAtNode(neighborId);
            
            // Only walk if destination has different transit options
            if (!neighborCoords || !neighborTransit) continue;
            if (neighborTransit.transitRoutes.every(r => r === current.routeId)) continue;

            const walkTime = this.stopwatchService.getWalkingTime(distance);
            const walkCost = this._calculateCost(distance, walkTime.timeMinutes, 0, mode, 'walking');

            const state = {
              nodeId: neighborId,
              routeId: null,  // Now walking
              g: current.g + walkCost,
              transfers: current.transfers,
              segmentType: SEGMENT_TYPES.WALK
            };
            state.h = this._heuristic(neighborCoords.lat, neighborCoords.lon, destLat, destLon, mode);
            state.f = state.g + state.h;
            state.segment = {
              type: SEGMENT_TYPES.WALK,
              fromNodeId: current.nodeId,
              toNodeId: neighborId,
              fromLat: nodeCoords.lat,
              fromLon: nodeCoords.lon,
              toLat: neighborCoords.lat,
              toLon: neighborCoords.lon,
              distanceKm: distance,
              timeMinutes: walkTime.timeMinutes
            };
            
            neighbors.push(state);
          }
        }
      }
    }

    return neighbors;
  }

  /**
   * Calculate heuristic value (straight-line estimate to goal)
   * @private
   */
  _heuristic(lat, lon, destLat, destLon, mode) {
    const distance = haversineDistance(lat, lon, destLat, destLon);
    
    switch (mode) {
      case OPTIMIZATION_MODES.DISTANCE:
        return distance;
      case OPTIMIZATION_MODES.TIME:
        // Assume fastest transit speed (25 km/h) for optimistic estimate
        return (distance / 25) * 60;  // minutes
      case OPTIMIZATION_MODES.FARE:
        // Use lowest fare rate
        return distance * 1.80;  // ₱/km
      default:
        return distance;
    }
  }

  /**
   * Calculate cost for a segment
   * @private
   */
  _calculateCost(distanceKm, timeMinutes, fare, mode, vehicleType) {
    switch (mode) {
      case OPTIMIZATION_MODES.DISTANCE:
        return distanceKm;
      case OPTIMIZATION_MODES.TIME:
        return timeMinutes;
      case OPTIMIZATION_MODES.FARE:
        if (vehicleType === 'walking') return 0;
        return fare || this.fareCalculator.calculateFare(vehicleType, distanceKm);
      default:
        return distanceKm;
    }
  }

  /**
   * Calculate transfer cost
   * @private
   */
  _calculateTransferCost(penaltyMinutes, newVehicleType, mode) {
    switch (mode) {
      case OPTIMIZATION_MODES.DISTANCE:
        return 0;  // No distance cost for transfer
      case OPTIMIZATION_MODES.TIME:
        return penaltyMinutes;
      case OPTIMIZATION_MODES.FARE:
        return this.fareCalculator.getBaseFare(newVehicleType);
      default:
        return penaltyMinutes;
    }
  }

  /**
   * Create unique state key
   * @private
   */
  _stateKey(state) {
    return `${state.nodeId}:${state.routeId || 'walk'}`;
  }

  /**
   * Check if path is duplicate
   * @private
   */
  _isDuplicatePath(newPath, existingPaths) {
    if (!newPath || !newPath.segments) return true;
    
    const newRoutes = newPath.segments
      .filter(s => s.type === SEGMENT_TYPES.TRANSIT)
      .map(s => s.routeId)
      .join(',');
    
    return existingPaths.some(p => {
      const existingRoutes = p.segments
        .filter(s => s.type === SEGMENT_TYPES.TRANSIT)
        .map(s => s.routeId)
        .join(',');
      return existingRoutes === newRoutes;
    });
  }

  /**
   * Reconstruct path from A* search result
   * @private
   */
  _reconstructPath(finalState, cameFrom, originLat, originLon, destLat, destLon, finalWalkDist, mode) {
    const segments = [];
    let current = finalState;
    let currentKey = this._stateKey(current);
    
    // Backtrack through cameFrom
    while (cameFrom.has(currentKey)) {
      const entry = cameFrom.get(currentKey);
      if (entry.segment) {
        segments.unshift(entry.segment);
      }
      if (!entry.parent) break;
      current = entry.parent;
      currentKey = this._stateKey(current);
    }

    // Add final walking segment to destination
    if (finalWalkDist > 0.001) {  // More than 1 meter
      const lastSegment = segments[segments.length - 1];
      const lastCoords = lastSegment ? 
        { lat: lastSegment.toLat, lon: lastSegment.toLon } :
        { lat: originLat, lon: originLon };
      
      const walkTime = this.stopwatchService.getWalkingTime(finalWalkDist);
      
      segments.push({
        type: SEGMENT_TYPES.WALK,
        fromLat: lastCoords.lat,
        fromLon: lastCoords.lon,
        toLat: destLat,
        toLon: destLon,
        distanceKm: finalWalkDist,
        timeMinutes: walkTime.timeMinutes
      });
    }

    // Merge consecutive transit segments on same route
    const mergedSegments = this._mergeTransitSegments(segments);

    // Calculate summary
    const summary = this._calculateSummary(mergedSegments);

    return {
      optimizedFor: mode,
      summary,
      segments: mergedSegments
    };
  }

  /**
   * Merge consecutive transit segments on same route
   * @private
   */
  _mergeTransitSegments(segments) {
    const merged = [];
    let currentTransit = null;

    for (const segment of segments) {
      if (segment.type === SEGMENT_TYPES.TRANSIT) {
        if (currentTransit && currentTransit.routeId === segment.routeId) {
          // Extend current transit segment
          currentTransit.toNodeId = segment.toNodeId;
          currentTransit.toLat = segment.toLat;
          currentTransit.toLon = segment.toLon;
          currentTransit.distanceKm += segment.distanceKm;
          currentTransit.timeMinutes += segment.timeMinutes;
        } else {
          // Start new transit segment
          if (currentTransit) {
            merged.push(currentTransit);
          }
          currentTransit = { ...segment };
        }
      } else {
        // Non-transit segment
        if (currentTransit) {
          merged.push(currentTransit);
          currentTransit = null;
        }
        merged.push(segment);
      }
    }

    if (currentTransit) {
      merged.push(currentTransit);
    }

    // Calculate fares for transit segments
    for (const segment of merged) {
      if (segment.type === SEGMENT_TYPES.TRANSIT) {
        segment.fare = this.fareCalculator.calculateFare(
          segment.vehicleType, segment.distanceKm
        );
      }
    }

    return merged;
  }

  /**
   * Calculate summary statistics for a path
   * @private
   */
  _calculateSummary(segments) {
    let totalDistanceKm = 0;
    let totalTimeMinutes = 0;
    let totalFare = 0;
    let walkingDistanceKm = 0;
    let transferCount = 0;

    for (const segment of segments) {
      totalDistanceKm += segment.distanceKm || 0;
      totalTimeMinutes += segment.timeMinutes || 0;
      
      if (segment.type === SEGMENT_TYPES.WALK) {
        walkingDistanceKm += segment.distanceKm || 0;
      } else if (segment.type === SEGMENT_TYPES.TRANSIT) {
        totalFare += segment.fare || 0;
      } else if (segment.type === SEGMENT_TYPES.TRANSFER) {
        transferCount++;
      }
    }

    return {
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      totalTimeMinutes: Math.round(totalTimeMinutes),
      totalFare: Math.round(totalFare * 100) / 100,
      transferCount,
      walkingDistanceKm: Math.round(walkingDistanceKm * 100) / 100
    };
  }

  /**
   * Rank results based on optimization mode
   * @private
   */
  _rankResults(paths, primaryMode) {
    if (paths.length === 0) return [];

    // Sort by primary mode metric
    const sorted = [...paths].sort((a, b) => {
      switch (primaryMode) {
        case OPTIMIZATION_MODES.TIME:
          return a.summary.totalTimeMinutes - b.summary.totalTimeMinutes;
        case OPTIMIZATION_MODES.FARE:
          return a.summary.totalFare - b.summary.totalFare;
        case OPTIMIZATION_MODES.DISTANCE:
          return a.summary.totalDistanceKm - b.summary.totalDistanceKm;
        default:
          return a.summary.totalTimeMinutes - b.summary.totalTimeMinutes;
      }
    });

    // Add rank
    return sorted.map((path, index) => ({
      rank: index + 1,
      ...path
    }));
  }
}

module.exports = AStarPathfinder;
module.exports.OPTIMIZATION_MODES = OPTIMIZATION_MODES;
module.exports.SEGMENT_TYPES = SEGMENT_TYPES;
