import { showAlert } from '@/components/AppAlert';
import { useState, useMemo , useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Alert,  } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { SPACING, RADIUS , TYPO } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import PawBondLoader from '@/components/PawBondLoader';
import PetHeaderChip from '@/components/PetHeaderChip';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';

interface VetClinic {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  is_24h: boolean;
  is_emergency: boolean;
  rating: number | null;
  specialties: string[] | null;
  distance_km: number | null;
}

const FALLBACK_CLINICS: VetClinic[] = [
  { id: '1', name: 'ASPCA Animal Poison Control', address: 'Nationwide (USA)', phone: '+1-888-426-4435', website: null, is_24h: true, is_emergency: true, rating: 5.0, specialties: ['Poison Control', 'Toxicology'], distance_km: null },
  { id: '2', name: 'PetCare 24/7 Emergency Clinic', address: 'Find your nearest branch', phone: '+1-855-764-7661', website: null, is_24h: true, is_emergency: true, rating: 4.8, specialties: ['Emergency', 'Surgery', 'Critical Care'], distance_km: null },
  { id: '3', name: 'Red Cross Pet First Aid', address: 'Online & local chapters', phone: '+1-800-548-2423', website: 'https://www.redcross.org', is_24h: false, is_emergency: false, rating: 4.9, specialties: ['First Aid', 'Training'], distance_km: null },
];

export default function VetClinicsScreen() {
  const { colors } = useTheme();
  const { activePet } = usePetStore(useShallow(s => ({ activePet: s.activePet })));
  const pet = activePet();
  const [clinics, setClinics] = useState<VetClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const s = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    loadClinics();
  }, []);

  const loadClinics = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('vet_clinics').select('*').limit(20);
      setClinics(data && data.length > 0 ? (data as VetClinic[]) : FALLBACK_CLINICS);
    } catch {
      setClinics(FALLBACK_CLINICS);
    } finally {
      setLoading(false);
    }
  };

  const callClinic = (phone: string, name: string) => {
    showAlert(`Call ${name}?`, phone, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call', onPress: () => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`) },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={s.title}>Vet Clinics</Text>
          <PetHeaderChip pet={pet as any} />
        </View>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <PawBondLoader size={56} />
          <Text style={s.loadingText}>Finding nearby clinics…</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={s.sectionLabel}>Emergency &amp; specialist clinics</Text>

          {clinics.map((c) => (
            <View key={c.id} style={s.card}>
              <View style={[s.iconWrap, { backgroundColor: c.is_emergency ? colors.dangerLight : colors.primaryLight }]}>
                <Text style={s.iconEmoji}>{c.is_emergency ? '🚑' : '🏥'}</Text>
              </View>

              <View style={{ flex: 1, gap: 3 }}>
                <View style={s.nameRow}>
                  <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                  {c.is_24h && (
                    <View style={[s.badge, { backgroundColor: colors.primaryLight }]}>
                      <Text style={[s.badgeText, { color: colors.textPrimary }]}>24/7</Text>
                    </View>
                  )}
                  {c.is_emergency && (
                    <View style={[s.badge, { backgroundColor: colors.dangerLight }]}>
                      <Text style={[s.badgeText, { color: colors.danger }]}>ER</Text>
                    </View>
                  )}
                </View>

                {c.address && <Text style={s.address} numberOfLines={1}>📍 {c.address}</Text>}
                {c.specialties && c.specialties.length > 0 && (
                  <Text style={s.specialties}>{c.specialties.join(' · ')}</Text>
                )}
                {c.rating != null && (
                  <Text style={s.rating}>⭐ {c.rating.toFixed(1)}</Text>
                )}
              </View>

              {c.phone && (
                <TouchableOpacity
                  style={[s.callBtn, { backgroundColor: c.is_emergency ? colors.danger : colors.primary }]}
                  onPress={() => callClinic(c.phone!, c.name)}
                >
                  <Text style={s.callEmoji}>📞</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: TYPO.body, color: colors.textSecondary },

  sectionLabel: { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm, marginTop: SPACING.sm },

  card: { marginHorizontal: SPACING.xl, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: SPACING.sm, borderWidth: 0.5, borderColor: colors.border },
  iconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconEmoji: { fontSize: TYPO.title },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full },
  badgeText: { fontSize: TYPO.body, fontWeight: '700' },
  address: { fontSize: TYPO.body, color: colors.textSecondary },
  specialties: { fontSize: TYPO.body, color: colors.textSecondary },
  rating: { fontSize: TYPO.body, color: colors.textSecondary },
  callBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  callEmoji: { fontSize: TYPO.heading },
});
