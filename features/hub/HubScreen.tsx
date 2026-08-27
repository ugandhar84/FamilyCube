import { useCallback, useEffect, useState } from 'react';
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
import { useTripStore } from '@/store/tripStore';
import AppHeader from '@/components/AppHeader';
import NotificationPanel from '@/components/NotificationPanel';
import { useNotifStore } from '@/store/notifStore';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import FlyerScannerModal from '@/components/FlyerScannerModal';
import PinEntryModal from '@/components/PinEntryModal';
import type { FamilyMember } from '@/store/familyStore';
import { ParentView } from './ParentView';
import { KidView } from './KidView';
import { SeniorView } from './SeniorView';
import { TeenView } from './TeenView';
import { EnRouteModal } from './hubComponents';
import { fmtClock } from './hubUtils';
import GlobalCelebration from '@/components/GlobalCelebration';
import { AppsQuickAccessPills } from './AppsQuickAccessPills';

export default function HubScreen() {
  const { colors, isDark } = useTheme();
  const { deviceClass } = useDeviceClass();
  const { members, activeMemberId, setActiveMember, loaded, loadFromStorage } = useFamilyStore();
  const { loadFromStorage: loadQuests }  = useQuestStore();
  const { loadFromStorage: loadEvents }  = useEventStore();
  const { loadFromStorage: loadRewards } = useRewardStore();
  const { activeTrips: trips, loadFromStorage: loadTrip, dispatch: dispatchTrip,
          updateEta: updateTripEta, markOverdueAlertSent, complete: completeTrip } = useTripStore();

  const [refreshing, setRefreshing]        = useState(false);
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

  useEffect(() => {
    const id = setInterval(() => setClock(fmtClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // loadQuests (choreAdapter's loadFromStorage) only re-reads AsyncStorage
    // cache — it never hits the DB. Calling it alongside syncFromDB used to
    // race the two: loadQuests' local disk read is faster than syncFromDB's
    // network round-trip, so it would resolve second and clobber the fresh
    // DB data right back to the stale cached copy. syncFromDB already
    // rewrites AsyncStorage itself once it has fresh data, so there's
    // nothing for loadQuests to add here — drop it.
    await Promise.all([useChoreStore.getState().syncFromDB(true), loadEvents()]);
    setRefreshing(false);
  }, []);

  const active   = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = active?.role === 'parent';
  const isSenior = active?.role === 'senior';
  const isTeen   = active?.role === 'teen';
  const isKid    = !isParent && !isSenior && !isTeen;

  if (!active) return null;

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={active.name.split(' ')[0]}
        memberRole={active.role as 'parent' | 'kid' | 'teen' | 'senior'}
        notifCount={unreadNotifCount}
        onBellPress={() => setNotifPanelOpen(true)}
        // Header gear icon removed — the new Profile pill in
        // AppsQuickAccessPills (leads the default row) is the sole entry
        // point to /profile-settings for every role now.
      />
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

      <AppsQuickAccessPills role={active.role} colors={colors} isDark={isDark} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        // Child views render bottom-sheet modals with suggestion chips. Without this,
        // this ancestor ScrollView eats the first tap to dismiss the keyboard and the
        // chip's onPress never fires. (CalendarScreen avoids it by rendering its
        // modals outside the ScrollView.)
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: colors.background }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: 2, paddingBottom: 60 }}
      >
        {isParent && (
          <ParentView
            active={active} members={members} colors={colors} isDark={isDark}
            onScanFlyer={() => setFlyerVisible(true)}
            onDispatchDirect={(memberId, etaMinutes) => {
              if (!familyId) return;
              dispatchTrip({ familyId, driverMemberId: active.id, pickupMemberId: memberId, etaMinutes });
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
            active={active} members={members} colors={colors} isDark={isDark}
            activeTrips={tripViews} familyId={familyId}
            composerVisible={composerVisible} onCloseComposer={() => setComposerVisible(false)}
          />
        )}
        {isTeen && (
          <TeenView
            active={active} members={members} colors={colors} isDark={isDark}
            activeTrips={tripViews}
            composerVisible={composerVisible} onCloseComposer={() => setComposerVisible(false)}
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
    </SafeAreaView>
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
