#!/usr/bin/env node

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const MIN_GAP_KM = 0.5;
const MAX_GAP_KM = 3.0;
const MAX_WALK_TO_TERMINAL_KM = 0.5;
const MAX_ORIGIN_TO_ROUTE_KM = 0.7;
const MAX_RESULTS = 20;

function loadEnv(path) {
  const out = {};
  if (!fs.existsSync(path)) return out;

  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    out[k] = v;
  }
  return out;
}

function toRad(v) {
  return (v * Math.PI) / 180;
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const r = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return r * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function parseLocalPlaces(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const start = src.indexOf('[');
  const end = src.lastIndexOf(']');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Could not parse local places array.');
  }
  return JSON.parse(src.slice(start, end + 1));
}

function nearestOnPath(path, lat, lon, step = 3) {
  let best = { index: 0, latitude: path[0][1], longitude: path[0][0], distanceKm: Number.POSITIVE_INFINITY };

  for (let i = 0; i < path.length; i += step) {
    const pt = path[i];
    const d = haversineKm(lat, lon, pt[1], pt[0]);
    if (d < best.distanceKm) {
      best = { index: i, latitude: pt[1], longitude: pt[0], distanceKm: d };
    }
  }

  const last = path[path.length - 1];
  const lastD = haversineKm(lat, lon, last[1], last[0]);
  if (lastD < best.distanceKm) {
    best = { index: path.length - 1, latitude: last[1], longitude: last[0], distanceKm: lastD };
  }

  return best;
}

function nearestTerminalForAlight(terminals, alight, destination) {
  let chosen = null;
  let chosenScore = Number.POSITIVE_INFINITY;

  for (const t of terminals) {
    const walkKm = haversineKm(alight.latitude, alight.longitude, t.latitude, t.longitude);
    if (walkKm > MAX_WALK_TO_TERMINAL_KM) continue;

    const rideKm = haversineKm(t.latitude, t.longitude, destination.latitude, destination.longitude);
    const score = walkKm * 2 + rideKm;

    if (score < chosenScore) {
      chosen = { terminal: t, walkKm, rideKm, score };
      chosenScore = score;
    }
  }

  return chosen;
}

function routeTypeLabel(tableName) {
  if (tableName === 'jeepney_routes') return 'jeepney';
  if (tableName === 'bus_routes') return 'bus';
  return tableName;
}

async function main() {
  const env = {
    ...loadEnv('.env'),
    ...process.env,
  };

  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const places = parseLocalPlaces('data/local_places.ts').map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: p.subtitle,
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
  }));

  const terminalsRes = await supabase
    .from('tricycle_terminals')
    .select('id, name, latitude, longitude, city')
    .eq('status', 'active');

  if (terminalsRes.error) {
    throw new Error(`Failed loading terminals: ${terminalsRes.error.message}`);
  }

  const terminals = (terminalsRes.data || []).map((t) => ({
    id: String(t.id),
    name: String(t.name || 'Tricycle Terminal'),
    city: t.city ? String(t.city) : null,
    latitude: Number(t.latitude),
    longitude: Number(t.longitude),
  }));

  const routeTables = ['jeepney_routes', 'bus_routes'];
  const candidates = [];

  for (const table of routeTables) {
    const routesRes = await supabase
      .from(table)
      .select('route_code, label, path_data')
      .eq('is_active', true)
      .limit(500);

    if (routesRes.error) {
      throw new Error(`Failed loading ${table}: ${routesRes.error.message}`);
    }

    for (const row of routesRes.data || []) {
      const path = Array.isArray(row.path_data) ? row.path_data : [];
      if (path.length < 2) continue;

      const start = { latitude: Number(path[0][1]), longitude: Number(path[0][0]) };

      const origin = places
        .map((p) => ({ place: p, distanceKm: haversineKm(start.latitude, start.longitude, p.latitude, p.longitude) }))
        .filter((x) => x.distanceKm <= MAX_ORIGIN_TO_ROUTE_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];

      if (!origin) continue;

      for (const destination of places) {
        if (destination.id === origin.place.id) continue;

        const alight = nearestOnPath(path, destination.latitude, destination.longitude, 3);
        const gapKm = alight.distanceKm;
        if (gapKm < MIN_GAP_KM || gapKm > MAX_GAP_KM) continue;

        const chosen = nearestTerminalForAlight(terminals, alight, destination);
        if (!chosen) continue;

        candidates.push({
          routeCode: String(row.route_code || ''),
          routeLabel: String(row.label || row.route_code || ''),
          routeType: routeTypeLabel(table),
          origin: origin.place,
          originDistanceKm: origin.distanceKm,
          destination,
          gapKm,
          alight,
          terminal: chosen.terminal,
          walkToTerminalKm: chosen.walkKm,
          terminalRideKm: chosen.rideKm,
          score: Math.abs(gapKm - 1.8) + chosen.score,
        });
      }
    }
  }

  const deduped = new Map();
  for (const item of candidates) {
    const key = `${item.origin.id}|${item.destination.id}|${item.routeType}`;
    const prev = deduped.get(key);
    if (!prev || item.score < prev.score) {
      deduped.set(key, item);
    }
  }

  const sorted = Array.from(deduped.values())
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_RESULTS);

  if (sorted.length === 0) {
    console.log('No likely tricycle-extension test pairs found.');
    return;
  }

  console.log(`Found ${sorted.length} likely test pairs:`);
  console.log('');

  sorted.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.origin.title} -> ${item.destination.title}`);
    console.log(`   Route hint: [${item.routeType}] ${item.routeCode} ${item.routeLabel}`);
    console.log(`   Origin-to-route: ${item.originDistanceKm.toFixed(2)} km`);
    console.log(`   Alight-to-destination gap: ${item.gapKm.toFixed(2)} km`);
    console.log(`   Terminal near alight: ${item.terminal.name} (walk ${item.walkToTerminalKm.toFixed(2)} km)`);
    console.log(`   Terminal-to-destination ride: ${item.terminalRideKm.toFixed(2)} km`);
    console.log('');
  });
}

main().catch((err) => {
  console.error('[find-tricycle-extension-test-pairs] ERROR:', err.message || err);
  process.exit(1);
});
