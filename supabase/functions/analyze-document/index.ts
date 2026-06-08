/**
 * Thin OpenAI proxy — prompts and post-processing live in src/lib/ (frontend).
 * Deploy once; only redeploy if this proxy logic changes.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function sanitizeJsonRegex(raw: string): string {
  return raw.replace(/\\([wWdDsSpPhHvV])/g, "\\\\$1");
}

const MAX_COMPLETION_TOKENS = 16384;

async function openaiChat(
  openaiKey: string,
  systemPrompt: string,
  userMessage: string,
  temperature = 0.2,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature,
      max_tokens: MAX_COMPLETION_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error(
      "Risposta OpenAI troncata (limite token). Riduci il sottoalbero o rigenera per parti più piccole.",
    );
  }
  return choice?.message?.content ?? "{}";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const { systemPrompt, userMessage } = body as {
      systemPrompt?: string;
      userMessage?: string;
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

    const rawContent = await openaiChat(openaiKey, systemPrompt.trim(), userMessage.trim());
    let parsed: { rows: unknown[] };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      try {
        parsed = JSON.parse(sanitizeJsonRegex(rawContent));
      } catch {
        throw new Error(`Invalid JSON from OpenAI: ${rawContent.slice(0, 200)}`);
      }
    }

    if (!Array.isArray(parsed.rows)) {
      throw new Error(`Unexpected response shape: ${rawContent.slice(0, 200)}`);
    }

    return new Response(
      JSON.stringify({ rows: parsed.rows }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
