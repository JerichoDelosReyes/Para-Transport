/**
 * Graph Types for Transit Network
 * 
 * JSDoc type definitions for the A* Transit Graph implementation.
 * These types define the structure of nodes, edges, and search results.
 * 
 * @module types/graph.types
 * @version 1.0.0
 */

/**
 * Represents an edge (connection) between two graph nodes.
 * Edges are unidirectional and follow the route's travel direction.
 * 
 * @typedef {Object} GraphEdge
 * @property {string} toNodeId - Target node identifier (format: "routeId:index")
 * @property {string} routeId - The route this edge belongs to
 * @property {number} distanceKm - Distance in kilometers (calculated via Haversine)
 * @property {string} vehicleType - Type of vehicle (jeep, bus, tricycle, etc.)
 * @property {boolean} isTransfer - True if this edge connects two different routes
 */

/**
 * Represents a node (stop) in the transit graph.
 * Each coordinate point in a route becomes a node.
 * 
 * @typedef {Object} GraphNode
 * @property {string} id - Unique identifier (format: "routeId:coordinateIndex")
 * @property {number} lat - Latitude coordinate
 * @property {number} lon - Longitude coordinate
 * @property {GraphEdge[]} edges - Array of outgoing edges to connected nodes
 * @property {string[]} routeIds - List of route IDs that pass through this node
 */

/**
 * Result of a nearest node lookup.
 * 
 * @typedef {Object} NearestNodeResult
 * @property {string} nodeId - The ID of the nearest node
 * @property {number} distanceKm - Distance from query point to node in kilometers
 * @property {GraphNode} node - The full node object
 */

/**
 * A segment of the path returned by A* search.
 * Represents travel along a single route between two points.
 * 
 * @typedef {Object} RouteSegment
 * @property {string} fromNodeId - Starting node ID
 * @property {string} toNodeId - Ending node ID
 * @property {string} routeId - Route identifier
 * @property {string} routeName - Human-readable route name
 * @property {string} vehicleType - Vehicle type for this segment
 * @property {number} distanceKm - Distance of this segment
 * @property {Array<{lat: number, lon: number}>} coordinates - Coordinates for polyline
 */

/**
 * Complete path result from A* search.
 * 
 * @typedef {Object} PathResult
 * @property {RouteSegment[]} segments - Ordered array of route segments
 * @property {number} totalDistanceKm - Total path distance
 * @property {number} transferCount - Number of route transfers
 * @property {Array<{latitude: number, longitude: number}>} polyline - Full path for map rendering
 */

/**
 * Route properties from GeoJSON feature.
 * 
 * @typedef {Object} RouteProperties
 * @property {string} routeId - Unique route identifier
 * @property {string} routeName - Human-readable route name
 * @property {string} vehicleType - Vehicle type (jeep, bus, etc.)
 * @property {string} signboard - Signboard text displayed on vehicle
 * @property {string} direction - Route direction (inbound/outbound)
 */

/**
 * GeoJSON Feature for a route.
 * 
 * @typedef {Object} RouteFeature
 * @property {string} type - Always "Feature"
 * @property {RouteProperties} properties - Route metadata
 * @property {{type: string, coordinates: number[][]}} geometry - LineString geometry
 */

/**
 * Graph statistics for monitoring.
 * 
 * @typedef {Object} GraphStats
 * @property {number} nodeCount - Total number of nodes in the graph
 * @property {number} edgeCount - Total number of edges
 * @property {number} routeCount - Number of routes loaded
 * @property {number} transferEdgeCount - Number of transfer edges created
 */

// Export empty object to make this a module
module.exports = {};

console.log('[graph.types] Type definitions loaded');
