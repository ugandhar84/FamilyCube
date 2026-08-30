/**
 * calendarOAuth — user-consent OAuth flow for connecting a Google or
 * Outlook calendar (2-way sync). Uses expo-web-browser's
 * openAuthSessionAsync (an in-app Safari/Chrome Custom Tab) rather than a
 * webview — both Google and Microsoft reject OAuth attempted through an
 * embeddable webview outright ("disallowed_useragent").
 *
 * The user never types a Google/Microsoft password into this app: they
 * authenticate on the provider's own real sign-in page inside that secure
 * browser tab, then get redirected back into the app via the
 * familycube://calendar-oauth-callback custom scheme carrying a one-time
 * authorization code — never a password or long-lived token. That code is
 * forwarded to the calendar-oauth-exchange edge function, which does the
 * actual code-for-tokens exchange server-side (requires the client
 * secret, which must never ship in the app bundle).
 *
 * Google's OAuth client here is a "Web application" type (reused from
 * Supabase Auth's Google Sign-In client), which Google refuses to let use
 * a custom-scheme redirect URI directly — Web clients require a real
 * https:// domain. So the OAuth request itself sends the provider to an
 * intermediate https:// bounce page (calendar-oauth-redirect edge
 * function), which immediately 302s to the real familycube:// deep link.
 * openAuthSessionAsync is told to watch for that FINAL custom-scheme URL
 * (its second argument), not the intermediate https:// one — it follows
 * the redirect chain itself and only resolves once the custom scheme is
 * hit. Microsoft's redirect URI is not similarly restricted, but the same
 * bounce URL is reused for both providers for one consistent code path.
 */
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

const REDIRECT_URI = 'familycube://calendar-oauth-callback';
// Read at call time, same lazy-fail pattern as clientIdFor — this must be
// set to the deployed calendar-oauth-redirect function's URL, e.g.
// https://<project-ref>.supabase.co/functions/v1/calendar-oauth-redirect
function oauthBounceUrl(): string {
  const value = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error('EXPO_PUBLIC_SUPABASE_URL is not configured — calendar connect is unavailable until it\'s set');
  return `${value}/functions/v1/calendar-oauth-redirect`;
}

export type CalendarProvider = 'google' | 'outlook';

// Read at call time (not module load) so a missing env var fails loudly
// with a clear message the moment someone actually tries to connect,
// rather than silently building a broken auth URL at import time.
function clientIdFor(provider: CalendarProvider): string {
  const key = provider === 'google'
    ? 'EXPO_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID'
    : 'EXPO_PUBLIC_MS_GRAPH_CLIENT_ID';
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured — calendar connect is unavailable until it's set`);
  return value;
}

function randomToken(): Promise<string> {
  return Crypto.getRandomBytesAsync(32).then(bytes =>
    Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  );
}

// A 'work' connection only ever calls freebusy.query/getSchedule (see
// calendar-freebusy-sync) — it never reads or writes a real event, so it
// requests the narrowest scope that permits that, not the same broad
// read-write access a 'personal' (full 2-way sync) connection genuinely
// needs. Live-requested: "we just need to read the agenda [free/busy] for
// work... for personal we can read full [calendar] if needed" — the
// consent screen itself should reflect that narrower ask, not just the
// app's internal behavior.
function scopeFor(provider: CalendarProvider, purpose: CalendarPurpose): string {
  if (provider === 'google') {
    // calendar.freebusy: read-only busy/free blocks, no event content at
    // all. calendar.events: full read/write on real events (personal sync).
    return purpose === 'work'
      ? 'https://www.googleapis.com/auth/calendar.freebusy'
      : 'https://www.googleapis.com/auth/calendar.events';
  }
  // Graph has no dedicated freebusy-only scope — Calendars.Read is the
  // narrowest that still permits getSchedule (freebusy) for a work
  // connection; Calendars.ReadWrite is needed for personal's full sync.
  return purpose === 'work'
    ? 'offline_access Calendars.Read User.Read'
    : 'offline_access Calendars.ReadWrite User.Read';
}

function authUrlFor(provider: CalendarProvider, purpose: CalendarPurpose, clientId: string, state: string): string {
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: oauthBounceUrl(),
      response_type: 'code',
      scope: scopeFor(provider, purpose),
      access_type: 'offline',
      // Forces Google to always issue a refresh_token, even on a
      // reconnect after a previous grant — without this, only the FIRST
      // ever consent for this Google account returns one.
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthBounceUrl(),
    response_type: 'code',
    response_mode: 'query',
    scope: scopeFor(provider, purpose),
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

/**
 * Opens the provider's consent screen, waits for the redirect back into
 * the app, and exchanges the resulting code for tokens via
 * calendar-oauth-exchange. Returns the connected account's email on
 * success (for display in Settings), or throws with a user-facing message
 * on failure/cancellation.
 */
export type CalendarPurpose = 'work' | 'personal';

export async function connectCalendar(provider: CalendarProvider, memberId: string, purpose: CalendarPurpose): Promise<{ email: string | null }> {
  const clientId = clientIdFor(provider);
  const state = await randomToken();
  const authUrl = authUrlFor(provider, purpose, clientId, state);

  const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
  if (result.type !== 'success' || !result.url) {
    throw new Error(result.type === 'cancel' ? 'Connection cancelled.' : 'Could not complete sign-in.');
  }

  const returned = new URL(result.url);
  const error = returned.searchParams.get('error');
  if (error) throw new Error(returned.searchParams.get('error_description') ?? error);

  const returnedState = returned.searchParams.get('state');
  if (returnedState !== state) throw new Error('Sign-in response did not match this request — please try again.');

  const code = returned.searchParams.get('code');
  if (!code) throw new Error('No authorization code returned.');

  const { data, error: fnError } = await supabase.functions.invoke('calendar-oauth-exchange', {
    body: { code, provider, memberId, purpose },
  });
  if (fnError || !data?.ok) throw new Error(data?.error ?? fnError?.message ?? 'Could not finish connecting.');

  return { email: data.email ?? null };
}
