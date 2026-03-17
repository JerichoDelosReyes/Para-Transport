/**
 * Graph Builder Service
 * 
 * Converts GeoJSON route data into an adjacency graph structure
 * suitable for A* pathfinding. Implements Phase 1 of the Transit Graph.
 * 
 * @module services/graphBuilder
 * @version 1.0.0
 */

// Import type definitions for JSDoc
require('../types/graph.types');

/**
 * Radius in kilometers for detecting transfer points between routes.
 * Nodes within this distance will have transfer edges created.
 */
const TRANSFER_RADIUS_KM = 0.05; // 50 meters

/**
 * Calculate the Haversine distance between two coordinates.
 * Returns the great-circle distance in kilometers.
 * 
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Convert degrees to radians.
 * @param {number} degrees 
 * @returns {number} Radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Generate a unique node ID from route ID and coordinate index.
 * 
 * @param {string} routeId - Route identifier
 * @param {number} index - Coordinate index within the route
 * @returns {string} Node ID in format "routeId:index"
 */
function generateNodeId(routeId, index) {
  return `${routeId}:${index}`;
}

/**
 * Parse a node ID to extract route ID and index.
 * 
 * @param {string} nodeId - Node ID to parse
 * @returns {{routeId: string, index: number}} Parsed components
 */
function parseNodeId(nodeId) {
  const lastColonIndex = nodeId.lastIndexOf(':');
  return {
    routeId: nodeId.substring(0, lastColonIndex),
    index: parseInt(nodeId.substring(lastColonIndex + 1), 10)
  };
}

/**
 * Build a transit graph from GeoJSON route features.
 * 
 * This function:
 * 1. Creates a node for each coordinate point in each route
 * 2. Creates sequential edges connecting consecutive nodes within a route
 * 3. Creates transfer edges between nearby nodes from different routes
 * 
 * @param {Object} routesGeoJSON - GeoJSON FeatureCollection containing routes
 * @returns {{graph: Map<string, GraphNode>, routeMap: Map<string, RouteProperties>}}
 */
