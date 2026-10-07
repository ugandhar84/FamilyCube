import { useState } from 'react';
import { View, Text } from 'react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import FamilyAvatar from '@/components/FamilyAvatar';
import PersonaSwitcherDropdown from '@/components/PersonaSwitcherDropdown';
import type { FamilyMember } from '@/store/familyStore';

/**
 * ProfileSwitcherCard — "Viewing as / Maya / Parent · household admin"
 * card, matching the Figma Make prototype's `.profile-switcher` exactly
 * (design/Scrollable Content Design/src/App.tsx lines 200-243,
 * src/index.css lines 241-359): positioned between Family Pulse and Needs
 * You on the Home page.
 *
 * Opens the SAME PersonaSwitcherDropdown AppHeader's compact mode already
 * uses — this card is a second visual trigger for the one real switching
 * mechanism (including its own PIN-gating), not a parallel reimplementation.
 * The prototype's own inline expand/collapse + role copy per non-parent
 * profile isn't replicated here (that's the prototype's OWN simulated
 * multi-profile-in-one-screen demo, not a real affordance this app needs —
 * this app already has a real per-device active member and a real PIN
 * switch flow).
 */
export function ProfileSwitcherCard({
  colors, isDark, active,
}: {
  colors: any; isDark: boolean;
  active: FamilyMember;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const roleLabel = active.role === 'parent' ? 'Parent · household admin' : active.role;

  return (
    <>
      <AnimatedPressable
        onPress={() => setSwitcherOpen(true)}
        style={{
          marginHorizontal: 20, marginTop: 12,
          padding: 8,
          borderWidth: 1, borderColor: colors.border, borderRadius: 20,
          backgroundColor: colors.card,
          shadowColor: colors.navy, shadowOffset: { width: 0, height: 6 }, shadowOpacity: isDark ? 0 : 0.045, shadowRadius: 20,
          flexDirection: 'row', alignItems: 'center', gap: 11,
          minHeight: 58,
        }}
      >
        <FamilyAvatar name={active.name} emoji={active.emoji} avatarUrl={active.avatarUrl} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9, color: colors.textTertiary }}>Viewing as</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 1 }}>{active.name.split(' ')[0]}</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>{roleLabel}</Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.primary, textAlign: 'center' }}>↓</Text>
      </AnimatedPressable>
      <PersonaSwitcherDropdown visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
