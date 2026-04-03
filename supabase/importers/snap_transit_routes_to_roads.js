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

const MAX_MATCH_INPUT_POINTS = 90;
const REQUEST_DELAY_MS = 90;
const MIN_MATCH_CONFIDENCE = 0.2;
const MAX_SAFE_JUMP_METERS = 420;

function parseTableFilters(cliArgs) {
  const selected = new Set();

  for (let i = 0; i < cliArgs.length; i++) {
    const arg = String(cliArgs[i] || '').trim();
    if (!arg) continue;

    if (arg === '--table') {
      const next = String(cliArgs[i + 1] || '').trim();
      if (!next) {
        throw new Error('Missing value after --table. Example: --table bus_routes');
      }
      selected.add(next.toLowerCase());
      i += 1;
      continue;
    }

    const tableInline = arg.match(/^--table=(.+)$/i);
    if (tableInline?.[1]) {
      selected.add(String(tableInline[1]).trim().toLowerCase());
    }
  }

  return selected;
}

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

function pickLongestSegment(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  let best = segments[0];
  let bestLen = pathLengthMeters(best);
  for (let i = 1; i < segments.length; i++) {
    const len = pathLengthMeters(segments[i]);
    if (len > bestLen) {
      best = segments[i];
      bestLen = len;
    }
  }
  return best;
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

  return {
    coords: sanitizePath(best.geometry.coordinates),
    confidence: Number(best.confidence || 0),
  };
}

async function snapPathToRoads(rawCoords) {
  const cleaned = sanitizePath(rawCoords);
  if (cleaned.length < 2) return null;

  const chunks = chunkWithOverlap(cleaned, MAX_MATCH_INPUT_POINTS);
  const snappedParts = [];

  for (const chunk of chunks) {
    const matched = await osrmMatch(chunk);

    // Preserve GPX intent: never reroute with shortest-path fallback.
    // If map matching confidence is weak, keep original chunk geometry.
    let snapped = chunk;
    if (matched && matched.coords.length >= 2 && matched.confidence >= MIN_MATCH_CONFIDENCE) {
      snapped = matched.coords;
      snapped[0] = chunk[0];
      snapped[snapped.length - 1] = chunk[chunk.length - 1];
    }

    if (!snapped || snapped.length < 2) {
      snapped = chunk;
    }

    snappedParts.push(snapped);
    await sleep(REQUEST_DELAY_MS);
  }

  const merged = mergePathParts(snappedParts);
  if (merged.length < 2) return cleaned;

  // If snapping created unstable jumps, keep original GPX geometry for this route.
  if (maxStepMeters(merged) > MAX_SAFE_JUMP_METERS) {
    return cleaned;
  }

  // Guard against severe truncation: keep GPX if snapped shape is too short.
  const mergedLen = pathLengthMeters(merged);
  const sourceLen = pathLengthMeters(cleaned);
  if (sourceLen > 0 && mergedLen < sourceLen * 0.45) {
    return cleaned;
  }

  merged[0] = cleaned[0];
  merged[merged.length - 1] = cleaned[cleaned.length - 1];
  return sanitizePath(merged);
}

async function fetchAllActiveRoutes(supabase, table) {
  const pageSize = 1000;
  const out = [];
  let offset = 0;

  while (true) {
    const from = offset;
    const to = offset + pageSize - 1;

    const { data, error } = await supabase
      .from(table.routeTable)
      .select(`${table.idCol}, ${table.pathCol}, ${table.labelCol}`)
      .eq('is_active', true)
      .order(table.labelCol, { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to read ${table.routeTable}: ${error.message}`);
    }

    const batch = Array.isArray(data) ? data : [];
    if (batch.length === 0) break;

    out.push(...batch);
    if (batch.length < pageSize) break;

    offset += pageSize;
  }

  return out;
}

async function main() {
  const workspaceRoot = process.cwd();
  loadDotEnv(path.join(workspaceRoot, '.env'));

  const selectedTables = parseTableFilters(process.argv.slice(2));
  const tablesToProcess = selectedTables.size > 0
    ? TABLES.filter((table) => selectedTables.has(table.routeTable.toLowerCase()))
    : TABLES;

  if (selectedTables.size > 0 && tablesToProcess.length === 0) {
    throw new Error(
      `No matching route tables for --table filter. Available: ${TABLES.map((t) => t.routeTable).join(', ')}`
    );
  }

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

  if (selectedTables.size > 0) {
    console.log(`[snap] table filter active: ${tablesToProcess.map((t) => t.routeTable).join(', ')}`);
  }

  for (const table of tablesToProcess) {
    let rows;
    try {
      rows = await fetchAllActiveRoutes(supabase, table);
    } catch (error) {
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
