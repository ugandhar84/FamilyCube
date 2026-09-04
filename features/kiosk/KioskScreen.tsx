/**
 * KioskScreen — always-on kitchen-hub dashboard for a wall-mounted tablet.
 *
 * Entirely new/additive: reads the same stores every other screen already
 * reads (useFamilyStore, useQuestStore, useEventStore, useChatStore), but
 * owns its own layout and never touches ParentView/KidView/TeenView/
 * SeniorView or any existing tab screen. The ONLY existing file this
 * feature touches is HubScreen.tsx, with a single early-return guard at the
 * very top (see that file) — no other mobile screen or store logic is
 * modified by this feature.
 *
 * Rail tabs mirror the same per-role split the real bottom tab bar already
 * uses (features/app/(tabs)/_layout.tsx's TABS_DEFAULT vs TABS_SENIOR):
 * default roles get Hub/Tasks/Schedule/Chat/FindFam/Store, a senior/
 * grandparent profile gets Hub/Tasks/Chat/Memories instead (no Store/
 * FindFam) — this file re-derives that same split rather than importing
 * from the tab layout, keeping this feature fully decoupled from it.
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Home, CheckSquare, Calendar as CalendarIcon, MessageCircle, MapPin, Gift, Images, Sparkles,
} from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import AskCubeChat from '@/components/AskCubeChat';
import { KioskHubTab } from './tabs/KioskHubTab';
import { KioskTasksTab } from './tabs/KioskTasksTab';
import { KioskScheduleTab } from './tabs/KioskScheduleTab';
import { KioskChatTab } from './tabs/KioskChatTab';
import { KioskFindFamTab } from './tabs/KioskFindFamTab';
import { KioskStoreTab } from './tabs/KioskStoreTab';
import { KioskMemoriesTab } from './tabs/KioskMemoriesTab';

type KioskTab = 'hub' | 'tasks' | 'schedule' | 'chat' | 'findfam' | 'store' | 'memories';

interface RailItem {
  key: KioskTab;
  label: string;
  Icon: typeof Home;
}

const RAIL_DEFAULT: RailItem[] = [
  { key: 'hub',      label: 'Hub',      Icon: Home },
  { key: 'tasks',    label: 'Tasks',    Icon: CheckSquare },
  { key: 'schedule', label: 'Plan',     Icon: CalendarIcon },
  { key: 'chat',     label: 'Chat',     Icon: MessageCircle },
  { key: 'findfam',  label: 'Find',     Icon: MapPin },
  { key: 'store',    label: 'Store',    Icon: Gift },
];
const RAIL_SENIOR: RailItem[] = [
  { key: 'hub',       label: 'Hub',      Icon: Home },
  { key: 'tasks',     label: 'Tasks',    Icon: CheckSquare },
  { key: 'chat',      label: 'Chat',     Icon: MessageCircle },
  { key: 'memories',  label: 'Memories', Icon: Images },
];

export default function KioskScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const [tab, setTab] = useState<KioskTab>('hub');
  const [askCubeOpen, setAskCubeOpen] = useState(false);

  const active: FamilyMember | undefined = members.find(m => m.id === activeMemberId) ?? members[0];
  const isSenior = active?.role === 'senior';
  const isParent = active?.role === 'parent';
  const rail = isSenior ? RAIL_SENIOR : RAIL_DEFAULT;

  // A senior profile has no Schedule/FindFam/Store tabs — if the previously
  // active profile had one of those open and the kiosk switches to a senior
  // profile (family member picker on this shared device), fall back to Hub
  // rather than rendering a blank/invalid tab.
  const effectiveTab: KioskTab = rail.some(r => r.key === tab) ? tab : 'hub';

  const otherMembers = useMemo(
    () => members.filter(m => m.id !== active?.id),
    [members, active?.id],
  );

  if (!active) return null;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={s.row}>
        {/* ── Nav rail — every screen this active profile's role can reach ── */}
        <View style={[s.rail, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
          <View style={s.railGroup}>
            {rail.map(({ key, label, Icon }) => {
              const on = effectiveTab === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={s.railBtnWrap}
                >
                  {on && <View style={[s.railIndicator, { backgroundColor: colors.primary }]} />}
                  <View style={[s.railBtn, on && { backgroundColor: colors.primaryLight }]}>
                    <Icon size={22} color={on ? colors.primary : colors.textTertiary} />
                    <Text style={[s.railLabel, { color: on ? colors.primary : colors.textTertiary }]}>{label}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Ask Cube — same parent-only gate the phone tab layout's shared
              FAB uses (AskCubeChat can act broadly across the household on
              the parent's behalf; not something a kid/teen/GP should
              trigger). Kiosk mode has no bottom tab bar for the phone's FAB
              to float above, so this rail is Ask Cube's only entry point
              here rather than trying to reuse that absolutely-positioned
              button in a layout it wasn't designed for. */}
          <View style={s.railBottom}>
            {isParent && (
              <Pressable onPress={() => setAskCubeOpen(true)} style={s.askCubeBtn}>
                <View style={[s.askCubeGradient, { backgroundColor: colors.pink, shadowColor: colors.pink }]}>
                  <Sparkles size={21} color="#fff" />
                </View>
              </Pressable>
            )}

            {/* Family member switcher — a shared kitchen tablet needs to
                swap whose view is showing without leaving kiosk mode at
                all; reuses setActiveMember exactly like the phone app's own
                profile switcher, just presented as a compact avatar stack
                instead of a full-screen picker since there's rail space for
                it here. */}
            <View style={s.memberStack}>
              {otherMembers.slice(0, 4).map(m => {
                const tint = m.role === 'parent' ? colors.teal : m.role === 'senior' ? colors.pink : colors.amber;
                return (
                  <Pressable key={m.id} onPress={() => setActiveMember(m.id)} style={s.memberDot}>
                    <View style={[s.memberAvatar, { backgroundColor: colors.card, borderColor: tint }]}>
                      <Text style={s.memberEmoji}>{m.emoji ?? '👤'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Active screen ── */}
        <View style={s.content}>
          {effectiveTab === 'hub' && <KioskHubTab active={active} members={members} colors={colors} isDark={isDark} />}
          {effectiveTab === 'tasks' && <KioskTasksTab active={active} members={members} colors={colors} isDark={isDark} />}
          {effectiveTab === 'schedule' && !isSenior && <KioskScheduleTab colors={colors} isDark={isDark} />}
          {effectiveTab === 'chat' && <KioskChatTab active={active} members={members} colors={colors} isDark={isDark} />}
          {effectiveTab === 'findfam' && !isSenior && <KioskFindFamTab members={members} colors={colors} isDark={isDark} />}
          {effectiveTab === 'store' && !isSenior && <KioskStoreTab active={active} colors={colors} isDark={isDark} />}
          {effectiveTab === 'memories' && isSenior && <KioskMemoriesTab colors={colors} isDark={isDark} />}
        </View>
      </View>

      {isParent && (
        <AskCubeChat
          visible={askCubeOpen}
          onClose={() => setAskCubeOpen(false)}
          activeMember={active}
          members={members}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  rail: {
    width: 88, borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', paddingVertical: 22, justifyContent: 'space-between',
  },
  railGroup: { alignItems: 'center', gap: 10 },
  railBtnWrap: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  railIndicator: { position: 'absolute', left: 0, width: 3, height: 28, borderRadius: 2 },
  railBtn: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 3 },
  railLabel: { fontSize: 10, fontWeight: '800' },
  railBottom: { alignItems: 'center', gap: 16 },
  askCubeBtn: { marginBottom: 2 },
  askCubeGradient: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  memberStack: { alignItems: 'center', gap: 9 },
  memberDot: { opacity: 0.9 },
  memberAvatar: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  memberEmoji: { fontSize: 18 },
  content: { flex: 1, minWidth: 0 },
});
