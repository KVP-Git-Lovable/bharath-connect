import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DispatchPayload {
  recipient_ids?: string[];
  broadcast_all_active?: boolean;
  exclude_user_id?: string;
  // Resolve recipients server-side as the actor's reporting manager + all
  // admins (used for leave / regularization requests). Bypasses client RLS so
  // admins are never dropped.
  notify_actor_chain?: boolean;
  actor_user_id?: string;
  title: string;
  message: string;
  type?: string;
  related_table?: string;
  related_id?: string;
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as DispatchPayload;
    const { title, message, type, related_table, related_id } = body;

    if (!title || !message) {
      return new Response(
        JSON.stringify({ error: "Missing title or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const shouldBroadcastAttendance =
      related_table === "attendance" &&
      type === "attendance" &&
      (title.startsWith("Check-In - ") || title.startsWith("Day End - "));

    let recipient_ids: string[] = [];
    if (body.broadcast_all_active || shouldBroadcastAttendance) {
      const { data: activeUsers, error: activeErr } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("is_active", true);

      if (activeErr) {
        console.error("[dispatch] Failed to resolve active broadcast recipients:", activeErr);
        return new Response(
          JSON.stringify({ error: "Failed to resolve active recipients" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const attendanceActorName = shouldBroadcastAttendance
        ? title.replace(/^Check-In - |^Day End - /, "").trim()
        : "";
      const inferredActorId = attendanceActorName
        ? (activeUsers || []).find((u: any) => (u.full_name || "").trim() === attendanceActorName)?.id
        : undefined;
      const excludedUserId = body.exclude_user_id || inferredActorId;

      recipient_ids = (activeUsers || [])
        .map((u: any) => u.id as string)
        .filter((id) => id !== excludedUserId);
    } else if (body.notify_actor_chain && body.actor_user_id) {
      // Resolve reporting manager + all admins server-side (RLS-safe).
      const [{ data: actor }, { data: admins, error: adminErr }] = await Promise.all([
        supabase
          .from("users")
          .select("reporting_manager_id")
          .eq("id", body.actor_user_id)
          .maybeSingle(),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);

      if (adminErr) {
        console.error("[dispatch] Failed to resolve admins for actor chain:", adminErr);
      }

      const set = new Set<string>();
      if (actor?.reporting_manager_id) set.add(actor.reporting_manager_id as string);
      (admins || []).forEach((a: any) => set.add(a.user_id as string));
      set.delete(body.actor_user_id);
      recipient_ids = Array.from(set);
    } else if (Array.isArray(body.recipient_ids)) {
      recipient_ids = body.recipient_ids;
    }

    recipient_ids = Array.from(new Set(recipient_ids.filter(Boolean)));
    if (recipient_ids.length === 0) {
      console.warn("[dispatch] No recipients resolved — returning 200 no-op", {
        notify_actor_chain: !!body.notify_actor_chain,
        actor_user_id: body.actor_user_id,
        broadcast: !!body.broadcast_all_active,
        title,
      });
      return new Response(
        JSON.stringify({ notifications_inserted: 0, recipients: 0, reason: "no_recipients_resolved" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[dispatch] Recipients: ${recipient_ids.length}, broadcast_all_active: ${!!body.broadcast_all_active}, attendance_auto_broadcast: ${shouldBroadcastAttendance}, title: "${title}"`);

    // 1) Insert in-app notification rows (bell icon)
    const rows = recipient_ids.map((uid) => ({
      user_id: uid,
      title,
      message,
      type: type || "info",
      related_table: related_table || null,
      related_id: related_id || null,
    }));

    const { error: insertErr } = await supabase.from("notifications").insert(rows);
    if (insertErr) {
      console.error("[dispatch] Failed to insert notifications:", insertErr);
    } else {
      console.log(`[dispatch] Inserted ${rows.length} notification rows`);
    }

    // 2) Send Web Push (iPhone PWA + desktop browsers) — runs in parallel with FCM
    const webPushResult = await sendWebPush(supabase, recipient_ids, {
      title,
      message,
      related_table,
      related_id,
    });

    // 3) Send FCM push notifications (Android APK)
    const fcmKeyJson = Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");
    if (!fcmKeyJson) {
      console.warn("[dispatch] FCM_SERVICE_ACCOUNT_KEY not configured — skipping FCM");
      return new Response(
        JSON.stringify({ notifications_inserted: rows.length, fcm_skipped: true, web_push: webPushResult }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccount = JSON.parse(fcmKeyJson);
    const projectId = serviceAccount.project_id;

    // Purge tokens not seen in 60+ days (stale / uninstalled devices)
    try {
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { error: purgeErr, count } = await supabase
        .from("push_tokens")
        .delete({ count: "exact" })
        .lt("last_seen_at", cutoff);
      if (purgeErr) console.warn("[dispatch] Stale purge failed:", purgeErr);
      else if (count) console.log(`[dispatch] Purged ${count} stale tokens`);
    } catch (e) {
      console.warn("[dispatch] Stale purge threw:", e);
    }

    // Fetch all tokens for all recipients in one query
    const { data: tokens, error: tokErr } = await supabase
      .from("push_tokens")
      .select("id, user_id, token")
      .in("user_id", recipient_ids);

    if (tokErr) {
      console.error("[dispatch] Error fetching push tokens:", tokErr);
      return new Response(
        JSON.stringify({ notifications_inserted: rows.length, push_error: "token_fetch_failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log("[dispatch] No push tokens found for any recipient");
      return new Response(
        JSON.stringify({ notifications_inserted: rows.length, push_sent: 0, push_tokens_found: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[dispatch] Found ${tokens.length} push tokens for ${recipient_ids.length} recipients`);

    // Diagnostic: which recipients have NO registered Android token? These users
    // will only see the in-app bell, not a system banner, until they reopen the
    // (current) APK so its FCM token re-registers.
    const usersWithTokens = new Set(tokens.map((t: any) => t.user_id));
    const recipientsWithoutTokens = recipient_ids.filter((id) => !usersWithTokens.has(id));
    if (recipientsWithoutTokens.length > 0) {
      console.warn(`[dispatch] ${recipientsWithoutTokens.length} recipient(s) have NO Android push token:`, recipientsWithoutTokens);
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken(serviceAccount);
    } catch (e) {
      console.error("[dispatch] FCM auth failed:", e);
      return new Response(
        JSON.stringify({ notifications_inserted: rows.length, push_error: "fcm_auth_failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    let sent = 0;
    const staleIds: string[] = [];

    for (const t of tokens) {
      try {
        const res = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title, body: message },
              android: {
                priority: "high",
                notification: {
                  sound: "default",
                  channel_id: "default",
                },
              },
            },
          }),
        });

        if (res.ok) {
          sent++;
          console.log(`[dispatch] FCM sent OK to user ${t.user_id}`);
        } else {
          const errBody = await res.text();
          console.error(`[dispatch] FCM error for user ${t.user_id}:`, errBody);
          if (errBody.includes("UNREGISTERED") || errBody.includes("NOT_FOUND") || errBody.includes("INVALID_ARGUMENT")) {
            staleIds.push(t.id);
          }
        }
      } catch (e) {
        console.error(`[dispatch] FCM fetch error for user ${t.user_id}:`, e);
      }
    }

    // Clean up stale tokens
    if (staleIds.length > 0) {
      await supabase.from("push_tokens").delete().in("id", staleIds);
      console.log(`[dispatch] Removed ${staleIds.length} stale tokens`);
    }

    const result = {
      notifications_inserted: rows.length,
      push_tokens_found: tokens.length,
      push_sent: sent,
      push_stale_cleaned: staleIds.length,
      recipients_without_token: recipientsWithoutTokens.length,
      web_push: webPushResult,
    };
    console.log("[dispatch] Result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[dispatch] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
  payload: { title: string; message: string; related_table?: string | null; related_id?: string | null }
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
      data: { related_table: payload.related_table, related_id: payload.related_id, url: "/" },
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
