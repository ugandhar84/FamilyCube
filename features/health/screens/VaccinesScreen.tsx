import { showAlert } from '@/components/AppAlert';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, ActivityIndicator, Platform,
  Keyboard, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { useTheme } from '@/lib/ThemeContext';
import { getVaccines, saveVaccine, deleteVaccine } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { format, parseISO, differenceInDays, differenceInYears } from 'date-fns';
import { toTitle } from '@/lib/format';
import { dbRun } from '@/lib/dbUtils';
import PawBondLoader from '@/components/PawBondLoader';
import PetHeaderChip from '@/components/PetHeaderChip';
import BottomSheet from '@/components/BottomSheet';
import CalendarFilter, { type DateFilter } from '@/components/CalendarFilter';
import { TYPO } from '@/constants/theme';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Vaccine {
  id: string;
  pet_id: string;
  name: string;
  last_given: string | null;
  next_due: string | null;
  vet_name: string | null;
  clinic: string | null;
  notes: string | null;
  created_at: string;
}

interface Template { name: string; notes: string; frequency: string }

// ── Predefined vaccine templates by species ───────────────────────────────────
const TEMPLATES: Record<string, Template[]> = {
  dog: [
    { name: 'Rabies',           notes: 'Core — legally required in most states',     frequency: 'Every 1–3 years' },
    { name: 'Distemper (DHPP)', notes: 'Core combo: Distemper, Hepatitis, Parvovirus, Parainfluenza', frequency: 'Every 3 years' },
    { name: 'Bordetella',       notes: 'Kennel cough — required for boarding/daycare', frequency: 'Every 6–12 months' },
    { name: 'Leptospirosis',    notes: 'Recommended for dogs with outdoor exposure',  frequency: 'Annual' },
    { name: 'Lyme Disease',     notes: 'Recommended in tick-endemic areas',           frequency: 'Annual' },
    { name: 'Canine Influenza', notes: 'Recommended for social dogs',                 frequency: 'Annual' },
  ],
  cat: [
    { name: 'Rabies',           notes: 'Core — legally required in most areas',       frequency: 'Every 1–3 years' },
    { name: 'FVRCP',            notes: 'Core combo: Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia', frequency: 'Every 3 years' },
    { name: 'FeLV',             notes: 'Feline Leukemia Virus — recommended for outdoor cats', frequency: 'Annual' },
    { name: 'FIV',              notes: 'Feline Immunodeficiency Virus — for at-risk cats', frequency: 'Annual' },
  ],
  rabbit: [
    { name: 'RHDV2',            notes: 'Rabbit Hemorrhagic Disease Virus Type 2',     frequency: 'Annual' },
    { name: 'Myxomatosis',      notes: 'Required in UK/Europe — check local guidance', frequency: 'Annual' },
  ],
  bird: [
    { name: 'Polyomavirus',     notes: 'Core for psittacines (parrots, budgies)',     frequency: 'Annual' },
    { name: 'Pacheco\'s Disease', notes: 'Herpesvirus — recommended for flocks',      frequency: 'Annual' },
  ],
  hamster: [
    { name: 'Rabies',           notes: 'Rarely required but consult your vet',        frequency: 'As advised' },
  ],
  other: [
    { name: 'Rabies',           notes: 'Consult your vet for species-specific requirements', frequency: 'As advised' },
  ],
};

function getTemplates(species?: string): Template[] {
  if (!species) return TEMPLATES.other;
  return TEMPLATES[species] ?? TEMPLATES.other;
}

// ── Status helper ─────────────────────────────────────────────────────────────
function statusOf(v: Vaccine, colors: any): { label: string; color: string } {
  if (!v.next_due) return { label: 'No due date', color: colors.textSecondary };
  const days = differenceInDays(parseISO(v.next_due), new Date());
  if (days < 0)   return { label: 'Overdue',    color: colors.danger };
  if (days <= 30) return { label: 'Due soon',   color: colors.warning };
  return               { label: 'Up to date', color: colors.success };
}

