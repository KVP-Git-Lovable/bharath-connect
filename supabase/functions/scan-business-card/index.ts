import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface CardData {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not set" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const imageUrl: string | undefined = body?.image_url;
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "image_url is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Extract the contact details from this business card. Respond with ONLY a valid JSON object with these keys (use empty string if not present): {"name":"","title":"","company":"","email":"","phone":"","website":"","address":""}. Do not wrap in markdown.`;

    const gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!gwRes.ok) {
      const errText = await gwRes.text();
      console.error("Gateway error:", gwRes.status, errText);
      return new Response(
        JSON.stringify({ error: "AI request failed", status: gwRes.status, details: errText }),
        { status: gwRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const gw = await gwRes.json();
    const text = gw?.choices?.[0]?.message?.content ?? "{}";
    let parsed: CardData = {};
    try {
      parsed = typeof text === "string" ? JSON.parse(text) : text;
    } catch {
      const m = String(text).match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    return new Response(JSON.stringify({ data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-business-card error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
