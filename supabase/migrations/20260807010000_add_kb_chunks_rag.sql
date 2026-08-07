-- RAG knowledge base for Jeepie (Para's in-app chatbot).
-- Populated by supabase/importers/ingest_knowledge_base.ts, read by the
-- ask-jeepie Edge Function. Not exposed to the client directly.

create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  source_file text not null,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now()
);

comment on table public.kb_chunks is
  'RAG knowledge base chunks for Jeepie. Re-populated wholesale per source_file by supabase/importers/ingest_knowledge_base.ts. Accessed only by Edge Functions via the service role key.';

-- Lock the table down by default. Only server-side callers (service role,
-- used by Edge Functions) should ever touch this table -- no anon/authenticated
-- policies are defined, so RLS denies everyone else.
alter table public.kb_chunks enable row level security;

-- Cosine-similarity search used by the ask-jeepie Edge Function.
create or replace function public.match_kb_chunks(
  query_embedding extensions.vector(384),
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  source_file text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    kb_chunks.id,
    kb_chunks.content,
    kb_chunks.source_file,
    1 - (kb_chunks.embedding <=> query_embedding) as similarity
  from kb_chunks
  order by kb_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- Postgres functions are callable by PUBLIC by default, and Supabase auto-exposes
-- public-schema functions over PostgREST's /rpc/ endpoint -- without this, anyone
-- with the anon key could call match_kb_chunks directly over REST, skipping the
-- ask-jeepie Edge Function (and its guardrail) entirely. Restrict it to service_role.
revoke execute on function public.match_kb_chunks(extensions.vector, int) from public, anon, authenticated;
grant execute on function public.match_kb_chunks(extensions.vector, int) to service_role;

-- Indexing note (see cost/latency discussion): the initial KB is ~9 files with
-- a few dozen "## " chunks total. At that size a sequential scan is already
-- sub-millisecond, and an IVFFlat/HNSW index built over so few rows would hurt
-- recall more than it would help latency, so no index is created yet.
--
-- Once kb_chunks grows into the low thousands of rows, add:
--
--   create index kb_chunks_embedding_hnsw_idx
--     on public.kb_chunks
--     using hnsw (embedding extensions.vector_cosine_ops);
--
-- Prefer HNSW over IVFFlat here: HNSW doesn't need a `lists` parameter tuned to
-- row count (IVFFlat's quality depends on picking `lists` relative to table
-- size and rebuilding it as the table grows), and it gives better recall/query
-- latency for a table that's read constantly (every non-FAQ-matched chat
-- message) but written rarely (only on KB re-ingestion).
