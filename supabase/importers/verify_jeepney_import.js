const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(path) {
  const out = {};
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

async function main() {
  const env = loadEnv('.env');
  const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const jeepney = await supabase.from('jeepney_routes').select('id', { count: 'exact', head: true });
  const jeepneyStops = await supabase.from('jeepney_route_stops').select('id', { count: 'exact', head: true });
  const legacyRoutes = await supabase.from('routes').select('id', { count: 'exact', head: true });
  const legacyStops = await supabase.from('route_stops').select('id', { count: 'exact', head: true });
  const sample = await supabase.from('jeepney_routes').select('route_code,label').limit(5);
  const stopSample = await supabase
    .from('jeepney_route_stops')
    .select('stop_name,stop_order')
    .order('stop_name')
    .limit(10);

  console.log('jeepney_routes_count', jeepney.count);
  console.log('jeepney_route_stops_count', jeepneyStops.count);
  console.log('legacy_routes_count', legacyRoutes.count);
  console.log('legacy_route_stops_count', legacyStops.count);
  console.log('sample_labels', sample.data || []);
  console.log('sample_stops', stopSample.data || []);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
