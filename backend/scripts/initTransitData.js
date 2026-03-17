/**
 * Transit Data Initialization Script
 * 
 * Processes routes.json and maps transit routes to the road network.
 * Creates:
 * - TransitRoute documents in MongoDB
 * - RoadNode documents for nodes with transit coverage
 * - TransitConfig document with default settings
 * - transitMetadata.json for lightweight route lookups
 * - roadAdjacency.json (filtered adjacency for transit-covered areas)
 * 
 * Run: node backend/scripts/initTransitData.js
 * 
 * Part of Phase 2: GraphService implementation.
 * 
 * @module scripts/initTransitData
 * @version 1.0.0
 */

// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const TransitMapper = require('../services/TransitMapper');
const { TransitRoute, TransitConfig, RoadNode } = require('../models');
const connectDB = require('../config/database');

/**
 * Main initialization function
 */
async function initTransitData() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         Transit Data Initialization Script');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Configuration
  const MAPPING_TOLERANCE_KM = 0.1; // 100m
  const DATA_DIR = path.join(__dirname, '..', 'data');
  const ROUTES_PATH = path.join(DATA_DIR, 'routes.json');
  const ROAD_NETWORK_PATH = path.join(DATA_DIR, 'roadNetwork.json');
  
  // Check required files exist
  if (!fs.existsSync(ROUTES_PATH)) {
    console.error(`❌ Error: routes.json not found at ${ROUTES_PATH}`);
    console.log('   Please ensure routes.json exists in backend/data/');
    process.exit(1);
  }
  
  if (!fs.existsSync(ROAD_NETWORK_PATH)) {
    console.error(`❌ Error: roadNetwork.json not found at ${ROAD_NETWORK_PATH}`);
    console.log('   Please run: node backend/scripts/extractRoadGraph.js first');
    process.exit(1);
  }

  try {
    // Step 1: Connect to MongoDB
    console.log('Step 1: Connecting to MongoDB...');
    await connectDB();
    console.log('✓ Connected to MongoDB\n');

    // Step 2: Initialize TransitMapper
    console.log('Step 2: Loading road network...');
    const mapper = new TransitMapper();
    await mapper.initialize(ROAD_NETWORK_PATH);
    
    const stats = mapper.getNetworkStats();
    console.log(`✓ Road network loaded:`);
    console.log(`  - ${stats.totalNodes.toLocaleString()} nodes`);
    console.log(`  - ${stats.totalEdges.toLocaleString()} edges`);
    console.log(`  - ${stats.gridCells.toLocaleString()} grid cells\n`);

    // Step 3: Process routes
    console.log(`Step 3: Processing routes (tolerance: ${MAPPING_TOLERANCE_KM * 1000}m)...`);
    const processedRoutes = mapper.processAllRoutes(ROUTES_PATH, MAPPING_TOLERANCE_KM);
    console.log(`✓ Processed ${processedRoutes.length} route directions\n`);

    // Step 4: Get node coverage
    console.log('Step 4: Calculating node coverage...');
    const nodeCoverage = mapper.getNodeCoverage(processedRoutes);
    console.log(`✓ ${nodeCoverage.size} road nodes have transit coverage\n`);

    // Step 5: Clear existing data
    console.log('Step 5: Clearing existing data...');
    await TransitRoute.deleteMany({});
    await RoadNode.deleteMany({});
    console.log('✓ Cleared existing transit data\n');

    // Step 6: Save TransitRoute documents
    console.log('Step 6: Saving transit routes to MongoDB...');
    const routeDocs = await TransitRoute.insertMany(processedRoutes);
    console.log(`✓ Saved ${routeDocs.length} TransitRoute documents\n`);

    // Step 7: Save RoadNode documents
    console.log('Step 7: Saving road nodes with transit coverage...');
    const roadNodes = fs.readFileSync(ROAD_NETWORK_PATH, 'utf-8');
    const networkData = JSON.parse(roadNodes);
    
    const roadNodeDocs = [];
    for (const [nodeId, info] of nodeCoverage) {
      const coords = networkData.nodes[nodeId];
      if (coords) {
        roadNodeDocs.push({
          nodeId,
          lat: coords.lat,
          lon: coords.lon,
          transitRoutes: info.routes,
          isTerminal: info.isTerminal,
          terminalFor: info.terminalFor,
          terminalType: info.terminalType
        });
      }
    }
    
    // Insert in batches to avoid memory issues
    const BATCH_SIZE = 1000;
    let insertedCount = 0;
    
    for (let i = 0; i < roadNodeDocs.length; i += BATCH_SIZE) {
      const batch = roadNodeDocs.slice(i, i + BATCH_SIZE);
      await RoadNode.insertMany(batch);
      insertedCount += batch.length;
      process.stdout.write(`\r  Progress: ${insertedCount}/${roadNodeDocs.length}`);
    }
    console.log(`\n✓ Saved ${roadNodeDocs.length} RoadNode documents\n`);

    // Step 8: Create/Update TransitConfig
    console.log('Step 8: Creating transit configuration...');
    await TransitConfig.getConfig(); // Creates default if not exists
    console.log('✓ Transit configuration ready\n');

    // Step 9: Create transitMetadata.json
    console.log('Step 9: Creating transit metadata file...');
    const transitMetadata = {
      generated: new Date().toISOString(),
      totalRoutes: processedRoutes.length,
      routes: processedRoutes.map(r => ({
        routeId: r.routeId,
        routeName: r.routeName,
        vehicleType: r.vehicleType,
        signboard: r.signboard,
        direction: r.direction,
        startTerminal: r.startTerminal,
        endTerminal: r.endTerminal,
        nodeCount: r.nodeCount,
        totalDistanceKm: r.totalDistanceKm
      }))
    };
    
    const metadataPath = path.join(DATA_DIR, 'transitMetadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(transitMetadata, null, 2));
    console.log(`✓ Created ${metadataPath}\n`);

    // Step 10: Create roadAdjacency.json (filtered for transit-covered nodes)
    console.log('Step 10: Creating filtered road adjacency file...');
    
    // Get all nodes that are part of transit routes (plus their neighbors for walking)
    const transitNodeSet = new Set(nodeCoverage.keys());
    
    // Expand to include immediate neighbors (for walking paths)
    const expandedNodeSet = new Set(transitNodeSet);
    for (const nodeId of transitNodeSet) {
      const neighbors = networkData.adjacency[nodeId];
      if (neighbors) {
        for (const neighborId of Object.keys(neighbors)) {
          expandedNodeSet.add(neighborId);
        }
      }
    }

    const filteredNodes = {};
    const filteredAdjacency = {};
    
    for (const nodeId of expandedNodeSet) {
      // Add node
      if (networkData.nodes[nodeId]) {
        filteredNodes[nodeId] = networkData.nodes[nodeId];
      }
      
      // Add adjacency (only to other nodes in the expanded set)
      if (networkData.adjacency[nodeId]) {
        const neighbors = {};
        for (const [neighborId, distance] of Object.entries(networkData.adjacency[nodeId])) {
          if (expandedNodeSet.has(neighborId)) {
            neighbors[neighborId] = distance;
          }
        }
        if (Object.keys(neighbors).length > 0) {
          filteredAdjacency[nodeId] = neighbors;
        }
      }
    }

    const roadAdjacencyData = {
      metadata: {
        generated: new Date().toISOString(),
        totalNodes: Object.keys(filteredNodes).length,
        totalEdges: Object.values(filteredAdjacency)
          .reduce((sum, n) => sum + Object.keys(n).length, 0),
        transitCoveredNodes: transitNodeSet.size,
        expandedNodes: expandedNodeSet.size,
        description: 'Filtered road adjacency for transit-covered areas'
      },
      nodes: filteredNodes,
      adjacency: filteredAdjacency
    };

    const adjacencyPath = path.join(DATA_DIR, 'roadAdjacency.json');
    fs.writeFileSync(adjacencyPath, JSON.stringify(roadAdjacencyData));
    console.log(`✓ Created ${adjacencyPath}`);
    console.log(`  - ${Object.keys(filteredNodes).length.toLocaleString()} nodes`);
    console.log(`  - ${roadAdjacencyData.metadata.totalEdges.toLocaleString()} edges`);
    
    // Calculate file sizes
    const adjacencySize = fs.statSync(adjacencyPath).size / (1024 * 1024);
    console.log(`  - File size: ${adjacencySize.toFixed(2)} MB\n`);

    // Step 11: Generate summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    INITIALIZATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('📊 Summary:');
    console.log(`   Transit Routes:     ${processedRoutes.length}`);
    console.log(`   Transit Nodes:      ${nodeCoverage.size.toLocaleString()}`);
    console.log(`   Terminal Nodes:     ${roadNodeDocs.filter(n => n.isTerminal).length}`);
    console.log(`   Adjacency Nodes:    ${Object.keys(filteredNodes).length.toLocaleString()}`);
    console.log(`   Adjacency Edges:    ${roadAdjacencyData.metadata.totalEdges.toLocaleString()}`);
    console.log('');
    console.log('📁 Files Created:');
    console.log(`   ${metadataPath}`);
    console.log(`   ${adjacencyPath}`);
    console.log('');
    console.log('🗄️  MongoDB Collections:');
    console.log(`   - transitroutes:    ${routeDocs.length} documents`);
    console.log(`   - roadnodes:        ${roadNodeDocs.length} documents`);
    console.log(`   - transitconfigs:   1 document`);
    console.log('');
    console.log('✅ Transit data initialization complete!');
    console.log('   Next step: Implement GraphService and A* algorithm (Phase 3)');

  } catch (error) {
    console.error('\n❌ Error during initialization:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n📡 MongoDB connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  initTransitData();
}

module.exports = { initTransitData };
