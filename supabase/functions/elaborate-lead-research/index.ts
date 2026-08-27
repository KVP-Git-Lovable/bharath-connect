import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, designation, company, industry, website, draft } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const context = [
      name && `Contact Name: ${name}`,
      designation && `Designation: ${designation}`,
      company && `Company: ${company}`,
      industry && `Industry: ${industry}`,
      website && `Website: ${website}`,
    ].filter(Boolean).join("\n");

    const userPrompt = (draft && draft.trim())
      ? `Lead context:\n${context || "(minimal context)"}\n\nExisting research notes:\n${draft}\n\nElaborate and expand these notes into a well-structured research summary covering company overview, likely size/scale, industry context, potential pain points, and any relevant recent-news angle. Keep it factual and clearly mark speculation as such.`
      : `Lead context:\n${context || "(minimal context)"}\n\nWrite a concise research summary about this lead/company covering: company overview, likely size/scale, industry context, potential pain points, and a possible outreach angle. Keep it factual and clearly mark speculation as such.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a sales research assistant. Produce clear, professional pre-call research on a lead/company in 4-8 short bullet points or 2-4 short paragraphs. Never fabricate specific facts (names, funding amounts, dates); mark unknowns as assumptions. Return plain text only, no markdown headers.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Please try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway error", response.status, txt);
      return new Response(JSON.stringify({ error: "Failed to generate research" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const details = data.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ details }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("elaborate-lead-research error", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
