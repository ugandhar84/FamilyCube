import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Dimensions, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import LazyImage from '@/components/LazyImage';
import PawBondLoader from '@/components/PawBondLoader';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from "react-native-view-shot";
import * as Sharing from 'expo-sharing';
import {
  differenceInYears, differenceInMonths, differenceInDays,
  parseISO, format,
} from 'date-fns';
import { usePetProfile } from '@/lib/hooks/usePetProfile';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { getPermissions } from '@/lib/permissions';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import MemorialBanner from '@/components/MemorialBanner';
import { QRGrid } from '@/features/pet/components/QRGrid';
import { InfoRow, ir } from '@/features/pet/components/InfoRow';
import { Card, CardLabel } from '@/features/pet/components/Card';
import { ShareCard } from '@/features/pet/components/ShareCard';
import { ageStr, togetherStr, fmtDate } from '@/features/pet/utils';
import { TYPO } from '@/constants/theme';

const { width: SW } = Dimensions.get('window');

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    pets, vaccines, vetVisits, weightLogs, milestones, moodLogs, petRoles,
    fetchVaccines, fetchVetVisits, fetchWeightLogs, fetchMilestones, fetchMoodLogs,
  } = usePetStore(useShallow(s => ({
    pets: s.pets, vaccines: s.vaccines, vetVisits: s.vetVisits, weightLogs: s.weightLogs,
    milestones: s.milestones, moodLogs: s.moodLogs, petRoles: s.petRoles,
    fetchVaccines: s.fetchVaccines, fetchVetVisits: s.fetchVetVisits,
    fetchWeightLogs: s.fetchWeightLogs, fetchMilestones: s.fetchMilestones,
    fetchMoodLogs: s.fetchMoodLogs,
  })));
  const { profile } = useAuthStore();

  const { data: profileData, isLoading: profileLoading, isFetching: profileFetching } = usePetProfile(id ?? null);
  const pet = pets.find(p => p.id === id) ?? ((profileData?.pet as any)?.id ? profileData!.pet : null);
  const isMemorial = pet?.status === 'memorial';
  const petVaccines = id ? (vaccines[id] ?? []) : [];
  const petVisits   = id ? (vetVisits[id] ?? []) : [];
  const petWeights  = id ? (weightLogs[id] ?? []) : [];
  const petMiles    = id ? (milestones[id] ?? []) : [];

  const cardRef = useRef<InstanceType<typeof ViewShot>>(null);
  const [waitedForLoad, setWaitedForLoad] = useState(false);
  useEffect(() => { setWaitedForLoad(false); }, [id]);
  const isOwner  = profileData?.isOwner ?? false;
  const perms = getPermissions(id ? (petRoles[id as string] ?? (isOwner ? 'owner' : 'viewer')) : 'owner');
  const allergies = profileData?.allergies ?? [];
  const privacy = isOwner ? null : (profileData?.privacy ?? null);

  const [sharing, setSharing]     = useState(false);
  const [showSharePreview, setShowSharePreview] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    if (!id) return;
    fetchVaccines(id);
    fetchVetVisits(id);
    fetchWeightLogs(id);
    fetchMilestones(id);
    fetchMoodLogs(id);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    return () => {};
  }, [id]));

  useEffect(() => {
    if (!profileLoading && !profileFetching) setWaitedForLoad(true);
  }, [profileLoading, profileFetching]);

  if (!pet) {
    if (waitedForLoad) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 14 }}>
          <Text style={{ fontSize: 40 }}>🐾</Text>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }}>We couldn't find this little one 🐾</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
            They may have moved or this link is no longer active.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8, paddingVertical: 10, paddingHorizontal: 22, borderRadius: 20, backgroundColor: colors.primary }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <PawBondLoader size={48} isDark={isDark} />
      </View>
    );
  }

  const ac            = (pet as any).accent_color ?? colors.primary ?? '#1D9E75';
  const shareUrl      = `https://pawbond.app/pet/${id}`;
  const together      = togetherStr((pet as any).adoption_date);
  const age           = ageStr(pet.birthday);
  const avatarUrl     = (pet as any).avatar_url as string | null;

  const genderVal     = (pet as any).gender as string | null;
  const genderLabel   = genderVal === 'male' ? 'Male' : genderVal === 'female' ? 'Female' : null;
  const genderIcon: React.ComponentProps<typeof Ionicons>['name'] =
    genderVal === 'male' ? 'male-outline' : genderVal === 'female' ? 'female-outline' : 'person-outline';

  const overdueCount  = petVaccines.filter(v => v.status === 'overdue').length;
  const vaccineStatus = overdueCount > 0 ? `${overdueCount} overdue`
    : petVaccines.length > 0 ? 'Up to date' : 'Not recorded';
  const vaccineColor  = overdueCount > 0 ? '#EF4444' : petVaccines.length > 0 ? '#22C55E' : '#999';
  const lastVisit     = petVisits[0];

  const maxWeight    = petWeights.reduce((m, w) => Math.max(m, w.weight_kg), 1);
  const latestWeight = petWeights[petWeights.length - 1];
  const days         = (pet as any).adoption_date
    ? differenceInDays(new Date(), parseISO((pet as any).adoption_date)) : 0;

  const handleShare = async () => {
    setShowSharePreview(true);
  };

  const captureAndShare = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const uri = await (cardRef.current as any).capture();
      setShowSharePreview(false);
      await new Promise(r => setTimeout(r, 300));
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `${pet.name}'s Pet Passport`,
        UTI: 'public.png',
      });
    } catch (e) {
      console.warn('Share failed', e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── Hero ── */}
      <LinearGradient
        colors={[ac, `${ac}F0`, `${ac}CC`, `${ac}88`]}
        start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={{ overflow: 'hidden' }}>

        <View style={[ps.blob, { width: 280, height: 280, top: -120, right: -90 }]} />
        <View style={[ps.blob, { width: 100, height: 100, bottom: 10, left: -20, opacity: 0.08 }]} />

        {/* Top bar */}
        <View style={[ps.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} style={ps.iconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={ps.passportBadge}>
            <Ionicons name="paw-outline" size={12} color="rgba(255,255,255,0.85)" />
            <Text style={ps.passportLabel}>Pet Passport</Text>
          </View>

          {perms.canEditPet && !isMemorial
            ? <TouchableOpacity onPress={() => router.push({ pathname: '/pet/edit', params: { id: String(id) } })} style={ps.editBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="create-outline" size={15} color="#fff" />
                <Text style={ps.editBtnText}>Edit</Text>
              </TouchableOpacity>
            : <View style={{ width: 56 }} />
          }
        </View>

        {/* Avatar + identity */}
        <View style={ps.heroBody}>

          <View style={ps.avatarRing}>
            {avatarUrl
              ? <LazyImage uri={avatarUrl} style={ps.avatar} resizeMode="cover" />
              : <View style={[ps.avatar, { backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons
                    name={
                      pet.species === 'cat'    ? 'logo-octocat'     :
                      pet.species === 'rabbit' ? 'ellipse-outline'  :
                      pet.species === 'bird'   ? 'paper-plane-outline' :
                      'paw-outline'
                    }
                    size={44} color="rgba(255,255,255,0.75)" />
                </View>
            }
          </View>

          <View style={{ flex: 1 }}>
            <Text style={ps.heroName} numberOfLines={1}>{pet.name}</Text>
            <Text style={ps.heroSub} numberOfLines={1}>
              {pet.species ? pet.species.charAt(0).toUpperCase() + pet.species.slice(1) : ''}
              {pet.breed ? ` · ${pet.breed}` : ''}
            </Text>
            {age ? <Text style={ps.heroAge}>{age}</Text> : null}

            <View style={ps.pillRow}>
              {together && (
                <View style={ps.pill}>
                  <Ionicons name="heart" size={11} color={ac} />
                  <Text style={[ps.pillText, { color: ac }]}>{together}</Text>
                </View>
              )}
              <View style={ps.pill}>
                <Ionicons name="shield-checkmark" size={11} color={vaccineColor} />
                <Text style={[ps.pillText, { color: vaccineColor }]}>{vaccineStatus}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats strip */}
        <View style={ps.statsStrip}>
          {[
            { val: days,               icon: 'calendar-outline'       as const, label: 'Days'       },
            { val: petMiles.length,    icon: 'trophy-outline'         as const, label: 'Milestones' },
            { val: petVaccines.length, icon: 'medical-outline'        as const, label: 'Vaccines'   },
            { val: petVisits.length,   icon: 'fitness-outline'        as const, label: 'Vet visits' },
          ].map((s, i) => (
            <View key={s.label} style={[ps.statCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.18)' }]}>
              <Ionicons name={s.icon} size={14} color="rgba(255,255,255,0.7)" style={{ marginBottom: 3 }} />
              <Text style={ps.statNum}>{s.val}</Text>
              <Text style={ps.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* ── Scrollable content ── */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120, paddingTop: 16 }}>

        {isMemorial && (
          <MemorialBanner petName={pet.name} memorialAt={(pet as any).memorial_at ?? null} />
        )}

        {/* Identity */}
        {(privacy === null || privacy.pet_show_about) && <Card colors={colors}>
          <CardLabel title="About" iconName="id-card-outline" color={ac} />
          {pet.breed && <InfoRow icon="ribbon-outline" label="Breed" value={pet.breed} ac={ac} colors={colors} />}
          {pet.birthday && <InfoRow icon="calendar-outline" label="Birthday" value={fmtDate(pet.birthday)} ac={ac} colors={colors} top={!!pet.breed} />}
          {pet.adoption_date && (
            <InfoRow icon="home-outline" label="Homecoming" value={fmtDate(pet.adoption_date)} ac={ac} colors={colors} top />
          )}
          {genderLabel && (
            <InfoRow icon={genderIcon} label="Gender"
              value={genderLabel + (pet.neutered ? ' · neutered' : '')} ac={ac} colors={colors} top />
          )}
          {pet.color_coat && (
            <InfoRow icon="color-palette-outline" label="Coat colour" value={pet.color_coat} ac={ac} colors={colors} top />
          )}
          {pet.weight_kg && (
            <InfoRow icon="barbell-outline" label="Weight" value={`${pet.weight_kg} kg`} ac={ac} colors={colors} top />
          )}
          {pet.microchip_id && (
            <InfoRow icon="hardware-chip-outline" label="Microchip" value={pet.microchip_id} ac={ac} colors={colors} top />
          )}
          {pet.insurance_policy && (
            <InfoRow icon="shield-outline" label="Insurance" value={pet.insurance_policy} ac={ac} colors={colors} top />
          )}
          {pet.diet_type && (
            <InfoRow icon="nutrition-outline" label="Diet" value={pet.diet_type} ac={ac} colors={colors} top />
          )}
          {/* Temperament tags */}
          {pet.temperament && pet.temperament.length > 0 && (
            <View style={[ir.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={[ir.icon, { backgroundColor: `${ac}14` }]}>
                <Ionicons name="happy-outline" size={15} color={ac} />
              </View>
              <Text style={[ir.label, { color: colors.textSecondary ?? colors.textSecondary }]}>Temperament</Text>
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 }}>
                {pet.temperament.map((t: string) => (
                  <View key={t} style={[ps.tag, { backgroundColor: `${ac}14`, borderColor: `${ac}30` }]}>
                    <Text style={{ fontSize: TYPO.body, color: ac, fontWeight: '600' }}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {/* Notes */}
          {pet.notes && (
            <View style={[{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 10,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={[ir.icon, { backgroundColor: `${ac}14` }]}>
                <Ionicons name="document-text-outline" size={15} color={ac} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary, marginBottom: 3 }}>Notes</Text>
                <Text style={{ fontSize: TYPO.body, color: colors.textPrimary, lineHeight: 19 }}>{pet.notes}</Text>
              </View>
            </View>
          )}
        </Card>}

        {/* Vaccines */}
        {(privacy === null || privacy.pet_show_vaccines) && <Card colors={colors} style={{ marginTop: 12 }}>
          <CardLabel title="Vaccines" iconName="shield-checkmark-outline" color={vaccineColor} />

          <View style={ir.row}>
            <View style={[ir.icon, { backgroundColor: `${vaccineColor}14` }]}>
              <Ionicons name="shield-checkmark-outline" size={15} color={vaccineColor} />
            </View>
            <Text style={[ir.label, { color: colors.textSecondary ?? colors.textSecondary }]}>Overall status</Text>
            <Text style={[ir.value, { color: vaccineColor, fontWeight: '700' }]}>{vaccineStatus}</Text>
          </View>

          {petVaccines.slice(0, 5).map((v, i) => {
            const vColor = v.status === 'overdue' ? '#EF4444'
              : v.status === 'due_soon' ? '#F59E0B' : '#22C55E';
            const vIcon: React.ComponentProps<typeof Ionicons>['name'] =
              v.status === 'overdue' ? 'alert-circle-outline'
              : v.status === 'due_soon' ? 'time-outline' : 'checkmark-circle-outline';
            return (
              <View key={(v as any).id ?? i}
                style={[ir.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={[ir.icon, { backgroundColor: `${vColor}14` }]}>
                  <Ionicons name={vIcon} size={15} color={vColor} />
                </View>
                <Text style={[ir.label, { color: colors.textSecondary ?? colors.textSecondary }]}>{v.name}</Text>
                <Text style={[ir.value, { color: colors.textSecondary, fontSize: TYPO.body, fontWeight: '500' }]}>
                  {(v as any).next_due ? fmtDate((v as any).next_due) : 'Recorded'}
                </Text>
              </View>
            );
          })}
        </Card>}

        {/* Allergies */}
        {(privacy === null || privacy.pet_show_allergies) && allergies.length > 0 && (
          <Card colors={colors} style={{ marginTop: 12 }}>
            <CardLabel title="Known allergies" iconName="warning-outline" color="#F59E0B" />
            {allergies.map((a, i) => {
              const sevColor = a.severity === 'life_threatening' || a.severity === 'severe' ? '#EF4444'
                : a.severity === 'moderate' ? '#F59E0B' : '#64748B';
              return (
                <View key={i} style={[ir.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={[ir.icon, { backgroundColor: `${sevColor}14` }]}>
                    <Ionicons name="alert-circle-outline" size={15} color={sevColor} />
                  </View>
                  <Text style={[ir.label, { color: colors.textSecondary ?? colors.textSecondary }]}>
                    {a.category ?? 'Allergy'}
                  </Text>
                  <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{a.allergen}</Text>
                    <View style={[ps.tag, { backgroundColor: `${sevColor}12`, borderColor: `${sevColor}28` }]}>
                      <Text style={{ fontSize: TYPO.body, color: sevColor, fontWeight: '700', textTransform: 'capitalize' }}>
                        {a.severity.replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        )}

        {/* Vet visits */}
        {(privacy === null || privacy.pet_show_vet_visits) && petVisits.length > 0 && (
          <Card colors={colors} style={{ marginTop: 12 }}>
            <CardLabel title="Vet visits" iconName="medical-outline" color={ac} />
            {petVisits.slice(0, 3).map((v, i) => (
              <View key={(v as any).id ?? i}
                style={[{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={[ir.icon, { backgroundColor: `${ac}14`, marginTop: 1 }]}>
                  <Ionicons name="bandage-outline" size={15} color={ac} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>
                    {v.reason ?? 'Check-up'}
                  </Text>
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary, marginTop: 2 }}>
                    {fmtDate(v.visit_date)}
                    {v.clinic_name ? ` · ${v.clinic_name}` : ''}
                    {v.vet_name ? ` · ${v.vet_name}` : ''}
                  </Text>
                  {v.weight_kg
                    ? <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary, marginTop: 2 }}>
                        Weight recorded: {v.weight_kg} kg
                      </Text>
                    : null
                  }
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Weight chart */}
        {(privacy === null || privacy.pet_show_weight) && petWeights.length > 1 && (
          <Card colors={colors} style={{ marginTop: 12 }}>
            <CardLabel
              title={`Weight${latestWeight ? `  ·  ${latestWeight.weight_kg} kg` : ''}`}
              iconName="barbell-outline" color={ac} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingHorizontal: 16, paddingVertical: 14, height: 90 }}>
              {petWeights.map((w, i) => (
                <View key={(w as any).id ?? i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <View style={{
                    width: '75%', borderRadius: 5,
                    height: Math.max(6, (w.weight_kg / maxWeight) * 56),
                    backgroundColor: i === petWeights.length - 1 ? ac : `${ac}44`,
                  }} />
                  {(i === 0 || i === petWeights.length - 1) && (
                    <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary, marginTop: 4 }}>
                      {(() => { try { return format(parseISO((w as any).logged_at), 'MMM'); } catch { return ''; } })()}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Milestones */}
        {(privacy === null || privacy.pet_show_milestones) && petMiles.length > 0 && (
          <Card colors={colors} style={{ marginTop: 12 }}>
            <CardLabel title="Milestones" iconName="trophy-outline" color={ac} />
            {petMiles.map((m, i) => (
              <View key={(m as any).id ?? i}
                style={[ir.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={[ir.icon, { backgroundColor: `${ac}14` }]}>
                  <Ionicons name="ribbon-outline" size={15} color={ac} />
                </View>
                <Text style={[ir.label, { color: colors.textSecondary ?? colors.textSecondary }]}>
                  {fmtDate((m as any).achieved_at)}
                </Text>
                <Text style={[ir.value, { color: colors.textPrimary, fontSize: TYPO.body }]} numberOfLines={1}>
                  {m.title}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* QR strip */}
        <View style={[ps.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <QRGrid value={shareUrl} size={88} color={ac} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
              {pet.name}'s digital passport
            </Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary, lineHeight: 15 }}>
              {shareUrl}
            </Text>
            <View style={[ps.privacyBadge, { backgroundColor: `${ac}10`, borderColor: `${ac}28` }]}>
              <Ionicons name="lock-closed-outline" size={10} color={ac} />
              <Text style={{ fontSize: TYPO.body, color: ac, fontWeight: '600' }}>Medical records stay private</Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* ── Floating share FAB ── */}
      <View style={[ps.fabWrap, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={handleShare} activeOpacity={0.88} style={[ps.fab, { backgroundColor: ac }]}>
          <Ionicons name="share-social-outline" size={20} color="#fff" />
          <Text style={ps.fabText}>Share {pet.name}'s passport</Text>
        </TouchableOpacity>
      </View>

      {/* ── ViewShot rendered off-screen always ── */}
      <View style={{ position: 'absolute', top: -9999, left: 0 }} pointerEvents="none">
        <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }}>
          <ShareCard
            pet={pet}
            ac={ac}
            age={age}
            together={together}
            vaccineStatus={vaccineStatus}
            vaccineColor={vaccineColor}
            allergies={allergies}
            ownerName={profile?.handle ? `@${profile.handle}` : null}
          />
        </ViewShot>
      </View>

      {/* ── Share preview modal ── */}
      <Modal visible={showSharePreview} transparent animationType="slide" onRequestClose={() => setShowSharePreview(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setShowSharePreview(false)} />

          <View style={[ps.shareSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={[ps.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[ps.sheetTitle, { color: colors.textPrimary }]}>Share Passport</Text>
            <Text style={[ps.sheetSub, { color: colors.textSecondary }]}>
              Share {pet.name}'s pet passport card as an image to any app.
            </Text>

            {/* Card preview — visual only inside the modal */}
            <View style={{ alignItems: 'center', marginVertical: 20 }}>
              <View style={{ transform: [{ scale: 0.85 }], transformOrigin: 'top center' }}>
                <ShareCard
                  pet={pet}
                  ac={ac}
                  age={age}
                  together={together}
                  vaccineStatus={vaccineStatus}
                  vaccineColor={vaccineColor}
                  allergies={allergies}
                  ownerName={profile?.handle ? `@${profile.handle}` : null}
                />
              </View>
            </View>

            <TouchableOpacity onPress={captureAndShare} activeOpacity={0.88}
              style={[ps.fab, { backgroundColor: ac, marginHorizontal: 0 }]}>
              {sharing
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="share-social-outline" size={20} color="#fff" />
                    <Text style={ps.fabText}>Share this card</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ps = StyleSheet.create({
  blob:          { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },

  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   paddingHorizontal: 16, paddingBottom: 14 },
  iconBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.22)',
                   alignItems: 'center', justifyContent: 'center' },
  passportBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  passportLabel: { fontSize: TYPO.body, fontWeight: '700', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.3,
                   textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  editBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, width: 56,
                   backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 7,
                   borderRadius: 20, justifyContent: 'center' },
  editBtnText:   { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },

  heroBody:      { flexDirection: 'row', alignItems: 'center', gap: 14,
                   paddingHorizontal: 16, paddingBottom: 16 },

  avatarRing:    { width: 90, height: 90, borderRadius: 45,
                   borderWidth: 3, borderColor: 'rgba(255,255,255,0.55)',
                   padding: 3, overflow: 'hidden',
                   shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12,
                   shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  avatar:        { width: '100%', height: '100%', borderRadius: 40 },

  heroName:      { fontSize: TYPO.title, fontWeight: '900', color: '#fff', letterSpacing: -0.5,
                   textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  heroSub:       { fontSize: TYPO.body, color: 'rgba(255,255,255,0.9)', marginTop: 3,
                   textTransform: 'capitalize', fontWeight: '500',
                   textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  heroAge:       { fontSize: TYPO.body, color: 'rgba(255,255,255,0.8)', marginTop: 2,
                   textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  pillRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pill:          { flexDirection: 'row', alignItems: 'center', gap: 4,
                   paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
                   backgroundColor: 'rgba(255,255,255,0.92)' },
  pillText:      { fontSize: TYPO.body, fontWeight: '700' },

  statsStrip:    { flexDirection: 'row', marginHorizontal: 16, marginBottom: 0,
                   backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 16, overflow: 'hidden' },
  statCell:      { flex: 1, alignItems: 'center', paddingVertical: 11 },
  statNum:       { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },
  statLabel:     { fontSize: TYPO.body, color: 'rgba(255,255,255,0.6)', fontWeight: '600',
                   textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },

  qrCard:        { marginHorizontal: 16, marginTop: 12, borderRadius: 20,
                   borderWidth: StyleSheet.hairlineWidth, padding: 16,
                   flexDirection: 'row', gap: 14, alignItems: 'flex-start',
                   shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
                   shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  privacyBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8,
                   borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  tag:           { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },

  fabWrap:       { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12 },
  fab:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                   height: 56, borderRadius: 28,
                   shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16,
                   shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabText:       { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },

  shareSheet:    { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12 },
  sheetHandle:   { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle:    { fontSize: TYPO.heading, fontWeight: '800', textAlign: 'center' },
  sheetSub:      { fontSize: TYPO.body, textAlign: 'center', marginTop: 4 },
});
