import { showAlert } from '@/components/AppAlert';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import {
  View, Text, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Animated,
} from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  format, isToday, parseISO, startOfWeek, addDays, addMonths, subMonths,
} from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import { useActiveLostAlert } from '@/lib/hooks/useActiveLostAlert';
import { SPACING, TYPO} from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import PawBondLoader from '@/components/PawBondLoader';
import PetHeaderChip from '@/components/PetHeaderChip';
import { savePetNote, deleteJournalEntry, updatePetNote, insertFeedingLog, insertGroomingLog, saveVetVisit, logWeight } from '@/lib/db';
import { usePetStore as usePetStoreRaw } from '@/store/petStore';
import { localDateStr } from '@/lib/dates';

import {
  type EntryType, type FilterType, type JournalEntry,
  getTypeColors, TYPE_LABEL, FILTER_OPTIONS, ADD_TYPES,
  invalidateJournalCache, DELETE_TABLE,
} from '@/features/care/components/journalTypes';
import { TypeIcon } from '@/features/care/components/TypeIcon';
import { FullMonthCalendar } from '@/features/care/components/FullMonthCalendar';
import { EntryCard } from '@/features/care/components/EntryCard';
import { WeekStrip } from '@/features/care/components/WeekStrip';
import { EntryFormSheet } from '@/features/care/components/EntryFormSheet';
import { makeStyles } from '@/features/care/components/journalStyles';
import { useJournalData } from '@/features/care/hooks/useJournalData';

