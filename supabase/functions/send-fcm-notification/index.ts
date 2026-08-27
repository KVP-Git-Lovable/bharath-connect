import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FCMRequest {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: FCMRequest = await req.json();
    const { tokens, title, body: messageBody, data } = body;

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ error: "No tokens provided" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get Firebase credentials from environment
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const firebasePrivateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");
    const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");

    if (!firebaseProjectId || !firebasePrivateKey || !firebaseClientEmail) {
      console.error("Missing Firebase credentials");
      return new Response(
        JSON.stringify({ error: "Firebase not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Get FCM access token
    const accessToken = await getFirebaseAccessToken(
      firebaseProjectId,
      firebasePrivateKey,
      firebaseClientEmail
    );

    // Send to each token
    const results = [];
    for (const token of tokens) {
      try {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token,
                notification: {
                  title,
                  body: messageBody,
                },
                data: data || {},
                android: {
                  priority: "high",
                  notification: {
                    click_action: "FLUTTER_NOTIFICATION_CLICK",
                  },
                },
              },
            }),
          }
        );

        if (response.ok) {
          results.push({ token, success: true });
        } else {
          const error = await response.text();
          results.push({ token, success: false, error });
          console.error(`FCM error for token ${token}:`, error);
        }
      } catch (error) {
        results.push({ token, success: false, error: error.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        total: tokens.length,
        results,
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error in send-fcm-notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

/**
 * Get Firebase access token using service account
 */
async function getFirebaseAccessToken(
  projectId: string,
  privateKey: string,
  clientEmail: string
): Promise<string> {
  const key = privateKey.replace(/\\n/g, "\n");

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const headerEncoded = btoa(JSON.stringify(header));
  const payloadEncoded = btoa(JSON.stringify(payload));
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;

  // Sign with private key (requires crypto module)
  const signature = await signJWT(signatureInput, key);
  const jwt = `${signatureInput}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data: any = await response.json();
  return data.access_token;
}

/**
 * Sign JWT using RS256
 */
async function signJWT(input: string, privateKey: string): Promise<string> {
  const keyObject = await importPrivateKey(privateKey);
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyObject, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Import private key for signing
 */
async function importPrivateKey(pem: string) {
  const binaryString = atob(
    pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "")
  );
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
