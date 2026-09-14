import { Platform } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Android's `elevation` shadow renders fundamentally differently from
 * iOS's `shadow*` props — it's a soft, always-neutral-gray/black ambient +
 * key-light effect that never picks up `shadowColor`, and (separately)
 * used to get clipped to invisible entirely by `overflow: 'hidden'` on the
 * same view. Live-reported, after trying to tune elevation up to
 * compensate for the flat/muted look: don't carry ANY elevation/shadow on
 * Android at all, on any card or component — simpler and more consistent
 * than chasing a per-card elevation value that tries (and fails) to
 * visually match iOS's colored, soft shadows. The card's own border
 * (borderWidth/borderColor, already present everywhere this is applied)
 * is what defines the card shape on Android; iOS keeps its real shadow
 * completely untouched, since this function is a pure passthrough there.
 *
 * Kept as one shared choke point (not reverted to hand-editing every call
 * site again) since ~23 files already call this — only the Android-side
 * behavior changes here, every existing call site keeps working with zero
 * further changes needed.
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

const SHADOW_KEYS = ['shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset', 'elevation'] as const;

export function withAndroidShadowFix(style: StyleInput): StyleInput {
  if (Platform.OS !== 'android') return style;
  const merged = flattenStyle(style);
  const hasShadow = SHADOW_KEYS.some((k) => (merged as Record<string, unknown>)[k] !== undefined);
  if (!hasShadow) return style;
  const rest: Record<string, unknown> = { ...merged };
  for (const k of SHADOW_KEYS) delete rest[k];
  return rest as ViewStyle;
}
