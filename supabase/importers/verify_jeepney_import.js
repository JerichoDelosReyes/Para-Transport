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

function isMissingTableError(error) {
  const code = String((error && error.code) || '');
  const message = String((error && error.message) || '').toLowerCase();
  return code === 'PGRST205' || message.includes('schema cache');
}

async function safeHeadCount(supabase, table) {
  const res = await supabase.from(table).select('id', { count: 'exact', head: true });
  if (res.error && isMissingTableError(res.error)) return 0;
  if (res.error) throw new Error(res.error.message || `Failed reading ${table}`);
  return res.count || 0;
}

async function main() {
  const env = loadEnv('.env');
  const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const jeepneyCount = await safeHeadCount(supabase, 'jeepney_routes');
  const jeepneyStopsCount = await safeHeadCount(supabase, 'jeepney_route_stops');
  const legacyRoutesCount = await safeHeadCount(supabase, 'routes');
  const legacyStopsCount = await safeHeadCount(supabase, 'route_stops');

  const sample = await supabase.from('jeepney_routes').select('route_code,label').limit(5);
  const stopSample = await supabase
    .from('jeepney_route_stops')
    .select('stop_name,stop_order')
    .order('stop_name')
    .limit(10);

  if (sample.error) throw new Error(sample.error.message || 'Failed to read jeepney route sample');
  if (stopSample.error) throw new Error(stopSample.error.message || 'Failed to read jeepney stop sample');

  console.log('jeepney_routes_count', jeepneyCount);
  console.log('jeepney_route_stops_count', jeepneyStopsCount);
  console.log('legacy_routes_count', legacyRoutesCount);
  console.log('legacy_route_stops_count', legacyStopsCount);
  console.log('sample_labels', sample.data || []);
  console.log('sample_stops', stopSample.data || []);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
