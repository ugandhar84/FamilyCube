/**
 * KioskScreen — the always-on kitchen "Hub OS" shell for a wall-mounted
 * tablet.
 *
 * Reads the same stores every other screen reads (familyStore, questStore,
 * eventStore, chatStore, rewardStore, groceryStore, family_meals) but owns
 * its own layout and never touches ParentView/KidView/TeenView/SeniorView
 * or any phone tab screen. The only existing files this feature touches are
 * HubScreen.tsx (a single early-return guard) and the shared tab layout
 * (hides the phone's bottom tab bar while kiosk is showing).
 *
 * ── Shell, per the reference mockup ─────────────────────────────────────
 *   ┌─ KioskHeader ────────────────────────────────────────────────────┐
 *   │ status · profile switcher · clock/date · intercom · standby      │
 *   ├──────────┬───────────────────────────────────────────────────────┤
 *   │ nav rail │ active tab                                            │
 *   │ (labelled│                                                       │
 *   │  entries)│                                                       │
 *   │  ────    │                                                       │
 *   │ Ask Fam  │                                                       │
 *   └──────────┴───────────────────────────────────────────────────────┘
 * plus three overlays: the ambient standby veil, the Ask Fam drawer, and
 * the intercom modal.
 *
 * ── Idle-lock participation is not optional for any of them ─────────────
 * Everything rendered into a native <Modal> sits in its own native window
 * and its touches never reach this component's root onTouchStart. Every
 * such surface here therefore either wraps itself in KioskModalHost
 * (KioskIntercomModal, KioskAskFamDrawer — both do, internally) or is
 * declared to the lock via useKioskLockSuspended (AskCubeChat, below).
 * Skipping that is the bug KioskActivityContext exists to fix: the busiest
 * moments on the device would register as total inactivity and the lock
 * would fire mid-sentence. Any NEW modal added to kiosk must do one of the
 * two — there is no third correct option.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKioskNavStore } from '@/store/kioskNavStore';
import { useEventStore, eventAssignee, isEventSensitive } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { fmtTime } from '@/lib/dates';
import AskCubeChat from '@/components/AskCubeChat';
import { KioskHeader } from './KioskHeader';
import { KioskLockScreen } from './KioskLockScreen';
import { KioskAmbientOverlay, type AmbientNextUp } from './KioskAmbientOverlay';
import { KioskActivityProvider, useKioskLockSuspended } from './KioskActivityContext';
import { KioskIntercomModal } from './components/KioskIntercomModal';
import { KioskAskFamDrawer } from './components/KioskAskFamDrawer';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_RAIL_WIDTH } from './kioskTheme';
import { useKioskColors } from './kioskPalette';
import { railForRole, type KioskTabKey } from './kioskTabs';
import { useKioskIdleLock } from './useKioskIdleLock';
import { KioskOverviewTab } from './tabs/KioskOverviewTab';
import { KioskMealsTab } from './tabs/KioskMealsTab';
import { KioskTasksTab } from './tabs/KioskTasksTab';
import { KioskScheduleTab } from './tabs/KioskScheduleTab';
import { KioskChatTab } from './tabs/KioskChatTab';
import { KioskFindFamTab } from './tabs/KioskFindFamTab';
import { KioskStoreTab } from './tabs/KioskStoreTab';
import { KioskMemoriesTab } from './tabs/KioskMemoriesTab';
import { KioskSchoolTab } from './tabs/KioskSchoolTab';
import { KioskHealthTab } from './tabs/KioskHealthTab';
import { KioskProfileTab } from './tabs/KioskProfileTab';
import { useTheme } from '@/lib/ThemeContext';

export default function KioskScreen() {
  const { k, isDark } = useKioskColors();
  // The pre-existing tabs (Tasks/Schedule/Chat/FindFam/Store/Memories/
  // School/Health) still take the app's own `colors`/`isDark` props and are
  // migrated to the kiosk palette incrementally — see the report. Both
  // objects resolve off the SAME useTheme() isDark, so a screen mixing them
  // is consistent within a mode; it is never light chrome around dark
  // content or vice versa.
  const { colors } = useTheme();

  const { members, activeMemberId, setActiveMember, familyName } = useFamilyStore();
  const [tab, setTab] = useState<KioskTabKey>('overview');
  const [askCubeOpen, setAskCubeOpen] = useState(false);
  const [askFamOpen, setAskFamOpen] = useState(false);
  const [intercomOpen, setIntercomOpen] = useState(false);
  const [standbyPinned, setStandbyPinned] = useState(false);

  const { locked, ambient, registerActivity, lockNow, unlock, suspendLock, resumeLock } = useKioskIdleLock();

  // One stable object for the whole subtree — a fresh literal each render
  // would re-run every KioskModalHost's suspend/resume effect on every
  // parent render, which for a refcounted lock suspension means unbalanced
  // increments and a lock that never re-arms.
  const activityApi = useMemo(
    () => ({ registerActivity, suspendLock, resumeLock }),
    [registerActivity, suspendLock, resumeLock],
  );

  const pendingKioskTab = useKioskNavStore(s => s.pendingTab);
  const consumePendingKioskTab = useKioskNavStore(s => s.consumePendingTab);

  // A notification tap (app/_layout.tsx's response listener) sets this
  // before pushing to '/(tabs)' on a kiosk device, since every other tab
  // route renders a bare phone screen with no kiosk gate. Consume-and-clear
  // once, so it doesn't keep forcing the tab back after the person has
  // since navigated elsewhere themselves.
  useEffect(() => {
    if (!pendingKioskTab) return;
    // The nav store predates this rail and still speaks the old 'hub' key;
    // map it rather than widening the store's own type, which other callers
    // share.
    const mapped = (pendingKioskTab === 'hub' ? 'overview' : pendingKioskTab) as KioskTabKey;
    setTab(mapped);
    consumePendingKioskTab();
  }, [pendingKioskTab, consumePendingKioskTab]);

  // AskCubeChat renders via a real native Modal, which always sits above
  // regular views in its own native layer regardless of z-index — the lock
  // screen would otherwise render BEHIND a still-open Ask Fam conversation,
  // leaving a private AI chat visible under "locked". Same for the new
  // drawer and intercom. Force all three closed the moment kiosk locks,
  // same privacy intent as the lock itself.
  useEffect(() => {
    if (!locked) return;
    setAskCubeOpen(false);
    setAskFamOpen(false);
    setIntercomOpen(false);
  }, [locked]);

  // Manually-entered standby is dismissed by the same touch that dismisses
  // the idle-driven one, so the person doesn't have to find a close button
  // on a screen whose whole affordance is "touch anywhere".
  useEffect(() => { if (!ambient && standbyPinned) setStandbyPinned(false); }, [ambient, standbyPinned]);

  const active: FamilyMember | undefined = members.find(m => m.id === activeMemberId) ?? members[0];

  // This fallback to members[0] previously only resolved `active` LOCALLY,
  // for what the UI shows — familyStore's own activeMemberId (the field
  // lib/supabase.ts's getActiveMemberIdHeader() reads to send the
  // x-active-member-id header) stayed genuinely unset whenever a kiosk
  // session booted straight into the fallback without calling
  // setActiveMember. Every write's RLS/trigger identity check then had no
  // member to resolve, silently misidentifying or rejecting the caller —
  // live-reported as a Study event's guarded field failing to save while
  // the header visibly showed the parent as active. Writing the resolved id
  // back the moment it's implicit keeps the header matching the screen.
  useEffect(() => {
    if (!activeMemberId && active) setActiveMember(active.id);
  }, [activeMemberId, active, setActiveMember]);

  const isSenior = active?.role === 'senior';
  const isParent = active?.role === 'parent';
  const isTeen = active?.role === 'teen';
  const isKidRole = active?.role === 'kid';
  const rail = railForRole(active?.role);

  // A role without a given tab (a senior has no Store/FindFam/Schedule) must
  // never render it: if the previously-active profile had one open and the
  // kiosk switches to a senior profile, fall back to Overview rather than
  // rendering a blank or — worse — a screen that role isn't meant to see.
  const effectiveTab: KioskTabKey = rail.some(r => r.key === tab) ? tab : 'overview';

  // ── Ambient / standby data ───────────────────────────────────────────
  // These hooks sit ABOVE the `!active` early return: a hook called after a
  // conditional return is a hook-order violation the moment that condition
  // flips (here, the one render before members load).
  const dayEvents = useEventStore(s => s.dayEvents);
  const { quests } = useQuestStore();
  const ambientChoreCount = useMemo(
    () => quests.filter(q => q.status === 'todo' || q.status === 'in_progress' || q.status === 'claimed').length,
    [quests],
  );

  /**
   * The next thing on today's calendar, for the standby panel.
   *
   * Redaction: standby is visible to the whole room, guests included. An
   * event the app itself classifies as sensitive (isEventSensitive — the
   * shared predicate every calendar surface uses for medical/therapy/etc.)
   * is reduced to a neutral stand-in rather than having its title displayed
   * across the kitchen. Non-sensitive events show normally, because a
   * standby screen that can only say "1 event" is not worth the panel.
   */
  const nextUp: AmbientNextUp | undefined = useMemo(() => {
    const hhmm = new Date().toTimeString().slice(0, 5);
    const upcoming = dayEvents.find(e => !!e.time && e.time >= hhmm) ?? dayEvents.find(e => !e.time);
    if (!upcoming) return undefined;
    if (isEventSensitive(upcoming)) {
      return { time: upcoming.time ? fmtTime(upcoming.time) : undefined, title: 'Something scheduled' };
    }
    const who = eventAssignee(upcoming).name?.trim().split(' ')[0]
      ?? members.find(m => m.id === upcoming.memberId)?.name?.trim().split(' ')[0];
    return {
      time: upcoming.time ? fmtTime(upcoming.time) : undefined,
      title: upcoming.title,
      who: who ? `with ${who}` : undefined,
    };
  }, [dayEvents, members]);

  // AskCubeChat is a shared phone component rendered straight into its own
  // Modal — it can't be wrapped in KioskModalHost without changing its
  // layout, so it holds the lock off via the hook form instead.
  useKioskLockSuspended(askCubeOpen);

  if (!active) return null;

  const showStandby = (ambient || standbyPinned) && !locked;

  return (
    <KioskActivityProvider value={activityApi}>
      <SafeAreaView
        style={[s.root, { backgroundColor: k.bg }]}
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
          onIntercom={() => setIntercomOpen(true)}
          onStandby={() => setStandbyPinned(true)}
          onLock={lockNow}
        />

        <View style={s.row}>
          {/* ══ NAV RAIL ══════════════════════════════════════════════
              Labelled, not icon-only. The mockup's rail carries a word next
              to every icon, and that is the right call for a device a
              grandparent walks up to cold — an unfamiliar glyph set is a
              guessing game. Scrolls when the full eleven-entry rail is
              taller than a short landscape screen; the Ask Fam card is
              pinned below it rather than scrolling away. */}
          <View style={[s.rail, { backgroundColor: k.card, borderRightColor: k.cardBorder }]}>
            <ScrollView
              contentContainerStyle={s.railGroup}
              showsVerticalScrollIndicator={false}
            >
              {rail.map(({ key, label, Icon }) => {
                const on = effectiveTab === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setTab(key)}
                    style={({ pressed }) => [
                      s.railBtn,
                      on
                        ? {
                            backgroundColor: k.primary,
                            // Elevation is mode-dependent by design: a cast
                            // shadow on a near-black ground reads as mud, so
                            // dark mode carries the active state entirely in
                            // the fill.
                            shadowColor: k.primary,
                            shadowOpacity: isDark ? 0 : 0.24,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 2 },
                            elevation: isDark ? 0 : 3,
                          }
                        : { backgroundColor: pressed ? k.cardHover : 'transparent' },
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={label}
                    accessibilityHint={`Show ${label}`}
                  >
                    <Icon size={22} color={on ? k.onPrimary : k.textMuted} />
                    <Text
                      style={[s.railLabel, { color: on ? k.onPrimary : k.textMuted }]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Ask Fam — the mockup's bottom-of-rail assistant card. Open to
                every role, unlike the header's AskCubeChat (parent-only,
                because that one is a real model with real spend behind it);
                this drawer is a local lookup over the family's own data, so
                there's nothing to gate. */}
            <Pressable
              onPress={() => setAskFamOpen(true)}
              style={({ pressed }) => [
                s.askFamCard,
                {
                  backgroundColor: pressed ? k.cardHover : k.purpleSoft,
                  borderColor: k.purpleEdge,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Ask Fam"
              accessibilityHint="Look up your family's schedule, chores and meals"
            >
              <Sparkles size={20} color={k.purple} />
              <Text style={[s.askFamText, { color: k.purple }]} numberOfLines={1}>Ask Fam</Text>
            </Pressable>
          </View>

          {/* ══ ACTIVE TAB ═══════════════════════════════════════════ */}
          <View style={s.content}>
            {effectiveTab === 'overview' && (
              <KioskOverviewTab
                active={active}
                members={members}
                onNavigate={setTab}
                onIntercom={() => setIntercomOpen(true)}
              />
            )}
            {effectiveTab === 'meals' && <KioskMealsTab active={active} members={members} />}
            {effectiveTab === 'tasks' && <KioskTasksTab active={active} members={members} colors={colors} isDark={isDark} />}
            {effectiveTab === 'schedule' && !isSenior && <KioskScheduleTab active={active} members={members} colors={colors} isDark={isDark} />}
            {effectiveTab === 'chat' && <KioskChatTab active={active} members={members} colors={colors} isDark={isDark} />}
            {effectiveTab === 'findfam' && !isSenior && <KioskFindFamTab active={active} members={members} colors={colors} isDark={isDark} />}
            {effectiveTab === 'store' && !isSenior && <KioskStoreTab active={active} />}
            {effectiveTab === 'memories' && <KioskMemoriesTab colors={colors} isDark={isDark} readOnly={isSenior} />}
            {effectiveTab === 'school' && !isSenior && !isTeen && <KioskSchoolTab isKid={isKidRole} colors={colors} isDark={isDark} />}
            {effectiveTab === 'health' && !isSenior && !isTeen && <KioskHealthTab isKid={isKidRole} colors={colors} isDark={isDark} />}
            {effectiveTab === 'profile' && <KioskProfileTab />}
          </View>
        </View>

        {/* ── Overlays ──────────────────────────────────────────────── */}

        {/* The app's real AI surface, parent-only and unchanged. Distinct
            from the Ask Fam drawer — see that component's header. */}
        {isParent && (
          <AskCubeChat
            visible={askCubeOpen}
            onClose={() => setAskCubeOpen(false)}
            activeMember={active}
            members={members}
            variant="kiosk"
          />
        )}

        <KioskAskFamDrawer visible={askFamOpen} onClose={() => setAskFamOpen(false)} />

        <KioskIntercomModal
          visible={intercomOpen}
          onClose={() => setIntercomOpen(false)}
          fromMemberId={active.id}
        />

        {/* Ambient veil — LAST sibling inside the SafeAreaView so it paints
            over the dashboard, but (being a plain View, not a Modal) it
            still sits BELOW any open native sheet. See the overlay's own
            header for why that's the deliberate opposite of the lock
            screen's Modal choice. Suppressed while locked: the lock screen
            is its own full surface and already shows the time. */}
        <KioskAmbientOverlay
          visible={showStandby}
          familyName={familyName || 'Our Family'}
          eventCount={dayEvents.length}
          choreCount={ambientChoreCount}
          nextUp={nextUp}
        />
      </SafeAreaView>
    </KioskActivityProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  rail: {
    width: KIOSK_RAIL_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingVertical: KIOSK_SPACE.sm,
    paddingHorizontal: KIOSK_SPACE.xs,
    justifyContent: 'space-between',
  },
  railGroup: { gap: 3, paddingBottom: KIOSK_SPACE.sm },
  railBtn: {
    height: KIOSK_HIT.rail, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 2,
  },
  railLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  askFamCard: {
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    minHeight: KIOSK_HIT.rail,
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 2,
  },
  askFamText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  content: { flex: 1, minWidth: 0 },
});
