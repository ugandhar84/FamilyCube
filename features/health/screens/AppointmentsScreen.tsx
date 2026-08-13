import { showAlert } from '@/components/AppAlert';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Keyboard, Platform, RefreshControl, Linking,
  useWindowDimensions, Modal, TouchableWithoutFeedback, KeyboardAvoidingView,
} from 'react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { SPACING, RADIUS, TYPO } from '@/constants/theme';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { getAppointments, saveAppointment, deleteAppointment, updateAppointmentStatus, rescheduleAppointment } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { format, isPast, addMonths, addYears, differenceInYears, parseISO, isValid } from 'date-fns';
import { toTitle } from '@/lib/format';
import { parseDbTime, safeFmt } from '@/lib/dates';
import { dbgSupabase } from '@/lib/debug';
import type { Appointment } from '@/lib/types';
import PawBondLoader from '@/components/PawBondLoader';
import BottomSheet from '@/components/BottomSheet';
import AppointmentDetailView from '@/components/AppointmentDetailView';
import PetHeaderChip from '@/components/PetHeaderChip';
import { formatTime } from '@/lib/units';
import CalendarFilter, { type DateFilter } from '@/components/CalendarFilter';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { useVoiceAppointment, type ParsedAppointment } from '@/lib/hooks/useVoiceAppointment';
import { useSubscriptionStore } from '@/store/subscriptionStore';


const APPT_TYPES: { value: Appointment['type']; label: string; emoji: string; providerLabel: string; locationLabel: string }[] = [
  { value: 'checkup',   label: 'Checkup',    emoji: '🩺', providerLabel: 'Vet name',      locationLabel: 'Clinic' },
  { value: 'vaccine',   label: 'Vaccine',    emoji: '💉', providerLabel: 'Vet name',      locationLabel: 'Clinic' },
  { value: 'dental',    label: 'Dental',     emoji: '🦷', providerLabel: 'Vet name',      locationLabel: 'Clinic' },
  { value: 'surgery',   label: 'Surgery',    emoji: '⚕️', providerLabel: 'Vet name',      locationLabel: 'Clinic' },
  { value: 'grooming',  label: 'Grooming',   emoji: '✂️', providerLabel: 'Groomer name',  locationLabel: 'Salon' },
  { value: 'follow_up', label: 'Follow-up',  emoji: '📋', providerLabel: 'Vet name',      locationLabel: 'Clinic' },
  { value: 'other',     label: 'Other',      emoji: '📅', providerLabel: 'Provider',      locationLabel: 'Location' },
];

