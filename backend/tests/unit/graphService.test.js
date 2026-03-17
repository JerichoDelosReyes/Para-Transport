/**
 * GraphService Unit Tests
 * 
 * Tests for the main graph service that handles transit routing operations.
 * 
 * @module tests/unit/graphService.test.js
 * @version 1.0.0
 */

const { GraphService } = require('../../services/GraphService');

// Mock data
const mockRoadNodes = {
  'node_1': { lat: 14.25, lon: 120.85 },
  'node_2': { lat: 14.251, lon: 120.851 },
  'node_3': { lat: 14.252, lon: 120.852 },
  'node_4': { lat: 14.30, lon: 120.90 },
  'node_5': { lat: 14.301, lon: 120.901 }
};

const mockRoadAdjacency = {
  'node_1': { 'node_2': 0.15 },
  'node_2': { 'node_1': 0.15, 'node_3': 0.15 },
  'node_3': { 'node_2': 0.15, 'node_4': 5.0 },
  'node_4': { 'node_3': 5.0, 'node_5': 0.15 },
  'node_5': { 'node_4': 0.15 }
};

const mockTransitRoutes = [
  {
    routeId: 'route1_outbound',
    routeName: 'Test Route 1',
    vehicleType: 'jeep',
    signboard: 'TR1',
    direction: 'outbound',
    startTerminal: { roadNodeId: 'node_1', lat: 14.25, lon: 120.85 },
    endTerminal: { roadNodeId: 'node_3', lat: 14.252, lon: 120.852 },
    roadNodeSequence: ['node_1', 'node_2', 'node_3'],
    totalDistanceKm: 0.3,
    nodeCount: 3,
    isActive: true
  },
  {
    routeId: 'route2_outbound',
    routeName: 'Test Route 2',
    vehicleType: 'jeep',
    signboard: 'TR2',
    direction: 'outbound',
    startTerminal: { roadNodeId: 'node_2', lat: 14.251, lon: 120.851 },
    endTerminal: { roadNodeId: 'node_5', lat: 14.301, lon: 120.901 },
    roadNodeSequence: ['node_2', 'node_3', 'node_4', 'node_5'],
    totalDistanceKm: 5.3,
    nodeCount: 4,
    isActive: true
  }
];

const mockRoadNodesWithTransit = [
  { nodeId: 'node_1', lat: 14.25, lon: 120.85, transitRoutes: ['route1_outbound'], isTerminal: true, terminalFor: ['route1_outbound'], terminalType: 'start' },
  { nodeId: 'node_2', lat: 14.251, lon: 120.851, transitRoutes: ['route1_outbound', 'route2_outbound'], isTerminal: true, terminalFor: ['route2_outbound'], terminalType: 'start' },
  { nodeId: 'node_3', lat: 14.252, lon: 120.852, transitRoutes: ['route1_outbound', 'route2_outbound'], isTerminal: true, terminalFor: ['route1_outbound'], terminalType: 'end' },
  { nodeId: 'node_4', lat: 14.30, lon: 120.90, transitRoutes: ['route2_outbound'], isTerminal: false, terminalFor: [], terminalType: null },
  { nodeId: 'node_5', lat: 14.301, lon: 120.901, transitRoutes: ['route2_outbound'], isTerminal: true, terminalFor: ['route2_outbound'], terminalType: 'end' }
];

const mockConfig = {
  transferPenaltyMinutes: 10,
  maxWalkingDistanceKm: 0.5,
  maxTransferWalkingKm: 0.2,
  walkingSpeedKmh: 4.5,
  routeMappingToleranceKm: 0.1,
  maxSearchRadiusKm: 2.0
};

