import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Platform, Keyboard,
} from 'react-native';
import { useFocusEffect , router } from 'expo-router';
import { useMedications, useSaveMedication, useToggleMedActive, useDeleteMedication } from '@/lib/hooks/useMedications';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { useTheme } from '@/lib/ThemeContext';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { format, parseISO, differenceInYears } from 'date-fns';
import { toTitle } from '@/lib/format';
import PawBondLoader from '@/components/PawBondLoader';
import BottomSheet from '@/components/BottomSheet';
import PetHeaderChip from '@/components/PetHeaderChip';
import CalendarFilter, { type DateFilter } from '@/components/CalendarFilter';
import { setMedicationNotifId } from '@/lib/db/medications';
import { usePreferenceStore } from '@/store/preferenceStore';
import { TYPO } from '@/constants/theme';

let ExpoNotifications: typeof import('expo-notifications') | null = null;
try { ExpoNotifications = require('expo-notifications'); } catch {}

async function cancelMedNotif(notifId: string | null | undefined) {
  if (!notifId || !ExpoNotifications) return;
  try { await ExpoNotifications.cancelScheduledNotificationAsync(notifId); } catch {}
}

async function scheduleMedNotif(med: {
  id: string; name: string; dosage: string | null; frequency: string;
  remind_time: string | null; notif_id: string | null; start_date?: string | null;
}, petName: string): Promise<void> {
  if (!ExpoNotifications || !med.remind_time || med.frequency === 'as_needed') return;
  const prefs = usePreferenceStore.getState();
  if (!prefs.notifHealth) return;

  // Cancel any previous notification for this medication
  await cancelMedNotif(med.notif_id);

  const [h, m] = med.remind_time.split(':').map(Number);
  const title = `💊 Time for ${med.name}`;
  const body  = med.dosage ? `${med.dosage} · ${petName}` : petName;

  // Derive weekday (1=Sun…7=Sat) and day-of-month from start_date when available
  const refDate = med.start_date ? new Date(med.start_date) : new Date();
  const weekday = refDate.getDay() + 1; // JS 0=Sun → Expo 1=Sun
  const dayOfMonth = refDate.getDate();

  let trigger: any;
  if (med.frequency === 'daily') {
    trigger = { hour: h, minute: m, repeats: true };
  } else if (med.frequency === 'weekly') {
    trigger = { weekday, hour: h, minute: m, repeats: true };
  } else if (med.frequency === 'monthly') {
    trigger = { day: dayOfMonth, hour: h, minute: m, repeats: true };
  } else {
    return; // as_needed — no reminder
  }

  try {
    const notifId = await ExpoNotifications.scheduleNotificationAsync({
      content: { title, body, data: { type: 'medication_reminder', med_id: med.id }, sound: true },
      trigger,
    });
    await setMedicationNotifId(med.id, notifId);
  } catch (e) {
    console.warn('[med-notif] schedule failed:', e);
  }
}

interface Med {
  id: string;
  pet_id: string;
  name: string;
  dosage: string | null;
  frequency: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  source: string | null;
  remind_time: string | null;
  notif_id: string | null;
  created_at: string;
}

const FREQ_OPTS = ['daily', 'weekly', 'monthly', 'as_needed'] as const;
type Freq = typeof FREQ_OPTS[number];
type PickerField = 'start_date' | 'end_date' | null;

const EMPTY_MED = {
  name: '', dosage: '', frequency: 'daily' as Freq,
  start_date: null as string | null, end_date: null as string | null,
  is_active: true, notes: '',
  remind_time: '08:00' as string | null,
};

