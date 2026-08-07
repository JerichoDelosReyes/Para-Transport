import { embedText } from "../_shared/embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * embed Edge Function
 *
 * Internal helper -- NOT called by the mobile app. Exists so the local
 * knowledge-base ingestion script (supabase/importers/ingest_knowledge_base.ts,
 * plain Node, not Deno) can reach the same `gte-small` model that ask-jeepie
 * uses in-process, keeping ingestion-time and query-time embeddings in the
 * same vector space.
 *
 * Request body: { text: string }
 * Response:     { embedding: number[] }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const embedding = await embedText(text);

    return new Response(
      JSON.stringify({ embedding }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("embed error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
