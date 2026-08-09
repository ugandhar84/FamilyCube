import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import PetHeaderChip from '@/components/PetHeaderChip';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { differenceInYears, parseISO } from 'date-fns';

import HealthScreen from '@/app/(tabs)/health';
import JournalScreen from '@/app/(tabs)/journal';
import TodayScreen from '@/components/TodayScreen';
import { TYPO } from '@/constants/theme';

type CareSection = 'today' | 'health' | 'notes';

const SECTIONS: { key: CareSection; label: string }[] = [
  { key: 'today',  label: 'Today'  },
  { key: 'health', label: 'Health' },
  { key: 'notes',  label: 'Notes'  },
];

export default function CareScreen() {
  const { colors } = useTheme();
  const { activePet, activePetId } = usePetStore(useShallow(s => ({ activePet: s.activePet, activePetId: s.activePetId })));
  const pet = activePet();
  // Re-derive on every activePetId change so header updates immediately after switcher
  const ac = (pet as any)?.accent_color ?? colors.primary;
  const petAgeYrs = (pet as any)?.birthday
    ? differenceInYears(new Date(), parseISO((pet as any).birthday))
    : null;
  const petAge = petAgeYrs != null ? `${petAgeYrs} yr${petAgeYrs !== 1 ? 's' : ''}` : null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _petKey = activePetId; // ensures re-render when active pet switches

  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<CareSection>(
    SECTIONS.some(s => s.key === params.section) ? (params.section as CareSection) : 'today'
  );

  useEffect(() => {
    if (params.section && SECTIONS.some(s => s.key === params.section)) {
      setSection(params.section as CareSection);
    }
  }, [params.section]);

  const showPetContext = section !== 'today';

  // Track which tabs have been mounted — use state so render sees updates immediately
  // Do NOT use key props on Health/Notes — remounting bypasses their TTL guards and re-fetches on every visit
  const [visited, setVisited] = useState<Set<CareSection>>(() => new Set([section]));
  useEffect(() => {
    setVisited(prev => {
      if (prev.has(section)) return prev;
      return new Set([...prev, section]);
    });
  }, [section]);

return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={styles.header}>

          {/* Title row */}
          <View style={styles.titleRow}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Care</Text>
                {showPetContext ? (
                pet ? (
                  <Text style={[styles.petSubtitle, { color: ac }]} numberOfLines={1}>
                    {(pet as any).emoji ?? '🐾'}  {pet.name}{petAge ? `  ·  ${petAge}` : ''}
                  </Text>
                ) : (
                  <Text style={[styles.petSubtitle, { color: colors.textSecondary }]}>
                    Select a baby to view
                  </Text>
                )
              ) : (
                <Text style={[styles.petSubtitle, { color: colors.textSecondary }]}>
                  How are the babies doing today?
                </Text>
              )}
            </View>
            {showPetContext && <PetHeaderChip pet={pet as any} variant="badge" />}
          </View>

          {/* Segmented control */}
          <View style={[styles.segTrack, { backgroundColor: colors.card }]}>
            {SECTIONS.map(({ key, label }) => {
              const active = section === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.segItem,
                    active && {
                      backgroundColor: key === 'today' ? '#22C55E' : ac,
                      shadowColor: key === 'today' ? '#22C55E' : ac,
                      shadowOpacity: 0.25,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 3,
                    },
                  ]}
                  onPress={() => setSection(key)}
                  activeOpacity={0.8}>
                  <Text style={[
                    styles.segLabel,
                    { color: active ? '#fff' : colors.textSecondary,
                      fontWeight: active ? '700' : '500' },
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

        </View>
      </SafeAreaView>

      <View style={{ flex: 1 }}>
        {visited.has('today')  && <View style={{ flex: 1, display: section === 'today'  ? 'flex' : 'none' }}><TodayScreen /></View>}
        {visited.has('health') && <View style={{ flex: 1, display: section === 'health' ? 'flex' : 'none' }}><HealthScreen hideHeader /></View>}
        {visited.has('notes')  && <View style={{ flex: 1, display: section === 'notes'  ? 'flex' : 'none' }}><JournalScreen hideHeader /></View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: TYPO.hero,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  petSubtitle: {
    fontSize: TYPO.subheading,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  segTrack: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
    gap: 3,
  },
  segItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 17,
  },
  segLabel: {
    fontSize: TYPO.body,
  },
});
