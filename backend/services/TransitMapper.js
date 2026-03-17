/**
 * Transit Mapper Service
 * 
 * Maps transit route coordinates to road network nodes.
 * Creates the link between transit routes (from routes.json) 
 * and the OSM road network (roadNetwork.json).
 * 
 * Part of Phase 2: GraphService implementation.
 * 
 * @module services/TransitMapper
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

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

class TransitMapper {
  constructor() {
    this.roadNetwork = null;
    this.nodeIndex = null;  // Spatial index for faster lookups
    this.isInitialized = false;
  }

  /**
   * Initialize the mapper by loading the road network
   * @param {string} [roadNetworkPath] - Path to roadNetwork.json
   * @returns {Promise<void>}
   */
  async initialize(roadNetworkPath) {
    const networkPath = roadNetworkPath || 
      path.join(__dirname, '..', 'data', 'roadNetwork.json');
    
    console.log('[TransitMapper] Loading road network...');
    
    const data = fs.readFileSync(networkPath, 'utf-8');
    this.roadNetwork = JSON.parse(data);
    
    console.log(`[TransitMapper] Loaded ${Object.keys(this.roadNetwork.nodes).length} nodes`);
    
    // Build spatial index (grid-based for O(1) lookups)
    this._buildSpatialIndex();
    
    this.isInitialized = true;
    console.log('[TransitMapper] Initialization complete');
  }

  /**
   * Build a grid-based spatial index for fast nearest-node queries
   * Grid cell size: ~0.01 degrees (approximately 1km)
   * @private
   */
  _buildSpatialIndex() {
    console.log('[TransitMapper] Building spatial index...');
    
    const GRID_SIZE = 0.01; // ~1km cells
    this.nodeIndex = new Map();
    
    for (const [nodeId, coords] of Object.entries(this.roadNetwork.nodes)) {
      const gridKey = this._getGridKey(coords.lat, coords.lon, GRID_SIZE);
      
      if (!this.nodeIndex.has(gridKey)) {
        this.nodeIndex.set(gridKey, []);
      }
      
      this.nodeIndex.get(gridKey).push({
        nodeId,
        lat: coords.lat,
        lon: coords.lon
      });
    }
    
    console.log(`[TransitMapper] Built index with ${this.nodeIndex.size} grid cells`);
  }

  /**
   * Get grid key for a coordinate
   * @private
   */
  _getGridKey(lat, lon, gridSize) {
    const latKey = Math.floor(lat / gridSize);
    const lonKey = Math.floor(lon / gridSize);
    return `${latKey},${lonKey}`;
  }

  /**
   * Find the nearest road node to a given coordinate
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} [maxDistanceKm=0.1] - Maximum search distance in km
   * @returns {{nodeId: string, lat: number, lon: number, distance: number}|null}
   */
  findNearestNode(lat, lon, maxDistanceKm = 0.1) {
    if (!this.isInitialized) {
      throw new Error('TransitMapper not initialized');
    }

    const GRID_SIZE = 0.01;
    const searchRadius = Math.ceil(maxDistanceKm / 1.1); // Grid cells to search
    const centerGridLat = Math.floor(lat / GRID_SIZE);
    const centerGridLon = Math.floor(lon / GRID_SIZE);
    
    let nearestNode = null;
    let minDistance = Infinity;

    // Search in nearby grid cells
    for (let dLat = -searchRadius; dLat <= searchRadius; dLat++) {
      for (let dLon = -searchRadius; dLon <= searchRadius; dLon++) {
        const gridKey = `${centerGridLat + dLat},${centerGridLon + dLon}`;
        const nodes = this.nodeIndex.get(gridKey);
        
        if (!nodes) continue;

        for (const node of nodes) {
          const distance = haversineDistance(lat, lon, node.lat, node.lon);
          
          if (distance < minDistance && distance <= maxDistanceKm) {
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
   * Map a sequence of route coordinates to road network nodes
   * @param {Array<{lat: number, lon: number}>} coordinates - Route coordinates
   * @param {number} [toleranceKm=0.1] - Maximum distance to snap to road
   * @returns {{
   *   mappedNodes: Array<string>,
   *   mappedCount: number,
   *   unmappedCount: number,
   *   totalDistance: number
   * }}
   */
  mapRouteToRoadNodes(coordinates, toleranceKm = 0.1) {
    if (!this.isInitialized) {
      throw new Error('TransitMapper not initialized');
    }

    const mappedNodes = [];
    let unmappedCount = 0;
    let totalDistance = 0;
    let previousNode = null;

    for (const coord of coordinates) {
      const nearest = this.findNearestNode(coord.lat, coord.lon, toleranceKm);
      
      if (nearest) {
        // Avoid duplicates (consecutive same node)
        if (previousNode !== nearest.nodeId) {
          mappedNodes.push(nearest.nodeId);
          
          // Calculate segment distance
          if (previousNode && this.roadNetwork.nodes[previousNode]) {
            const prevCoord = this.roadNetwork.nodes[previousNode];
            totalDistance += haversineDistance(
              prevCoord.lat, prevCoord.lon,
              nearest.lat, nearest.lon
            );
          }
          
          previousNode = nearest.nodeId;
        }
      } else {
        unmappedCount++;
      }
    }

    return {
      mappedNodes,
      mappedCount: mappedNodes.length,
      unmappedCount,
      totalDistance
    };
  }

  /**
   * Process a single route from routes.json format
   * @param {Object} routeFeature - GeoJSON feature from routes.json
   * @param {number} [toleranceKm=0.1] - Mapping tolerance
   * @returns {Object} Processed route data ready for MongoDB
   */
  processRoute(routeFeature, toleranceKm = 0.1) {
    const props = routeFeature.properties;
    
    // Handle both 'id' and 'routeId' property names
    const baseId = props.routeId || props.id;
    // Direction from properties (normalize to lowercase)
    const direction = (props.direction || 'outbound').toLowerCase();
    const routeId = baseId; // Keep original ID since direction is already included
    
    // Get coordinates - don't reverse since direction is already in the data
    const coordinates = routeFeature.geometry.coordinates;
    
    // Convert to lat/lon objects (GeoJSON is [lon, lat])
    const coordObjects = coordinates.map(([lon, lat]) => ({ lat, lon }));
    
    // Map to road nodes
    const mapped = this.mapRouteToRoadNodes(coordObjects, toleranceKm);
    
    if (mapped.mappedNodes.length < 2) {
      console.warn(`[TransitMapper] Warning: Route ${routeId} has insufficient nodes (${mapped.mappedNodes.length})`);
      return null;
    }

    // Get terminal nodes
    const startNodeId = mapped.mappedNodes[0];
    const endNodeId = mapped.mappedNodes[mapped.mappedNodes.length - 1];
    const startNode = this.roadNetwork.nodes[startNodeId];
    const endNode = this.roadNetwork.nodes[endNodeId];

    return {
      routeId,
      routeName: props.routeName || props.name || `Route ${baseId}`,
      vehicleType: props.vehicleType || props.type || 'jeep',
      signboard: props.signboard || '',
      direction,
      startTerminal: {
        roadNodeId: startNodeId,
        lat: startNode.lat,
        lon: startNode.lon
      },
      endTerminal: {
        roadNodeId: endNodeId,
        lat: endNode.lat,
        lon: endNode.lon
      },
      roadNodeSequence: mapped.mappedNodes,
      totalDistanceKm: mapped.totalDistance,
      nodeCount: mapped.mappedNodes.length,
      isActive: true
    };
  }

  /**
   * Process all routes from routes.json
   * @param {string} [routesPath] - Path to routes.json
   * @param {number} [toleranceKm=0.1] - Mapping tolerance
   * @returns {Array<Object>} Array of processed routes
   */
  processAllRoutes(routesPath, toleranceKm = 0.1) {
    const filePath = routesPath || 
      path.join(__dirname, '..', 'data', 'routes.json');
    
    console.log('[TransitMapper] Processing routes from:', filePath);
    
    const routesData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const processedRoutes = [];
    
    for (const feature of routesData.features) {
      // Each route in the data already has its direction defined
      // Process it as-is (don't generate both directions)
      const processed = this.processRoute(feature, toleranceKm);
      if (processed) {
        processedRoutes.push(processed);
        console.log(`  ✓ ${processed.routeId}: ${processed.nodeCount} nodes, ${processed.totalDistanceKm.toFixed(2)}km`);
      }
    }

    console.log(`[TransitMapper] Processed ${processedRoutes.length} routes`);
    return processedRoutes;
  }

  /**
   * Get node coverage map (which nodes have which routes)
   * @param {Array<Object>} processedRoutes - Array of processed routes
   * @returns {Map<string, {routes: string[], isTerminal: boolean, terminalFor: string[], terminalType: string}>}
   */
  getNodeCoverage(processedRoutes) {
    const coverage = new Map();

    for (const route of processedRoutes) {
      // Process all nodes in route
      for (const nodeId of route.roadNodeSequence) {
        if (!coverage.has(nodeId)) {
          coverage.set(nodeId, {
            routes: [],
            isTerminal: false,
            terminalFor: [],
            terminalType: null
          });
        }
        
        const nodeInfo = coverage.get(nodeId);
        if (!nodeInfo.routes.includes(route.routeId)) {
          nodeInfo.routes.push(route.routeId);
        }
      }

      // Mark terminals
      const startNode = coverage.get(route.startTerminal.roadNodeId);
      const endNode = coverage.get(route.endTerminal.roadNodeId);

      if (startNode) {
        startNode.isTerminal = true;
        if (!startNode.terminalFor.includes(route.routeId)) {
          startNode.terminalFor.push(route.routeId);
        }
        startNode.terminalType = startNode.terminalType === 'end' ? 'both' : 'start';
      }

      if (endNode) {
        endNode.isTerminal = true;
        if (!endNode.terminalFor.includes(route.routeId)) {
          endNode.terminalFor.push(route.routeId);
        }
        endNode.terminalType = endNode.terminalType === 'start' ? 'both' : 'end';
      }
    }

    return coverage;
  }

  /**
   * Get road network statistics
   * @returns {Object} Network stats
   */
  getNetworkStats() {
    if (!this.isInitialized) {
      throw new Error('TransitMapper not initialized');
    }

    return {
      totalNodes: Object.keys(this.roadNetwork.nodes).length,
      totalEdges: Object.values(this.roadNetwork.adjacency)
        .reduce((sum, neighbors) => sum + Object.keys(neighbors).length, 0),
      gridCells: this.nodeIndex.size,
      metadata: this.roadNetwork.metadata
    };
  }
}

module.exports = TransitMapper;
