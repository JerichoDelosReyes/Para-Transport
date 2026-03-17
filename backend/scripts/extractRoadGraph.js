#!/usr/bin/env node

/**
 * OSM PBF Road Network Extractor
 * 
 * Extracts road network data from OpenStreetMap PBF file and converts
 * it to an optimized adjacency list format for GPS snapping and routing.
 * 
 * Usage: node backend/scripts/extractRoadGraph.js
 * 
 * Input:  backend/data/philippines-260113.osm.pbf
 * Output: backend/data/roadNetwork.json
 * 
 * @module scripts/extractRoadGraph
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const through = require('through2');
const parseOSM = require('osm-pbf-parser');

// ============================================
// CONFIGURATION
// ============================================

/**
 * Bounding box for Cavite area (approximate)
 * Format: [minLon, minLat, maxLon, maxLat]
 */
const BOUNDING_BOX = {
  minLat: 14.0,
  maxLat: 14.6,
  minLon: 120.7,
  maxLon: 121.1
};

/**
 * Highway types to include in the road network
 * These are OSM highway tag values
 */
const INCLUDED_HIGHWAY_TYPES = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'service',
  'unclassified',
  'living_street',
  'pedestrian'  // Included as per user request
]);

/**
 * Highway types to exclude
 */
const EXCLUDED_HIGHWAY_TYPES = new Set([
  'footway',
  'cycleway',
  'path',
  'steps',
  'bridleway',
  'track',
  'construction'
]);

// File paths
const INPUT_FILE = path.join(__dirname, '../data/planet_120.67_14.069_6bda5da0.osm.pbf');
const OUTPUT_FILE = path.join(__dirname, '../data/roadNetwork.json');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a coordinate is within the bounding box
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean}
 */
function isInBoundingBox(lat, lon) {
  return (
    lat >= BOUNDING_BOX.minLat &&
    lat <= BOUNDING_BOX.maxLat &&
    lon >= BOUNDING_BOX.minLon &&
    lon <= BOUNDING_BOX.maxLon
  );
}