const BLANK: Partial<Vaccine> = { name: '', last_given: '', next_due: '', vet_name: '', clinic: '', notes: '' };

// ── Screen ────────────────────────────────────────────────────────────────────
export default function VaccinesScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { activePetId, activePet, petRoles } = usePetStore(useShallow(s => ({ activePetId: s.activePetId, activePet: s.activePet, petRoles: s.petRoles })));
  const pet = activePet();
  const accent = pet?.accent_color ?? colors.primary;
  const petAgeYrs = (pet as any)?.birthday ? differenceInYears(new Date(), parseISO((pet as any).birthday)) : null;
  const petAge = petAgeYrs != null ? `${petAgeYrs} yr${petAgeYrs !== 1 ? 's' : ''}` : null;
  const perms = getPermissions(activePetId ? petRoles[activePetId] : 'owner');

  const [vaccines, setVaccines] = useState<Vaccine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,  setSearch]    = useState('');
  const [calFilter, setCalFilter] = useState<DateFilter>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState<Partial<Vaccine>>(BLANK);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [pickerField, setPickerField] = useState<'last_given' | 'next_due' | null>(null);
  const [pickerDate, setPickerDate]   = useState(new Date());
  const [errors, setErrors] = useState<{ name?: string; dateOrder?: string }>({});

  const templates = useMemo(() => getTemplates(pet?.species), [pet?.species]);
  const s = useMemo(() => makeStyles(colors, isDark, accent), [colors, isDark, accent]);

  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    if (activePetId) {
      load();
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [activePetId]));

  useEffect(() => {
    if (!activePetId) return;
    const ch = supabase.channel(`vaccines-rt-${activePetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccines', filter: `pet_id=eq.${activePetId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activePetId]);

  const load = async (isRefresh = false) => {
    if (!activePetId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getVaccines(activePetId);
      setVaccines(data);
    } catch (e: any) {
      console.warn('[vaccines]', e.message);
    }
    if (isRefresh) setRefreshing(false); else setLoading(false);
  };

  const openDatePicker = (field: 'last_given' | 'next_due') => {
    const val = editing[field];
    setPickerDate(val ? parseISO(val) : new Date());
    setPickerField(field);
  };

  const openAdd = (prefill?: Partial<Vaccine>) => {
    setEditing({ ...BLANK, ...prefill });
    setErrors({});
    setIsViewMode(false);
    setShowModal(true);
  };
  const openEdit = (v: Vaccine) => {
    setEditing({ ...v, last_given: v.last_given ?? '', next_due: v.next_due ?? '', vet_name: v.vet_name ?? '', clinic: v.clinic ?? '', notes: v.notes ?? '' });
    setErrors({});
    setIsViewMode(true);
    setTimeout(() => setShowModal(true), 0);
  };

  const toDate = (val: string | null | undefined) => {
    if (!val?.trim()) return null;
    const d = new Date(val.trim());
    return isNaN(d.getTime()) ? null : val.trim();
  };

  const save = async () => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('save vaccines')); return; }
    const newErrors: typeof errors = {};

    if (!editing.name?.trim() || !activePetId) {
      newErrors.name = 'Vaccine name is required';
    }

    const lastGiven = toDate(editing.last_given ?? '');
    const nextDue   = toDate(editing.next_due ?? '');
    if (lastGiven && nextDue && new Date(nextDue) < new Date(lastGiven)) {
      newErrors.dateOrder = 'Next due date must be on or after the last given date';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    const payload = {
      name: (editing.name ?? '').trim(),
      last_given: toDate(editing.last_given),
      next_due: toDate(editing.next_due),
      vet_name: editing.vet_name?.trim() || null,
      clinic: editing.clinic?.trim() || null,
      notes: editing.notes?.trim() || null,
    };
    // Optimistic update — close modal immediately, revert on error
    const optimisticId = editing.id ?? `opt-${Date.now()}`;
    const originalVaccine = editing.id ? vaccines.find(v => v.id === editing.id) : undefined;
    const optimisticEntry = { ...payload, pet_id: activePetId, id: optimisticId, created_at: new Date().toISOString() } as Vaccine;
    setVaccines(prev =>
      editing.id
        ? prev.map(v => v.id === editing.id ? { ...v, ...payload } : v)
        : [...prev, optimisticEntry]
    );
    setShowModal(false);
    setSaving(false);

    try {
      await saveVaccine(activePetId!, payload, editing.id);
      load();
    } catch (err: any) {
      // Revert both new additions and edits
      setVaccines(prev => editing.id
        ? prev.map(v => v.id === editing.id ? { ...v, ...originalVaccine } : v)
        : prev.filter(v => v.id !== optimisticId)
      );
      showAlert('Error', err.message);
    }
  };

  const addAllTemplates = async () => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('add vaccines')); return; }
    if (!activePetId) return;
    const existing = new Set(vaccines.map((v) => v.name.toLowerCase()));
    const toInsert = templates
      .filter((t) => !existing.has(t.name.toLowerCase()))
      .map((t) => ({ pet_id: activePetId, name: t.name, notes: t.notes, last_given: null, next_due: null }));
    if (toInsert.length === 0) {
      showAlert('Already added', 'All recommended vaccines are already in your list.');
      return;
    }
    setAddingAll(true);
    const results = await Promise.allSettled(
      toInsert.map(v => saveVaccine(activePetId, { name: v.name, notes: v.notes ?? null, last_given: null, next_due: null, vet_name: null, clinic: null }))
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      showAlert('Partial error', `${toInsert.length - failed} vaccines added; ${failed} could not be saved.`);
    }
    setAddingAll(false);
    load();
  };

  const remove = (id: string) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('delete vaccines')); return; }
    showAlert('Delete vaccine?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteVaccine(id);
          load();
        } catch {
          showAlert('Error', 'Could not delete vaccine.');
        }
      }},
    ]);
  };

  const calDots = useMemo(() => [
    { dates: vaccines.filter(v => v.last_given).map(v => v.last_given!.slice(0, 10)), color: colors.success, key: 'given' },
    { dates: vaccines.filter(v => v.next_due).map(v => v.next_due!.slice(0, 10)),  color: colors.warning, key: 'due'   },
  ], [vaccines, colors]);

  const visibleVaccines = useMemo(() => {
    let list = vaccines;
    if (search.trim()) list = list.filter(v => v.name.toLowerCase().includes(search.toLowerCase()) || (v.notes ?? '').toLowerCase().includes(search.toLowerCase()));
    if (calFilter?.type === 'single') list = list.filter(v => v.last_given?.slice(0, 10) === calFilter.date || v.next_due?.slice(0, 10) === calFilter.date);
    else if (calFilter?.type === 'range') list = list.filter(v => {
      const given = v.last_given?.slice(0, 10) ?? '';
      const due   = v.next_due?.slice(0, 10) ?? '';
      const { start, end } = calFilter.range;
      return (given >= start && given <= end) || (due >= start && due <= end);
    });
    return list;
  }, [vaccines, search, calFilter]);
  const overdue = visibleVaccines.filter((v) => v.next_due && differenceInDays(parseISO(v.next_due), new Date()) < 0);
  const dueSoon = visibleVaccines.filter((v) => v.next_due && differenceInDays(parseISO(v.next_due), new Date()) >= 0 && differenceInDays(parseISO(v.next_due), new Date()) <= 30);
  const current = visibleVaccines.filter((v) => !v.next_due || differenceInDays(parseISO(v.next_due), new Date()) > 30);
  const groups = [
    { title: 'Overdue',    data: overdue, accent: colors.danger },
    { title: 'Due soon',   data: dueSoon, accent: colors.warning },
    { title: 'Up to date', data: current, accent: colors.success },
  ].filter((g) => g.data.length > 0);

  // Which templates are already saved?
  const savedNames = new Set(vaccines.map((v) => v.name.toLowerCase()));
  const pendingTemplates = templates.filter((t) => !savedNames.has(t.name.toLowerCase()));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View>
            <Text style={s.title}>Vaccines</Text>
            {pet && <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: accent, marginTop: 1 }} numberOfLines={1}>{(pet as any).emoji ?? '🐾'}  {pet.name}{petAge ? `  ·  ${petAge}` : ''}</Text>}
          </View>
          {pet && <PetHeaderChip pet={pet as any} variant="badge" />}
        </View>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 40 }}>
          <Ionicons name="search-outline" size={15} color={colors.textTertiary} />
          <TextInput
            style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary }}
            placeholder="Search vaccines…" placeholderTextColor={colors.placeholder}
            value={search} onChangeText={setSearch}
            returnKeyType="search" clearButtonMode="while-editing" />
        </View>
      </View>

      <CalendarFilter dots={calDots} filter={calFilter} onFilter={setCalFilter} accent={accent} />

      {loading ? (
        <PawBondLoader size={56} />
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 96 }} onScroll={e => setShowScrollTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={accent} colors={[accent]} />}>

          {/* Summary strip — only when records exist */}
          {vaccines.length > 0 && (
            <View style={s.summaryRow}>
              {[
                { label: 'Overdue',    count: overdue.length, color: colors.danger },
                { label: 'Due soon',   count: dueSoon.length, color: colors.warning },
                { label: 'Up to date', count: current.length, color: colors.success },
              ].map((c) => (
                <View key={c.label} style={[s.summaryChip, { backgroundColor: c.color + '12', borderColor: c.color + '30' }]}>
                  <Text style={[s.summaryCount, { color: c.color }]}>{c.count}</Text>
                  <Text style={[s.summaryLabel, { color: c.color }]}>{c.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Recorded vaccine groups */}
          {groups.map((group) => (
            <View key={group.title}>
              <View style={s.groupHeader}>
                <View style={[s.groupDot, { backgroundColor: group.accent }]} />
                <Text style={s.groupTitle}>{group.title}</Text>
                <Text style={s.groupCount}>{group.data.length}</Text>
              </View>
              {group.data.map((v) => {
                const { label, color } = statusOf(v, colors);
                const daysUntil = v.next_due ? differenceInDays(parseISO(v.next_due), new Date()) : null;
                return (
                  <TouchableOpacity key={v.id} style={[s.card, { borderLeftColor: accent + '60' }]}
                    onPress={() => openEdit(v)} onLongPress={() => remove(v.id)}>
                    <View style={[s.cardIcon, { backgroundColor: accent + '15' }]}>
                      <Text style={{ fontSize: TYPO.title }}>💉</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardName}>{v.name}</Text>
                      {v.last_given && (
                        <Text style={s.cardDetail}>
                          <Text style={s.cardDetailLabel}>Last: </Text>
                          {format(parseISO(v.last_given), 'MMM d, yyyy')}
                        </Text>
                      )}
                      {(v.vet_name || v.clinic) && (
                        <Text style={s.cardDetail} numberOfLines={1}>
                          {[v.vet_name ? `Dr. ${v.vet_name}` : null, v.clinic].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[s.statusBadge, { backgroundColor: color + '18' }]}>
                        <Text style={[s.statusText, { color }]}>{label}</Text>
                      </View>
                      {v.next_due && (
                        <Text style={[s.dueDate, { color: colors.textSecondary }]}>
                          {daysUntil !== null && daysUntil < 0
                            ? `${Math.abs(daysUntil)}d ago`
                            : format(parseISO(v.next_due), 'MMM d, yyyy')}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Recommended / pending templates section */}
          {pendingTemplates.length > 0 && (
            <View style={{ marginTop: vaccines.length > 0 ? 28 : 20 }}>
              <View style={[s.groupHeader, { marginBottom: 6 }]}>
                <Ionicons name="shield-checkmark-outline" size={15} color={accent} />
                <Text style={[s.groupTitle, { color: accent, marginLeft: 4 }]}>
                  Recommended for {pet?.species ?? 'your baby'}
                </Text>
                <TouchableOpacity style={[s.addAllBtn, { borderColor: accent + '40', backgroundColor: accent + '10' }]}
                  onPress={addAllTemplates} disabled={addingAll}>
                  {addingAll
                    ? <ActivityIndicator size="small" color={accent} />
                    : <Text style={[s.addAllText, { color: accent }]}>Add all</Text>}
                </TouchableOpacity>
              </View>
              <Text style={s.templateHint}>Tap any vaccine to add it to {pet?.name ?? 'your baby'}'s record.</Text>

              {pendingTemplates.map((t) => (
                <TouchableOpacity key={t.name}
                  style={[s.templateCard, { borderColor: accent + '25', backgroundColor: accent + '06' }]}
                  onPress={() => { if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('add vaccines')); return; } openAdd({ name: t.name, notes: t.notes }); }}>
                  <View style={[s.templateIcon, { backgroundColor: accent + '15' }]}>
                    <Ionicons name="add-circle-outline" size={20} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.templateName}>{t.name}</Text>
                    <Text style={s.templateFreq}>{t.frequency}</Text>
                    <Text style={s.templateNotes} numberOfLines={2}>{t.notes}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={accent + '80'} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Completely empty state */}
          {vaccines.length === 0 && pendingTemplates.length === 0 && (
            <View style={s.emptyWrap}>
              <Text style={s.emptyTitle}>All caught up!</Text>
              <Text style={s.emptySub}>All recommended vaccines are recorded for {pet?.name ?? 'your baby'}.</Text>
              {perms.canLogHealth && (
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: accent }]} onPress={() => openAdd()}>
                  <Text style={s.emptyBtnText}>Add vaccine</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <BottomSheet
        visible={showModal}
        onClose={() => { setShowModal(false); setIsViewMode(true); }}
        title={isViewMode && editing.id ? 'Vaccine details' : editing.id ? 'Edit vaccine' : 'Add vaccine'}
        titleIcon={<Ionicons name="shield-checkmark-outline" size={16} color={accent} />}
        accent={accent}>
        {isViewMode && editing.id ? (
          <>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              <View style={s.viewRow}>
                <Text style={s.viewLabel}>Name</Text>
                <Text style={s.viewValue}>{editing.name || '—'}</Text>
              </View>
              <View style={s.viewRow}>
                <Text style={s.viewLabel}>Date last given</Text>
                <Text style={s.viewValue}>{editing.last_given ? format(parseISO(editing.last_given), 'MMMM d, yyyy') : '—'}</Text>
              </View>
              <View style={s.viewRow}>
                <Text style={s.viewLabel}>Next due date</Text>
                <Text style={s.viewValue}>{editing.next_due ? format(parseISO(editing.next_due), 'MMMM d, yyyy') : '—'}</Text>
              </View>
              <View style={s.viewRow}>
                <Text style={s.viewLabel}>Vet name</Text>
                <Text style={s.viewValue}>{editing.vet_name || '—'}</Text>
              </View>
              <View style={s.viewRow}>
                <Text style={s.viewLabel}>Clinic</Text>
                <Text style={s.viewValue}>{editing.clinic || '—'}</Text>
              </View>
              <View style={s.viewRow}>
                <Text style={s.viewLabel}>Notes</Text>
                <Text style={s.viewValue}>{editing.notes || '—'}</Text>
              </View>
            </ScrollView>
            <View style={s.footer}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelText}>Close</Text>
              </TouchableOpacity>
              {perms.canLogHealth && (
                <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.danger, flex: 0.7 }]} onPress={() => { setShowModal(false); remove(editing.id!); }}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </TouchableOpacity>
              )}
              {perms.canLogHealth && (
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent, flexDirection: 'row', gap: 6 }]} onPress={() => setIsViewMode(false)}>
                  <Ionicons name="pencil" size={15} color="#fff" />
                  <Text style={s.saveText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>

              <Text style={s.inputLabel}>Vaccine name *</Text>
              <TextInput style={[s.input, errors.name ? { borderColor: colors.danger ?? '#E53935' } : {}]}
                placeholder="e.g. Rabies, Distemper, Bordetella"
                placeholderTextColor={colors.placeholder}
                value={editing.name ?? ''}
                onChangeText={(t) => { setEditing((p) => ({ ...p, name: t.replace(/[^a-zA-Z0-9\s\-'.()/]/g, '') })); setErrors(e => ({ ...e, name: undefined })); }}
                maxLength={100} />
              {errors.name && <Text style={{ fontSize: TYPO.caption, color: colors.danger ?? '#E53935', marginTop: 4, marginBottom: 10 }}>{errors.name}</Text>}

              <Text style={s.inputLabel}>Date last given</Text>
              <TouchableOpacity style={s.dateRow} onPress={() => openDatePicker('last_given')}>
                <Ionicons name="calendar-outline" size={18} color={accent} />
                <Text style={[s.dateText, !editing.last_given && { color: colors.placeholder }]}>
                  {editing.last_given ? format(parseISO(editing.last_given), 'MMMM d, yyyy') : 'Select date'}
                </Text>
                {editing.last_given && (
                  <TouchableOpacity onPress={() => setEditing((p) => ({ ...p, last_given: '' }))} style={{ marginLeft: 'auto' }}>
                    <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              <Text style={s.inputLabel}>Next due date</Text>
              <TouchableOpacity style={[s.dateRow, errors.dateOrder ? { borderColor: colors.danger ?? '#E53935' } : {}]} onPress={() => { openDatePicker('next_due'); setErrors(e => ({ ...e, dateOrder: undefined })); }}>
                <Ionicons name="calendar-outline" size={18} color={accent} />
                <Text style={[s.dateText, !editing.next_due && { color: colors.placeholder }]}>
                  {editing.next_due ? format(parseISO(editing.next_due), 'MMMM d, yyyy') : 'Select date'}
                </Text>
                {editing.next_due && (
                  <TouchableOpacity onPress={() => setEditing((p) => ({ ...p, next_due: '' }))} style={{ marginLeft: 'auto' }}>
                    <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              {errors.dateOrder && <Text style={{ fontSize: TYPO.caption, color: colors.danger ?? '#E53935', marginTop: 4, marginBottom: 10 }}>{errors.dateOrder}</Text>}

              {/* Date picker */}
              <AppDateTimePicker
                visible={pickerField !== null}
                value={pickerDate}
                mode="date"
                maximumDate={pickerField === 'last_given' ? new Date() : undefined}
                minimumDate={pickerField === 'next_due' && editing.last_given ? new Date(editing.last_given) : undefined}
                accent={accent}
                onCancel={() => setPickerField(null)}
                onConfirm={(d) => {
                  if (pickerField) setEditing((p) => ({ ...p, [pickerField]: format(d, 'yyyy-MM-dd') }));
                  setPickerField(null);
                }}
              />

              <Text style={s.inputLabel}>Vet name</Text>
              <TextInput style={s.input}
                placeholder="Dr. Sarah Kim"
                placeholderTextColor={colors.placeholder}
                value={editing.vet_name ?? ''}
                onChangeText={(t) => setEditing((p) => ({ ...p, vet_name: t.replace(/[^a-zA-Z\s\-'.]/g, '') }))}
                maxLength={80} />

              <Text style={s.inputLabel}>Clinic</Text>
              <TextInput style={s.input}
                placeholder="Green Paws Animal Hospital"
                placeholderTextColor={colors.placeholder}
                value={editing.clinic ?? ''}
                onChangeText={(t) => setEditing((p) => ({ ...p, clinic: t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, '') }))}
                maxLength={100} />

              <Text style={s.inputLabel}>Notes</Text>
              <TextInput style={[s.input, { height: 72, paddingTop: 12 }]}
                multiline
                placeholder="Any reactions, batch numbers, etc."
                placeholderTextColor={colors.placeholder}
                value={editing.notes ?? ''}
                onChangeText={(t) => setEditing((p) => ({ ...p, notes: t }))}
                maxLength={500} />

              {editing.id && perms.canLogHealth && (
                <TouchableOpacity style={s.deleteBtn}
                  onPress={() => { setShowModal(false); remove(editing.id!); }}>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[s.deleteBtnText, { color: colors.danger }]}>Delete vaccine record</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <View style={s.footer}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => editing.id ? setIsViewMode(true) : setShowModal(false)}>
                <Text style={s.cancelText}>{editing.id ? 'Back' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }, saving && { opacity: 0.7 }]}
                onPress={save} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </BottomSheet>

      {/* FAB */}
      {perms.canLogHealth && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: accent, bottom: insets.bottom + 16 }]}
          onPress={() => showScrollTop ? scrollRef.current?.scrollTo({ y: 0, animated: true }) : openAdd()}
          activeOpacity={0.85}>
          {showScrollTop
            ? <Ionicons name="chevron-up" size={26} color="#fff" />
            : <Ionicons name="add" size={28} color="#fff" />}
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean, accent: string) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  sub: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  addBtnText: { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },

  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 20 },
  summaryChip: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 10, alignItems: 'center', gap: 2 },
  summaryCount: { fontSize: TYPO.title, fontWeight: '800' },
  summaryLabel: { fontSize: TYPO.body, fontWeight: '600' },

  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupTitle: { fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  groupCount: { fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 18,
    padding: 14, marginBottom: 10,
    borderLeftWidth: 3,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8 }, android: { elevation: 2 } }),
  },
  cardIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  cardDetail: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 },
  cardDetailLabel: { color: colors.textSecondary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: TYPO.body, fontWeight: '700' },
  dueDate: { fontSize: TYPO.body },

  // Templates
  addAllBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  addAllText: { fontSize: TYPO.body, fontWeight: '700' },
  templateHint: { fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 10 },
  templateCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 8,
  },
  templateIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  templateName: { fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary },
  templateFreq: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 },
  templateNotes: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 3 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40, marginTop: 80 },
  emptyTitle: { fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary },
  emptySub: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' },
  emptyBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  emptyBtnText: { color: '#fff', fontSize: TYPO.body, fontWeight: '600' },

  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, maxHeight: '92%' },
  sheetTitle: { fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary },
  inputLabel: { fontSize: TYPO.body, fontWeight: '500', color: colors.textSecondary, marginBottom: 6, marginTop: 16 },
  input: { height: 50, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 14, paddingHorizontal: 16, fontSize: TYPO.body, color: colors.textPrimary, backgroundColor: colors.inputBg },
  dateRow: { height: 50, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inputBg },
  dateText: { fontSize: TYPO.body, color: colors.textPrimary, flex: 1 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  pickerTitle: { fontSize: TYPO.body, fontWeight: '600' },
  pickerBtn: { fontSize: TYPO.body },
  viewRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  viewLabel: { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  viewValue: { fontSize: TYPO.body, color: colors.textPrimary, fontWeight: '500' },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card },
  cancelBtn: { flex: 1, height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: TYPO.body, color: colors.textSecondary },
  saveBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  saveText: { fontSize: TYPO.body, color: '#fff', fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, paddingVertical: 12 },
  deleteBtnText: { fontSize: TYPO.body, fontWeight: '600' },
});
