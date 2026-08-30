// FamilyCube — Edge Function: calendar-oauth-exchange
// Called by the client (lib/calendarOAuth.ts) immediately after the OAuth
// consent screen redirects back into the app with an authorization code.
// Exchanges the code for access+refresh tokens (needs the client secret,
// which must never ship in the app bundle — this is why the exchange has
// to happen server-side) and writes/updates the member's
// calendar_connections row.
//
// Deploy: supabase functions deploy calendar-oauth-exchange
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET,
//          MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Must exactly match the redirect_uri the client sent in the ORIGINAL
// authorization request (lib/calendarOAuth.ts's oauthBounceUrl()), not the
// final familycube:// deep link the bounce page 302s to afterward — the
// token endpoint checks this against what was registered/used at auth
// time and rejects a mismatch, even though by this point the code has
// already carried the user all the way back into the app.
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/calendar-oauth-redirect`;

const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '';
const MS_CLIENT_ID         = Deno.env.get('MS_GRAPH_CLIENT_ID') ?? '';
const MS_CLIENT_SECRET     = Deno.env.get('MS_GRAPH_CLIENT_SECRET') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { code, provider, memberId, codeVerifier, purpose } = await req.json() as {
      code: string; provider: 'google' | 'outlook'; memberId: string; codeVerifier?: string; purpose: 'work' | 'personal';
    };
    if (!code || !provider || !memberId || !purpose) {
      return json({ ok: false, error: 'code, provider, memberId, purpose required' }, 400);
    }
    if (provider !== 'google' && provider !== 'outlook') {
      return json({ ok: false, error: 'provider must be google or outlook' }, 400);
    }
    if (purpose !== 'work' && purpose !== 'personal') {
      return json({ ok: false, error: 'purpose must be work or personal' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: member } = await supabase.from('members').select('id, family_id').eq('id', memberId).single();
    if (!member?.family_id) return json({ ok: false, error: 'member not found' }, 404);

    const tokens = provider === 'google'
      ? await exchangeGoogle(code, codeVerifier)
      : await exchangeOutlook(code, codeVerifier);

    const { error } = await supabase.from('calendar_connections').upsert({
      family_id: member.family_id,
      member_id: memberId,
      provider,
      purpose,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: new Date(Date.now() + tokens.expiresInSec * 1000).toISOString(),
      connected_account_email: tokens.email ?? null,
      status: 'active',
      last_error: null,
    }, { onConflict: 'family_id,member_id,provider,purpose' });

    if (error) {
      console.error('[calendar-oauth-exchange] upsert failed', error.message);
      return json({ ok: false, error: 'Could not save connection' }, 500);
    }

    return json({ ok: true, email: tokens.email ?? null });
  } catch (e: any) {
    console.error('[calendar-oauth-exchange]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'Exchange failed' }, 500);
  }
});

async function exchangeGoogle(code: string, codeVerifier?: string): Promise<{ accessToken: string; refreshToken: string; expiresInSec: number; email?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Google code exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.refresh_token) {
    // Google only issues a refresh_token on the FIRST consent (or when
    // prompt=consent is forced) — a re-connect without revoking first
    // would silently produce an access-only connection with no way to
    // refresh once it expires. The client is responsible for requesting
    // prompt=consent&access_type=offline on every auth attempt so this
    // should not normally happen; surfaced as an error rather than
    // silently persisting a connection that will die in ~1 hour.
    throw new Error('Google did not return a refresh_token — reconnect with consent prompt forced');
  }
  let email: string | undefined;
  try {
    const userinfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    if (userinfo.ok) email = (await userinfo.json()).email;
  } catch { /* best-effort — connection still works without a display email */ }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSec: json.expires_in ?? 3600, email };
}

async function exchangeOutlook(code: string, codeVerifier?: string): Promise<{ accessToken: string; refreshToken: string; expiresInSec: number; email?: string }> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      scope: 'offline_access Calendars.ReadWrite User.Read',
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Outlook code exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.refresh_token) throw new Error('Outlook did not return a refresh_token');
  let email: string | undefined;
  try {
    const me = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    if (me.ok) { const m = await me.json(); email = m.mail ?? m.userPrincipalName; }
  } catch { /* best-effort */ }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSec: json.expires_in ?? 3600, email };
}
