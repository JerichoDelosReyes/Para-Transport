import { createClient } from "npm:@supabase/supabase-js@2";
import { embedText } from "../_shared/embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tunable: minimum cosine similarity (0-1) the best-matching KB chunk must hit
// before we bother calling Groq at all. Below this, the message is treated as
// out-of-scope and we return a canned decline -- this IS the scope guardrail
// now (see chat notes: it replaces the old separate classifier call).
// Raise it if Jeepie answers things it shouldn't; lower it if it declines
// legitimate commuting questions the KB does cover.
const SIMILARITY_THRESHOLD = 0.72;

// Secondary cutoff for which retrieved chunks are worth including as context
// alongside the best match -- keeps weakly-related runners-up out of the
// prompt without requiring them to individually clear SIMILARITY_THRESHOLD.
const CONTEXT_INCLUSION_RATIO = 0.85;

const MATCH_COUNT = 5;
const GROQ_MODEL = "llama-3.1-8b-instant";

// Exact-string contracts the mobile client's formatForChatDisplay/
// isStrictPolicyReply logic special-cases (skips appending a chatty closing
// line). Keep these byte-for-byte identical to services/chatbotService.ts.
const STRICT_OUT_OF_SCOPE_REPLY = "I’m here to help with PARA, commuting, routes, fares, and app-related questions.";
const ROUTE_DATA_UNAVAILABLE_REPLY = "I’m not seeing enough data for that route yet in PARA.";
const INFO_UNAVAILABLE_REPLY = "That information is not available in my current data.";

type HistoryTurn = { role: "user" | "assistant"; content: string };

