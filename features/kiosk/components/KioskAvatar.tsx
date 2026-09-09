/**
 * KioskAvatar — kiosk's own real avatar renderer, matching
 * components/FamilyAvatar.tsx's exact tier logic (emoji → real photo →
 * smart initials) instead of the emoji-or-generic-person-icon pattern
 * every kiosk file had been hand-rolling independently.
 *
 * Real gap this fixes: ~14 kiosk files rendered `member.emoji ?? '👤'`
 * directly as plain <Text>, with NO avatarUrl check at all — a family
 * member's real uploaded profile photo was silently ignored everywhere on
 * kiosk (identity cards, chat, schedule, chores, health, meals, Find,
 * etc.), always falling back to the emoji or a generic person emoji
 * [live-reported: "why the real avtars ar not displaying whereever is
 * itrying to show - we should follow the familyavtar approch of
 * fallbcaking  like no avatar - emoji not emoji show letters etc.."].
 *
 * Kept as kiosk's own component (not a straight re-export of FamilyAvatar)
 * since FamilyAvatar's own defaults (ringColor, bgColor tint) are tuned
 * for the phone's own color tokens — this takes kiosk's `k` palette
 * instead, same fork-when-needed pattern every other kiosk-native
 * component in this tree already follows.
 */
import { useState } from 'react';
import { View, Text, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { KioskColors } from '../kioskPalette';

function getInitials(name: string, siblings: string[]): string {
  const parts = name.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';

  const firstIsShared = siblings.some(s => {
    if (s === name) return false;
    const otherFirst = s.trim().split(/\s+/)[0] ?? '';
    return otherFirst.toLowerCase() === firstName.toLowerCase();
  });

  if (firstIsShared) {
    if (lastName) return (firstName[0] + lastName[0]).toUpperCase();
    return (firstName[0] + (firstName[1] ?? '')).toUpperCase();
  }

  if (firstName.length < 2) return firstName.toUpperCase();
  return firstName[0].toUpperCase();
}

export function KioskAvatar({
  name, emoji, avatarUrl, siblings = [], size = 44, ringColor, ringWidth = 0, bgColor, borderRadius, style, k,
}: {
  name: string;
  emoji?: string | null;
  avatarUrl?: string | null;
  /** Other member names in the family — used to detect first-name
   *  collisions, same as FamilyAvatar's own siblings prop. */
  siblings?: string[];
  size?: number;
  /** Defaults to k.cardBorder — a neutral kiosk-palette ring rather than
   *  FamilyAvatar's own hardcoded purple, so this fits any accent context
   *  a caller doesn't override. */
  ringColor?: string;
  ringWidth?: number;
  bgColor?: string;
  /** Defaults to size/2 (a full circle). Override for a call site whose
   *  original shape was a rounded square, not a circle — e.g. the
   *  sidebar identity cards used KIOSK_RADIUS.md, not a circle, and lost
   *  that shape when first swapped to this component's own circular
   *  default [live-reported: "i see that we chaged the avrar stle in
   *  identity"]. */
  borderRadius?: number;
  /** Extra style merged onto the container — e.g. a marginBottom a
   *  caller's original layout depended on that this component has no way
   *  to know about on its own (same identity-card regression above). */
  style?: StyleProp<ViewStyle>;
  k: KioskColors;
}) {
  const [imgError, setImgError] = useState(false);
  const ring = ringColor ?? k.cardBorder;
  const bg = bgColor ?? ring + '25';
  const fontScale = size < 36 ? 0.45 : 0.48;

  const containerStyle = [{
    width: size, height: size, borderRadius: borderRadius ?? size / 2,
    borderWidth: ringWidth, borderColor: ring, backgroundColor: bg,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  }, style];

  // Tier 1: emoji — mobile's own edit flow keeps emoji/avatarUrl mutually
  // exclusive (setting one explicitly clears the other, see
  // ProfileSettingsScreen.tsx's own EditMyProfileSheet), so this ordering
  // never actually hides a real photo behind a stale emoji in practice.
  if (emoji) {
    return (
      <View style={containerStyle}>
        <Text style={{ fontSize: size * fontScale, lineHeight: size * 0.7, marginTop: 2 }}>{emoji}</Text>
      </View>
    );
  }

  // Tier 2: real photo, with initials fallback if it fails to load.
  if (avatarUrl && !imgError) {
    return (
      <View style={containerStyle}>
        <Image source={{ uri: avatarUrl }} style={{ width: size, height: size }} onError={() => setImgError(true)} />
      </View>
    );
  }

  // Tier 3: smart initials — never a generic person-silhouette icon.
  const initials = getInitials(name, siblings);
  return (
    <View style={containerStyle}>
      <Text style={[s.initials, { fontSize: size * (initials.length > 1 ? 0.32 : 0.4), color: ring }]}>
        {initials}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  initials: { fontWeight: '900', letterSpacing: 0.5 },
});
