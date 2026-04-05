#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const OSRM_BASE = 'https://router.project-osrm.org';
const PITX_TOKEN = 'pitx';
const MAX_MATCH_INPUT_POINTS = 90;
const REQUEST_DELAY_MS = 90;
const MIN_MATCH_CONFIDENCE = 0.2;
const MAX_SAFE_JUMP_METERS = 420;
const OSRM_TIMEOUT_MS = 12000;

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slug(value) {
  return cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsPitx(value) {
  return normalizeKey(value).includes(PITX_TOKEN);
}

function parseEndpointsText(value) {
  const text = cleanText(value);
  if (!text) return null;

  let body = text;
  let prefix = '';

  const colon = text.indexOf(':');
  if (colon > 0) {
    const candidate = cleanText(text.slice(colon + 1));
    if (/(->|→)/.test(candidate)) {
      prefix = cleanText(text.slice(0, colon));
      body = candidate;
    }
  }

  const parts = body
    .split(/\s*(?:->|→)\s*/)
    .map((part) => cleanText(part))
    .filter(Boolean);

  if (parts.length < 2) return null;

  return {
    from: parts[0],
    to: parts[parts.length - 1],
    prefix,
  };
}

function getRouteEndpoints(route) {
  const fromLabel = cleanText(route.from_label);
  const toLabel = cleanText(route.to_label);
  if (fromLabel && toLabel) {
    return { from: fromLabel, to: toLabel, prefix: '' };
  }

  const fromLabelText = parseEndpointsText(route.label);
  if (fromLabelText) return fromLabelText;

  const fromNameText = parseEndpointsText(route.name);
  if (fromNameText) return fromNameText;

  return null;
}

function signature(from, to) {
  return `${normalizeKey(from)}__${normalizeKey(to)}`;
}

function buildReverseLabel(route, endpoints) {
  const reverseFrom = endpoints.to;
  const reverseTo = endpoints.from;
  const parsed = parseEndpointsText(route.label);
  if (parsed?.prefix) return `${parsed.prefix}: ${reverseFrom} -> ${reverseTo}`;
  return `${reverseFrom} -> ${reverseTo}`;
}

function buildReverseName(route, endpoints) {
  const reverseFrom = endpoints.to;
  const reverseTo = endpoints.from;
  const parsed = parseEndpointsText(route.name);
  if (parsed?.prefix) return `${parsed.prefix}: ${reverseFrom} -> ${reverseTo}`;
  const fromLabel = cleanText(route.name);
  if (fromLabel && !/(->|→)/.test(fromLabel)) {
    return `${fromLabel}: ${reverseFrom} -> ${reverseTo}`;
  }
  return `${reverseFrom} -> ${reverseTo}`;
}

function reserveUnique(baseValue, existingSet, fallbackPrefix) {
  const base = cleanText(baseValue) || `${fallbackPrefix}-REV`;
  if (!existingSet.has(base)) {
    existingSet.add(base);
    return base;
  }

  let n = 2;
  while (existingSet.has(`${base}-${n}`)) {
    n += 1;
  }

  const out = `${base}-${n}`;
  existingSet.add(out);
  return out;
}

function sanitizePath(rawCoords) {
  const out = [];
  for (const pt of rawCoords || []) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lon = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const prev = out[out.length - 1];
    if (!prev || prev[0] !== lon || prev[1] !== lat) out.push([lon, lat]);
  }
  return out;
}

function chunkWithOverlap(coords, chunkSize) {
  if (coords.length <= chunkSize) return [coords];

  const chunks = [];
  let start = 0;

  while (start < coords.length) {
    const end = Math.min(start + chunkSize, coords.length);
    const chunk = coords.slice(start, end);
    if (chunk.length >= 2) chunks.push(chunk);

    if (end >= coords.length) break;
    start = end - 1;
  }

  return chunks;
}

function mergePathParts(parts) {
  const merged = [];
  for (const part of parts) {
    for (const pt of part) {
      const prev = merged[merged.length - 1];
      if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) merged.push(pt);
    }
  }
  return merged;
}

