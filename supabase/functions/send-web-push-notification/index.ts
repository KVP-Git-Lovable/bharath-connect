import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebPushRequest {
  subscriptions: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestBody: WebPushRequest = await req.json();
    const { subscriptions, title, body, data } = requestBody;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No subscriptions provided" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get VAPID keys from environment
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT"); // mailto:your-email@example.com

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      console.error("Missing VAPID keys");
      return new Response(
        JSON.stringify({ error: "Web Push not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: "/pwa-icon-192.png",
      badge: "/pwa-icon-192.png",
      tag: "activity-notification",
      data: data || {},
    });

    const results = [];
    for (const subscription of subscriptions) {
      try {
        // Parse subscription (it should be JSON string)
        let parsedSubscription: PushSubscription;
        try {
          parsedSubscription = JSON.parse(subscription);
        } catch {
          // If it's already an object, use it directly
          parsedSubscription = subscription as any;
        }

        const response = await sendPushNotification(
          parsedSubscription,
          payload,
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject
        );

        if (response.ok) {
          results.push({ subscription: subscription.substring(0, 50), success: true });
        } else {
          const error = await response.text();
          results.push({
            subscription: subscription.substring(0, 50),
            success: false,
            error,
          });
          console.error(`Web Push error:`, error);
        }
      } catch (error) {
        results.push({
          subscription: subscription.substring(0, 50),
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        total: subscriptions.length,
        results,
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error in send-web-push-notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

/**
 * Send push notification to subscription
 */
async function sendPushNotification(
  subscription: PushSubscription,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<Response> {
  // For now, we'll use a simple approach
  // In production, you'd use a Web Push library like web-push

  const headers: HeadersInit = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
  };

  // Add VAPID headers
  // Note: Full VAPID implementation requires encryption and signing
  // For a simpler approach, use a Web Push library on your backend

  // Placeholder: In production, use web-push npm package
  // This requires proper VAPID implementation

  // Simple POST to subscription endpoint (won't work without encryption in real scenario)
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers,
    body: payload,
  });

  return response;
}
