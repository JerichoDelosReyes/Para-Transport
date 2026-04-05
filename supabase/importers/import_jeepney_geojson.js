#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const FALLBACK_GEOJSON_PATH = 'E:/Downloads/Jeepney_transit_route.geojson';
const FALLBACK_FARE = 13;
const DELETE_ALL_FILTER_ID = '00000000-0000-0000-0000-000000000000';

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function cleanText(input) {
  if (!input) return '';
  return String(input)
    .replace(/â†’/g, '->')
    .replace(/â€“|â€”/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanEndpoint(raw) {
  let text = cleanText(raw);
  if (!text) return '';

  text = text
    .replace(/^Jeepney Route[^:]*:\s*/i, '')
    .replace(/\b[a-z_]+=[^=]+(?=\s+[a-z_]+=|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function isUsableEndpoint(value) {
  const text = cleanText(value);
  if (!text) return false;
  if (text.length < 3 || text.length > 80) return false;
  if (/=/.test(text)) return false;

  const lower = text.toLowerCase();
  if (/(network|operator|public_transport|wheelchair|smoking)\s*=/.test(lower)) return false;
  if (/^terminal\s+[ab]$/i.test(text)) return false;

  return true;
}

function splitEndpoints(value) {
  const text = cleanEndpoint(value).replace(/→/g, '->');
  if (!text) return null;

  const arrow = text.match(/^(.+?)\s*->\s*(.+)$/);
  if (arrow) {
    return { from: cleanEndpoint(arrow[1]), to: cleanEndpoint(arrow[2]) };
  }

  const toMatch = text.match(/^(.+?)\s+to\s+(.+)$/i);
  if (toMatch) {
    return { from: cleanEndpoint(toMatch[1]), to: cleanEndpoint(toMatch[2]) };
  }

  return null;
}

function chooseEndpoint(candidates, fallback) {
  for (const candidate of candidates) {
    const cleaned = cleanEndpoint(candidate);
    if (isUsableEndpoint(cleaned)) return cleaned;
  }
  return fallback;
}

function parseViaHints(props, label, name) {
  const candidates = [];

  if (props && props.via) {
    candidates.push(String(props.via));
  }

  const viaRegex = /\(via\s+([^)]+)\)|\bvia\s+([^\-]+?)(?=\s*->|\s*$)/gi;
  for (const source of [label, name]) {
    if (!source) continue;
    let match;
    while ((match = viaRegex.exec(source)) !== null) {
      const value = cleanEndpoint(match[1] || match[2]);
      if (value) candidates.push(value);
    }
  }

  const out = [];
  const seen = new Set();

  for (const raw of candidates) {
    const parts = String(raw)
      .split(/[;,|]/)
      .map((p) => cleanEndpoint(p).replace(/^via\s+/i, '').trim())
      .filter(Boolean);

    for (const part of parts) {
      if (!isUsableEndpoint(part)) continue;
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part);
    }
  }

  return out;
}

function samplePathPoint(pathCoords, fraction) {
  if (!Array.isArray(pathCoords) || pathCoords.length === 0) return null;
  const idx = Math.max(0, Math.min(pathCoords.length - 1, Math.round((pathCoords.length - 1) * fraction)));
  return pathCoords[idx];
}

function slug(input) {
  return cleanText(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function sqDist(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function dedupeConsecutive(coords) {
  const out = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== lng || prev[1] !== lat) {
      out.push([lng, lat]);
    }
  }
  return out;
}

function stitchSegments(segments) {
  const out = [];
  for (const rawSeg of segments) {
    let seg = dedupeConsecutive(rawSeg);
    if (seg.length < 2) continue;

    if (out.length > 0) {
      const last = out[out.length - 1];
      const dStart = sqDist(last, seg[0]);
      const dEnd = sqDist(last, seg[seg.length - 1]);
      if (dEnd < dStart) seg = seg.slice().reverse();
    }

    for (const pt of seg) {
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) out.push(pt);
    }
  }
  return out;
}

function buildPath(geometry) {
  if (!geometry || !geometry.type) return [];
  if (geometry.type === 'LineString') return dedupeConsecutive(geometry.coordinates || []);
  if (geometry.type === 'MultiLineString') return stitchSegments(geometry.coordinates || []);
  return [];
}

function isRouteRelationFeature(feature) {
  const p = feature.properties || {};
  const id = String(p['@id'] || '');
  return id.startsWith('relation/') && p.type === 'route' && p.route === 'bus';
}

function isLikelyJeepneyRoute(props) {
  const text = cleanText([
    props.name,
    props.network,
    props.operator,
    props.ref,
    props.bus,
  ].filter(Boolean).join(' ')).toLowerCase();

  if (/uv\s*express|\buv\b|\bvan\b/.test(text)) return false;
  if (/jeep|puj|share_taxi|minibus|ltfrb/.test(text)) return true;

  // If uncertain, still include because file is expected jeepney-only.
  return true;
}

function parseFare(props) {
  const candidates = [
    props['fare:php'],
    props['fare:regular'],
    props.fare,
    process.env.JEEPNEY_DEFAULT_FARE,
    FALLBACK_FARE,
  ];

  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const m = String(c).match(/\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }

  return FALLBACK_FARE;
}

function makeLabels(props) {
  const fromLabelRaw = cleanText(props.from);
  const toLabelRaw = cleanText(props.to);
  const name = cleanText(props.name);
  const ref = cleanText(props.ref);

  const splitFromName = splitEndpoints(name);

  let label = '';
  if (fromLabelRaw && toLabelRaw) {
    label = `${fromLabelRaw} -> ${toLabelRaw}`;
  } else if (splitFromName?.from && splitFromName?.to) {
    label = `${splitFromName.from} -> ${splitFromName.to}`;
  } else if (name) {
    label = name;
  } else if (ref) {
    label = ref;
  } else {
    label = 'Unnamed Jeepney Route';
  }

  const splitFromLabel = splitEndpoints(label);
  const fromLabel = chooseEndpoint(
    [fromLabelRaw, splitFromLabel?.from, splitFromName?.from],
    'Terminal A',
  );
  const toLabel = chooseEndpoint(
    [toLabelRaw, splitFromLabel?.to, splitFromName?.to],
    'Terminal B',
  );

  if (isUsableEndpoint(fromLabel) && isUsableEndpoint(toLabel)) {
    label = `${fromLabel} -> ${toLabel}`;
  }

  const finalName = name || label;
  const viaHints = parseViaHints(props, label, finalName);
  return { name: finalName, label, fromLabel, toLabel, ref, viaHints };
}

function buildStops(pathCoords, fromLabel, toLabel, viaHints = []) {
  if (pathCoords.length < 2) return [];
  const first = pathCoords[0];
  const last = pathCoords[pathCoords.length - 1];

  const stopA = {
    stop_name: fromLabel || 'Terminal A',
    latitude: first[1],
    longitude: first[0],
    stop_order: 1,
  };

  const midStops = [];
  const usableVia = (viaHints || [])
    .filter((hint) => isUsableEndpoint(hint))
    .filter((hint) => hint.toLowerCase() !== String(fromLabel || '').toLowerCase())
    .filter((hint) => hint.toLowerCase() !== String(toLabel || '').toLowerCase())
    .slice(0, 4);

  for (let i = 0; i < usableVia.length; i += 1) {
    const fraction = (i + 1) / (usableVia.length + 1);
    const point = samplePathPoint(pathCoords, fraction);
    if (!point) continue;
    midStops.push({
      stop_name: usableVia[i],
      latitude: point[1],
      longitude: point[0],
      stop_order: i + 2,
    });
  }

  const stopB = {
    stop_name: toLabel || (fromLabel ? `${fromLabel} Terminal` : 'Terminal B'),
    latitude: last[1],
    longitude: last[0],
    stop_order: midStops.length + 2,
  };

  return [stopA, ...midStops, stopB];
}

async function deleteAllRows(supabase, tableName, idColumn) {
  const { error } = await supabase
    .from(tableName)
    .delete()
    .neq(idColumn, DELETE_ALL_FILTER_ID);

  if (error) {
    throw new Error(`Failed to clear ${tableName}: ${error.message}`);
  }
}

async function main() {
  const workspaceRoot = process.cwd();
  loadDotEnv(path.join(workspaceRoot, '.env'));

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const geojsonPath = process.argv[2] ? path.resolve(process.argv[2]) : FALLBACK_GEOJSON_PATH;
  if (!fs.existsSync(geojsonPath)) {
    throw new Error(`GeoJSON file not found: ${geojsonPath}`);
  }

  const geo = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  if (!geo || !Array.isArray(geo.features)) {
    throw new Error('Invalid GeoJSON: missing FeatureCollection.features');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Remove all previous transit records as requested.
  await deleteAllRows(supabase, 'jeepney_route_stops', 'id');
  await deleteAllRows(supabase, 'jeepney_routes', 'id');

  // Clear legacy generic tables too, if still present in your project.
  try {
    await deleteAllRows(supabase, 'route_stops', 'id');
    await deleteAllRows(supabase, 'routes', 'id');
  } catch {
    // Ignore if legacy tables do not exist or are not accessible.
  }

  const relationFeatures = geo.features.filter(isRouteRelationFeature);

  let imported = 0;
  let skipped = 0;

  for (const feature of relationFeatures) {
    const props = feature.properties || {};
    if (!isLikelyJeepneyRoute(props)) {
      skipped += 1;
      continue;
    }

    const relationTag = String(props['@id'] || '').trim();
    const relationId = relationTag.includes('/') ? relationTag.split('/')[1] : relationTag;

    const pathCoords = buildPath(feature.geometry);
    if (pathCoords.length < 2) {
      skipped += 1;
      continue;
    }

    const { name, label, fromLabel, toLabel, ref, viaHints } = makeLabels(props);
    const routeCodeBase = slug(ref || label || name || `JEEP-${relationId}`) || `JEEP-${relationId}`;
    const routeCode = `${routeCodeBase}-${relationId}`;

    const payload = {
      source_relation_id: relationTag || `relation/${relationId}`,
      route_code: routeCode,
      name,
      label,
      from_label: fromLabel || null,
      to_label: toLabel || null,
      description: cleanText(props.description) || `Imported from ${relationTag}`,
      operator: cleanText(props.operator),
      network: cleanText(props.network),
      fare_base: parseFare(props),
      status: 'active',
      path_data: pathCoords,
      is_active: true,
    };

    const { data: routeRow, error: routeError } = await supabase
      .from('jeepney_routes')
      .upsert(payload, { onConflict: 'source_relation_id' })
      .select('id')
      .single();

    if (routeError) {
      console.error(`Route upsert failed (${relationTag}): ${routeError.message}`);
      skipped += 1;
      continue;
    }

    const stops = buildStops(pathCoords, fromLabel, toLabel, viaHints).map((s) => ({
      route_id: routeRow.id,
      ...s,
    }));

    const { error: stopError } = await supabase
      .from('jeepney_route_stops')
      .insert(stops);

    if (stopError) {
      console.error(`Stop insert failed (${relationTag}): ${stopError.message}`);
      skipped += 1;
      continue;
    }

    imported += 1;
  }

  console.log(`Imported jeepney routes: ${imported}`);
  console.log(`Skipped routes: ${skipped}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
