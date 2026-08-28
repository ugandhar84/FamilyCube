import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFamilyStore } from '@/store/familyStore';
import { useSchoolStore } from '@/store/schoolStore';
import { useUIStore } from '@/store/uiStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import { SchoolScheduleCard, SchoolScheduleModal } from '@/features/hub/SchoolScheduleModal';

const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
const NOW_DAY_MAP: Record<number,string> = { 0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat' };

export default function SchoolTab({ colors, isDark, isKid }: {
  colors: any; isDark: boolean; isKid: boolean;
}) {
  const { members, activeMemberId } = useFamilyStore();
  const { schedules } = useSchoolStore();

  // Kids only see their own schedule; parents see all kids
  const kids = useMemo(() => {
    if (isKid) {
      const me = members.find(m => m.id === activeMemberId);
      return me ? [me] : [];
    }
    return members.filter(m => m.role === 'kid');
  }, [members, activeMemberId, isKid]);

  const allNames = members.map(m => m.name);
  const [selectedKidId, setSelectedKidId] = useState<string>(kids[0]?.id ?? '');
  const activeKid = kids.find(k => k.id === selectedKidId) ?? kids[0];

  // Shared FAB's School-tab "+" face (app/(tabs)/_layout.tsx) fires this
  // one-shot flag instead of opening Ask Cube — same pattern HealthTab.tsx
  // uses for its own "+". Opens the active kid's SchoolScheduleCard edit
  // modal via its externalOpenRequested prop, then clears itself.
  const openSchoolScheduleComposerRequested = useUIStore(s => s.openSchoolScheduleComposerRequested);

  if (kids.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
        <Text style={{ fontSize: 32 }}>📚</Text>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
          No kids in this family yet.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* Kid picker — parents only, or single kid just shows header */}
      {!isKid && kids.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
          {kids.map(k => {
            const sel = k.id === selectedKidId;
            return (
              <Pressable key={k.id} onPress={() => setSelectedKidId(k.id)}
                style={{ alignItems: 'center', gap: 5 }}>
                <FamilyAvatar
                  name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl}
                  siblings={allNames} size={48}
                  ringColor={BRAND.purple} ringWidth={sel ? 3 : 0}
                />
                <Text style={{ fontSize: TYPO.micro, fontWeight: sel ? '800' : '600',
                  color: sel ? BRAND.purple : colors.textSecondary }}>
                  {k.name.split(' ')[0]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Kid name header */}
      {activeKid && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <FamilyAvatar name={activeKid.name} emoji={activeKid.emoji}
            avatarUrl={activeKid.avatarUrl} siblings={allNames} size={36}
            ringColor={BRAND.purple} ringWidth={1.5} />
          <View>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary }}>
              {activeKid.name.split(' ')[0]}'s Schedule
            </Text>
            {(() => {
              const s = schedules.find(sc => sc.memberId === activeKid.id);
              return s?.school ? (
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{s.school}</Text>
              ) : null;
            })()}
          </View>
        </View>
      )}

      {/* Full schedule card — expanded by default here */}
      {activeKid && (
        <SchoolScheduleCard
          memberId={activeKid.id}
          memberName={activeKid.name.split(' ')[0]}
          isParent={!isKid}
          colors={colors}
          isDark={isDark}
          defaultExpanded
          externalOpenRequested={openSchoolScheduleComposerRequested}
          onExternalOpenHandled={() => useUIStore.getState().setOpenSchoolScheduleComposerRequested(false)}
        />
      )}
    </ScrollView>
  );
}