export default function MedicationsPage() {
  const { colors, isDark } = useTheme();
  const accent = colors.primary;
  const dynSS = useMemo(() => ({
    viewRow:   { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    viewLabel: { fontSize: TYPO.body, fontWeight: '600' as const, color: colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
    viewValue: { fontSize: TYPO.body, fontWeight: '500' as const, color: colors.textPrimary },
  }), [colors]);
  const { activePetId, pets, petRoles } = usePetStore(useShallow(s => ({ activePetId: s.activePetId, pets: s.pets, petRoles: s.petRoles })));
  const pet = pets.find(p => p.id === activePetId);
  const ac  = (pet as any)?.accent_color ?? accent;
  const petAgeYrs = (pet as any)?.birthday ? differenceInYears(new Date(), parseISO((pet as any).birthday)) : null;
  const petAge = petAgeYrs != null ? `${petAgeYrs} yr${petAgeYrs !== 1 ? 's' : ''}` : null;
  const perms = getPermissions(activePetId ? petRoles[activePetId] : 'owner');

  const scrollRef = useRef<ScrollView>(null);
  const [filter,  setFilter]  = useState<'active' | 'all'>('active');
  const [search,  setSearch]  = useState('');
  const [calFilter, setCalFilter] = useState<DateFilter>(null);

  // Modal state
  const [modal,   setModal]   = useState(false);
  const [form,    setForm]    = useState<typeof EMPTY_MED & { id?: string }>(EMPTY_MED);
  const [isViewMode, setIsViewMode] = useState(false);

  // Date / time pickers
  const [pickerField,    setPickerField]    = useState<PickerField>(null);
  const [pickerDate,     setPickerDate]     = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerDate, setTimePickerDate] = useState(() => {
    const d = new Date(); d.setHours(8, 0, 0, 0); return d;
  });

  // ── TanStack Query hooks ──────────────────────────────────────────────────
  const qc = useQueryClient();
  const { data: meds = [], isLoading: loading, refetch } = useMedications(activePetId ?? null);
  const saveMed   = useSaveMedication(activePetId ?? '');
  const toggleMed = useToggleMedActive(activePetId ?? '');
  const delMed    = useDeleteMedication(activePetId ?? '');

  // Refetch on focus (cache handles deduplication — no extra DB call if fresh)
  useFocusEffect(useCallback(() => {
    refetch();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [refetch]));

  useEffect(() => {
    if (!activePetId) return;
    const ch = supabase.channel(`meds-rt-${activePetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medications', filter: `pet_id=eq.${activePetId}` },
        () => qc.invalidateQueries({ queryKey: ['medications', activePetId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activePetId]);

  // Self-heal: reschedule any active med that has a remind_time but lost its notif_id
  useEffect(() => {
    if (!meds.length) return;
    meds.forEach(m => {
      if (m.is_active && m.remind_time && !m.notif_id) {
        scheduleMedNotif(m, pet?.name ?? 'your pet').catch(() => {});
      }
    });
  }, [meds, pet]);

  const openAdd = () => {
    setForm({ ...EMPTY_MED });
    setIsViewMode(false);
    setModal(true);
  };

  const openEdit = (m: Med) => {
    const rt = m.remind_time ?? '08:00';
    const [rh, rm] = rt.split(':').map(Number);
    const tDate = new Date(); tDate.setHours(rh, rm, 0, 0);
    setTimePickerDate(tDate);
    setForm({
      id: m.id,
      name: m.name,
      dosage: m.dosage ?? '',
      frequency: (FREQ_OPTS.includes(m.frequency as Freq) ? m.frequency : 'daily') as Freq,
      start_date: m.start_date,
      end_date: m.end_date,
      is_active: m.is_active,
      notes: m.notes ?? '',
      remind_time: rt,
    });
    setIsViewMode(true);
    setTimeout(() => setModal(true), 0);
  };

  const save = async () => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('save medications')); return; }
    if (!form.name.trim() || !activePetId) { showAlert('Name required', 'Please enter the medication name.'); return; }
    if (form.start_date && form.end_date && new Date(form.end_date) < new Date(form.start_date)) {
      showAlert('Invalid dates', 'End date must be on or after the start date.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      dosage: form.dosage?.trim() || null,
      frequency: form.frequency,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: form.is_active,
      notes: form.notes?.trim() || null,
      source: null,
      remind_time: form.remind_time || null,
      notif_id: null as string | null,
    };
    try {
      const savedId = await saveMed.mutateAsync({ payload, id: form.id });
      const resolvedId = savedId ?? form.id ?? '';
      setModal(false);
      // Schedule local reminder if med is active and has a remind_time
      if (form.is_active && form.remind_time && form.frequency !== 'as_needed') {
        const existing = form.id ? meds.find(m => m.id === form.id) : null;
        await scheduleMedNotif(
          { id: resolvedId, name: form.name.trim(), dosage: form.dosage?.trim() || null,
            frequency: form.frequency, remind_time: form.remind_time,
            notif_id: existing?.notif_id ?? null },
          pet?.name ?? 'your pet',
        );
      } else if (resolvedId) {
        const existing = meds.find(m => m.id === resolvedId);
        await cancelMedNotif(existing?.notif_id);
        await setMedicationNotifId(resolvedId, null);
      }
    } catch (e: any) { showAlert('Error', e.message); }
  };

  const deleteMed = (m: Med) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('delete medications')); return; }
    showAlert('Delete medication?', `Remove "${m.name}" from the record?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await cancelMedNotif(m.notif_id);
          await delMed.mutateAsync(m.id);
        } catch { showAlert('Error', 'Could not delete medication. Please try again.'); }
      }},
    ]);
  };

  const toggleActive = async (m: Med) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('change medication status')); return; }
    try {
      await toggleMed.mutateAsync({ id: m.id, isActive: !m.is_active });
      if (m.is_active) {
        await cancelMedNotif(m.notif_id);
        await setMedicationNotifId(m.id, null);
      } else {
        await scheduleMedNotif(
          { id: m.id, name: m.name, dosage: m.dosage, frequency: m.frequency,
            remind_time: m.remind_time, notif_id: m.notif_id },
          pet?.name ?? 'your pet',
        );
      }
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Could not update medication status');
    }
  };

  const calDots = useMemo(() => [{
    dates: meds.filter(m => m.start_date).map(m => m.start_date!.slice(0, 10)),
    color: colors.primaryText ?? colors.primary,
    key: 'med',
  }], [meds]);

  const displayed = useMemo(() => meds
    .filter(m => filter === 'active' ? m.is_active : true)
    .filter(m => !search.trim() || m.name.toLowerCase().includes(search.toLowerCase()) || (m.dosage ?? '').toLowerCase().includes(search.toLowerCase()) || (m.notes ?? '').toLowerCase().includes(search.toLowerCase()))
    .filter(m => {
      if (!calFilter) return true;
      const d = m.start_date?.slice(0, 10) ?? '';
      if (calFilter.type === 'single') return d === calFilter.date;
      return d >= calFilter.range.start && d <= calFilter.range.end;
    })
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }), [meds, filter, search, calFilter]);

  const confirmPicker = () => {
    if (!pickerField) return;
    setForm(p => ({ ...p, [pickerField]: format(pickerDate, 'yyyy-MM-dd') }));
    setPickerField(null);
  };

  const confirmTimePicker = () => {
    const h = String(timePickerDate.getHours()).padStart(2, '0');
    const m = String(timePickerDate.getMinutes()).padStart(2, '0');
    setForm(p => ({ ...p, remind_time: `${h}:${m}` }));
    setShowTimePicker(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={[ss.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[ss.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View>
            <Text style={[ss.title, { color: colors.textPrimary }]}>Medications</Text>
            {pet && <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: ac, marginTop: 1 }} numberOfLines={1}>{(pet as any).emoji ?? '🐾'}  {pet.name}{petAge ? `  ·  ${petAge}` : ''}</Text>}
          </View>
          {pet && <PetHeaderChip pet={pet as any} variant="badge" />}
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[ss.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(['active', 'all'] as const).map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}
            style={[ss.tab, filter === f && { borderBottomColor: ac, borderBottomWidth: 2 }]}>
            <Text style={[ss.tabTxt, { color: filter === f ? ac : colors.textTertiary }]}>
              {f === 'active' ? `Active (${meds.filter(m => m.is_active).length})` : `All (${meds.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 40 }}>
          <Ionicons name="search-outline" size={15} color={colors.textTertiary} />
          <TextInput
            style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary }}
            placeholder="Search medications…" placeholderTextColor={colors.placeholder}
            value={search} onChangeText={setSearch}
            returnKeyType="search" clearButtonMode="while-editing" />
        </View>
      </View>

      <CalendarFilter dots={calDots} filter={calFilter} onFilter={setCalFilter} accent={ac} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PawBondLoader size={56} />
        </View>
      ) : displayed.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
          <Ionicons name="medical-outline" size={48} color={colors.textTertiary} />
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }}>No medications</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
            {filter === 'active' ? 'No active medications. Tap + to add one.' : 'No medications recorded yet.'}
          </Text>
          {perms.canLogHealth && (
            <TouchableOpacity onPress={openAdd}
              style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 14, backgroundColor: ac }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Add medication</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never">
          {displayed.map(m => (
            <View key={m.id} style={[ss.card, { backgroundColor: colors.card, borderColor: m.is_active ? ac + '30' : colors.border }]}>
              {/* Active stripe */}
              {m.is_active && <View style={[ss.stripe, { backgroundColor: ac }]} />}

              <View style={{ flex: 1 }}>
                {/* Name row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.is_active ? colors.success : colors.textDisabled }} />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>{m.name}</Text>
                  <TouchableOpacity onPress={() => toggleActive(m)}
                    style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1,
                      borderColor: m.is_active ? colors.success + '40' : colors.textDisabled + '40',
                      backgroundColor: m.is_active ? colors.success + '12' : colors.textDisabled + '12' }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: m.is_active ? colors.success : colors.textDisabled }}>
                      {m.is_active ? 'Active' : 'Stopped'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Dosage + frequency */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
                  {m.dosage && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="flask-outline" size={12} color={colors.textTertiary} />
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{m.dosage}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="repeat-outline" size={12} color={colors.textTertiary} />
                    <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{m.frequency.replace('_', ' ')}</Text>
                  </View>
                  {m.start_date && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="calendar-outline" size={12} color={colors.textTertiary} />
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
                        {format(parseISO(m.start_date), 'MMM d, yyyy')}
                        {m.end_date ? ` → ${format(parseISO(m.end_date), 'MMM d, yyyy')}` : ''}
                      </Text>
                    </View>
                  )}
                </View>

                {m.notes ? (
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 17, marginTop: 4 }} numberOfLines={2}>{m.notes}</Text>
                ) : null}

                {m.source === 'scan' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="sparkles-outline" size={10} color={ac} />
                    <Text style={{ fontSize: TYPO.body, color: ac, fontWeight: '600' }}>AI extracted</Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              {perms.canLogHealth && (
                <View style={{ flexDirection: 'row', gap: 6, paddingLeft: 8, alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => openEdit(m)}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: ac + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="pencil-outline" size={15} color={ac} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteMed(m)}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.danger + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <BottomSheet
        visible={modal}
        onClose={() => { setModal(false); setIsViewMode(true); }}
        title={isViewMode && form.id ? 'Medication details' : form.id ? 'Edit medication' : 'Add medication'}
        titleIcon={<Ionicons name="medical-outline" size={16} color={ac} />}
        accent={ac}>
        {isViewMode && form.id ? (
          <>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              <View style={dynSS.viewRow}>
                <Text style={dynSS.viewLabel}>Name</Text>
                <Text style={dynSS.viewValue}>{form.name || '—'}</Text>
              </View>
              <View style={dynSS.viewRow}>
                <Text style={dynSS.viewLabel}>Dosage</Text>
                <Text style={dynSS.viewValue}>{form.dosage || '—'}</Text>
              </View>
              <View style={dynSS.viewRow}>
                <Text style={dynSS.viewLabel}>Frequency</Text>
                <Text style={dynSS.viewValue}>{form.frequency.replace('_', ' ')}</Text>
              </View>
              <View style={dynSS.viewRow}>
                <Text style={dynSS.viewLabel}>Start date</Text>
                <Text style={dynSS.viewValue}>{form.start_date ? format(parseISO(form.start_date), 'MMMM d, yyyy') : '—'}</Text>
              </View>
              <View style={dynSS.viewRow}>
                <Text style={dynSS.viewLabel}>End date</Text>
                <Text style={dynSS.viewValue}>{form.end_date ? format(parseISO(form.end_date), 'MMMM d, yyyy') : '—'}</Text>
              </View>
              {form.remind_time && form.frequency !== 'as_needed' && (
                <View style={dynSS.viewRow}>
                  <Text style={dynSS.viewLabel}>Daily reminder</Text>
                  <Text style={dynSS.viewValue}>
                    {(() => { const [rh, rm] = form.remind_time!.split(':').map(Number); const d = new Date(); d.setHours(rh, rm); return format(d, 'h:mm a'); })()}
                  </Text>
                </View>
              )}
              <View style={dynSS.viewRow}>
                <Text style={dynSS.viewLabel}>Status</Text>
                <Text style={dynSS.viewValue}>{form.is_active ? 'Active' : 'Stopped'}</Text>
              </View>
              <View style={dynSS.viewRow}>
                <Text style={dynSS.viewLabel}>Notes</Text>
                <Text style={dynSS.viewValue}>{form.notes || '—'}</Text>
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 4 }}>
              <TouchableOpacity onPress={() => setModal(false)}
                style={{ flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
              {perms.canLogHealth && (
                <TouchableOpacity
                  onPress={() => showAlert('Delete medication?', form.name, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => { delMed.mutate(form.id!, { onSuccess: () => { setModal(false); setIsViewMode(true); }, onError: (e: any) => showAlert('Error', e?.message ?? 'Could not delete medication') }); } },
                  ])}
                  style={{ flex: 0.7, height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.danger ?? '#E53935', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger ?? '#E53935'} />
                </TouchableOpacity>
              )}
              {perms.canLogHealth && (
                <TouchableOpacity onPress={() => setIsViewMode(false)}
                  style={{ flex: 2, height: 50, borderRadius: 14, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
                  <Ionicons name="pencil" size={15} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>

                {/* Name + Dosage */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={[ss.label, { color: colors.textSecondary }]}>Name *</Text>
                    <TextInput
                      style={[ss.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                      placeholder="Carprofen, Apoquel…" placeholderTextColor={colors.placeholder}
                      returnKeyType="next"
                      value={form.name}
                      onChangeText={t => setForm(p => ({ ...p, name: t.replace(/[^a-zA-Z0-9\s\-'.]/g, '') }))}
                      maxLength={100} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[ss.label, { color: colors.textSecondary }]}>Dosage</Text>
                    <TextInput
                      style={[ss.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                      placeholder="25mg" placeholderTextColor={colors.placeholder}
                      returnKeyType="done" onSubmitEditing={Keyboard.dismiss}
                      value={form.dosage ?? ''}
                      onChangeText={t => setForm(p => ({ ...p, dosage: t.replace(/[^a-zA-Z0-9\s./]/g, '') }))}
                      maxLength={50} />
                  </View>
                </View>

                {/* Frequency */}
                <View>
                  <Text style={[ss.label, { color: colors.textSecondary }]}>Frequency</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {FREQ_OPTS.map(f => {
                      const sel = form.frequency === f;
                      return (
                        <TouchableOpacity key={f} onPress={() => setForm(p => ({ ...p, frequency: f }))}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
                            borderColor: sel ? ac : colors.border,
                            backgroundColor: sel ? ac + '12' : colors.inputBg }}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: sel ? ac : colors.textSecondary }}>
                            {f.replace('_', ' ')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* From / To dates */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['start_date', 'end_date'] as const).map(field => {
                    const val = form[field];
                    return (
                      <View key={field} style={{ flex: 1 }}>
                        <Text style={[ss.label, { color: colors.textSecondary }]}>
                          {field === 'start_date' ? 'From' : 'To (optional)'}
                        </Text>
                        <TouchableOpacity
                          onPress={() => { Keyboard.dismiss(); setPickerDate(val ? new Date(val) : new Date()); setPickerField(field); }}
                          style={[ss.dateBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                          <Ionicons name="calendar-outline" size={13} color={val ? ac : colors.textTertiary} />
                          <Text style={{ fontSize: TYPO.body, color: val ? colors.textPrimary : colors.placeholder, flex: 1 }}>
                            {val ? format(parseISO(val), 'MMM d, yyyy') : 'Pick date'}
                          </Text>
                          {val ? (
                            <TouchableOpacity onPress={() => setForm(p => ({ ...p, [field]: null }))}>
                              <Ionicons name="close-circle" size={14} color={colors.textTertiary} />
                            </TouchableOpacity>
                          ) : null}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                {/* Date picker */}
                <AppDateTimePicker
                  visible={!!pickerField}
                  value={pickerDate}
                  mode="date"
                  minimumDate={pickerField === 'end_date' && form.start_date ? new Date(form.start_date) : undefined}
                  maximumDate={pickerField === 'start_date' && form.end_date ? new Date(form.end_date) : undefined}
                  accent={ac}
                  onCancel={() => setPickerField(null)}
                  onConfirm={(d) => {
                    if (pickerField) setForm(p => ({ ...p, [pickerField]: format(d, 'yyyy-MM-dd') }));
                    setPickerField(null);
                  }}
                />

                {/* Notes */}
                <View>
                  <Text style={[ss.label, { color: colors.textSecondary }]}>Notes</Text>
                  <TextInput
                    style={[ss.input, { height: 60, paddingTop: 10, textAlignVertical: 'top', color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                    multiline placeholder="Reason, instructions…" placeholderTextColor={colors.placeholder}
                    value={form.notes ?? ''}
                    onChangeText={t => setForm(p => ({ ...p, notes: t }))}
                    maxLength={500} />
                </View>

                {/* Reminder time */}
                {form.frequency !== 'as_needed' && (
                  <View>
                    <Text style={[ss.label, { color: colors.textSecondary }]}>Daily Reminder</Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (form.remind_time) {
                          const [rh, rm] = form.remind_time.split(':').map(Number);
                          const d = new Date(); d.setHours(rh, rm, 0, 0);
                          setTimePickerDate(d);
                        }
                        setShowTimePicker(true);
                      }}
                      style={[ss.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                      <Text style={{ color: form.remind_time ? colors.textPrimary : colors.placeholder, fontSize: TYPO.body }}>
                        {form.remind_time
                          ? (() => { const [rh, rm] = form.remind_time.split(':').map(Number); const d = new Date(); d.setHours(rh, rm); return format(d, 'h:mm a'); })()
                          : 'Set reminder time'}
                      </Text>
                      <Ionicons name="alarm-outline" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                    <AppDateTimePicker
                      visible={showTimePicker}
                      value={timePickerDate}
                      mode="time"
                      accent={ac}
                      onCancel={() => setShowTimePicker(false)}
                      onConfirm={(d) => {
                        const h = String(d.getHours()).padStart(2, '0');
                        const m = String(d.getMinutes()).padStart(2, '0');
                        setForm(p => ({ ...p, remind_time: `${h}:${m}` }));
                        setShowTimePicker(false);
                      }}
                    />
                  </View>
                )}

                {/* Status */}
                <View>
                  <Text style={[ss.label, { color: colors.textSecondary }]}>Status</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[{ val: true, label: '🟢 Active', color: colors.success, bg: colors.success + '15' },
                      { val: false, label: '⚫ Stopped', color: colors.textDisabled, bg: colors.textDisabled + '15' }].map(opt => {
                      const sel = form.is_active === opt.val;
                      return (
                        <TouchableOpacity key={String(opt.val)} onPress={() => setForm(p => ({ ...p, is_active: opt.val }))}
                          style={{ flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5,
                            borderColor: sel ? opt.color : colors.border,
                            backgroundColor: sel ? opt.bg : colors.inputBg,
                            alignItems: 'center' }}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: sel ? opt.color : colors.textSecondary }}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

              </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 4 }}>
              <TouchableOpacity onPress={() => form.id ? setIsViewMode(true) : setModal(false)}
                style={{ flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{form.id ? 'Back' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} disabled={saveMed.isPending}
                style={{ flex: 2, height: 50, borderRadius: 14, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', opacity: saveMed.isPending ? 0.7 : 1 }}>
                {saveMed.isPending ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </BottomSheet>

      {/* FAB */}
      {perms.canLogHealth && (
        <TouchableOpacity
          style={[{ position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: ac, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }]}
          onPress={openAdd}
          activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: TYPO.heading, fontWeight: '800' },
  sub:     { fontSize: TYPO.body, marginTop: 1 },
  tabRow:  { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:     { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabTxt:  { fontSize: TYPO.body, fontWeight: '600' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, paddingLeft: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,
  },
  stripe:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  sheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  label:   { fontSize: TYPO.body, fontWeight: '600', marginBottom: 6 },
  input:   { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: TYPO.body },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  viewRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  viewLabel: { fontSize: TYPO.body, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  viewValue: { fontSize: TYPO.body, fontWeight: '500' },
});
