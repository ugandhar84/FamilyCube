import { showAlert } from '@/components/AppAlert';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Keyboard, Platform, Modal,
  TouchableWithoutFeedback, KeyboardAvoidingView, RefreshControl,
} from 'react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { SPACING, RADIUS, TYPO } from '@/constants/theme';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { getWeightLogs, logWeight, updateWeightLog, deleteWeightLog, type WeightLog } from '@/lib/db/weight';
import { supabase } from '@/lib/supabase';
import { usesImperial } from '@/lib/units';
import { format, parseISO, differenceInYears } from 'date-fns';
import PawBondLoader from '@/components/PawBondLoader';
import PetHeaderChip from '@/components/PetHeaderChip';
import CalendarFilter, { type DateFilter } from '@/components/CalendarFilter';
import { TrendChart } from '@/features/health/components/TrendChart';

function FieldLabel({ label, colors }: { label: string; colors: any }) {
  return <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary,
    marginBottom: 6, marginTop: 12 }}>{label}</Text>;
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function WeightsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { activePetId, activePet, petRoles } = usePetStore(useShallow(s => ({ activePetId: s.activePetId, activePet: s.activePet, petRoles: s.petRoles })));
  const pet = activePet();
  const accent = (pet as any)?.accent_color ?? colors.primary;
  const petAgeYrs = (pet as any)?.birthday ? differenceInYears(new Date(), parseISO((pet as any).birthday)) : null;
  const petAge = petAgeYrs != null ? `${petAgeYrs} yr${petAgeYrs !== 1 ? 's' : ''}` : null;
  const imperial = usesImperial();
  const perms = getPermissions(activePetId ? petRoles[activePetId] : 'owner');
  const unitLabel = imperial ? 'lb' : 'kg';

  const s = useMemo(() => makeStyles(colors), [colors]);

  const [weights,    setWeights]    = useState<WeightLog[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [calFilter,  setCalFilter]  = useState<DateFilter>(null);
  const [showSheet,  setShowSheet]  = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [editEntry,  setEditEntry]  = useState<WeightLog | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);

  // Sheet form state
  const [val,        setVal]        = useState('');
  const [unit,       setUnit]       = useState<'kg' | 'lb'>(imperial ? 'lb' : 'kg');
  const [notes,      setNotes]      = useState('');
  const [logDate,    setLogDate]    = useState(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTmp,  setPickerTmp]  = useState(new Date());
  const [saving,     setSaving]     = useState(false);

  const toDisplay = useCallback((kg: number) =>
    imperial ? +(kg * 2.20462).toFixed(1) : +kg.toFixed(2), [imperial]);

  const load = async (isRefresh = false) => {
    if (!activePetId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getWeightLogs(activePetId, 100);
      setWeights(data);
    } catch (e: any) {
      showAlert('Error', e.message);
    }
    if (isRefresh) setRefreshing(false); else setLoading(false);
  };

  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    load();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activePetId]));

  useEffect(() => {
    if (!activePetId) return;
    const ch = supabase.channel(`weights-rt-${activePetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_logs', filter: `pet_id=eq.${activePetId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activePetId]);

  const calDots = useMemo(() => [{
    dates: weights.map(w => w.logged_at.slice(0, 10)),
    color: '#0EA5E9',
    key: 'weight',
  }], [weights]);

  const filtered = useMemo(() => {
    let list = weights;
    if (search.trim()) list = list.filter(w => {
      const dateStr = (() => { try { return format(parseISO(w.logged_at), 'MMM d yyyy'); } catch { return ''; } })();
      return dateStr.toLowerCase().includes(search.toLowerCase()) ||
        (w.notes ?? '').toLowerCase().includes(search.toLowerCase()) ||
        String(toDisplay(w.weight_kg)).includes(search);
    });
    if (calFilter?.type === 'single') list = list.filter(w => w.logged_at.slice(0, 10) === calFilter.date);
    else if (calFilter?.type === 'range') list = list.filter(w => { const d = w.logged_at.slice(0, 10); return d >= calFilter.range.start && d <= calFilter.range.end; });
    return list;
  }, [weights, search, calFilter]);

  const openNew = () => {
    setEditEntry(null);
    setIsViewMode(false);
    setUnit(imperial ? 'lb' : 'kg');
    setVal('');
    setNotes('');
    setLogDate(new Date());
    setShowSheet(true);
  };

  const openEdit = (w: WeightLog) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('edit weight entries')); return; }
    setEditEntry(w);
    const u: 'kg' | 'lb' = imperial ? 'lb' : 'kg';
    setUnit(u);
    setVal(String(u === 'lb' ? +(w.weight_kg * 2.20462).toFixed(1) : +w.weight_kg.toFixed(2)));
    setNotes(w.notes ?? '');
    try { setLogDate(parseISO(w.logged_at)); } catch { setLogDate(new Date()); }
    setIsViewMode(false);
    setTimeout(() => setShowSheet(true), 0);
  };

  const handleSave = async () => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('log weight')); return; }
    const n = parseFloat(val.replace(',', '.'));
    if (!activePetId || isNaN(n) || n <= 0) {
      showAlert('Invalid weight', 'Enter a valid number greater than 0.');
      return;
    }
    // Sanity limits: 500 kg / 1102 lb covers the largest domestic animals
    const maxKg = unit === 'lb' ? 1102 : 500;
    if (n > maxKg) {
      showAlert('Invalid weight', `That seems too high — max is ${maxKg} ${unit}.`);
      return;
    }
    const kg = parseFloat((unit === 'lb' ? n / 2.20462 : n).toFixed(3));
    setSaving(true);
    try {
      if (editEntry) {
        await updateWeightLog(editEntry.id, kg, logDate.toISOString(), notes.trim() || null);
      } else {
        const userId = useAuthStore.getState().user?.id;
        await logWeight(activePetId, kg, userId ?? undefined, notes.trim() || null, logDate.toISOString());
      }
      setShowSheet(false);
      load();
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (w: WeightLog) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('delete weight entries')); return; }
    const dateStr = (() => { try { return format(parseISO(w.logged_at), 'MMM d, yyyy'); } catch { return ''; } })();
    showAlert(
      'Delete entry?',
      `${toDisplay(w.weight_kg)} ${unitLabel} · ${dateStr}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setWeights(prev => prev.filter(e => e.id !== w.id));
            try { await deleteWeightLog(w.id); }
            catch { showAlert('Error', 'Could not delete entry.'); load(); }
          },
        },
      ],
    );
  };

  const dismiss = () => { Keyboard.dismiss(); setShowSheet(false); setIsViewMode(true); };

  // Stats
  const latest    = weights[0];
  const oldest    = weights[weights.length - 1];
  const prevEntry = weights[1];
  // All-time: first logged → latest
  const deltaAll  = latest && oldest && weights.length > 1
    ? toDisplay(latest.weight_kg) - toDisplay(oldest.weight_kg) : null;
  // vs previous reading
  const deltaPrev = latest && prevEntry
    ? toDisplay(latest.weight_kg) - toDisplay(prevEntry.weight_kg) : null;
  const delta = deltaAll; // used in summary stat box

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View>
            <Text style={s.title}>Weight Log</Text>
            {pet && <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: accent, marginTop: 1 }} numberOfLines={1}>{(pet as any).emoji ?? '🐾'}  {pet.name}{petAge ? `  ·  ${petAge}` : ''}</Text>}
          </View>
          {pet && <PetHeaderChip pet={pet as any} variant="badge" />}
        </View>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={15} color={colors.textTertiary} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by date or notes…"
            placeholderTextColor={colors.placeholder}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <CalendarFilter dots={calDots} filter={calFilter} onFilter={setCalFilter} />

      {loading ? (
        <View style={s.loadingWrap}><PawBondLoader size={56} /></View>
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ paddingBottom: insets.bottom + 96 }} onScroll={e => setShowScrollTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={accent} colors={[accent]} />}>

          {/* Summary stats */}
          {weights.length >= 2 && !search.trim() && (
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={[s.statVal, { color: colors.textPrimary }]}>
                  {toDisplay(latest.weight_kg)} {unitLabel}
                </Text>
                <Text style={s.statKey}>Current</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.border }]} />
              <View style={s.statBox}>
                <Text style={[s.statVal, { color: deltaPrev == null ? colors.textPrimary : deltaPrev > 0 ? '#0F6E56' : '#DC2626' }]}>
                  {deltaPrev == null ? '—' : `${deltaPrev > 0 ? '+' : ''}${deltaPrev.toFixed(1)} ${unitLabel}`}
                </Text>
                <Text style={s.statKey}>vs Last</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.border }]} />
              <View style={s.statBox}>
                <Text style={[s.statVal, { color: delta == null ? colors.textPrimary : delta > 0 ? '#0F6E56' : '#DC2626' }]}>
                  {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${unitLabel}`}
                </Text>
                <Text style={s.statKey}>All-time</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.border }]} />
              <View style={s.statBox}>
                <Text style={[s.statVal, { color: colors.textPrimary }]}>{weights.length}</Text>
                <Text style={s.statKey}>Entries</Text>
              </View>
            </View>
          )}

          {/* Trend chart */}
          {weights.length >= 2 && !search.trim() && (
            <TrendChart weights={weights} accent={colors.primary} colors={colors} />
          )}

          {/* List */}
          {filtered.length > 0 ? (
            <>
              <Text style={s.sectionLabel}>
                {search.trim() ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : `All entries (${weights.length})`}
              </Text>
              {filtered.map((w, i) => {
                const prev = filtered[i + 1];
                const delta = prev ? toDisplay(w.weight_kg) - toDisplay(prev.weight_kg) : null;
                const dateStr = (() => { try { return format(parseISO(w.logged_at), 'EEE, MMM d yyyy'); } catch { return ''; } })();
                const isLatest = i === 0 && !search.trim();
                return (
                  <TouchableOpacity key={w.id} style={s.card} onPress={() => openEdit(w)}>
                    {/* Left: date block */}
                    <View style={s.dateBlock}>
                      <Text style={[s.dateDay, { color: colors.primaryText ?? colors.primary }]}>
                        {(() => { try { return format(parseISO(w.logged_at), 'd'); } catch { return '—'; } })()}
                      </Text>
                      <Text style={[s.dateMon, { color: colors.primaryText ?? colors.primary }]}>
                        {(() => { try { return format(parseISO(w.logged_at), 'MMM').toUpperCase(); } catch { return ''; } })()}
                      </Text>
                    </View>
                    <View style={[s.cardDivider, { backgroundColor: colors.primary + '30' }]} />

                    {/* Middle: value + meta */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={[s.weightVal, { color: colors.textPrimary }]}>
                          {toDisplay(w.weight_kg)} {unitLabel}
                        </Text>
                        {isLatest && (
                          <View style={[s.badge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
                            <Text style={[s.badgeText, { color: colors.primaryText ?? colors.primary }]}>LATEST</Text>
                          </View>
                        )}
                        {delta !== null && (
                          <View style={[s.badge, {
                            backgroundColor: delta > 0 ? colors.successLight : colors.dangerLight,
                            borderColor: delta > 0 ? colors.success : colors.danger,
                          }]}>
                            <Ionicons
                              name={delta > 0 ? 'trending-up' : 'trending-down'}
                              size={10} color={delta > 0 ? colors.success : colors.danger} />
                            <Text style={[s.badgeText, { color: delta > 0 ? colors.success : colors.danger }]}>
                              {delta > 0 ? '+' : ''}{delta.toFixed(1)} {unitLabel}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.dateStr}>{dateStr}</Text>
                      {w.notes ? <Text style={s.notesTxt} numberOfLines={1}>{w.notes}</Text> : null}
                    </View>

                    {/* Actions */}
                    {perms.canLogHealth && (
                      <>
                        <TouchableOpacity onPress={() => openEdit(w)} style={s.iconBtn}>
                          <Ionicons name="pencil-outline" size={15} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(w)} style={[s.iconBtn, { backgroundColor: colors.dangerLight }]}>
                          <Ionicons name="trash-outline" size={15} color={colors.danger} />
                        </TouchableOpacity>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          ) : (
            <View style={s.emptyWrap}>
              <Text style={s.emptyEmoji}>⚖️</Text>
              <Text style={s.emptyTitle}>{search.trim() ? 'No results' : 'No weight logs yet'}</Text>
              <Text style={s.emptySub}>
                {search.trim()
                  ? 'Try a different date or note.'
                  : 'Tap + Log to record your first weight entry.'}
              </Text>
              {!search.trim() && perms.canLogHealth && (
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: colors.primary }]} onPress={openNew}>
                  <Text style={s.emptyBtnText}>Log first weight</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Weight sheet ──────────────────────────────────────────────────────── */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}>

          {/* Tap-to-dismiss backdrop */}
          <TouchableWithoutFeedback onPress={dismiss}>
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' }} />
          </TouchableWithoutFeedback>

          {/* Sheet panel */}
          {showSheet && <View style={[s.sheet, { backgroundColor: colors.surface }]}>

              {/* Handle */}
              <View style={{ alignItems: 'center', marginBottom: 14 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>

              {/* Sheet header */}
              <View style={s.sheetHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10,
                    backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="scale-outline" size={16} color={colors.primaryText ?? colors.primary} />
                  </View>
                  <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>
                    {isViewMode && editEntry ? 'Weight entry' : editEntry ? 'Edit Weight' : 'Log Weight'}
                  </Text>
                </View>
                <TouchableOpacity onPress={dismiss}
                  style={{ width: 32, height: 32, borderRadius: 16,
                    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {isViewMode && editEntry ? (
                <>
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                    <View style={s.viewRow}>
                      <Text style={s.viewLabel}>Weight</Text>
                      <Text style={[s.viewValue, { color: colors.textPrimary }]}>{val} {unit}</Text>
                    </View>
                    <View style={s.viewRow}>
                      <Text style={s.viewLabel}>Date</Text>
                      <Text style={[s.viewValue, { color: colors.textPrimary }]}>{format(logDate, 'MMMM d, yyyy')}</Text>
                    </View>
                    {notes ? (
                      <View style={s.viewRow}>
                        <Text style={s.viewLabel}>Notes</Text>
                        <Text style={[s.viewValue, { color: colors.textPrimary }]}>{notes}</Text>
                      </View>
                    ) : null}
                  </ScrollView>
                  <View style={s.footer}>
                    <TouchableOpacity style={s.cancelBtn} onPress={dismiss}>
                      <Text style={s.cancelText}>Close</Text>
                    </TouchableOpacity>
                    {perms.canLogHealth && editEntry && (
                      <TouchableOpacity
                        style={[s.cancelBtn, { borderColor: colors.danger ?? '#E53935', flex: 0.7 }]}
                        onPress={() => { dismiss(); handleDelete(editEntry); }}>
                        <Ionicons name="trash-outline" size={16} color={colors.danger ?? '#E53935'} />
                      </TouchableOpacity>
                    )}
                    {perms.canLogHealth && (
                      <TouchableOpacity
                        style={[s.saveBtn, { backgroundColor: colors.primary, flexDirection: 'row', gap: 6 }]}
                        onPress={() => setIsViewMode(false)}>
                        <Ionicons name="pencil" size={15} color="#fff" />
                        <Text style={s.saveBtnText}>Edit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 8 }}>

                    {/* Unit toggle */}
                    <FieldLabel label="Unit" colors={colors} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['kg', 'lb'] as const).map(u => {
                        const sel = unit === u;
                        return (
                          <TouchableOpacity key={u} onPress={() => {
                            const n = parseFloat(val.replace(',', '.'));
                            if (!isNaN(n) && n > 0) {
                              setVal(String(u === 'lb' ? +(n * 2.20462).toFixed(1) : +(n / 2.20462).toFixed(2)));
                            }
                            setUnit(u);
                          }}
                            style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5,
                              borderColor: sel ? colors.primary : colors.border,
                              backgroundColor: sel ? colors.primary + '12' : colors.inputBg,
                              alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: TYPO.body, fontWeight: '700',
                              color: sel ? colors.primary : colors.textSecondary }}>
                              {u.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Weight input */}
                    <FieldLabel label="Weight *" colors={colors} />
                    <TextInput
                      style={[s.input, { height: 72, fontSize: 36, textAlign: 'center',
                        fontWeight: '800', color: colors.textPrimary,
                        backgroundColor: colors.inputBg, borderColor: colors.border }]}
                      placeholder="0.0"
                      placeholderTextColor={colors.placeholder}
                      keyboardType="decimal-pad"
                      value={val}
                      onChangeText={setVal}
                      returnKeyType="done"
                    />
                    <Text style={{ textAlign: 'center', color: colors.textSecondary, fontSize: TYPO.body, marginTop: 4 }}>
                      {unit === 'lb' ? 'pounds (lb)' : 'kilograms (kg)'}
                    </Text>

                    {/* Date */}
                    <FieldLabel label="Date" colors={colors} />
                    <TouchableOpacity
                      style={[s.input, s.dateBtn]}
                      onPress={() => { setPickerTmp(logDate); setPickerOpen(v => !v); }}>
                      <Ionicons name="calendar-outline" size={14} color={colors.primaryText ?? colors.primary} />
                      <Text style={[s.dateBtnText, { color: colors.textPrimary }]}>
                        {format(logDate, 'MMMM d, yyyy')}
                      </Text>
                    </TouchableOpacity>
                    <AppDateTimePicker
                      visible={pickerOpen}
                      value={pickerTmp}
                      mode="date"
                      maximumDate={new Date()}
                      accent={accent}
                      onCancel={() => setPickerOpen(false)}
                      onConfirm={(d) => { setLogDate(d); setPickerOpen(false); }}
                    />

                    {/* Notes */}
                    <FieldLabel label="Notes (optional)" colors={colors} />
                    <TextInput
                      style={[s.input, s.textarea, { color: colors.textPrimary,
                        backgroundColor: colors.inputBg, borderColor: colors.border }]}
                      multiline
                      placeholder="e.g. after vet visit, fasted weight…"
                      placeholderTextColor={colors.placeholder}
                      value={notes}
                      onChangeText={setNotes}
                    />

                  </ScrollView>

                  {/* Footer buttons */}
                  <View style={s.footer}>
                    <TouchableOpacity style={s.cancelBtn} onPress={() => editEntry ? setIsViewMode(true) : dismiss()}>
                      <Text style={s.cancelText}>{editEntry ? 'Back' : 'Cancel'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.saveBtn, { backgroundColor: colors.primary,
                        opacity: saving || !val.trim() ? 0.5 : 1 }]}
                      onPress={handleSave}
                      disabled={saving || !val.trim()}>
                      {saving
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={s.saveBtnText}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}

            </View>}
        </KeyboardAvoidingView>
      </Modal>

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
  safe:        { flex: 1, backgroundColor: colors.background },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg },
  backBtn:     { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  fab:         { position: 'absolute', bottom: 16, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  title:       { fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary },
  addBtn:      { paddingHorizontal: SPACING.md, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: RADIUS.md },
  addBtnText:  { fontSize: TYPO.body, fontWeight: '600', color: '#fff' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  searchWrap:  { paddingHorizontal: SPACING.xl, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inputBg ?? '#F1F1F1', borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, fontSize: TYPO.body, color: colors.textPrimary },

  statsRow:    { flexDirection: 'row', marginHorizontal: SPACING.xl, marginTop: SPACING.lg, marginBottom: SPACING.md, backgroundColor: colors.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  statBox:     { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  statDivider: { width: StyleSheet.hairlineWidth },
  statVal:     { fontSize: TYPO.body, fontWeight: '800' },
  statKey:     { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, marginTop: 3, textAlign: 'center' },

  sectionLabel: { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm, marginTop: SPACING.md },

  card:        { marginHorizontal: SPACING.xl, backgroundColor: colors.card, borderRadius: RADIUS.lg, padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dateBlock:   { alignItems: 'center', width: 32 },
  dateDay:     { fontSize: TYPO.heading, fontWeight: '800', lineHeight: 22 },
  dateMon:     { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5 },
  cardDivider: { width: 1.5, height: 36, borderRadius: 1, marginHorizontal: 2 },
  weightVal:   { fontSize: TYPO.subheading, fontWeight: '700' },
  dateStr:     { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 },
  notesTxt:    { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:   { fontSize: TYPO.body, fontWeight: '700' },
  iconBtn:     { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },

  emptyWrap:   { alignItems: 'center', paddingTop: 80, paddingHorizontal: SPACING.xl, gap: 12 },
  emptyEmoji:  { fontSize: 56 },
  emptyTitle:  { fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary },
  emptySub:    { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  emptyBtn:    { marginTop: 8, paddingHorizontal: SPACING.xl, paddingVertical: 14, borderRadius: RADIUS.lg },
  emptyBtnText:{ color: '#fff', fontSize: TYPO.body, fontWeight: '600' },

  // Sheet
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 24, maxHeight: '92%' },
  sheetHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle:  { fontSize: TYPO.heading, fontWeight: '800' },
  input:       { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: TYPO.body, color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.border },
  textarea:    { height: 70, paddingTop: 12, textAlignVertical: 'top' },
  dateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtnText: { fontSize: TYPO.body, flex: 1 },
  footer:      { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 4 },
  cancelBtn:   { flex: 1, height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancelText:  { fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' },
  saveBtn:     { flex: 2, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: TYPO.body, fontWeight: '700' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  pickerHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  viewRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  viewLabel: { fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  viewValue: { fontSize: TYPO.body, color: colors.textPrimary, fontWeight: '500' },
});
