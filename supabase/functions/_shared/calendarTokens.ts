// Shared lazy token-refresh helper for Google/Outlook calendar sync — used
// by calendar-sync-push, calendar-webhook-google, calendar-webhook-outlook,
// and calendar-channel-renewal. Refreshes inline, on-demand, right before
// an API call, rather than via a dedicated refresh-everything cron —
// matches the codebase's existing check-before-use pattern (kroger-prices'
// in-process token cache) and avoids burning invocations refreshing
// connections that see zero sync activity between refreshes.

const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '';
const MS_CLIENT_ID         = Deno.env.get('MS_GRAPH_CLIENT_ID') ?? '';
const MS_CLIENT_SECRET     = Deno.env.get('MS_GRAPH_CLIENT_SECRET') ?? '';

export interface CalendarConnectionRow {
  id: string;
  family_id: string;
  member_id: string;
  provider: 'google' | 'outlook';
  // 'work' (FreeBusy-only) vs 'personal' (full 2-way sync) — every caller
  // that queries calendar_connections should already filter by this in
  // its own query, but typing it here too gives the compiler a chance to
  // flag a future caller that forgets the filter (audit finding).
  purpose: 'work' | 'personal';
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  external_calendar_id: string | null;
  sync_token: string | null;
  delta_link: string | null;
  status: string;
}

const REFRESH_MARGIN_MS = 5 * 60_000; // refresh if within 5 minutes of expiry

/**
 * Returns a valid access token for this connection, refreshing (and
 * persisting the refreshed token back to the DB) first if it's expired or
 * about to be. Throws if the connection has no refresh_token at all
 * (shouldn't happen for an 'active' connection — that would mean the
 * initial OAuth exchange never completed correctly) or if the provider
 * rejects the refresh (e.g. the user revoked access on their end) — the
 * caller should catch this and mark the connection 'error'.
 */
export async function getValidAccessToken(
  supabase: any,
  connection: CalendarConnectionRow,
): Promise<string> {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const stillValid = connection.access_token && expiresAt - Date.now() > REFRESH_MARGIN_MS;
  if (stillValid) return connection.access_token!;

  if (!connection.refresh_token) {
    throw new Error(`calendar_connections ${connection.id} has no refresh_token — cannot refresh`);
  }

  const refreshed = connection.provider === 'google'
    ? await refreshGoogleToken(connection.refresh_token)
    : await refreshOutlookToken(connection.refresh_token);

  const { error } = await supabase.from('calendar_connections').update({
    access_token: refreshed.accessToken,
    token_expires_at: new Date(Date.now() + refreshed.expiresInSec * 1000).toISOString(),
    // Google only returns a new refresh_token on some refreshes; keep the
    // existing one unless a new one was actually issued. Outlook (Graph)
    // always rotates the refresh token on use — must persist the new one
    // or the NEXT refresh attempt fails with an already-used-token error.
    ...(refreshed.refreshToken ? { refresh_token: refreshed.refreshToken } : {}),
  }).eq('id', connection.id);
  if (error) console.warn('[calendarTokens] failed to persist refreshed token', connection.id, error.message);

  return refreshed.accessToken;
}

async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresInSec: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, expiresInSec: json.expires_in ?? 3600 };
}

async function refreshOutlookToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresInSec: number }> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'offline_access Calendars.ReadWrite',
    }),
  });
  if (!res.ok) throw new Error(`Outlook token refresh failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  // Graph always issues a new refresh_token — the old one becomes invalid
  // for future refreshes once this response is used.
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSec: json.expires_in ?? 3600 };
}
