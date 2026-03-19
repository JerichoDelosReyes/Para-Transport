const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'transit.routes.generated.json');

const GPX_FILE_REGEX = /\.gpx$/i;
const TRACK_POINT_REGEX = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"\s*>/g;
const META_NAME_REGEX = /<metadata>[\s\S]*?<name>([\s\S]*?)<\/name>/i;
const META_DESC_REGEX = /<metadata>[\s\S]*?<desc>([\s\S]*?)<\/desc>/i;

const VEHICLE_TYPE = 'jeepney';
const INTERMEDIATE_STOP_MAX = 8;

function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function haversineKm(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const x =
    sinLat * sinLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLng * sinLng;

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function getTotalDistanceKm(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += haversineKm(coords[i - 1], coords[i]);
  }
  return total;
}

function normalizeName(raw) {
  return raw
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseForDisplay(raw) {
  return normalizeName(raw)
    .split(' ')
    .map((token) => {
      if (!token) return token;
      if (/^[A-Z0-9]{2,6}$/.test(token)) {
        return token;
      }
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(' ');
}

function slugify(raw) {
  return normalizeName(raw)
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeBaseCode(raw) {
  return slugify(raw).replace(/-(IN|OUT)$/i, '');
}

function parseEndpoints(description, metadataName, fileBaseName) {
  const fromDesc = normalizeName(description || '');
  const fromName = normalizeName(metadataName || '');
  const fromFile = normalizeName(fileBaseName.replace(/\.gpx$/i, ''));

  const source = fromDesc || fromName || fromFile;
  const toParts = source.split(/\s+to\s+/i).map((s) => normalizeName(s)).filter(Boolean);
  if (toParts.length >= 2) {
    return {
      start: titleCaseForDisplay(toParts[0]),
      end: titleCaseForDisplay(toParts[toParts.length - 1]),
    };
  }

  const dashParts = source.split(/\s*-\s*/).map((s) => normalizeName(s)).filter(Boolean);
  if (dashParts.length >= 2) {
    return {
      start: titleCaseForDisplay(dashParts[0]),
      end: titleCaseForDisplay(dashParts[dashParts.length - 1]),
    };
  }

  const fallbackParts = fromFile.split(/\s*-\s*/).map((s) => normalizeName(s)).filter(Boolean);
  if (fallbackParts.length >= 2) {
    return {
      start: titleCaseForDisplay(fallbackParts[0]),
      end: titleCaseForDisplay(fallbackParts[fallbackParts.length - 1]),
    };
  }

  return {
    start: titleCaseForDisplay(source || 'Route Start'),
    end: titleCaseForDisplay(source || 'Route End'),
  };
}

function parseMetadata(gpxText) {
  const nameMatch = gpxText.match(META_NAME_REGEX);
  const descMatch = gpxText.match(META_DESC_REGEX);

  return {
    metadataName: nameMatch ? decodeXmlEntities(nameMatch[1]) : '',
    metadataDescription: descMatch ? decodeXmlEntities(descMatch[1]) : '',
  };
}

function extractTrackCoordinates(gpxText, fileName) {
  const points = [];
  let match;

  while ((match = TRACK_POINT_REGEX.exec(gpxText)) !== null) {
    const lat = Number(match[1]);
    const lng = Number(match[2]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      continue;
    }

    points.push([lng, lat]);
  }

  if (points.length < 2) {
    throw new Error(`${fileName}: expected at least 2 valid track points, got ${points.length}`);
  }

  const deduped = [];
  for (const point of points) {
    const last = deduped[deduped.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
      deduped.push(point);
    }
  }

  if (deduped.length < 2) {
    throw new Error(`${fileName}: route collapsed to <2 points after deduplication`);
  }

  return deduped;
}

function interpolateCoord(from, to, ratio) {
  return [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio,
  ];
}

function computeIntermediateStops(coords, routeIdPrefix, direction) {
  const totalDistanceKm = getTotalDistanceKm(coords);
  if (totalDistanceKm < 1.2) {
    return [];
  }

  const stopCount = clamp(Math.floor(totalDistanceKm / 1.6), 1, INTERMEDIATE_STOP_MAX);
  const segmentTargets = [];

  for (let i = 1; i <= stopCount; i += 1) {
    segmentTargets.push((totalDistanceKm * i) / (stopCount + 1));
  }

  const result = [];
  let covered = 0;
  let targetIndex = 0;

  for (let i = 1; i < coords.length && targetIndex < segmentTargets.length; i += 1) {
    const prev = coords[i - 1];
    const next = coords[i];
    const segmentKm = haversineKm(prev, next);

    if (segmentKm === 0) {
      continue;
    }

    while (targetIndex < segmentTargets.length && covered + segmentKm >= segmentTargets[targetIndex]) {
      const remainingKm = segmentTargets[targetIndex] - covered;
      const ratio = remainingKm / segmentKm;
      const coord = interpolateCoord(prev, next, ratio);
      const stopNumber = targetIndex + 1;

      result.push({
        stopId: `${routeIdPrefix}-${direction}-S${String(stopNumber).padStart(2, '0')}`,
        name: `Stop Candidate ${stopNumber}`,
        type: 'stop',
        coordinate: coord,
      });

      targetIndex += 1;
    }

    covered += segmentKm;
  }

  return result;
}

function buildRouteRecord({
  routeId,
  routeName,
  signboard,
  direction,
  sourceFile,
  coordinates,
  startName,
  endName,
}) {
  const routeIdPrefix = routeId.replace(/-(OUT|IN)$/i, '');
  const intermediate = computeIntermediateStops(coordinates, routeIdPrefix, direction);

  const origin = {
    stopId: `${routeIdPrefix}-${direction}-T01`,
    name: startName,
    type: 'terminal',
    coordinate: coordinates[0],
  };

  const destination = {
    stopId: `${routeIdPrefix}-${direction}-T02`,
    name: endName,
    type: 'terminal',
    coordinate: coordinates[coordinates.length - 1],
  };

  const totalDistanceKm = Number(getTotalDistanceKm(coordinates).toFixed(3));

  return {
    routeId,
    routeName,
    signboard,
    vehicleType: VEHICLE_TYPE,
    direction,
    sourceFile,
    geometry: {
      type: 'LineString',
      coordinates,
    },
    terminals: {
      origin,
      destination,
    },
    stops: [origin, ...intermediate, destination],
    metrics: {
      pointCount: coordinates.length,
      totalDistanceKm,
    },
  };
}

function generateTransitRoutes() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((name) => GPX_FILE_REGEX.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (files.length === 0) {
    throw new Error('No GPX files found in data/');
  }

  const routes = [];

  for (const fileName of files) {
    const fullPath = path.join(DATA_DIR, fileName);
    const gpx = fs.readFileSync(fullPath, 'utf8');
    const { metadataName, metadataDescription } = parseMetadata(gpx);
    const coordinates = extractTrackCoordinates(gpx, fileName);

    const { start, end } = parseEndpoints(metadataDescription, metadataName, fileName);
    const baseCode = normalizeBaseCode(
      metadataName || metadataDescription || fileName.replace(/\.gpx$/i, '')
    );

    if (!baseCode) {
      throw new Error(`${fileName}: failed to derive base route code`);
    }

    const forwardRouteId = `${baseCode}-OUT`;
    const reverseRouteId = `${baseCode}-IN`;

    routes.push(
      buildRouteRecord({
        routeId: forwardRouteId,
        routeName: `${start} to ${end}`,
        signboard: `${start.toUpperCase()} TO ${end.toUpperCase()}`,
        direction: 'forward',
        sourceFile: fileName,
        coordinates,
        startName: start,
        endName: end,
      })
    );

    routes.push(
      buildRouteRecord({
        routeId: reverseRouteId,
        routeName: `${end} to ${start}`,
        signboard: `${end.toUpperCase()} TO ${start.toUpperCase()}`,
        direction: 'reverse',
        sourceFile: fileName,
        coordinates: [...coordinates].reverse(),
        startName: end,
        endName: start,
      })
    );
  }

  routes.sort((a, b) => a.routeId.localeCompare(b.routeId, 'en'));

  const output = {
    schemaVersion: 1,
    coordinateFormat: '[lng, lat]',
    generatedFrom: 'data/*.gpx',
    routeCount: routes.length,
    routes,
  };

  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  return {
    outputFile: path.relative(ROOT_DIR, OUTPUT_FILE),
    routeCount: routes.length,
    sourceCount: files.length,
  };
}

if (require.main === module) {
  try {
    const summary = generateTransitRoutes();
    console.log(`[generateTransitData] Wrote ${summary.routeCount} routes from ${summary.sourceCount} GPX files to ${summary.outputFile}`);
  } catch (error) {
    console.error('[generateTransitData] Failed:', error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  generateTransitRoutes,
};
