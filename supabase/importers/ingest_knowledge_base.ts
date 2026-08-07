#!/usr/bin/env -S npx tsx
// One-off local script: chunk knowledge_base/*.txt by "## " headers, embed each
// chunk via the `embed` Edge Function (same gte-small model ask-jeepie uses at
// query time), and upsert into kb_chunks.
//
// Run after editing any file in knowledge_base/:
//   npm run kb:ingest

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(envPath: string) {
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

loadDotEnv(path.resolve(__dirname, '../../.env'));

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const KB_DIR = path.resolve(__dirname, '../../knowledge_base');

// Safety net only -- none of the current knowledge_base/*.txt sections are
// anywhere near this size. If a future "## " section grows past this, split
// it further on paragraph boundaries instead of embedding one giant chunk.
const MAX_CHUNK_CHARS = 1500;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function splitOversizedChunk(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const paragraphs = text.split(/\n\n+/);
  const parts: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > MAX_CHUNK_CHARS && current) {
      parts.push(current.trim());
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts;
}

function chunkFile(content: string): string[] {
  // Each "## " header starts a new self-contained chunk; keep the header text
  // itself in the chunk since it names the sub-topic.
  const sections = content
    .split(/\n(?=##\s)/g)
    .map((s) => s.trim())
    .filter(Boolean);

  return sections.flatMap(splitOversizedChunk);
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`embed function failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.embedding)) {
    throw new Error('embed function returned no embedding array');
  }
  return data.embedding;
}

async function ingestFile(fileName: string) {
  const filePath = path.join(KB_DIR, fileName);
  const content = fs.readFileSync(filePath, 'utf8');
  const chunks = chunkFile(content);

  console.log(`\n${fileName}: ${chunks.length} chunk(s)`);

  // Re-ingest = delete-then-insert for this source_file. Chunk boundaries can
  // shift between edits, so there's no stable per-chunk key to upsert against --
  // wiping and re-inserting per file is simpler and always correct.
  const { error: deleteError } = await supabase
    .from('kb_chunks')
    .delete()
    .eq('source_file', fileName);
  if (deleteError) {
    throw new Error(`Failed to clear old chunks for ${fileName}: ${deleteError.message}`);
  }

  const rows: Array<{ content: string; source_file: string; embedding: number[] }> = [];
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`  embedding chunk ${i + 1}/${chunks.length}...\r`);
    const embedding = await embed(chunks[i]);
    rows.push({ content: chunks[i], source_file: fileName, embedding });
  }
  console.log(`  embedded ${chunks.length} chunk(s).            `);

  const { error: insertError } = await supabase.from('kb_chunks').insert(rows);
  if (insertError) {
    throw new Error(`Failed to insert chunks for ${fileName}: ${insertError.message}`);
  }

  console.log(`  inserted ${rows.length} row(s) into kb_chunks.`);
}

async function main() {
  if (!fs.existsSync(KB_DIR)) {
    console.error(`Knowledge base directory not found: ${KB_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(KB_DIR).filter((f) => f.endsWith('.txt'));
  if (files.length === 0) {
    console.error(`No .txt files found in ${KB_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} knowledge base file(s) in ${KB_DIR}`);

  for (const file of files) {
    await ingestFile(file);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
