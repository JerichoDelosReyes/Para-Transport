#!/usr/bin/env node

/**
 * GPX → routes.json importer
 *
 * Usage:
 *   node scripts/importGpx.js <gpx-file> [options]
 *
 * Options:
 *   --code  <CODE>       Route code (e.g. IMUS-DASMA-02). Auto-generated if omitted.
 *   --type  <TYPE>       Vehicle type: jeepney | bus | uv | trike  (default: jeepney)
 *   --fare  <NUMBER>     Base fare in PHP                          (default: 13)
 *   --output <FILE>      Output JSON file (default: data/routes.json)
 *   --force              Overwrite if route code already exists
 *   --simplify <METERS>  Simplify path with tolerance in meters (uses @turf/simplify)
 *
 * Example:
 *   node scripts/importGpx.js E:\Downloads\MapMyRoute.gpx --code IMUS-DASMA-02 --type jeepney --fare 13
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// ─── CLI argument parsing ────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { type: 'jeepney', fare: 13, force: false };
  let gpxFile = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--code':     opts.code = args[++i]; break;
      case '--type':     opts.type = args[++i]; break;
      case '--fare':     opts.fare = Number(args[++i]); break;
      case '--output':   opts.output = args[++i]; break;
      case '--force':    opts.force = true; break;
      case '--simplify': opts.simplify = Number(args[++i]); break;
      default:
        if (!args[i].startsWith('--') && !gpxFile) gpxFile = args[i];
    }
  }

  if (!gpxFile) {
    console.error('Usage: node scripts/importGpx.js <gpx-file> [--code CODE] [--type TYPE] [--fare NUM] [--force] [--simplify METERS]');
    process.exit(1);
  }

  return { gpxFile, ...opts };
}

// ─── GPX parsing ─────────────────────────────────────────────────────

function parseGpx(filePath) {
  const xml = fs.readFileSync(filePath, 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const gpx = parser.parse(xml);

  // Extract route name from metadata or track
  const metadata = gpx.gpx?.metadata;
  const trk = gpx.gpx?.trk;
  const routeName = metadata?.name || trk?.name || path.basename(filePath, '.gpx');

  // Extract trackpoints
  const trkseg = trk?.trkseg;
  if (!trkseg) {
    console.error('Error: No track segment (<trkseg>) found in GPX file.');
    process.exit(1);
  }

  const trkpts = Array.isArray(trkseg.trkpt) ? trkseg.trkpt : [trkseg.trkpt];

  const rawPoints = trkpts.map((pt) => ({
    lat: parseFloat(pt['@_lat']),
    lng: parseFloat(pt['@_lon']),
  }));

  // Deduplicate consecutive identical points
  const points = rawPoints.filter(
    (pt, i) => i === 0 || pt.lat !== rawPoints[i - 1].lat || pt.lng !== rawPoints[i - 1].lng
  );

  return { routeName, points };
}

// ─── Optional path simplification via Turf ───────────────────────────

function simplifyPath(points, toleranceMeters) {
  let turf;
  try {
    turf = require('@turf/turf');
  } catch {
    console.warn('Warning: @turf/turf not found. Install it for --simplify support. Skipping simplification.');
    return points;
  }

  const coords = points.map((p) => [p.lng, p.lat]);
  const line = turf.lineString(coords);
  const simplified = turf.simplify(line, { tolerance: toleranceMeters / 111320, highQuality: true });
  return simplified.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

// ─── Generate route code from name ───────────────────────────────────

function generateCode(name) {
  const parts = name
    .split(/\s*[-–—]\s*/)
    .map((part) =>
      part
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .map((w) => w.substring(0, 5).toUpperCase())
        .join('')
    );

  const code = parts.length >= 2
    ? `${parts[0].substring(0, 6)}-${parts[1].substring(0, 6)}-01`
    : `${parts[0].substring(0, 12)}-01`;

  return code;
}

// ─── Build route object ──────────────────────────────────────────────

function buildRoute(routeName, points, opts) {
  const code = opts.code || generateCode(routeName);

  // Split route name on common separators to get origin/destination
  const nameParts = routeName.split(/\s*[-–—]\s*/);
  const originName = nameParts[0]?.trim() || 'Origin';
  const destName = nameParts.length > 1 ? nameParts[nameParts.length - 1].trim() : 'Destination';

  const first = points[0];
  const last = points[points.length - 1];

  const stops = [
    { name: originName, lat: first.lat, lng: first.lng },
    { name: destName, lat: last.lat, lng: last.lng },
  ];

  // Path in [lng, lat] GeoJSON order
  const routePath = points.map((p) => [
    parseFloat(p.lng.toFixed(6)),
    parseFloat(p.lat.toFixed(6)),
  ]);

  return {
    code,
    name: routeName,
    description: `${originName} to ${destName} (imported from GPX)`,
    type: opts.type,
    fare: opts.fare,
    status: 'active',
    operator: '',
    stops,
    path: routePath,
  };
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv);

  // Resolve GPX file path
  const gpxPath = path.resolve(opts.gpxFile);
  if (!fs.existsSync(gpxPath)) {
    console.error(`Error: GPX file not found: ${gpxPath}`);
    process.exit(1);
  }

  console.log(`\nReading GPX: ${gpxPath}`);
  let { routeName, points } = parseGpx(gpxPath);
  console.log(`  Route name : ${routeName}`);
  console.log(`  Trackpoints: ${points.length} (after dedup)`);

  // Optional simplification
  if (opts.simplify) {
    const before = points.length;
    points = simplifyPath(points, opts.simplify);
    console.log(`  Simplified : ${before} → ${points.length} points (tolerance: ${opts.simplify}m)`);
  }

  // Build route entry
  const route = buildRoute(routeName, points, opts);

  // Read existing routes.json
  const routesPath = opts.output
    ? path.resolve(opts.output)
    : path.join(__dirname, '..', 'data', 'routes.json');
  let data = { routes: [] };

  if (fs.existsSync(routesPath)) {
    data = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
    if (!Array.isArray(data.routes)) data.routes = [];
  }

  // Check for duplicate code
  const existingIdx = data.routes.findIndex((r) => r.code === route.code);
  if (existingIdx !== -1) {
    if (!opts.force) {
      console.error(`\nError: Route code "${route.code}" already exists. Use --force to overwrite.`);
      process.exit(1);
    }
    console.log(`  Overwriting existing route: ${route.code}`);
    data.routes[existingIdx] = route;
  } else {
    data.routes.push(route);
  }

  // Write back
  fs.writeFileSync(routesPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');

  // Summary
  console.log(`\n✓ Route imported successfully!`);
  console.log(`  Code       : ${route.code}`);
  console.log(`  Name       : ${route.name}`);
  console.log(`  Type       : ${route.type}`);
  console.log(`  Fare       : ₱${route.fare}`);
  console.log(`  Stops      : ${route.stops.map((s) => s.name).join(' → ')}`);
  console.log(`  Path points: ${route.path.length}`);
  console.log(`  Origin     : ${route.stops[0].lat}, ${route.stops[0].lng}`);
  console.log(`  Destination: ${route.stops[route.stops.length - 1].lat}, ${route.stops[route.stops.length - 1].lng}`);
  console.log(`  Saved to   : ${routesPath}\n`);
}

main();
