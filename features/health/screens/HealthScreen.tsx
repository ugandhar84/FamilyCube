import { showAlert } from '@/components/AppAlert';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TouchableWithoutFeedback, StyleSheet,
  Modal, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, RefreshControl, Keyboard,
} from 'react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import {
  updateAppointmentStatus, rescheduleAppointment, toggleMedActive, deleteAppointment,
} from '@/lib/db';
import { deleteWeightLog } from '@/lib/db/weight';
import { supabase } from '@/lib/supabase';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { useTheme } from '@/lib/ThemeContext';
import { format, parseISO, differenceInDays, isValid, isPast } from 'date-fns';
import type { Appointment, Allergy, LabResult, Medication } from '@/lib/types';
import { usesImperial, formatTime } from '@/lib/units';
import PawBondLoader from '@/components/PawBondLoader';
import BottomSheet from '@/components/BottomSheet';
import AppointmentDetailView from '@/components/AppointmentDetailView';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { useVoiceAppointment, type ParsedAppointment } from '@/lib/hooks/useVoiceAppointment';
import { toTitle } from '@/lib/format';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { generateAndShareReport, REPORT_SECTION_LABELS, DEFAULT_SECTIONS, type ReportSection } from '@/lib/healthReport';
import { parseDbTime, safeFmt } from '@/lib/dates';
import SectionHeader from '@/features/health/components/SectionHeader';
import { EmptyCard, FieldLabel } from '@/features/health/components/EmptyCard';
import { WeightWidget, WeightSheet } from '@/features/health/components/WeightWidget';
import { getTypeCfg, getDotColors, vaxStatus, safeISO, buildTimeline, applyTimelineColors, type TLEvent, type TLType } from '@/features/health/components/HealthUtils';
import { styles } from '@/features/health/components/healthStyles';
import { HealthQuickActions } from '@/features/health/components/HealthQuickActions';
import { HealthTimeline } from '@/features/health/components/HealthTimeline';
import { ActiveMedicationsList } from '@/features/health/components/ActiveMedicationsList';
import { VaccineStrip } from '@/features/health/components/VaccineStrip';
import { InsuranceList } from '@/features/health/components/InsuranceList';
import PetHeaderChip from '@/components/PetHeaderChip';

import { useHealthData } from '@/features/health/hooks/useHealthData';
import { useAppointmentForm } from '@/features/health/hooks/useAppointmentForm';
import { useMedicationForm } from '@/features/health/hooks/useMedicationForm';
import { TYPO } from '@/constants/theme';

