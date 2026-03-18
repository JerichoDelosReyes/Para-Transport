/**
 * importT4xxRoutes.js
 *
 * Fetches T4xx jeepney route geometry from Overpass API,
 * merges with the wiki-sourced catalog (data/t4xx-catalog.json),
 * and writes a GeoJSON FeatureCollection to data/t4xx-routes.json.
 *
 * Usage:  node scripts/importT4xxRoutes.js
 */

const fs = require('fs');
const path = require('path');

// --- Configuration -----------------------------------------------------------

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const CATALOG_PATH = path.resolve(__dirname, '..', 'data', 'txx-catalog.json');
const QUERY_PATH   = path.resolve(__dirname, '..', 'data', 't4xx-routes.overpassql');
const OUTPUT_PATH  = path.resolve(__dirname, '..', 'data', 't4xx-routes.json');

// --- Helpers -----------------------------------------------------------------

async function fetchOverpass(query) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`[Overpass] Trying ${endpoint} ...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        console.warn(`[Overpass] ${endpoint} responded ${res.status}, trying next...`);
        continue;
      }
      return await res.json();
    } catch (err) {
      console.warn(`[Overpass] ${endpoint} failed: ${err.message}`);
    }
  }
  throw new Error('All Overpass endpoints failed');
}

/**
 * Build a lookup from node-id → {lat, lon}
 */
function buildNodeIndex(elements) {
  const idx = new Map();
  for (const el of elements) {
    if (el.type === 'node') {
      idx.set(el.id, [el.lon, el.lat]); // GeoJSON [lng, lat]
    }
  }
  return idx;
}

/**
 * Build a lookup from way-id → [[lng,lat], ...]
 */
function buildWayIndex(elements, nodeIdx) {
  const idx = new Map();
  for (const el of elements) {
    if (el.type === 'way' && el.nodes) {
      const coords = el.nodes
        .map((nid) => nodeIdx.get(nid))
        .filter(Boolean);
      if (coords.length >= 2) {
        idx.set(el.id, coords);
      }
    }
  }
  return idx;
}

/**
 * Stitch ordered way segments into a single coordinate array.
 * Handles reversing segments when endpoints match.
 */
function stitchWays(memberRefs, wayIdx) {
  const segments = memberRefs
    .map((ref) => wayIdx.get(ref))
    .filter(Boolean);

  if (segments.length === 0) return [];

  const result = [...segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const lastPt = result[result.length - 1];
    const firstOfSeg = seg[0];
    const lastOfSeg  = seg[seg.length - 1];

    const distFirst = Math.abs(lastPt[0] - firstOfSeg[0]) + Math.abs(lastPt[1] - firstOfSeg[1]);
    const distLast  = Math.abs(lastPt[0] - lastOfSeg[0])  + Math.abs(lastPt[1] - lastOfSeg[1]);

    if (distLast < distFirst) {
      // Reverse segment for better continuity
      const reversed = [...seg].reverse();
      // Skip first point if it matches last point (avoid duplicate)
      const start = (Math.abs(reversed[0][0] - lastPt[0]) + Math.abs(reversed[0][1] - lastPt[1])) < 0.00001 ? 1 : 0;
      result.push(...reversed.slice(start));
    } else {
      const start = (Math.abs(firstOfSeg[0] - lastPt[0]) + Math.abs(firstOfSeg[1] - lastPt[1])) < 0.00001 ? 1 : 0;
      result.push(...seg.slice(start));
    }
  }

  return result;
}

/**
 * Parse relation into a GeoJSON Feature
 */
function relationToFeature(relation, wayIdx) {
  const wayMembers = (relation.members || [])
    .filter((m) => m.type === 'way')
    .map((m) => m.ref);

  const coordinates = stitchWays(wayMembers, wayIdx);
  if (coordinates.length < 2) return null;

  const tags = relation.tags || {};
  return {
    type: 'Feature',
    properties: {
      osmId: relation.id,
      ref: tags.ref || '',
      name: tags.name || '',
      from: tags.from || '',
      to: tags.to || '',
      operator: tags.operator || '',
      network: tags.network || '',
      route: tags.route || '',
      vehicleType: 'jeep',
    },
    geometry: {
      type: 'LineString',
      coordinates,
    },
  };
}

// --- Main --------------------------------------------------------------------

async function main() {
  // 1. Load catalog
  let catalog = { routes: [] };
  const catalogFile = CATALOG_PATH.replace('txx-', 't4xx-');
  if (fs.existsSync(catalogFile)) {
    catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf-8'));
    console.log(`[Catalog] Loaded ${catalog.routes.length} T4xx route entries`);
  } else {
    console.warn('[Catalog] t4xx-catalog.json not found, proceeding with OSM data only');
  }

  // 2. Load Overpass query
  const query = fs.readFileSync(QUERY_PATH, 'utf-8');
  console.log('[Overpass] Fetching T4xx route data from OSM...');

  // 3. Fetch from Overpass
  const overpassData = await fetchOverpass(query);
  const elements = overpassData.elements || [];
  console.log(`[Overpass] Received ${elements.length} elements`);

  const nodeIdx = buildNodeIndex(elements);
  const wayIdx  = buildWayIndex(elements, nodeIdx);

  // 4. Extract relation features
  const relations = elements.filter((el) => el.type === 'relation');
  console.log(`[Overpass] Found ${relations.length} route relations`);

  const osmFeatures = relations
    .map((rel) => relationToFeature(rel, wayIdx))
    .filter(Boolean);

  console.log(`[Overpass] Converted ${osmFeatures.length} relations to GeoJSON features`);

  // 5. Build ref→feature lookup from OSM data
  const osmByRef = new Map();
  for (const f of osmFeatures) {
    const ref = f.properties.ref;
    if (ref) osmByRef.set(ref, f);
  }

  // 6. Merge catalog with OSM geometry
  const features = [];
  const matchedRefs = new Set();

  for (const entry of catalog.routes) {
    const osmFeature = osmByRef.get(entry.code);
    if (osmFeature) {
      // Merge: OSM geometry + catalog metadata
      matchedRefs.add(entry.code);
      features.push({
        type: 'Feature',
        properties: {
          routeCode: entry.code,
          description: entry.description,
          routeDescription: entry.routeDescription || osmFeature.properties.name,
          operator: entry.operator || osmFeature.properties.operator,
          distanceKm: entry.distanceKm,
          status: entry.status,
          notes: entry.notes || '',
          vehicleType: 'jeep',
          osmId: osmFeature.properties.osmId,
          hasGeometry: true,
        },
        geometry: osmFeature.geometry,
      });
    } else {
      // Catalog-only (no OSM geometry yet)
      features.push({
        type: 'Feature',
        properties: {
          routeCode: entry.code,
          description: entry.description,
          routeDescription: entry.routeDescription,
          operator: entry.operator,
          distanceKm: entry.distanceKm,
          status: entry.status,
          notes: entry.notes || '',
          vehicleType: 'jeep',
          osmId: null,
          hasGeometry: false,
        },
        geometry: null,
      });
    }
  }

  // 7. Add any OSM routes not in catalog
  for (const f of osmFeatures) {
    if (!matchedRefs.has(f.properties.ref)) {
      features.push({
        type: 'Feature',
        properties: {
          routeCode: f.properties.ref || `OSM-${f.properties.osmId}`,
          description: f.properties.name || f.properties.ref || '',
          routeDescription: `${f.properties.from} – ${f.properties.to}`.replace(/^ – $/, ''),
          operator: f.properties.operator,
          distanceKm: null,
          status: 'active',
          notes: 'From OSM only (not in wiki catalog)',
          vehicleType: 'jeep',
          osmId: f.properties.osmId,
          hasGeometry: true,
        },
        geometry: f.geometry,
      });
    }
  }

  // 8. Write output
  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      source: 'OSM Overpass + OSM Wiki T4xx catalog',
      region: 'Southern Metro Manila, suburban Cavite and Laguna',
      generatedAt: new Date().toISOString(),
      totalRoutes: features.length,
      withGeometry: features.filter((f) => f.properties.hasGeometry).length,
      withoutGeometry: features.filter((f) => !f.properties.hasGeometry).length,
    },
    features,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson, null, 2), 'utf-8');

  console.log('\n--- Summary ---');
  console.log(`Total routes:      ${features.length}`);
  console.log(`With geometry:     ${geojson.metadata.withGeometry}`);
  console.log(`Without geometry:  ${geojson.metadata.withoutGeometry}`);
  console.log(`Output:            ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
