#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const FALLBACK_GPX_PATH = 'E:/Downloads/Busr_outes.gpx';
const FALLBACK_FARE = 15;
const CLEAR_ALL_FLAG = '--replace-all';
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

function cleanEndpoint(raw) {
  let text = cleanText(raw);
  if (!text) return '';

  text = text
    .replace(/^(Jeepney|Bus) Route[^:]*:\s*/i, '')
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

function parseViaHints(track, label, name) {
  const props = track.props || {};
  const candidates = [];

  if (props.via) {
    candidates.push(String(props.via));
  }

  const viaRegex = /\(via\s+([^)]+)\)|\bvia\s+([^\-]+?)(?=\s*->|\s*$)/gi;
  for (const source of [label, name, track.name]) {
    if (!source) continue;
    let match;
    while ((match = viaRegex.exec(source)) !== null) {
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

  return out;
}

function samplePathPoint(pathCoords, fraction) {
  if (!Array.isArray(pathCoords) || pathCoords.length === 0) return null;
  const idx = Math.max(0, Math.min(pathCoords.length - 1, Math.round((pathCoords.length - 1) * fraction)));
  return pathCoords[idx];
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

function extractMetadata(gpxXml) {
  const metadataMatch = gpxXml.match(/<metadata\b[^>]*>([\s\S]*?)<\/metadata>/i);
  if (!metadataMatch) {
    return { name: '', desc: '' };
  }

  const metadataXml = metadataMatch[1];
  return {
    name: extractFirstTag(metadataXml, 'name'),
    desc: extractFirstTag(metadataXml, 'desc'),
  };
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

function parseGpxTracks(gpxXml, sourcePath = '') {
  const tracks = [];
  const trackRegex = /<trk\b[\s\S]*?<\/trk>/gi;
  let trackMatch;
  let index = 0;
  const metadata = extractMetadata(gpxXml);
  const sourceFile = sourcePath ? path.basename(sourcePath) : '';
  const sourceFileStem = sourcePath ? path.parse(sourcePath).name : 'gpx-track';
  const sourceFileKey = slug(sourceFileStem) || 'GPX-TRACK';

  while ((trackMatch = trackRegex.exec(gpxXml)) !== null) {
    index += 1;
    const trackXml = trackMatch[0];
    const rawName = extractFirstTag(trackXml, 'name');
    const desc = extractFirstTag(trackXml, 'desc');
    const props = parseDescProperties(desc);
    const name = cleanText(rawName || props.name || metadata.name || '');
    const fallbackName = name || (metadata.name ? `${metadata.name} (${index})` : '');
    const fallbackId = `${sourceFileKey}-${index}-${slug(name || metadata.name || 'track') || 'track'}`;
    const sourceRelationId = extractRelationTag(trackXml, fallbackId);
    const segments = parseTrackSegments(trackXml);
    const pathCoords = stitchSegments(segments);

    tracks.push({
      index,
      name: fallbackName,
      desc,
      metaName: metadata.name,
      metaDesc: metadata.desc,
      sourceFile,
      props,
      sourceRelationId,
      pathCoords,
    });
  }

  return tracks;
}

function isLikelyBusRoute(track) {
  if (!String(track.sourceRelationId || '').startsWith('relation/')) return false;

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
    props.type,
  ].filter(Boolean).join(' ')).toLowerCase();

  if (/uv\s*express|\buv\b|\bvan\b/.test(text)) return false;
  if (/\btricycle\b|\btric\b|\btrike\b/.test(text)) return false;
  if (/\bjeep\b|\bjeepney\b|\bpuj\b|share_taxi/.test(text)) return false;

  // The provided GPX also contains many regular roadway way-tracks.
  // Keep only relation-like bus tracks with explicit route=bus signals.
  const hasRouteBusTag = /\broute\s*=\s*bus\b/.test(text);
  const hasTypeRouteTag = /\btype\s*=\s*route\b/.test(text);
  const hasFromToTags = /\bfrom\s*=/.test(text) && /\bto\s*=/.test(text);
  const hasBusRouteName = /\b(city\s+bus\s+route|bus\s+route|provincial\s+bus|school\s+bus|p2p)\b/.test(text);
  const hasHighwayTag = /\bhighway\s*=/.test(text);

  if (!hasRouteBusTag) return false;

  // Require stronger route evidence so named roads/highways are excluded.
  if (hasTypeRouteTag || hasFromToTags || hasBusRouteName) return true;

  // In rare cases, keep route=bus entries without highway road-way tags.
  return !hasHighwayTag;
}

function parseFare(props) {
  const candidates = [
    props['fare:php'],
    props['fare:regular'],
    props.fare,
    process.env.BUS_DEFAULT_FARE,
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
  const fromLabelRaw = cleanText(props.from);
  const toLabelRaw = cleanText(props.to);
  const trackName = cleanText(track.name || props.name || track.metaName);
  const ref = cleanText(props.ref);

  const splitFromName = splitEndpoints(trackName);

  let label = '';
  if (fromLabelRaw && toLabelRaw) {
    label = `${fromLabelRaw} -> ${toLabelRaw}`;
  } else if (splitFromName?.from && splitFromName?.to) {
    label = `${splitFromName.from} -> ${splitFromName.to}`;
  } else if (trackName) {
    label = trackName;
  } else if (ref) {
    label = ref;
  } else {
    label = `Unnamed Bus Route ${track.index}`;
  }

  const splitFromLabel = splitEndpoints(label);
  const fromLabel = chooseEndpoint(
    [fromLabelRaw, splitFromLabel?.from, splitFromName?.from],
    'Terminal A',
  );
  const toLabel = chooseEndpoint(
    [toLabelRaw, splitFromLabel?.to, splitFromName?.to],
    'Terminal B',
  );

  if (isUsableEndpoint(fromLabel) && isUsableEndpoint(toLabel)) {
    label = `${fromLabel} -> ${toLabel}`;
  }

  const finalName = trackName || label;
  const viaHints = parseViaHints(track, label, finalName);
  return { name: finalName, label, fromLabel, toLabel, ref, viaHints };
}

function isStyleDescription(text) {
  const value = cleanText(text).toLowerCase();
  if (!value) return false;
  return /(^|\s)stroke=|(^|\s)fill=|stroke-opacity=|stroke-width=/.test(value);
}

function buildDescription(track) {
  const candidates = [track.desc, track.metaDesc];
  for (const candidate of candidates) {
    const cleaned = cleanText(candidate);
    if (!cleaned || isStyleDescription(cleaned)) continue;
    return cleaned;
  }

  if (track.sourceFile) {
    return `Imported from GPX track ${track.index} (${track.sourceFile})`;
  }
  return `Imported from GPX track ${track.index}`;
}

function buildStops(pathCoords, fromLabel, toLabel, viaHints = []) {
  if (pathCoords.length < 2) return [];
  const first = pathCoords[0];
  const last = pathCoords[pathCoords.length - 1];

  const stopA = {
    stop_name: fromLabel || 'Terminal A',
    latitude: first[1],
    longitude: first[0],
    stop_order: 1,
  };

  const midStops = [];
  const usableVia = (viaHints || [])
    .filter((hint) => isUsableEndpoint(hint))
    .filter((hint) => hint.toLowerCase() !== String(fromLabel || '').toLowerCase())
    .filter((hint) => hint.toLowerCase() !== String(toLabel || '').toLowerCase())
    .slice(0, 4);

  for (let i = 0; i < usableVia.length; i += 1) {
    const fraction = (i + 1) / (usableVia.length + 1);
    const point = samplePathPoint(pathCoords, fraction);
    if (!point) continue;
    midStops.push({
      stop_name: usableVia[i],
      latitude: point[1],
      longitude: point[0],
      stop_order: i + 2,
    });
  }

  const stopB = {
    stop_name: toLabel || (fromLabel ? `${fromLabel} Terminal` : 'Terminal B'),
    latitude: last[1],
    longitude: last[0],
    stop_order: midStops.length + 2,
  };

  return [stopA, ...midStops, stopB];
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

  const cliArgs = process.argv.slice(2);
  const replaceAll = cliArgs.includes(CLEAR_ALL_FLAG);
  const sourceArgs = cliArgs.filter((arg) => arg !== CLEAR_ALL_FLAG);
  const gpxPaths = (sourceArgs.length > 0 ? sourceArgs : [FALLBACK_GPX_PATH]).map((inputPath) =>
    path.resolve(inputPath)
  );

  for (const gpxPath of gpxPaths) {
    if (!fs.existsSync(gpxPath)) {
      throw new Error(`GPX file not found: ${gpxPath}`);
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (replaceAll) {
    await deleteAllRows(supabase, 'bus_route_stops', 'id');
    await deleteAllRows(supabase, 'bus_routes', 'id');
  }

  let totalTracks = 0;
  let imported = 0;
  let skipped = 0;

  for (const gpxPath of gpxPaths) {
    const gpxXml = fs.readFileSync(gpxPath, 'utf8');
    const tracks = parseGpxTracks(gpxXml, gpxPath);
    if (tracks.length === 0) {
      console.warn(`No <trk> entries found in GPX file: ${gpxPath}`);
      continue;
    }

    totalTracks += tracks.length;

    for (const track of tracks) {
      if (!isLikelyBusRoute(track)) {
        skipped += 1;
        continue;
      }

      if (!Array.isArray(track.pathCoords) || track.pathCoords.length < 2) {
        skipped += 1;
        continue;
      }

      const relationId = track.sourceRelationId.split('/').pop() || String(track.index);
      const { name, label, fromLabel, toLabel, ref, viaHints } = makeLabels(track);
      const routeCodeBase = slug(ref || label || name || `BUS-${relationId}`) || `BUS-${relationId}`;
      const routeCode = `${routeCodeBase}-${relationId}`;

      const payload = {
        source_relation_id: track.sourceRelationId,
        route_code: routeCode,
        name,
        label,
        from_label: fromLabel || null,
        to_label: toLabel || null,
        description: buildDescription(track),
        operator: cleanText(track.props.operator),
        network: cleanText(track.props.network),
        fare_base: parseFare(track.props),
        status: 'active',
        path_data: track.pathCoords,
        is_active: true,
      };

      const { data: routeRow, error: routeError } = await supabase
        .from('bus_routes')
        .upsert(payload, { onConflict: 'source_relation_id' })
        .select('id')
        .single();

      if (routeError) {
        console.error(`Route upsert failed (${track.sourceRelationId}): ${routeError.message}`);
        skipped += 1;
        continue;
      }

      const { error: clearStopsError } = await supabase
        .from('bus_route_stops')
        .delete()
        .eq('route_id', routeRow.id);

      if (clearStopsError) {
        console.error(`Stop reset failed (${track.sourceRelationId}): ${clearStopsError.message}`);
        skipped += 1;
        continue;
      }

      const stops = buildStops(track.pathCoords, fromLabel, toLabel, viaHints).map((s) => ({
        route_id: routeRow.id,
        ...s,
      }));

      const { error: stopError } = await supabase
        .from('bus_route_stops')
        .insert(stops);

      if (stopError) {
        console.error(`Stop insert failed (${track.sourceRelationId}): ${stopError.message}`);
        skipped += 1;
        continue;
      }

      imported += 1;
    }
  }

  console.log(`Processed GPX files: ${gpxPaths.length}`);
  console.log(`Total GPX tracks: ${totalTracks}`);
  console.log(`Imported bus routes: ${imported}`);
  console.log(`Skipped tracks: ${skipped}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