// Create a mock-initialized GraphService for testing
function createMockGraphService() {
  const service = new GraphService();
  
  // Manually set up internal state (bypassing async initialize)
  service.roadNodes = mockRoadNodes;
  service.roadAdjacency = mockRoadAdjacency;
  service.config = mockConfig;
  
  // Set up transit route cache
  service.transitRouteCache = new Map();
  for (const route of mockTransitRoutes) {
    service.transitRouteCache.set(route.routeId, route);
  }
  
  // Set up node transit cache
  service.nodeTransitCache = new Map();
  for (const node of mockRoadNodesWithTransit) {
    service.nodeTransitCache.set(node.nodeId, {
      transitRoutes: node.transitRoutes,
      isTerminal: node.isTerminal,
      terminalFor: node.terminalFor,
      terminalType: node.terminalType
    });
  }
  
  // Build spatial index
  service._buildSpatialIndex();
  service.isInitialized = true;
  
  return service;
}

describe('GraphService', () => {
  let graphService;

  beforeEach(() => {
    graphService = createMockGraphService();
  });

  describe('initialization', () => {
    test('should be initialized with mock data', () => {
      expect(graphService.isInitialized).toBe(true);
    });

    test('should have correct number of routes in cache', () => {
      expect(graphService.transitRouteCache.size).toBe(2);
    });

    test('should have correct number of transit nodes in cache', () => {
      expect(graphService.nodeTransitCache.size).toBe(5);
    });
  });

  describe('findNearestRoadNode', () => {
    test('should find nearest node within search radius', () => {
      const result = graphService.findNearestRoadNode(14.25, 120.85);
      expect(result).not.toBeNull();
      expect(result.nodeId).toBe('node_1');
      expect(result.distance).toBeCloseTo(0, 1);
    });

    test('should return null when no node within radius', () => {
      const result = graphService.findNearestRoadNode(15.0, 121.0, 0.01);
      expect(result).toBeNull();
    });

    test('should find node with specified max distance', () => {
      const result = graphService.findNearestRoadNode(14.255, 120.855, 1.0);
      expect(result).not.toBeNull();
    });
  });

  describe('findNearestTransitNodes', () => {
    test('should find transit nodes near location', () => {
      const results = graphService.findNearestTransitNodes(14.25, 120.85, 1.0, 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].transitRoutes).toBeDefined();
      expect(results[0].transitRoutes.length).toBeGreaterThan(0);
    });

    test('should limit results to specified count', () => {
      const results = graphService.findNearestTransitNodes(14.25, 120.85, 10.0, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('should sort results by distance', () => {
      const results = graphService.findNearestTransitNodes(14.25, 120.85, 10.0, 5);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });
  });

  describe('getTransitRoutesAtNode', () => {
    test('should return transit info for node with coverage', () => {
      const result = graphService.getTransitRoutesAtNode('node_2');
      expect(result).not.toBeNull();
      expect(result.transitRoutes).toContain('route1_outbound');
      expect(result.transitRoutes).toContain('route2_outbound');
    });

    test('should return null for non-existent node', () => {
      const result = graphService.getTransitRoutesAtNode('non_existent');
      expect(result).toBeNull();
    });

    test('should include terminal info', () => {
      const result = graphService.getTransitRoutesAtNode('node_1');
      expect(result.isTerminal).toBe(true);
      expect(result.terminalFor).toContain('route1_outbound');
    });
  });

  describe('getRouteInfo', () => {
    test('should return route info for valid route ID', () => {
      const result = graphService.getRouteInfo('route1_outbound');
      expect(result).not.toBeNull();
      expect(result.routeName).toBe('Test Route 1');
      expect(result.vehicleType).toBe('jeep');
    });

    test('should return null for invalid route ID', () => {
      const result = graphService.getRouteInfo('non_existent');
      expect(result).toBeNull();
    });
  });

  describe('getAllRoutes', () => {
    test('should return all routes', () => {
      const routes = graphService.getAllRoutes();
      expect(routes.length).toBe(2);
    });

    test('should include route metadata', () => {
      const routes = graphService.getAllRoutes();
      const route1 = routes.find(r => r.routeId === 'route1_outbound');
      expect(route1).toBeDefined();
      expect(route1.roadNodeSequence.length).toBe(3);
    });
  });

  describe('getNeighbors', () => {
    test('should return neighbors with distances', () => {
      const neighbors = graphService.getNeighbors('node_2');
      expect(neighbors).not.toBeNull();
      expect(neighbors['node_1']).toBeDefined();
      expect(neighbors['node_3']).toBeDefined();
    });

    test('should return null for node without neighbors', () => {
      const neighbors = graphService.getNeighbors('non_existent');
      expect(neighbors).toBeNull();
    });
  });

  describe('getNodeCoords', () => {
    test('should return coordinates for valid node', () => {
      const coords = graphService.getNodeCoords('node_1');
      expect(coords).not.toBeNull();
      expect(coords.lat).toBe(14.25);
      expect(coords.lon).toBe(120.85);
    });

    test('should return null for invalid node', () => {
      const coords = graphService.getNodeCoords('non_existent');
      expect(coords).toBeNull();
    });
  });

  describe('isNodeOnRoute', () => {
    test('should return true for node on route', () => {
      expect(graphService.isNodeOnRoute('node_1', 'route1_outbound')).toBe(true);
    });

    test('should return false for node not on route', () => {
      expect(graphService.isNodeOnRoute('node_1', 'route2_outbound')).toBe(false);
    });

    test('should return false for non-existent node', () => {
      expect(graphService.isNodeOnRoute('non_existent', 'route1_outbound')).toBe(false);
    });
  });

  describe('findCommonRoutes', () => {
    test('should find routes common to both nodes', () => {
      const common = graphService.findCommonRoutes('node_2', 'node_3');
      expect(common).toContain('route1_outbound');
      expect(common).toContain('route2_outbound');
    });

    test('should return empty array when no common routes', () => {
      const common = graphService.findCommonRoutes('node_1', 'node_5');
      expect(common.length).toBe(0);
    });
  });

  describe('canTransferAtNode', () => {
    test('should return true for node with multiple routes', () => {
      expect(graphService.canTransferAtNode('node_2')).toBe(true);
    });

    test('should return false for node with single route', () => {
      expect(graphService.canTransferAtNode('node_1')).toBe(false);
    });

    test('should return false for node without transit', () => {
      expect(graphService.canTransferAtNode('non_existent')).toBe(false);
    });
  });

  describe('getTransferOptions', () => {
    test('should return transfer options excluding current route', () => {
      const options = graphService.getTransferOptions('node_2', 'route1_outbound');
      expect(options.length).toBe(1);
      expect(options[0].routeId).toBe('route2_outbound');
    });

    test('should return empty array when no transfer possible', () => {
      const options = graphService.getTransferOptions('node_1', 'route1_outbound');
      expect(options.length).toBe(0);
    });
  });

  describe('getTerminals', () => {
    test('should return all terminal nodes', () => {
      const terminals = graphService.getTerminals();
      expect(terminals.length).toBe(4); // nodes 1, 2, 3, 5 are terminals
    });

    test('should include terminal information', () => {
      const terminals = graphService.getTerminals();
      const node1 = terminals.find(t => t.nodeId === 'node_1');
      expect(node1).toBeDefined();
      expect(node1.terminalFor).toContain('route1_outbound');
    });
  });

  describe('getConfig', () => {
    test('should return configuration object', () => {
      const config = graphService.getConfig();
      expect(config.transferPenaltyMinutes).toBe(10);
      expect(config.maxWalkingDistanceKm).toBe(0.5);
    });
  });

  describe('getStats', () => {
    test('should return service statistics', () => {
      const stats = graphService.getStats();
      expect(stats.totalNodes).toBe(5);
      expect(stats.transitRoutes).toBe(2);
      expect(stats.transitNodes).toBe(5);
    });
  });
});

describe('GraphService - error handling', () => {
  test('should throw error when not initialized', () => {
    const uninitializedService = new GraphService();
    expect(() => uninitializedService.findNearestRoadNode(14.25, 120.85))
      .toThrow('GraphService not initialized');
  });
});
