import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import PersonaSwitcherDropdown from '@/components/PersonaSwitcherDropdown';
import type { FamilyMember } from '@/store/familyStore';

const ROLE_DETAIL: Record<string, string> = {
  kid: 'Kid profile', teen: 'Teen profile', parent: 'Parent profile', senior: 'Senior profile',
};

// "Viewing identity" row — figma's avatar + "Viewing as X" + role detail +
// chevron strip. The kid header is now compact (no role-badge/Switch-
// Profile text row, matching the parent header 1:1 per "also header should
// be similar to parent"), so this row carries that identity/switch
// affordance instead, right below the header.
export function KidViewingRow({ active, colors }: { active: FamilyMember; colors: any }) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setSwitcherOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 12 }}>
        <FamilyAvatar name={active.name} emoji={active.emoji} avatarUrl={active.avatarUrl} size={30} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Viewing as {active.name.split(' ')[0]}</Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary }}>{ROLE_DETAIL[active.role] ?? 'Profile'}</Text>
        </View>
        <ChevronRight size={16} color={colors.textTertiary} />
      </Pressable>
      <PersonaSwitcherDropdown visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