export default function JournalScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const { pets, activePetId, petRoles } = usePetStore(useShallow(s => ({ pets: s.pets, activePetId: s.activePetId, petRoles: s.petRoles })));
  const perms = getPermissions(activePetId ? (petRoles[activePetId] ?? 'owner') : 'owner');
  const { user } = useAuthStore();
  const params = useLocalSearchParams<{ date?: string }>();

  const pet = useMemo(() => pets.find(p => p.id === activePetId) ?? pets[0] ?? null, [pets, activePetId]);
  const activeLostAlert = useActiveLostAlert(activePetId ?? null);

  // ── Data hook ──────────────────────────────────────────────────────────────
  const {
    entries, setEntries, loading, refreshing, setRefreshing,
    loadingMore, hasMore, load, loadMore,
  } = useJournalData({
    petId: pet?.id, userId: user?.id, ownerId: pet?.owner_id,
    petName: pet?.name, petEmoji: pet?.emoji,
  });

  // ── FAB ────────────────────────────────────────────────────────────────────
  const [showFab, setShowFab] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fabAnim, { toValue: showFab ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [showFab]);

  // ── Date navigation ────────────────────────────────────────────────────────
  const initDate = useMemo(() => {
    try { return params.date ? parseISO(params.date as string) : new Date(); } catch { return new Date(); }
  }, []);

  const [selected,  setSelected]  = useState(initDate);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initDate, { weekStartsOn: 1 }));
  const [calMonth,  setCalMonth]  = useState(initDate);
  const [showCal,   setShowCal]   = useState(false);

  useEffect(() => {
    if (!params.date) return;
    try {
      const d = parseISO(params.date as string);
      setSelected(d); setWeekStart(startOfWeek(d, { weekStartsOn: 1 })); setCalMonth(d);
    } catch {}
  }, [params.date]);

  useFocusEffect(useCallback(() => {
    if (params.date) return;
    const now = new Date();
    setSelected(now); setWeekStart(startOfWeek(now, { weekStartsOn: 1 })); setCalMonth(now);
  }, [params.date]));

  // Reset scroll on pet switch
  const lastScrollPet = useRef<string | null>(null);
  useEffect(() => {
    if (activePetId && activePetId !== lastScrollPet.current) {
      lastScrollPet.current = activePetId;
      scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    }
  }, [activePetId]);

  const selectDay = (d: Date) => {
    setSelected(d); setWeekStart(startOfWeek(d, { weekStartsOn: 1 })); setCalMonth(d); setShowCal(false);
  };

  // ── Entry map for calendar dots ────────────────────────────────────────────
  const entryMap = useMemo(() => {
    const m = new Map<string, EntryType[]>();
    for (const e of entries) { const arr = m.get(e.date) ?? []; arr.push(e.type); m.set(e.date, arr); }
    return m;
  }, [entries]);

  const accentColor = pet?.accent_color ?? colors.primary;
  const typeColors  = useMemo(() => getTypeColors(colors, isDark), [colors, isDark]);
  const s           = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const dayKey     = format(selected, 'yyyy-MM-dd');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const dayEntries = useMemo(() => {
    const all = entries.filter(e => e.date === dayKey);
    return filterType === 'all' ? all : all.filter(e => e.type === filterType);
  }, [entries, dayKey, filterType]);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [addType, setAddType]               = useState<EntryType | null>(null);
  const [editingEntry, setEditingEntry]     = useState<JournalEntry | null>(null);
  const [fTitle,     setFTitle]     = useState('');
  const [fNote,      setFNote]      = useState('');
  const [fPrivate,   setFPrivate]   = useState(false);
  const [fAmount,    setFAmount]    = useState('');
  const [fWeight,    setFWeight]    = useState('');
  const [fDiagnosis, setFDiagnosis] = useState('');
  const [fClinic,    setFClinic]    = useState('');
  const [fMealType,  setFMealType]  = useState('meal');
  const [fGroomType, setFGroomType] = useState('bath');
  const [saving,     setSaving]     = useState(false);

  const openAdd = (type: EntryType) => {
    if (type === 'mood') {
      setShowTypePicker(false);
      if (activeLostAlert) { showAlert('Baby is lost', `Find ${pet?.name ?? 'your baby'} first.`); return; }
      router.push('/ai/mood-camera'); return;
    }
    setAddType(type); setEditingEntry(null);
    setFTitle(''); setFNote(''); setFPrivate(false);
    setFAmount(''); setFWeight(''); setFDiagnosis(''); setFClinic('');
    setFMealType('meal'); setFGroomType('bath');
    setShowTypePicker(false);
  };

  const openEdit = useCallback((e: JournalEntry) => {
    if (!e.canEdit) return;
    setAddType(e.type); setEditingEntry(e);
    setFTitle(e.title); setFNote(e.subtitle ?? ''); setFPrivate(e.isPrivate ?? false);
    setFDiagnosis(e.diagnosis ?? ''); setFClinic(e.clinicName ?? '');
  }, []);

  const saveEntry = async () => {
    if (!pet || !user || !addType) return;
    const needsHealthPerm = addType === 'vet' || addType === 'weight';
    if (needsHealthPerm && !perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg(`add ${addType} entries`)); return; }
    if (!needsHealthPerm && !perms.canLogDailyCare) { showAlert('No permission', permissionDeniedMsg('add journal entries')); return; }
    setSaving(true);
    const now  = new Date().toISOString();
    const date = format(selected, 'yyyy-MM-dd');
    try {
      if (addType === 'note') {
        if (!fTitle.trim()) { showAlert('Please write something', 'A note cannot be empty.'); setSaving(false); return; }
        if (fTitle.trim().length < 2) { showAlert('Too short', 'Note must be at least 2 characters.'); setSaving(false); return; }
        if (editingEntry) await updatePetNote(editingEntry.rawId, { content: fTitle.trim(), is_private: fPrivate, updated_at: now, updated_by: user.id });
        else await savePetNote(pet.id, user.id, fTitle.trim(), fPrivate);
      } else if (addType === 'meal') {
        if (fAmount.trim()) {
          const amt = parseFloat(fAmount);
          if (isNaN(amt) || amt <= 0) { showAlert('Invalid amount', 'Amount must be a positive number.'); setSaving(false); return; }
          if (amt > 10000) { showAlert('Invalid amount', 'Amount seems too large.'); setSaving(false); return; }
        }
        await insertFeedingLog({ pet_id: pet.id, fed_by: user.id, meal_type: fMealType, food_type: fTitle.trim() || null, amount_grams: fAmount ? parseFloat(fAmount) : null, date, fed_at: now });
      } else if (addType === 'grooming') {
        await insertGroomingLog({ pet_id: pet.id, type: fGroomType, done_at: date, done_at_time: now, done_by: user.id, notes: fNote.trim() || null });
      } else if (addType === 'weight') {
        const kg = parseFloat(fWeight);
        if (isNaN(kg) || kg <= 0) { showAlert('Enter a valid weight in kg'); setSaving(false); return; }
        await logWeight(pet.id, kg, user.id, fNote.trim() || null);
      } else if (addType === 'vet') {
        if (!fTitle.trim()) { showAlert('Enter the reason for visit'); setSaving(false); return; }
        await saveVetVisit(pet.id, { visit_date: date, reason: fTitle.trim(), vet_name: fNote.trim() || null, clinic_name: fClinic.trim() || null, diagnosis: fDiagnosis.trim() || null, notes: null });
      } else if (addType === 'mood') {
        setSaving(false); setAddType(null);
        if (activeLostAlert) { showAlert('Baby is lost', `Find ${pet?.name ?? 'your baby'} first.`); return; }
        router.push('/ai/mood-camera'); return;
      }
    } catch (err: any) { showAlert('Error', err.message ?? 'Something went wrong.'); setSaving(false); return; }
    setSaving(false); setAddType(null); setEditingEntry(null);
    invalidateJournalCache(pet.id);
    load(false, true);
  };

  const confirmDelete = useCallback((e: JournalEntry) => {
    showAlert('Delete entry?', TYPE_LABEL[e.type] + (e.title ? `: "${e.title.slice(0, 50)}"` : ''), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (pet?.id) {
          if (e.type === 'meal') usePetStoreRaw.setState(s => { const key = `${pet.id}:${typeof e.date === 'string' ? e.date.slice(0, 10) : localDateStr(e.date)}`; return { feedingLogs: { ...s.feedingLogs, [key]: (s.feedingLogs[key] ?? []).filter(f => f.id !== e.rawId) } }; });
          else if (e.type === 'mood') usePetStoreRaw.setState(s => ({ moodLogs: { ...s.moodLogs, [pet.id]: (s.moodLogs[pet.id] ?? []).filter(m => m.id !== e.rawId) } }));
          else if (e.type === 'grooming') usePetStoreRaw.setState(s => ({ groomingLogs: { ...s.groomingLogs, [pet.id]: (s.groomingLogs[pet.id] ?? []).filter(g => g.id !== e.rawId) } }));
          else if (e.type === 'checklist') usePetStoreRaw.setState(s => ({ checklist: { ...s.checklist, [pet.id]: (s.checklist[pet.id] ?? []).filter(i => i.id !== e.rawId) } }));
        }
        try {
          const table = DELETE_TABLE[e.type];
          if (table) await deleteJournalEntry(table, e.rawId);
          if (pet?.id) invalidateJournalCache(pet.id);
          load(false, true);
        } catch (err: any) { showAlert('Error', err?.message ?? 'Could not delete entry.'); }
      }},
    ]);
  }, [load, pet]);

  if (!pet) {
    return (
      <View style={[s.safe, { backgroundColor: colors.background }]}>
        <SafeAreaView edges={hideHeader ? [] : ['top']} style={hideHeader ? undefined : { backgroundColor: colors.background }} />
        <View style={s.center}>
          <Text style={{ fontSize: 52, marginBottom: 16 }}>📔</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No baby yet 🐾</Text>
          <Text style={[s.emptySub, { color: colors.textSecondary }]}>Add your first baby to start their story.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.safe, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={hideHeader ? [] : ['top']} style={hideHeader ? undefined : { backgroundColor: colors.background }}>
        {!hideHeader && (
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={[s.screenTitle, { color: colors.textPrimary }]}>Notes</Text>
              <Text style={[s.subtitle, { color: colors.textSecondary }]}>{pet.name} · {new Date().getFullYear()}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!isToday(selected) && (
                <TouchableOpacity style={[s.todayBtn, { borderColor: accentColor }]} onPress={() => selectDay(new Date())}>
                  <Text style={[s.todayBtnText, { color: accentColor }]}>Today</Text>
                </TouchableOpacity>
              )}
              <PetHeaderChip pet={pet as any} variant="chip" />
            </View>
          </View>
        )}
      </SafeAreaView>

      <WeekStrip
        weekStart={weekStart} selected={selected} entryMap={entryMap}
        typeColors={typeColors} accentColor={accentColor} colors={colors} s={s}
        hasMore={hasMore} entries={entries}
        onPrevWeek={() => { setWeekStart(addDays(weekStart, -7)); setSelected(addDays(selected, -7)); setCalMonth(addDays(selected, -7)); }}
        onNextWeek={() => { const next = addDays(weekStart, 7); const sel = addDays(selected, 7); const clamped = sel > new Date() ? new Date() : sel; setWeekStart(next); setSelected(clamped); setCalMonth(clamped); }}
        onSelectDay={(day) => { setSelected(day); setCalMonth(day); }}
        onOpenCalendar={() => { setCalMonth(selected); setShowCal(true); }}
        onLoadMore={loadMore}
      />

      {!isToday(selected) && (
        <TouchableOpacity style={[s.backTodayStrip, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '44' }]}
          onPress={() => selectDay(new Date())} activeOpacity={0.75}>
          <Ionicons name="arrow-back-outline" size={13} color={colors.warning} />
          <Text style={[s.backTodayText, { color: colors.warning }]}>Back to Today</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollViewRef} style={{ flex: 1 }}
        showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never"
        contentContainerStyle={{}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false, true); }} tintColor={colors.primary} colors={[colors.primary]} />}
        onScroll={e => setShowFab(e.nativeEvent.contentOffset.y > 200)}
        scrollEventThrottle={16}>
        <View style={{ paddingTop: 8 }}>
          <View style={s.dayHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.dayLabel, { color: colors.textPrimary }]}>
                {isToday(selected) ? 'Today' : format(selected, 'EEEE, MMMM d')}
              </Text>
              {!isToday(selected) && <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>{format(selected, 'yyyy')}</Text>}
            </View>
            <View style={[s.countBadge, { backgroundColor: `${accentColor}18` }]}>
              <Text style={[s.countText, { color: accentColor }]}>{entries.filter(e => e.date === dayKey).length}</Text>
            </View>
          </View>

          {entries.filter(e => e.date === dayKey).length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              {FILTER_OPTIONS.map(({ key, label, emoji }) => {
                const count = key === 'all' ? entries.filter(e => e.date === dayKey).length : entries.filter(e => e.date === dayKey && e.type === key).length;
                if (key !== 'all' && count === 0) return null;
                const active = filterType === key;
                return (
                  <TouchableOpacity key={key} onPress={() => setFilterType(key)} activeOpacity={0.7}
                    style={[s.filterChip, { backgroundColor: active ? accentColor : (colors.inputBg ?? colors.card), borderColor: active ? accentColor : colors.border }]}>
                    <Text style={[s.filterChipText, { color: active ? '#fff' : colors.textSecondary }]}>{emoji} {label} {count > 0 ? `(${count})` : ''}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
              <PawBondLoader size={52} isDark={isDark} />
            </View>
          ) : dayEntries.length === 0 ? (
            <View style={s.emptyState}>
              <LinearGradient colors={[`${accentColor}18`, `${accentColor}08`]} style={s.emptyIcon}>
                <TypeIcon type="note" color={accentColor} size={28} />
              </LinearGradient>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                {filterType !== 'all' ? `No ${TYPE_LABEL[filterType as EntryType]?.toLowerCase() ?? filterType} entries` : 'Nothing logged yet'}
              </Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>
                {isToday(selected) ? `Log a meal, mood, grooming or note for ${pet.name}.` : `No entries for ${format(selected, 'MMM d, yyyy')}.`}
              </Text>
              <TouchableOpacity style={[s.emptyAddBtn, { backgroundColor: accentColor }]} onPress={() => setShowTypePicker(true)}>
                <Ionicons name="add-outline" size={14} color="#fff" />
                <Text style={s.emptyAddBtnText}>Add entry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: 120 }}>
              {dayEntries.map(e => (
                <EntryCard key={e.id} entry={e} colors={colors} isDark={isDark} typeColors={typeColors}
                  onEdit={e.canEdit ? () => openEdit(e) : undefined}
                  onDelete={e.canDelete ? () => confirmDelete(e) : undefined} />
              ))}
            </View>
          )}

          {loadingMore && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 }}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Loading older entries…</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Animated.View style={[s.fab, { bottom: insets.bottom + 16, opacity: showFab ? 1 : (perms.canLogDailyCare ? 1 : 0.45) }]}>
        <TouchableOpacity style={[s.fabBtn, { backgroundColor: accentColor }]}
          onPress={() => {
            if (showFab) { scrollViewRef.current?.scrollTo({ y: 0, animated: true }); }
            else { if (!perms.canLogDailyCare) { showAlert('No permission', permissionDeniedMsg('add journal entries')); return; } setShowTypePicker(true); }
          }} activeOpacity={0.85}>
          {showFab ? <Ionicons name="chevron-up" size={24} color="#fff" /> : <Ionicons name="add" size={28} color="#fff" />}
        </TouchableOpacity>
      </Animated.View>

      <BottomSheet visible={showCal} onClose={() => setShowCal(false)} title="Pick a date">
        <FullMonthCalendar
          month={calMonth} selected={selected} entryMap={entryMap}
          accentColor={accentColor} colors={colors} typeColors={typeColors}
          onDayPress={selectDay}
          onPrevMonth={() => { const prev = subMonths(calMonth, 1); setCalMonth(prev); if (hasMore && entries.length > 0) { const oldest = entries[entries.length - 1].date; if (format(prev, 'yyyy-MM') <= oldest.slice(0, 7)) loadMore(); } }}
          onNextMonth={() => setCalMonth(m => { const next = addMonths(m, 1); return next <= new Date() ? next : m; })}
        />
      </BottomSheet>

      <BottomSheet visible={showTypePicker} onClose={() => setShowTypePicker(false)} title="What would you like to log?">
        <Text style={[s.sheetSub, { color: colors.textSecondary }]}>{pet.emoji} {pet.name} · {format(selected, 'EEE, MMM d')}</Text>
        <View style={s.typeGrid}>
          {ADD_TYPES.map(({ type, label, sub }) => {
            const tc = typeColors[type];
            return (
              <TouchableOpacity key={type} style={[s.typeCell, { backgroundColor: colors.card, borderColor: `${tc}28` }]} onPress={() => openAdd(type)}>
                <LinearGradient colors={[`${tc}22`, `${tc}0a`]} style={s.typeCellIcon}>
                  <TypeIcon type={type} color={tc} size={20} />
                </LinearGradient>
                <Text style={[s.typeCellLabel, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
                <Text style={[s.typeCellSub, { color: colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>

      <EntryFormSheet
        addType={addType} editingEntry={editingEntry} pet={pet} selected={selected}
        accentColor={accentColor} colors={colors} typeColors={typeColors} saving={saving} s={s}
        fTitle={fTitle} setFTitle={setFTitle}
        fMealType={fMealType} setFMealType={setFMealType}
        fAmount={fAmount} setFAmount={setFAmount}
        fGroomType={fGroomType} setFGroomType={setFGroomType}
        fNote={fNote} setFNote={setFNote}
        fWeight={fWeight} setFWeight={setFWeight}
        fClinic={fClinic} setFClinic={setFClinic}
        fDiagnosis={fDiagnosis} setFDiagnosis={setFDiagnosis}
        fPrivate={fPrivate} setFPrivate={setFPrivate}
        onClose={() => setAddType(null)}
        onSave={saveEntry}
        onDelete={(entry) => confirmDelete(entry)}
      />
    </View>
  );
}
