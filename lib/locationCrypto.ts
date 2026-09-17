/**
 * locationCrypto — encryption for location address text
 * (member_locations.address/street/neighborhood).
 *
 * lat/lng are never touched here — they stay plaintext by design, still
 * needed for live map rendering without decrypting every row.
 *
 * Was: a per-device X25519 envelope, then chatCrypto.ts's local
 * SecureStore-only "shared" key (Option 1 — passcode-wrapped). That second
 * scheme never actually synced across devices for location: chatCrypto's
 * getKey() silently generates a brand-new RANDOM key per device when none
 * exists locally, and the only code path that ever unwraps a real shared
 * key from a passcode is ChatScreen.tsx's manual passcode-entry flow, which
 * location never goes through. Every device was therefore encrypting with
 * its OWN independently-generated key, so any OTHER member/device's
 * location text was permanently undecryptable [live-reported, screenshot:
 * "[locked] encrypted — wrong key or corrupted" for other members while
 * the viewer's own row displayed fine].
 *
 * Now: one raw AES key per FAMILY, stored server-side in
 * family_location_keys (RLS-gated to that family's own members, same trust
 * boundary as every other family-scoped table) — fetched/created once and
 * cached per familyId, no passcode step, no per-device pairing to get
 * wrong. [live-requested: "just make it simple... just do encrypt using
 * the family chat sec key"]
 */
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

const ALGO = { name: 'AES-GCM', length: 256 } as const;
const SECURE_STORE_PREFIX = 'familycube_location_aes_v1_';

const memCache = new Map<string, CryptoKey>();
const memberFamilyCache = new Map<string, string>();

async function resolveFamilyId(memberId: string): Promise<string | null> {
  const cached = memberFamilyCache.get(memberId);
  if (cached) return cached;
  const { data } = await supabase.from('members').select('family_id').eq('id', memberId).maybeSingle();
  const familyId = (data as { family_id?: string } | null)?.family_id ?? null;
  if (familyId) memberFamilyCache.set(memberId, familyId);
  return familyId;
}

function buf2b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b642buf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getFamilyLocationKey(familyId: string): Promise<CryptoKey> {
  const cached = memCache.get(familyId);
  if (cached) return cached;

  const secureStoreKey = SECURE_STORE_PREFIX + familyId;
  const localB64 = await SecureStore.getItemAsync(secureStoreKey);
  if (localB64) {
    const key = await crypto.subtle.importKey('raw', b642buf(localB64), ALGO, true, ['encrypt', 'decrypt']);
    memCache.set(familyId, key);
    return key;
  }

  // Not cached locally yet — fetch the family's existing shared key, or
  // create one if this is the first device ever to touch it.
  const { data: row } = await supabase
    .from('family_location_keys')
    .select('aes_key_b64')
    .eq('family_id', familyId)
    .maybeSingle();

  let keyB64 = row?.aes_key_b64 as string | undefined;
  if (!keyB64) {
    const newKey = await crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
    keyB64 = buf2b64(await crypto.subtle.exportKey('raw', newKey));
    // Insert can race with another device doing the same first-time create —
    // ON CONFLICT DO NOTHING semantics via upsert-ignore, then re-read
    // whichever row actually won, so every device converges on ONE key.
    const { error: insertErr } = await supabase
      .from('family_location_keys')
      .insert({ family_id: familyId, aes_key_b64: keyB64 });
    if (insertErr) {
      const { data: winner } = await supabase
        .from('family_location_keys')
        .select('aes_key_b64')
        .eq('family_id', familyId)
        .maybeSingle();
      if (winner?.aes_key_b64) keyB64 = winner.aes_key_b64;
    }
  }
  if (!keyB64) throw new Error('[locationCrypto] could not resolve or create family location key');

  const key = await crypto.subtle.importKey('raw', b642buf(keyB64), ALGO, true, ['encrypt', 'decrypt']);
  await SecureStore.setItemAsync(secureStoreKey, keyB64);
  memCache.set(familyId, key);
  return key;
}

export async function encryptLocationText(_memberId: string, familyId: string | null | undefined, plaintext: string): Promise<string> {
  if (!familyId) return plaintext;
  const key = await getFamilyLocationKey(familyId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${buf2b64(iv.buffer)}:${buf2b64(cipher)}`;
}

export async function decryptLocationText(memberId: string, ciphertext: string, familyIdHint?: string | null): Promise<string> {
  // familyIdHint lets a caller that already has it skip the extra lookup;
  // every existing call site only ever passed (memberId, ciphertext), so
  // this resolves it from memberId itself rather than requiring any of
  // those 9 call sites to change.
  const familyId = familyIdHint ?? await resolveFamilyId(memberId);
  if (!familyId) return ciphertext;
  try {
    const [ivB64, dataB64] = ciphertext.split(':');
    if (!ivB64 || !dataB64) return ciphertext;
    const key = await getFamilyLocationKey(familyId);
    const iv = new Uint8Array(b642buf(ivB64));
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b642buf(dataB64));
    return new TextDecoder().decode(plainBuf);
  } catch {
    return '[🔒 encrypted — wrong key or corrupted]';
  }
}

// No-op — kept so existing call sites (app/_layout.tsx, store/familyStore.ts)
// don't need to change; there is no per-device key wrapping to recheck
// anymore, only the one shared server-stored family key.
export async function forceRecheckLocationKeyWrap(_familyId: string | null | undefined, _memberId: string | null | undefined): Promise<void> {}
