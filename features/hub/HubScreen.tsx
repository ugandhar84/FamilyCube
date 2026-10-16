import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useDeviceClass } from '@/lib/useDeviceClass';
import KioskScreen from '@/features/kiosk/KioskScreen';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useEventStore } from '@/store/eventStore';
import { useRewardStore } from '@/store/rewardStore';
import { useChatStore } from '@/store/chatStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useTripStore } from '@/store/tripStore';
import { useUIStore } from '@/store/uiStore';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import AppHeader from '@/components/AppHeader';
import NotificationPanel from '@/components/NotificationPanel';
import { useNotifStore } from '@/store/notifStore';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import FlyerScannerModal from '@/components/FlyerScannerModal';
import PinEntryModal from '@/components/PinEntryModal';
import type { FamilyMember } from '@/store/familyStore';
import { ParentView } from './ParentView';
import JustDescribeItScreen from '@/features/tasks/components/JustDescribeItScreen';
import JustDescribeItEventScreen from '@/features/calendar/components/JustDescribeItEventScreen';
import FullPageOverlay from '@/components/FullPageOverlay';
import { ReviewInboxScreen, type ReviewCategory } from './parent/ReviewInboxScreen';
import { ChoresReviewQueueScreen } from './parent/ChoresReviewQueueScreen';
import { RewardsReviewQueueScreen } from './parent/RewardsReviewQueueScreen';
import { QuestDetailModal } from '@/features/quests/components/QuestDetailModal';
import { DisputesInboxScreen, type DisputeKind } from './parent/DisputesInboxScreen';
import { RidesControlRoomScreen } from './parent/RidesControlRoomScreen';
import { ActiveTripDetailScreen } from './parent/ActiveTripDetailScreen';
import { RedoDisputeReviewScreen } from './parent/RedoDisputeReviewScreen';
import { ApprovalDetailScreen } from './parent/ApprovalDetailScreen';
import { RewardReviewScreen } from './parent/RewardReviewScreen';
import HelpDispatchQueue from './HelpDispatchQueue';
import { KidRequestDetailScreen } from '@/features/hub/parent/KidRequestDetailScreen';
import RequestHelpModal from './RequestHelpModal';
import GroceryScreen from '@/features/grocery/GroceryScreen';
import MealsScreen from '@/features/vault/tabs/MealsScreen';
import RewardsDashboardScreen from '@/features/store/RewardsDashboardScreen';
import MemoriesScreen from '@/features/vault/tabs/MemoriesScreen';
import { KidView } from './KidView';
import { KidOverlays } from './kid/KidOverlays';
import { SeniorView } from './SeniorView';
import { TeenView } from './TeenView';
import { EnRouteModal } from './hubComponents';
import { fmtClock, localToday } from './hubUtils';
import GlobalCelebration from '@/components/GlobalCelebration';
import { AppsQuickAccessPills } from './AppsQuickAccessPills';
import { GEMINI } from '@/constants/geminiRhythm';