function buildGraph(routesGeoJSON) {
  console.log('[GraphBuilder] Starting graph construction...');
  
  /** @type {Map<string, GraphNode>} */
  const graph = new Map();
  
  /** @type {Map<string, RouteProperties>} */
  const routeMap = new Map();
  
  const features = routesGeoJSON.features || [];
  
  // Track statistics
  let totalEdges = 0;
  let transferEdges = 0;
  
  // ========================================
  // STEP 1: Create nodes and sequential edges
  // ========================================
  
  for (const feature of features) {
    const { properties, geometry } = feature;
    
    if (!geometry || geometry.type !== 'LineString') {
      console.warn(`[GraphBuilder] Skipping feature with invalid geometry: ${properties?.routeId}`);
      continue;
    }
    
    const { routeId, routeName, vehicleType, signboard, direction } = properties;
    const coordinates = geometry.coordinates;
    
    // Store route properties for later lookup
    routeMap.set(routeId, { routeId, routeName, vehicleType, signboard, direction });
    
    console.log(`[GraphBuilder] Processing route: ${routeId} (${coordinates.length} coordinates)`);
    
    // Create nodes for each coordinate
    for (let i = 0; i < coordinates.length; i++) {
      const [lon, lat] = coordinates[i]; // GeoJSON is [lon, lat]
      const nodeId = generateNodeId(routeId, i);
      
      /** @type {GraphNode} */
      const node = {
        id: nodeId,
        lat: lat,
        lon: lon,
        edges: [],
        routeIds: [routeId]
      };
      
      // Create edge to next node (sequential connection)
      if (i < coordinates.length - 1) {
        const [nextLon, nextLat] = coordinates[i + 1];
        const distanceKm = haversineDistance(lat, lon, nextLat, nextLon);
        
        /** @type {GraphEdge} */
        const edge = {
          toNodeId: generateNodeId(routeId, i + 1),
          routeId: routeId,
          distanceKm: distanceKm,
          vehicleType: vehicleType,
          isTransfer: false
        };
        
        node.edges.push(edge);
        totalEdges++;
      }
      
      graph.set(nodeId, node);
    }
  }
  
  console.log(`[GraphBuilder] Created ${graph.size} nodes with ${totalEdges} sequential edges`);
  
  // ========================================
  // STEP 2: Create transfer edges
  // ========================================
  
  console.log('[GraphBuilder] Scanning for transfer points...');
  
  const nodeArray = Array.from(graph.values());
  
  for (let i = 0; i < nodeArray.length; i++) {
    const nodeA = nodeArray[i];
    const { routeId: routeA } = parseNodeId(nodeA.id);
    
    for (let j = i + 1; j < nodeArray.length; j++) {
      const nodeB = nodeArray[j];
      const { routeId: routeB } = parseNodeId(nodeB.id);
      
      // Skip if same route (already connected sequentially)
      if (routeA === routeB) continue;
      
      // Calculate distance between nodes
      const distance = haversineDistance(nodeA.lat, nodeA.lon, nodeB.lat, nodeB.lon);
      
      // If within transfer radius, create bidirectional transfer edges
      if (distance <= TRANSFER_RADIUS_KM) {
        const routeBProps = routeMap.get(routeB);
        const routeAProps = routeMap.get(routeA);
        
        // Edge from A to B
        /** @type {GraphEdge} */
        const edgeAtoB = {
          toNodeId: nodeB.id,
          routeId: routeB,
          distanceKm: distance,
          vehicleType: routeBProps?.vehicleType || 'unknown',
          isTransfer: true
        };
        
        // Edge from B to A
        /** @type {GraphEdge} */
        const edgeBtoA = {
          toNodeId: nodeA.id,
          routeId: routeA,
          distanceKm: distance,
          vehicleType: routeAProps?.vehicleType || 'unknown',
          isTransfer: true
        };
        
        // Add edges (avoid duplicates)
        if (!nodeA.edges.some(e => e.toNodeId === nodeB.id)) {
          nodeA.edges.push(edgeAtoB);
          transferEdges++;
        }
        
        if (!nodeB.edges.some(e => e.toNodeId === nodeA.id)) {
          nodeB.edges.push(edgeBtoA);
          transferEdges++;
        }
        
        // Track that both routes pass through this point
        if (!nodeA.routeIds.includes(routeB)) {
          nodeA.routeIds.push(routeB);
        }
        if (!nodeB.routeIds.includes(routeA)) {
          nodeB.routeIds.push(routeA);
        }
      }
    }
  }
  
  console.log(`[GraphBuilder] Created ${transferEdges} transfer edges`);
  
  // ========================================
  // STEP 3: Summary and verification
  // ========================================
  
  const stats = {
    nodeCount: graph.size,
    edgeCount: totalEdges + transferEdges,
    routeCount: routeMap.size,
    transferEdgeCount: transferEdges
  };
  
  console.log('[GraphBuilder] ✅ Graph construction complete!');
  console.log('[GraphBuilder] Stats:', JSON.stringify(stats, null, 2));
  
  // Sample node for verification
  const sampleNodeId = graph.keys().next().value;
  if (sampleNodeId) {
    console.log('[GraphBuilder] Sample node:', JSON.stringify(graph.get(sampleNodeId), null, 2));
  }
  
  return { graph, routeMap, stats };
}

/**
 * Validate graph integrity.
 * Checks that all edge targets exist in the graph.
 * 
 * @param {Map<string, GraphNode>} graph - The graph to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateGraph(graph) {
  const errors = [];
  
  for (const [nodeId, node] of graph) {
    for (const edge of node.edges) {
      if (!graph.has(edge.toNodeId)) {
        errors.push(`Node ${nodeId} has edge to non-existent node ${edge.toNodeId}`);
      }
    }
  }
  
  const valid = errors.length === 0;
  
  if (valid) {
    console.log('[GraphBuilder] ✅ Graph validation passed');
  } else {
    console.error('[GraphBuilder] ❌ Graph validation failed:', errors);
  }
  
  return { valid, errors };
}

module.exports = {
  buildGraph,
  validateGraph,
  haversineDistance,
  generateNodeId,
  parseNodeId,
  TRANSFER_RADIUS_KM
};

console.log('[GraphBuilder] Module loaded');
