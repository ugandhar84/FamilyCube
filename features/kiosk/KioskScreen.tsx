/**
 * KioskScreen — always-on kitchen-hub dashboard for a wall-mounted tablet.
 *
 * Entirely new/additive: reads the same stores every other screen already
 * reads (useFamilyStore, useQuestStore, useEventStore, useChatStore), but
 * owns its own layout and never touches ParentView/KidView/TeenView/
 * SeniorView or any existing tab screen. The ONLY existing file this
 * feature touches is HubScreen.tsx (single early-return guard) and the
 * shared tab layout (hides the phone's own bottom tab bar while this is
 * showing — see app/(tabs)/_layout.tsx's own comment on that fix).
 *
 * Layout: one persistent KioskHeader (family name/clock/avatars/Ask Fam)
 * above an icon-only nav rail + active screen — previously the rail itself
 * carried a second, separate avatar switcher stacked under the icons,
 * which read as "two sidebars" (live-reported). One header now owns
 * profile switching for every screen, not just Hub.
 *
 * Rail tabs mirror the same per-role split the real bottom tab bar already
 * uses (features/app/(tabs)/_layout.tsx's TABS_DEFAULT vs TABS_SENIOR):
 * default roles get Hub/Tasks/Schedule/Chat/FindFam/Store, a senior/
 * grandparent profile gets Hub/Tasks/Chat/Memories instead (no Store/
 * FindFam) — this file re-derives that same split rather than importing
 * from the tab layout, keeping this feature fully decoupled from it.
 */
import { useEffect, useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Home, CheckSquare, Calendar as CalendarIcon, MessageCircle, MapPin, Gift, Images,
} from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { Lock } from 'lucide-react-native';
import AskCubeChat from '@/components/AskCubeChat';
import { KioskHeader } from './KioskHeader';
import { KioskLockScreen } from './KioskLockScreen';
import { useKioskIdleLock } from './useKioskIdleLock';
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
  const { members, activeMemberId, setActiveMember, familyName } = useFamilyStore();
  const [tab, setTab] = useState<KioskTab>('hub');
  const [askCubeOpen, setAskCubeOpen] = useState(false);
  const { locked, registerActivity, lockNow, unlock } = useKioskIdleLock();

  // AskCubeChat renders via a real native Modal, which always sits above
  // regular views in its own native layer regardless of z-index — the
  // lock screen below (a plain View) would otherwise render BEHIND a
  // still-open Ask Fam conversation, leaving someone's private AI chat
  // visible through/under "locked." Force it closed the moment the kiosk
  // locks, same privacy intent as the lock itself.
  useEffect(() => { if (locked) setAskCubeOpen(false); }, [locked]);

  const active: FamilyMember | undefined = members.find(m => m.id === activeMemberId) ?? members[0];

  // Was: this fallback to members[0] only ever resolved `active` LOCALLY,
  // for what the UI shows — useFamilyStore's own activeMemberId (the field
  // lib/supabase.ts's getActiveMemberIdHeader() actually reads to send the
  // x-active-member-id request header) stayed genuinely unset whenever a
  // kiosk session booted straight into this fallback without ever calling
  // setActiveMember. Every write's RLS/trigger identity check
  // (resolve_active_member_id(), e.g. calendar_events_update_guard) then
  // had no member to resolve at all, silently misidentifying (or outright
  // rejecting) the caller — live-reported: editing a Study event's tutor
  // name (not a "sensitive" field) saved fine, but assigning the student
  // (member_id — one of the guarded fields) failed with a generic
  // "couldn't save," even while KioskHeader visibly showed the parent as
  // active. Writing the resolved id back to the store the moment it's
  // implicit makes every subsequent request's header actually match what's
  // on screen.
  useEffect(() => {
    if (!activeMemberId && active) setActiveMember(active.id);
  }, [activeMemberId, active, setActiveMember]);

  const isSenior = active?.role === 'senior';
  const isParent = active?.role === 'parent';
  const rail = isSenior ? RAIL_SENIOR : RAIL_DEFAULT;

  // A senior profile has no Schedule/FindFam/Store tabs — if the previously
  // active profile had one of those open and the kiosk switches to a senior
  // profile (family member picker on this shared device), fall back to Hub
  // rather than rendering a blank/invalid tab.
  const effectiveTab: KioskTab = rail.some(r => r.key === tab) ? tab : 'hub';

  if (!active) return null;

  return (
    <SafeAreaView
      style={[s.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
      onTouchStart={registerActivity}
    >
      {locked && (
        <KioskLockScreen
          familyName={familyName || 'Our Family'}
          onUnlock={unlock}
          colors={colors}
        />
      )}

      <KioskHeader
        familyName={familyName || 'Our Family'}
        members={members}
        activeId={active.id}
        onSwitch={setActiveMember}
        isParent={isParent}
        onAskFam={() => setAskCubeOpen(true)}
        onLock={lockNow}
        colors={colors}
      />

      <View style={s.row}>
        {/* ── Nav rail — icon-only; profile switching lives in KioskHeader
            above, not duplicated here. ── */}
        <View style={[s.rail, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
          <View style={s.railGroup}>
            {rail.map(({ key, label, Icon }) => {
              const on = effectiveTab === key;
              return (
                <Pressable key={key} onPress={() => setTab(key)} style={s.railBtnWrap}>
                  {on && <View style={[s.railIndicator, { backgroundColor: colors.primary }]} />}
                  <View style={[s.railBtn, on && { backgroundColor: colors.primaryLight }]}>
                    <Icon size={22} color={on ? colors.primary : colors.textTertiary} />
                    <Text style={[s.railLabel, { color: on ? colors.primary : colors.textTertiary }]}>{label}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Active screen ── */}
        <View style={s.content}>
          {effectiveTab === 'hub' && <KioskHubTab active={active} members={members} colors={colors} isDark={isDark} />}
          {effectiveTab === 'tasks' && <KioskTasksTab active={active} members={members} colors={colors} isDark={isDark} />}
          {effectiveTab === 'schedule' && !isSenior && <KioskScheduleTab members={members} colors={colors} isDark={isDark} />}
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
    width: 84, borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', paddingVertical: 20,
  },
  railGroup: { alignItems: 'center', gap: 10 },
  railBtnWrap: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  railIndicator: { position: 'absolute', left: 0, width: 3, height: 28, borderRadius: 2 },
  railBtn: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 3 },
  railLabel: { fontSize: 10, fontWeight: '800' },
  content: { flex: 1, minWidth: 0 },
});