export default function HubScreen() {
  const { colors, isDark } = useTheme();
  const { deviceClass } = useDeviceClass();
  const { members, activeMemberId, setActiveMember, loaded, loadFromStorage } = useFamilyStore();
  const { loadFromStorage: loadQuests, quests } = useQuestStore();
  const { loadFromStorage: loadEvents }  = useEventStore();
  const { loadFromStorage: loadRewards } = useRewardStore();
  // Reactive subscription for the Rewards review queue screen below — was
  const { activeTrips: trips, loadFromStorage: loadTrip, dispatch: dispatchTrip,
          updateEta: updateTripEta, markOverdueAlertSent, complete: completeTrip } = useTripStore();

  const [refreshing, setRefreshing]        = useState(false);
  // Parent Hub only — hides the system status bar once the user starts
  // scrolling down, shows it again back at the top. 12px threshold so a
  // tiny rubber-band bounce at rest doesn't flicker it.
  const [statusBarHidden, setStatusBarHidden] = useState(false);
  const [pinTarget, setPinTarget]          = useState<FamilyMember | null>(null);
  const [clock, setClock]                  = useState(fmtClock());
  const [helpModalVisible, setHelpModal]   = useState(false);
  const [flyerVisible, setFlyerVisible]    = useState(false);
  const [enRouteVisible, setEnRouteVisible]= useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const unreadNotifCount = useNotifStore(s => s.unreadCount);
  // Kid/Teen/Senior's "smart ask/create" composer — the FAB that opens it
  // must live OUTSIDE this screen's own ScrollView (below) to actually
  // float, since KidView/TeenView/SeniorView render as scrolled content,
  // not their own positioned ancestor. Visibility is lifted up here so the
  // FAB (rendered here) and the composer (rendered inside each child view,
  // which still owns all the routing/import specifics) can share one flag.
  const [composerVisible, setComposerVisible] = useState(false);
  const insetsBottomForFab = useSafeAreaInsets().bottom;
  // Kid Hub's three FullPageOverlay screens (My Chores, Piggy Bank, Ask
  // Parent) — same "must render outside this screen's own ScrollView"
  // reasoning as composerVisible above. Rendered via KidOverlays
  // (features/hub/kid/KidOverlays.tsx) as a top-level sibling below,
  // matching Parent Hub's Meals/Rides Room position exactly. Previously
  // these lived inside KidView (itself scrolled content), so opening one
  // while the Hub was scrolled down opened the new page already scrolled
  // to match [live-reported, screenshot: My Chores opening on "Completed"
  // instead of the top; "All new pages opened with some pre scroll"].
  const [showMyChores, setShowMyChores] = useState(false);
  // Which tab My Chores opens on — set by the Needs You card so tapping it
  // lands directly on the most-urgent item's own tab (e.g. 'review' for a
  // submitted chore awaiting approval) instead of always defaulting to
  // 'todo'. Reset to undefined on close so the next plain-tile open starts
  // fresh on 'todo' again.
  const [myChoresInitialTab, setMyChoresInitialTab] = useState<'todo' | 'review' | 'done' | 'bounty' | undefined>(undefined);
  const [piggyBankModal, setPiggyBankModal] = useState(false);
  // Teen-only — Tutor/Cash-Out full-page overlays (KidOverlays renders
  // them for isTeen too). State lives here, same as My Chores/Piggy Bank
  // above, so the overlay itself stays a top-level sibling outside the
  // ScrollView per KidOverlays' own placement rule. (The handlers that
  // need `active` are declared further below, right after `active` itself
  // is defined — this block only declares the boolean state, which has no
  // such dependency.)
  const [teenTutorOpen, setTeenTutorOpen] = useState(false);
  const [teenCashOutOpen, setTeenCashOutOpen] = useState(false);
  const [teenGasVehicleOpen, setTeenGasVehicleOpen] = useState(false);
  // Hook calls themselves must sit above the `if (!active) return null;`
  // guard further below (Rules of Hooks) — only the values that actually
  // read `active` are derived after that guard.
  const { sendRequest: sendTeenRequest, requests: teenRequests, cancelRequest: cancelTeenRequest } = useKidRequestStore();
  const sendTeenChatMessage = useChatStore(s => s.sendMessage);
  const [askParentHubFromTile, setAskParentHubFromTile] = useState(false);
  const showAskParentHub = composerVisible || askParentHubFromTile;
  const closeAskParentHub = () => { setComposerVisible(false); setAskParentHubFromTile(false); };
  const [askParentDestination, setAskParentDestination] = useState<null | import('./kid/AskParentHubScreen').AskParentDestination>(null);
  // Parent Hub's TodayActionGrid "Add a task"/"Schedule" tiles — same
  // reasoning as composerVisible just above: the Describe It screens must
  // render OUTSIDE this screen's own ScrollView (below) to be a true
  // full-page replacement, not nested content that inherits this screen's
  // own avatar header and scroll position (live-reported bug). State lives
  // here; ParentView gets plain callbacks plus a ref for the "open full
  // form" handoff back into its own AddQuestModal/AddEventModal pair.
  const [showDescribeTask, setShowDescribeTask] = useState(false);
  const [showDescribeEvent, setShowDescribeEvent] = useState(false);
  // Same fullBleedScreenActive gate TasksScreen/CalendarScreen already use
  // for their own JustDescribeIt*Screen instances — hides the shared Ask
  // Cube FAB (app/(tabs)/_layout.tsx) while either full-page screen is open
  // here, so it doesn't float on top of them too.
  // Review inbox + its sub-screens — same lift-up pattern, same reasoning:
  // "review inbox should be same like full page view similar to the
  // describe it pages" (slide/fade entrance, edge-swipe-to-dismiss,
  // stacked outside the ScrollView), AND "we shouldn't be closing the
  // page when open the sub page/details page ... consider this is real
  // page handling" — opening a detail item no longer closes the inbox
  // first; the inbox stays mounted underneath (visible={showReviewInbox}
  // never flips false when a detail screen opens) and the detail screen
  // stacks on top of it at a higher zIndex, so swiping back out of the
  // detail screen reveals the still-open inbox, not the Hub.
  const [showReviewInbox, setShowReviewInbox] = useState(false);
  // Rides — same full-page treatment, same reason: "why didn't we make
  // that page similar to the review inbox ... all swipers and full screen
  // and figma rhythm." RidesControlRoomScreen stays mounted underneath
  // ActiveTripDetailScreen (real push/pop), not closed first.
  const [showRidesRoom, setShowRidesRoom] = useState(false);
  const [activeTripDetailId, setActiveTripDetailId] = useState<string | null>(null);
  const [showGrocery, setShowGrocery] = useState(false);
  const [showMeals, setShowMeals] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  // Category landing cards (ReviewInboxScreen) open one of these queue
  // screens, which in turn open the actual per-item detail screen below —
  // three levels deep (inbox → queue → detail), not inbox → detail
  // directly, per live direction: "review inbox should contain the high
  // level cards ... land then open those chore box, schedule box."
  const [showChoresQueue, setShowChoresQueue] = useState(false);
  const [showRedemptionsQueue, setShowRedemptionsQueue] = useState(false);
  const [showHelpQueue, setShowHelpQueue] = useState(false);
  const [activeKidRequestId, setActiveKidRequestId] = useState<string | null>(null);
  // Live direction: "we are going to have 2 duplicate cards ... better to
  // consolidate and use all richer elements ... make this the rich feature
  // screen" — ChoreProofReviewScreen/QuestReviewScreen (thinner, newer,
  // Figma-mock-driven) and QuestDetailModal (the full command-center used
  // everywhere else: claim/submit/approve/reassign/edit/call-reminder/
  // dispute/history) were two separate screens solving the same "review
  // this submission" problem. QuestDetailModal already had everything
  // ChoreProofReviewScreen had (Approve +N/balance-impact copy, redo-with-
  // reason presets, decline) PLUS all its other functionality — the only
  // real gap was its "Earlier submission" block reading the single, stale
  // declineReason field instead of the real chore_submissions history
  // table (ported in below). One id now covers both chores and quests,
  // since QuestDetailModal already handles both via the same Quest type.
  const [reviewQuestDetailId, setReviewQuestDetailId] = useState<string | null>(null);
  const [reviewRedemptionId, setReviewRedemptionId] = useState<string | null>(null);
  const [showRequestHelp, setShowRequestHelp] = useState(false);
  // "Disputes" category — two mechanisms, both previously unreachable from
  // anywhere on the Hub: 'kid_disputed_redo' (RedoDisputeReviewScreen) and
  // disputeStatus: 'reversal_requested' (ReversalCoSignReviewScreen), both
  // listed on DisputesInboxScreen.
  const [showDisputesInbox, setShowDisputesInbox] = useState(false);
  const [redoDisputeChoreId, setRedoDisputeChoreId] = useState<string | null>(null);
  const [reversalChoreId, setReversalChoreId] = useState<string | null>(null);
  const approvalDetailRequest = useUIStore(st => st.openApprovalDetailChoreId);
  useEffect(() => {
    if (!approvalDetailRequest) return;
    useUIStore.getState().setOpenApprovalDetailChoreId(null);
    setReversalChoreId(approvalDetailRequest);
  }, [approvalDetailRequest]);
  const groceryRequest = useUIStore(st => st.openGroceryScreenRequested);
  useEffect(() => {
    if (!groceryRequest) return;
    useUIStore.getState().setOpenGroceryScreenRequested(false);
    setShowGrocery(true);
  }, [groceryRequest]);
  const mealsRequest = useUIStore(st => st.openMealsScreenRequested);
  useEffect(() => {
    if (!mealsRequest) return;
    useUIStore.getState().setOpenMealsScreenRequested(false);
    setShowMeals(true);
  }, [mealsRequest]);
  const rewardsRequest = useUIStore(st => st.openRewardsScreenRequested);
  useEffect(() => {
    if (!rewardsRequest) return;
    useUIStore.getState().setOpenRewardsScreenRequested(false);
    setShowRewards(true);
  }, [rewardsRequest]);
  const memoriesRequest = useUIStore(st => st.openMemoriesScreenRequested);
  useEffect(() => {
    if (!memoriesRequest) return;
    useUIStore.getState().setOpenMemoriesScreenRequested(false);
    setShowMemories(true);
  }, [memoriesRequest]);
  useEffect(() => {
    const anyFullBleedOpen = showDescribeTask || showDescribeEvent || showReviewInbox || showRidesRoom || showGrocery || showMeals || showRewards || showMemories
      || showMyChores || piggyBankModal || showAskParentHub || !!askParentDestination;
    useUIStore.getState().setFullBleedScreenActive(anyFullBleedOpen);
    // Live direction: "remove the bottom nav on the sub pages" — the
    // Figma mocks for every one of these full-page screens
    // (JustDescribeIt*, Review inbox + its whole category/detail stack)
    // show no tab bar at all. fullBleedScreenActive already hid the
    // shared Ask Cube FAB for these screens but never actually hid the
    // tab bar itself — hideTabBar/showTabBar (lib/tabBarVisibility.ts)
    // existed but had no caller anywhere in the app. showReviewInbox
    // alone covers the WHOLE stack underneath it too (Chores/Rewards/
    // Disputes queues, every detail screen) since the inbox never closes
    // while a child screen is open — see FullPageOverlay's own doc.
    if (anyFullBleedOpen) hideTabBar(); else showTabBar();
    return () => { useUIStore.getState().setFullBleedScreenActive(false); showTabBar(); };
  }, [showDescribeTask, showDescribeEvent, showReviewInbox, showRidesRoom, showGrocery, showMeals, showRewards, showMemories,
      showMyChores, piggyBankModal, showAskParentHub, askParentDestination]);
  const describeFullFormRef = useRef<((kind: 'quest' | 'event', prefill: Record<string, any>) => void) | null>(null);

  // Drive ParentView's entrance animation from HubScreen's focus events —
  // ParentView is a child inside HubScreen's ScrollView so useFocusEffect
  // never fires there. HubScreen is at the tab level (no real stack pushes
  // on its own navigator — full-page overlays are position:absolute Views,
  // not router pushes), so we always play the animation on every tab focus.
  const [hubFocusKey, setHubFocusKey] = useState(0);
  useFocusEffect(useCallback(() => {
    setHubFocusKey(k => k + 1);
  }, []));

  useEffect(() => {
    if (!loaded) loadFromStorage();
    loadQuests();
    loadEvents();
    loadRewards();
  }, [loaded]);

  const familyId = (members[0] as any)?.familyId as string | undefined;
  useEffect(() => {
    if (familyId) loadTrip(familyId);
  }, [familyId]);

  // Refresh connected work-calendar FreeBusy data reactively whenever the
  // Hub is opened (live direction: "dynamic", not a fixed background
  // schedule) — throttled to once per 10 minutes per family so switching
  // tabs back and forth doesn't refetch on every mount. A brand-new
  // conflict from a change on the connected calendar itself (no
  // FamilyCube-side edit) only becomes visible on the next of these
  // checks, which is an acceptable trade for not hammering the FreeBusy
  // API on every Hub focus.
  //
  // Was a plain useEffect keyed on [familyId] — Expo Router's tab
  // navigator keeps HubScreen MOUNTED across tab switches by default, so
  // this only ever ran once per app session (or once per familyId
  // change), never on returning to the Hub tab, despite its own comment
  // claiming "reactively whenever the Hub is opened." useFocusEffect
  // actually re-runs on every tab focus; the existing throttle already
  // caps how often the real network call fires, so this only changes
  // "once ever" into "at most every 10 minutes, genuinely on return to
  // Hub" (live-reported: an edit made directly on Google Calendar was
  // confirmed applied server-side but never appeared in the app without
  // an explicit pull-to-refresh).
  useFocusEffect(useCallback(() => {
    if (!familyId) return;
    const THROTTLE_MS = 10 * 60_000;
    const key = `calendar_freebusy_last_sync_${familyId}`;
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const last = await AsyncStorage.getItem(key);
        if (last && Date.now() - Number(last) < THROTTLE_MS) return;
        await AsyncStorage.setItem(key, String(Date.now()));
        const { supabase } = await import('@/lib/supabase');
        supabase.functions.invoke('calendar-freebusy-sync', { body: { familyId } })
          .catch(e => console.warn('[HubScreen] calendar-freebusy-sync failed', e?.message));
      } catch (e) {
        console.warn('[HubScreen] freebusy throttle check failed', e);
      }
    })();
  }, [familyId]));

  // Personal Google connections' inbound sync — Google's channels.watch
  // push requires the webhook domain to be verified in Search Console
  // under the same Cloud project as the OAuth client, which isn't
  // achievable on a supabase.co domain we don't control DNS for (confirmed
  // live: watch registration succeeds but Google never actually delivers
  // a push here). Polling on the same reactive-on-Hub-focus + 10-minute
  // throttle pattern as the FreeBusy sync above is the real inbound-sync
  // path — sync_token keeps each poll cheap. Outlook keeps its own real
  // push subscription (no equivalent domain requirement), so this is
  // Google-only. Same useFocusEffect fix as the FreeBusy check above —
  // this previously only ran once per app session, not on every return
  // to the Hub tab.
  useFocusEffect(useCallback(() => {
    if (!familyId) return;
    const THROTTLE_MS = 10 * 60_000;
    const key = `calendar_google_poll_last_sync_${familyId}`;
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const last = await AsyncStorage.getItem(key);
        if (last && Date.now() - Number(last) < THROTTLE_MS) return;
        await AsyncStorage.setItem(key, String(Date.now()));
        const { supabase } = await import('@/lib/supabase');
        await supabase.functions.invoke('calendar-google-poll', { body: { familyId } })
          .catch(e => console.warn('[HubScreen] calendar-google-poll failed', e?.message));
        // loadEvents() re-reads calendar_events AFTER the poll's own write
        // completes — without this, the poll could correctly apply an
        // edit/delete server-side while the client's already-loaded
        // events array stayed stale until some LATER, unrelated refresh
        // happened to run (the exact race just fixed in onRefresh above,
        // reproduced here for the passive/automatic path too). force:true
        // is required here — plain loadEvents() hits selectDate's own SWR
        // cache guard (today's date already loaded => instant no-op),
        // which is exactly what silently swallowed this refresh before
        // (live-reported: Google-side delete correctly removed the row
        // server-side, confirmed via Schedule's own agenda view, yet the
        // Hub's "Today's Timeline" card kept showing it indefinitely,
        // because nothing ever forced a real re-fetch afterward).
        await loadEvents(true);
        // Google Tasks is a completely separate API from Calendar (its
        // own tasks.readonly scope) — a Task created via the Calendar
        // app's "+ -> Task" flow never appears in calendar.events at all
        // (confirmed live: a real test task was invisible to
        // calendar-google-poll for exactly this reason). Synced into
        // Chores/Quests, not Schedule. Same throttle key/window as the
        // Calendar poll above — one Hub-open check covers both.
        supabase.functions.invoke('calendar-google-tasks-poll', { body: { familyId } })
          .catch(e => console.warn('[HubScreen] calendar-google-tasks-poll failed', e?.message));
      } catch (e) {
        console.warn('[HubScreen] google poll throttle check failed', e);
      }
    })();
  }, [familyId, loadEvents]));

  // Apple/EventKit 2-way sync's inbound half — no push/webhook mechanism
  // exists for a local device calendar, so this reconciles on foreground
  // instead (lib/calendarSync2Way.ts's own throttle keeps this to once
  // per 15 minutes per member). Was a plain useEffect — same
  // mount-only-not-focus-reactive bug as the Google/FreeBusy checks
  // above, fixed the same way with useFocusEffect.
  useFocusEffect(useCallback(() => {
    if (!activeMemberId || !familyId) return;
    const active = members.find(m => m.id === activeMemberId);
    if (!active?.appleCalendarSyncEnabled) return;
    (async () => {
      try {
        const { reconcileAppleCalendar } = await import('@/lib/calendarSync2Way');
        const { events, addEvent, updateEvent, deleteEvent } = useEventStore.getState();
        await reconcileAppleCalendar(activeMemberId, familyId, events, { addEvent, updateEvent, deleteEvent });
        await loadEvents(true);
      } catch (e) {
        console.warn('[HubScreen] Apple calendar reconcile failed', e);
      }
    })();
  }, [activeMemberId, familyId, members, loadEvents]));

  // Genuine gap, not covered by the Google/Apple sync useFocusEffects
  // above (those only fire when a sync is actually enabled): a school
  // period (or any event) created on a DIFFERENT screen/session — the
  // Vault's School tab, another device, another parent — writes a real
  // calendar_events row immediately, but selectDate's own SWR cache guard
  // (store/eventStore.ts) no-ops a plain loadEvents() call whenever
  // dayEvents already has ANY items for today, even if they predate the
  // new row — [live-reported: "the same school schedule is not showing in
  // kids hub" / "kids and tennis for them it's today"]. The mount-time
  // loadEvents() at this file's top only ever runs once per app session
  // (gated on `loaded`, not re-triggered by tab focus), so returning to
  // Hub after creating a schedule elsewhere never re-fetches. Forces a
  // real re-fetch on every Hub focus instead — cheap (one DB hit for
  // today's events), and this is exactly the same "must refresh on every
  // return to Hub" pattern already used above for the Google/Apple sync
  // checks.
  useFocusEffect(useCallback(() => {
    loadEvents(true);
  }, [loadEvents]));

  useEffect(() => {
    const id = setInterval(() => setClock(fmtClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Was: calendar-google-poll/reconcileAppleCalendar ran in Promise.all
    // ALONGSIDE loadEvents(), racing them — loadEvents() is a plain DB
    // read that resolves almost immediately, while the poll does a real
    // Google API round-trip first and only writes to calendar_events
    // afterward. loadEvents() consistently won the race and refreshed the
    // client with the PRE-update row, and nothing ever re-fetched after
    // the poll's own write actually landed — live-confirmed: the debug
    // log showed the poll correctly detected and applied the edit
    // ("updated(event_id=...)"), yet the app kept showing the stale time,
    // because it had already loaded events before that write happened.
    // Must await the external syncs FIRST, then load local data from
    // whatever they left behind.
    if (familyId) {
      try {
        const { supabase } = await import('@/lib/supabase');
        await supabase.functions.invoke('calendar-google-poll', { body: { familyId } });
      } catch (e: any) {
        console.warn('[HubScreen] manual refresh calendar-google-poll failed', e?.message);
      }
    }
    const activeForRefresh = members.find(m => m.id === activeMemberId);
    if (activeMemberId && activeForRefresh?.appleCalendarSyncEnabled && familyId) {
      try {
        const { reconcileAppleCalendar } = await import('@/lib/calendarSync2Way');
        const { events, addEvent, updateEvent, deleteEvent } = useEventStore.getState();
        await reconcileAppleCalendar(activeMemberId, familyId, events, { addEvent, updateEvent, deleteEvent }, { force: true });
      } catch (e: any) {
        console.warn('[HubScreen] manual refresh Apple reconcile failed', e?.message);
      }
    }
    // loadQuests (choreAdapter's loadFromStorage) only re-reads AsyncStorage
    // cache — it never hits the DB. Calling it alongside syncFromDB used to
    // race the two: loadQuests' local disk read is faster than syncFromDB's
    // network round-trip, so it would resolve second and clobber the fresh
    // DB data right back to the stale cached copy. syncFromDB already
    // rewrites AsyncStorage itself once it has fresh data, so there's
    // nothing for loadQuests to add here — drop it.
    await Promise.all([useChoreStore.getState().syncFromDB(true), loadEvents(true)]);
    setRefreshing(false);
  }, [familyId, activeMemberId, members]);

  const active   = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = active?.role === 'parent';
  const isSenior = active?.role === 'senior';
  const isTeen   = active?.role === 'teen';
  const isKid    = !isParent && !isSenior && !isTeen;

  if (!active) return null;

  // Derived Teen Tutor/Cash-Out data — same logic TeenView.tsx already has,
  // duplicated here (cheap) so KidOverlays (rendered outside the
  // ScrollView, see its own doc comment) can own these overlays without
  // TeenView needing to render FullPageOverlay content from inside the
  // scrolled content box. Placed after the `if (!active) return null;`
  // guard above since every one of these reads `active`.
  const teenSiblings = members.filter(m => (m.role === 'kid' || m.role === 'teen') && m.id !== active.id);
  const teenPendingOffers = teenRequests.filter(r =>
    r.fromMemberId === active.id && r.status === 'pending' && (r.type === 'tutor' || r.type === 'cheer'));
  const sendTeenTutorOffer = (kid: FamilyMember, subject: string, note: string) => {
    const detail = `${active.name.split(' ')[0]} can help ${kid.name.split(' ')[0]} with ${subject}${note ? ` — ${note}` : ''}`;
    sendTeenRequest({ type: 'tutor', fromMemberId: active.id, detail, urgency: 'normal' });
    sendTeenChatMessage('all', active.id, `🎒 ${detail}`, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
  };
  const requestTeenCashOut = (amount: string, method: string) => {
    const coins = (active as any).mainCoins ?? (active as any).coins ?? 0;
    const detail = `💵 Cash-out request: $${amount} via ${method} (balance: ${coins} coins)`;
    sendTeenRequest({ type: 'delegation', fromMemberId: active.id, detail, urgency: 'normal' });
    sendTeenChatMessage('all', active.id, `${active.name.split(' ')[0]} requested cash-out: $${amount} via ${method}`, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
  };
  // Cash-out request history — same requests list, filtered to this teen's
  // own delegation-type (cash-out) requests, newest first. Feeds
  // TeenCashOutPage's Pending/Settled/Rejected/All tabs.
  const teenCashOuts = teenRequests
    .filter(r => r.fromMemberId === active.id && r.type === 'delegation')
    .sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''));
  const reportTeenVehicleIssue = (issue: string) => {
    const detail = `🚗 Vehicle issue reported by ${active.name.split(' ')[0]}: ${issue}`;
    sendTeenRequest({ type: 'emergency', fromMemberId: active.id, detail, urgency: 'soon' });
    sendTeenChatMessage('all', active.id, detail, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
  };

  // Wall-mounted kitchen tablet — a fully separate dashboard/nav-rail UI,
  // not the phone Hub resized. See features/kiosk/ for the whole feature;
  // this is its only touch-point into existing mobile screens. Placed after
  // all hooks above (Rules of Hooks) so a live device-class change (window
  // resize/rotation) never skips a hook on some renders but not others.
  if (deviceClass === 'kitchenHub') return <KioskScreen />;

  // Shape EnRouteBanner/ParentView/KidView/etc already expect, one per
  // active trip — resolved fresh on every render from the synced trip rows
  // + this device's own members list, so every viewer (driver, requester,
  // other parent) sees the same trips. Multiple trips can be active at once
  // (e.g. two parents each driving a different pickup) — each gets its own
  // view object here rather than only ever deriving from a single trip.
  const tripViews = trips.map(t => {
    const driver = members.find(m => m.id === t.driverMemberId);
    const pickup = t.pickupMemberId ? members.find(m => m.id === t.pickupMemberId) : undefined;
    return {
      tripId: t.id,
      kidName: pickup?.name.split(' ')[0] ?? 'Family', kidEmoji: pickup?.emoji,
      driverName: driver?.name.split(' ')[0] ?? 'Someone', driverEmoji: driver?.emoji,
      driverMemberId: t.driverMemberId,
      etaMinutes: t.etaMinutes,
      startedAtMs: new Date(t.startedAt).getTime(),
      overdueAlertSent: t.overdueAlertSent,
      // Real trip phase (assigned/en_route/picked_up/arrived) — was
      // dropped from this view shape entirely; RidesStatusCard (Hub home)
      // and RidesControlRoomScreen's own TripCard both need it to show the
      // same progress stages instead of RidesStatusCard guessing a phase
      // from elapsed time, which invented its own stage names that didn't
      // match tripStore's real TripPhase values or RidesControlRoomScreen's
      // own PHASE_STAGES labels.
      phase: t.phase,
    };
  });

  // ParentView's dispatch card is driver-scoped (it shows THIS parent's own
  // trip with editable controls, or the dispatch button if they have none)
  // — "my" trip is the one this active member is driving, if any, else the
  // single most-recent OTHER trip (shown read-only). Every trip beyond that
  // goes in otherTripViews so a second/third concurrent trip is never
  // dropped. Kid/Teen/Senior views aren't driver-scoped — they get the full
  // tripViews list directly (family-wide visibility, see tripStore.ts).
  const myTripView = tripViews.find(v => v.driverMemberId === activeMemberId);
  const primaryTripView = myTripView ?? tripViews[0] ?? null;
  const otherTripViews = tripViews.filter(v => v.tripId !== primaryTripView?.tripId);

  // Figma Make reskin's .page is ONE scrollable container, header included
  // (src/index.css — .topbar carries no sticky/fixed positioning, it's just
  // the first child of .page) — per explicit direction ("keep everything
  // under a scrollable view including the page header"), AppHeader moves
  // INSIDE the ScrollView for parent specifically, scrolling away with the
  // rest of the content instead of staying pinned above it. kid/teen/senior
  // keep the existing fixed-header layout (this work hasn't touched those
  // views) — same header component/props either way, just where it renders.
  const headerEl = (
    <AppHeader
      memberName={active.name.split(' ')[0]}
      memberRole={active.role as 'parent' | 'kid' | 'teen' | 'senior'}
      memberEmoji={active.emoji}
      memberAvatarUrl={active.avatarUrl}
      notifCount={unreadNotifCount}
      onBellPress={() => setNotifPanelOpen(true)}
      // Header gear icon removed — the new Profile pill in
      // AppsQuickAccessPills (leads the default row) is the sole entry
      // point to /profile-settings for every role now.
      //
      // Parent role gets the Figma Make reskin's compact TopBar (avatar +
      // family/name + "+" button, no role badge/Switch-Profile text row) —
      // per explicit direction, follow the mock for the parent Hub
      // specifically. Kid and Teen now share the same compact header
      // ["hub page header is still not matched with the parent/kids
      // headers" — Teen was left on the old full header/role-mode pill
      // after the rest of the Teen Hub rebuild]; senior keeps the existing
      // full header unchanged (out of scope here).
      compact={isParent || active.role === 'kid' || isTeen}
      // ParentView owns its own Smart Task Composer internally (its own
      // showTaskComposer state via useParentModals) — not reachable from
      // here across the component boundary, unlike composerVisible (which
      // only Kid/Teen/Senior views are wired to). Routes to the Tasks tab
      // instead, same destination TodayActionGrid's own "Add a task" tile
      // already offers.
      onAddPress={isParent ? () => router.push('/(tabs)/tasks' as any) : undefined}
    />
  );

  // Figma Make reskin's .page has no top safe-area inset at all — content
  // (including .topbar) starts flush at the very top of the viewport, no
  // status-bar clearance (src/index.css — .page's only padding is
  // "22px 20px 116px", no env(safe-area-inset-top) anywhere). Per explicit
  // direction ("remove that as well just it should flow the page"), the top
  // SafeAreaView edge is dropped for parent specifically — the header now
  // scrolls up under the status bar/notch area on a real device instead of
  // staying clear of it. kid/teen/senior keep the existing SafeAreaView
  // top inset unchanged (this work hasn't touched those views).
  // "Gemini rhythm" canvas (CLAUDE.md rule 6 exception, extended per
  // explicit request — see Home Care's own identical comment for the full
  // rationale) [live-requested: "how about tasks and home, chat, family"
  // -> "proceed"]. Applies to every role (parent/kid/teen/senior) — the
  // Figma Make parent reskin's own exact spec didn't specify a canvas
  // color beyond the app's own background token, so this doesn't conflict
  // with its pixel-faithful layout/spacing values, only the base fill.
  const hubCanvas = isDark ? colors.background : GEMINI.canvas;
  const RootContainer = isParent ? View : SafeAreaView;
  const rootProps = isParent
    ? { style: { flex: 1, backgroundColor: hubCanvas } }
    : { style: { flex: 1, backgroundColor: hubCanvas }, edges: ['top'] as const };

  return (
    <RootContainer {...rootProps}>
      {/* Scroll-driven status bar — visible at rest/near the top (same
          app-wide config as every other screen), hides once the user
          starts scrolling down (statusBarHidden, set by the ScrollView's
          onScroll below), reappears back near the top. An earlier flat
          "always hidden" pass was reverted (the real notch/Dynamic Island
          still physically covers content either way — the 59px top
          padding on the ScrollView is what actually clears the hardware
          cutout); this only hides the icons themselves, and only while
          actively scrolled away from the top. Parent Hub only. */}
      {isParent && <StatusBar hidden={statusBarHidden} animated />}
      {/* kid/teen now share parent's inside-ScrollView header placement
          (see below) so their FullPageOverlay screens can cover it,
          matching "parent hub rhythm" ["Align the kids hub header similar
          to the parent"; "hub page header is still not matched with the
          parent/kids headers" for teen]. senior unchanged — still the
          original fixed sibling here, outside the ScrollView.
          AppsQuickAccessPills (Profile/Store/School/Health/... pill row)
          also removed for teen here — teen no longer wants that row
          ["remove the header pill option from here teens"] — Rides now
          lives under the member's own profile per a toggle instead of a
          Hub quick action, so it isn't part of this row's purpose either;
          senior keeps it unchanged. */}
      {!isParent && active.role !== 'kid' && !isTeen && headerEl}
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />
      {!isParent && active.role !== 'kid' && !isTeen && <AppsQuickAccessPills role={active.role} colors={colors} isDark={isDark} />}

      <ScrollView
        showsVerticalScrollIndicator={false}
        // Child views render bottom-sheet modals with suggestion chips. Without this,
        // this ancestor ScrollView eats the first tap to dismiss the keyboard and the
        // chip's onPress never fires. (CalendarScreen avoids it by rendering its
        // modals outside the ScrollView.)
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: hubCanvas }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        // The shared Ask Cube FAB (app/(tabs)/_layout.tsx) floats at
        // bottom: insets.bottom + 74, is 52px tall, and sits ABOVE this
        // screen's content in z-order — its full vertical reach is roughly
        // insets.bottom + 74 to insets.bottom + 126 from the screen edge.
        // 60px of bottom padding here let scrolled content (e.g. the last
        // line of Household Backlog) end up directly underneath and
        // obscured by it (flagged in UI review). 140 clears the FAB's full
        // span with room to spare regardless of device inset.
        // Figma's own .page padding-top is 22px (src/index.css:71), but
        // that's a browser mock with no notch/Dynamic Island to clear — at
        // 22px real content was covered by the hardware cutout on a real
        // device (live-reported: "the notch is covering"). Per explicit
        // direction, fixed at 59px (iPhone Pro-class notch/Dynamic Island
        // height) rather than reading the device's own real inset — clears
        // the cutout on current Pro-class devices; won't be pixel-exact on
        // older/non-notch iPhones (undershoots are impossible here since
        // this is now MORE than Figma's 22px, never less). kid/teen/senior
        // keep the original 2px (unaffected — their SafeAreaView top inset
        // still sits above their ScrollView).
        contentContainerStyle={{ paddingTop: isParent ? 59 : 2, paddingBottom: 100 }}
        onScroll={isParent ? (e) => {
          const y = e.nativeEvent.contentOffset.y;
          setStatusBarHidden(prev => {
            if (!prev && y > 12) return true;
            if (prev && y <= 12) return false;
            return prev;
          });
        } : undefined}
        scrollEventThrottle={isParent ? 100 : undefined}
      >
        {(isParent || active.role === 'kid' || isTeen) && headerEl}
        {isParent && (
          <ParentView
            focusKey={hubFocusKey}
            active={active} members={members} colors={colors} isDark={isDark}
            onScanFlyer={() => setFlyerVisible(true)}
            onDescribeTask={() => setShowDescribeTask(true)}
            onDescribeEvent={() => setShowDescribeEvent(true)}
            describeFullFormRef={describeFullFormRef}
            onReviewOpen={() => setShowReviewInbox(true)}
            onRidesOpen={() => setShowRidesRoom(true)}
            onDispatchDirect={(memberId, etaMinutes, eventId) => {
              if (!familyId) return;
              dispatchTrip({ familyId, driverMemberId: active.id, pickupMemberId: memberId, etaMinutes, eventId });
            }}
            onPickupDone={(tripId) => {
              const v = tripViews.find(tv => tv.tripId === tripId);
              if (v) {
                useChatStore.getState().sendMessage('all', v.driverMemberId, `✅ ${v.driverName} picked up ${v.kidName}`);
              }
              completeTrip(tripId);
            }}
            onCancelTrip={(tripId) => completeTrip(tripId)}
            activeTrip={primaryTripView}
            otherActiveTrips={otherTripViews}
            onUpdateEta={(tripId, etaMinutes) => updateTripEta(tripId, etaMinutes)}
          />
        )}
        {isKid && (
          <KidView
            focusKey={hubFocusKey}
            active={active} members={members} colors={colors} isDark={isDark}
            activeTrips={tripViews} familyId={familyId}
            composerVisible={composerVisible} onCloseComposer={() => setComposerVisible(false)}
            onMyChores={() => setShowMyChores(true)}
            onOpenMyChoresTab={(tab) => { setMyChoresInitialTab(tab); setShowMyChores(true); }}
            onPiggyBank={() => setPiggyBankModal(true)}
            onAskParentTile={() => setAskParentDestination('permission')}
            onAskForRide={() => setAskParentDestination('ride')}
            onRideStatusOpen={() => setShowRidesRoom(true)}
          />
        )}
        {isTeen && (
          <TeenView
            focusKey={hubFocusKey}
            active={active} members={members} colors={colors} isDark={isDark}
            activeTrips={tripViews} familyId={familyId}
            composerVisible={composerVisible} onCloseComposer={() => setComposerVisible(false)}
            onMyChores={() => setShowMyChores(true)}
            onOpenMyChoresTab={(tab) => { setMyChoresInitialTab(tab); setShowMyChores(true); }}
            onPiggyBank={() => setPiggyBankModal(true)}
            onAskParentTile={() => setAskParentDestination('permission')}
            onAskForRide={() => setAskParentDestination('ride')}
            onRideStatusOpen={() => setShowRidesRoom(true)}
            onOpenTutor={() => setTeenTutorOpen(true)}
            onOpenCashOut={() => setTeenCashOutOpen(true)}
            onOpenGasVehicle={() => setTeenGasVehicleOpen(true)}
          />
        )}
        {isSenior && (
          <SeniorView
            active={active} members={members} colors={colors} isDark={isDark}
            onHelpRequest={() => setHelpModal(true)}
            onEnRoute={() => setEnRouteVisible(true)}
            activeTrips={tripViews} familyId={familyId}
            composerVisible={composerVisible} onCloseComposer={() => setComposerVisible(false)}
          />
        )}
      </ScrollView>

      {/* One instance per active trip — chat broadcast (30s in) and the
          overdue check both need to run independently per trip so two
          simultaneous trips (different drivers) each fire their own,
          instead of only the first trip found getting a working alert.
          Renders nothing; each instance is keyed by driverMemberId so a
          driver who starts a NEW trip after completing a previous one gets
          a fresh effect cycle rather than reusing stale timers. */}
      {tripViews.map(v => (
        <TripEffects key={v.tripId} view={v} activeMemberId={activeMemberId}
          overdueAlertSent={v.overdueAlertSent} markOverdueAlertSent={markOverdueAlertSent} />
      ))}

      <GlobalCelebration />

      {/* GP's "Ask" button (Lend a Hand card) now opens the SAME event form
          Parent Hub uses — previously a separate, entirely different
          component (HelpRequestModal/useHelpStore) that wrote to a
          different table nothing else in the app read, so a GP's help
          request was invisible to Action Needed, the ride-visibility
          fixes, series propagation, everything. AddEventModal already had
          full isSenior support (role-gated category list, Medical/Work/
          Event/Other) built in and just wasn't wired up here — this is the
          one missing connection, not new logic. Kid Hub already made this
          exact switch previously (KidView's own onHelpRequest prop is now
          dead/unused for the same reason). */}
      <AddEventModal visible={helpModalVisible} onClose={() => setHelpModal(false)} activeMemberId={activeMemberId ?? ''} />
      <FlyerScannerModal visible={flyerVisible} onClose={() => setFlyerVisible(false)} />

      {/* Parent Hub's "Add a task"/"Schedule" quick actions — rendered here,
          not inside ParentView, so each is a true full-page replacement
          instead of nesting inside this screen's own ScrollView/avatar
          header (live-reported: stray header + wrong scroll position).
          BOTH screens are written as `flex: 1` root views meant to be the
          ENTIRE return value of their real call sites (TasksScreen/
          CalendarScreen early-return them in place of their whole screen
          tree) — mounted as a plain sibling here inside RootContainer's
          View, a `flex: 1` child competing for space among several other
          siblings (ScrollView, TripEffects, GlobalCelebration, modals…)
          rendered with no visible height and no stacking priority, so the
          state flip happened (confirmed via a tap-log) but nothing ever
          appeared on screen. `position: absolute` + full-bounds + zIndex
          pulls it out of that flex flow so it actually covers the screen,
          same effect an early return gives TasksScreen/CalendarScreen. */}
      {showDescribeTask && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
          <JustDescribeItScreen
            visible
            backLabel="Hub"
            onClose={() => setShowDescribeTask(false)}
            onOpenFullForm={(kind, prefill) => {
              setShowDescribeTask(false);
              describeFullFormRef.current?.(kind, prefill);
            }}
          />
        </View>
      )}
      {showDescribeEvent && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
          <JustDescribeItEventScreen
            visible
            backLabel="Hub"
            activeMemberId={activeMemberId ?? ''}
            onClose={() => setShowDescribeEvent(false)}
          />
        </View>
      )}

      {/* ── Review inbox + its sub-screens ──────────────────────────────
          Same full-page treatment as Add a task/Schedule above (via
          FullPageOverlay, which bundles the slide/fade + SwipeBackWrapper
          boilerplate those two hand-roll). The inbox (zIndex 50) stays
          mounted — visible stays true — the whole time a detail screen is
          open; each detail screen renders at zIndex 51 so it paints above
          the inbox instead of requiring the inbox to close first. Closing
          a detail screen (via its own X, Approve/Decline action, or an
          edge-swipe) reveals the still-open, now-updated inbox underneath
          — a real push/pop, not a close-then-reopen. */}
      <FullPageOverlay visible={showReviewInbox} onDismiss={() => setShowReviewInbox(false)} zIndex={50} backgroundColor={hubCanvas}>
        <ReviewInboxScreen
          onClose={() => setShowReviewInbox(false)}
          onSelectCategory={(category: ReviewCategory) => {
            if (category === 'chores') setShowChoresQueue(true);
            else if (category === 'redemptions') setShowRedemptionsQueue(true);
            else if (category === 'disputes') setShowDisputesInbox(true);
            else setShowHelpQueue(true);
          }}
        />
      </FullPageOverlay>

      {/* ── Category queue screens (zIndex 51 — stack above the inbox, below
          the per-item detail screens at 52) ── */}
      {/* Chores & Quests gets its own richer queue (photo thumbnail/missing-
          photo flag, waiting time with 24h+ escalation, note preview,
          per-category icon) instead of the generic title+detail row every
          other category uses — live direction: "more sensible, more
          intelligent, more descriptive ... especially chores." */}
      <FullPageOverlay visible={showChoresQueue} onDismiss={() => setShowChoresQueue(false)} zIndex={51} backgroundColor={hubCanvas}>
        <ChoresReviewQueueScreen
          onClose={() => setShowChoresQueue(false)}
          onSelectRow={(id) => setReviewQuestDetailId(id)}
        />
      </FullPageOverlay>
      <FullPageOverlay visible={showRedemptionsQueue} onDismiss={() => setShowRedemptionsQueue(false)} zIndex={51} backgroundColor={hubCanvas}>
        <RewardsReviewQueueScreen
          onClose={() => setShowRedemptionsQueue(false)}
          onSelectRow={(id) => setReviewRedemptionId(id)}
        />
      </FullPageOverlay>

      <FullPageOverlay visible={!!reviewQuestDetailId} onDismiss={() => setReviewQuestDetailId(null)} zIndex={52} backgroundColor={hubCanvas}>
        {reviewQuestDetailId ? (() => {
          const q = quests.find(qq => qq.id === reviewQuestDetailId);
          return q ? (
            <QuestDetailModal
              quest={q}
              onClose={() => setReviewQuestDetailId(null)}
              canEdit
              isParent
            />
          ) : null;
        })() : null}
      </FullPageOverlay>
      <FullPageOverlay visible={!!reviewRedemptionId} onDismiss={() => setReviewRedemptionId(null)} zIndex={52} backgroundColor={hubCanvas}>
        {reviewRedemptionId ? <RewardReviewScreen redemptionId={reviewRedemptionId} onClose={() => setReviewRedemptionId(null)} /> : null}
      </FullPageOverlay>
      <FullPageOverlay visible={showHelpQueue} onDismiss={() => setShowHelpQueue(false)} zIndex={51} backgroundColor={hubCanvas}>
        <HelpDispatchQueue
          onRequestHelpOpen={() => setShowRequestHelp(true)}
          onClose={() => setShowHelpQueue(false)}
          onOpenDetail={(id) => setActiveKidRequestId(id)}
        />
      </FullPageOverlay>
      <FullPageOverlay visible={!!activeKidRequestId} onDismiss={() => setActiveKidRequestId(null)} zIndex={52} backgroundColor={hubCanvas}>
        <KidRequestDetailScreen requestId={activeKidRequestId ?? ''} onClose={() => setActiveKidRequestId(null)} />
      </FullPageOverlay>
      <RequestHelpModal
        visible={showRequestHelp}
        onClose={() => setShowRequestHelp(false)}
        activeMemberId={activeMemberId ?? ''}
      />

      {/* ── Disputes category — DisputesInboxScreen (zIndex 51) lists both
          dispute types; each opens its own resolution screen at 52. ── */}
      <FullPageOverlay visible={showDisputesInbox} onDismiss={() => setShowDisputesInbox(false)} zIndex={51} backgroundColor={hubCanvas}>
        <DisputesInboxScreen
          onClose={() => setShowDisputesInbox(false)}
          onSelectDispute={(choreId, kind: DisputeKind) => {
            if (kind === 'redo') setRedoDisputeChoreId(choreId);
            else setReversalChoreId(choreId);
          }}
        />
      </FullPageOverlay>
      <FullPageOverlay visible={!!redoDisputeChoreId} onDismiss={() => setRedoDisputeChoreId(null)} zIndex={52} backgroundColor={hubCanvas}>
        {redoDisputeChoreId ? <RedoDisputeReviewScreen choreId={redoDisputeChoreId} onClose={() => setRedoDisputeChoreId(null)} /> : null}
      </FullPageOverlay>
      <FullPageOverlay visible={!!reversalChoreId} onDismiss={() => setReversalChoreId(null)} zIndex={52} backgroundColor={hubCanvas}>
        {reversalChoreId ? <ApprovalDetailScreen choreId={reversalChoreId} onClose={() => setReversalChoreId(null)} /> : null}
      </FullPageOverlay>

      {/* ── Rides — same full-page overlay treatment as Review inbox.
          RidesControlRoomScreen (zIndex 50) stays mounted while
          ActiveTripDetailScreen (zIndex 51) is open on top — real
          push/pop, not close-then-reopen (the old Modal version closed
          the control room first, then opened the trip detail after a
          300ms timeout). ── */}
      <FullPageOverlay visible={showRidesRoom} onDismiss={() => setShowRidesRoom(false)} zIndex={50} backgroundColor={hubCanvas}>
        <RidesControlRoomScreen
          onClose={() => setShowRidesRoom(false)}
          onSelectTrip={(tripId) => setActiveTripDetailId(tripId)}
        />
      </FullPageOverlay>
      <FullPageOverlay visible={!!activeTripDetailId} onDismiss={() => setActiveTripDetailId(null)} zIndex={51} backgroundColor={hubCanvas}>
        {activeTripDetailId ? <ActiveTripDetailScreen tripId={activeTripDetailId} onClose={() => setActiveTripDetailId(null)} /> : null}
      </FullPageOverlay>

      <FullPageOverlay visible={showGrocery} onDismiss={() => setShowGrocery(false)} zIndex={50} backgroundColor={hubCanvas}>
        {(requestAnimatedClose) => <GroceryScreen onClose={requestAnimatedClose} />}
      </FullPageOverlay>

      <FullPageOverlay visible={showMeals} onDismiss={() => setShowMeals(false)} zIndex={50} backgroundColor={hubCanvas}>
        <MealsScreen onClose={() => setShowMeals(false)} />
      </FullPageOverlay>

      <FullPageOverlay visible={showRewards} onDismiss={() => setShowRewards(false)} zIndex={50} backgroundColor={hubCanvas}>
        {(requestAnimatedClose) => (
          <RewardsDashboardScreen onClose={requestAnimatedClose} />
        )}
      </FullPageOverlay>

      <FullPageOverlay visible={showMemories} onDismiss={() => setShowMemories(false)} zIndex={50} backgroundColor={hubCanvas}>
        {(requestAnimatedClose) => <MemoriesScreen onClose={requestAnimatedClose} />}
      </FullPageOverlay>

      {/* Kid Hub's My Chores / Piggy Bank / Ask Parent — top-level sibling,
          same position as Meals/Rides Room above, so it's never affected by
          the ScrollView's scroll offset or covered by the header/pills. */}
      {(isKid || isTeen) && (
        <KidOverlays
          active={active} members={members} familyId={familyId}
          showMyChores={showMyChores} setShowMyChores={setShowMyChores}
          myChoresInitialTab={myChoresInitialTab} setMyChoresInitialTab={setMyChoresInitialTab}
          piggyBankModal={piggyBankModal} setPiggyBankModal={setPiggyBankModal}
          showAskParentHub={showAskParentHub} closeAskParentHub={closeAskParentHub}
          askParentDestination={askParentDestination} setAskParentDestination={setAskParentDestination}
          teenTutorOpen={teenTutorOpen} closeTeenTutor={() => setTeenTutorOpen(false)}
          teenSiblings={teenSiblings} teenPendingOffers={teenPendingOffers}
          onSendTutorOffer={sendTeenTutorOffer} onCancelTutorOffer={cancelTeenRequest}
          teenCashOutOpen={teenCashOutOpen} closeTeenCashOut={() => setTeenCashOutOpen(false)}
          teenBalance={(active as any).mainCoins ?? (active as any).coins ?? 0}
          onRequestCashOut={requestTeenCashOut}
          teenCashOuts={teenCashOuts}
          teenGasVehicleOpen={teenGasVehicleOpen} closeTeenGasVehicle={() => setTeenGasVehicleOpen(false)}
          teenToday={localToday()} onReportVehicleIssue={reportTeenVehicleIssue}
        />
      )}

      {/* Senior Hub's own En Route flow still uses the picker modal — it has
          no linked-ride concept like Parent Hub's Pick-up Radar does. */}
      <EnRouteModal
        visible={enRouteVisible}
        onClose={() => setEnRouteVisible(false)}
        pickups={members.filter(m => m.id !== active.id)}
        driverName={active.name.split(' ')[0]}
        onDispatch={(person, etaMinutes) => {
          if (!familyId) return;
          dispatchTrip({ familyId, driverMemberId: active.id, pickupMemberId: person?.id, etaMinutes });
        }}
      />
      <PinEntryModal
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={() => { if (pinTarget) setActiveMember(pinTarget.id); setPinTarget(null); }}
        onCancel={() => setPinTarget(null)}
      />
    </RootContainer>
  );
}