export default function AppointmentsScreen() {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const { activePetId, activePet, petRoles } = usePetStore(useShallow(s => ({ activePetId: s.activePetId, activePet: s.activePet, petRoles: s.petRoles })));
  const voiceApptEnabled = useFeatureFlag('appt_voice_input_enabled', true);
  const { tier } = useSubscriptionStore();
  const pet = activePet();
  const accent = (pet as any)?.accent_color ?? colors.primary;
  const petAgeYrs = (pet as any)?.birthday ? differenceInYears(new Date(), parseISO((pet as any).birthday)) : null;
  const petAge = petAgeYrs != null ? `${petAgeYrs} yr${petAgeYrs !== 1 ? 's' : ''}` : null;
  const perms = getPermissions(activePetId ? petRoles[activePetId] : 'owner');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [isViewMode, setIsViewMode] = useState(false); // true = read-only until Edit pressed
  const [search, setSearch] = useState('');
  const [calFilter, setCalFilter] = useState<DateFilter>(null);
  const [showVoiceSheet, setShowVoiceSheet] = useState(false);
  const [voiceReview, setVoiceReview] = useState<ParsedAppointment | null>(null);

  const voice = useVoiceAppointment((parsed: ParsedAppointment) => {
    setVoiceReview(parsed);
  });

  // Form state
  const [title, setTitle] = useState('');
  const [apptType, setApptType] = useState<Appointment['type']>('checkup');
  const [vetName, setVetName] = useState('');
  const [vetPhone, setVetPhone] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [apptDate, setApptDate] = useState(''); // "YYYY-MM-DD HH:mm"
  const [notes, setNotes] = useState('');
  const [apptStatus, setApptStatus] = useState<Appointment['status']>('upcoming');
  const [recurrence, setRecurrence] = useState<'none' | 'monthly' | 'yearly'>('none');
  const [cost, setCost] = useState('');
  const [visitSummary, setVisitSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSummaryInput, setShowSummaryInput] = useState(false);
  const [summaryInputText, setSummaryInputText] = useState('');
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [pickerDate, setPickerDate] = useState(new Date());
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [reschedulePickerMode, setReschedulePickerMode] = useState<'date' | 'time' | null>(null);

  const openPicker = (mode: 'date' | 'time') => {
    Keyboard.dismiss();
    const base = apptDate ? new Date(apptDate.replace(' ', 'T')) : new Date();
    setPickerDate(isNaN(base.getTime()) ? new Date() : base);
    setPickerMode(mode);
  };

  const applyPicked = (mode: 'date' | 'time', d: Date) => {
    setApptDate(prev => mode === 'date'
      ? `${format(d, 'yyyy-MM-dd')} ${prev.slice(11, 16) || '09:00'}`
      : `${prev.slice(0, 10) || format(d, 'yyyy-MM-dd')} ${format(d, 'HH:mm')}`);
  };

  const confirmPicker = () => {
    if (pickerMode) applyPicked(pickerMode, pickerDate);
    setPickerMode(null);
  };

  const s = useMemo(() => makeStyles(colors), [colors]);

  const calDots = useMemo(() => [{
    dates: appointments.map(a => safeFmt(a.scheduled_at, 'yyyy-MM-dd')),
    color: colors.warning,
    key: 'appt',
  }], [appointments]);

  const filtered = useMemo(() => {
    let list = appointments;
    if (search.trim()) list = list.filter(a =>
      a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.vet_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.clinic_name?.toLowerCase().includes(search.toLowerCase()));
    if (calFilter?.type === 'single') list = list.filter(a => safeFmt(a.scheduled_at, 'yyyy-MM-dd') === calFilter.date);
    else if (calFilter?.type === 'range') list = list.filter(a => { const d = safeFmt(a.scheduled_at, 'yyyy-MM-dd'); return d >= calFilter.range.start && d <= calFilter.range.end; });
    return list;
  }, [appointments, search, calFilter]);

  const upcoming = useMemo(() => filtered
    .filter(a => a.status === 'upcoming' && !isPast(parseDbTime(a.scheduled_at)))
    .sort((a, b) => parseDbTime(a.scheduled_at).getTime() - parseDbTime(b.scheduled_at).getTime()),
    [filtered]);
  // Overdue = status still 'upcoming' but datetime has already passed
  const overdue = useMemo(() => filtered
    .filter(a => a.status === 'upcoming' && isPast(parseDbTime(a.scheduled_at)))
    .sort((a, b) => parseDbTime(b.scheduled_at).getTime() - parseDbTime(a.scheduled_at).getTime()),
    [filtered]);
  // Past = completed or cancelled (not overdue)
  const past = useMemo(() => filtered
    .filter(a => a.status === 'completed' || a.status === 'cancelled')
    .sort((a, b) => parseDbTime(b.scheduled_at).getTime() - parseDbTime(a.scheduled_at).getTime()),
    [filtered]);

  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    if (activePetId) {
      loadAppointments();
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [activePetId]));

  useEffect(() => {
    if (!activePetId) return;
    const ch = supabase.channel(`appts-rt-${activePetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `pet_id=eq.${activePetId}` },
        () => loadAppointments())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activePetId]);

  const loadingRef = useRef(false);
  const loadAppointments = async (isRefresh = false) => {
    if (!activePetId || loadingRef.current) return;
    loadingRef.current = true;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getAppointments(activePetId);
      setAppointments(data as any);
    } catch (e: any) {
      dbgSupabase('loadAppointments', e);
    }
    if (isRefresh) setRefreshing(false); else setLoading(false);
    loadingRef.current = false;
  };

  const resetForm = () => {
    setTitle(''); setApptType('checkup'); setVetName(''); setVetPhone('');
    setClinicName(''); setClinicAddress(''); setApptDate(''); setNotes('');
    setApptStatus('upcoming'); setRecurrence('none');
    setCost(''); setVisitSummary('');
  };

  const confirmVoiceReview = useCallback(async () => {
    if (!voiceReview || !activePetId) return;

    // Parse scheduled_at to ISO if it's in "YYYY-MM-DD HH:mm" format
    let scheduledAtISO = voiceReview.scheduled_at ?? '';
    if (scheduledAtISO && !scheduledAtISO.includes('T')) {
      const parsed = new Date(scheduledAtISO.replace(' ', 'T'));
      if (!isNaN(parsed.getTime())) {
        scheduledAtISO = parsed.toISOString();
      }
    }

    const payload = {
      title: voiceReview.title ?? 'Appointment',
      type: (voiceReview.type ?? 'checkup') as Appointment['type'],
      scheduled_at: scheduledAtISO || new Date().toISOString(),
      vet_name: voiceReview.vet_name ?? null,
      clinic_name: voiceReview.clinic_name ?? null,
      clinic_address: voiceReview.clinic_address ?? null,
      notes: voiceReview.notes ?? null,
      status: 'upcoming' as const,
      duration_minutes: 30,
      remind_before_minutes: null,
    };

    setSaving(true);
    try {
      await saveAppointment(activePetId, payload as any);
      showAlert('✅ Saved!', `${voiceReview.title ?? 'Appointment'} added successfully.`);
      setVoiceReview(null);
      setShowVoiceSheet(false);
      setSaving(false);
      loadAppointments(); // Refresh appointment list
    } catch (e: any) {
      setSaving(false);
      showAlert('Error', e.message ?? 'Could not save appointment.');
    }
  }, [voiceReview, activePetId]);

  const openNew = useCallback(() => {
    const canVoice = voiceApptEnabled && (tier === 'pro' || tier === 'ultimate');
    if (canVoice) {
      setEditingAppt(null);
      resetForm();
      setVoiceReview(null);
      setShowVoiceSheet(true);
    } else {
      setEditingAppt(null);
      resetForm();
      setIsViewMode(false);
      setShowModal(true);
    }
  }, [voiceApptEnabled, tier]);

  const openEdit = (appt: Appointment) => {
    setEditingAppt(appt);
    setTitle(appt.title);
    setApptType(appt.type as Appointment['type'] ?? 'checkup');
    setVetName(appt.vet_name ?? '');
    setClinicName(appt.clinic_name ?? '');
    const _dt = parseDbTime(appt.scheduled_at);
    setApptDate(isNaN(_dt.getTime()) ? appt.scheduled_at.slice(0, 16).replace('T', ' ') : `${format(_dt, 'yyyy-MM-dd')} ${format(_dt, 'HH:mm')}`); // local YYYY-MM-DD HH:mm
    setNotes(appt.notes ?? '');
    setApptStatus((appt.status ?? 'upcoming') as Appointment['status']);
    setVetPhone(appt.vet_phone ?? '');
    setClinicAddress(appt.clinic_address ?? '');
    setRecurrence((appt.recurrence as any) ?? 'none');
    setCost(appt.cost != null ? String(appt.cost) : '');
    setVisitSummary(appt.visit_summary ?? '');
    setIsViewMode(true);
    // Delay modal open by one tick so isViewMode=true is committed before the
    // native Modal slide animation starts — otherwise RN shows the pre-batch render
    setTimeout(() => setShowModal(true), 0);
  };

  const handleSave = async () => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('save appointments')); return; }
    const trimTitle = title.trim();
    if (!trimTitle || !apptDate.trim()) {
      showAlert('Required', 'Please enter a title and date.');
      return;
    }
    if (trimTitle.length < 2) {
      showAlert('Title too short', 'Appointment title must be at least 2 characters.');
      return;
    }
    if (!activePetId) return;

    // Parse "YYYY-MM-DD HH:mm" or ISO input — validate BEFORE calling toISOString()
    // (toISOString throws RangeError on an Invalid Date)
    const parsed = new Date(apptDate.trim().replace(' ', 'T'));
    if (isNaN(parsed.getTime())) {
      showAlert('Invalid date', 'Use format: 2026-07-15 10:30');
      return;
    }
    const isoDate = parsed.toISOString();

    setSaving(true);
    const payload = {
      title: title.trim(),
      type: apptType,
      scheduled_at: isoDate,
      vet_name: vetName.trim() || null,
      vet_phone: vetPhone.trim() || null,
      clinic_name: clinicName.trim() || null,
      clinic_address: clinicAddress.trim() || null,
      notes: notes.trim() || null,
      visit_summary: visitSummary.trim() || null,
      status: apptStatus,
      duration_minutes: 30,
      remind_before_minutes: null,
      recurrence: recurrence === 'none' ? null : recurrence,
      cost: cost.trim() ? parseFloat(cost) : null,
    };

    // Optimistic: close modal instantly, update list, rollback on error
    const tempId = editingAppt?.id ?? `opt-${Date.now()}`;
    const optimistic = { pet_id: activePetId, ...payload, id: tempId } as unknown as Appointment;
    const snapshot = appointments; // capture for rollback
    setAppointments(prev =>
      (editingAppt
        ? prev.map(a => a.id === editingAppt.id ? { ...a, ...payload } : a)
        : [optimistic, ...prev]
      ) as Appointment[]
    );
    setSaving(false);
    setShowModal(false);

    try {
      await saveAppointment(activePetId, payload as any, editingAppt?.id);
      loadAppointments();
    } catch (err: any) {
      setAppointments(snapshot);
      showAlert('Error', err.message);
    }
  };

  const handleDelete = (appt: Appointment) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('delete appointments')); return; }
    showAlert('Delete appointment?', appt.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setAppointments(prev => prev.filter(a => a.id !== appt.id));
          setShowModal(false);
          try {
            await deleteAppointment(appt.id);
          } catch {
            showAlert('Error', 'Could not delete appointment.');
            loadAppointments();
          }
        },
      },
    ]);
  };

  const completeAppt = async (appt: Appointment, summary: string) => {
    setShowModal(false);
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'completed', visit_summary: summary || a.visit_summary } : a));
    try {
      await updateAppointmentStatus(appt.id, 'completed', summary ? { visit_summary: summary } : undefined);
      // Recurrence: auto-create next appointment
      if (appt.recurrence === 'monthly' || appt.recurrence === 'yearly') {
        const base = parseDbTime(appt.scheduled_at);
        const next = appt.recurrence === 'monthly' ? addMonths(base, 1) : addYears(base, 1);
        if (activePetId) {
          await saveAppointment(activePetId, {
            title: appt.title,
            type: appt.type,
            scheduled_at: next.toISOString(),
            vet_name: appt.vet_name,
            vet_phone: appt.vet_phone,
            clinic_name: appt.clinic_name,
            clinic_address: appt.clinic_address,
            notes: appt.notes,
            visit_summary: null,
            status: 'upcoming',
            duration_minutes: 30,
            remind_before_minutes: null,
            recurrence: appt.recurrence,
            cost: null,
          } as any);
          loadAppointments();
        }
      }
    } catch { loadAppointments(); }
  };

  const toggleComplete = async (appt: Appointment) => {
    const newStatus = appt.status === 'completed' ? 'upcoming' : 'completed';
    // Optimistic
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: newStatus } : a));
    try {
      await updateAppointmentStatus(appt.id, newStatus);
    } catch (err: any) {
      dbgSupabase('toggleComplete', err);
      setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: appt.status } : a));
    }
  };

  const renderAppt = (appt: Appointment, isOverdue = false) => {
    const done = appt.status === 'completed';
    return (
      <TouchableOpacity key={appt.id} style={[s.card, isOverdue && { borderLeftWidth: 3, borderLeftColor: colors.danger }]} onPress={() => openEdit(appt)} onLongPress={() => handleDelete(appt)}>
        <TouchableOpacity
          style={[s.checkCircle, done && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => toggleComplete(appt)}
        >
          {done && <Text style={{ color: '#fff', fontSize: TYPO.body }}>✓</Text>}
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: TYPO.body }}>{APPT_TYPES.find(t => t.value === appt.type)?.emoji ?? '📅'}</Text>
            <Text style={[s.apptTitle, done && s.completedText]}>{appt.title}</Text>
            {isOverdue && (
              <View style={{ backgroundColor: colors.dangerLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.danger }}>OVERDUE</Text>
              </View>
            )}
          </View>
          <Text style={s.apptDate}>
            {`${safeFmt(appt.scheduled_at, 'EEE, MMM d, yyyy')} · ${formatTime(parseDbTime(appt.scheduled_at))}`}
          </Text>
          {(appt.vet_name || appt.clinic_name) && (
            <Text style={s.apptVet}>{[appt.vet_name, appt.clinic_name].filter(Boolean).join(' · ')}</Text>
          )}
          {appt.notes ? <Text style={s.apptNotes} numberOfLines={2}>{appt.notes}</Text> : null}
        </View>
        <Text style={s.editHint}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View>
            <Text style={s.title}>Appointments</Text>
            {pet && <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: accent, marginTop: 1 }} numberOfLines={1}>{(pet as any).emoji ?? '🐾'}  {pet.name}{petAge ? `  ·  ${petAge}` : ''}</Text>}
          </View>
          {pet && <PetHeaderChip pet={pet as any} variant="badge" />}
        </View>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inputBg ?? '#F1F1F1', borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 40 }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>🔍</Text>
          <TextInput
            style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary }}
            placeholder="Search appointments…" placeholderTextColor={colors.placeholder ?? '#aaa'}
            value={search} onChangeText={setSearch}
            returnKeyType="search" clearButtonMode="while-editing" />
        </View>
      </View>

      <CalendarFilter dots={calDots} filter={calFilter} onFilter={setCalFilter} />

      {loading ? (
        <View style={s.loadingWrap}><PawBondLoader size={56} /></View>
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ paddingBottom: insets.bottom + 96 }} onScroll={e => setShowScrollTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAppointments(true)} tintColor={accent} colors={[accent]} />}>
          {upcoming.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Upcoming ({upcoming.length})</Text>
              {upcoming.map(a => renderAppt(a, false))}
            </>
          )}
          {overdue.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: colors.danger }]}>Overdue ({overdue.length})</Text>
              {overdue.map(a => renderAppt(a, true))}
            </>
          )}
          {past.length > 0 && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, marginTop: SPACING.md, marginBottom: SPACING.sm }}>
                <Text style={[s.sectionLabel, { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 }]}>Past</Text>
                {(() => { const total = past.reduce((sum, a) => sum + (a.cost ?? 0), 0); return total > 0 ? <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>${total.toFixed(2)} total</Text> : null; })()}
              </View>
              {past.map(a => renderAppt(a, false))}
            </>
          )}
          {upcoming.length === 0 && overdue.length === 0 && past.length === 0 && (
            <View style={s.emptyWrap}>
              <Text style={s.emptyEmoji}>📅</Text>
              <Text style={s.emptyTitle}>{search.trim() ? `No results for "${search}"` : 'No appointments yet'}</Text>
              <Text style={s.emptySub}>{search.trim() ? 'Try a different search term.' : 'Tap + Add to schedule a vet visit or grooming session.'}</Text>
              {!search.trim() && perms.canLogHealth && (
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: colors.primary }]} onPress={openNew}>
                  <Text style={s.emptyBtnText}>Schedule first appointment</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          VOICE INPUT SHEET
      ════════════════════════════════════════════════════════════════════ */}
      <BottomSheet visible={showVoiceSheet} onClose={() => { voice.cancel(); setVoiceReview(null); setShowVoiceSheet(false); }}>
        <View style={{ paddingTop: 4, paddingBottom: 8 }}>

          {/* ── REVIEW STATE — AI parsed, user confirms ── */}
          {voiceReview ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: '#22C55E18', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.heading }}>✅</Text>
                </View>
                <View>
                  <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary }}>Review appointment</Text>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>AI filled these details from your voice</Text>
                </View>
              </View>

              {(() => {
                if (!voiceReview.scheduled_at) return null;
                try {
                  const apptDate = parseDbTime(voiceReview.scheduled_at);
                  if (isValid(apptDate) && isPast(apptDate)) {
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: '#FEF9C3', borderRadius: 12, padding: 10, marginBottom: 12,
                        borderWidth: 1, borderColor: '#FDE047' }}>
                        <Ionicons name="warning-outline" size={16} color="#CA8A04" />
                        <Text style={{ flex: 1, fontSize: TYPO.caption, color: '#92400E', fontWeight: '600' }}>
                          This date is in the past — please update it in the form.
                        </Text>
                      </View>
                    );
                  }
                } catch {}
                return null;
              })()}

              <View style={{ backgroundColor: colors.inputBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 16 }}>
                {[
                  { icon: 'clipboard-outline' as const,  label: 'Title',    value: voiceReview.title ?? '—' },
                  { icon: 'medical-outline' as const,    label: 'Type',     value: voiceReview.type ? voiceReview.type.charAt(0).toUpperCase() + voiceReview.type.slice(1) : '—' },
                  { icon: 'calendar-outline' as const,   label: 'Date & time', value: (() => {
                    if (!voiceReview.scheduled_at) return '—';
                    try {
                      const d = parseDbTime(voiceReview.scheduled_at);
                      return isValid(d) ? `${format(d, 'EEE, MMM d, yyyy')} · ${formatTime(d)}` : voiceReview.scheduled_at;
                    } catch { return voiceReview.scheduled_at; }
                  })() },
                  { icon: 'person-outline' as const,     label: 'Vet',      value: voiceReview.vet_name ?? null },
                  { icon: 'business-outline' as const,   label: 'Clinic',   value: voiceReview.clinic_name ?? null },
                  { icon: 'location-outline' as const,   label: 'Address',  value: voiceReview.clinic_address ?? null },
                  { icon: 'document-text-outline' as const, label: 'Notes', value: voiceReview.notes ?? null },
                ].filter(row => !!row.value || ['Title', 'Date & time'].includes(row.label)).map((row, i, arr) => (
                  <View key={row.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                    paddingHorizontal: 14, paddingVertical: 12,
                    borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <Ionicons name={row.icon} size={15} color={accent} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{row.label}</Text>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: row.value ? colors.textPrimary : colors.placeholder, marginTop: 1 }}>{row.value ?? '—'}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity onPress={confirmVoiceReview} disabled={saving}
                style={{ height: 50, borderRadius: 14, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                  shadowColor: accent, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4, opacity: saving ? 0.6 : 1 }}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Looks good — save appointment</Text>
                )}
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => { setVoiceReview(null); voice.cancel(); }}
                  style={{ flex: 1, height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>🎙️ Re-record</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setVoiceReview(null); setShowVoiceSheet(false); setEditingAppt(null); setIsViewMode(false); setShowModal(true); }}
                  style={{ flex: 1, height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>✏️ Edit directly</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
          <>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 }}>Add Appointment</Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 20 }}>How would you like to enter the details?</Text>

            {/* Mic option — idle or error */}
            {(voice.state === 'idle' || voice.state === 'error') ? (
              <TouchableOpacity onPress={() => voice.start()}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: accent + '14', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 10,
                  borderWidth: 1.5, borderColor: accent + '40' }}>
                <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mic" size={22} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>Speak it 🎙️</Text>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>Say the details — AI fills the form for you</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}

            {/* Listening */}
            {voice.state === 'listening' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: '#EF444414', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 10,
                borderWidth: 1.5, borderColor: '#EF4444' }}>
                <ActivityIndicator color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#EF4444' }}>Listening… speak now</Text>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>"Checkup on Aug 10 at 2pm, City Vet"</Text>
                </View>
                <TouchableOpacity onPress={voice.stop}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#EF444430', borderRadius: 10 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Processing */}
            {voice.state === 'processing' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: colors.inputBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 10,
                borderWidth: 1.5, borderColor: colors.border }}>
                <ActivityIndicator color={accent} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Analysing with AI…</Text>
              </View>
            ) : null}

            {/* Error */}
            {voice.state === 'error' && voice.error ? (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#FECACA' }}>
                <Text style={{ fontSize: TYPO.caption, color: '#DC2626' }}>{voice.error}</Text>
              </View>
            ) : null}

            {/* Type manually */}
            <TouchableOpacity
              onPress={() => { setShowVoiceSheet(false); setEditingAppt(null); setIsViewMode(false); setShowModal(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: colors.inputBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16,
                borderWidth: 1.5, borderColor: colors.border }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="create-outline" size={22} color={colors.textSecondary} />
              </View>
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

      <BottomSheet
        visible={showModal}
        onClose={() => { voice.reset(); setShowModal(false); setIsViewMode(true); setRescheduling(false); setRescheduleDate(''); setShowSummaryInput(false); setSummaryInputText(''); }}
        title={isViewMode ? 'Appointment details' : editingAppt ? 'Edit appointment' : 'New appointment'}
        titleIcon={<Ionicons name="calendar-outline" size={16} color={accent} />}
        accent={accent}>

        {/* ── Read-only view ── */}
        {isViewMode && editingAppt ? (
          <AppointmentDetailView
            key={editingAppt.id}
            appt={{
              id: editingAppt.id,
              title,
              appointment_type: apptType,
              scheduled_at: apptDate || editingAppt.scheduled_at,
              vet_name: vetName,
              vet_phone: vetPhone,
              clinic_name: clinicName,
              clinic_address: clinicAddress,
              cost,
              recurrence,
              notes,
              visit_summary: visitSummary,
              status: editingAppt.status,
            }}
            accent={accent}
            canEdit={perms.canLogHealth}
            onClose={() => setShowModal(false)}
            onEdit={() => setIsViewMode(false)}
            onDelete={() => handleDelete(editingAppt)}
            onReschedule={async (newIso) => {
              setShowModal(false);
              setAppointments(prev => prev.map(a => a.id === editingAppt.id ? { ...a, scheduled_at: newIso, status: 'upcoming' } : a));
              try { await rescheduleAppointment(editingAppt.id, newIso); } catch { loadAppointments(); }
            }}
            onComplete={(summary) => completeAppt(editingAppt, summary)}
            onCancel={async () => {
              setShowModal(false);
              setAppointments(prev => prev.map(a => a.id === editingAppt.id ? { ...a, status: 'cancelled' } : a));
              try { await updateAppointmentStatus(editingAppt.id, 'cancelled'); } catch { loadAppointments(); }
            }}
          />
        ) : (
          /* ── Edit / New form ── */
          <>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}>
              <Text style={s.label}>Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                {APPT_TYPES.map(t => {
                  const selected = apptType === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      onPress={() => setApptType(t.value)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                        borderWidth: 1.5,
                        backgroundColor: selected ? accent + '22' : 'transparent',
                        borderColor: selected ? accent : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: TYPO.body }}>{t.emoji}</Text>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: selected ? accent : colors.textSecondary }}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>Title *</Text>
              <TextInput style={s.input} placeholder="Annual checkup, Vaccination…" placeholderTextColor={colors.placeholder} value={title} onChangeText={t => setTitle(t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, ''))} returnKeyType="next" maxLength={100} />

              <Text style={s.label}>Date & time *</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.input, s.dateBtn, { flex: 1 }]} onPress={() => openPicker('date')}>
                  <Ionicons name="calendar-outline" size={14} color={colors.primaryText ?? colors.primary} />
                  <Text style={[s.dateBtnText, { color: apptDate ? colors.textPrimary : colors.placeholder }]}>
                    {apptDate ? safeFmt(apptDate, 'MMM d, yyyy') : 'Select date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.input, s.dateBtn, { flex: 0.7 }]} onPress={() => openPicker('time')}>
                  <Ionicons name="time-outline" size={14} color={colors.primaryText ?? colors.primary} />
                  <Text style={[s.dateBtnText, { color: apptDate ? colors.textPrimary : colors.placeholder }]}>
                    {apptDate ? formatTime(new Date(apptDate.replace(' ', 'T'))) : 'Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              <AppDateTimePicker
                visible={pickerMode !== null}
                value={pickerDate}
                mode={pickerMode === 'time' ? 'time' : 'date'}
                accent={accent}
                onCancel={() => setPickerMode(null)}
                onConfirm={(d) => {
                  setPickerDate(d);
                  if (pickerMode) applyPicked(pickerMode, d);
                  setPickerMode(null);
                }}
              />

              {(() => {
                const tc = APPT_TYPES.find(t => t.value === apptType) ?? APPT_TYPES[0];
                return (
                  <>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>{tc.providerLabel}</Text>
                        <TextInput style={s.input} placeholder={apptType === 'grooming' ? 'Paws & Claws' : 'Dr. Smith'} placeholderTextColor={colors.placeholder} value={vetName} onChangeText={t => setVetName(t.replace(/[^a-zA-Z\s\-'.]/g, ''))} returnKeyType="next" maxLength={80} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>Phone</Text>
                        <TextInput style={s.input} placeholder="555-123-4567" placeholderTextColor={colors.placeholder} value={vetPhone} onChangeText={setVetPhone} keyboardType="phone-pad" returnKeyType="next" maxLength={20} />
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>{tc.locationLabel}</Text>
                        <TextInput style={s.input} placeholder={apptType === 'grooming' ? 'Happy Paws Salon' : 'City Vet'} placeholderTextColor={colors.placeholder} value={clinicName} onChangeText={t => setClinicName(t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, ''))} returnKeyType="next" maxLength={100} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>Address</Text>
                        <TextInput style={s.input} placeholder="123 Main St" placeholderTextColor={colors.placeholder} value={clinicAddress} onChangeText={setClinicAddress} returnKeyType="next" maxLength={150} />
                      </View>
                    </View>
                  </>
                );
              })()}

              {/* Cost */}
              <Text style={s.label}>Cost ($)</Text>
              <TextInput style={s.input} placeholder="0.00" placeholderTextColor={colors.placeholder} value={cost} onChangeText={setCost} keyboardType="decimal-pad" returnKeyType="next" maxLength={10} />

              {/* Recurrence */}
              <Text style={s.label}>Repeat</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                {(['none', 'monthly', 'yearly'] as const).map(r => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setRecurrence(r)}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', borderColor: recurrence === r ? accent : colors.border, backgroundColor: recurrence === r ? accent + '22' : 'transparent' }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: recurrence === r ? accent : colors.textSecondary, textTransform: 'capitalize' }}>{r === 'none' ? 'Once' : r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Notes</Text>
              <TextInput style={[s.input, s.textarea]} placeholder="Bring vaccination records, fasting required…" placeholderTextColor={colors.placeholder} value={notes} onChangeText={setNotes} multiline textAlignVertical="top" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} maxLength={500} />

              {/* Visit summary (editing existing completed appt) */}
              {editingAppt?.status === 'completed' && (
                <>
                  <Text style={s.label}>Visit summary</Text>
                  <TextInput style={[s.input, s.textarea]} placeholder="Diagnosis, treatment, follow-up instructions…" placeholderTextColor={colors.placeholder} value={visitSummary} onChangeText={setVisitSummary} multiline textAlignVertical="top" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} maxLength={1000} />
                </>
              )}

              {editingAppt && (
                <>
                  <Text style={s.label}>Status</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {([
                      { value: 'completed', label: 'Completed', bg: colors.successLight, border: colors.success, text: colors.success },
                      { value: 'cancelled', label: 'Cancelled', bg: colors.dangerLight,  border: colors.danger,  text: colors.danger  },
                      { value: 'upcoming',  label: 'Upcoming',  bg: accent + '18',       border: accent,         text: accent         },
                    ] as const).map(opt => {
                      const selected = apptStatus === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => setApptStatus(opt.value)}
                          style={[s.statusBtn, {
                            flex: 1,
                            backgroundColor: selected ? opt.bg : 'transparent',
                            borderColor: selected ? opt.border : colors.border,
                          }]}>
                          <Text style={[s.statusBtnText, { color: selected ? opt.text : colors.textSecondary }]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={s.footer}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => editingAppt ? setIsViewMode(true) : setShowModal(false)}>
                <Text style={s.cancelText}>{editingAppt ? 'Back' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </BottomSheet>

      {/* FAB */}
      {perms.canLogHealth && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: accent, bottom: insets.bottom + 16 }]}
          onPress={() => showScrollTop ? scrollRef.current?.scrollTo({ y: 0, animated: true }) : openNew()}
          activeOpacity={0.85}>
          {showScrollTop
            ? <Ionicons name="chevron-up" size={26} color="#fff" />
            : <Ionicons name="add" size={28} color="#fff" />}
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  title: { fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary },
  addBtn: { paddingHorizontal: SPACING.md, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: RADIUS.md },
  addBtnText: { fontSize: TYPO.body, fontWeight: '600', color: '#fff' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm, marginTop: SPACING.md },
  card: { marginHorizontal: SPACING.xl, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: SPACING.sm, borderWidth: 0.5, borderColor: colors.border },
  checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  apptTitle: { fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary },
  completedText: { textDecorationLine: 'line-through', color: colors.textSecondary },
  apptDate: { fontSize: TYPO.body, color: colors.primaryText ?? colors.primary, fontWeight: '500' },
  apptVet: { fontSize: TYPO.body, color: colors.textSecondary },
  apptNotes: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 },
  editHint: { fontSize: TYPO.heading, color: colors.textSecondary, marginTop: 2 },
  emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: SPACING.xl, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { marginTop: 8, paddingHorizontal: SPACING.xl, paddingVertical: 14, borderRadius: RADIUS.lg },
  emptyBtnText: { color: '#fff', fontSize: TYPO.body, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, maxHeight: '92%' },
  sheetTitle: { fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary },
  label: { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, height: 44, fontSize: TYPO.body, color: colors.textPrimary, backgroundColor: colors.background },
  textarea: { height: 76, paddingTop: 11 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtnText: { fontSize: TYPO.body, flex: 1 },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cancelBtn: { flex: 1, height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 2, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  saveBtnText: { color: '#fff', fontSize: TYPO.body, fontWeight: '700' },
  viewRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  viewLabel: { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  viewValue: { fontSize: TYPO.body, color: colors.textPrimary, fontWeight: '500' },
  statusBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  statusBtnText: { fontSize: TYPO.body, fontWeight: '600' },
  contactBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
});
