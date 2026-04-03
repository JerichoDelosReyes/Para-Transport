#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
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

function parseViaHints(route) {
  const candidates = [];
  const viaRegex = /\(via\s+([^)]+)\)|\bvia\s+([^\-]+?)(?=\s*->|\s*$)/gi;

  for (const source of [route.label, route.name]) {
    if (!source) continue;
    let match;
    while ((match = viaRegex.exec(String(source))) !== null) {
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

  return out.slice(0, 4);
}

function samplePathPoint(pathData, fraction) {
  if (!Array.isArray(pathData) || pathData.length === 0) return null;
  const idx = Math.max(0, Math.min(pathData.length - 1, Math.round((pathData.length - 1) * fraction)));
  const point = pathData[idx];
  if (!Array.isArray(point) || point.length < 2) return null;
  const lng = Number(point[0]);
  const lat = Number(point[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { latitude: lat, longitude: lng };
}

function buildStopsForRoute(route, fromLabel, toLabel, viaHints) {
  const start = samplePathPoint(route.path_data, 0);
  const end = samplePathPoint(route.path_data, 1);
  if (!start || !end) return [];

  const stops = [
    {
      route_id: route.id,
      stop_name: fromLabel,
      latitude: start.latitude,
      longitude: start.longitude,
      stop_order: 1,
    },
  ];

  for (let i = 0; i < viaHints.length; i += 1) {
    const fraction = (i + 1) / (viaHints.length + 1);
    const point = samplePathPoint(route.path_data, fraction);
    if (!point) continue;
    stops.push({
      route_id: route.id,
      stop_name: viaHints[i],
      latitude: point.latitude,
      longitude: point.longitude,
      stop_order: stops.length + 1,
    });
  }

  stops.push({
    route_id: route.id,
    stop_name: toLabel,
    latitude: end.latitude,
    longitude: end.longitude,
    stop_order: stops.length + 1,
  });

  return stops;
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

async function main() {
  loadDotEnv(path.join(process.cwd(), '.env'));

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: routes, error: routeErr } = await supabase
    .from('jeepney_routes')
    .select('id,label,name,from_label,to_label,path_data')
    .order('label');

  if (routeErr) throw routeErr;

  let rebuiltRoutes = 0;
  let updatedRoutes = 0;
  let skippedRoutes = 0;

  for (const route of routes || []) {
    const fromLabel = cleanEndpoint(route.from_label);
    const toLabel = cleanEndpoint(route.to_label);

    const splitFromLabel = splitEndpoints(route.label);
    const splitFromName = splitEndpoints(route.name);

    const resolvedFrom = chooseEndpoint(
      [fromLabel, splitFromLabel?.from, splitFromName?.from],
      'Terminal A',
    );
    const resolvedTo = chooseEndpoint(
      [toLabel, splitFromLabel?.to, splitFromName?.to],
      'Terminal B',
    );

    const viaHints = parseViaHints(route)
      .filter((hint) => hint.toLowerCase() !== resolvedFrom.toLowerCase())
      .filter((hint) => hint.toLowerCase() !== resolvedTo.toLowerCase());

    const rebuiltStops = buildStopsForRoute(route, resolvedFrom, resolvedTo, viaHints);
    if (rebuiltStops.length >= 2) {
      const { error: delErr } = await supabase
        .from('jeepney_route_stops')
        .delete()
        .eq('route_id', route.id);

      if (delErr) {
        console.warn(`Skip route ${route.id} (delete old stops): ${delErr.message}`);
        skippedRoutes += 1;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('jeepney_route_stops')
        .insert(rebuiltStops);

      if (insertErr) {
        console.warn(`Skip route ${route.id} (insert rebuilt stops): ${insertErr.message}`);
        skippedRoutes += 1;
        continue;
      }

      rebuiltRoutes += 1;
      updatedRoutes += 1;
      continue;
    }

    const { error: upAErr } = await supabase
      .from('jeepney_route_stops')
      .update({ stop_name: resolvedFrom })
      .eq('route_id', route.id)
      .eq('stop_order', 1);

    if (upAErr) {
      console.warn(`Skip route ${route.id} (stop_order 1): ${upAErr.message}`);
      skippedRoutes += 1;
      continue;
    }

    const { error: upBErr } = await supabase
      .from('jeepney_route_stops')
      .update({ stop_name: resolvedTo })
      .eq('route_id', route.id)
      .eq('stop_order', 2);

    if (upBErr) {
      console.warn(`Skip route ${route.id} (stop_order 2): ${upBErr.message}`);
      skippedRoutes += 1;
      continue;
    }

    updatedRoutes += 1;
  }

  const terminalLike = await supabase
    .from('jeepney_route_stops')
    .select('id', { count: 'exact', head: true })
    .ilike('stop_name', 'Terminal%');

  const sample = await supabase
    .from('jeepney_route_stops')
    .select('stop_name, stop_order')
    .order('stop_name')
    .limit(12);

  console.log('repair_updated_routes', updatedRoutes);
  console.log('repair_rebuilt_routes', rebuiltRoutes);
  console.log('repair_skipped_routes', skippedRoutes);
  console.log('terminal_like_stop_count', terminalLike.count);
  console.log('sample_stop_names', sample.data || []);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
