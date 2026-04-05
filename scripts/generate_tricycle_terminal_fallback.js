#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_GPX_PATH = 'E:/Downloads/Tricycle Terminal.gpx';
const DEFAULT_OUTPUT_PATH = 'data/tricycle_terminals_fallback.ts';

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
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
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

function parseWaypointsFromGpx(gpxXml) {
  const rows = [];
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
    const descRaw = extractTagRaw(body, 'desc');
    const descTags = parseDescTags(descRaw);

    const candidateName = cleanText(name) || cleanText(descTags.name) || `Tricycle Terminal ${index + 1}`;
    const bestName = isOsmObjectLabel(candidateName)
      ? `Tricycle Terminal ${index + 1}`
      : candidateName;
    const bestCity = cleanText(descTags['addr:city']) || null;

    rows.push({
      id: `tric-${slug(bestName) || 'terminal'}-${String(index + 1).padStart(3, '0')}`,
      name: bestName,
      city: bestCity,
      latitude: Number(latitude.toFixed(7)),
      longitude: Number(longitude.toFixed(7)),
    });

    index += 1;
  }

  return rows;
}

function dedupeRows(rows) {
  const deduped = new Map();
  for (const row of rows) {
    const key = `${row.name.toLowerCase()}|${row.latitude.toFixed(5)}|${row.longitude.toFixed(5)}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

function buildOutput(rows) {
  return [
    'export type TricycleTerminalFallback = {',
    '  id: string;',
    '  name: string;',
    '  city?: string | null;',
    '  latitude: number;',
    '  longitude: number;',
    '};',
    '',
    `const TRICYCLE_TERMINALS_FALLBACK: TricycleTerminalFallback[] = ${JSON.stringify(rows, null, 2)};`,
    '',
    'export default TRICYCLE_TERMINALS_FALLBACK;',
    '',
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const gpxPath = args[0] || DEFAULT_GPX_PATH;
  const outputPath = args[1] || DEFAULT_OUTPUT_PATH;

  const resolvedGpxPath = path.resolve(gpxPath);
  const resolvedOutputPath = path.resolve(outputPath);

  if (!fs.existsSync(resolvedGpxPath)) {
    throw new Error(`GPX file not found: ${resolvedGpxPath}`);
  }

  const xml = fs.readFileSync(resolvedGpxPath, 'utf8');
  const parsedRows = parseWaypointsFromGpx(xml);
  const rows = dedupeRows(parsedRows);

  if (rows.length === 0) {
    throw new Error('No waypoints were parsed from GPX.');
  }

  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, buildOutput(rows), 'utf8');

  console.log(`[generate-tricycle-fallback] Input: ${resolvedGpxPath}`);
  console.log(`[generate-tricycle-fallback] Output: ${resolvedOutputPath}`);
  console.log(`[generate-tricycle-fallback] Parsed: ${parsedRows.length}`);
  console.log(`[generate-tricycle-fallback] Deduped: ${rows.length}`);
}

main();
