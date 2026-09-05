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
import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Home, CheckSquare, Calendar as CalendarIcon, MessageCircle, MapPin, Gift, Images,
  BookOpen, Heart, UserCircle2,
} from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKioskNavStore } from '@/store/kioskNavStore';
import { useEventStore } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import AskCubeChat from '@/components/AskCubeChat';
import { KioskHeader } from './KioskHeader';
import { KioskLockScreen } from './KioskLockScreen';
import { KioskAmbientOverlay } from './KioskAmbientOverlay';
import { KioskActivityProvider, useKioskLockSuspended } from './KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_RAIL_WIDTH } from './kioskTheme';
import { useKioskIdleLock } from './useKioskIdleLock';
import { KioskHubTab } from './tabs/KioskHubTab';
import { KioskTasksTab } from './tabs/KioskTasksTab';
import { KioskScheduleTab } from './tabs/KioskScheduleTab';
import { KioskChatTab } from './tabs/KioskChatTab';
import { KioskFindFamTab } from './tabs/KioskFindFamTab';
import { KioskStoreTab } from './tabs/KioskStoreTab';
import { KioskMemoriesTab } from './tabs/KioskMemoriesTab';
import { KioskSchoolTab } from './tabs/KioskSchoolTab';
import { KioskHealthTab } from './tabs/KioskHealthTab';
import { KioskProfileTab } from './tabs/KioskProfileTab';

type KioskTab = 'hub' | 'tasks' | 'schedule' | 'chat' | 'findfam' | 'store' | 'memories' | 'school' | 'health' | 'profile';

interface RailItem {
  key: KioskTab;
  label: string;
  Icon: typeof Home;
}

// School/Health/Profile added per live request: "add all the pills for the
// pages which is on the mobile hub screen [to] the kiosk side bar" — these
// three are the Hub's own AppsQuickAccessPills entries with no kiosk-native
// tab until now (Memories was already covered, for seniors, below).
// 'health' isn't offered to a teen/senior role on the phone's own pill
// list (AppsQuickAccessPills.tsx's PILLS roles array: parent/kid only) —
// matched here too rather than inventing a new kiosk-only availability.
const RAIL_DEFAULT: RailItem[] = [
  { key: 'hub',      label: 'Hub',      Icon: Home },
  { key: 'tasks',    label: 'Tasks',    Icon: CheckSquare },
  { key: 'schedule', label: 'Plan',     Icon: CalendarIcon },
  { key: 'chat',     label: 'Chat',     Icon: MessageCircle },
  { key: 'findfam',  label: 'Find',     Icon: MapPin },
  { key: 'store',    label: 'Store',    Icon: Gift },
  { key: 'school',   label: 'School',   Icon: BookOpen },
  { key: 'health',   label: 'Health',   Icon: Heart },
  { key: 'profile',  label: 'Profile',  Icon: UserCircle2 },
];
const RAIL_SENIOR: RailItem[] = [
  { key: 'hub',       label: 'Hub',      Icon: Home },
  { key: 'tasks',     label: 'Tasks',    Icon: CheckSquare },
  { key: 'chat',      label: 'Chat',     Icon: MessageCircle },
  { key: 'memories',  label: 'Memories', Icon: Images },
  { key: 'profile',   label: 'Profile',  Icon: UserCircle2 },
];

