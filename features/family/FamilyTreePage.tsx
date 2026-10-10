/**
 * FamilyTreePage — "Our roots, our people" full-page family tree view.
 * Rendered as a FullPageOverlay from FamilyScreen (the "View family tree →"
 * link and the header "+" button) — not its own tab route anymore. Matches
 * the proven pattern GroceryScreen/MealsScreen were converted to: a fresh
 * mount every time it opens (FullPageOverlay unmounts on close) avoids the
 * stale-shared-value bug a tab-route + SwipeBackWrapper combination hit
 * repeatedly (blank screen after several back-and-forth visits).
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserPlus } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { FamilyTreeView } from '@/features/vault/tabs/FamilyTreeView';
import { MemberProfileSheet } from '@/features/vault/tabs/MemberProfileSheet';
import { InvitePage } from '@/features/vault/tabs/InvitePage';
import { saveMemberEdit } from '@/features/vault/tabs/memberActions';
import { showToast } from '@/components/AppToast';
import { GEMINI } from '@/constants/geminiRhythm';

export function FamilyTreePage({ onClose }: { onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const allMembers     = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const updateMember   = useFamilyStore(s => s.updateMember);
  const removeMember   = useFamilyStore(s => s.removeMember);

  const realMembers = useMemo(
    () => allMembers.filter(m => !m.deletedAt && m.inviteStatus !== 'pending'),
    [allMembers],
  );

  // DEV mock: inject 4 grandparents (2 paternal, 2 maternal) when no seniors exist
  const parents = realMembers.filter(m => m.role === 'parent');
  const mockGrandparents = __DEV__ && realMembers.every(m => m.role !== 'senior') && parents.length >= 1
    ? [
        { id: 'mock-gp-1', name: `${parents[0]?.name.split(' ')[0] ?? ''}'s Dad`, emoji: '👴', role: 'senior' as const, relationship: 'Grandfather', linkedParentId: parents[0]?.id, familyId: parents[0]?.familyId ?? '', pin: undefined, pinEnabled: false, avatarUrl: null, hasCar: false },
        { id: 'mock-gp-2', name: `${parents[0]?.name.split(' ')[0] ?? ''}'s Mum`, emoji: '👵', role: 'senior' as const, relationship: 'Grandmother', linkedParentId: parents[0]?.id, familyId: parents[0]?.familyId ?? '', pin: undefined, pinEnabled: false, avatarUrl: null, hasCar: false },
        { id: 'mock-gp-3', name: `${parents[1]?.name.split(' ')[0] ?? parents[0]?.name.split(' ')[0] ?? ''}'s Dad`, emoji: '👴', role: 'senior' as const, relationship: 'Grandfather', linkedParentId: parents[1]?.id ?? parents[0]?.id, familyId: parents[0]?.familyId ?? '', pin: undefined, pinEnabled: false, avatarUrl: null, hasCar: false },
        { id: 'mock-gp-4', name: `${parents[1]?.name.split(' ')[0] ?? parents[0]?.name.split(' ')[0] ?? ''}'s Mum`, emoji: '👵', role: 'senior' as const, relationship: 'Grandmother', linkedParentId: parents[1]?.id ?? parents[0]?.id, familyId: parents[0]?.familyId ?? '', pin: undefined, pinEnabled: false, avatarUrl: null, hasCar: false },
      ]
    : [];

  const members = __DEV__
    ? [...mockGrandparents, ...realMembers] as typeof realMembers
    : realMembers;

  const activeMember = realMembers.find(m => m.id === activeMemberId) ?? realMembers[0];
  const isParent = activeMember?.role === 'parent';

  const [viewTarget, setViewTarget] = useState<any | null>(null);
  const [initialSection, setInitialSection] = useState<'view' | 'edit' | 'pin'>('view');
  const openMember = (m: any, section: 'view' | 'edit' | 'pin' = 'view') => {
    setInitialSection(section); setViewTarget(m);
  };
  const [showInvitePage, setShowInvitePage] = useState(false);

  // FamilyTreePage is now a FullPageOverlay layered on top of the Family
  // tab rather than its own tab route — activeTabName stays 'family' the
  // whole time this is open, so the old onFamilyRosterTab FAB-hiding check
  // in app/(tabs)/_layout.tsx no longer fires. setFullBleedScreenActive
  // tells that shared gate to hide the FAB anyway (same fix as
  // GroceryScreen.tsx/MealsScreen.tsx's identical conversion).
  useEffect(() => {
    hideTabBar();
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => {
      showTabBar();
      useUIStore.getState().setFullBleedScreenActive(false);
    };
  }, []);

  const savePin = async (memberId: string, pin: string) => {
    try {
      await useFamilyStore.getState().setMemberPin(memberId, pin, activeMemberId ?? undefined);
      showToast('PIN saved');
    } catch (e: any) {
      Alert.alert("Couldn't save PIN", e?.message ?? 'Something went wrong.');
    }
  };

  const saveMember = async (memberId: string, name: string, role: string, hasCar: boolean, rideEarningsPerRun: number, groceryEarningsPerRun: number, subRole?: string, relationship?: string, avatarEmoji?: string, avatarUrl?: string) => {
    const { error } = await saveMemberEdit(updateMember, memberId, name, role, hasCar, rideEarningsPerRun, groceryEarningsPerRun, subRole, relationship, avatarEmoji, avatarUrl);
    if (error) Alert.alert("Couldn't save changes", error);
    else showToast('Profile updated');
  };

  const deleteFamilyMember = async (memberId: string) => {
    try {
      await removeMember(memberId);
      showToast('Member removed');
    } catch (e: any) {
      Alert.alert('Could Not Remove Member', e?.message || 'Something went wrong.');
    }
  };

  const resendInviteFor = async (targetMember: any): Promise<any> => ({ ok: false, error: 'Not available here.' });

  // "Gemini rhythm" canvas (CLAUDE.md rule 6 exception, extended per
  // explicit request) [live-requested: "how about tasks and home, chat,
  // family"] — was the older, separate '#F3F5F2' Figma-palette cream.
  const pageBg = isDark ? colors.background : GEMINI.canvas;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC  = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const linkC  = isDark ? colors.primary : GEMINI.linkBlue;

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 4 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.primary }}>← Family</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 13, fontWeight: '500', color: linkC, marginTop: 12 }}>
          {activeMember?.name ? `${activeMember.name} · ${activeMember.role === 'parent' ? 'Parent / Admin' : activeMember.role}` : 'Family'}
        </Text>
        <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 4, lineHeight: 36 }}>
          Our roots, our people
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC, marginTop: 4, marginBottom: 4, lineHeight: 18 }}>
          A small tree with a long story. Tap a person's card to see their place in the family.
        </Text>
      </View>

      {/* Tree */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ backgroundColor: pageBg }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: insets.bottom + 40 }}>
        <FamilyTreeView
          members={members}
          activeMemberId={activeMemberId}
          isParent={isParent}
          colors={colors}
          isDark={isDark}
          onView={(m) => openMember(m, 'view')}
          onEdit={(m) => openMember(m, 'edit')}
          onPin={(m) => openMember(m, 'pin')}
        />

        {/* Invite button — parent only */}
        {isParent && (
          <TouchableOpacity
            onPress={() => setShowInvitePage(true)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 48, borderRadius: 14, marginTop: 10,
              backgroundColor: colors.teal,
            }}
          >
            <UserPlus size={18} color="#fff" strokeWidth={2} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>Invite a Family Member</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Member sheet */}
      {viewTarget && (
        <MemberProfileSheet
          member={viewTarget} siblings={members.map(m => m.name)} allMembers={members}
          visible onClose={() => setViewTarget(null)}
          initialSection={initialSection}
          isParentViewer={isParent}
          canChangePin={isParent || viewTarget.id === activeMemberId}
          onSave={saveMember}
          onLinkParent={(id, parentId) => updateMember(id, { linkedParentId: parentId })}
          onDelete={deleteFamilyMember}
          onSavePin={savePin}
          onResetPin={(m) => openMember(m, 'pin')}
          onResendInvite={resendInviteFor}
          colors={colors} isDark={isDark}
        />
      )}

      {/* Invite full-page overlay */}
      {showInvitePage && (
        <View style={StyleSheet.absoluteFillObject}>
          <InvitePage onClose={() => setShowInvitePage(false)} />
        </View>
      )}
    </View>
  );
}