// ─────────────────────────────────────────────────────────────────────────────
const APPT_TYPES: { value: Appointment['type']; label: string; emoji: string; providerLabel: string; locationLabel: string }[] = [
  { value: 'checkup',   label: 'Checkup',   emoji: '🩺', providerLabel: 'Vet name',     locationLabel: 'Clinic' },
  { value: 'vaccine',   label: 'Vaccine',   emoji: '💉', providerLabel: 'Vet name',     locationLabel: 'Clinic' },
  { value: 'dental',    label: 'Dental',    emoji: '🦷', providerLabel: 'Vet name',     locationLabel: 'Clinic' },
  { value: 'surgery',   label: 'Surgery',   emoji: '⚕️', providerLabel: 'Vet name',     locationLabel: 'Clinic' },
  { value: 'grooming',  label: 'Grooming',  emoji: '✂️', providerLabel: 'Groomer name', locationLabel: 'Salon' },
  { value: 'follow_up', label: 'Follow-up', emoji: '📋', providerLabel: 'Vet name',     locationLabel: 'Clinic' },
  { value: 'other',     label: 'Other',     emoji: '📅', providerLabel: 'Provider',     locationLabel: 'Location' },
];
const FREQ_OPTS = ['daily', 'weekly', 'monthly', 'as_needed'] as const;
const TL_FILTERS: { key: string; label: string }[] = [
  { key: 'all',         label: 'All'          },
  { key: 'appointment', label: 'Appointments' },
  { key: 'vaccine',     label: 'Vaccines'     },
  { key: 'medication',  label: 'Medications'  },
  { key: 'lab',         label: 'Lab results'  },
  { key: 'weight',      label: 'Weight'       },
  { key: 'allergy',     label: 'Allergies'    },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function HealthScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const healthRecordsEnabled = useFeatureFlag('health_records_enabled', true);
  const voiceApptEnabled = useFeatureFlag('appt_voice_input_enabled', true);
  const { tier } = useSubscriptionStore();
  const scrollViewRef = useRef<ScrollView>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const { activePetId, activePet, petRoles, pets, setActivePet } = usePetStore(useShallow(s => ({
    activePetId: s.activePetId, activePet: s.activePet,
    petRoles: s.petRoles, pets: s.pets, setActivePet: s.setActivePet,
  })));
  const pet    = activePet();
  const accent = pet?.accent_color ?? colors.primary;
  const perms  = getPermissions(activePetId ? petRoles[activePetId] : 'owner');
  const s      = useMemo(() => styles(colors, accent), [colors, accent]);
  const TYPE_CFG  = useMemo(() => getTypeCfg(colors), [colors]);
  const DOT_COLORS = useMemo(() => getDotColors(colors), [colors]);

  // ── Domain hooks ──────────────────────────────────────────────────────────
  const hd = useHealthData(activePetId);

  const apptOrigRef = useRef<Record<string, any> | null>(null);
  const apptF = useAppointmentForm({
    activePetId, activePet: pet, voiceApptEnabled, tier, petsCount: pets.length,
    onSaved: () => hd.load(),
    setActivePet,
  });

  const medF = useMedicationForm({
    activePetId, setMeds: hd.setMeds, onSaved: () => hd.load(),
    setPickerMode: apptF.setPickerMode, setPickerDate: apptF.setPickerDate,
    pickerMode: apptF.pickerMode, pickerDate: apptF.pickerDate,
  });

  // ── Local state ────────────────────────────────────────────────────────────
  const [tlFilter,       setTlFilter]       = useState('all');
  const [tlDateFrom,     setTlDateFrom]     = useState<string | null>(null);
  const [tlDateTo,       setTlDateTo]       = useState<string | null>(null);
  const [weightSheet,    setWeightSheet]     = useState(false);
  const [weightEdit,     setWeightEdit]      = useState<any>(null);
  const [monthsShown,    setMonthsShown]     = useState(12);
  const [showReportSheet,  setShowReportSheet]  = useState(false);
  const [reportSections,   setReportSections]   = useState<ReportSection[]>(DEFAULT_SECTIONS);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Reset scroll on pet change
  const lastScrollPet = useRef<string | null>(null);
  useEffect(() => {
    if (activePetId && activePetId !== lastScrollPet.current) {
      lastScrollPet.current = activePetId;
      hd.lastFetch.current = 0;
      scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    }
  }, [activePetId]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const activeMeds = hd.meds.filter(m => m.is_active);
  const todayAppts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const midnight = new Date(today); midnight.setDate(midnight.getDate() + 1);
    return hd.appts.filter(a => { const d = safeISO(a.scheduled_at); return !!d && d >= today && d < midnight; })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [hd.appts]);

  const futureUpcoming = useMemo(() => {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0); midnight.setDate(midnight.getDate() + 1);
    return hd.appts.filter(a => {
      if (a.status === 'completed' || a.status === 'cancelled') return false;
      const d = safeISO(a.scheduled_at); return !!d && d >= midnight;
    }).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [hd.appts]);

  const apptCards = useMemo(() => {
    const todayIds = new Set(todayAppts.map(a => a.id));
    return [...todayAppts, ...futureUpcoming.filter(a => !todayIds.has(a.id))].slice(0, 5);
  }, [todayAppts, futureUpcoming]);

  const upcoming = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return hd.appts.filter(a => {
      if (a.status === 'completed' || a.status === 'cancelled') return false;
      const d = safeISO(a.scheduled_at); return !!d && d >= today;
    }).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [hd.appts]);

  const overdueVax = hd.vaxes.filter(v => v.next_due && differenceInDays(parseISO(v.next_due), new Date()) < 0).length;
  const dueSoonVax = hd.vaxes.filter(v => { if (!v.next_due) return false; const d = differenceInDays(parseISO(v.next_due), new Date()); return d >= 0 && d <= 30; }).length;
  const nextAppt   = upcoming[0] ?? null;

  // Split data build (stable on theme change) from color decoration (cheap re-pass on theme change)
  // Pass empty colors — applyTimelineColors below will decorate with real theme values
  const timelineData = useMemo(() => buildTimeline(hd.appts, hd.vaxes, hd.meds, hd.labs, hd.weights, hd.allergies, {}), [hd.appts, hd.vaxes, hd.meds, hd.labs, hd.weights, hd.allergies]);
  const timeline     = useMemo(() => applyTimelineColors(timelineData, colors), [timelineData, colors]);
  const filteredTL = useMemo(() => {
    let tl = tlFilter === 'all' ? timeline : timeline.filter(e => e.type === tlFilter);
    if (tlDateFrom) tl = tl.filter(e => e.date >= tlDateFrom);
    if (tlDateTo)   tl = tl.filter(e => e.date <= tlDateTo);
    return tl;
  }, [timeline, tlFilter, tlDateFrom, tlDateTo]);

  // ── Timeline delete handlers ───────────────────────────────────────────────
  const deleteEvById = useCallback(async (ev: TLEvent) => {
    const rawId = ev.raw.id;
    if (ev.type === 'appointment') await deleteAppointment(rawId);
    else if (ev.type === 'medication') { const { deleteMedication } = await import('@/lib/db'); await deleteMedication(rawId); }
    else if (ev.type === 'vaccine') await supabase.from('vaccinations').delete().eq('id', rawId);
    else if (ev.type === 'weight') await deleteWeightLog(rawId);
    else if (ev.type === 'lab') await supabase.from('lab_results').delete().eq('id', rawId);
  }, []);

  const onDeleteEntryTimeline = useCallback(async (ev: TLEvent) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('delete records')); return; }
    showAlert(`Delete ${ev.title}?`, 'This record will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteEvById(ev); hd.load(); } catch (e: any) { showAlert('Error', e.message ?? 'Could not delete record.'); } } },
    ]);
  }, [perms.canLogHealth, deleteEvById, hd.load]);

  const onDeleteGroupTimeline = useCallback(async (evs: TLEvent[], label: string) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('delete records')); return; }
    showAlert(`Delete all ${label}?`, `${evs.length} record${evs.length !== 1 ? 's' : ''} will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Delete ${evs.length}`, style: 'destructive', onPress: async () => { try { await Promise.all(evs.map(deleteEvById)); hd.load(); } catch (e: any) { showAlert('Error', e.message ?? 'Could not delete records.'); } } },
    ]);
  }, [perms.canLogHealth, deleteEvById, hd.load]);

  const onToggleMedActiveTimeline = useCallback(async (id: string, newActive: boolean) => {
    hd.setMeds(prev => prev.map(m => m.id === id ? { ...m, is_active: newActive } as Medication : m));
    try { await toggleMedActive(id, newActive); }
    catch (err: any) {
      hd.setMeds(prev => prev.map(m => m.id === id ? { ...m, is_active: !newActive } as Medication : m));
      showAlert('Error', err.message ?? 'Could not update medication.');
    }
    hd.load();
  }, [hd.setMeds, hd.load]);

  // ═══════════════════════════════════════════════════════════════════════════
  if (pets.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
          {!hideHeader && (
            <View style={s.header}>
              <Text style={s.heading}>Health</Text>
            </View>
          )}
        </SafeAreaView>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
          <Text style={{ fontSize: 56 }}>🐾</Text>
          <Text style={{ fontSize: TYPO.title, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.3 }}>
            No babies yet
          </Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
            Add your first pet to start tracking health records, appointments, and care logs.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/onboarding/add-pet')}
            style={{ marginTop: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, backgroundColor: colors.primary }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Add your first pet →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={hideHeader ? { flex: 1 } : s.safe}>
      <SafeAreaView edges={hideHeader ? [] : ['top']} style={hideHeader ? undefined : { backgroundColor: colors.background }}>
        {!hideHeader && (
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.heading}>Health</Text>
              <Text style={s.subheading}>{pet?.name} · {new Date().getFullYear()}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PetHeaderChip pet={pet as any} variant="chip" />
              <TouchableOpacity onPress={() => setShowReportSheet(true)} style={s.bellBtn}>
                <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/(tabs)/all-notifications')} style={s.bellBtn}>
                <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>

      {hd.loadFailed && (
        <TouchableOpacity onPress={() => hd.load()}
          style={{ backgroundColor: colors.warningLight, borderBottomWidth: 1, borderBottomColor: colors.warning + '44',
            paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary }}>Some health data couldn't load. Tap to retry.</Text>
          <Ionicons name="refresh-outline" size={14} color={colors.warning} />
        </TouchableOpacity>
      )}

      <ScrollView ref={scrollViewRef} style={{ flex: 1 }}
        showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never"
        onScroll={e => setShowScrollTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={hd.refreshing} onRefresh={() => hd.load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}>

        <HealthQuickActions
          perms={perms} tier={tier} accent={accent} colors={colors} s={s}
          healthRecordsEnabled={healthRecordsEnabled}
          onLogWeight={() => { setWeightEdit(null); setWeightSheet(true); }}
          onAddAppt={apptF.openAddAppt}
          onVetReport={() => setShowReportSheet(true)}
        />

        {hd.loading
          ? <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}><PawBondLoader size={48} isDark={isDark} /></View>
          : <>
            {/* ── Appointments ── */}
            <SectionHeader icon="calendar-number-outline" title="APPOINTMENTS" colors={colors}>
              <TouchableOpacity onPress={() => router.push('/health/appointments')}>
                <Text style={[s.sectionAction, { color: accent }]}>Show all →</Text>
              </TouchableOpacity>
            </SectionHeader>

            {apptCards.length === 0
              ? <EmptyCard icon="calendar-outline" label="No appointments scheduled" addLabel="Schedule appointment" onPress={apptF.openAddAppt} colors={colors} />
              : (
                <View style={[s.card, { gap: 0 }]}>
                  {apptCards.map((a, i) => {
                    const apptDt   = parseDbTime(a.scheduled_at);
                    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
                    const midnight = new Date(todayMid); midnight.setDate(midnight.getDate() + 1);
                    const isOverdue   = a.status === 'upcoming' && isPast(apptDt);
                    const isDone      = a.status === 'completed';
                    const isCancelled = a.status === 'cancelled';
                    const isRescheduled = (a.status as string) === 'rescheduled';
                    const upcomingColor = colors.info ?? (isDark ? '#60A5FA' : '#3B82F6');
                    const upcomingBg    = colors.infoLight ?? upcomingColor + '20';
                    const statusColor = isOverdue ? colors.danger : isDone ? colors.success : isCancelled ? (colors.textTertiary ?? colors.textSecondary) : isRescheduled ? (colors.warning ?? '#E8A320') : upcomingColor;
                    const statusBg    = isOverdue ? colors.dangerLight : isDone ? colors.successLight : isCancelled ? (colors.inputBg ?? colors.background) : isRescheduled ? (colors.warningLight ?? colors.warning + '18') : upcomingBg;
                    const statusTag   = isOverdue ? 'OVERDUE' : isDone ? 'DONE' : isCancelled ? 'CANCELLED' : isRescheduled ? 'RESCHEDULED' : 'UPCOMING';
                    return (
                      <TouchableOpacity key={a.id}
                        style={[s.apptRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, isOverdue && { borderLeftWidth: 3, borderLeftColor: colors.danger }]}
                        onPress={() => apptF.onPressApptTimeline({ type: 'appointment', title: a.title, date: a.scheduled_at, raw: a } as TLEvent)}
                        onLongPress={() => apptF.deleteAppt(a.id)} activeOpacity={0.75}>
                        <View style={s.apptDateBlock}>
                          <Text style={[s.apptDay, { color: statusColor }]}>{safeFmt(a.scheduled_at, 'd')}</Text>
                          <Text style={[s.apptMon, { color: statusColor }]}>{safeFmt(a.scheduled_at, 'MMM').toUpperCase()}</Text>
                        </View>
                        <View style={[s.apptDivider, { backgroundColor: statusColor + '40' }]} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.apptTitle, (isDone || isCancelled) && { opacity: 0.5 }]} numberOfLines={1}>{a.title}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                            <View style={{ backgroundColor: statusColor + '20', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: statusColor + '50' }}>
                              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: statusColor, letterSpacing: 0.3 }}>{formatTime(parseISO(a.scheduled_at))}</Text>
                            </View>
                            {[a.vet_name ? `Dr. ${a.vet_name.replace(/^Dr\.?\s*/i, '')}` : null, a.clinic_name].filter(Boolean).length > 0 && (
                              <Text style={s.apptMeta} numberOfLines={1}>{[a.vet_name ? `Dr. ${a.vet_name.replace(/^Dr\.?\s*/i, '')}` : null, a.clinic_name].filter(Boolean).join(' · ')}</Text>
                            )}
                          </View>
                        </View>
                        <View style={[s.countdownChip, { backgroundColor: statusBg, borderWidth: 1, borderColor: statusColor + '40' }]}>
                          <Text style={[s.countdownText, { color: statusColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{statusTag}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

            {/* ── Weight ── */}
            <SectionHeader icon="scale-outline" title="WEIGHT" colors={colors}>
              {hd.weights.length > 0 && <TouchableOpacity onPress={() => router.push('/health/weights' as any)}><Text style={[s.sectionAction, { color: accent }]}>Show all →</Text></TouchableOpacity>}
            </SectionHeader>
            <WeightWidget weights={hd.weights} accent={accent} colors={colors}
              onAdd={() => { setWeightEdit(null); setWeightSheet(true); }}
              onEdit={(w) => { setWeightEdit(w); setWeightSheet(true); }}
              onDelete={(id) => showAlert('Delete entry?', 'This weight log will be removed.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteWeightLog(id); hd.load(); } catch (e: any) { showAlert('Error', e.message); } } },
              ])}
            />

            {/* ── Active Medications ── */}
            <SectionHeader icon="medical-outline" title="ACTIVE MEDICATIONS" colors={colors}>
              <TouchableOpacity onPress={() => router.push('/health/medications')}><Text style={[s.sectionAction, { color: accent }]}>Show all →</Text></TouchableOpacity>
            </SectionHeader>
            <ActiveMedicationsList activeMeds={activeMeds as any[]} colors={colors} s={s}
              onPressMed={(m) => { const d = { ...m }; medF.medOrigRef.current = d; medF.setMedData(d); medF.setIsMedViewMode(true); setTimeout(() => medF.setMedModal(true), 0); }}
              onAddMed={() => { medF.setIsMedViewMode(false); medF.setMedData({ is_active: true, frequency: 'daily' }); medF.setMedModal(true); }}
            />

            {/* ── Vaccines ── */}
            <SectionHeader icon="shield-checkmark-outline" title="VACCINES" colors={colors}>
              <TouchableOpacity onPress={() => router.push('/health/vaccines')}><Text style={[s.sectionAction, { color: accent }]}>Show all →</Text></TouchableOpacity>
            </SectionHeader>
            <VaccineStrip vaxes={hd.vaxes} colors={colors} s={s} />

            {/* ── Insurance ── */}
            <SectionHeader icon="shield-outline" title="INSURANCE" colors={colors}>
              <TouchableOpacity onPress={() => router.push('/health/insurance')}><Text style={[s.sectionAction, { color: accent }]}>Show all →</Text></TouchableOpacity>
            </SectionHeader>
            <InsuranceList insurance={hd.insurance} colors={colors} s={s} />

            {/* ── Timeline ── */}
            <SectionHeader icon="time-outline" title="FULL HEALTH TIMELINE" colors={colors} />
            <HealthTimeline
              filteredTL={filteredTL} tlFilter={tlFilter} setTlFilter={setTlFilter}
              tlDateFrom={tlDateFrom} tlDateTo={tlDateTo}
              setTlDateFrom={setTlDateFrom} setTlDateTo={setTlDateTo}
              tier={tier} petName={pet?.name} colors={colors} accent={accent}
              monthsShown={monthsShown} setMonthsShown={setMonthsShown}
              aiSummaryMap={hd.aiSummaryMap} s={s} typeCfg={TYPE_CFG}
              onPressAppt={apptF.onPressApptTimeline}
              onPressMed={medF.onPressMedTimeline}
              onToggleMedActive={onToggleMedActiveTimeline}
              onDeleteEntry={onDeleteEntryTimeline}
              onDeleteGroup={onDeleteGroupTimeline}
            />
          </>
        }
      </ScrollView>

      {/* Scroll-to-top FAB */}
      {showScrollTop && (
        <TouchableOpacity onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Appointment input chooser (voice vs type) ── */}
      <BottomSheet visible={apptF.apptInputSheet} onClose={() => { apptF.voice.cancel(); apptF.setVoiceReview(null); apptF.setApptInputSheet(false); }}>
        <View style={{ paddingTop: 4, paddingBottom: 8 }}>
          {pets.length > 1 && !apptF.voiceReview && (
            <View style={{ marginBottom: 18 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>For which pet?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {pets.map(p => {
                  const sel = apptF.apptPetId === p.id;
                  return (
                    <TouchableOpacity key={p.id} onPress={() => apptF.setApptPetId(p.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, backgroundColor: sel ? (p.accent_color ?? accent) + '18' : 'transparent', borderColor: sel ? (p.accent_color ?? accent) : colors.border }}>
                      {p.emoji ? <Text style={{ fontSize: TYPO.subheading }}>{p.emoji}</Text> : null}
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: sel ? (p.accent_color ?? accent) : colors.textSecondary }}>{p.name}</Text>
                      {sel && <Ionicons name="checkmark-circle" size={15} color={p.accent_color ?? accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {apptF.voiceReview ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: '#22C55E18', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: TYPO.heading }}>✅</Text></View>
                <View>
                  <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary }}>Review appointment</Text>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>AI filled these details from your voice</Text>
                </View>
              </View>
              {(() => {
                if (!apptF.voiceReview.scheduled_at) return null;
                try { const d = new Date(apptF.voiceReview.scheduled_at.replace(' ', 'T')); if (isValid(d) && isPast(d)) return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF9C3', borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FDE047' }}>
                    <Ionicons name="warning-outline" size={16} color="#CA8A04" />
                    <Text style={{ flex: 1, fontSize: TYPO.caption, color: '#92400E', fontWeight: '600' }}>This date is in the past — please update it in the form.</Text>
                  </View>
                ); } catch {}
                return null;
              })()}
              <View style={{ backgroundColor: colors.inputBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 16 }}>
                {[
                  { icon: 'clipboard-outline' as const,  label: 'Title',    value: apptF.voiceReview.title ?? '—' },
                  { icon: 'medical-outline' as const,    label: 'Type',     value: apptF.voiceReview.type ? apptF.voiceReview.type.charAt(0).toUpperCase() + apptF.voiceReview.type.slice(1) : '—' },
                  { icon: 'calendar-outline' as const,   label: 'Date & time', value: (() => { if (!apptF.voiceReview.scheduled_at) return '—'; try { const d = new Date(apptF.voiceReview.scheduled_at.replace(' ', 'T')); return isValid(d) ? `${format(d, 'EEE, MMM d, yyyy')} · ${formatTime(d)}` : apptF.voiceReview.scheduled_at; } catch { return apptF.voiceReview.scheduled_at; } })() },
                  { icon: 'person-outline' as const,     label: 'Vet',      value: apptF.voiceReview.vet_name ?? null },
                  { icon: 'business-outline' as const,   label: 'Clinic',   value: apptF.voiceReview.clinic_name ?? null },
                  { icon: 'location-outline' as const,   label: 'Address',  value: apptF.voiceReview.clinic_address ?? null },
                  { icon: 'document-text-outline' as const, label: 'Notes', value: apptF.voiceReview.notes ?? null },
                ].filter(r => !!r.value || ['Title', 'Date & time'].includes(r.label)).map((row, i, arr) => (
                  <View key={row.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <Ionicons name={row.icon} size={15} color={accent} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{row.label}</Text>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: row.value ? colors.textPrimary : colors.placeholder, marginTop: 1 }}>{row.value ?? '—'}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <TouchableOpacity onPress={apptF.confirmVoiceReview}
                style={{ height: 50, borderRadius: 14, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', marginBottom: 10, shadowColor: accent, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Looks good — save appointment</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => { apptF.setVoiceReview(null); apptF.voice.cancel(); }}
                  style={{ flex: 1, height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>🎙️ Re-record</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setActivePet(apptF.apptPetId ?? activePetId ?? ''); apptF.setVoiceReview(null); apptF.setApptInputSheet(false); apptF.setIsApptViewMode(false); apptF.setApptData({ type: apptF.voiceReview!.type ?? 'checkup', status: 'upcoming', title: apptF.voiceReview!.title ?? '', scheduled_at: apptF.voiceReview!.scheduled_at ?? '', vet_name: apptF.voiceReview!.vet_name ?? null, clinic_name: apptF.voiceReview!.clinic_name ?? null, clinic_address: apptF.voiceReview!.clinic_address ?? null, notes: apptF.voiceReview!.notes ?? null }); apptF.setApptModal(true); }}
                  style={{ flex: 1, height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>✏️ Edit directly</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 }}>Add Appointment</Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 20 }}>How would you like to enter the details?</Text>
              {(apptF.voice.state === 'idle' || apptF.voice.state === 'error') && (
                <TouchableOpacity onPress={() => apptF.voice.start()}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: accent + '14', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 10, borderWidth: 1.5, borderColor: accent + '40' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="mic" size={22} color={accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Speak it 🎙️</Text>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>Say the details — AI fills the form for you</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
              {apptF.voice.state === 'listening' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#EF444414', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 10, borderWidth: 1.5, borderColor: '#EF4444' }}>
                  <ActivityIndicator color="#EF4444" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#EF4444' }}>Listening… speak now</Text>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>"Dental cleaning for Luna, Aug 10 at 2pm, City Vet"</Text>
                  </View>
                  <TouchableOpacity onPress={apptF.voice.stop} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#EF444430', borderRadius: 10 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
              {apptF.voice.state === 'processing' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.inputBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 10, borderWidth: 1.5, borderColor: colors.border }}>
                  <ActivityIndicator color={accent} />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Analysing with AI…</Text>
                </View>
              )}
              {apptF.voice.state === 'error' && apptF.voice.error && (
                <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#FECACA' }}>
                  <Text style={{ fontSize: TYPO.caption, color: '#DC2626' }}>{apptF.voice.error}</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => { setActivePet(apptF.apptPetId ?? activePetId ?? ''); apptF.setApptInputSheet(false); apptF.setIsApptViewMode(false); apptF.setApptData({ type: 'checkup', status: 'upcoming' }); apptF.setApptModal(true); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.inputBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 1.5, borderColor: colors.border }}>
                <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="create-outline" size={22} color={colors.textSecondary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Type it</Text>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>Fill in the appointment form manually</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </BottomSheet>

      {/* ── Appointment modal ── */}
      <Modal visible={apptF.apptModal} transparent animationType="slide"
        onRequestClose={() => { Keyboard.dismiss(); apptF.voice.reset(); apptF.setApptModal(false); apptF.setApptData(null); }}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); apptF.setApptModal(false); apptF.setApptData(null); }}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[s.sheet, { backgroundColor: colors.surface }]}>
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <View style={s.sheetHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="calendar-outline" size={16} color={accent} />
                </View>
                <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>{apptF.isApptViewMode && apptF.apptData?.id ? 'Appointment details' : apptF.apptData?.id ? 'Edit appointment' : 'Schedule appointment'}</Text>
              </View>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); apptF.setApptModal(false); apptF.setApptData(null); apptF.setIsApptViewMode(true); }}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {apptF.isApptViewMode && apptF.apptData?.id ? (
              <AppointmentDetailView
                key={apptF.apptData.id} appt={apptF.apptData as any} accent={accent}
                canEdit={perms.canLogHealth}
                onClose={() => { apptF.setApptModal(false); apptF.setApptData(null); apptF.setIsApptViewMode(true); }}
                onEdit={() => apptF.setIsApptViewMode(false)}
                onDelete={() => showAlert('Delete appointment?', apptF.apptData!.title, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => {
                    try { await deleteAppointment(apptF.apptData!.id); } catch { showAlert('Error', 'Could not delete appointment.'); return; }
                    apptF.setApptModal(false); apptF.setApptData(null); apptF.setIsApptViewMode(true); hd.load();
                  }},
                ])}
                onReschedule={async (newIso) => {
                  try { await rescheduleAppointment(apptF.apptData!.id, newIso); } catch { showAlert('Error', 'Could not reschedule.'); return; }
                  apptF.setApptModal(false); apptF.setApptData(null); apptF.setIsApptViewMode(true); hd.load();
                }}
                onComplete={async (summary) => {
                  try { await updateAppointmentStatus(apptF.apptData!.id, 'completed', summary ? { visit_summary: summary } : undefined); } catch { showAlert('Error', 'Could not update status.'); return; }
                  apptF.setApptModal(false); apptF.setApptData(null); apptF.setIsApptViewMode(true); hd.load();
                }}
                onCancel={async () => {
                  try { await updateAppointmentStatus(apptF.apptData!.id, 'cancelled'); } catch { showAlert('Error', 'Could not update status.'); return; }
                  apptF.setApptModal(false); apptF.setApptData(null); apptF.setIsApptViewMode(true); hd.load();
                }}
              />
            ) : (
              <>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                  <FieldLabel label="Type" colors={colors} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                    {APPT_TYPES.map(t => {
                      const sel = (apptF.apptData?.type ?? 'checkup') === t.value;
                      return (
                        <TouchableOpacity key={t.value} onPress={() => apptF.setApptData(p => ({ ...p, type: t.value }))}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, backgroundColor: sel ? accent + '22' : 'transparent', borderColor: sel ? accent : colors.border }}>
                          <Text style={{ fontSize: TYPO.body }}>{t.emoji}</Text>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: sel ? accent : colors.textSecondary }}>{t.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <FieldLabel label="Title *" colors={colors} />
                  <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                    placeholder="e.g. Annual checkup, Dental" placeholderTextColor={colors.placeholder}
                    value={apptF.apptData?.title ?? ''} onChangeText={t => apptF.setApptData(p => ({ ...p, title: t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, '') }))} maxLength={100} />

                  <FieldLabel label="Date & time *" colors={colors} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[s.dateBtn, { flex: 1, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                      onPress={() => { const b = apptF.apptData?.scheduled_at ? new Date(apptF.apptData.scheduled_at.replace(' ', 'T')) : new Date(); apptF.setPickerDate(isNaN(b.getTime()) ? new Date() : b); apptF.setPickerMode('date'); }}>
                      <Ionicons name="calendar-outline" size={14} color={accent} />
                      <Text style={[s.dateBtnText, { color: apptF.apptData?.scheduled_at ? colors.textPrimary : colors.placeholder }]}>{apptF.apptData?.scheduled_at ? format(new Date(apptF.apptData.scheduled_at.replace(' ', 'T')), 'MMM d, yyyy') : 'Select date'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.dateBtn, { flex: 0.7, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                      onPress={() => { const b = apptF.apptData?.scheduled_at ? new Date(apptF.apptData.scheduled_at.replace(' ', 'T')) : new Date(); apptF.setPickerDate(isNaN(b.getTime()) ? new Date() : b); apptF.setPickerMode('time'); }}>
                      <Ionicons name="time-outline" size={14} color={accent} />
                      <Text style={[s.dateBtnText, { color: apptF.apptData?.scheduled_at ? colors.textPrimary : colors.placeholder }]}>{apptF.apptData?.scheduled_at ? formatTime(new Date(apptF.apptData.scheduled_at.replace(' ', 'T'))) : 'Time'}</Text>
                    </TouchableOpacity>
                  </View>

                  <AppDateTimePicker
                    visible={apptF.pickerMode === 'date' || apptF.pickerMode === 'time'}
                    value={apptF.pickerDate}
                    mode={apptF.pickerMode === 'time' ? 'time' : 'date'}
                    accent={accent}
                    onCancel={() => apptF.setPickerMode(null)}
                    onConfirm={(d) => {
                      apptF.setPickerDate(d);
                      const ex = apptF.apptData?.scheduled_at ?? '';
                      if (apptF.pickerMode === 'date') apptF.setApptData(p => ({ ...p, scheduled_at: `${format(d, 'yyyy-MM-dd')} ${ex.slice(11, 16) || '09:00'}` }));
                      else apptF.setApptData(p => ({ ...p, scheduled_at: `${ex.slice(0, 10) || format(d, 'yyyy-MM-dd')} ${format(d, 'HH:mm')}` }));
                      apptF.setPickerMode(null);
                    }}
                  />

                  {(() => {
                    const tc = APPT_TYPES.find(t => t.value === (apptF.apptData?.type ?? 'checkup')) ?? APPT_TYPES[0];
                    return (
                      <>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <FieldLabel label={tc.providerLabel} colors={colors} />
                            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                              placeholder={apptF.apptData?.type === 'grooming' ? 'Paws & Claws' : 'Dr. Sarah Kim'} placeholderTextColor={colors.placeholder}
                              value={apptF.apptData?.vet_name ?? ''} onChangeText={t => apptF.setApptData(p => ({ ...p, vet_name: t.replace(/[^\p{L}\s\-'.]/gu, '') }))} maxLength={80} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <FieldLabel label="Phone" colors={colors} />
                            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                              placeholder="555-123-4567" placeholderTextColor={colors.placeholder}
                              value={apptF.apptData?.vet_phone ?? ''} onChangeText={t => apptF.setApptData(p => ({ ...p, vet_phone: t }))} keyboardType="phone-pad" maxLength={20} />
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <FieldLabel label={tc.locationLabel} colors={colors} />
                            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                              placeholder={apptF.apptData?.type === 'grooming' ? 'Happy Paws Salon' : 'City Animal Clinic'} placeholderTextColor={colors.placeholder}
                              value={apptF.apptData?.clinic_name ?? ''} onChangeText={t => apptF.setApptData(p => ({ ...p, clinic_name: t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, '') }))} maxLength={100} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <FieldLabel label="Address" colors={colors} />
                            <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                              placeholder="123 Main St" placeholderTextColor={colors.placeholder}
                              value={apptF.apptData?.clinic_address ?? ''} onChangeText={t => apptF.setApptData(p => ({ ...p, clinic_address: t }))} maxLength={150} />
                          </View>
                        </View>
                      </>
                    );
                  })()}

                  <FieldLabel label="Cost ($)" colors={colors} />
                  <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                    placeholder="0.00" placeholderTextColor={colors.placeholder}
                    value={apptF.apptData?.cost != null ? String(apptF.apptData.cost) : ''} onChangeText={t => apptF.setApptData(p => ({ ...p, cost: t }))} keyboardType="decimal-pad" maxLength={10} />

                  <FieldLabel label="Repeat" colors={colors} />
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                    {(['none', 'monthly', 'yearly'] as const).map(r => (
                      <TouchableOpacity key={r} onPress={() => apptF.setApptData(p => ({ ...p, recurrence: r }))}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', borderColor: (apptF.apptData?.recurrence ?? 'none') === r ? accent : colors.border, backgroundColor: (apptF.apptData?.recurrence ?? 'none') === r ? accent + '22' : 'transparent' }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: (apptF.apptData?.recurrence ?? 'none') === r ? accent : colors.textSecondary, textTransform: 'capitalize' }}>{r === 'none' ? 'Once' : r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <FieldLabel label="Notes" colors={colors} />
                  <TextInput style={[s.input, { height: 80, paddingTop: 12, textAlignVertical: 'top', color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                    multiline placeholder="Prep instructions…" placeholderTextColor={colors.placeholder}
                    value={apptF.apptData?.notes ?? ''} onChangeText={t => apptF.setApptData(p => ({ ...p, notes: t }))} maxLength={500} />

                  {apptF.apptData?.status === 'completed' && (
                    <>
                      <FieldLabel label="Visit summary" colors={colors} />
                      <TextInput style={[s.input, { height: 88, paddingTop: 12, textAlignVertical: 'top', color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                        multiline placeholder="Diagnosis, treatment, follow-up instructions…" placeholderTextColor={colors.placeholder}
                        value={apptF.apptData?.visit_summary ?? ''} onChangeText={t => apptF.setApptData(p => ({ ...p, visit_summary: t }))} maxLength={1000} />
                    </>
                  )}
                </ScrollView>
                <View style={[s.modalBtns, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 }]}>
                  <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]}
                    onPress={() => { Keyboard.dismiss(); if (apptF.apptData?.id) { apptF.setApptData(apptOrigRef.current); apptF.setIsApptViewMode(true); } else { apptF.setApptModal(false); apptF.setApptData(null); } }}>
                    <Text style={[s.cancelText, { color: colors.textSecondary }]}>{apptF.apptData?.id ? 'Back' : 'Cancel'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent, opacity: apptF.saving ? 0.6 : 1 }]} onPress={apptF.saveAppt} disabled={apptF.saving}>
                    {apptF.saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Medication modal ── */}
      <Modal visible={medF.medModal} transparent animationType="slide"
        onRequestClose={() => { Keyboard.dismiss(); medF.setMedModal(false); medF.setMedData(null); }}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); medF.setMedModal(false); medF.setMedData(null); }}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[s.sheet, { backgroundColor: colors.surface }]}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <View style={s.sheetHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="medical-outline" size={16} color={accent} /></View>
                <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>{medF.isMedViewMode && medF.medData?.id ? 'Medication details' : medF.medData?.id ? 'Edit medication' : 'Add medication'}</Text>
              </View>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); medF.setMedModal(false); medF.setMedData(null); medF.setIsMedViewMode(true); }}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {medF.isMedViewMode && medF.medData?.id ? (
              <>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                  {[
                    { label: 'Name', value: medF.medData.name },
                    { label: 'Dosage', value: medF.medData.dosage },
                    { label: 'Frequency', value: medF.medData.frequency ? toTitle(medF.medData.frequency.replace(/_/g, ' ')) : undefined },
                    { label: 'Start date', value: medF.medData.start_date ? format(parseISO(medF.medData.start_date), 'MMM d, yyyy') : null },
                    { label: 'End date', value: medF.medData.end_date ? format(parseISO(medF.medData.end_date), 'MMM d, yyyy') : null },
                    { label: 'Status', value: medF.medData.is_active ? 'Active' : 'Stopped' },
                    { label: 'Notes', value: medF.medData.notes },
                  ].filter(r => r.value).map(r => (
                    <View key={r.label} style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{r.label}</Text>
                      <Text style={{ fontSize: TYPO.body, color: r.label === 'Status' ? (medF.medData?.is_active ? colors.success : colors.textSecondary) : colors.textPrimary, fontWeight: '500' }}>{r.value}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={[s.modalBtns, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 }]}>
                  <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border, flex: 1 }]} onPress={() => { medF.setMedModal(false); medF.setMedData(null); medF.setIsMedViewMode(true); }}>
                    <Text style={[s.cancelText, { color: colors.textSecondary }]}>Close</Text>
                  </TouchableOpacity>
                  {perms.canLogHealth && (
                    <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.danger, flex: 0.7 }]}
                      onPress={() => showAlert('Delete medication?', medF.medData?.name, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: async () => {
                          try { const { deleteMedication } = await import('@/lib/db'); await deleteMedication(medF.medData!.id); }
                          catch { showAlert('Error', 'Could not delete medication.'); return; }
                          medF.setMedModal(false); medF.setMedData(null); medF.setIsMedViewMode(true); hd.load();
                        }},
                      ])}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                  {perms.canLogHealth && (
                    <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }]} onPress={() => medF.setIsMedViewMode(false)}>
                      <Ionicons name="pencil-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={s.saveText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              <>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 2 }}>
                      <FieldLabel label="Name *" colors={colors} />
                      <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                        placeholder="Carprofen, Apoquel…" placeholderTextColor={colors.placeholder}
                        returnKeyType="next" blurOnSubmit={false}
                        value={medF.medData?.name ?? ''} onChangeText={t => medF.setMedData(p => ({ ...p, name: t.replace(/[^\p{L}0-9\s\-'.]/gu, '') }))} maxLength={100} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FieldLabel label="Dosage" colors={colors} />
                      <TextInput style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                        placeholder="25mg" placeholderTextColor={colors.placeholder}
                        returnKeyType="done" onSubmitEditing={Keyboard.dismiss}
                        value={medF.medData?.dosage ?? ''} onChangeText={t => medF.setMedData(p => ({ ...p, dosage: t.replace(/[^a-zA-Z0-9\s./]/g, '') }))} maxLength={50} />
                    </View>
                  </View>

                  <View>
                    <FieldLabel label="Frequency" colors={colors} />
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {FREQ_OPTS.map(f => {
                        const sel = (medF.medData?.frequency ?? 'daily') === f;
                        return (
                          <TouchableOpacity key={f}
                            style={[s.freqBtn, { borderColor: sel ? accent : colors.border, backgroundColor: sel ? accent + '12' : colors.inputBg }]}
                            onPress={() => medF.setMedData(p => ({ ...p, frequency: f }))}>
                            <Text style={[s.freqBtnText, { color: sel ? accent : colors.textSecondary }]}>{toTitle(f.replace(/_/g, ' '))}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {(['start_date', 'end_date'] as const).map(field => {
                      const label = field === 'start_date' ? 'From' : 'To (optional)';
                      const val   = medF.medData?.[field] ?? null;
                      return (
                        <View key={field} style={{ flex: 1 }}>
                          <FieldLabel label={label} colors={colors} />
                          <TouchableOpacity style={[s.dateBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, flex: 0 }]}
                            onPress={() => { Keyboard.dismiss(); const base = val ? new Date(val) : new Date(); apptF.setPickerDate(isNaN(base.getTime()) ? new Date() : base); apptF.setPickerMode(`med_${field}` as any); }}>
                            <Ionicons name="calendar-outline" size={13} color={val ? accent : colors.textTertiary} />
                            <Text style={[s.dateBtnText, { color: val ? colors.textPrimary : colors.placeholder, fontSize: TYPO.body }]}>{val ? format(parseISO(val), 'MMM d, yyyy') : 'Pick date'}</Text>
                            {val && <TouchableOpacity onPress={() => medF.setMedData(p => ({ ...p, [field]: null }))}><Ionicons name="close-circle" size={14} color={colors.textTertiary} /></TouchableOpacity>}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>

                  <AppDateTimePicker
                    visible={apptF.pickerMode === 'med_start_date' || apptF.pickerMode === 'med_end_date'}
                    value={apptF.pickerDate} mode="date"
                    minimumDate={apptF.pickerMode === 'med_end_date' && medF.medData?.start_date ? new Date(medF.medData.start_date) : undefined}
                    accent={accent}
                    onCancel={() => apptF.setPickerMode(null)}
                    onConfirm={(d) => {
                      const field = apptF.pickerMode === 'med_start_date' ? 'start_date' : 'end_date';
                      medF.setMedData(p => ({ ...p, [field]: format(d, 'yyyy-MM-dd') }));
                      apptF.setPickerMode(null);
                    }}
                  />

                  <View>
                    <FieldLabel label="Notes" colors={colors} />
                    <TextInput style={[s.input, { height: 64, paddingTop: 10, textAlignVertical: 'top', color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                      multiline placeholder="Reason, instructions…" placeholderTextColor={colors.placeholder}
                      value={medF.medData?.notes ?? ''} onChangeText={t => medF.setMedData(p => ({ ...p, notes: t }))} maxLength={500} />
                  </View>

                  <View>
                    <FieldLabel label="Status" colors={colors} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[{ val: true, label: '🟢 Active', color: colors.success, bg: colors.success + '18' },
                        { val: false, label: '⚫ Stopped', color: colors.textDisabled, bg: colors.textDisabled + '18' }].map(opt => {
                        const sel = (medF.medData?.is_active ?? true) === opt.val;
                        return (
                          <TouchableOpacity key={String(opt.val)}
                            style={{ flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: sel ? opt.color : colors.border, backgroundColor: sel ? opt.bg : colors.inputBg, alignItems: 'center' }}
                            onPress={() => medF.setMedData(p => ({ ...p, is_active: opt.val }))}>
                            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: sel ? opt.color : colors.textSecondary }}>{opt.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
                <View style={[s.modalBtns, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 }]}>
                  <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]}
                    onPress={() => { Keyboard.dismiss(); if (medF.medData?.id) { medF.setMedData(medF.medOrigRef.current); medF.setIsMedViewMode(true); } else { medF.setMedModal(false); medF.setMedData(null); } }}>
                    <Text style={[s.cancelText, { color: colors.textSecondary }]}>{medF.medData?.id ? 'Back' : 'Cancel'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent, opacity: medF.saving ? 0.6 : 1 }]} onPress={medF.saveMed} disabled={medF.saving}>
                    {medF.saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Weight sheet ── */}
      <WeightSheet visible={weightSheet} petId={activePetId} accent={accent} colors={colors} isDark={isDark}
        editEntry={weightEdit}
        onClose={() => { setWeightSheet(false); setWeightEdit(null); }}
        onSaved={() => { setWeightSheet(false); setWeightEdit(null); hd.load(); }}
      />

      {/* ── Health report sheet ── */}
      <BottomSheet visible={showReportSheet} onClose={() => setShowReportSheet(false)} title="Share Health Report">
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 16, lineHeight: 19 }}>
          Choose sections to include. The report will be exported as a PDF you can share with your vet.
        </Text>
        {(Object.entries(REPORT_SECTION_LABELS) as [ReportSection, string][]).map(([key, label]) => {
          const checked = reportSections.includes(key);
          return (
            <TouchableOpacity key={key}
              onPress={() => setReportSections(prev => checked ? prev.filter(k => k !== key) : [...prev, key])}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
              activeOpacity={0.7}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: checked ? accent : colors.border, backgroundColor: checked ? accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <Text style={{ fontSize: TYPO.body, color: colors.textPrimary, flex: 1 }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          disabled={generatingReport || reportSections.length === 0}
          onPress={async () => {
            if (!pet) return;
            setGeneratingReport(true);
            try {
              const ownerName = useAuthStore.getState().profile?.full_name ?? null;
              const locale = Intl.DateTimeFormat().resolvedOptions().locale;
              const country = locale.split('-')[1]?.toUpperCase() ?? '';
              const useLbs = ['US', 'CA'].includes(country);
              await generateAndShareReport(pet as any, ownerName, reportSections, useLbs);
            } catch (e: any) { showAlert('Error', e?.message ?? 'Could not generate report.'); }
            finally { setGeneratingReport(false); setShowReportSheet(false); }
          }}
          style={{ marginTop: 20, height: 50, borderRadius: 14, backgroundColor: reportSections.length === 0 ? colors.border : accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
          {generatingReport
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="share-outline" size={18} color="#fff" /><Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Generate & Share PDF</Text></>}
        </TouchableOpacity>
      </BottomSheet>
    </View>
  );
}
