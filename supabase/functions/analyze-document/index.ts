/**
 * Minimal OpenAI proxy — keeps the API key server-side only.
 * All prompts, parsing, and post-processing live in src/lib/ (frontend).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_MAX_TOKENS = 16384;
const OPENAI_MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 520, 521, 522, 524]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Turns raw OpenAI/Cloudflare bodies into short, readable errors. */
function formatOpenAiError(status: number, body: string): string {
  const trimmed = body.trim();
  const isHtml = trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html");

  if (isHtml) {
    const codeMatch = trimmed.match(/Error code (\d{3})/i);
    const code = codeMatch?.[1] ?? String(status);
    if (status === 520 || code === "520") {
      return "OpenAI temporaneamente non disponibile (errore Cloudflare 520). Riprova tra qualche minuto.";
    }
    if (status === 429 || code === "429") {
      return "OpenAI: troppe richieste (429). Attendi qualche secondo e riprova.";
    }
    return `OpenAI non raggiungibile (errore ${code}). Riprova tra qualche minuto.`;
  }

  try {
    const json = JSON.parse(trimmed) as { error?: { message?: string; type?: string } };
    const msg = json.error?.message?.trim();
    if (msg) return `OpenAI: ${msg}`;
  } catch {
    // not JSON
  }

  if (trimmed.length > 280) return `OpenAI errore ${status}: ${trimmed.slice(0, 280)}…`;
  return `OpenAI errore ${status}: ${trimmed || "risposta vuota"}`;
}

async function openaiChat(
  openaiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string,
  maxTokens: number,
  temperature = 0.2,
): Promise<string> {
  let lastError = "OpenAI non disponibile";

  for (let attempt = 0; attempt < OPENAI_MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      lastError = formatOpenAiError(res.status, body);
      if (RETRYABLE_STATUSES.has(res.status) && attempt < OPENAI_MAX_RETRIES - 1) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error(lastError);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new Error(
        "Risposta OpenAI troncata (limite token). Riduci il sottoalbero o rigenera per parti più piccole.",
      );
    }
    return choice?.message?.content ?? "{}";
  }

  throw new Error(lastError);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const { systemPrompt, userMessage, model, maxTokens } = body as {
      systemPrompt?: string;
      userMessage?: string;
      model?: string;
      maxTokens?: number;
    };

    if (!systemPrompt?.trim() || !userMessage?.trim()) {
      return new Response(
        JSON.stringify({ error: "systemPrompt and userMessage are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resolvedModel = typeof model === "string" && model.trim() ? model.trim() : "gpt-4o";
    const resolvedMaxTokens = typeof maxTokens === "number" && maxTokens > 0
      ? Math.min(maxTokens, DEFAULT_MAX_TOKENS)
      : DEFAULT_MAX_TOKENS;

    const content = await openaiChat(
      openaiKey,
      systemPrompt.trim(),
      userMessage.trim(),
      resolvedModel,
      resolvedMaxTokens,
    );

    return new Response(
      JSON.stringify({ content }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