function distMeters(a, b) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pathLengthMeters(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += distMeters(coords[i - 1], coords[i]);
  }
  return total;
}

function maxStepMeters(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let max = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = distMeters(coords[i - 1], coords[i]);
    if (d > max) max = d;
  }
  return max;
}

async function osrmMatch(coords) {
  const coordStr = coords.map((c) => `${c[0]},${c[1]}`).join(';');
  const radiuses = coords.map(() => '35').join(';');

  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    tidy: 'true',
    steps: 'false',
    radiuses,
  });

  const url = `${OSRM_BASE}/match/v1/driving/${coordStr}?${params.toString()}`;
  const res = await fetchWithTimeout(url, OSRM_TIMEOUT_MS);
  if (!res.ok) return null;

  const data = await res.json();
  const matchings = Array.isArray(data?.matchings) ? data.matchings : [];
  if (matchings.length === 0) return null;

  let best = null;
  for (const m of matchings) {
    if (!Array.isArray(m?.geometry?.coordinates)) continue;
    if (!best || Number(m.confidence || 0) > Number(best.confidence || 0)) {
      best = m;
    }
  }

  if (!best || !Array.isArray(best.geometry.coordinates) || best.geometry.coordinates.length < 2) {
    return null;
  }

  return {
    coords: sanitizePath(best.geometry.coordinates),
    confidence: Number(best.confidence || 0),
  };
}

