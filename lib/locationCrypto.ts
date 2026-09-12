/**
 * locationCrypto — encryption for location address text
 * (member_locations.address/street/neighborhood).
 *
 * lat/lng are never touched here — they stay plaintext by design, still
 * needed for live map rendering without decrypting every row.
 *
 * Was: a per-device X25519 envelope (one long-lived AES session key per
 * member, wrapped separately for every family device via ECDH, mirroring
 * chat's per-device E2E). Removed after repeated live failures that traced
 * back to the wrap/unwrap key-pairing itself, not a fixable staleness bug
 * — a device holding a family-scoped RECOVERED identity publishes its
 * REAL public key in device_keys (ensureDeviceRegistered always registers
 * the real identity, with no familyId), but decrypts using
 * getDeviceKeyPair(familyId), which prefers the recovered private key
 * whenever one is installed. Those two don't form a matching ECDH pair,
 * so a device with a recovered identity permanently failed to decrypt
 * ANY location wrapped for it, regardless of which family member wrote
 * it or how many times the wrap step re-ran [live-reported, after several
 * prior attempts at narrower fixes: "encryption decryption is not working
 * properly for the location" / "I want this feature seamlessly working
 * whatever the state user in"]. Chat has the same structural mismatch but
 * is unaffected in practice because messages are numerous/disposable and
 * each carries its own fresh session key — a location row is a single
 * long-lived key an unlucky reader gets permanently stuck on.
 *
 * Now always uses the same shared-family-key scheme as chat's own
 * pre-per-device-E2E baseline (encryptMessage/decryptMessage in
 * chatCrypto.ts) — one AES key per family device, synced via the family
 * passcode, no per-device ECDH pairing to get wrong. lat/lng were already
 * plaintext, so this only affects the address STRING's protection model,
 * not location precision.
 */
import { encryptMessage, decryptMessage } from './chatCrypto';

export async function encryptLocationText(_memberId: string, _familyId: string | null | undefined, plaintext: string): Promise<string> {
  return encryptMessage(plaintext);
}

export async function decryptLocationText(_memberId: string, ciphertext: string): Promise<string> {
  return decryptMessage(ciphertext);
}

// No-op — kept so existing call sites (app/_layout.tsx, store/familyStore.ts)
// don't need to change; per-device key wrapping no longer exists for location.
export async function forceRecheckLocationKeyWrap(_familyId: string | null | undefined, _memberId: string | null | undefined): Promise<void> {}
