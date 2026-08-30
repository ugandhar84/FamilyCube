// FamilyCube — Edge Function: calendar-oauth-redirect
//
// Google's "Web application" OAuth client type (the one this app already
// has, reused from Supabase Auth's Google Sign-In) refuses to register a
// custom-scheme redirect URI like familycube://calendar-oauth-callback —
// Web clients only accept a real https:// domain. This function is that
// https:// landing point: Google/Microsoft redirect here with the auth
// code (or error) in the query string, and this immediately 302s onward
// to the app's custom scheme with the same query string attached, which
// expo-web-browser's openAuthSessionAsync is watching for to close the
// in-app browser tab. No token exchange happens here — this is purely a
// domain-shape bounce, the real exchange still happens in
// calendar-oauth-exchange after the app receives the deep link.
//
// Register this exact URL as the Authorized redirect URI on the GOOGLE
// Web client ONLY:
//   https://<project-ref>.supabase.co/functions/v1/calendar-oauth-redirect
// Microsoft Entra needs familycube://calendar-oauth-callback registered
// DIRECTLY instead (under "Mobile and desktop applications") — Entra has
// no equivalent restriction on custom-scheme redirect URIs, so it never
// needs this bounce at all. Sending Microsoft this bounce URL instead was
// a real bug (both providers briefly shared one constant) that produced
// invalid_request: redirect_uri on every Outlook connect attempt.
//
// Deploy: supabase functions deploy calendar-oauth-redirect --no-verify-jwt
// (must be reachable with no Supabase auth header — Google/Microsoft call
// it directly, the same reason the two calendar-webhook-* functions are
// also deployed --no-verify-jwt)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const APP_SCHEME_REDIRECT = 'familycube://calendar-oauth-callback';

serve((req) => {
  const url = new URL(req.url);
  const target = `${APP_SCHEME_REDIRECT}?${url.searchParams.toString()}`;
  return new Response(null, { status: 302, headers: { Location: target } });
});
