// Shared Apple MapKit JS Server API auth — ES256-signed JWT exchanged for a
// short-lived access token. Same three secrets (APPLE_MAPS_PRIVATE_KEY,
// APPLE_MAPS_KEY_ID, APPLE_MAPS_TEAM_ID) authorize every Apple Maps endpoint
// (searchAutoComplete, geocode, directions/eta) — extracted here so
// maps-autocomplete, maps-geocode, and maps-directions don't each duplicate
// the token-exchange logic.

export async function getAppleMapsAccessToken(privateKeyPem: string, keyId: string, teamId: string): Promise<string> {
  const pemBody = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const keyData    = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const b64url = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header  = b64url({ alg: 'ES256', kid: keyId });
  const payload = b64url({ iss: teamId, iat: now, exp: now + 1800 });
  const msg     = `${header}.${payload}`;
  const sig     = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(msg),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const authToken = `${msg}.${sigB64}`;

  const res = await fetch('https://maps-api.apple.com/v1/token', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Apple Maps token exchange failed: ${res.status}`);
  const { accessToken } = await res.json();
  return accessToken;
}

export function getAppleMapsCredentials(): { privateKey: string; keyId: string; teamId: string } | null {
  const privateKey = Deno.env.get('APPLE_MAPS_PRIVATE_KEY');
  const keyId      = Deno.env.get('APPLE_MAPS_KEY_ID');
  const teamId     = Deno.env.get('APPLE_MAPS_TEAM_ID');
  if (!privateKey || !keyId || !teamId) return null;
  return { privateKey, keyId, teamId };
}
