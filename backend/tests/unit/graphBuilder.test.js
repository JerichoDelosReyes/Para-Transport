/**
 * Graph Builder Test Suite
 * 
 * Jest tests for Phase 1 graph builder verification.
 * 
 * @module tests/unit/graphBuilder.test
 */

const path = require('path');
const { buildGraph, validateGraph, haversineDistance } = require('../../services/graphBuilder');

// Load routes data
const routesData = require('../../data/routes.json');

describe('Phase 1: Graph Builder', () => {
  let graph;
  let routeMap;
  let stats;

  beforeAll(() => {
    // Build graph once for all tests
    const result = buildGraph(routesData);
    graph = result.graph;
    routeMap = result.routeMap;
    stats = result.stats;
  });

  describe('haversineDistance', () => {
    test('calculates distance between BDO and SM Molino correctly (~5-6 km)', () => {
      const bdoCoords = { lat: 14.4207, lon: 120.9407 };
      const smMolinoCoords = { lat: 14.3841, lon: 120.9777 };

      const distance = haversineDistance(
        bdoCoords.lat, bdoCoords.lon,
        smMolinoCoords.lat, smMolinoCoords.lon
      );

      expect(distance).toBeGreaterThan(4);
      expect(distance).toBeLessThan(7);
    });

    test('returns 0 for same coordinates', () => {
      const distance = haversineDistance(14.4207, 120.9407, 14.4207, 120.9407);
      expect(distance).toBe(0);
    });
  });

  describe('buildGraph', () => {
    test('creates nodes from routes', () => {
      expect(stats.nodeCount).toBeGreaterThan(0);
    });

    test('creates edges from routes', () => {
      expect(stats.edgeCount).toBeGreaterThan(0);
    });

    test('processes all routes', () => {
      expect(stats.routeCount).toBe(routesData.features.length);
    });

    test('creates transfer edges', () => {
      expect(stats.transferEdgeCount).toBeGreaterThan(0);
    });

    test('graph is a Map', () => {
      expect(graph instanceof Map).toBe(true);
    });

    test('routeMap is a Map', () => {
      expect(routeMap instanceof Map).toBe(true);
    });
  });

  describe('node structure', () => {
    test('sample node has required fields', () => {
      const sampleNodeId = graph.keys().next().value;
      const sampleNode = graph.get(sampleNodeId);

      expect(sampleNode.id).toBeDefined();
      expect(typeof sampleNode.lat).toBe('number');
      expect(typeof sampleNode.lon).toBe('number');
      expect(Array.isArray(sampleNode.edges)).toBe(true);
      expect(Array.isArray(sampleNode.routeIds)).toBe(true);
    });

    test('edges have required fields', () => {
      const sampleNodeId = graph.keys().next().value;
      const sampleNode = graph.get(sampleNodeId);
      
      if (sampleNode.edges.length > 0) {
        const edge = sampleNode.edges[0];
        expect(edge.toNodeId).toBeDefined();
        expect(typeof edge.distanceKm).toBe('number');
        expect(edge.routeId).toBeDefined();
        expect(typeof edge.isTransfer).toBe('boolean');
      }
    });
  });

  describe('route map', () => {
    test('sample route has required fields', () => {
      const sampleRouteId = routeMap.keys().next().value;
      const sampleRoute = routeMap.get(sampleRouteId);

      expect(sampleRoute.routeName).toBeDefined();
      expect(sampleRoute.vehicleType).toBeDefined();
      expect(sampleRoute.direction).toBeDefined();
    });
  });

  describe('validateGraph', () => {
    test('graph passes validation', () => {
      const validation = validateGraph(graph);
      expect(validation.valid).toBe(true);
    });

    test('validation returns no errors', () => {
      const validation = validateGraph(graph);
      expect(validation.errors).toHaveLength(0);
    });
  });
});
