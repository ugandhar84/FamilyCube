import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { getPermissions } from '@/lib/permissions';
import {
  format, parseISO, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear,
  getYear, getDaysInMonth, getDate, isToday, isYesterday,
} from 'date-fns';
import {
  getExpenses, deleteExpense, saveExpense,
  EXPENSE_CATEGORY_CONFIG, EXPENSE_CATEGORIES,
  type PetExpense, type ExpenseCategory,
} from '@/lib/db/expenses';
import { useFocusEffect, router } from 'expo-router';
import { s } from '@/features/health/components/expensesStyles';
import { BLANK, type FormState } from '@/features/health/components/expensesUtils';
import PaywallModal from '@/features/health/components/PaywallModal';
import ReceiptReviewSheet from '@/features/health/components/ReceiptReviewSheet';
import ExpenseFormSheet from '@/features/health/components/ExpenseFormSheet';
import { useReceiptScanner } from '@/features/health/components/useReceiptScanner';
import { TYPO } from '@/constants/theme';

const SPARK_H = 48;

// ── Cumulative sparkline ────────────────────────────────────────────────────
function Sparkline({ entries, monthStart, monthOffset, width }: {
  entries: PetExpense[]; monthStart: Date; monthOffset: number; width: number;
}) {
  const pts = useMemo(() => {
    const totalDays = getDaysInMonth(monthStart);
    const today = monthOffset === 0 ? new Date().getDate() : totalDays;
    const byDay = Array(totalDays + 2).fill(0);
    for (const e of entries) {
      const d = getDate(parseISO(e.expense_date));
      if (d >= 1 && d <= totalDays) byDay[d] += Number(e.amount);
    }
    const cum: number[] = [];
    let running = 0;
    for (let d = 1; d <= today; d++) { running += byDay[d]; cum.push(running); }
    return cum;
  }, [entries, monthStart, monthOffset]);

  if (pts.length < 2) return null;
  const max = Math.max(...pts, 1);
  const W = width;
  const coords = pts.map((v, i) => ({
    x: (i / (pts.length - 1)) * W,
    y: SPARK_H - 4 - ((v / max) * (SPARK_H - 8)),
  }));
  const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <Svg width={W} height={SPARK_H} style={{ marginTop: 16 }}>
      <Path d={line} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* dot at end */}
      <Circle cx={coords[coords.length-1].x} cy={coords[coords.length-1].y} r={4} fill="#fff" />
    </Svg>
  );
}

// ── Day header label ────────────────────────────────────────────────────────
function dayHeader(dateStr: string) {
  const d = parseISO(dateStr);
  const dayPart = format(d, 'MMM d').toUpperCase();
  if (isToday(d))     return `TODAY · ${dayPart}`;
  if (isYesterday(d)) return `YESTERDAY · ${dayPart}`;
  return `${format(d, 'EEE').toUpperCase()} · ${dayPart}`;
}

