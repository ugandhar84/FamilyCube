/**
 * TasksScreen — unified "Tasks" tab, merging the former Quests and Schedule
 * tabs into one nav slot (see app/(tabs)/_layout.tsx).
 *
 * Deliberately a thin composition shell, not a rewrite: CalendarScreen and
 * QuestsScreen each carry ~1700/1200 lines of dense, safety-critical RBAC
 * and privacy logic (medical-event redaction, GP visibility rules, pool
 * claiming, two-bounce delegation). Re-deriving that inline here to produce
 * one truly interleaved list would risk silently regressing behavior that's
 * already correct and well-tested. Instead this renders one of the two
 * screens full-bleed below a single shared header, and lets 2 square
 * status-count tab-cards switch between them — "one tab in the nav bar,"
 * without touching either screen's internals. A deeper interleaved-list
 * merge can build on this shell later without another navigation change.
 *
 * The header used to be duplicated (each of CalendarScreen/QuestsScreen
 * mounted its own AppHeader) with a floating pill overlaid on top of it —
 * that pill visually overlapped the header row instead of sitting below
 * it. Both screens now accept hideHeader to suppress their own AppHeader
 * when embedded here, so there's exactly one header.
 *
 * The title + tab-cards are passed into each screen's own ScrollView via
 * headerContent so they scroll away with the rest of the page instead of
 * staying pinned — CalendarScreen/QuestsScreen already scroll their own
 * content independently, so a second outer ScrollView around them isn't
 * reliable in React Native; injecting header content into the existing
 * scroller is the correct way to get everything to scroll as one unit.
 * The redundant "+Event"/"+Quest" pills are hidden (hideCreateButton) since
 * the shared FAB below already covers creation for both segments; each
 * screen's own inline search bar is hidden too (hideSearchBar) — search now
 * lives as one icon on the active tab-card, expanding into a bar docked
 * right under that card, driven into whichever screen is active via
 * externalSearchQuery.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ListChecks, Layers, Plus, Search, X, Bot, Sparkles, Flame, Award } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, eventAssignee } from '@/store/eventStore';
import { useChoreStore } from '@/store/choreStore';
import { useNotifStore } from '@/store/notifStore';
import { useUIStore } from '@/store/uiStore';
import { localDateStr } from '@/lib/dates';
import AppHeader from '@/components/AppHeader';
import { PageHeading } from '@/components/PageHeading';
import { PageTopBar } from '@/components/PageTopBar';
import NotificationPanel from '@/components/NotificationPanel';
import CalendarScreen from '@/features/calendar/CalendarScreen';
import QuestsScreen from '@/features/quests/QuestsScreen';
import type { AiTool } from '@/features/quests/components/AiEngineBanner';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import JustDescribeItScreen from '@/features/tasks/components/JustDescribeItScreen';
import JustDescribeItEventScreen from '@/features/calendar/components/JustDescribeItEventScreen';
import EventDetailScreen from '@/features/calendar/components/EventDetailScreen';
import type { FamilyEvent } from '@/store/eventStore';
import { HouseholdWorkQueue } from '@/features/tasks/HouseholdWorkQueue';
import { TaskFlowChooser } from '@/features/tasks/components/TaskFlowChooser';
import { CreateResponsibilitySheet } from '@/features/tasks/components/CreateResponsibilitySheet';
import { DispatchRideSheet } from '@/features/hub/parent/DispatchRideSheet';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import { AskParentSheet } from '@/features/hub/kid/AskParentSheet';
import { KidChoreProposalModal } from '@/features/hub/kid/KidChoreProposalModal';
import { GroceryModal, SuppliesModal, AskModal, QuestProposalModal } from '@/features/hub/KidModals';
import { KidRequestModal } from '@/features/calendar/KidRequestModal';
import { GEMINI } from '@/constants/geminiRhythm';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception, extended to Calendar/
// Tasks per explicit request — see School/Home Care/Health's own identical
// comment for the full rationale) [live-requested: "did you take the same
// rythim in all other modules like calender, meal and grocery?" -> "go
// ahead" -> "header also change the same color so that i will flow along"].
const PAGE_BG = GEMINI.canvas;
const CARD_BG = GEMINI.cardBg;
const BORDER  = GEMINI.border;

type Segment = 'schedule' | 'chores' | 'queue';

export default function TasksScreen({ lockedSegment }: { lockedSegment?: 'schedule' | 'chores' } = {}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const events = useEventStore(s => s.events);
  const rangeEvents = useEventStore(s => s.rangeEvents);
  const loadRange = useEventStore(s => s.loadRange);
  const chores = useChoreStore(s => s.chores);
  // scheduleCounts below needs the same multi-day window CalendarScreen's
  // own Agenda view uses (loadRange, today -> +60 days) — it previously
  // filtered `events`, which is scoped to a single day (whatever date was
  // last selected elsewhere) and only got populated at all if
  // CalendarScreen happened to have already mounted and loaded a range
  // first. Loading it here directly means the badge is accurate the
  // instant this screen mounts, regardless of which segment/screen was
  // visited previously.
  useEffect(() => {
    const from = localDateStr();
    const to = localDateStr(new Date(Date.now() + 60 * 86400_000));
    loadRange(from, to);
  }, [loadRange]);
  const unreadNotifCount = useNotifStore(s => s.unreadCount);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  // Matches QuestsScreen's own quest-creation gate (parent/teen only — a
  // senior sponsors chores through a separate, distinct "Sponsor Chore"
  // flow inside QuestsScreen that this FAB deliberately doesn't fold in,
  // and a kid gets "Ask Help" via KidRequestModal instead of creating
  // directly). Both segments share this one gate so switching segments
  // never changes whether the "+" is there.
  const canCreate = activeMember?.role === 'parent' || activeMember?.role === 'teen';
  // Kid gets the same "+" FAB slot, but it opens the Kid-safe stacked
  // picker (AskParentSheet — routes into each dedicated ask/request modal,
  // no direct assignment, no coins, no free-text guessing) instead of the
  // unrestricted SmartTaskComposer. Replaces the Schedule segment's old
  // standalone "+ Ask Help" header pill (CalendarScreen.tsx), which opened
  // KidRequestModal directly and only covered rides — this FAB covers
  // every ask category from one place, matching the Hub's own FAB.
  const isKidCreator = activeMember?.role === 'kid';
  const [segment, setSegment] = useState<Segment>(lockedSegment ?? 'chores');

  // One search query per segment — kept separate so switching tabs doesn't
  // carry a Schedule search term into Chores' unrelated result set.
  const [scheduleQuery, setScheduleQuery] = useState('');
  const [choreQuery, setChoreQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchAnim = useState(() => new Animated.Value(0))[0];

  const toggleSearch = (next: boolean) => {
    setSearchOpen(next);
    Animated.timing(searchAnim, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: false }).start();
    if (!next) { setScheduleQuery(''); setChoreQuery(''); }
  };

  // CubeAI trigger — moved off the page and onto the Chores card's own
  // top-right corner (was QuestsScreen's own inline pill). QuestsScreen
  // still owns the actual AI call (needs its internal quest/cache state);
  // this only hosts the trigger icon + the dropdown of 3 tool buttons,
  // driven through the exposed runAI function and reported showAiTool/
  // isAiLoading state.
  const isParent = activeMember?.role === 'parent';
  const [aiOpen, setAiOpen] = useState(false);
  const [aiState, setAiState] = useState<{ showAiTool: AiTool; isAiLoading: boolean }>({ showAiTool: 'none', isAiLoading: false });
  const runAIRef = useRef<((tool: AiTool) => void) | null>(null);
  const exposeAiRunner = useCallback((runAI: (tool: AiTool) => void) => { runAIRef.current = runAI; }, []);
  const runAiTool = (tool: AiTool) => { runAIRef.current?.(tool); setAiOpen(false); };

  // Status counts shown on each tab-card — a lightweight summary, not a
  // role-scoped visibility filter (that RBAC logic lives deep inside
  // CalendarScreen/QuestsScreen and shouldn't be re-derived here, per this
  // file's own header comment). Pending = waiting on someone to act;
  // Active = already claimed/in progress. Good enough for a glance-count
  // badge, not a substitute for either screen's own filtered list.
  const isSenior = activeMember?.role === 'senior';
  const scheduleCounts = useMemo(() => {
    // rangeEvents may be briefly empty right after mount (loadRange above
    // hasn't resolved yet) — fall back to the day-scoped `events` rather
    // than showing a zero count for a moment; settles to the real,
    // wider data within one render once loadRange's fetch lands.
    const source = rangeEvents.length > 0 ? rangeEvents : events;
    const upcoming = source.filter(e => {
      if (e.date < localDateStr()) return false;
      // A senior/GP's own Agenda (CalendarScreen.tsx's scopedRangeEvents)
      // only ever shows events they're actually assigned to, or unassigned
      // events explicitly open to grandparents — everything else (a ride
      // assigned to a parent, say) is invisible to them there. This badge
      // was counting every family event unfiltered, so it could show "2
      // active" while the GP's own Agenda below showed nothing at all —
      // reported live via screenshot. Mirror the same visibility rule here
      // so the count never promises more than the list underneath it has.
      if (!isSenior) return true;
      // id-based assignee check — falls back to name only for an
      // external, non-member assignee with no id at all.
      const assignee = eventAssignee(e);
      const isAssignee = !!assignee.name &&
        (assignee.id ? assignee.id === activeMemberId : assignee.name === activeMember?.name);
      const isSubjectOrAssignee =
        e.memberId === activeMemberId ||
        e.memberIds?.includes(activeMemberId ?? '') ||
        isAssignee;
      const isOpenUnassigned = !e.memberId && !e.memberIds?.length &&
        (e.category !== 'Ride' && !e.rideRequired ? true : !!e.isOpenToGrandparents);
      return isSubjectOrAssignee || isOpenUnassigned;
    });
    // A recurring series materializes one full row PER OCCURRENCE
    // (addRecurringEvent in eventStore.ts) — each still independently
    // pending its own driver confirmation, so this isn't wrong data, but a
    // weekly ride with 13 upcoming Wednesdays read as "13 pending" next to
    // Agenda's single-day view showing just one card, which looked
    // alarmingly wrong at a glance (live-reported). Collapse to one count
    // per series (by seriesId, falling back to the event's own id for a
    // genuinely one-time event) so the badge answers "how many DIFFERENT
    // things need a decision," matching what a user scanning the list
    // would actually count — not how many rows exist in the DB.
    const pendingSeries = new Set<string>();
    const activeSeries = new Set<string>();
    for (const e of upcoming) {
      const a = eventAssignee(e);
      if (!a.status) continue;
      const seriesKey = e.seriesId ?? e.id;
      if (a.status === 'pending') pendingSeries.add(seriesKey);
      else if (a.status === 'confirmed') activeSeries.add(seriesKey);
    }
    return { pending: pendingSeries.size, active: activeSeries.size };
  }, [events, rangeEvents, isSenior, activeMemberId, activeMember?.name]);

  // Reported live: a kid's "1 pending" badge here counted a chore assigned
  // to nobody (assignedToId: null) and not even in the pool (isPool:
  // false) — a genuinely orphaned todo chore that wasn't theirs, wasn't
  // claimable by them, and didn't appear anywhere in their own filtered
  // chore list below. This badge was scanning the family-wide chores array
  // unfiltered, instead of "mine, or something I could actually claim,"
  // the same scoping KidView.tsx's own myQuests/poolQuests already use.
  // A parent/senior keeps the family-wide count — they need visibility
  // into every kid's pending chores at a glance, not just their own.
  const choreCounts = useMemo(() => {
    let pending = 0, active = 0;
    const isKidOrTeen = activeMember?.role === 'kid' || activeMember?.role === 'teen';
    const isSenior = activeMember?.role === 'senior';
    // A GP is scoped to only their own assigned/sponsored chores — never
    // the general kid/teen bounty pool, even an inviteGrandparents-flagged
    // one. Was grouped with "parent" (family-wide, unrestricted count)
    // before this fix, same bug class as the kid/teen scoping fix right
    // below it (isRelevant existed for kids/teens; senior fell through to
    // the unrestricted branch instead of getting its own scoping).
    const isRelevant = (c: (typeof chores)[number]) =>
      isSenior
        ? c.assignedToId === activeMemberId || c.sponsorUserId === activeMemberId
        : (!isKidOrTeen || c.assignedToId === activeMemberId || (c.isPool && c.status === 'todo' && !c.inviteGrandparents));
    for (const c of chores) {
      if (!isRelevant(c)) continue;
      if (c.status === 'todo' || c.status === 'gp_offer_pending') pending++;
      else if (c.status === 'in_progress' || c.status === 'pending_approval' || c.status === 'pending_grandparent_approval' || c.status === 'pending_parent_approval') active++;
    }
    return { pending, active };
  }, [chores, activeMemberId, activeMember?.role]);

  // Work queue counts — parent-only. Unassigned + pending review = needs action.
  const queueCounts = useMemo(() => {
    if (!isParent) return { pending: 0, active: 0 };
    const unassigned = chores.filter(c => c.status === 'todo' && !c.assignedToId && c.isPool !== false).length;
    const pendingReview = chores.filter(c => c.status === 'pending_approval' || c.status === 'pending_parent_approval').length;
    const locked = chores.filter(c => c.status === 'in_progress').length;
    return { pending: unassigned + pendingReview, active: locked };
  }, [chores, isParent]);

  // Smart creator — one "+" regardless of segment. SmartTaskComposer
  // classifies free text live as the user types (via extractResponsibility)
  // into Event vs Quest, auto-fills category/assignee/coins, and creates
  // directly; "Adjust in full form" falls back to the real manual modals
  // below, pre-filled with whatever was already extracted.
  const [showComposer, setShowComposer] = useState(false);
  const [manualQuestPrefill, setManualQuestPrefill] = useState<{
    title?: string; coins?: number; assignedToId?: string; photoRequired?: boolean; dueDate?: string;
  } | undefined>(undefined);
  const [manualEventPrefill, setManualEventPrefill] = useState<{
    title?: string; category?: string; memberId?: string; startAt?: string; notes?: string;
    recurFreq?: 'daily' | 'weekly' | 'monthly'; recurDays?: number[];
    pickupLocation?: string; dropLocation?: string; returnTime?: string; helperId?: string;
  } | undefined>(undefined);
  const [showManualQuest, setShowManualQuest] = useState(false);
  const [showManualEvent, setShowManualEvent] = useState(false);

  // Parent creation: chooser → then either CreateResponsibilitySheet or DispatchRideSheet
  const [showFlowChooser, setShowFlowChooser] = useState(false);
  const [showResponsibilitySheet, setShowResponsibilitySheet] = useState(false);
  const [showRideSheet, setShowRideSheet] = useState(false);
  const [rideSeedMemberId, setRideSeedMemberId] = useState<string | undefined>();
  const [rideSeedTitle, setRideSeedTitle] = useState<string | undefined>();
  const [choreConvertTitle, setChoreConvertTitle] = useState<string | undefined>();
  const [choreConvertMemberId, setChoreConvertMemberId] = useState<string | undefined>();

  // Kid gets the same stacked "Ask Parent" picker the Hub's FAB opens
  // (AskParentSheet) instead of the unrestricted SmartTaskComposer —
  // routes to each dedicated modal below, no free-text guessing.
  const [showAskParentSheet, setShowAskParentSheet] = useState(false);
  const [groceryModal, setGroceryModal] = useState(false);
  const [suppliesModal, setSuppliesModal] = useState(false);
  const [askModal, setAskModal] = useState<null | 'permission' | 'question' | 'medication'>(null);
  const [questProposalModal, setQuestProposalModal] = useState(false);
  const [choreProposalModal, setChoreProposalModal] = useState(false);

  // Figma "Just describe it" full-page — dedicated Tasks-tab creation path
  const [showJustDescribe, setShowJustDescribe] = useState(false);
  const [showJustDescribeEvent, setShowJustDescribeEvent] = useState(false);
  const [justDescribeEventPrefill, setJustDescribeEventPrefill] = useState<{ date?: string; time?: string }>({});
  const [detailEvent, setDetailEvent] = useState<FamilyEvent | null>(null);
  const { deleteEvent } = useEventStore();
  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(showJustDescribe || showJustDescribeEvent || !!detailEvent);
    return () => { useUIStore.getState().setFullBleedScreenActive(false); };
  }, [showJustDescribe, showJustDescribeEvent, detailEvent]);

  // Deep-link support — other screens (e.g. the Hub's Next Up timeline) set
  // uiStore's requestedTasksSegment/requestedEventDetailId before navigating
  // here. requestedEventDetailId opens that event's full detail page
  // directly — previously tapping a Next Up card only landed on Schedule's
  // own default day view, leaving the user to find and tap the event again
  // themselves. Same one-shot pattern as openTaskComposerRequested above.
  useFocusEffect(useCallback(() => {
    const requestedSegment = useUIStore.getState().requestedTasksSegment;
    if (requestedSegment) {
      if (!lockedSegment || requestedSegment === lockedSegment) {
        useUIStore.getState().setRequestedTasksSegment(undefined);
        setSegment(requestedSegment);
      }
    }
    const requestedEventId = useUIStore.getState().requestedEventDetailId;
    if (requestedEventId) {
      useUIStore.getState().setRequestedEventDetailId(undefined);
      const found = useEventStore.getState().events.find(e => e.id === requestedEventId);
      if (found) setDetailEvent(found);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  // Figma .quick-capture — real text input; on submit opens JustDescribeIt screen
  const [rideRequestModal, setRideRequestModal] = useState(false);
  const openCreator = () => {
    if (isKidCreator) setShowAskParentSheet(true);
    else if (isParent || isSenior) setShowJustDescribe(true);
    else setShowComposer(true);
  };

  // Set by the shared FAB in app/(tabs)/_layout.tsx when tapped while
  // showing its Tasks-tab "+" face — opens SmartTaskComposer directly
  // (parent/teen path only; the shared FAB itself is parent-role-gated).
  //
  // A plain useFocusEffect-only subscription missed the common case: the
  // FAB is tapped while ALREADY on the Tasks tab, which doesn't fire a
  // focus event at all (the screen never lost focus), so the flag just
  // sat unconsumed in the store until the next unrelated focus change —
  // confirmed live: tapping the FAB did nothing, then the composer
  // "auto-opened" on returning from another tab. Subscribing directly to
  // the store reacts to the flag changing regardless of focus state;
  // useFocusEffect stays as a backstop for the flag having been set while
  // this screen wasn't mounted at all (e.g. set from a route that isn't
  // Tasks, then the user navigates here directly).
  const openTaskComposerRequested = useUIStore(s => s.openTaskComposerRequested);
  useEffect(() => {
    if (openTaskComposerRequested) {
      useUIStore.getState().setOpenTaskComposerRequested(false);
      if (isParent || isSenior) setShowJustDescribe(true);
      else setShowComposer(true);
    }
  }, [openTaskComposerRequested, isParent, isSenior]);

  useFocusEffect(useCallback(() => {
    if (useUIStore.getState().openTaskComposerRequested) {
      useUIStore.getState().setOpenTaskComposerRequested(false);
      if (isParent || isSenior) setShowJustDescribe(true);
      else setShowComposer(true);
    }
  }, [isParent, isSenior]));

  const activeQuery = segment === 'schedule' ? scheduleQuery : choreQuery;
  const setActiveQuery = segment === 'schedule' ? setScheduleQuery : setChoreQuery;

  // Figma TasksPage header — injected into QuestsScreen/CalendarScreen's own
  // ScrollView via headerContent so it scrolls with content.
  const todayISO = new Date().toISOString().slice(0, 10);
  const doneToday = chores.filter(c =>
    (c.status === 'approved' || c.status === 'auto_approved' || c.status === 'completed') &&
    ((c.approvedAt ?? c.createdAt ?? '').slice(0, 10) === todayISO)
  ).length;
  const stillOpen = choreCounts.pending + choreCounts.active;
  const helpers = chores.filter(c => c.status === 'in_progress' || c.status === 'pending_approval').length;

  const todayStr = localDateStr(new Date());
  const todayEventCount = events.filter(e => e.date === todayStr).length;
  const overdueCount = chores.filter(c => {
    if (!c.dueDate) return false;
    if (['done','approved','archived','cancelled','completed','auto_approved'].includes(c.status)) return false;
    return c.dueDate < todayStr && (activeMember?.role === 'parent' || c.assignedToId === activeMemberId);
  }).length;
  const scheduleSubtitle = todayEventCount === 0
    ? 'Nothing scheduled today — a calm day.'
    : `${todayEventCount} event${todayEventCount === 1 ? '' : 's'} today · tap any day to see more`;
  const tasksSubtitle = overdueCount > 0
    ? `${stillOpen} open · ${overdueCount} overdue — start with the late ones`
    : stillOpen > 0
      ? `${stillOpen} open · ${doneToday} done today`
      : doneToday > 0 ? `All caught up — ${doneToday} done today` : 'All caught up — nothing left to do';

  // Fixed header — title + tab switcher, never scrolls
  const isSchedule = segment === 'schedule' || lockedSegment === 'schedule';
  const fixedHeader = (
    <View style={{ backgroundColor: isDark ? '#0E0C13' : PAGE_BG, paddingBottom: 8 }}>
      <PageHeading
        eyebrow={`FAMILY CUBE · ${isSchedule ? 'SCHEDULE' : 'TASKS'}`}
        title={isSchedule ? 'Schedule' : 'Tasks'}
        subtitle={isSchedule ? scheduleSubtitle : tasksSubtitle}
        accent={isSchedule ? 'teal' : 'pink'}
        Icon={isSchedule ? CalendarDays : ListChecks}
        topInset={0}
      />
      {!lockedSegment && <View style={{
        flexDirection: 'row', gap: 4, marginHorizontal: 20,
        padding: 4, borderRadius: 14,
        backgroundColor: isDark ? colors.surface : '#F0EDE6',
      }}>
        {([
          { key: 'schedule' as const, label: 'Schedule' },
          { key: 'chores' as const, label: 'Tasks' },
        ] as { key: Segment; label: string }[]).map(({ key, label }) => {
          const active = segment === key;
          const needsAttention = !active && key === 'chores' && choreCounts.pending > 0;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => { setSegment(key); if (searchOpen) toggleSearch(false); if (aiOpen) setAiOpen(false); }}
              activeOpacity={0.85}
              style={{
                flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center',
                borderRadius: 10, flexDirection: 'row', gap: 5,
                backgroundColor: active ? (isDark ? colors.card : CARD_BG) : 'transparent',
                shadowColor: active ? 'rgba(44,39,34,0.10)' : 'transparent',
                shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500',
                color: active ? colors.pink : (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
                {label}
              </Text>
              {needsAttention && (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>}
    </View>
  );

  // Scrollable per-segment chrome injected into each child screen's ScrollView
  const tasksHeader = (
    <View>
      {/* CTA / Search bar — scrolls with content */}
      <View style={{ marginHorizontal: 20, marginTop: 6, marginBottom: 4, height: 52 }}>
        {searchOpen ? (
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center',
            borderRadius: 16, paddingHorizontal: 14, gap: 10,
            backgroundColor: segment === 'schedule' ? colors.tealLight : colors.primaryLight,
          }}>
            <Search size={18} color={segment === 'schedule' ? colors.teal : colors.primary} strokeWidth={2} />
            <TextInput
              autoFocus
              value={segment === 'schedule' ? scheduleQuery : choreQuery}
              onChangeText={segment === 'schedule' ? setScheduleQuery : setChoreQuery}
              placeholder={segment === 'schedule' ? 'Search events…' : 'Search tasks…'}
              placeholderTextColor={segment === 'schedule' ? colors.teal + '80' : colors.primary + '80'}
              style={{ flex: 1, fontSize: 15, fontWeight: '500', color: segment === 'schedule' ? colors.teal : colors.primary }}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={() => toggleSearch(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={segment === 'schedule' ? colors.teal : colors.primary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={segment === 'schedule' ? () => setShowJustDescribeEvent(true) : () => setShowJustDescribe(true)}
              activeOpacity={0.88}
              style={{
                flex: 1, height: 52, borderRadius: 16,
                backgroundColor: segment === 'schedule' ? colors.tealLight : colors.primaryLight,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: segment === 'schedule' ? colors.teal : colors.primary, letterSpacing: 0.2 }}>
                {segment === 'schedule' ? '+ Add event' : '+ Add task'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => toggleSearch(true)}
              activeOpacity={0.88}
              style={{
                width: 52, height: 52, borderRadius: 16,
                backgroundColor: segment === 'schedule' ? colors.tealLight : colors.primaryLight,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Search size={20} color={segment === 'schedule' ? colors.teal : colors.primary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tasks segment chrome */}
      {segment === 'chores' && (
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          {/* Status line */}
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
            {stillOpen > 0
              ? `${stillOpen} task${stillOpen === 1 ? '' : 's'} open · everyone sees what they own`
              : 'All clear — nothing left to do'}
          </Text>

          {/* Summary tiles */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {[
              { val: doneToday, label: 'done today',     bg: isDark ? 'rgba(61,122,90,0.18)'   : colors.tealLight,    color: colors.teal },
              { val: stillOpen, label: 'still open',     bg: isDark ? 'rgba(223,97,60,0.18)'   : colors.primaryLight, color: colors.primary },
              { val: helpers,   label: 'in progress',    bg: isDark ? 'rgba(123,94,167,0.18)'  : colors.pinkLight,    color: colors.pink },
            ].map(({ val, label, bg, color }) => (
              <View key={label} style={{
                flex: 1, borderRadius: 16, backgroundColor: bg,
                paddingVertical: 12, paddingHorizontal: 12,
              }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color }}>{val}</Text>
                <Text style={{ fontSize: 11, color, marginTop: 2, opacity: 0.8, fontWeight: '600' }}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

    </View>
  );

  // Full-page overlay — event detail. EventDetailScreen owns its own full-page
  // edit flow internally (swaps to JustDescribeItEventScreen in edit mode), so
  // no separate EditEventModal/editEvent plumbing is needed here.
  if (detailEvent) {
    return (
      <>
        <EventDetailScreen
          ev={detailEvent}
          onClose={() => setDetailEvent(null)}
          onDelete={async (id) => { await deleteEvent(id); setDetailEvent(null); }}
        />
      </>
    );
  }

  // Full-page overlay — renders instead of the tab content, same pattern as hub review screens
  if (showJustDescribeEvent) {
    return (
      <JustDescribeItEventScreen
        visible
        activeMemberId={activeMemberId ?? ''}
        prefillDate={justDescribeEventPrefill.date}
        prefillTime={justDescribeEventPrefill.time}
        onClose={() => { setShowJustDescribeEvent(false); setJustDescribeEventPrefill({}); }}
      />
    );
  }

  if (showJustDescribe) {
    return (
      <JustDescribeItScreen
        visible={true}
        onClose={() => setShowJustDescribe(false)}
        onOpenFullForm={(kind, prefill) => {
          setShowJustDescribe(false);
          setTimeout(() => {
            if (kind === 'quest') {
              setManualQuestPrefill(prefill as typeof manualQuestPrefill);
              setShowManualQuest(true);
            } else {
              setManualEventPrefill(prefill as typeof manualEventPrefill);
              setShowManualEvent(true);
            }
          }, 350);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : PAGE_BG }} edges={['top']}>
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />
      {fixedHeader}

      {segment === 'schedule'
        ? <CalendarScreen hideHeader hideCreateButton={false} hideSearchBar externalSearchQuery={scheduleQuery} headerContent={tasksHeader} onRequestJustDescribe={(prefill) => { setJustDescribeEventPrefill(prefill ?? {}); setShowJustDescribeEvent(true); }} onRequestEventDetail={(ev) => setDetailEvent(ev)} />
        : segment === 'queue'
        ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            {tasksHeader}
            <HouseholdWorkQueue activeMemberId={activeMemberId ?? ''} />
          </ScrollView>
        )
        : (
          <QuestsScreen
            hideHeader hideCreateButton hideSearchBar hideAiTrigger
            externalSearchQuery={choreQuery} headerContent={tasksHeader}
            onAiStateChange={setAiState} onExposeAiRunner={exposeAiRunner}
          />
        )}

      <AskParentSheet
        visible={showAskParentSheet} onClose={() => setShowAskParentSheet(false)} colors={colors} isDark={isDark}
        onPick={(choice) => {
          setShowAskParentSheet(false);
          setTimeout(() => {
            if (choice === 'ride') setRideRequestModal(true);
            else if (choice === 'grocery') setGroceryModal(true);
            else if (choice === 'supplies') setSuppliesModal(true);
            else if (choice === 'quest') setQuestProposalModal(true);
            else if (choice === 'chore') setChoreProposalModal(true);
            else setAskModal(choice);
          }, 300);
        }}
      />
      <GroceryModal visible={groceryModal} onClose={() => setGroceryModal(false)} active={activeMember!} />
      <SuppliesModal visible={suppliesModal} onClose={() => setSuppliesModal(false)} active={activeMember!} />
      {askModal && <AskModal visible={!!askModal} onClose={() => setAskModal(null)} type={askModal} active={activeMember!} />}
      <QuestProposalModal visible={questProposalModal} onClose={() => setQuestProposalModal(false)} active={activeMember!} />
      <KidChoreProposalModal
        visible={choreProposalModal} onClose={() => setChoreProposalModal(false)}
        active={activeMember!} members={members} familyId={activeMember?.familyId ?? ''}
      />
      <KidRequestModal visible={rideRequestModal} onClose={() => setRideRequestModal(false)} activeMemberId={activeMemberId ?? ''} />

      <SmartTaskComposer
        visible={showComposer}
        members={members}
        activeMemberId={activeMemberId ?? ''}
        familyId={activeMember?.familyId ?? ''}
        onClose={() => setShowComposer(false)}
        onCreated={() => setShowComposer(false)}
        onOpenFullForm={(kind, prefill) => {
          setShowComposer(false);
          if (kind === 'quest') {
            setManualQuestPrefill(prefill as typeof manualQuestPrefill);
            setShowManualQuest(true);
          } else {
            setManualEventPrefill(prefill as typeof manualEventPrefill);
            setShowManualEvent(true);
          }
        }}
      />

      {showManualQuest && (
        <AddQuestModal
          visible={showManualQuest}
          onClose={() => { setShowManualQuest(false); setManualQuestPrefill(undefined); }}
          activeMemberId={activeMemberId ?? ''}
          prefill={manualQuestPrefill}
          initialStep={manualQuestPrefill ? 'review' : undefined}
        />
      )}

      {showManualEvent && (
        <AddEventModal
          visible={showManualEvent}
          onClose={() => { setShowManualEvent(false); setManualEventPrefill(undefined); }}
          activeMemberId={activeMemberId ?? ''}
          prefill={manualEventPrefill as any}
          initialStep="review"
        />
      )}

      {/* Parent creation flow: chooser → responsibility or ride */}
      <TaskFlowChooser
        visible={showFlowChooser}
        onClose={() => setShowFlowChooser(false)}
        onChooseResponsibility={() => setShowResponsibilitySheet(true)}
        onChooseRide={() => setShowRideSheet(true)}
      />

      <CreateResponsibilitySheet
        visible={showResponsibilitySheet}
        onClose={() => { setShowResponsibilitySheet(false); setChoreConvertTitle(undefined); setChoreConvertMemberId(undefined); }}
        prefillTitle={choreConvertTitle}
        prefillMemberId={choreConvertMemberId}
        onCreated={() => setShowResponsibilitySheet(false)}
        onConvertToRide={(seed) => {
          setShowResponsibilitySheet(false);
          setRideSeedTitle(seed.title);
          setRideSeedMemberId(seed.memberId);
          setTimeout(() => setShowRideSheet(true), 300);
        }}
      />

      <DispatchRideSheet
        visible={showRideSheet}
        onClose={() => { setShowRideSheet(false); setRideSeedMemberId(undefined); setRideSeedTitle(undefined); }}
        seedMemberId={rideSeedMemberId}
        onDispatched={() => setShowRideSheet(false)}
        onConvertToChore={(seed) => {
          setShowRideSheet(false);
          setChoreConvertTitle(seed.title);
          setChoreConvertMemberId(seed.memberId);
          setTimeout(() => setShowResponsibilitySheet(true), 300);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tabCard: {
    flex: 1, borderRadius: RADIUS.lg, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 13,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
});
