// APNs PushKit (VoIP) delivery for iOS + FCM high-priority data message for
// Android. Both are raw provider APIs — deliberately NOT the Expo push
// pipeline family-notifier uses, because Expo's push service does not
// support the VoIP push type CallKit requires to wake a killed/backgrounded
// app and trigger displayIncomingCall() natively.

// recipientName is per-DEVICE (one specific member's own token), unlike
// RingPayload.memberNames below which is the whole batch of everyone this
// reminder rings — the spoken greeting needs to address the actual person
// holding THIS device, not read out the full target list.
interface VoipTarget { token: string; platform: string; recipientName?: string }
interface RingPayload {
  callerName: string;
  itemType: 'chore' | 'event';
  itemId: string;
  dueAtIso: string;
  memberNames: string[];
  // Read aloud after the main reminder sentence when present — a
  // medication chore's dosage instructions, an event's location/notes.
  notes?: string;
}

// ─── iOS: APNs PushKit via JWT (ES256) provider auth ──────────────────────────
// Reuses one signed JWT for up to ~55 minutes (Apple's token lifetime cap is
// 60 min) instead of re-signing per request.
let cachedJwt: { token: string; expiresAt: number } | null = null;

async function getApnsJwt(): Promise<string | null> {
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const keyId  = Deno.env.get('APNS_KEY_ID');
  const pkPem  = Deno.env.get('APNS_PRIVATE_KEY');
  if (!teamId || !keyId || !pkPem) return null; // cert not configured yet

  if (cachedJwt && cachedJwt.expiresAt > Date.now() + 60_000) return cachedJwt.token;

  const header = { alg: 'ES256', kid: keyId };
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
  const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signingInput = `${enc(header)}.${enc(payload)}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pkPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${signingInput}.${sigB64}`;

  cachedJwt = { token: jwt, expiresAt: Date.now() + 55 * 60_000 };
  return jwt;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function sendApnsVoip(token: string, payload: RingPayload, recipientName?: string): Promise<{ ok: boolean; error?: string }> {
  const jwt = await getApnsJwt();
  const topic = Deno.env.get('APNS_TOPIC');
  if (!jwt || !topic) return { ok: false, error: 'APNs VoIP not configured' };

  // A device's VoIP token is only valid against the APNs environment its
  // build was signed for — a debug/dev build (npx expo run:ios, TestFlight
  // internal, Xcode-run) registers a SANDBOX token; only an App
  // Store/production-signed build gets a token the PRODUCTION gateway
  // recognizes. Sending a sandbox token to production (or vice versa)
  // returns "BadDeviceToken" with no other indication anything is wrong —
  // this silently broke every call reminder during dev-build testing until
  // traced here. APNS_ENVIRONMENT defaults to sandbox since that's what
  // `expo run:ios` device builds actually need; set it to "production" once
  // shipping a real TestFlight/App Store build.
  const isProduction = Deno.env.get('APNS_ENVIRONMENT') === 'production';
  const url = `https://${isProduction ? 'api' : 'api.sandbox'}.push.apple.com/3/device/${token}`;
  const body = JSON.stringify({
    aps: { 'content-available': 1 },
    callerName: payload.callerName,
    itemType: payload.itemType,
    itemId: payload.itemId,
    dueAtIso: payload.dueAtIso,
    ...(recipientName ? { recipientName } : {}),
    ...(payload.notes ? { notes: payload.notes } : {}),
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${jwt}`,
        'apns-topic': topic,
        'apns-push-type': 'voip',
        'apns-priority': '10',
        'apns-expiration': '0',
      },
      body,
    });
    if (!res.ok) return { ok: false, error: `APNs HTTP ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─── Android: FCM V1 API (data-only, high-priority) ───────────────────────────
// The Legacy HTTP API (server key, key=... auth) was deprecated 2024-06-20
// and disabled by default on new Firebase projects — V1 is the only
// current path, and needs an OAuth2 bearer token signed with a service
// account, not a static key. A data-only (no "notification" block)
// high-priority message wakes the app in the background so its own
// ConnectionService/foreground-service code shows the ringing call UI —
// same "we control the UI, not the OS notification tray" shape as
// PushKit on iOS.

interface ServiceAccount { client_email: string; private_key: string; project_id: string }

let cachedFcmToken: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(): Promise<{ token: string; projectId: string } | null> {
  const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!saJson) return null;

  let sa: ServiceAccount;
  try { sa = JSON.parse(saJson); } catch { return null; }

  if (cachedFcmToken && cachedFcmToken.expiresAt > Date.now() + 60_000) {
    return { token: cachedFcmToken.token, projectId: sa.project_id };
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signingInput = `${enc(header)}.${enc(claims)}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) return null;
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) return null;

  cachedFcmToken = { token: tokenJson.access_token, expiresAt: Date.now() + (tokenJson.expires_in ?? 3600) * 1000 };
  return { token: tokenJson.access_token, projectId: sa.project_id };
}

async function sendFcmDataMessage(token: string, payload: RingPayload, recipientName?: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await getFcmAccessToken();
  if (!auth) return { ok: false, error: 'FCM not configured' };

  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          android: { priority: 'high' },
          data: {
            type: 'call_reminder',
            callerName: payload.callerName,
            itemType: payload.itemType,
            itemId: payload.itemId,
            dueAtIso: payload.dueAtIso,
            ...(recipientName ? { recipientName } : {}),
            ...(payload.notes ? { notes: payload.notes } : {}),
          },
        },
      }),
    });
    if (!res.ok) return { ok: false, error: `FCM HTTP ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function sendVoipPush(
  targets: VoipTarget[],
  payload: RingPayload,
): Promise<{ sent: number; failed: number; skipped: number; errors: string[] }> {
  if (targets.length === 0) return { sent: 0, failed: 0, skipped: 0, errors: ['No VoIP tokens registered'] };

  let sent = 0, failed = 0, skipped = 0;
  const errors: string[] = [];

  for (const t of targets) {
    const result = t.platform === 'ios'
      ? await sendApnsVoip(t.token, payload, t.recipientName)
      : await sendFcmDataMessage(t.token, payload, t.recipientName);

    // Was silent on both success and failure except via the returned
    // `errors` array — invisible unless the caller happened to win the
    // race against the next cron tick to read the HTTP response before
    // the log row claimed it, which repeated live testing showed is
    // effectively never (the per-minute cron always wins). Logging here
    // instead makes the actual APNs/FCM result visible in the dashboard's
    // function logs regardless of timing.
    if (result.ok) {
      sent++;
      console.log('[call-reminder-sweeper] push sent', { platform: t.platform, tokenPrefix: t.token.slice(0, 8) });
    } else if (result.error?.includes('not configured')) {
      skipped++; errors.push(result.error);
      console.warn('[call-reminder-sweeper] push skipped, not configured', { platform: t.platform });
    } else {
      failed++; if (result.error) errors.push(result.error);
      console.error('[call-reminder-sweeper] push failed', { platform: t.platform, tokenPrefix: t.token.slice(0, 8), error: result.error });
    }
  }

  return { sent, failed, skipped, errors };
}
