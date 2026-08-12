/**
 * FamilyAvatar — smart initials with emoji/image/fallback tiers.
 *
 * Initials logic:
 *   1. emoji → show emoji
 *   2. avatarUrl → show <Image> with initial fallback on error
 *   3. else compute initials from name:
 *      - unique first name among siblings → first letter only  (e.g. "L")
 *      - shared first name               → F + last-name-initial (e.g. "AL")
 *      - no last name                    → first 2 letters (e.g. "Al")
 */
import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface AvatarProps {
  name: string;
  emoji?: string;
  avatarUrl?: string;
  /** Other member names in the family — used to detect first-name collisions. */
  siblings?: string[];
  size?: number;
  ringColor?: string;
  ringWidth?: number;
  /** Background color behind initials. Defaults to ringColor + '22'. */
  bgColor?: string;
}

// ─── Initials logic ───────────────────────────────────────────────────────────

function getInitials(name: string, siblings: string[]): string {
  const parts = name.trim().split(/\s+/);
  const firstName  = parts[0] ?? '';
  const lastName   = parts.length > 1 ? parts[parts.length - 1] : '';

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function FamilyAvatar({
  name,
  emoji,
  avatarUrl,
  siblings = [],
  size = 44,
  ringColor = '#9261C7',
  ringWidth = 2,
  bgColor,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const bg = bgColor ?? ringColor + '25';
  const radius = size / 2;
  const fontScale = size < 36 ? 0.45 : 0.48;

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    borderWidth: ringWidth,
    borderColor: ringColor,
    backgroundColor: bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  // Tier 1: emoji
  if (emoji) {
    return (
      <View style={containerStyle}>
        <Text style={{ fontSize: size * fontScale, lineHeight: size * 0.7, marginTop: 2 }}>
          {emoji}
        </Text>
      </View>
    );
  }

  // Tier 2: remote image (with initials fallback on error)
  if (avatarUrl && !imgError) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size }}
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  // Tier 3: smart initials
  const initials = getInitials(name, siblings);
  return (
    <View style={containerStyle}>
      <Text style={[s.initials, { fontSize: size * (initials.length > 1 ? 0.32 : 0.4), color: ringColor }]}>
        {initials}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  initials: { fontWeight: '900', letterSpacing: 0.5 },
});
