#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const FALLBACK_GPX_PATH = 'E:/Downloads/export.gpx';
const FALLBACK_FARE = 13;
const DELETE_ALL_FILTER_ID = '00000000-0000-0000-0000-000000000000';
const MAX_SEGMENT_JOIN_GAP_METERS = 350;
const MAX_INTERNAL_POINT_GAP_METERS = 900;

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
    .replace(/â†’/g, '->')
    .replace(/â€“|â€”/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(input) {
  return cleanText(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
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

function dedupeConsecutive(coords) {
  const out = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== lng || prev[1] !== lat) {
      out.push([lng, lat]);
    }
  }
  return out;
}

function appendDedupe(base, extra) {
  for (const pt of extra) {
    const prev = base[base.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) base.push(pt);
  }
}

function pickLongestRun(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return [];
  let best = runs[0];
  let bestLen = pathLengthMeters(best);
  for (let i = 1; i < runs.length; i++) {
    const len = pathLengthMeters(runs[i]);
    if (len > bestLen) {
      best = runs[i];
      bestLen = len;
    }
  }
  return best;
}

function keepLongestContinuousRun(coords, maxGapMeters) {
  if (!Array.isArray(coords) || coords.length < 2) return [];

  const runs = [];
  let run = [coords[0]];

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const cur = coords[i];
    if (distMeters(prev, cur) <= maxGapMeters) {
      run.push(cur);
      continue;
    }

    if (run.length >= 2) runs.push(run);
    run = [cur];
  }

  if (run.length >= 2) runs.push(run);
  return dedupeConsecutive(pickLongestRun(runs));
}

function stitchSegments(segments) {
  const cleanedSegments = [];

  for (const rawSeg of segments) {
    const deduped = dedupeConsecutive(rawSeg);
    const cleaned = keepLongestContinuousRun(deduped, MAX_INTERNAL_POINT_GAP_METERS);
    if (cleaned.length >= 2) cleanedSegments.push(cleaned);
  }

  if (cleanedSegments.length === 0) return [];
  if (cleanedSegments.length === 1) return cleanedSegments[0];

  let seedIndex = 0;
  let bestSeedLen = pathLengthMeters(cleanedSegments[0]);
  for (let i = 1; i < cleanedSegments.length; i++) {
    const len = pathLengthMeters(cleanedSegments[i]);
    if (len > bestSeedLen) {
      bestSeedLen = len;
      seedIndex = i;
    }
  }

  const used = new Array(cleanedSegments.length).fill(false);
  let chain = cleanedSegments[seedIndex].slice();
  used[seedIndex] = true;

  while (true) {
    const chainStart = chain[0];
    const chainEnd = chain[chain.length - 1];

    let best = null;

    for (let i = 0; i < cleanedSegments.length; i++) {
      if (used[i]) continue;
      const seg = cleanedSegments[i];
      const segStart = seg[0];
      const segEnd = seg[seg.length - 1];

      const options = [
        { gap: distMeters(chainEnd, segStart), attach: 'append', reverse: false },
        { gap: distMeters(chainEnd, segEnd), attach: 'append', reverse: true },
        { gap: distMeters(segEnd, chainStart), attach: 'prepend', reverse: false },
        { gap: distMeters(segStart, chainStart), attach: 'prepend', reverse: true },
      ];

      for (const option of options) {
        if (option.gap > MAX_SEGMENT_JOIN_GAP_METERS) continue;
        if (!best || option.gap < best.gap) {
          best = { index: i, ...option };
        }
      }
    }

    if (!best) break;

    used[best.index] = true;
    let segToMerge = cleanedSegments[best.index];
    if (best.reverse) segToMerge = segToMerge.slice().reverse();

    if (best.attach === 'append') {
      appendDedupe(chain, segToMerge);
      continue;
    }

    const merged = segToMerge.slice();
    appendDedupe(merged, chain);
    chain = merged;
  }

  return keepLongestContinuousRun(dedupeConsecutive(chain), MAX_INTERNAL_POINT_GAP_METERS);
}

function extractFirstTag(xml, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = xml.match(re);
  return m ? cleanText(m[1]) : '';
}

