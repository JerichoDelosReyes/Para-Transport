#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const OSRM_BASE = 'https://router.project-osrm.org';

const TABLES = [
  { routeTable: 'jeepney_routes', idCol: 'id', pathCol: 'path_data', labelCol: 'label' },
  { routeTable: 'bus_routes', idCol: 'id', pathCol: 'path_data', labelCol: 'label' },
  { routeTable: 'tricycle_routes', idCol: 'id', pathCol: 'path_data', labelCol: 'label' },
  { routeTable: 'uv_express_routes', idCol: 'id', pathCol: 'path_data', labelCol: 'label' },
];

const MAX_SOURCE_POINTS = 280;
const MAX_MATCH_INPUT_POINTS = 90;
const REQUEST_DELAY_MS = 90;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function sampleCoordinates(coords, maxPoints) {
  if (coords.length <= maxPoints) return coords;

  const sampled = [];
  const step = (coords.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints - 1; i++) {
    sampled.push(coords[Math.round(i * step)]);
  }
  sampled.push(coords[coords.length - 1]);
  return sampled;
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
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const matchings = Array.isArray(data?.matchings) ? data.matchings : [];
  if (matchings.length === 0) return null;

  let best = null;
  for (const m of matchings) {
    if (!m?.geometry?.coordinates || !Array.isArray(m.geometry.coordinates)) continue;
    if (!best || (Number(m.confidence || 0) > Number(best.confidence || 0))) {
      best = m;
    }
  }

  if (!best || !Array.isArray(best.geometry.coordinates) || best.geometry.coordinates.length < 2) {
    return null;
  }

  return sanitizePath(best.geometry.coordinates);
}

async function osrmRoute(coords) {
  if (coords.length < 2) return null;

  const anchors = sampleCoordinates(coords, Math.min(24, coords.length));
  const coordStr = anchors.map((c) => `${c[0]},${c[1]}`).join(';');
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    alternatives: 'false',
    steps: 'false',
  });

  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const geometry = data?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(geometry) || geometry.length < 2) return null;
  return sanitizePath(geometry);
}

async function snapPathToRoads(rawCoords) {
  const cleaned = sanitizePath(rawCoords);
  if (cleaned.length < 2) return null;

  const limited = sampleCoordinates(cleaned, MAX_SOURCE_POINTS);
  const chunks = chunkWithOverlap(limited, MAX_MATCH_INPUT_POINTS);
  const snappedParts = [];

  for (const chunk of chunks) {
    let snapped = await osrmMatch(chunk);
    if (!snapped) snapped = await osrmRoute(chunk);
    if (!snapped || snapped.length < 2) return null;

    snappedParts.push(snapped);
    await sleep(REQUEST_DELAY_MS);
  }

  const merged = mergePathParts(snappedParts);
  if (merged.length < 2) return null;

  // Preserve exact route endpoints from source to keep terminals stable.
  merged[0] = cleaned[0];
  merged[merged.length - 1] = cleaned[cleaned.length - 1];
  return merged;
}

async function main() {
  const workspaceRoot = process.cwd();
  loadDotEnv(path.join(workspaceRoot, '.env'));

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let totalRoutes = 0;
  let updatedRoutes = 0;
  let skippedRoutes = 0;
  let failedRoutes = 0;

  for (const table of TABLES) {
    const { data: rows, error } = await supabase
      .from(table.routeTable)
      .select(`${table.idCol}, ${table.pathCol}, ${table.labelCol}`)
      .eq('is_active', true)
      .order(table.labelCol, { ascending: true });

    if (error) {
      console.warn(`[snap] Skipping ${table.routeTable}: ${error.message}`);
      continue;
    }

    const list = Array.isArray(rows) ? rows : [];
    totalRoutes += list.length;

    console.log(`\n[snap] Processing ${table.routeTable}: ${list.length} routes`);

    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      const id = row[table.idCol];
      const label = row[table.labelCol] || id;
      const original = sanitizePath(row[table.pathCol]);

      if (original.length < 2) {
        skippedRoutes += 1;
        console.log(`[snap] (${i + 1}/${list.length}) skip ${label}: path has < 2 points`);
        continue;
      }

      const snapped = await snapPathToRoads(original);
      if (!snapped) {
        failedRoutes += 1;
        console.log(`[snap] (${i + 1}/${list.length}) fail ${label}: map matching failed`);
        continue;
      }

      const { error: updateErr } = await supabase
        .from(table.routeTable)
        .update({ [table.pathCol]: snapped })
        .eq(table.idCol, id);

      if (updateErr) {
        failedRoutes += 1;
        console.log(`[snap] (${i + 1}/${list.length}) fail ${label}: ${updateErr.message}`);
        continue;
      }

      updatedRoutes += 1;
      console.log(`[snap] (${i + 1}/${list.length}) ok ${label}: ${original.length} -> ${snapped.length} points`);
    }
  }

  console.log('\n[snap] DONE');
  console.log(`[snap] total_active_routes: ${totalRoutes}`);
  console.log(`[snap] updated_routes: ${updatedRoutes}`);
  console.log(`[snap] skipped_routes: ${skippedRoutes}`);
  console.log(`[snap] failed_routes: ${failedRoutes}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
