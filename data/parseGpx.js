const fs = require('fs');
const path = require('path');

// GPX files and their route info
const gpxFiles = [
  { file: 'DBB1-Baclaran.gpx', code: 'DBB1-BACLARAN-01' },
  { file: 'DBBC-Baclaran.gpx', code: 'DBBC-BACLARAN-01' },
  { file: 'RobPala-Baclaran.gpx', code: 'ROBPALA-BACLARAN-01' },
  { file: 'SMMolino-BDO.gpx', code: 'SMMOLINO-BDO-01' },
  { file: 'SMMolino-BDO2.gpx', code: 'SMMOLINO-BDO-02' },
  { file: 'SMMolino-District.gpx', code: 'SMMOLINO-DISTRICT-01' },
  { file: 'SMMolino-Manggahan.gpx', code: 'SMMOLINO-MANGGAHAN-01' },
];

function extractMetadata(xml) {
  const nameMatch = xml.match(/<metadata>.*?<name>(.*?)<\/name>/s);
  const descMatch = xml.match(/<metadata>.*?<desc>(.*?)<\/desc>/s);
  return {
    name: nameMatch ? nameMatch[1] : '',
    desc: descMatch ? descMatch[1] : '',
  };
}

function extractTrackpoints(xml) {
  const points = [];
  const regex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    points.push({
      lat: parseFloat(match[1]),
      lon: parseFloat(match[2]),
    });
  }
  return points;
}

function deduplicateConsecutive(points) {
  if (points.length === 0) return [];
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    if (points[i].lat !== prev.lat || points[i].lon !== prev.lon) {
      result.push(points[i]);
    }
  }
  return result;
}

// Simplify path by keeping every Nth point (Douglas-Peucker would be better but this is simpler)
function simplifyPath(points, maxPoints = 500) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const result = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]); // always include last
  return result;
}

function buildRoute(gpxInfo) {
  const filePath = path.join(__dirname, gpxInfo.file);
  const xml = fs.readFileSync(filePath, 'utf-8');
  const meta = extractMetadata(xml);
  let points = extractTrackpoints(xml);
  points = deduplicateConsecutive(points);
  points = simplifyPath(points, 300);

  // Build path as [lng, lat]
  const routePath = points.map(p => [
    parseFloat(p.lon.toFixed(6)),
    parseFloat(p.lat.toFixed(6)),
  ]);

  // First and last points as stops
  const first = points[0];
  const last = points[points.length - 1];
  
  // Parse description for terminal names  
  const parts = meta.desc.split(/\s*[-–—to]\s*/i).filter(Boolean);
  const startName = parts[0] || meta.name.split('-')[0] || 'Start Terminal';
  const endName = parts[parts.length - 1] || meta.name.split('-').pop() || 'End Terminal';

  const stops = [
    { name: startName.trim(), lat: parseFloat(first.lat.toFixed(6)), lng: parseFloat(first.lon.toFixed(6)) },
    { name: endName.trim(), lat: parseFloat(last.lat.toFixed(6)), lng: parseFloat(last.lon.toFixed(6)) },
  ];

  return {
    code: gpxInfo.code,
    name: meta.desc || meta.name,
    description: `${startName.trim()} to ${endName.trim()} jeepney route`,
    type: 'jeepney',
    fare: 13,
    status: 'active',
    operator: '',
    stops,
    path: routePath,
  };
}

// Read existing routes.json
const routesPath = path.join(__dirname, 'routes.json');
const existing = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));

// Build new routes from GPX files
const newRoutes = gpxFiles.map(buildRoute);

// Combine: keep existing routes, add new ones
existing.routes = [...existing.routes, ...newRoutes];

// Write back
fs.writeFileSync(routesPath, JSON.stringify(existing, null, 2), 'utf-8');

console.log(`Done! Total routes: ${existing.routes.length}`);
newRoutes.forEach(r => {
  console.log(`  - ${r.code}: ${r.name} (${r.path.length} points, ${r.stops.length} stops)`);
});
