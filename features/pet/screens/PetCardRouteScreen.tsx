import { useMemo, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Share,
  ScrollView, Dimensions, Modal, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { differenceInYears, differenceInMonths, differenceInDays, parseISO, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/lib/ThemeContext';
import { SPECIES_EMOJI, TYPO} from '@/constants/theme';

const { width: SW } = Dimensions.get('window');

// ── Helpers ───────────────────────────────────────────────────────────────────

function ageStr(birthday?: string | null): string {
  if (!birthday) return 'Unknown';
  try {
    const d = parseISO(birthday);
    const yrs = differenceInYears(new Date(), d);
    if (yrs > 0) return `${yrs} yr${yrs === 1 ? '' : 's'} old`;
    const mos = differenceInMonths(new Date(), d);
    return `${mos} month${mos !== 1 ? 's' : ''} old`;
  } catch { return 'Unknown'; }
}

function togetherDays(adoptionDate?: string | null): number {
  if (!adoptionDate) return 0;
  try { return Math.max(0, differenceInDays(new Date(), parseISO(adoptionDate))); } catch { return 0; }
}

function togetherStr(adoptionDate?: string | null): string | null {
  const days = togetherDays(adoptionDate);
  if (!days) return null;
  if (days < 30)  return `${days} day${days !== 1 ? 's' : ''} together`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) !== 1 ? 's' : ''} together`;
  const yrs = Math.floor(days / 365);
  return `${yrs} year${yrs !== 1 ? 's' : ''} together`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MMM d, yyyy'); } catch { return iso; }
}

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Decorative QR ─────────────────────────────────────────────────────────────

function QRGrid({ value, size, color }: { value: string; size: number; color: string }) {
  const grid = useMemo(() => {
    const COLS = 21;
    const cells: boolean[] = [];
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    for (let r = 0; r < COLS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tl = r < 7 && c < 7, tr = r < 7 && c >= COLS - 7, bl = r >= COLS - 7 && c < 7;
        if (tl || tr || bl) { cells.push(true); continue; }
        cells.push(((hash ^ (r * 73 + c * 37)) & 1) === 1);
      }
    }
    return { cells, COLS };
  }, [value]);
  const cell = size / grid.COLS;
  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff', borderRadius: 12, padding: 4 }}>
      {Array.from({ length: grid.COLS }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: grid.COLS }).map((_, col) => (
            <View key={col} style={{ width: cell, height: cell,
              backgroundColor: grid.cells[row * grid.COLS + col] ? color : '#fff' }} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={sp.wrap}>
      <Text style={sp.icon}>{icon}</Text>
      <Text style={sp.value}>{value}</Text>
      <Text style={sp.label}>{label}</Text>
    </View>
  );
}

const sp = StyleSheet.create({
  wrap:  { alignItems: 'center', flex: 1 },
  icon:  { fontSize: TYPO.heading, marginBottom: 2 },
  value: { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff', lineHeight: 20 },
  label: { fontSize: TYPO.label, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
});

// ── Detail row ────────────────────────────────────────────────────────────────

function Row({ icon, label, value, ac, colors, top }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; value: string; ac: string; colors: any; top?: boolean;
}) {
  return (
    <View style={[dr.row, top && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <View style={[dr.icon, { backgroundColor: `${ac}14` }]}>
        <Ionicons name={icon} size={15} color={ac} />
      </View>
      <Text style={[dr.label, { color: colors.textSecondary ?? colors.textSecondary }]}>{label}</Text>
      <Text style={[dr.value, { color: colors.textPrimary }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const dr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  icon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: TYPO.body, width: 96, color: '#888' },
  value: { flex: 1, fontSize: TYPO.body, fontWeight: '600', textAlign: 'right' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PetCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { pets, vaccines, vetVisits, moodLogs } = usePetStore(useShallow(s => ({ pets: s.pets, vaccines: s.vaccines, vetVisits: s.vetVisits, moodLogs: s.moodLogs })));
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  const [fetchedPet, setFetchedPet] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [memoriesCount, setMemoriesCount] = useState(0);

  const petFromStore = pets.find(p => p.id === id);
  const pet = petFromStore || fetchedPet;

  useMemo(() => {
    if (!id || petFromStore) return;
    const fetchPet = async () => {
      setLoading(true);
      try {
        const { data: result } = await supabase
          .from('pets')
          .select('*')
          .eq('id', id)
          .single();
        if (result) setFetchedPet(result);
      } catch (e) {
        console.error('Failed to fetch pet:', e);
      }
      setLoading(false);
    };
    fetchPet();
  }, [id, petFromStore]);

  // Fetch memories count
  useEffect(() => {
    if (!id) return;
    supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('pet_id', id)
      .then(({ count }) => { if (count != null) setMemoriesCount(count); });
  }, [id]);

  const petVaccines = id ? (vaccines[id] ?? []) : [];
  const petVisits   = id ? (vetVisits[id] ?? []) : [];
  const petMoods    = id ? (moodLogs[id] ?? []) : [];

  const ac       = (pet as any)?.accent_color ?? colors.primary ?? '#1D9E75';
  const shareUrl = `https://pawbond.app/pet/${id}`;

  const overdueCount = petVaccines.filter(v => v.status === 'overdue').length;
  const vaccineLabel = overdueCount > 0
    ? `${overdueCount} overdue`
    : petVaccines.length > 0 ? 'Up to date' : 'Not recorded';
  const vaccineColor = overdueCount > 0 ? '#EF4444' : petVaccines.length > 0 ? '#22C55E' : '#aaa';

  const lastVisit   = petVisits[0];
  const together    = togetherStr((pet as any)?.adoption_date);
  const daysCount   = togetherDays((pet as any)?.adoption_date);
  const genderLabel = (pet as any)?.gender === 'male' ? '♂ Male'
    : (pet as any)?.gender === 'female' ? '♀ Female' : null;

  const handleShare = async () => {
    if (!pet) return;
    const lines = [
      `🐾 Meet ${pet.name}!`,
      `${SPECIES_EMOJI[pet.species] ?? '🐾'} ${pet.species.charAt(0).toUpperCase() + pet.species.slice(1)}${pet.breed ? ` · ${pet.breed}` : ''}`,
      pet.birthday ? `🎂 ${ageStr(pet.birthday)}` : null,
      genderLabel ? `${genderLabel}${(pet as any).neutered ? ' · neutered' : ''}` : null,
      (pet as any).microchip_id ? `💾 Microchip: ${(pet as any).microchip_id}` : null,
      `💉 Vaccines: ${vaccineLabel}`,
      lastVisit ? `🏥 Last vet: ${fmtDate(lastVisit.visit_date)}${lastVisit.clinic_name ? ` · ${lastVisit.clinic_name}` : ''}` : null,
      together ? `❤️ ${together}` : null,
      memoriesCount > 0 ? `📸 ${memoriesCount} memories captured` : null,
      petMoods.length > 0 ? `😊 ${petMoods.length} mood logs` : null,
      '',
      `🔗 View ${pet.name}'s profile: ${shareUrl}`,
      '',
      'Shared from PawBond 🐶🐱',
    ].filter(Boolean).join('\n');
    try { await Share.share({ title: `${pet.name}'s Pet Passport`, message: lines, url: shareUrl }); } catch {}
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primaryText ?? colors.primary} />
      </View>
    );
  }

  if (!pet) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary, fontSize: TYPO.body }}>Pet not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── Hero ── */}
      <LinearGradient
        colors={[ac, ac + 'CC', ac + '99']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ overflow: 'hidden' }}
      >
        {/* Blobs */}
        <View style={[cs.blob, { width: 260, height: 260, top: -110, right: -80 }]} />
        <View style={[cs.blob, { width: 100, height: 100, bottom: 60, left: 20 }]} />

        {/* Top bar */}
        <View style={[cs.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} style={cs.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={cs.passportLabel}>🐾 Pet Passport</Text>
          <TouchableOpacity onPress={() => router.push('/pet/edit' as any)} style={cs.editBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="pencil" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Photo + name */}
        <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 20 }}>
          {(pet as any)?.photo_url ? (
            <TouchableOpacity onPress={() => setEnlargedImageUrl((pet as any).photo_url)} activeOpacity={0.85}>
              <Image source={{ uri: (pet as any).photo_url }} cachePolicy="memory-disk"
                style={[cs.avatar, { borderColor: 'rgba(255,255,255,0.6)' }]} />
              <View style={cs.enlargeHint}>
                <Ionicons name="expand-outline" size={12} color="rgba(255,255,255,0.9)" />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[cs.avatar, { borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 60 }}>{pet.emoji ?? SPECIES_EMOJI[pet.species] ?? '🐾'}</Text>
            </View>
          )}

          <Text style={cs.heroName}>{pet.name}</Text>
          <Text style={cs.heroSub}>
            {pet.species.charAt(0).toUpperCase() + pet.species.slice(1)}
            {pet.breed ? ` · ${pet.breed}` : ''}
            {pet.birthday ? `  ·  ${ageStr(pet.birthday)}` : ''}
          </Text>

          {together && (
            <View style={[cs.togetherPill, { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
              <Ionicons name="heart" size={11} color={ac} />
              <Text style={[cs.togetherText, { color: ac }]}>{together}</Text>
            </View>
          )}
        </View>

        {/* ── Stats row ── */}
        <View style={cs.statsRow}>
          {daysCount > 0 && (
            <StatPill icon="📅" value={fmtNum(daysCount)} label="Days" />
          )}
          {memoriesCount > 0 && (
            <StatPill icon="📸" value={fmtNum(memoriesCount)} label="Memories" />
          )}
          {petMoods.length > 0 && (
            <StatPill icon="😊" value={fmtNum(petMoods.length)} label="Mood logs" />
          )}
          {petVisits.length > 0 && (
            <StatPill icon="🏥" value={fmtNum(petVisits.length)} label="Vet visits" />
          )}
          {petVaccines.length > 0 && (
            <StatPill icon="💉" value={fmtNum(petVaccines.length)} label="Vaccines" />
          )}
        </View>
        <View style={{ height: 20 }} />
      </LinearGradient>

      {/* ── Details ── */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Identity card */}
        <View style={[cs.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {pet.birthday && <Row icon="calendar-outline"        label="Birthday"    value={fmtDate(pet.birthday)}   ac={ac} colors={colors} />}
          {(pet as any).adoption_date && <Row icon="home-outline" label="Homecoming" value={fmtDate((pet as any).adoption_date)} ac={ac} colors={colors} top />}
          {genderLabel && (
            <Row icon="person-outline" label="Gender" top
              value={genderLabel + ((pet as any).neutered ? ' · neutered' : '')} ac={ac} colors={colors} />
          )}
          {(pet as any).weight_kg && <Row icon="barbell-outline" label="Weight" value={`${(pet as any).weight_kg} kg`} ac={ac} colors={colors} top />}
          {(pet as any).color_coat && <Row icon="color-palette-outline" label="Coat colour" value={(pet as any).color_coat} ac={ac} colors={colors} top />}
          {(pet as any).microchip_id && <Row icon="hardware-chip-outline" label="Microchip" value={(pet as any).microchip_id} ac={ac} colors={colors} top />}
        </View>

        {/* Health card */}
        <View style={[cs.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
          {/* Vaccine status */}
          <View style={dr.row}>
            <View style={[dr.icon, { backgroundColor: `${vaccineColor}14` }]}>
              <Ionicons name="shield-checkmark-outline" size={15} color={vaccineColor} />
            </View>
            <Text style={[dr.label, { color: colors.textSecondary ?? colors.textSecondary }]}>Vaccines</Text>
            <Text style={[dr.value, { color: vaccineColor, fontWeight: '700' }]}>{vaccineLabel}</Text>
          </View>

          {petVaccines.length > 0 && petVaccines.slice(0, 4).map((v, i) => (
            <View key={v.id ?? i} style={[dr.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={[dr.icon, { backgroundColor: v.status === 'overdue' ? '#FEE2E2' : '#DCFCE7' }]}>
                <Ionicons name={v.status === 'overdue' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                  size={15} color={v.status === 'overdue' ? '#EF4444' : '#22C55E'} />
              </View>
              <Text style={[dr.label, { color: colors.textSecondary ?? colors.textSecondary }]}>{v.name}</Text>
              <Text style={[dr.value, { color: colors.textSecondary, fontWeight: '500', fontSize: TYPO.body }]}>
                {(v as any).next_due ? `Due ${fmtDate((v as any).next_due)}` : 'Recorded'}
              </Text>
            </View>
          ))}

          {lastVisit && (
            <View style={[dr.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={[dr.icon, { backgroundColor: `${ac}14` }]}>
                <Ionicons name="medical-outline" size={15} color={ac} />
              </View>
              <Text style={[dr.label, { color: colors.textSecondary ?? colors.textSecondary }]}>Last vet</Text>
              <Text style={[dr.value, { color: colors.textPrimary }]} numberOfLines={1}>
                {fmtDate(lastVisit.visit_date)}{lastVisit.clinic_name ? ` · ${lastVisit.clinic_name}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* QR + URL */}
        <View style={[cs.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <QRGrid value={shareUrl} size={92} color={ac} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
              Scan to view {pet.name}'s profile
            </Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary }} numberOfLines={2}>
              {shareUrl}
            </Text>
            <View style={[cs.privacyChip, { backgroundColor: `${ac}12`, borderColor: `${ac}30` }]}>
              <Ionicons name="lock-closed-outline" size={10} color={ac} />
              <Text style={{ fontSize: TYPO.body, color: ac, fontWeight: '600' }}>Medical records stay private</Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* ── Floating share FAB ── */}
      <View style={[cs.fabWrap, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={handleShare} activeOpacity={0.88}
          style={[cs.fab, { backgroundColor: ac }]}>
          <Ionicons name="share-social-outline" size={20} color="#fff" />
          <Text style={cs.fabText}>Share {pet.name}'s passport</Text>
        </TouchableOpacity>
      </View>

      {/* ── Enlarged image modal ── */}
      <Modal visible={!!enlargedImageUrl} transparent onRequestClose={() => setEnlargedImageUrl(null)}>
        <View style={[cs.imageModal, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
          <TouchableOpacity style={cs.imageModalClose} onPress={() => setEnlargedImageUrl(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {enlargedImageUrl && (
            <Image source={{ uri: enlargedImageUrl }} cachePolicy="memory-disk" style={cs.imageModalImage} contentFit="contain" />
          )}
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  blob:         { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' },

  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingBottom: 4 },
  closeBtn:     { width: 36, height: 36, borderRadius: 18,
                  backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  editBtn:      { width: 36, height: 36, borderRadius: 18,
                  backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  passportLabel:{ fontSize: TYPO.body, fontWeight: '700', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5 },

  avatar:       { width: 108, height: 108, borderRadius: 54, borderWidth: 3, marginBottom: 14,
                  shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  enlargeHint:  { position: 'absolute', bottom: 16, right: 2,
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: 'rgba(0,0,0,0.40)', alignItems: 'center', justifyContent: 'center' },

  heroName:     { fontSize: TYPO.hero, fontWeight: '900', color: '#fff', letterSpacing: -0.5,
                  textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  heroSub:      { fontSize: TYPO.caption, color: 'rgba(255,255,255,0.78)', marginTop: 5, textTransform: 'capitalize', fontWeight: '500' },
  togetherPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12,
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  togetherText: { fontSize: TYPO.caption, fontWeight: '700' },

  statsRow:     { flexDirection: 'row', marginHorizontal: 20, marginTop: 16,
                  backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 18,
                  paddingVertical: 16, paddingHorizontal: 8, gap: 4 },

  card:         { marginHorizontal: 16, marginTop: 20, borderRadius: 20,
                  borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
                  shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  qrCard:       { marginHorizontal: 16, marginTop: 12, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
                  padding: 16, flexDirection: 'row', gap: 14, alignItems: 'flex-start',
                  shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  privacyChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, borderWidth: 1,
                  paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },

  fabWrap:      { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12 },
  fab:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                  height: 56, borderRadius: 28,
                  shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabText:      { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },

  imageModal:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imageModalClose: { position: 'absolute', top: 40, right: 16, zIndex: 10 },
  imageModalImage: { width: '90%', height: '90%' },
});
