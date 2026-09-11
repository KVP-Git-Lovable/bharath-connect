import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Server-side push for a single notification row.
// Called by the database trigger notifications_dispatch_push (pg_net) for rows
// created by the rules engine or scheduled reports. Authenticated with the
// shared secret stored in public.notification_push_config (service-role only).
// FCM + Web Push code is copied verbatim from dispatch-notification so both
// paths behave identically.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-push-secret",
};


/** Build a JWT from the service-account JSON for FCM HTTP v1. */
async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );

  const textEncoder = new TextEncoder();
  const inputData = textEncoder.encode(`${header}.${payload}`);

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    inputData
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get access token: ${err}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}


function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const provided = req.headers.get("x-push-secret") || "";
    const { data: cfg } = await supabase
      .from("notification_push_config")
      .select("trigger_secret")
      .eq("id", true)
      .maybeSingle();
    if (!provided || !cfg?.trigger_secret || !safeEqual(provided, cfg.trigger_secret)) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body: { notification_id?: string } = {};
    try { body = await req.json(); } catch { /* empty */ }
    const id = body.notification_id;
    if (!id) return json({ error: "notification_id required" }, 400);

    const { data: n, error } = await supabase
      .from("notifications")
      .select("id, user_id, title, message, type, related_table, related_id, metadata, delivery_status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!n) return json({ error: "Notification not found" }, 404);

    // Idempotent: never push the same row twice.
    if (["pushed", "no_device", "push_failed", "push_skipped"].includes(n.delivery_status)) {
      return json({ skipped: "already_processed", delivery_status: n.delivery_status });
    }

    const meta = (n.metadata || {}) as Record<string, unknown>;
    if (String(meta.push_to_phone ?? "true").toLowerCase() === "false") {
      await supabase.from("notifications").update({ delivery_status: "push_skipped" }).eq("id", id);
      return json({ skipped: "push_disabled" });
    }

    // Respect the recipient's opt-out for this notification type.
    if (n.type) {
      const { data: pref } = await supabase
        .from("notification_preferences")
        .select("is_enabled")
        .eq("user_id", n.user_id)
        .eq("notification_type", n.type)
        .maybeSingle();
      if (pref && pref.is_enabled === false) {
        await supabase.from("notifications").update({ delivery_status: "push_skipped" }).eq("id", id);
        return json({ skipped: "user_opted_out" });
      }
    }

    const title = n.title || "Notification";
    const message = n.message || "";
    const route = typeof meta.route === "string" ? meta.route : "/";

    // 1) Web Push (iPhone PWA + desktop)
    const web = await sendWebPush(supabase, [n.user_id], {
      title,
      message,
      related_table: n.related_table,
      related_id: n.related_id,
      url: route,
    });

    // 2) FCM (Android app)
    let fcmSent = 0;
    let fcmTokens = 0;
    let fcmNote: string | undefined;
    const fcmKeyJson = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");
    if (!fcmKeyJson) {
      fcmNote = "fcm_not_configured";
    } else {
      const { data: tokens } = await supabase
        .from("push_tokens")
        .select("id, token")
        .eq("user_id", n.user_id);
      fcmTokens = tokens?.length || 0;
      if (fcmTokens > 0) {
        const sa = JSON.parse(fcmKeyJson);
        const accessToken = await getAccessToken(sa);
        const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
        const staleIds: string[] = [];
        for (const t of tokens!) {
          try {
            const res = await fetch(fcmUrl, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                message: {
                  token: t.token,
                  notification: { title, body: message },
                  data: {
                    notification_id: String(n.id),
                    type: String(n.type || ""),
                    route,
                  },
                  android: { priority: "high", notification: { sound: "default", channel_id: "default" } },
                },
              }),
            });
            if (res.ok) fcmSent++;
            else {
              const errBody = await res.text();
              if (errBody.includes("UNREGISTERED") || errBody.includes("NOT_FOUND") || errBody.includes("INVALID_ARGUMENT")) {
                staleIds.push(t.id);
              } else {
                console.error("[notification-push] FCM error:", errBody);
              }
            }
          } catch (e) {
            console.error("[notification-push] FCM fetch error:", e);
          }
        }
        if (staleIds.length) await supabase.from("push_tokens").delete().in("id", staleIds);
      }
    }

    const totalSent = fcmSent + (web.sent || 0);
    const devices = fcmTokens + (web.sent || 0) + (web.failed || 0);
    const status = totalSent > 0 ? "pushed" : devices === 0 ? "no_device" : "push_failed";
    await supabase.from("notifications").update({ delivery_status: status }).eq("id", id);

    return json({ delivery_status: status, fcm_sent: fcmSent, fcm_tokens: fcmTokens, fcm_note: fcmNote, web_push: web });
  } catch (e) {
    console.error("[notification-push] error:", e);
    return json({ error: String(e) }, 500);
  }
});

