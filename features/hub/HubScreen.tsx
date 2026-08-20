import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useEventStore } from '@/store/eventStore';
import { useRewardStore } from '@/store/rewardStore';
import { useChatStore } from '@/store/chatStore';
import { useTripStore } from '@/store/tripStore';
import AppHeader from '@/components/AppHeader';
import HelpRequestModal from '@/components/HelpRequestModal';
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
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember, loaded, loadFromStorage } = useFamilyStore();
  const { loadFromStorage: loadQuests }  = useQuestStore();
  const { loadFromStorage: loadEvents }  = useEventStore();
  const { loadFromStorage: loadRewards } = useRewardStore();
  const { activeTrip: trip, loadFromStorage: loadTrip, dispatch: dispatchTrip,
          updateEta: updateTripEta, markOverdueAlertSent, complete: completeTrip } = useTripStore();

  const [refreshing, setRefreshing]        = useState(false);
  const [pinTarget, setPinTarget]          = useState<FamilyMember | null>(null);
  const [clock, setClock]                  = useState(fmtClock());
  const [helpModalVisible, setHelpModal]   = useState(false);
  const [flyerVisible, setFlyerVisible]    = useState(false);
  const [enRouteVisible, setEnRouteVisible]= useState(false);

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

  const driver  = trip ? members.find(m => m.id === trip.driverMemberId) : undefined;
  const pickup  = trip?.pickupMemberId ? members.find(m => m.id === trip.pickupMemberId) : undefined;
  const driverName = driver?.name.split(' ')[0] ?? 'Someone';
  const kidName     = pickup?.name.split(' ')[0] ?? 'Family';

  // Broadcast En Route to family chat once, 30s into the trip — keyed on
  // trip.startedAt only (not etaMinutes) so later ETA slider adjustments
  // don't repost a near-duplicate message every time the driver nudges it.
  // 🚗 prefix maps to a routine/success tint in ChatScreen's MessageBubble.
  // Every family member's device runs this same effect off the synced trip
  // row, but only the driver's device actually has a reason to fire it —
  // guarded by activeMemberId matching the driver so it isn't posted once
  // per viewer.
  useEffect(() => {
    if (!trip || activeMemberId !== trip.driverMemberId) return;
    const msg = `🚗 ${driverName} en route to pick up ${kidName} · ETA ${trip.etaMinutes} min`;
    const id = setTimeout(() => {
      useChatStore.getState().sendMessage('all', trip.driverMemberId, msg);
    }, 30_000);
    return () => clearTimeout(id);
  }, [trip?.startedAt, trip?.driverMemberId, activeMemberId]);

  // One-time alarming alert if a trip runs 5+ min past its ETA with no
  // Pickup Done confirmation — checked every 15s while a trip is active.
  // 🚨 prefix maps to a danger tint in ChatScreen's MessageBubble. Guarded
  // the same way — only the driver's own device fires the check, but the
  // resulting DB row update (overdueAlertSent) is what every viewer's
  // Pick-up Radar card reacts to for the red "Overdue" styling.
  useEffect(() => {
    if (!trip || activeMemberId !== trip.driverMemberId || trip.overdueAlertSent) return;
    const check = () => {
      const elapsedMin = (Date.now() - new Date(trip.startedAt).getTime()) / 60_000;
      if (elapsedMin - trip.etaMinutes >= 5) {
        const msg = `🚨 Pickup not confirmed yet — ${driverName} was due to pick up ${kidName} ${trip.etaMinutes} min ago`;
        useChatStore.getState().sendMessage('all', trip.driverMemberId, msg);
        markOverdueAlertSent();
      }
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [trip?.id, trip?.overdueAlertSent, activeMemberId]);

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

  // Shape EnRouteBanner/ParentView already expect — resolved fresh on every
  // render from the synced trip row + this device's own members list, so
  // every viewer (driver, requester, other parent) sees the same trip.
  const activeTripView = trip ? {
    kidName, kidEmoji: pickup?.emoji,
    driverName, driverEmoji: driver?.emoji, driverMemberId: trip.driverMemberId,
    etaMinutes: trip.etaMinutes,
    startedAtMs: new Date(trip.startedAt).getTime(),
  } : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={active.name.split(' ')[0]}
        memberRole={active.role as 'parent' | 'kid' | 'teen' | 'senior'}
        onBellPress={() => Alert.alert('Nudge Center', 'Dinner ready · Meds · Pickup · Chore check')}
        // GP's bottom nav swaps Profile/Apps for Memories — this is their
        // only remaining path to settings/PIN, since the tab is gone.
        onSettingsPress={isSenior ? () => router.push('/profile') : undefined}
      />

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
            onPickupDone={() => {
              if (trip) {
                useChatStore.getState().sendMessage('all', trip.driverMemberId, `✅ ${driverName} picked up ${kidName}`);
              }
              completeTrip();
            }}
            onCancelTrip={() => completeTrip()}
            activeTrip={activeTripView}
            onUpdateEta={(etaMinutes) => updateTripEta(etaMinutes)}
          />
        )}
        {isKid && (
          <KidView
            active={active} members={members} colors={colors} isDark={isDark}
            onHelpRequest={() => setHelpModal(true)}
            activeTrip={activeTripView}
          />
        )}
        {isTeen && (
          <TeenView
            active={active} members={members} colors={colors} isDark={isDark}
            activeTrip={activeTripView}
          />
        )}
        {isSenior && (
          <SeniorView
            active={active} members={members} colors={colors} isDark={isDark}
            onHelpRequest={() => setHelpModal(true)}
            onEnRoute={() => setEnRouteVisible(true)}
            activeTrip={activeTripView}
          />
        )}
      </ScrollView>

      <GlobalCelebration />

      <HelpRequestModal visible={helpModalVisible} onClose={() => setHelpModal(false)} />
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
