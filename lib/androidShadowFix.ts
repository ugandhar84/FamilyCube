import { Platform } from 'react-native';

/**
 * Android's `elevation` shadow is clipped/suppressed entirely by
 * `overflow: 'hidden'` on the SAME view — a well-known cross-platform
 * quirk (iOS's shadow* props have no such conflict with overflow: hidden).
 * Live-reported: perk cards on Android (features/store/StoreScreen.tsx)
 * rendered with a flat, muted shadow instead of the soft per-category
 * tinted shadow iOS shows, because `overflow: 'hidden'` (needed there to
 * clip the rounded card corners) was set on the exact same style object
 * that also carries shadowColor/elevation.
 *
 * This is a REPO-WIDE pattern (40+ files combine overflow:'hidden' with a
 * shadow on one view), so fixing it means either restructuring every
 * card's JSX into an extra wrapper view (invasive, real risk of breaking
 * iOS layouts in the process) or normalizing it once at the style level.
 * withAndroidShadowFix(style) is the single choke point every affected
 * component calls: on iOS it's a pure passthrough (zero behavior change,
 * confirmed by the Platform.OS check below never running on iOS), on
 * Android it drops `overflow: 'hidden'` from the merged style so the
 * elevation shadow can render outside the view's bounds again — the
 * rounded-corner clipping itself still works via `borderRadius` alone
 * (Android clips content to borderRadius independently of `overflow`,
 * this only affects whether the OS-drawn shadow gets clipped too).
 */
// Accepts the same shape a component already passes to `style` — a single
// object, or (the far more common case in this codebase) an array of
// style objects/falsy values RN merges itself, e.g.
// `style={[s.perkCard, { shadowColor: accent, overflow: 'hidden' }]}`.
// The overflow:'hidden' and the shadow props can live on DIFFERENT entries
// in that array (as they do in StoreScreen.tsx: elevation lives on
// s.perkCard, overflow:'hidden' on the second object) — so this must
// inspect the MERGED result, not any single entry in isolation.
type StyleInput = Record<string, any> | false | null | undefined | StyleInput[];

function flattenStyle(style: StyleInput): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce((acc: Record<string, any>, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  return style;
}

export function withAndroidShadowFix<T extends StyleInput>(style: T): Record<string, any> | T {
  if (Platform.OS !== 'android') return style;
  const merged = flattenStyle(style);
  if (merged.overflow !== 'hidden') return style;
  if (merged.shadowColor === undefined && merged.elevation === undefined) return style;
  const { overflow, ...rest } = merged;
  return rest;
}