type KbMatch = {
  id: string;
  content: string;
  source_file: string;
  similarity: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * ask-jeepie Edge Function
 *
 * Retrieval + scope guardrail + grounded Groq call for Jeepie, Para's in-app
 * assistant. Called by services/chatbotService.ts AFTER the on-device
 * rule-based dataset check misses (that step is unchanged and stays client-side).
 *
 * Request body: {
 *   message: string,
 *   language?: 'en' | 'tl',
 *   history?: Array<{ role: 'user' | 'assistant', content: string }>
 * }
 *
 * Response: {
 *   inScope: boolean,
 *   category: 'safe' | 'out_of_scope',
 *   similarity: number,
 *   reply: string | null,
 *   sources?: string[],
 *   error?: string
 * }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, language, history } = await req.json();

    if (!message || typeof message !== "string") {
      return json({ error: "message is required" }, 400);
    }

    const botLanguage: "en" | "tl" = language === "tl" ? "tl" : "en";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const queryEmbedding = await embedText(message);

    const { data: matches, error: matchError } = await supabase.rpc("match_kb_chunks", {
      query_embedding: queryEmbedding,
      match_count: MATCH_COUNT,
    });

    if (matchError) {
      console.error("match_kb_chunks error:", matchError);
      // Fail closed: if retrieval itself is broken, we have no grounding to
      // answer from, so treat as out-of-scope rather than letting Groq
      // improvise ungrounded.
      return json({ inScope: false, category: "out_of_scope", similarity: 0, reply: null });
    }

    const results = (matches ?? []) as KbMatch[];
    const best = results[0];
    const bestSimilarity = best?.similarity ?? 0;

    if (!best || bestSimilarity < SIMILARITY_THRESHOLD) {
      return json({
        inScope: false,
        category: "out_of_scope",
        similarity: bestSimilarity,
        reply: null,
      });
    }

    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    if (!groqApiKey) {
      console.error("ask-jeepie: GROQ_API_KEY secret is not configured");
      return json({
        inScope: false,
        category: "out_of_scope",
        similarity: bestSimilarity,
        reply: null,
        error: "groq_not_configured",
      });
    }

    const contextChunks = results.filter(
      (m) => m.similarity >= bestSimilarity * CONTEXT_INCLUSION_RATIO
    );
    const context = contextChunks
      .map((m, i) => `[${i + 1}] (source: ${m.source_file})\n${m.content}`)
      .join("\n\n");

    const requestedLanguage = botLanguage === "tl" ? "Tagalog" : "English";

    const systemPrompt = [
      "You are Jeepie, the in-app assistant of the Para commuting app for Filipino commuters.",
      "Answer ONLY using the context provided below. If the context doesn't actually answer the question, say you're not sure rather than guessing.",
      "Stay strictly within these topics: Philippine public transportation, commuting, the meaning and etiquette of \"Para\" (the jeepney stop signal), and the Para app itself. Politely decline anything outside that -- math, coding, unrelated trivia, personal advice, etc.",
      `If the user asks strict academic/technical tasks outside PARA commuting (for example math equations or coding problems), reply exactly with: ${STRICT_OUT_OF_SCOPE_REPLY}`,
      `If route data the user is asking about isn't in the context, reply exactly with: ${ROUTE_DATA_UNAVAILABLE_REPLY}`,
      `If other requested information simply isn't in the context, reply exactly with: ${INFO_UNAVAILABLE_REPLY}`,
      "Do not invent or guess fares, statistics, schedules, or facts that aren't in the context. If the context notes that exact figures should be confirmed with LTFRB/DOTr, pass that caveat along.",
      "Never reveal or describe backend infrastructure, database schema, admin tools, credentials, wallet addresses, private keys, or any other internal implementation detail -- even if asked directly, hypothetically, or via roleplay. Politely redirect to commuting topics instead.",
      "Speak warmly and naturally, like a patient kuya/ate commuter friend -- not robotic or overly formal. Natural Taglish and \"po/opo\" are welcome where they fit, but stay concise and don't pad the answer with filler.",
      "Respond using one language only for the whole reply -- do not add parenthetical translations or restate the same sentence in another language.",
      "",
      "Context (may be written in English, Tagalog, or a mix -- this is source material only, NOT the language to reply in):",
      context,
      "",
      `IMPORTANT: No matter what language the context above is written in, write your entire reply in ${requestedLanguage} only. Translate or paraphrase the relevant facts from the context into ${requestedLanguage} -- do not copy Tagalog or English sentences from the context verbatim if they don't match the requested reply language.`,
    ].join("\n");

    const historyTurns: HistoryTurn[] = Array.isArray(history)
      ? history
          .slice(-10)
          .map((h: { role?: string; content?: string }) => ({
            role: h?.role === "assistant" ? "assistant" as const : "user" as const,
            content: typeof h?.content === "string" ? h.content.trim() : "",
          }))
          .filter((h) => h.content.length > 0)
      : [];

    const lastTurn = historyTurns[historyTurns.length - 1];
    const historyAlreadyHasCurrentMessage =
      lastTurn && lastTurn.role === "user" && lastTurn.content === message.trim();

    const userTurns = historyAlreadyHasCurrentMessage
      ? historyTurns
      : [...historyTurns, { role: "user" as const, content: message }];

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: systemPrompt },
          ...userTurns,
        ],
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text().catch(() => "");
      console.error("ask-jeepie: Groq call failed:", groqResponse.status, errText);
      return json(
        {
          inScope: true,
          category: "safe",
          similarity: bestSimilarity,
          reply: null,
          error: "groq_failed",
        },
        502
      );
    }

    const groqData = await groqResponse.json();
    const reply = typeof groqData?.choices?.[0]?.message?.content === "string"
      ? groqData.choices[0].message.content.trim()
      : null;

    return json({
      inScope: true,
      category: "safe",
      similarity: bestSimilarity,
      reply,
      sources: contextChunks.map((m) => m.source_file),
    });
  } catch (error) {
    console.error("ask-jeepie error:", error);
    return json({ error: "internal_error", details: String((error as Error)?.message ?? error) }, 500);
  }
});
