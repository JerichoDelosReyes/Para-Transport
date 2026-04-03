const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

async function main() {
  loadDotEnv(path.join(process.cwd(), '.env'));

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from('bus_routes')
    .select('id, route_code, label, name, from_label, to_label, path_data, is_active')
    .or('label.ilike.%Mendez%,name.ilike.%Mendez%,from_label.ilike.%Mendez%,to_label.ilike.%Mendez%')
    .limit(20);

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  console.log(`[inspect] matched routes: ${rows.length}`);

  for (const r of rows) {
    const p = Array.isArray(r.path_data) ? r.path_data : [];
    const first = p[0] || null;
    const last = p[p.length - 1] || null;

    console.log(JSON.stringify({
      id: r.id,
      route_code: r.route_code,
      label: r.label,
      name: r.name,
      from_label: r.from_label,
      to_label: r.to_label,
      pathPoints: p.length,
      first,
      last,
      is_active: r.is_active,
    }, null, 2));
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
