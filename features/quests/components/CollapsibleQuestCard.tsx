import React, { useState } from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { I } from './icons';
import { s } from './questCardStyles';

// ─── Collapsible chore card — frosted-glass shell, header always visible,
// body expands on tap. Real BlurView on iOS (Android falls back to a
// translucent tint — BlurView is unreliable/heavy there, same call as
// components/TeaserGate.tsx already makes). A soft accent-tinted gradient
// sits under the blur for the "glass over color" premium look, and a thin
// top highlight hairline stands in for a glass edge catching light.
export function CollapsibleQuestCard({
  accentColor, cardBg, cardBord, header, children, onDoubleTap, onLongPress, initiallyExpanded = false, dimmed = false, pinnedFooter,
}: {
  accentColor: string; cardBg: string; cardBord: string;
  header: React.ReactNode; children: React.ReactNode;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  initiallyExpanded?: boolean;
  // Final-approved quests read as settled, past business — everything about
  // them is locked except the parent's private note, so the card itself
  // should look done, not equally "live" as an in-progress one.
  dimmed?: boolean;
  // Rendered inside the card but OUTSIDE the dimmed wrapper — RN opacity
  // cascades to every descendant with no per-child override, so anything
  // that must stay fully legible on a dimmed card (the parent's private
  // note) has to live in its own sibling section, not inside `children`.
  pinnedFooter?: React.ReactNode;
}) {
  const { isDark } = useTheme();
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const lastTap = React.useRef(0);
  const handlePress = () => {
    const now = Date.now();
    if (onDoubleTap && now - lastTap.current < 320) {
      onDoubleTap();
    } else {
      setExpanded(e => !e);
    }
    lastTap.current = now;
  };
  return (
    <View style={[s.questCard, { backgroundColor: cardBg, borderColor: cardBord, shadowColor: accentColor }]}>
      {/* Soft accent wash under the glass — barely-there gradient, not a
          solid fill, so the card reads tinted rather than colored. */}
      <LinearGradient
        colors={[accentColor + '14', accentColor + '00']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={22} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: cardBg + (isDark ? 'CC' : 'E6') }]} pointerEvents="none" />
      )}
      {/* Glass edge highlight — thin light line along the top, the one cue
          that most reads as "glass" rather than a flat tinted card. */}
      <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)' }} pointerEvents="none" />

      <View style={{ opacity: dimmed ? 0.55 : 1 }}>
        <Pressable onPress={handlePress} onLongPress={onLongPress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 15, paddingBottom: expanded ? 6 : 15 }}>
          {/* Thin inset glow line replaces the old solid 4px accent bar —
              a hairline dot + short line reads as a status glow, not a
              chunky color block. */}
          <View style={{ width: 3, height: 28, borderRadius: 2, backgroundColor: accentColor, opacity: 0.85 }} />
          <View style={{ flex: 1 }}>{header}</View>
          {expanded ? <I.ChevronUp c={accentColor} /> : <I.ChevronDown c={accentColor} />}
        </Pressable>
        {expanded && (
          <Pressable onLongPress={onLongPress} style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2 }}>
            {children}
          </Pressable>
        )}
      </View>
      {pinnedFooter && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: dimmed ? 0 : 2 }}>
          {pinnedFooter}
        </View>
      )}
    </View>
  );
}
