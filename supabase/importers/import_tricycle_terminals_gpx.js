#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const FALLBACK_GPX_PATH = 'E:/Downloads/Tricycle Terminal.gpx';
const CLEAR_ALL_FLAG = '--replace-all';
const DELETE_ALL_FILTER_ID = '__keep_none__';
const CHUNK_SIZE = 500;

function isMissingTableError(error) {
  const code = String((error && error.code) || '');
  const message = String((error && error.message) || '').toLowerCase();
  return code === 'PGRST205' || message.includes('schema cache');
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

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function decodeXmlEntities(input) {
  if (!input) return '';
  return String(input)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanText(input) {
  if (!input) return '';
  return decodeXmlEntities(input)
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(input) {
  return cleanText(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function isOsmObjectLabel(input) {
  return /^(node|way|relation)\/\d+$/i.test(cleanText(input));
}

function extractTagValue(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return cleanText(match[1]);
}

function extractTagRaw(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return decodeXmlEntities(match[1]);
}

function parseDescTags(descText) {
  const tags = {};
  if (!descText) return tags;

  const lines = String(descText).split(/\r?\n/);
  for (const rawLine of lines) {
    const line = cleanText(rawLine);
    if (!line) continue;

    const eq = line.indexOf('=');
    if (eq < 0) continue;

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!key || !value) continue;

    tags[key] = value;
  }

  return tags;
}

function parseSourceId(linkHref, fallbackName, latitude, longitude, index) {
  const href = cleanText(linkHref);
  const osmBrowseMatch = href.match(/\/browse\/(node|way|relation)\/(\d+)/i);
  if (osmBrowseMatch) {
    return `${osmBrowseMatch[1].toLowerCase()}:${osmBrowseMatch[2]}`;
  }

  return `gpx:${slug(fallbackName) || 'terminal'}:${latitude.toFixed(6)},${longitude.toFixed(6)}:${index}`;
}

function parseWaypointsFromGpx(gpxXml) {
  const waypoints = [];
  const waypointRegex = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/gi;

  let match;
  let index = 0;
  while ((match = waypointRegex.exec(gpxXml)) !== null) {
    const attrs = match[1] || '';
    const body = match[2] || '';

    const latMatch = attrs.match(/\blat="([^"]+)"/i);
    const lonMatch = attrs.match(/\blon="([^"]+)"/i);

    if (!latMatch || !lonMatch) continue;

    const latitude = Number(latMatch[1]);
    const longitude = Number(lonMatch[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const name = extractTagValue(body, 'name');
    const desc = extractTagRaw(body, 'desc');
    const linkHrefMatch = body.match(/<link\b[^>]*href="([^"]+)"/i);
    const linkHref = linkHrefMatch ? cleanText(linkHrefMatch[1]) : '';
    const descTags = parseDescTags(desc);

    const candidateName = cleanText(name) || cleanText(descTags.name) || `Tricycle Terminal ${index + 1}`;
    const bestName = isOsmObjectLabel(candidateName)
      ? `Tricycle Terminal ${index + 1}`
      : candidateName;
    const sourceId = parseSourceId(linkHref, bestName, latitude, longitude, index);

    waypoints.push({
      source_id: sourceId,
      name: bestName,
      latitude,
      longitude,
      city: cleanText(descTags['addr:city']) || null,
      barangay: cleanText(descTags['addr:barangay']) || null,
      status: 'active',
      metadata: {
        osm_link: linkHref || null,
        taxi_vehicle: cleanText(descTags.taxi_vehicle) || null,
        amenity: cleanText(descTags.amenity) || null,
        raw_desc: desc || null,
      },
    });

    index += 1;
  }

  return waypoints;
}

function dedupeBySourceId(rows) {
  const map = new Map();
  let duplicateCount = 0;

  for (const row of rows) {
    if (map.has(row.source_id)) {
      duplicateCount += 1;
    }
    map.set(row.source_id, row);
  }

  return {
    rows: Array.from(map.values()),
    duplicateCount,
  };
}

async function upsertChunks(supabase, tableName, rows, useUpsert) {
  let total = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    let error;
    if (useUpsert) {
      ({ error } = await supabase
        .from(tableName)
        .upsert(chunk, { onConflict: 'source_id' }));
    } else {
      ({ error } = await supabase
        .from(tableName)
        .insert(chunk));
    }

    if (error) {
      throw new Error(`Upsert failed at chunk ${i / CHUNK_SIZE + 1}: ${error.message}`);
    }

    total += chunk.length;
    console.log(`[import-tricycle-terminals] Upserted ${total}/${rows.length}`);
  }
}

async function main() {
  const rootEnvPath = path.resolve(__dirname, '../../.env');
  loadDotEnv(rootEnvPath);

  const args = process.argv.slice(2);
  const shouldReplaceAll = args.includes(CLEAR_ALL_FLAG);
  const targetFileArg = args.find((arg) => !arg.startsWith('--'));
  const gpxPath = targetFileArg || FALLBACK_GPX_PATH;

  if (!fs.existsSync(gpxPath)) {
    throw new Error(`GPX file not found: ${gpxPath}`);
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let targetTable = 'tricycle_terminals';
  let useUpsert = true;

  const tableProbe = await supabase
    .from('tricycle_terminals')
    .select('id')
    .limit(1);

  if (tableProbe.error && isMissingTableError(tableProbe.error)) {
    targetTable = 'terminals';
    useUpsert = false;
    console.log('[import-tricycle-terminals] tricycle_terminals not found, using legacy terminals table fallback.');
  }

  const gpxXml = fs.readFileSync(gpxPath, 'utf8');
  const parsedRows = parseWaypointsFromGpx(gpxXml);

  if (parsedRows.length === 0) {
    throw new Error('No GPX waypoints parsed. Check if the file contains <wpt> entries.');
  }

  const { rows, duplicateCount } = dedupeBySourceId(parsedRows);

  const payloadRows = useUpsert
    ? rows
    : rows.map((row) => ({
        name: row.name,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
      }));

  if (shouldReplaceAll) {
    console.log('[import-tricycle-terminals] --replace-all enabled. Clearing existing records...');
    const { error: clearError } = await supabase
      .from(targetTable)
      .delete()
      .neq(useUpsert ? 'source_id' : 'name', useUpsert ? DELETE_ALL_FILTER_ID : '__keep_none__');

    if (clearError) {
      throw new Error(`Failed to clear existing terminals: ${clearError.message}`);
    }
  } else if (!useUpsert) {
    console.log('[import-tricycle-terminals] Legacy terminals fallback mode without --replace-all may create duplicates.');
  }

  await upsertChunks(supabase, targetTable, payloadRows, useUpsert);

  const { count, error: countError } = await supabase
    .from(targetTable)
    .select('id', { count: 'exact', head: true });

  if (countError) {
    throw new Error(`Imported, but failed to verify count: ${countError.message}`);
  }

  console.log('');
  console.log('[import-tricycle-terminals] Done.');
  console.log(`[import-tricycle-terminals] Target table: ${targetTable}`);
  console.log(`[import-tricycle-terminals] Source file: ${gpxPath}`);
  console.log(`[import-tricycle-terminals] Parsed waypoints: ${parsedRows.length}`);
  console.log(`[import-tricycle-terminals] Deduped waypoints: ${rows.length}`);
  console.log(`[import-tricycle-terminals] Duplicate source_id dropped: ${duplicateCount}`);
  console.log(`[import-tricycle-terminals] Table count after import: ${count || 0}`);
}

main().catch((err) => {
  console.error('[import-tricycle-terminals] ERROR:', err.message || err);
  process.exit(1);
});
