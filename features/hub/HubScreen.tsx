import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Car, X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore } from '@/store/eventStore';
import { useRewardStore } from '@/store/rewardStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
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

export default function HubScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember, loaded, loadFromStorage } = useFamilyStore();
  const { loadFromStorage: loadQuests }  = useQuestStore();
  const { loadFromStorage: loadEvents }  = useEventStore();
  const { loadFromStorage: loadRewards } = useRewardStore();

  const [refreshing, setRefreshing]        = useState(false);
  const [pinTarget, setPinTarget]          = useState<FamilyMember | null>(null);
  const [clock, setClock]                  = useState(fmtClock());
  const [helpModalVisible, setHelpModal]   = useState(false);
  const [flyerVisible, setFlyerVisible]    = useState(false);
  const [enRouteVisible, setEnRouteVisible]= useState(false);
  const [transitBanner, setTransitBanner]  = useState<{ kid: string; eta: string } | null>(null);

  useEffect(() => {
    if (!loaded) loadFromStorage();
    loadQuests();
    loadEvents();
    loadRewards();
  }, [loaded]);

  useEffect(() => {
    const id = setInterval(() => setClock(fmtClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadQuests(), loadEvents()]);
    setRefreshing(false);
  }, []);

  const active   = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = active?.role === 'parent';
  const isSenior = active?.role === 'senior';
  const isTeen   = active?.role === 'teen';
  const isKid    = !isParent && !isSenior && !isTeen;

  if (!active) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={active.name.split(' ')[0]}
        memberRole={active.role as 'parent' | 'kid' | 'teen' | 'senior'}
        onBellPress={() => Alert.alert('Nudge Center', 'Dinner ready · Meds · Pickup · Chore check')}
        // GP's bottom nav swaps Profile/Hearth for Memories — this is their
        // only remaining path to settings/PIN, since the tab is gone.
        onSettingsPress={isSenior ? () => router.push('/profile') : undefined}
      />

      {transitBanner && (
        <View style={{ backgroundColor: '#065F46', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Car size={16} color="#6EE7B7" />
          <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: '#6EE7B7' }}>
            En Route to pick up {transitBanner.kid} · ETA {transitBanner.eta}
          </Text>
          <Pressable onPress={() => setTransitBanner(null)}
            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#10B98130', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} color="#6EE7B7" />
          </Pressable>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        // Child views render bottom-sheet modals with suggestion chips. Without this,
        // this ancestor ScrollView eats the first tap to dismiss the keyboard and the
        // chip's onPress never fires. (CalendarScreen avoids it by rendering its
        // modals outside the ScrollView.)
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: isDark ? colors.background : '#F1F5F9' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 60 }}
      >
        {isParent && (
          <ParentView
            active={active} members={members} colors={colors} isDark={isDark}
            onScanFlyer={() => setFlyerVisible(true)}
            onEnRoute={() => setEnRouteVisible(true)}
          />
        )}
        {isKid && (
          <KidView
            active={active} members={members} colors={colors} isDark={isDark}
            onHelpRequest={() => setHelpModal(true)}
          />
        )}
        {isTeen && (
          <TeenView
            active={active} members={members} colors={colors} isDark={isDark}
          />
        )}
        {isSenior && (
          <SeniorView
            active={active} members={members} colors={colors} isDark={isDark}
            onHelpRequest={() => setHelpModal(true)}
            onEnRoute={() => setEnRouteVisible(true)}
          />
        )}
      </ScrollView>

      <HelpRequestModal visible={helpModalVisible} onClose={() => setHelpModal(false)} />
      <FlyerScannerModal visible={flyerVisible} onClose={() => setFlyerVisible(false)} />
      <EnRouteModal
        visible={enRouteVisible}
        onClose={() => setEnRouteVisible(false)}
        kids={members.filter(m => m.role === 'kid')}
        onDispatch={(kid, eta) => setTransitBanner({ kid, eta })}
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