async function osrmRoute(from, to) {
  const coordStr = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    alternatives: 'false',
    steps: 'false',
  });

  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?${params.toString()}`;
  const res = await fetchWithTimeout(url, OSRM_TIMEOUT_MS);
  if (!res.ok) return null;

  const data = await res.json();
  const coords = data?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return sanitizePath(coords);
}

async function snapPathToRoadsStrict(rawCoords) {
  const cleaned = sanitizePath(rawCoords);
  if (cleaned.length < 2) return null;

  const chunks = chunkWithOverlap(cleaned, MAX_MATCH_INPUT_POINTS);
  const snappedParts = [];

  for (const chunk of chunks) {
    const matched = await osrmMatch(chunk);
    let snappedChunk = null;

    if (matched && matched.confidence >= MIN_MATCH_CONFIDENCE && matched.coords.length >= 2) {
      snappedChunk = sanitizePath(matched.coords);
    } else {
      // Fallback: route the full reversed trip endpoints once so we still create
      // an on-road reverse path even when map matching fails on detailed chunks.
      const fallbackRoute = await osrmRoute(cleaned[0], cleaned[cleaned.length - 1]);
      if (!fallbackRoute || fallbackRoute.length < 2) return null;
      fallbackRoute[0] = cleaned[0];
      fallbackRoute[fallbackRoute.length - 1] = cleaned[cleaned.length - 1];
      return sanitizePath(fallbackRoute);
    }

    if (!snappedChunk || snappedChunk.length < 2) return null;

    snappedChunk[0] = chunk[0];
    snappedChunk[snappedChunk.length - 1] = chunk[chunk.length - 1];
    snappedParts.push(snappedChunk);
    await sleep(REQUEST_DELAY_MS);
  }

  const merged = mergePathParts(snappedParts);
  if (merged.length < 2) return null;

  if (maxStepMeters(merged) > MAX_SAFE_JUMP_METERS) return null;

  const mergedLen = pathLengthMeters(merged);
  const sourceLen = pathLengthMeters(cleaned);
  if (sourceLen > 0 && mergedLen < sourceLen * 0.45) return null;

  merged[0] = cleaned[0];
  merged[merged.length - 1] = cleaned[cleaned.length - 1];
  return sanitizePath(merged);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function buildReverseStops(sourceStops, reverseFrom, reverseTo, snappedPath) {
  const validSourceStops = Array.isArray(sourceStops)
    ? sourceStops
        .map((s) => ({
          stop_name: cleanText(s.stop_name),
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          stop_order: Number(s.stop_order),
        }))
        .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    : [];

  if (validSourceStops.length >= 2) {
    const reversed = validSourceStops
      .sort((a, b) => a.stop_order - b.stop_order)
      .reverse();

    return reversed.map((stop, index) => ({
      stop_name:
        stop.stop_name ||
        (index === 0 ? reverseFrom : index === reversed.length - 1 ? reverseTo : `Stop ${index + 1}`),
      latitude: stop.latitude,
      longitude: stop.longitude,
      stop_order: index + 1,
    }));
  }

  const first = snappedPath[0];
  const last = snappedPath[snappedPath.length - 1];

  return [
    {
      stop_name: reverseFrom || 'Terminal A',
      latitude: Number(first[1]),
      longitude: Number(first[0]),
      stop_order: 1,
    },
    {
      stop_name: reverseTo || 'Terminal B',
      latitude: Number(last[1]),
      longitude: Number(last[0]),
      stop_order: 2,
    },
  ];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const includeAll = process.argv.includes('--all');

  loadDotEnv(path.join(process.cwd(), '.env'));

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: routeRows, error: routeErr } = await supabase
    .from('bus_routes')
    .select('id, source_relation_id, route_code, name, label, from_label, to_label, description, operator, network, fare_base, status, path_data, is_active')
    .eq('is_active', true)
    .order('label', { ascending: true });

  if (routeErr) {
    throw new Error(`Failed to read bus_routes: ${routeErr.message}`);
  }

  const routes = Array.isArray(routeRows) ? routeRows : [];
  if (routes.length === 0) {
    console.log('No active bus routes found.');
    return;
  }

  const routeIds = routes.map((r) => r.id);
  const { data: stopRows, error: stopErr } = await supabase
    .from('bus_route_stops')
    .select('route_id, stop_name, latitude, longitude, stop_order')
    .in('route_id', routeIds)
    .order('stop_order', { ascending: true });

  if (stopErr) {
    throw new Error(`Failed to read bus_route_stops: ${stopErr.message}`);
  }

  const stopsByRouteId = {};
  for (const stop of stopRows || []) {
    if (!stopsByRouteId[stop.route_id]) stopsByRouteId[stop.route_id] = [];
    stopsByRouteId[stop.route_id].push(stop);
  }

  const existingCodes = new Set(
    routes
      .map((r) => cleanText(r.route_code))
      .filter(Boolean),
  );

  const existingSourceIds = new Set(
    routes
      .map((r) => cleanText(r.source_relation_id))
      .filter(Boolean),
  );

  const existingSignatures = new Set();
  for (const route of routes) {
    const endpoints = getRouteEndpoints(route);
    if (!endpoints) continue;
    existingSignatures.add(signature(endpoints.from, endpoints.to));
  }

  let checked = 0;
  let candidates = 0;
  let created = 0;
  let skippedExistingReverse = 0;
  let skippedNotPitxInbound = 0;
  let skippedNoEndpoints = 0;
  let skippedBadPath = 0;
  let skippedSnapFailed = 0;
  let failedInsert = 0;
  const createdSamples = [];

  for (const route of routes) {
    checked += 1;
    const endpoints = getRouteEndpoints(route);
    if (!endpoints) {
      skippedNoEndpoints += 1;
      continue;
    }

    const inboundToPitx = containsPitx(endpoints.to) && !containsPitx(endpoints.from);
    if (!includeAll && !inboundToPitx) {
      skippedNotPitxInbound += 1;
      continue;
    }

    const reverseSignature = signature(endpoints.to, endpoints.from);
    if (existingSignatures.has(reverseSignature)) {
      skippedExistingReverse += 1;
      continue;
    }

    const sourcePath = sanitizePath(route.path_data);
    if (sourcePath.length < 2) {
      skippedBadPath += 1;
      continue;
    }

    candidates += 1;
    const reversedPath = [...sourcePath].reverse();
    const snapped = await snapPathToRoadsStrict(reversedPath);
    if (!snapped || snapped.length < 2) {
      skippedSnapFailed += 1;
      continue;
    }

    const reverseFrom = endpoints.to;
    const reverseTo = endpoints.from;

    const routeCodeBase = cleanText(route.route_code)
      ? `${cleanText(route.route_code)}-REV`
      : `${slug(reverseFrom)}-${slug(reverseTo)}-REV`;

    const reverseRouteCode = reserveUnique(routeCodeBase, existingCodes, 'BUS');

    const sourceIdBase = cleanText(route.source_relation_id)
      ? `${cleanText(route.source_relation_id)}#rev`
      : `bus-route/${route.id}#rev`;

    const reverseSourceId = reserveUnique(sourceIdBase, existingSourceIds, 'bus-route');

    const reversePayload = {
      source_relation_id: reverseSourceId,
      route_code: reverseRouteCode,
      name: buildReverseName(route, endpoints),
      label: buildReverseLabel(route, endpoints),
      from_label: reverseFrom,
      to_label: reverseTo,
      description: cleanText(route.description)
        ? `${cleanText(route.description)} | Reverse route generated from ${cleanText(route.route_code) || route.id}`
        : `Reverse route generated from ${cleanText(route.route_code) || route.id}`,
      operator: cleanText(route.operator),
      network: cleanText(route.network),
      fare_base: Number(route.fare_base) || 0,
      status: cleanText(route.status) || 'active',
      path_data: snapped,
      is_active: true,
    };

    const reverseStops = buildReverseStops(stopsByRouteId[route.id], reverseFrom, reverseTo, snapped);

    if (!apply) {
      created += 1;
      existingSignatures.add(reverseSignature);
      createdSamples.push({
        source: route.route_code || route.id,
        reverse: reverseRouteCode,
        from: reverseFrom,
        to: reverseTo,
      });
      continue;
    }

    const { data: insertedRoute, error: insertRouteError } = await supabase
      .from('bus_routes')
      .insert(reversePayload)
      .select('id')
      .single();

    if (insertRouteError || !insertedRoute?.id) {
      failedInsert += 1;
      console.warn(`[reverse-bus] insert route failed (${route.route_code || route.id}): ${insertRouteError?.message || 'unknown error'}`);
      continue;
    }

    const stopsPayload = reverseStops.map((stop) => ({
      route_id: insertedRoute.id,
      stop_name: stop.stop_name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      stop_order: stop.stop_order,
    }));

    const { error: insertStopsError } = await supabase
      .from('bus_route_stops')
      .insert(stopsPayload);

    if (insertStopsError) {
      failedInsert += 1;
      console.warn(`[reverse-bus] insert stops failed (${reverseRouteCode}): ${insertStopsError.message}`);

      await supabase
        .from('bus_routes')
        .delete()
        .eq('id', insertedRoute.id);
      continue;
    }

    created += 1;
    existingSignatures.add(reverseSignature);
    createdSamples.push({
      source: route.route_code || route.id,
      reverse: reverseRouteCode,
      from: reverseFrom,
      to: reverseTo,
    });
  }

  console.log(`[reverse-bus] mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`[reverse-bus] scope: ${includeAll ? 'all one-way bus routes' : 'PITX inbound routes only'}`);
  console.log(`[reverse-bus] checked_routes: ${checked}`);
  console.log(`[reverse-bus] candidate_routes: ${candidates}`);
  console.log(`[reverse-bus] created_reverse_routes: ${created}`);
  console.log(`[reverse-bus] skipped_existing_reverse: ${skippedExistingReverse}`);
  console.log(`[reverse-bus] skipped_not_pitx_inbound: ${skippedNotPitxInbound}`);
  console.log(`[reverse-bus] skipped_no_endpoints: ${skippedNoEndpoints}`);
  console.log(`[reverse-bus] skipped_bad_path: ${skippedBadPath}`);
  console.log(`[reverse-bus] skipped_snap_failed: ${skippedSnapFailed}`);
  console.log(`[reverse-bus] failed_insert: ${failedInsert}`);

  if (createdSamples.length > 0) {
    console.log('[reverse-bus] sample_created:');
    for (const sample of createdSamples.slice(0, 12)) {
      console.log(`  - ${sample.reverse}: ${sample.from} -> ${sample.to} (from ${sample.source})`);
    }
  }

  if (!apply) {
    console.log('[reverse-bus] DRY-RUN only. Re-run with --apply to insert new reverse routes.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