function extractRelationTag(trackXml, fallbackId) {
  const hrefMatch = trackXml.match(/<link\b[^>]*\bhref=(['"])(.*?)\1/i);
  if (hrefMatch) {
    const href = hrefMatch[2];
    const idMatch = href.match(/relation\/(\d+)/i);
    if (idMatch) return `relation/${idMatch[1]}`;
  }

  return `gpx-track/${fallbackId}`;
}

function parseDescProperties(desc) {
  const props = {};
  const lines = String(desc || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    props[key] = value;
  }
  return props;
}

function parseTrackSegments(trackXml) {
  const segments = [];
  const segRegex = /<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi;
  let segMatch;
  while ((segMatch = segRegex.exec(trackXml)) !== null) {
    const segXml = segMatch[1];
    const segmentPoints = [];
    const ptRegex = /<trkpt\b([^>]*)>/gi;
    let ptMatch;
    while ((ptMatch = ptRegex.exec(segXml)) !== null) {
      const attrs = ptMatch[1] || '';
      const latMatch = attrs.match(/\blat=['"]([^'"]+)['"]/i);
      const lonMatch = attrs.match(/\blon=['"]([^'"]+)['"]/i);
      if (!latMatch || !lonMatch) continue;
      const lat = Number(latMatch[1]);
      const lon = Number(lonMatch[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      segmentPoints.push([lon, lat]);
    }
    if (segmentPoints.length > 0) segments.push(segmentPoints);
  }

  if (segments.length > 0) return segments;

  // Fallback for GPX files that place points directly under <trk>.
  const directPoints = [];
  const ptRegex = /<trkpt\b([^>]*)>/gi;
  let ptMatch;
  while ((ptMatch = ptRegex.exec(trackXml)) !== null) {
    const attrs = ptMatch[1] || '';
    const latMatch = attrs.match(/\blat=['"]([^'"]+)['"]/i);
    const lonMatch = attrs.match(/\blon=['"]([^'"]+)['"]/i);
    if (!latMatch || !lonMatch) continue;
    const lat = Number(latMatch[1]);
    const lon = Number(lonMatch[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    directPoints.push([lon, lat]);
  }

  return directPoints.length > 0 ? [directPoints] : [];
}

function parseGpxTracks(gpxXml) {
  const tracks = [];
  const trackRegex = /<trk\b[\s\S]*?<\/trk>/gi;
  let trackMatch;
  let index = 0;

  while ((trackMatch = trackRegex.exec(gpxXml)) !== null) {
    index += 1;
    const trackXml = trackMatch[0];
    const name = extractFirstTag(trackXml, 'name');
    const desc = extractFirstTag(trackXml, 'desc');
    const props = parseDescProperties(desc);
    const fallbackId = `${index}-${slug(name || props.name || 'track') || 'track'}`;
    const sourceRelationId = extractRelationTag(trackXml, fallbackId);
    const segments = parseTrackSegments(trackXml);
    const pathCoords = stitchSegments(segments);

    tracks.push({
      index,
      name,
      desc,
      props,
      sourceRelationId,
      pathCoords,
    });
  }

  return tracks;
}

function isLikelyJeepneyRoute(track) {
  const props = track.props || {};
  const text = cleanText([
    track.name,
    track.desc,
    props.name,
    props.network,
    props.operator,
    props.ref,
    props.bus,
    props.route,
  ].filter(Boolean).join(' ')).toLowerCase();

  if (/uv\s*express|\buv\b|\bvan\b/.test(text)) return false;
  if (/\btricycle\b|\btric\b|\btrike\b/.test(text)) return false;

  if (/jeep|puj|share_taxi|ltfrb/.test(text)) return true;
  if (props.route && String(props.route).toLowerCase() !== 'bus') return false;

  // If uncertain, keep it because this source is expected jeepney-focused.
  return true;
}

function parseFare(props) {
  const candidates = [
    props['fare:php'],
    props['fare:regular'],
    props.fare,
    process.env.JEEPNEY_DEFAULT_FARE,
    FALLBACK_FARE,
  ];

  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const m = String(c).match(/\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }

  return FALLBACK_FARE;
}

function makeLabels(track) {
  const props = track.props || {};
  const fromLabel = cleanText(props.from);
  const toLabel = cleanText(props.to);
  const trackName = cleanText(track.name || props.name);
  const ref = cleanText(props.ref);

  let label = '';
  if (fromLabel && toLabel) {
    label = `${fromLabel} -> ${toLabel}`;
  } else if (trackName) {
    label = trackName;
  } else if (ref) {
    label = ref;
  } else {
    label = `Unnamed Jeepney Route ${track.index}`;
  }

  const finalName = trackName || label;
  return { name: finalName, label, fromLabel, toLabel, ref };
}

function buildStops(pathCoords, fromLabel, toLabel) {
  if (pathCoords.length < 2) return [];
  const first = pathCoords[0];
  const last = pathCoords[pathCoords.length - 1];

  const stopA = {
    stop_name: fromLabel || 'Terminal A',
    latitude: first[1],
    longitude: first[0],
    stop_order: 1,
  };

  const stopB = {
    stop_name: toLabel || (fromLabel ? `${fromLabel} Terminal` : 'Terminal B'),
    latitude: last[1],
    longitude: last[0],
    stop_order: 2,
  };

  return [stopA, stopB];
}

async function deleteAllRows(supabase, tableName, idColumn) {
  const { error } = await supabase
    .from(tableName)
    .delete()
    .neq(idColumn, DELETE_ALL_FILTER_ID);

  if (error) {
    throw new Error(`Failed to clear ${tableName}: ${error.message}`);
  }
}

async function main() {
  const workspaceRoot = process.cwd();
  loadDotEnv(path.join(workspaceRoot, '.env'));

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const gpxPath = process.argv[2] ? path.resolve(process.argv[2]) : FALLBACK_GPX_PATH;
  if (!fs.existsSync(gpxPath)) {
    throw new Error(`GPX file not found: ${gpxPath}`);
  }

  const gpxXml = fs.readFileSync(gpxPath, 'utf8');
  const tracks = parseGpxTracks(gpxXml);
  if (tracks.length === 0) {
    throw new Error('No <trk> entries found in GPX file.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Remove previous records before importing this GPX set.
  await deleteAllRows(supabase, 'jeepney_route_stops', 'id');
  await deleteAllRows(supabase, 'jeepney_routes', 'id');

  // Clear legacy generic tables too, if still present.
  try {
    await deleteAllRows(supabase, 'route_stops', 'id');
    await deleteAllRows(supabase, 'routes', 'id');
  } catch {
    // Ignore if legacy tables do not exist or are not accessible.
  }

  let imported = 0;
  let skipped = 0;

  for (const track of tracks) {
    if (!isLikelyJeepneyRoute(track)) {
      skipped += 1;
      continue;
    }

    if (!Array.isArray(track.pathCoords) || track.pathCoords.length < 2) {
      skipped += 1;
      continue;
    }

    const relationId = track.sourceRelationId.split('/').pop() || String(track.index);
    const { name, label, fromLabel, toLabel, ref } = makeLabels(track);
    const routeCodeBase = slug(ref || label || name || `JEEP-${relationId}`) || `JEEP-${relationId}`;
    const routeCode = `${routeCodeBase}-${relationId}`;

    const payload = {
      source_relation_id: track.sourceRelationId,
      route_code: routeCode,
      name,
      label,
      from_label: fromLabel || null,
      to_label: toLabel || null,
      description: cleanText(track.desc) || `Imported from GPX track ${track.index}`,
      operator: cleanText(track.props.operator),
      network: cleanText(track.props.network),
      fare_base: parseFare(track.props),
      status: 'active',
      path_data: track.pathCoords,
      is_active: true,
    };

    const { data: routeRow, error: routeError } = await supabase
      .from('jeepney_routes')
      .upsert(payload, { onConflict: 'source_relation_id' })
      .select('id')
      .single();

    if (routeError) {
      console.error(`Route upsert failed (${track.sourceRelationId}): ${routeError.message}`);
      skipped += 1;
      continue;
    }

    const stops = buildStops(track.pathCoords, fromLabel, toLabel).map((s) => ({
      route_id: routeRow.id,
      ...s,
    }));

    const { error: stopError } = await supabase
      .from('jeepney_route_stops')
      .insert(stops);

    if (stopError) {
      console.error(`Stop insert failed (${track.sourceRelationId}): ${stopError.message}`);
      skipped += 1;
      continue;
    }

    imported += 1;
  }

  console.log(`Total GPX tracks: ${tracks.length}`);
  console.log(`Imported jeepney routes: ${imported}`);
  console.log(`Skipped tracks: ${skipped}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