/**
 * Calculate Haversine distance between two points
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Format bytes to human readable string
 * @param {number} bytes 
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Format duration to human readable string
 * @param {number} ms - Milliseconds
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return (ms / 60000).toFixed(1) + 'min';
}

// ============================================
// MAIN EXTRACTION LOGIC
// ============================================

async function extractRoadGraph() {
  console.log('\n========================================');
  console.log('🗺️  OSM Road Network Extractor');
  console.log('========================================\n');
  
  // Check if input file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    console.error('   Please ensure the PBF file is in backend/data/');
    process.exit(1);
  }
  
  const fileStats = fs.statSync(INPUT_FILE);
  const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
  console.log(`📂 Input: ${INPUT_FILE}`);
  console.log(`📊 File size: ${formatBytes(fileStats.size)}`);
  console.log(`✅ Map Data Loaded: ${fileSizeMB} MB`);
  console.log(`📍 Bounding box: Lat ${BOUNDING_BOX.minLat}-${BOUNDING_BOX.maxLat}, Lon ${BOUNDING_BOX.minLon}-${BOUNDING_BOX.maxLon}`);
  console.log('\n⏳ Starting extraction (this may take 5-15 minutes)...\n');
  
  const startTime = Date.now();
  
  // Data structures
  const allNodes = new Map();      // OSM node ID -> {lat, lon}
  const ways = [];                  // Array of {id, nodeRefs, roadType}
  const usedNodeIds = new Set();    // Node IDs that are part of ways
  
  // Statistics
  let totalNodes = 0;
  let totalWays = 0;
  let filteredNodes = 0;
  let filteredWays = 0;
  
  // Parse the PBF file
  return new Promise((resolve, reject) => {
    const parser = parseOSM();
    
    const processor = through.obj(function(items, enc, next) {
      for (const item of items) {
        // Process nodes
        if (item.type === 'node') {
          totalNodes++;
          
          if (isInBoundingBox(item.lat, item.lon)) {
            allNodes.set(item.id, { lat: item.lat, lon: item.lon });
            filteredNodes++;
          }
          
          // Progress logging every 1M nodes
          if (totalNodes % 1000000 === 0) {
            console.log(`[Extractor] Processed ${(totalNodes / 1000000).toFixed(0)}M nodes, ${filteredNodes} in bbox...`);
          }
        }
        
        // Process ways
        if (item.type === 'way') {
          totalWays++;
          
          // Check if it's a highway
          const tags = item.tags || {};
          const highwayType = tags.highway;
          
          if (highwayType && INCLUDED_HIGHWAY_TYPES.has(highwayType)) {
            // Store way for later processing
            ways.push({
              id: item.id,
              nodeRefs: item.refs || [],
              roadType: highwayType,
              name: tags.name || null,
              oneway: tags.oneway === 'yes' || tags.oneway === '1'
            });
            filteredWays++;
            
            // Mark nodes as used
            for (const nodeId of (item.refs || [])) {
              usedNodeIds.add(nodeId);
            }
          }
          
          // Progress logging every 100k ways
          if (totalWays % 100000 === 0) {
            console.log(`[Extractor] Processed ${(totalWays / 1000).toFixed(0)}K ways, ${filteredWays} highways...`);
          }
        }
      }
      
      next();
    });
    
    fs.createReadStream(INPUT_FILE)
      .pipe(parser)
      .pipe(processor)
      .on('finish', () => {
        console.log('\n[Extractor] PBF parsing complete!');
        console.log(`[Extractor] Total nodes: ${totalNodes}, in bbox: ${filteredNodes}`);
        console.log(`[Extractor] Total ways: ${totalWays}, highways: ${filteredWays}`);
        
        // Build adjacency list
        console.log('\n[Extractor] Building adjacency list...');
        
        const nodes = {};
        const adjacency = {};
        let edgeCount = 0;
        let nodesInWays = 0;
        
        // Only keep nodes that are part of ways and in bounding box
        for (const nodeId of usedNodeIds) {
          if (allNodes.has(nodeId)) {
            const node = allNodes.get(nodeId);
            const nodeKey = `osm_${nodeId}`;
            nodes[nodeKey] = { lat: node.lat, lon: node.lon };
            adjacency[nodeKey] = [];
            nodesInWays++;
          }
        }
        
        console.log(`[Extractor] Nodes in road network: ${nodesInWays}`);
        
        // Build edges from ways
        for (const way of ways) {
          const nodeRefs = way.nodeRefs;
          
          for (let i = 0; i < nodeRefs.length - 1; i++) {
            const fromId = nodeRefs[i];
            const toId = nodeRefs[i + 1];
            
            const fromKey = `osm_${fromId}`;
            const toKey = `osm_${toId}`;
            
            // Skip if nodes not in our filtered set
            if (!nodes[fromKey] || !nodes[toKey]) continue;
            
            const fromNode = nodes[fromKey];
            const toNode = nodes[toKey];
            
            // Calculate distance
            const distance = haversineDistance(
              fromNode.lat, fromNode.lon,
              toNode.lat, toNode.lon
            );
            
            // Add forward edge
            adjacency[fromKey].push({
              to: toKey,
              distanceKm: Math.round(distance * 10000) / 10000, // 4 decimal places
              roadType: way.roadType
            });
            edgeCount++;
            
            // Add reverse edge (unless one-way)
            if (!way.oneway) {
              adjacency[toKey].push({
                to: fromKey,
                distanceKm: Math.round(distance * 10000) / 10000,
                roadType: way.roadType
              });
              edgeCount++;
            }
          }
        }
        
        console.log(`[Extractor] Total edges: ${edgeCount}`);
        
        // Build output object
        const roadNetwork = {
          metadata: {
            boundingBox: BOUNDING_BOX,
            extractedAt: new Date().toISOString(),
            source: path.basename(INPUT_FILE),
            nodeCount: Object.keys(nodes).length,
            edgeCount: edgeCount,
            wayCount: filteredWays
          },
          nodes: nodes,
          adjacency: adjacency
        };
        
        // Write to file
        console.log('\n[Extractor] Writing to file...');
        
        const jsonString = JSON.stringify(roadNetwork, null, 2);
        fs.writeFileSync(OUTPUT_FILE, jsonString);
        
        const outputStats = fs.statSync(OUTPUT_FILE);
        const duration = Date.now() - startTime;
        
        console.log('\n========================================');
        console.log('✅ EXTRACTION COMPLETE!');
        console.log('========================================');
        console.log(`📂 Output: ${OUTPUT_FILE}`);
        console.log(`📊 Output size: ${formatBytes(outputStats.size)}`);
        console.log(`⏱️  Duration: ${formatDuration(duration)}`);
        console.log(`📍 Nodes: ${roadNetwork.metadata.nodeCount}`);
        console.log(`🔗 Edges: ${roadNetwork.metadata.edgeCount}`);
        console.log(`🛣️  Ways: ${roadNetwork.metadata.wayCount}`);
        console.log('========================================\n');
        
        // Sample output for verification
        const sampleNodeId = Object.keys(nodes)[0];
        if (sampleNodeId) {
          console.log('📦 Sample node:', sampleNodeId);
          console.log('   ', JSON.stringify(nodes[sampleNodeId]));
          console.log('   Edges:', adjacency[sampleNodeId]?.slice(0, 2));
        }
        
        resolve(roadNetwork);
      })
      .on('error', (err) => {
        console.error('❌ Error during extraction:', err);
        reject(err);
      });
  });
}

// Run extraction
extractRoadGraph()
  .then(() => {
    console.log('\n👉 Next step: Implement RoadNetworkService.js');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Extraction failed:', err);
    process.exit(1);
  });
