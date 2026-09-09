import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import { useSchoolStore } from '@/store/schoolStore';
import { useUIStore } from '@/store/uiStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import { SchoolScheduleCard, SchoolScheduleModal } from '@/features/hub/SchoolScheduleModal';

const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
const NOW_DAY_MAP: Record<number,string> = { 0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat' };

export default function SchoolTab({ colors, isDark, isKid, isTeen, onEditModalVisibilityChange, renderEditModal }: {
  colors: any; isDark: boolean; isKid: boolean;
  /** Widened alongside isKid — a teen sees the same own-schedule-only view
   *  a kid gets, not the parent's whole-family list [live-requested: "it
   *  should be for both kids and teens - school schedule"]. Optional so
   *  every existing caller (mobile SchoolScreen.tsx included) that never
   *  passes it keeps its exact prior behavior. */
  isTeen?: boolean;
  /** Forwarded to SchoolScheduleCard — see that component's own comment.
   *  Kiosk-only; the phone's own screen never passes this. */
  onEditModalVisibilityChange?: (open: boolean) => void;
  /** Forwarded to SchoolScheduleCard — see that component's own comment.
   *  Kiosk-only; the phone's own screen never passes this. */
  renderEditModal?: (props: { visible: boolean; onClose: () => void; memberId: string; memberName: string; isParent: boolean }) => import('react').ReactNode;
}) {
  const { members, activeMemberId } = useFamilyStore();
  const { schedules } = useSchoolStore();
  const isOwnScheduleOnly = isKid || isTeen;

  // Kids/teens only see their own schedule; parents see all kids
  const kids = useMemo(() => {
    if (isOwnScheduleOnly) {
      const me = members.find(m => m.id === activeMemberId);
      return me ? [me] : [];
    }
    return members.filter(m => m.role === 'kid' || m.role === 'teen');
  }, [members, activeMemberId, isOwnScheduleOnly]);

  const allNames = members.map(m => m.name);
  const [selectedKidId, setSelectedKidId] = useState<string>(kids[0]?.id ?? '');
  const activeKid = kids.find(k => k.id === selectedKidId) ?? kids[0];

  // Shared FAB's School-tab "+" face (app/(tabs)/_layout.tsx) fires this
  // one-shot flag instead of opening Ask Cube — same pattern HealthTab.tsx
  // uses for its own "+". Opens the active kid's SchoolScheduleCard edit
  // modal via its externalOpenRequested prop, then clears itself.
  const openSchoolScheduleComposerRequested = useUIStore(s => s.openSchoolScheduleComposerRequested);

  // Local, kiosk-and-phone one-shot open flag for the title row's own
  // "Create Schedule" button [live-requested: "i want create a schedule
  // button in the row of title once we select the kid"] — a second real
  // entry point beside the shared FAB, right where the kid is selected
  // rather than scrolled down inside the card body. Local state (not the
  // global uiStore flag above) since this is scoped to whichever kid is
  // currently selected in THIS tab instance, not a device-wide FAB press.
  const [localOpenRequested, setLocalOpenRequested] = useState(false);
  const hasSchedule = !!activeKid && schedules.some(sc => sc.memberId === activeKid.id);

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

  // The shared Ask Cube FAB is visible on this tab (morphs to a "+" for
  // School's composer) — same overlap risk fixed on Hub/Quests.
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>

      {/* Kid picker — parents only, or single kid just shows header */}
      {!isOwnScheduleOnly && kids.length > 1 && (
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
          <View style={{ flex: 1 }}>
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
          {!hasSchedule && (
            <Pressable onPress={() => setLocalOpenRequested(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
                borderRadius: 12, backgroundColor: BRAND.purple + '12', borderWidth: 1.5, borderColor: BRAND.purple + '60' }}>
              <Plus size={14} color={BRAND.purple} />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>Create Schedule</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Full schedule card — expanded by default here */}
      {activeKid && (
        <SchoolScheduleCard
          memberId={activeKid.id}
          memberName={activeKid.name.split(' ')[0]}
          isParent={!isOwnScheduleOnly}
          colors={colors}
          isDark={isDark}
          defaultExpanded
          externalOpenRequested={openSchoolScheduleComposerRequested || localOpenRequested}
          onExternalOpenHandled={() => {
            useUIStore.getState().setOpenSchoolScheduleComposerRequested(false);
            setLocalOpenRequested(false);
          }}
          onEditModalVisibilityChange={onEditModalVisibilityChange}
          renderEditModal={renderEditModal}
        />
      )}
    </ScrollView>
  );
}
