import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, type, customer, amount, currency, draft } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const context = [
      name && `Opportunity: ${name}`,
      type && `Type: ${type}`,
      customer && `Customer/Account: ${customer}`,
      amount && `Amount: ${currency ?? ""} ${amount}`,
    ].filter(Boolean).join("\n");

    const userPrompt = (draft && draft.trim())
      ? `Opportunity context:\n${context || "(minimal)"}\n\nExisting notes:\n${draft}\n\nExpand into a clear, structured "Requirements Highlights" summary: objective, scope, key deliverables, constraints, success criteria. Keep it concise. Mark any assumption clearly.`
      : `Opportunity context:\n${context || "(minimal)"}\n\nDraft a concise "Requirements Highlights" summary based on the available context: objective, scope, key deliverables, constraints, success criteria. Keep it factual and mark speculation as such.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a B2B sales assistant. Produce a crisp requirements summary in 4-8 short bullets or 2-4 short paragraphs. Return plain text only." },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit reached." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway error", response.status, txt);
      return new Response(JSON.stringify({ error: "Failed to generate" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const details = data.choices?.[0]?.message?.content?.trim() ?? "";
    return new Response(JSON.stringify({ details }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("elaborate-opportunity-requirements error", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
