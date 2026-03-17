/**
 * Graph Service
 * 
 * Main service for transit graph operations.
 * Provides high-level methods for route searching and graph traversal.
 * Uses hybrid storage: MongoDB for metadata, JSON for adjacency.
 * 
 * Part of Phase 2: GraphService implementation.
 * 
 * @module services/GraphService
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { TransitRoute, TransitConfig, RoadNode } = require('../models');

/**
 * Calculate Haversine distance between two coordinates
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
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

class GraphService {
  constructor() {
    // Graph data
    this.roadAdjacency = null;
    this.roadNodes = null;
    
    // In-memory caches (populated from MongoDB on init)
    this.transitRouteCache = new Map();  // routeId -> route metadata
    this.nodeTransitCache = new Map();   // nodeId -> transit info
    
    // Spatial index for nearest-node queries
    this.nodeIndex = null;
    
    // Configuration
    this.config = null;
    
    // State
    this.isInitialized = false;
  }

  /**
   * Initialize the GraphService
   * Must be called before using any other methods
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log('[GraphService] Initializing...');
    
    try {
      // Step 1: Load configuration
      this.config = await TransitConfig.getConfig();
      console.log('[GraphService] Configuration loaded');
      console.log(`  - Transfer penalty: ${this.config.transferPenaltyMinutes} min`);
      console.log(`  - Max walking: ${this.config.maxWalkingDistanceKm} km`);
      console.log(`  - Mapping tolerance: ${this.config.routeMappingToleranceKm} km`);

      // Step 2: Load road adjacency data
      const adjacencyPath = path.join(__dirname, '..', 'data', 'roadAdjacency.json');
      
      if (!fs.existsSync(adjacencyPath)) {
        throw new Error(`roadAdjacency.json not found. Run initTransitData.js first.`);
      }
      
      console.log('[GraphService] Loading road adjacency data...');
      const adjData = JSON.parse(fs.readFileSync(adjacencyPath, 'utf-8'));
      this.roadNodes = adjData.nodes;
      this.roadAdjacency = adjData.adjacency;
      console.log(`  - ${Object.keys(this.roadNodes).length.toLocaleString()} nodes loaded`);

      // Step 3: Load transit routes into cache
      console.log('[GraphService] Loading transit routes...');
      const routes = await TransitRoute.find({ isActive: true }).lean();
      
      for (const route of routes) {
        this.transitRouteCache.set(route.routeId, {
          routeId: route.routeId,
          routeName: route.routeName,
          vehicleType: route.vehicleType,
          signboard: route.signboard,
          direction: route.direction,
          startTerminal: route.startTerminal,
          endTerminal: route.endTerminal,
          roadNodeSequence: route.roadNodeSequence,
          totalDistanceKm: route.totalDistanceKm,
          nodeCount: route.nodeCount
        });
      }
      console.log(`  - ${this.transitRouteCache.size} routes cached`);

      // Step 4: Load node transit coverage into cache
      console.log('[GraphService] Loading node transit coverage...');
      const roadNodes = await RoadNode.find({}).lean();
      
      for (const node of roadNodes) {
        this.nodeTransitCache.set(node.nodeId, {
          transitRoutes: node.transitRoutes,
          isTerminal: node.isTerminal,
          terminalFor: node.terminalFor,
          terminalType: node.terminalType
        });
      }
      console.log(`  - ${this.nodeTransitCache.size} transit nodes cached`);

      // Step 5: Build spatial index
      this._buildSpatialIndex();

      this.isInitialized = true;
      console.log('[GraphService] ✓ Initialization complete');

    } catch (error) {
      console.error('[GraphService] ❌ Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Build spatial index for fast nearest-node queries
   * @private
   */
  _buildSpatialIndex() {
    console.log('[GraphService] Building spatial index...');
    
    const GRID_SIZE = 0.01; // ~1km cells
    this.nodeIndex = new Map();
    
    for (const [nodeId, coords] of Object.entries(this.roadNodes)) {
      const latKey = Math.floor(coords.lat / GRID_SIZE);
      const lonKey = Math.floor(coords.lon / GRID_SIZE);
      const gridKey = `${latKey},${lonKey}`;
      
      if (!this.nodeIndex.has(gridKey)) {
        this.nodeIndex.set(gridKey, []);
      }
      
      this.nodeIndex.get(gridKey).push({
        nodeId,
        lat: coords.lat,
        lon: coords.lon
      });
    }
    
    console.log(`  - ${this.nodeIndex.size} grid cells created`);
  }

  /**
   * Check if service is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('GraphService not initialized. Call initialize() first.');
    }
  }

  /**
   * Find the nearest road node to a coordinate
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} [maxDistanceKm] - Maximum search distance (default from config)
   * @returns {{nodeId: string, lat: number, lon: number, distance: number}|null}
   */
  findNearestRoadNode(lat, lon, maxDistanceKm) {
    this._ensureInitialized();
    
    const maxDist = maxDistanceKm || this.config.maxSearchRadiusKm;
    const GRID_SIZE = 0.01;
    const searchRadius = Math.ceil(maxDist / 1.1);
    const centerGridLat = Math.floor(lat / GRID_SIZE);
    const centerGridLon = Math.floor(lon / GRID_SIZE);
    
    let nearestNode = null;
    let minDistance = Infinity;

    for (let dLat = -searchRadius; dLat <= searchRadius; dLat++) {
      for (let dLon = -searchRadius; dLon <= searchRadius; dLon++) {
        const gridKey = `${centerGridLat + dLat},${centerGridLon + dLon}`;
        const nodes = this.nodeIndex.get(gridKey);
        
        if (!nodes) continue;

        for (const node of nodes) {
          const distance = haversineDistance(lat, lon, node.lat, node.lon);
          
          if (distance < minDistance && distance <= maxDist) {
            minDistance = distance;
            nearestNode = {
              nodeId: node.nodeId,
              lat: node.lat,
              lon: node.lon,
              distance
            };
          }
        }
      }
    }

    return nearestNode;
  }

  /**
   * Find nearest nodes with transit coverage
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} [maxDistanceKm] - Maximum search distance
   * @param {number} [limit=5] - Maximum results to return
   * @returns {Array<{nodeId: string, lat: number, lon: number, distance: number, transitRoutes: string[]}>}
   */
  findNearestTransitNodes(lat, lon, maxDistanceKm, limit = 5) {
    this._ensureInitialized();
    
    const maxDist = maxDistanceKm || this.config.maxWalkingDistanceKm;
    const GRID_SIZE = 0.01;
    const searchRadius = Math.ceil(maxDist / 1.1);
    const centerGridLat = Math.floor(lat / GRID_SIZE);
    const centerGridLon = Math.floor(lon / GRID_SIZE);
    
    const candidates = [];

    for (let dLat = -searchRadius; dLat <= searchRadius; dLat++) {
      for (let dLon = -searchRadius; dLon <= searchRadius; dLon++) {
        const gridKey = `${centerGridLat + dLat},${centerGridLon + dLon}`;
        const nodes = this.nodeIndex.get(gridKey);
        
        if (!nodes) continue;

        for (const node of nodes) {
          // Only include nodes with transit coverage
          const transitInfo = this.nodeTransitCache.get(node.nodeId);
          if (!transitInfo || transitInfo.transitRoutes.length === 0) continue;
          
          const distance = haversineDistance(lat, lon, node.lat, node.lon);
          
          if (distance <= maxDist) {
            candidates.push({
              nodeId: node.nodeId,
              lat: node.lat,
              lon: node.lon,
              distance,
              transitRoutes: transitInfo.transitRoutes,
              isTerminal: transitInfo.isTerminal
            });
          }
        }
      }
    }

    // Sort by distance and return top N
    return candidates
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }

  /**
   * Get transit routes passing through a node
   * @param {string} nodeId - Road node ID
   * @returns {{transitRoutes: string[], isTerminal: boolean, terminalFor: string[], terminalType: string}|null}
   */
  getTransitRoutesAtNode(nodeId) {
    this._ensureInitialized();
    return this.nodeTransitCache.get(nodeId) || null;
  }

  /**
   * Get route information by ID
   * @param {string} routeId - Route ID (e.g., "route1_outbound")
   * @returns {Object|null} Route metadata
   */
  getRouteInfo(routeId) {
    this._ensureInitialized();
    return this.transitRouteCache.get(routeId) || null;
  }

  /**
   * Get all active transit routes
   * @returns {Array<Object>} Array of route metadata
   */
  getAllRoutes() {
    this._ensureInitialized();
    return Array.from(this.transitRouteCache.values());
  }

  /**
   * Get neighbors of a road node with distances
   * @param {string} nodeId - Road node ID
   * @returns {Object<string, number>|null} Map of neighborId -> distance in km
   */
  getNeighbors(nodeId) {
    this._ensureInitialized();
    return this.roadAdjacency[nodeId] || null;
  }

  /**
   * Get node coordinates
   * @param {string} nodeId - Road node ID
   * @returns {{lat: number, lon: number}|null}
   */
  getNodeCoords(nodeId) {
    this._ensureInitialized();
    return this.roadNodes[nodeId] || null;
  }

  /**
   * Check if a node is on a specific route
   * @param {string} nodeId - Road node ID
   * @param {string} routeId - Route ID
   * @returns {boolean}
   */
  isNodeOnRoute(nodeId, routeId) {
    this._ensureInitialized();
    const transitInfo = this.nodeTransitCache.get(nodeId);
    return transitInfo ? transitInfo.transitRoutes.includes(routeId) : false;
  }

  /**
   * Find common routes between two nodes
   * @param {string} nodeId1 - First node ID
   * @param {string} nodeId2 - Second node ID
   * @returns {string[]} Array of route IDs available at both nodes
   */
  findCommonRoutes(nodeId1, nodeId2) {
    this._ensureInitialized();
    
    const transit1 = this.nodeTransitCache.get(nodeId1);
    const transit2 = this.nodeTransitCache.get(nodeId2);
    
    if (!transit1 || !transit2) return [];
    
    return transit1.transitRoutes.filter(r => transit2.transitRoutes.includes(r));
  }

  /**
   * Check if transfer is possible at a node
   * @param {string} nodeId - Road node ID
   * @returns {boolean} True if multiple routes available (transfer possible)
   */
  canTransferAtNode(nodeId) {
    this._ensureInitialized();
    const transitInfo = this.nodeTransitCache.get(nodeId);
    return transitInfo ? transitInfo.transitRoutes.length > 1 : false;
  }

  /**
   * Get transfer options at a node
   * @param {string} nodeId - Road node ID
   * @param {string} currentRouteId - Current route (to exclude from options)
   * @returns {Array<{routeId: string, routeName: string, direction: string}>}
   */
  getTransferOptions(nodeId, currentRouteId) {
    this._ensureInitialized();
    
    const transitInfo = this.nodeTransitCache.get(nodeId);
    if (!transitInfo) return [];
    
    return transitInfo.transitRoutes
      .filter(routeId => routeId !== currentRouteId)
      .map(routeId => {
        const route = this.transitRouteCache.get(routeId);
        return route ? {
          routeId: route.routeId,
          routeName: route.routeName,
          direction: route.direction,
          signboard: route.signboard
        } : null;
      })
      .filter(Boolean);
  }

  /**
   * Get all terminal nodes
   * @returns {Array<{nodeId: string, lat: number, lon: number, terminalFor: string[]}>}
   */
  getTerminals() {
    this._ensureInitialized();
    
    const terminals = [];
    
    for (const [nodeId, info] of this.nodeTransitCache) {
      if (info.isTerminal) {
        const coords = this.roadNodes[nodeId];
        terminals.push({
          nodeId,
          lat: coords?.lat,
          lon: coords?.lon,
          terminalFor: info.terminalFor,
          terminalType: info.terminalType
        });
      }
    }
    
    return terminals;
  }

  /**
   * Get routing configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    this._ensureInitialized();
    
    return {
      transferPenaltyMinutes: this.config.transferPenaltyMinutes,
      maxWalkingDistanceKm: this.config.maxWalkingDistanceKm,
      maxTransferWalkingKm: this.config.maxTransferWalkingKm,
      walkingSpeedKmh: this.config.walkingSpeedKmh,
      routeMappingToleranceKm: this.config.routeMappingToleranceKm,
      maxSearchRadiusKm: this.config.maxSearchRadiusKm
    };
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    this._ensureInitialized();
    
    return {
      totalNodes: Object.keys(this.roadNodes).length,
      totalEdges: Object.values(this.roadAdjacency)
        .reduce((sum, neighbors) => sum + Object.keys(neighbors).length, 0),
      transitRoutes: this.transitRouteCache.size,
      transitNodes: this.nodeTransitCache.size,
      terminalNodes: this.getTerminals().length,
      gridCells: this.nodeIndex.size
    };
  }
}

// Singleton instance
let graphServiceInstance = null;

/**
 * Get the GraphService singleton instance
 * @returns {GraphService}
 */
function getGraphService() {
  if (!graphServiceInstance) {
    graphServiceInstance = new GraphService();
  }
  return graphServiceInstance;
}

module.exports = {
  GraphService,
  getGraphService
};
