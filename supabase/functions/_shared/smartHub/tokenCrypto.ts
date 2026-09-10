// Smart Hub — server-side token encryption at rest. Vendor OAuth access/
// refresh tokens are sensitive credentials (equivalent to a password for
// that vendor account) and must never be stored in smart_device_accounts
// as plaintext. This is a small, focused AES-GCM helper using a
// server-only secret — deliberately NOT lib/locationCrypto.ts's per-
// device/per-family envelope (that's a client-side scheme keyed to a
// specific member's own device, designed for end-to-end-style chat/
// location text; these tokens are only ever read back by edge functions
// themselves, never decrypted client-side, so a single server-held key is
// the right shape here, not a per-user envelope).
//
// Requires the SMART_HUB_ENCRYPTION_KEY secret (32 raw bytes, base64-
// encoded) to be set:
//   openssl rand -base64 32 | supabase secrets set SMART_HUB_ENCRYPTION_KEY

async function getKey(): Promise<CryptoKey> {
  const b64 = Deno.env.get('SMART_HUB_ENCRYPTION_KEY');
  if (!b64) throw new Error('SMART_HUB_ENCRYPTION_KEY not configured');
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // iv + ciphertext, base64-joined — self-contained, no separate iv column needed.
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(encoded: string): Promise<string> {
  const key = await getKey();
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