export default function KioskScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember, familyName } = useFamilyStore();
  const [tab, setTab] = useState<KioskTab>('hub');
  const [askCubeOpen, setAskCubeOpen] = useState(false);
  const { locked, ambient, registerActivity, lockNow, unlock, suspendLock, resumeLock } = useKioskIdleLock();

  // One stable object for the whole subtree — a fresh literal each render
  // would re-run every KioskModalHost's suspend/resume effect on every
  // parent render, which for a lock-suspension refcount means unbalanced
  // increments and a lock that never re-arms.
  const activityApi = useMemo(
    () => ({ registerActivity, suspendLock, resumeLock }),
    [registerActivity, suspendLock, resumeLock],
  );
  const pendingKioskTab = useKioskNavStore(s => s.pendingTab);
  const consumePendingKioskTab = useKioskNavStore(s => s.consumePendingTab);

  // A notification tap (app/_layout.tsx's addNotificationResponseListener)
  // sets this before pushing to '/(tabs)' when the device is a kiosk, since
  // every OTHER tab route renders a bare phone screen with no kiosk gate.
  // Consume-and-clear once, so it doesn't keep forcing the tab back after
  // the person has since navigated elsewhere on the kiosk themselves.
  useEffect(() => {
    if (pendingKioskTab) {
      setTab(pendingKioskTab);
      consumePendingKioskTab();
    }
  }, [pendingKioskTab, consumePendingKioskTab]);

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
  const isTeen = active?.role === 'teen';
  const isKidRole = active?.role === 'kid';
  // School/Health pills are parent/kid-only on the phone (Hub's
  // AppsQuickAccessPills.tsx PILLS array) — matched here rather than
  // inventing a wider kiosk-only availability. Teen gets neither.
  const rail = isSenior ? RAIL_SENIOR : isTeen ? RAIL_DEFAULT.filter(r => r.key !== 'school' && r.key !== 'health') : RAIL_DEFAULT;

  // A senior profile has no Schedule/FindFam/Store tabs — if the previously
  // active profile had one of those open and the kiosk switches to a senior
  // profile (family member picker on this shared device), fall back to Hub
  // rather than rendering a blank/invalid tab.
  const effectiveTab: KioskTab = rail.some(r => r.key === tab) ? tab : 'hub';

  // Ambient-overlay glance counts. Deliberately COUNTS ONLY, never titles
  // — the ambient state is what the whole room (guests included) sees, so
  // "3 events today" is fine where "Dentist 4pm — Maya" would not be.
  // These hooks sit above the `!active` early return below: a hook called
  // after a conditional return is a hook-order violation the moment that
  // condition ever flips (here: the one render before members load).
  const dayEvents = useEventStore(s2 => s2.dayEvents);
  const { quests } = useQuestStore();
  const ambientEventCount = dayEvents.length;
  const ambientChoreCount = useMemo(
    () => quests.filter(q => q.status === 'todo' || q.status === 'in_progress' || q.status === 'claimed').length,
    [quests],
  );

  // AskCubeChat is a shared phone component rendered straight into its own
  // Modal — it can't be wrapped in KioskModalHost without changing its
  // layout, so it holds the lock off via the hook form instead. Without
  // this, a long Ask Fam conversation counts as total inactivity (every
  // tap lands in the modal layer, invisible to the root onTouchStart) and
  // the idle lock fires mid-conversation.
  useKioskLockSuspended(askCubeOpen);

  if (!active) return null;

  return (
    <KioskActivityProvider value={activityApi}>
    <SafeAreaView
      style={[s.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
      onTouchStart={registerActivity}
    >
      {locked && (
        <KioskLockScreen
          familyName={familyName || 'Our Family'}
          members={members}
          onUnlock={(memberId) => { setActiveMember(memberId); unlock(); }}
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
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={s.railBtnWrap}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                  accessibilityHint={`Show the ${label} screen`}
                >
                  {/* Active state is a filled, elevated pill rather than a
                      tint plus a hairline bar. On a countertop display the
                      current location has to be unmistakable from across
                      the room — a 3px indicator stripe simply isn't. */}
                  <View
                    style={[
                      s.railBtn,
                      on && {
                        backgroundColor: colors.primary,
                        shadowColor: colors.primary,
                        shadowOpacity: isDark ? 0 : 0.22,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: isDark ? 0 : 3,
                      },
                    ]}
                  >
                    <Icon size={24} color={on ? '#fff' : colors.textTertiary} />
                    <Text
                      style={[s.railLabel, { color: on ? '#fff' : colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
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
          {effectiveTab === 'schedule' && !isSenior && <KioskScheduleTab active={active} members={members} colors={colors} isDark={isDark} />}
          {effectiveTab === 'chat' && <KioskChatTab active={active} members={members} colors={colors} isDark={isDark} />}
          {effectiveTab === 'findfam' && !isSenior && <KioskFindFamTab active={active} members={members} colors={colors} isDark={isDark} />}
          {effectiveTab === 'store' && !isSenior && <KioskStoreTab active={active} colors={colors} isDark={isDark} />}
          {effectiveTab === 'memories' && isSenior && <KioskMemoriesTab colors={colors} isDark={isDark} readOnly={active.role === 'senior'} />}
          {effectiveTab === 'school' && !isSenior && !isTeen && <KioskSchoolTab isKid={isKidRole} colors={colors} isDark={isDark} />}
          {effectiveTab === 'health' && !isSenior && !isTeen && <KioskHealthTab isKid={isKidRole} colors={colors} isDark={isDark} />}
          {effectiveTab === 'profile' && <KioskProfileTab />}
        </View>
      </View>

      {isParent && (
        <AskCubeChat
          visible={askCubeOpen}
          onClose={() => setAskCubeOpen(false)}
          activeMember={active}
          members={members}
          variant="kiosk"
        />
      )}

      {/* Ambient veil — LAST sibling inside the SafeAreaView, so it paints
          over the dashboard but (being a plain View, not a Modal) still
          sits below any open native sheet. See KioskAmbientOverlay's own
          header for why that's the deliberate opposite of the lock
          screen's Modal choice. Suppressed while locked: the lock screen
          is its own full surface and already shows the time. */}
      <KioskAmbientOverlay
        visible={ambient && !locked}
        familyName={familyName || 'Our Family'}
        eventCount={ambientEventCount}
        choreCount={ambientChoreCount}
        colors={colors}
      />
    </SafeAreaView>
    </KioskActivityProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  // Rail widened 84 -> 108 and its buttons 60 -> KIOSK_HIT.control (64),
  // with the label up from a 10px micro-caption to KIOSK_TYPO.micro (14).
  // A 10px label on a wall-mounted tablet is decorative, not readable —
  // which made the rail effectively icon-only guesswork for anyone who
  // didn't already know the icon set.
  rail: {
    width: KIOSK_RAIL_WIDTH, borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', paddingVertical: KIOSK_SPACE.md,
  },
  railGroup: { alignItems: 'center', gap: KIOSK_SPACE.xs },
  railBtnWrap: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  railBtn: {
    width: 78, height: KIOSK_HIT.rail, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  railLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  content: { flex: 1, minWidth: 0 },
});