export interface TripView {
  tripId: string;
  kidName: string; kidEmoji?: string;
  driverName: string; driverEmoji?: string; driverMemberId: string;
  etaMinutes: number; startedAtMs: number;
  overdueAlertSent: boolean;
}

// Runs the two driver-scoped trip effects (30s chat broadcast, 15s overdue
// check) for exactly ONE trip. Split out from HubScreen's body and mounted
// once per active trip so two simultaneous trips (different drivers) each
// get their own independent timers — a single shared effect keyed off "the"
// trip would only ever fire for whichever trip happened to be looked at.
// Guarded by activeMemberId === view.driverMemberId same as before, so only
// the driver's own device actually posts/checks for their trip.
function TripEffects({ view, activeMemberId, overdueAlertSent, markOverdueAlertSent }: {
  view: TripView;
  activeMemberId: string | null | undefined;
  overdueAlertSent: boolean;
  markOverdueAlertSent: (tripId: string) => Promise<void>;
}) {
  const isDriver = activeMemberId === view.driverMemberId;

  // Broadcast En Route to family chat once, 30s into the trip — keyed on
  // startedAtMs only (not etaMinutes) so later ETA slider adjustments don't
  // repost a near-duplicate message every time the driver nudges it.
  useEffect(() => {
    if (!isDriver) return;
    const msg = `🚗 ${view.driverName} en route to pick up ${view.kidName} · ETA ${view.etaMinutes} min`;
    const id = setTimeout(() => {
      useChatStore.getState().sendMessage('all', view.driverMemberId, msg);
    }, 30_000);
    return () => clearTimeout(id);
  }, [view.startedAtMs, view.driverMemberId, isDriver]);

  // One-time alarming alert if this trip runs 5+ min past its ETA with no
  // Pickup Done confirmation — checked every 15s while the trip is active.
  useEffect(() => {
    if (!isDriver || overdueAlertSent) return;
    const check = () => {
      const elapsedMin = (Date.now() - view.startedAtMs) / 60_000;
      if (elapsedMin - view.etaMinutes >= 5) {
        const msg = `🚨 Pickup not confirmed yet — ${view.driverName} was due to pick up ${view.kidName} ${view.etaMinutes} min ago`;
        useChatStore.getState().sendMessage('all', view.driverMemberId, msg);
        markOverdueAlertSent(view.tripId);
      }
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [view.tripId, isDriver, overdueAlertSent]);

  return null;
}
