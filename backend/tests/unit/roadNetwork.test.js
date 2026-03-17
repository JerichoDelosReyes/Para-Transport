/**
 * Road Network Test Suite
 * 
 * Jest tests for Phase 0 road network extraction verification.
 * 
 * @module tests/unit/roadNetwork.test
 */

const fs = require('fs');
const path = require('path');

const ROAD_NETWORK_PATH = path.join(__dirname, '../../data/roadNetwork.json');

// Helper function for distance calculations
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

describe('Phase 0: Road Network', () => {
  let roadNetwork;
  let fileStats;

  beforeAll(() => {
    // Load road network once for all tests
    if (fs.existsSync(ROAD_NETWORK_PATH)) {
      fileStats = fs.statSync(ROAD_NETWORK_PATH);
      roadNetwork = JSON.parse(fs.readFileSync(ROAD_NETWORK_PATH, 'utf8'));
    }
  });

  test('roadNetwork.json file exists', () => {
    expect(fs.existsSync(ROAD_NETWORK_PATH)).toBe(true);
  });

  test('file size is reasonable (> 100MB)', () => {
    const sizeMB = fileStats.size / (1024 * 1024);
    expect(sizeMB).toBeGreaterThan(100);
  });

  test('has valid metadata structure', () => {
    expect(roadNetwork.metadata).toBeDefined();
    expect(roadNetwork.metadata.source).toBeDefined();
    expect(roadNetwork.metadata.nodeCount).toBeGreaterThan(0);
    expect(roadNetwork.metadata.edgeCount).toBeGreaterThan(0);
  });

  test('has nodes object with entries', () => {
    expect(roadNetwork.nodes).toBeDefined();
    const nodeCount = Object.keys(roadNetwork.nodes).length;
    expect(nodeCount).toBeGreaterThan(0);
  });

  test('has adjacency object with entries', () => {
    expect(roadNetwork.adjacency).toBeDefined();
    const adjCount = Object.keys(roadNetwork.adjacency).length;
    expect(adjCount).toBeGreaterThan(0);
  });

  test('sample node has required fields', () => {
    const nodeIds = Object.keys(roadNetwork.nodes);
    const sampleNode = roadNetwork.nodes[nodeIds[0]];
    
    expect(sampleNode).toBeDefined();
    expect(typeof sampleNode.lat).toBe('number');
    expect(typeof sampleNode.lon).toBe('number');
  });

  test('sample adjacency has edges with required fields', () => {
    const adjKeys = Object.keys(roadNetwork.adjacency);
    const keyWithEdges = adjKeys.find(k => roadNetwork.adjacency[k].length > 0);
    const edges = roadNetwork.adjacency[keyWithEdges];
    
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].to).toBeDefined();
    expect(typeof edges[0].distanceKm).toBe('number');
  });

  test('can find node near Imus (14.4296, 120.9367)', () => {
    const targetLat = 14.4296;
    const targetLon = 120.9367;
    
    let nearestNode = null;
    let minDistance = Infinity;

    for (const [nodeId, node] of Object.entries(roadNetwork.nodes)) {
      const dist = haversine(targetLat, targetLon, node.lat, node.lon);
      if (dist < minDistance) {
        minDistance = dist;
        nearestNode = { id: nodeId, ...node };
      }
    }

    // Should find a node within 1km of target
    expect(nearestNode).not.toBeNull();
    expect(minDistance).toBeLessThan(1);
  });

  test('metadata node count matches actual nodes', () => {
    const actualCount = Object.keys(roadNetwork.nodes).length;
    expect(roadNetwork.metadata.nodeCount).toBe(actualCount);
  });
});