// ---- Web Push (iPhone PWA + desktop) ---------------------------------------
// Native implementation using Web Crypto only (no npm:web-push, which fails to
// run inside the Deno edge runtime). Implements VAPID (RFC 8292) + aes128gcm
// payload encryption (RFC 8291 / RFC 8188).

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, data as BufferSource);
  return new Uint8Array(sig);
}

// HKDF-Expand (single block, length <= 32)
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const t = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return t.slice(0, length);
}

const TEXT = new TextEncoder();

/**
 * Normalize the VAPID subject. Apple is strict: it must be a bare
 * `mailto:user@domain` or `https://...` with no spaces or angle brackets.
 */
function normalizeVapidSubject(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return "mailto:admin@bharathbuilders.app";
  // Strip angle brackets and internal spaces around the address.
  s = s.replace(/[<>]/g, "").replace(/\s+/g, "");
  if (s.startsWith("mailto:") || s.startsWith("https://") || s.startsWith("http://")) {
    return s;
  }
  // Bare email or domain — assume mailto.
  return `mailto:${s}`;
}

/** Build the ES256 VAPID JWT + return the Authorization header value. */
async function buildVapidAuth(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string
): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const sub = normalizeVapidSubject(subject);


  const pubBytes = b64urlToBytes(vapidPublicKey); // 65 bytes: 0x04 || x || y
  const x = bytesToB64url(pubBytes.slice(1, 33));
  const y = bytesToB64url(pubBytes.slice(33, 65));
  const d = vapidPrivateKey; // already base64url raw 32-byte scalar

  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x, y, d, ext: true };
  const signKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const header = bytesToB64url(TEXT.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    TEXT.encode(
      JSON.stringify({
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub,
      })
    )
  );
  const signingInput = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signKey,
    TEXT.encode(signingInput) as BufferSource
  );
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${vapidPublicKey}`;
}

/** Encrypt the payload using aes128gcm content encoding (RFC 8291/8188). */
async function encryptPayload(
  plaintext: Uint8Array,
  uaPublicB64: string,
  authSecretB64: string
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(uaPublicB64); // 65 bytes
  const authSecret = b64urlToBytes(authSecretB64); // 16 bytes

  // Ephemeral server keypair
  const asKeyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey)); // 65 bytes

  // ECDH shared secret
  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asKeyPair.privateKey, 256)
  );

  // Combine auth_secret + shared secret (RFC 8291)
  const prkCombine = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(TEXT.encode("WebPush: info\0"), uaPublic, asPublicRaw);
  const ikm = await hkdfExpand(prkCombine, keyInfo, 32);

  // Content encryption (RFC 8188)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpand(prk, TEXT.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, TEXT.encode("Content-Encoding: nonce\0"), 12);

  // Plaintext + padding delimiter (0x02 = last record)
  const padded = concatBytes(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      padded as BufferSource
    )
  );

  // aes128gcm header: salt(16) || rs(4) || idlen(1) || keyid(asPublic) || ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const idlen = new Uint8Array([asPublicRaw.length]);
  return concatBytes(salt, rs, idlen, asPublicRaw, ciphertext);
}

async function sendWebPush(
  supabase: any,
  recipientIds: string[],
  payload: { title: string; message: string; related_table?: string | null; related_id?: string | null; url?: string }
): Promise<{ sent: number; failed: number; pruned: number; skipped?: string }> {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@bharathbuilders.app";
  if (!pub || !priv) {
    console.warn("[web-push] VAPID keys not configured — skipping");
    return { sent: 0, failed: 0, pruned: 0, skipped: "vapid_keys_missing" };
  }

  const { data: subs, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", recipientIds);

  if (error) {
    console.error("[web-push] fetch subscriptions failed:", error);
    return { sent: 0, failed: 0, pruned: 0, skipped: "fetch_failed" };
  }
  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const json = TEXT.encode(
    JSON.stringify({
      title: payload.title,
      message: payload.message,
      data: { related_table: payload.related_table, related_id: payload.related_id, url: payload.url || "/" },
    })
  );

  const staleIds: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        const authHeader = await buildVapidAuth(s.endpoint, pub, priv, subject);
        const bodyBytes = await encryptPayload(json, s.p256dh, s.auth);

        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: String(60 * 60 * 24),
            Urgency: "high",
          },
          body: bodyBytes as BodyInit,
        });

        if (res.ok || res.status === 201) {
          sent++;
          supabase
            .from("web_push_subscriptions")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", s.id)
            .then(() => {}, () => {});
        } else {
          failed++;
          const txt = await res.text().catch(() => "");
          if (res.status === 404 || res.status === 410) {
            staleIds.push(s.id);
          } else {
            const host = (() => {
              try {
                return new URL(s.endpoint).host;
              } catch {
                return "unknown";
              }
            })();
            console.warn(`[web-push] send failed ${res.status} to ${host}: ${txt}`);
          }
        }
      } catch (e: any) {
        failed++;
        console.error("[web-push] send threw:", e?.message || String(e));
      }
    })
  );

  if (staleIds.length > 0) {
    await supabase.from("web_push_subscriptions").delete().in("id", staleIds);
  }

  return { sent, failed, pruned: staleIds.length };
}