// ── Main screen ─────────────────────────────────────────────────────────────
export default function ExpensesScreen() {
  const { colors } = useTheme();
  const { activePetId, pets, petRoles } = usePetStore(useShallow(s => ({
    activePetId: s.activePetId, pets: s.pets, petRoles: s.petRoles,
  })));
  const activePet = pets.find(p => p.id === activePetId);
  const accent = (activePet as any)?.accent_color ?? '#6C63FF';
  const heroColor = '#6C63FF'; // violet — matches hero card, used for "All" selections
  const insets = useSafeAreaInsets();

  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [addForPetId, setAddForPetId]     = useState<string | null>(activePetId ?? null);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const perms = getPermissions(
    (selectedPetId ?? activePetId) ? petRoles[(selectedPetId ?? activePetId)!] : 'owner',
  );

  const [expenses, setExpenses]   = useState<PetExpense[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal]         = useState(false);
  const [form, setForm]           = useState<FormState>(BLANK);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [yearOffset, setYearOffset] = useState(0);
  const [scrolledDown, setScrolledDown] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const petIds = pets.map(p => p.id);

  const monthStart = startOfMonth(subMonths(new Date(), monthOffset));
  const monthEnd   = endOfMonth(monthStart);
  const monthLabel = format(monthStart, 'MMMM yyyy');
  const cfg = EXPENSE_CATEGORY_CONFIG;

  const selectedYear = new Date().getFullYear() - yearOffset;
  const yearStart = startOfYear(new Date(selectedYear, 0, 1));
  const yearEnd   = endOfYear(new Date(selectedYear, 0, 1));

  // Fetch exactly the date range the user is viewing — DB query per navigation
  const load = useCallback(async (silent = false) => {
    if (petIds.length === 0) return;
    if (silent) setRefreshing(true);
    try {
      const from = viewMode === 'year'
        ? format(yearStart, 'yyyy-MM-dd')
        : format(monthStart, 'yyyy-MM-dd');
      const to = viewMode === 'year'
        ? format(yearEnd, 'yyyy-MM-dd')
        : format(monthEnd, 'yyyy-MM-dd');
      setExpenses(await getExpenses(petIds, from, to));
    }
    catch (e: any) { showAlert('Error', e.message ?? 'Could not load expenses.'); }
    finally { setRefreshing(false); }
  }, [petIds.join(','), viewMode, monthOffset, yearOffset]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const {
    scanLoading, showReview, setShowReview, scannedItems, setScannedItems,
    scanMerchant, scanDate, savingAll, showPaywall, setShowPaywall,
    openScanPicker, saveAllScanned,
  } = useReceiptScanner({ selectedPetId, activePetId, pets: pets as any[], onSaved: load });

  const yearExpenses = useMemo(() =>
    expenses.filter(e => !selectedPetId || e.pet_id === selectedPetId),
    [expenses, selectedPetId],
  );
  const yearTotal = useMemo(() =>
    yearExpenses.reduce((s, e) => s + Number(e.amount), 0), [yearExpenses]);

  const ytdStart = startOfYear(new Date());
  const ytdExpenses = useMemo(() =>
    expenses.filter(e => {
      const d = parseISO(e.expense_date);
      return d >= ytdStart && d <= new Date() && (!selectedPetId || e.pet_id === selectedPetId);
    }),
    [expenses, selectedPetId],
  );
  const ytdTotal = useMemo(() =>
    ytdExpenses.reduce((s, e) => s + Number(e.amount), 0), [ytdExpenses]);

  const monthExpenses = useMemo(() =>
    expenses.filter(e => !selectedPetId || e.pet_id === selectedPetId),
    [expenses, selectedPetId],
  );

  // activeExpenses drives all sections — switches between month and year view
  const activeExpenses = viewMode === 'year' ? yearExpenses : monthExpenses;

  const categoryTotals = useMemo(() => {
    const map: Partial<Record<ExpenseCategory, number>> = {};
    for (const e of activeExpenses) map[e.category] = (map[e.category] ?? 0) + Number(e.amount);
    return map;
  }, [activeExpenses]);

  const monthTotal = useMemo(() =>
    monthExpenses.reduce((s, e) => s + Number(e.amount), 0), [monthExpenses]);

  const sortedCategories = useMemo(() =>
    EXPENSE_CATEGORIES
      .map(cat => ({ cat, amount: categoryTotals[cat] ?? 0 }))
      .filter(x => x.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    [categoryTotals],
  );
  const catMax = sortedCategories[0]?.amount ?? 1;

  // All categories including $0 ones, sorted by amount desc
  const allCategoriesWithZero = useMemo(() =>
    EXPENSE_CATEGORIES
      .map(cat => ({ cat, amount: categoryTotals[cat] ?? 0 }))
      .sort((a, b) => b.amount - a.amount),
    [categoryTotals],
  );
  const visibleCats = showAllCats ? allCategoriesWithZero : allCategoriesWithZero.filter(x => x.amount > 0).slice(0, 4);

  const prevMonthTotal = useMemo(() => {
    const prev = startOfMonth(subMonths(new Date(), monthOffset + 1));
    const prevEnd = endOfMonth(prev);
    return expenses
      .filter(e => (!selectedPetId || e.pet_id === selectedPetId))
      .filter(e => { const d = parseISO(e.expense_date); return d >= prev && d <= prevEnd; })
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [expenses, monthOffset, selectedPetId]);

  const monthlyAvg = useMemo(() => {
    const monthly: number[] = [];
    for (let i = 5; i >= 1; i--) {
      const b = startOfMonth(subMonths(new Date(), i));
      const be = endOfMonth(b);
      const t = expenses
        .filter(e => (!selectedPetId || e.pet_id === selectedPetId))
        .filter(e => { const d = parseISO(e.expense_date); return d >= b && d <= be; })
        .reduce((s, e) => s + Number(e.amount), 0);
      if (t > 0) monthly.push(t);
    }
    return monthly.length ? monthly.reduce((a, b) => a + b, 0) / monthly.length : 0;
  }, [expenses, monthOffset, selectedPetId]);

  const pctVsPrev = prevMonthTotal > 0
    ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100
    : null;

  const prevYearExpenses = useMemo(() => {
    const py = selectedYear - 1;
    const pyStart = startOfYear(new Date(py, 0, 1));
    const pyEnd   = endOfYear(new Date(py, 0, 1));
    return expenses.filter(e => {
      const d = parseISO(e.expense_date);
      return d >= pyStart && d <= pyEnd && (!selectedPetId || e.pet_id === selectedPetId);
    });
  }, [expenses, yearOffset, selectedPetId]);
  const prevYearTotal = useMemo(() =>
    prevYearExpenses.reduce((s, e) => s + Number(e.amount), 0), [prevYearExpenses]);
  const pctVsPrevYear = prevYearTotal > 0
    ? ((yearTotal - prevYearTotal) / prevYearTotal) * 100
    : null;

  // All-pet totals for By Pet section — all pets shown, even $0
  const petTotals = useMemo(() => {
    if (pets.length <= 1) return null;
    const allTotal = activeExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const map: Record<string, number> = {};
    for (const p of pets) map[p.id] = 0;
    for (const e of activeExpenses) map[e.pet_id] = (map[e.pet_id] ?? 0) + Number(e.amount);
    return { map, allTotal };
  }, [activeExpenses, pets]);

  const visibleEntries = useMemo(() =>
    selectedCategory ? activeExpenses.filter(e => e.category === selectedCategory) : activeExpenses,
    [activeExpenses, selectedCategory],
  );

  const dayGroups = useMemo(() => {
    const map = new Map<string, PetExpense[]>();
    [...visibleEntries]
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
      .forEach(e => {
        const key = e.expense_date.slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(e);
      });
    return [...map.entries()];
  }, [visibleEntries]);

  const openAdd = (cat?: ExpenseCategory) => {
    const pid = selectedPetId ?? activePetId ?? pets[0]?.id;
    setAddForPetId(pid ?? null);
    setForm({ ...BLANK, category: cat ?? 'food', expense_date: format(new Date(), 'yyyy-MM-dd') });
    setModal(true);
  };
  const openEdit = (e: PetExpense) => {
    setAddForPetId(e.pet_id);
    setForm({ id: e.id, category: e.category, amount: String(e.amount), expense_date: e.expense_date, title: e.title ?? '', notes: e.notes ?? '' });
    setModal(true);
  };
  const save = async () => {
    if (!addForPetId) return;
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) { showAlert('Amount required', 'Enter a valid amount.'); return; }
    setSaving(true);
    try {
      await saveExpense(addForPetId, {
        category: form.category, amount: amt, expense_date: form.expense_date,
        title: form.title.trim() || null, notes: form.notes.trim() || null,
      }, form.id);
      setModal(false); load();
    } catch (e: any) { showAlert('Error', e.message ?? 'Could not save.'); }
    finally { setSaving(false); }
  };
  const remove = (id: string, label: string) =>
    showAlert(`Delete ${label}?`, 'This expense will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteExpense(id); load(); } catch (e: any) { showAlert('Error', e.message); }
      }},
    ]);
  const petForEntry = (pid: string) => pets.find(p => p.id === pid);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── NAV ── */}
      <View style={{ paddingTop: insets.top, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 52, gap: 0 }}>
          <TouchableOpacity onPress={() => router.back()}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 }}>
            Expenses
          </Text>
          <TouchableOpacity onPress={openScanPicker} disabled={scanLoading}
            style={{ marginRight: 8, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            {scanLoading
              ? <ActivityIndicator size="small" color={accent} />
              : <Ionicons name="scan-outline" size={17} color={colors.textSecondary} />}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentContainerStyle={{ paddingBottom: 120 }}
        onScroll={e => setScrolledDown(e.nativeEvent.contentOffset.y > 200)}
        scrollEventThrottle={100}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={accent} colors={[accent]} />}
      >
        {/* ── VIEW MODE TOGGLE + PERIOD SELECTOR ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 12 }}>
          {/* Month / Year toggle pills */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 3, alignSelf: 'center',
            borderWidth: 1, borderColor: colors.border }}>
            {(['month', 'year'] as const).map(mode => (
              <TouchableOpacity key={mode} onPress={() => setViewMode(mode)}
                style={{ paddingHorizontal: 24, paddingVertical: 7, borderRadius: 10,
                  backgroundColor: viewMode === mode ? accent : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: '700',
                  color: viewMode === mode ? '#fff' : colors.textSecondary }}>
                  {mode === 'month' ? 'Month' : 'Year'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Period navigator */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            {viewMode === 'month' ? (
              <>
                <TouchableOpacity onPress={() => setMonthOffset(o => o + 1)}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, minWidth: 160, textAlign: 'center', letterSpacing: -0.3 }}>
                  {monthLabel}
                </Text>
                <TouchableOpacity onPress={() => setMonthOffset(o => Math.max(0, o - 1))}
                  disabled={monthOffset === 0}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: monthOffset === 0 ? 0.3 : 1 }}>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => setYearOffset(o => o + 1)}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, minWidth: 160, textAlign: 'center', letterSpacing: -0.3 }}>
                  {selectedYear}
                </Text>
                <TouchableOpacity onPress={() => setYearOffset(o => Math.max(0, o - 1))}
                  disabled={yearOffset === 0}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: yearOffset === 0 ? 0.3 : 1 }}>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* ── HERO CARD ── */}
        <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
          <LinearGradient
            colors={['#6C63FF', '#9B5DE5', '#7B52CC']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, padding: 22, overflow: 'hidden', minHeight: 200 }}
          >
            {/* Decorative circles */}
            <View style={{ position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <View style={{ position: 'absolute', right: 40, bottom: -40, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)' }} />

            {viewMode === 'month' ? (
              <>
                <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                  TOTAL SPENT · {monthLabel.toUpperCase()}
                </Text>
                <Text style={{ fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: -2, lineHeight: 52, marginBottom: 4 }}>
                  ${monthTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
                  {monthExpenses.length > 0
                    ? (() => {
                        const petCount = !selectedPetId && pets.length > 1 ? `across ${pets.length} pets · ` : '';
                        return `${petCount}${monthExpenses.length} ${monthExpenses.length === 1 ? 'entry' : 'entries'}`;
                      })()
                    : 'No expenses logged yet'}
                </Text>
                {/* Month stats row */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                      ${prevMonthTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Last month</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                      ${monthlyAvg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Avg/mo</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                      ${ytdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>YTD {new Date().getFullYear()}</Text>
                  </View>
                  {pctVsPrev !== null && (
                    <View>
                      <View style={{ backgroundColor: pctVsPrev > 0 ? 'rgba(255,100,100,0.3)' : 'rgba(100,255,150,0.25)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                          {pctVsPrev > 0 ? '↑' : '↓'} {Math.abs(pctVsPrev).toFixed(1)}%
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>vs last mo</Text>
                    </View>
                  )}
                </View>
                {monthExpenses.length >= 2 && (
                  <Sparkline entries={monthExpenses} monthStart={monthStart} monthOffset={monthOffset} width={280} />
                )}
              </>
            ) : (
              <>
                <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                  TOTAL SPENT · {selectedYear}
                </Text>
                <Text style={{ fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: -2, lineHeight: 52, marginBottom: 4 }}>
                  ${yearTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
                  {yearExpenses.length > 0
                    ? (() => {
                        const petCount = !selectedPetId && pets.length > 1 ? `across ${pets.length} pets · ` : '';
                        return `${petCount}${yearExpenses.length} ${yearExpenses.length === 1 ? 'entry' : 'entries'}`;
                      })()
                    : 'No expenses this year'}
                </Text>
                {/* Year stats row */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                      ${prevYearTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{selectedYear - 1}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                      ${yearExpenses.length > 0 ? (yearTotal / 12).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Avg/mo</Text>
                  </View>
                  {pctVsPrevYear !== null && (
                    <View>
                      <View style={{ backgroundColor: pctVsPrevYear > 0 ? 'rgba(255,100,100,0.3)' : 'rgba(100,255,150,0.25)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                          {pctVsPrevYear > 0 ? '↑' : '↓'} {Math.abs(pctVsPrevYear).toFixed(1)}%
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>vs {selectedYear - 1}</Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </LinearGradient>
        </View>

        {/* ── TOP 3 MINI STATS ── */}
        {sortedCategories.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 24 }}>
            {sortedCategories.slice(0, 3).map(({ cat, amount }) => {
              const c = cfg[cat];
              const active = selectedCategory === cat;
              return (
                <TouchableOpacity key={cat} onPress={() => setSelectedCategory(active ? null : cat)}
                  style={{ minWidth: 100, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5,
                    borderColor: active ? c.color : colors.border,
                    padding: 14, alignItems: 'flex-start',
                    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: c.color, marginBottom: 6, letterSpacing: -0.5 }}>
                    ${amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : amount.toFixed(0)}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                    {c.emoji} {c.label.length > 6 ? c.label.slice(0, 5) + '…' : c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── BY CATEGORY ── */}
        {sortedCategories.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
              <Text style={[s.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>BY CATEGORY</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {selectedCategory && (
                  <TouchableOpacity onPress={() => setSelectedCategory(null)}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: accent }}>Clear ✕</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowAllCats(v => !v)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: accent }}>
                    {showAllCats ? 'See less' : 'See all'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              {visibleCats.map(({ cat, amount }, i) => {
                const c = cfg[cat];
                const active = selectedCategory === cat;
                const dimmed = amount === 0;
                return (
                  <TouchableOpacity key={cat} onPress={() => amount > 0 ? setSelectedCategory(active ? null : cat) : null} activeOpacity={dimmed ? 1 : 0.8}
                    style={{ marginBottom: i < visibleCats.length - 1 ? 14 : 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 16, opacity: dimmed ? 0.4 : 1 }}>{c.emoji}</Text>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: active ? c.color : dimmed ? colors.textSecondary : colors.textPrimary }}>
                          {c.label}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: dimmed ? colors.textSecondary : c.color, opacity: dimmed ? 0.4 : 1 }}>
                        ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border }}>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: dimmed ? colors.border : c.color,
                        width: dimmed ? '0%' as any : `${(amount / catMax) * 100}%` as any,
                        opacity: selectedCategory && !active ? 0.3 : 1 }} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── BY PET ── */}
        {petTotals && (
          <View style={{ marginBottom: 24 }}>
            <Text style={[s.sectionLabel, { color: colors.textSecondary, paddingHorizontal: 16, marginBottom: 12 }]}>BY PET</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {/* All pets chip */}
              <TouchableOpacity onPress={() => setSelectedPetId(null)}
                style={{ alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 18, borderWidth: 2,
                  borderColor: !selectedPetId ? heroColor : colors.border,
                  width: 90, paddingVertical: 14, gap: 6,
                  shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <Text style={{ fontSize: 32 }}>{pets[0]?.emoji ?? '🐾'}</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>All pets</Text>
                <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary }}>
                  ${petTotals.allTotal.toFixed(0)}
                </Text>
              </TouchableOpacity>
              {Object.entries(petTotals.map).sort((a, b) => b[1] - a[1]).map(([pid, total]) => {
                const p = petForEntry(pid); if (!p) return null;
                const pa = p.accent_color ?? accent;
                const sel = selectedPetId === pid;
                return (
                  <TouchableOpacity key={pid} onPress={() => setSelectedPetId(sel ? null : pid)}
                    style={{ alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 18, borderWidth: 2,
                      borderColor: sel ? pa : colors.border,
                      width: 90, paddingVertical: 14, gap: 6,
                      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                    {p.avatar_url
                      ? <Image source={{ uri: p.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} cachePolicy="memory-disk" />
                      : <Text style={{ fontSize: 32 }}>{p.emoji ?? '🐾'}</Text>}
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>{p.name}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary }}>
                      ${total.toFixed(0)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── FILTER CHIPS ── */}
        {sortedCategories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 20 }}
            style={{ marginBottom: 4 }}>
            <TouchableOpacity onPress={() => setSelectedCategory(null)}
              style={{ paddingHorizontal: 18, paddingVertical: 8, borderRadius: 22,
                backgroundColor: !selectedCategory ? heroColor : colors.card,
                borderWidth: 1.5, borderColor: !selectedCategory ? heroColor : colors.border }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: !selectedCategory ? '#fff' : colors.textSecondary }}>All</Text>
            </TouchableOpacity>
            {sortedCategories.map(({ cat }) => {
              const c = cfg[cat]; const active = selectedCategory === cat;
              return (
                <TouchableOpacity key={cat} onPress={() => setSelectedCategory(active ? null : cat)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22,
                    backgroundColor: active ? c.color + '18' : colors.card,
                    borderWidth: 1.5, borderColor: active ? c.color : colors.border }}>
                  <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? c.color : colors.textSecondary }}>
                    {c.label.length > 7 ? c.label.slice(0, 6) + '…' : c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── LOG ENTRIES ── */}
        {dayGroups.length > 0 && (
          <View style={{ paddingTop: 8 }}>
            <Text style={[s.sectionLabel, { color: colors.textSecondary, paddingHorizontal: 16, marginBottom: 16 }]}>LOG</Text>
            {dayGroups.map(([dateKey, entries]) => {
              const dayTotal = entries.reduce((sum, e) => sum + Number(e.amount), 0);
              return (
                <View key={dateKey} style={{ marginBottom: 20 }}>
                  {/* Day header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.6 }}>
                      {dayHeader(dateKey)}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>
                      ${dayTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                  {/* One card per day, entries share dividers inside */}
                  <View style={{
                    marginHorizontal: 16,
                    backgroundColor: colors.card,
                    borderRadius: 20,
                    overflow: 'hidden',
                    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 3,
                  }}>
                    {entries.map((e, i) => {
                      const c = cfg[e.category];
                      const p = !selectedPetId ? petForEntry(e.pet_id) : null;
                      const pa = p ? ((p as any).accent_color ?? accent) : accent;
                      const title = e.title || c.label;
                      return (
                        <TouchableOpacity key={e.id}
                          onPress={() => openEdit(e)}
                          onLongPress={() => remove(e.id, c.label)}
                          activeOpacity={0.75}
                          style={[
                            { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
                            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                          ]}>
                          {/* Emoji icon — subtle tinted square */}
                          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.color + '15', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
                          </View>
                          {/* Text stack */}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.2 }} numberOfLines={1}>
                              {title}
                            </Text>
                            {e.notes ? (
                              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                                {e.notes}
                              </Text>
                            ) : null}
                            {p && (
                              <Text style={{ fontSize: 12, fontWeight: '700', color: pa, marginTop: 3 }}>
                                {p.emoji ?? '🐾'} {p.name}
                              </Text>
                            )}
                          </View>
                          {/* Amount */}
                          <Text style={{ fontSize: 16, fontWeight: '800', color: c.color, flexShrink: 0, letterSpacing: -0.3 }}>
                            ${Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {activeExpenses.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 32, paddingHorizontal: 40 }}>
            <Text style={{ fontSize: 48 }}>💰</Text>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary, marginTop: 12 }}>No expenses yet</Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 22 }}>
              {viewMode === 'year'
                ? `Nothing logged for ${selectedYear}.`
                : `Tap any category above or the + button to log your first expense for ${monthLabel}.`}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Smart FAB */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => scrolledDown
          ? scrollRef.current?.scrollTo({ y: 0, animated: true })
          : openAdd()
        }
        style={[s.fab, { backgroundColor: accent, bottom: insets.bottom + 16,
          shadowColor: accent, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }]}>
        <Ionicons name={scrolledDown ? 'chevron-up' : 'add'} size={scrolledDown ? 24 : 28} color="#fff" />
      </TouchableOpacity>

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} accent={accent} colors={colors} />
      <ReceiptReviewSheet
        visible={showReview} scannedItems={scannedItems} setScannedItems={setScannedItems}
        scanMerchant={scanMerchant} scanDate={scanDate} pets={pets as any[]}
        accent={accent} colors={colors} savingAll={savingAll}
        onClose={() => setShowReview(false)} onSave={saveAllScanned}
      />
      <ExpenseFormSheet
        visible={modal} form={form} setForm={setForm}
        addForPetId={addForPetId} setAddForPetId={setAddForPetId}
        selectedPetId={selectedPetId} pets={pets as any[]}
        accent={accent} colors={colors} saving={saving}
        showPicker={showPicker} setShowPicker={setShowPicker}
        onClose={() => setModal(false)} onSave={save} petForEntry={petForEntry}
      />
    </View>
  );
}
