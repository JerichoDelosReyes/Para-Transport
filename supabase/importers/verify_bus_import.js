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

  const bus = await supabase.from('bus_routes').select('id', { count: 'exact', head: true });
  const busStops = await supabase.from('bus_route_stops').select('id', { count: 'exact', head: true });
  const sample = await supabase.from('bus_routes').select('route_code,label,source_relation_id').order('created_at', { ascending: false }).limit(8);

  console.log('bus_routes_count', bus.count);
  console.log('bus_route_stops_count', busStops.count);
  console.log('sample_bus_routes', sample.data || []);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
