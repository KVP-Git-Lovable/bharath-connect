import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CONFIDENCE_THRESHOLD = 75;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { baselineUrl, attendanceUrl } = await req.json();

    if (!baselineUrl || !attendanceUrl) {
      return new Response(
        JSON.stringify({ error: "Both baselineUrl and attendanceUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ confidence: 0, matched: false, status: "bypassed", reason: "API key not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch both images and convert to base64
    const [baselineRes, attendanceRes] = await Promise.all([
      fetch(baselineUrl),
      fetch(attendanceUrl),
    ]);

    if (!baselineRes.ok || !attendanceRes.ok) {
      console.error("Failed to fetch images", {
        baseline: baselineRes.status,
        attendance: attendanceRes.status,
      });
      return new Response(
        JSON.stringify({ confidence: 0, matched: false, status: "bypassed", reason: "Failed to fetch images" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [baselineBuffer, attendanceBuffer] = await Promise.all([
      baselineRes.arrayBuffer(),
      attendanceRes.arrayBuffer(),
    ]);

    // Use chunked base64 encoding to handle large images without stack overflow
    const toBase64 = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return btoa(binary);
    };

    const baselineB64 = toBase64(baselineBuffer);
    const attendanceB64 = toBase64(attendanceBuffer);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are an EXTREMELY STRICT biometric face verification system used for employee attendance. Your ONLY job is to determine whether two photos show THE EXACT SAME INDIVIDUAL HUMAN.

CRITICAL RULES:
- DEFAULT to NOT MATCHED. Only return high confidence (${CONFIDENCE_THRESHOLD}+) if you are CERTAIN beyond reasonable doubt that both faces belong to the SAME person.
- Compare these specific biometric features carefully: distance between eyes, eye shape and color, nose width and bridge shape, lip shape, jawline contour, ear shape, forehead height, cheekbone structure, chin shape.
- Two DIFFERENT people of the same gender, age range, ethnicity, or with similar hairstyles / glasses / skin tone MUST receive confidence below 40. Surface-level similarity is NOT a match.
- If either image is blurry, dark, partially obscured, shows no clear face, shows multiple faces, or shows the back/side of a head, return confidence 0 and matched=false.
- If you have ANY doubt at all that they might be different people, return confidence below ${CONFIDENCE_THRESHOLD}.
- A FALSE POSITIVE (matching two different people) is a SECURITY BREACH and is FAR WORSE than a false negative.

Respond ONLY with a strict JSON object: {"confidence": <integer 0-100>, "matched": <true|false>, "reason": "<short explanation of biometric comparison>"}
matched MUST be true only if confidence >= ${CONFIDENCE_THRESHOLD}.
No markdown, no code fences, no extra text.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Compare these two face images strictly. Image 1 is the registered profile photo. Image 2 is the attendance selfie just taken. Are they the SAME person? Be strict — do not match different people.",
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${baselineB64}` },
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${attendanceB64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      // On AI errors, return bypassed with matched=false (don't auto-allow)
      return new Response(
        JSON.stringify({ confidence: 0, matched: false, status: "bypassed", reason: "AI gateway error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse the JSON from AI response
    let confidence = 0;
    let matched = false;
    try {
      // Match the outermost { ... } including newlines
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        confidence = parseInt(parsed.confidence) || 0;
        // Apply our threshold strictly, don't trust AI's matched field
        matched = confidence >= CONFIDENCE_THRESHOLD;
      } else {
        console.error("No JSON found in AI response:", content);
        matched = false;
      }
    } catch (parseErr) {
      console.error("Failed to parse AI response:", content, parseErr);
      // On parse failure, don't match
      matched = false;
    }

    console.log("Face verification result:", { confidence, matched, rawContent: content });

    return new Response(
      JSON.stringify({ confidence, matched, status: matched ? "verified" : "failed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-face-match error:", err);
    return new Response(
      JSON.stringify({ confidence: 0, matched: false, status: "bypassed", reason: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
