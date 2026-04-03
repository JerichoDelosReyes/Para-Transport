const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

function pathStats(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return { maxStepMeters: 0, totalMeters: 0 };
  let maxStepMeters = 0;
  let totalMeters = 0;

  for (let i = 1; i < coords.length; i++) {
    const d = distMeters(coords[i - 1], coords[i]);
    if (d > maxStepMeters) maxStepMeters = d;
    totalMeters += d;
  }

  return { maxStepMeters, totalMeters };
}

async function main() {
  loadDotEnv(path.join(process.cwd(), '.env'));

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: rows, error } = await supabase
    .from('jeepney_routes')
    .select('route_code, label, path_data')
    .eq('is_active', true);

  if (error) throw error;

  const list = Array.isArray(rows) ? rows : [];
  const FLAG_THRESHOLD_METERS = 220;
  const flagged = [];

  for (const row of list) {
    const pathData = sanitizePath(row.path_data);
    if (pathData.length < 2) {
      flagged.push({
        route_code: row.route_code,
        label: row.label,
        reason: 'path has < 2 points',
      });
      continue;
    }

    const stats = pathStats(pathData);
    if (stats.maxStepMeters > FLAG_THRESHOLD_METERS) {
      flagged.push({
        route_code: row.route_code,
        label: row.label,
        max_step_m: Math.round(stats.maxStepMeters),
        total_km: Number((stats.totalMeters / 1000).toFixed(2)),
        points: pathData.length,
      });
    }
  }

  flagged.sort((a, b) => (b.max_step_m || 0) - (a.max_step_m || 0));

  console.log('active_routes', list.length);
  console.log('flagged_routes_max_step_gt_220m', flagged.length);
  console.log(JSON.stringify(flagged.slice(0, 30), null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
