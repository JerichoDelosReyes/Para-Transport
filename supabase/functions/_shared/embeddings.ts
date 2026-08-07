// Shared embedding helper for the RAG pipeline (embed + ask-jeepie functions).
//
// Uses Supabase's built-in `gte-small` model, which runs directly inside the
// Edge Runtime -- no external API key, no per-call cost, ~384-dim vectors.
// Both ingestion (via the embed function) and query-time retrieval (in
// ask-jeepie) MUST go through this same helper so vectors land in the same
// embedding space; swapping models later means re-ingesting the whole KB.

// deno-lint-ignore no-explicit-any
declare const Supabase: any;

// deno-lint-ignore no-explicit-any
let session: any = null;

export async function embedText(text: string): Promise<number[]> {
  if (!session) {
    session = new Supabase.ai.Session("gte-small");
  }

  const output = await session.run(text, {
    mean_pool: true,
    normalize: true,
  });

  return Array.from(output as Iterable<number>);
}
