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
// authorization request for that same provider — the token endpoint
// checks this against what was actually used at auth time and rejects a
// mismatch. Google's OAuth client is a "Web application" type, which
// refuses a custom-scheme redirect URI directly, so its auth request (and
// this token exchange) goes through the HTTPS bounce page instead — see
// the final familycube:// deep link the bounce page 302s to afterward is
// NOT what gets sent here. Microsoft Entra's "Mobile and desktop
// applications" platform has no such restriction and has
// familycube://calendar-oauth-callback registered directly — using the
// Google bounce URL for Outlook here was a real bug (both providers
// shared one constant), producing a hard invalid_request: redirect_uri
// error on every Outlook connect attempt.
const GOOGLE_REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/calendar-oauth-redirect`;
const OUTLOOK_REDIRECT_URI = 'familycube://calendar-oauth-callback';

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

    // Live-requested: "create a FamilyCube calendar in any of the
    // provider first, else it will be a mess" — a personal connection
    // used to push straight into the member's PRIMARY calendar (the
    // 'primary'/'me' fallback every calendar-sync-push/reconcile call
    // already had), mixing every FamilyCube-created event in with the
    // member's own real events. Live-reported disaster: repeated
    // recurring-series test pushes left hundreds of stray "Drop-off"
    // events scattered across the member's actual Google Calendar with no
    // dedicated place to find or bulk-clean them from. A dedicated
    // "FamilyCube" calendar (same concept the Apple/EventKit sync path
    // already uses — see lib/calendarSync2Way.ts's SYNC_CALENDAR_NAME)
    // means every future push/pull is fully contained and trivially
    // wipeable (delete the one calendar) without ever touching the
    // member's own real events. Work-purpose connections stay untouched —
    // they only ever read FreeBusy, never write real events at all.
    let externalCalendarId: string | null = null;
    if (purpose === 'personal') {
      try {
        externalCalendarId = provider === 'google'
          ? await ensureGoogleFamilyCubeCalendar(tokens.accessToken)
          : await ensureOutlookFamilyCubeCalendar(tokens.accessToken);
      } catch (e) {
        console.warn('[calendar-oauth-exchange] could not create dedicated FamilyCube calendar, falling back to primary:', e instanceof Error ? e.message : e);
      }
    }

    // sync_token/external_calendar_id explicitly reset to null on every
    // (re)connect — an upsert on this conflict key only touches columns
    // present in the payload, so omitting them here left a RECONNECT
    // (same family_id/member_id/provider/purpose row, e.g. after
    // disconnecting and reconnecting, or a token expiring and being
    // re-authed) silently inheriting the PRIOR connection lifecycle's
    // stale sync_token. googleReconcile.ts's poller then treated the
    // "brand new" connection as an established one resuming an unchanged
    // delta — correctly reporting "0 items, token unchanged" against a
    // cursor that already represented everything up to the OLD
    // connection's last sync, rather than taking the full-initial-sync
    // path (googleReconcile.ts's syncToken-is-falsy branch) a genuinely
    // fresh connection needs. Live-reported: Praveena's newly connected
    // Google account never synced a single event, even across cold
    // restarts, because every poll's delta against the stale token
    // legitimately found nothing new.
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
      sync_token: null,
      external_calendar_id: externalCalendarId,
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

const FAMILYCUBE_CALENDAR_NAME = 'FamilyCube';

// Finds the member's existing "FamilyCube" secondary calendar if a prior
// connect already created one (re-authing an expired token, or
// disconnect-then-reconnect, shouldn't spawn a duplicate calendar every
// time), otherwise creates it fresh. Returns the calendar's id (used as
// external_calendar_id everywhere calendar-sync-push/googleReconcile.ts
// already read `connection.external_calendar_id ?? 'primary'`).
async function ensureGoogleFamilyCubeCalendar(accessToken: string): Promise<string> {
  const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (listRes.ok) {
    const list = await listRes.json();
    const existing = (list.items ?? []).find((c: any) => c.summary === FAMILYCUBE_CALENDAR_NAME);
    if (existing?.id) return existing.id;
  }
  const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: FAMILYCUBE_CALENDAR_NAME, description: 'Events synced from the FamilyCube app.' }),
  });
  if (!createRes.ok) throw new Error(`Google calendar create failed: ${createRes.status} ${await createRes.text()}`);
  return (await createRes.json()).id;
}

// Outlook/Microsoft Graph equivalent — a secondary calendar under the
// member's own mailbox, same "FamilyCube" name, same idempotent
// find-or-create shape.
async function ensureOutlookFamilyCubeCalendar(accessToken: string): Promise<string> {
  const listRes = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (listRes.ok) {
    const list = await listRes.json();
    const existing = (list.value ?? []).find((c: any) => c.name === FAMILYCUBE_CALENDAR_NAME);
    if (existing?.id) return existing.id;
  }
  const createRes = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FAMILYCUBE_CALENDAR_NAME }),
  });
  if (!createRes.ok) throw new Error(`Outlook calendar create failed: ${createRes.status} ${await createRes.text()}`);
  return (await createRes.json()).id;
}

async function exchangeGoogle(code: string, codeVerifier?: string): Promise<{ accessToken: string; refreshToken: string; expiresInSec: number; email?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_REDIRECT_URI,
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
      redirect_uri: OUTLOOK_REDIRECT_URI,
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
