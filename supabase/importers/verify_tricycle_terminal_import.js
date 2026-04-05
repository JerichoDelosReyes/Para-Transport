#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const out = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    out[key] = value;
  }

  return out;
}

function isMissingTableError(error) {
  const code = String((error && error.code) || '');
  const message = String((error && error.message) || '').toLowerCase();
  return code === 'PGRST205' || message.includes('schema cache');
}

async function main() {
  const env = {
    ...loadEnv(path.resolve(__dirname, '../../.env')),
    ...process.env,
  };

  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let targetTable = 'tricycle_terminals';
  const probe = await supabase
    .from('tricycle_terminals')
    .select('id')
    .limit(1);

  if (probe.error && isMissingTableError(probe.error)) {
    targetTable = 'terminals';
  }

  const terminalsCount = await supabase
    .from(targetTable)
    .select('id', { count: 'exact', head: true });

  const unnamedCount = await supabase
    .from(targetTable)
    .select('id', { count: 'exact', head: true })
    .or('name.is.null,name.eq.');

  const invalidCoords = await supabase
    .from(targetTable)
    .select('id', { count: 'exact', head: true })
    .or('latitude.lt.-90,latitude.gt.90,longitude.lt.-180,longitude.gt.180');

  let duplicateSourceIds = 0;
  if (targetTable === 'tricycle_terminals') {
    const sourceDupes = await supabase
      .from('tricycle_terminals')
      .select('source_id');

    const sourceSeen = new Set();
    for (const row of sourceDupes.data || []) {
      const sourceId = String(row.source_id || '').trim();
      if (!sourceId) continue;
      if (sourceSeen.has(sourceId)) duplicateSourceIds += 1;
      sourceSeen.add(sourceId);
    }
  }

  const sample = await supabase
    .from(targetTable)
    .select(targetTable === 'tricycle_terminals'
      ? 'name, city, barangay, latitude, longitude, source_id'
      : 'name, city, latitude, longitude')
    .order('name')
    .limit(10);

  console.log('target_table', targetTable);
  console.log('tricycle_terminals_count', terminalsCount.count || 0);
  console.log('unnamed_terminals_count', unnamedCount.count || 0);
  console.log('invalid_coordinate_count', invalidCoords.count || 0);
  console.log('duplicate_source_id_count', duplicateSourceIds);
  console.log('sample_terminals', sample.data || []);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
