import { Platform } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

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
 *
 * Typed as StyleProp<ViewStyle> throughout (not a bare Record<string, any>)
 * so this is a drop-in replacement at any `style={...}` prop — an earlier
 * version returned a loosely-typed object on the Android strip path, which
 * widened `overflow` from its real union type to `string` and broke every
 * call site's own type-check (`Type 'string' is not assignable to type
 * '"visible" | "hidden" | "scroll" | undefined'`) — caught by a real
 * `npx tsc --noEmit` run across the full rollout, not assumed clean from
 * an earlier (as it turned out, stale-cached) pass.
 */
type StyleInput = StyleProp<ViewStyle>;

function flattenStyle(style: unknown): ViewStyle {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce((acc: ViewStyle, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  return style as ViewStyle;
}

export function withAndroidShadowFix(style: StyleInput): StyleInput {
  if (Platform.OS !== 'android') return style;
  const merged = flattenStyle(style);
  if (merged.overflow !== 'hidden') return style;
  if (merged.shadowColor === undefined && merged.elevation === undefined) return style;
  const { overflow, ...rest } = merged;
  return rest as ViewStyle;
}
