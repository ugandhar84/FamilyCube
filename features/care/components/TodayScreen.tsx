/**
 * TodayScreen — household-wide smart dashboard for Care › Today.
 *
 * Zone 1  Pet filter chips   — completion ring per pet; tap to filter zones below
 * Zone 2  Quick log grid     — Meal / Treat / Mood / Groom (inline, no nav required)
 * Zone 3  Needs attention    — urgency-sorted cards with one-tap inline actions
 * Zone 4  Done today         — chronological timeline of everything logged today
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, RefreshControl, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { computeCareProgress } from '@/lib/careProgress';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { useTheme } from '@/lib/ThemeContext';
import { usePetStore } from '@/store/petStore';
import { useAuthStore } from '@/store/authStore';
import { type TodayItem } from '@/lib/weather';
import { upsertDailyNote } from '@/lib/db/daily';
import { usesImperial } from '@/lib/units';
import QuickLogSheet, { type QuickLogKind } from '@/components/QuickLogSheet';
import PetPickerSheet from '@/components/PetPickerSheet';
import PawBondLoader from '@/components/PawBondLoader';
import { MOOD_EMOJI, TYPO} from '@/constants/theme';
import { toTitle } from '@/lib/format';
import { formatTime } from '@/lib/units';
import type { Pet } from '@/lib/types';
import { groomTypesForSpecies } from '@/lib/groomTypes';

import PetFilterStrip from './today/PetFilterStrip';
import NeedsAttentionSection from './today/NeedsAttentionSection';
import DoneTodaySection from './today/DoneTodaySection';
import GroomSheet from './today/GroomSheet';
import TodayFilters, { type CategoryKey } from './today/TodayFilters';
import QuickLogGrid from './today/QuickLogGrid';
import StreakBanner from './today/StreakBanner';
import WeatherNudge from './today/WeatherNudge';
import TomorrowPreview from './today/TomorrowPreview';
import NoteModal from './today/NoteModal';
import { TodayScheduleCard } from '@/features/care/components/TodayScheduleCard';
import {
  dateStr, URGENCY_ORDER, type Urgency, type PriorityCard, type DoneEntry,
  groomInterval, GROOM_META, GROOM_SPECIES_DEFAULTS, GROOM_GLOBAL,
} from './today/todayTypes';
import { useActiveLostAlerts } from '@/lib/hooks/useActiveLostAlerts';
import { useTodayData }    from '@/features/care/hooks/useTodayData';
import { useTodayActions } from '@/features/care/hooks/useTodayActions';
import { useShallow } from 'zustand/react/shallow';
import { usePaywall } from '@/lib/hooks/usePaywall';
import { LIMITS } from '@/lib/subscription';

export default function TodayScreen() {
  const { colors, isDark } = useTheme();
  const router   = useRouter();
  const authUser = useAuthStore(s => s.user);
  const { gate, tier } = usePaywall();
  const {
    pets, activePetId, setActivePet,
    checklist, feedingLogs, groomingSummary, groomSettings, groomingLogs, moodLogs, vaccines, appointments,
    addFeedingLog, toggleChecklistItem, addGroomingLog,
    fetchChecklist, fetchFeedingLogs, fetchGroomingSummary, fetchGroomSettings,
    fetchMoodLogs, fetchGroomingLogs, fetchVaccines, fetchAppointments,
  } = usePetStore(useShallow(s => ({
    pets: s.pets, activePetId: s.activePetId, setActivePet: s.setActivePet,
    checklist: s.checklist, feedingLogs: s.feedingLogs, groomingSummary: s.groomingSummary,
    groomSettings: s.groomSettings, groomingLogs: s.groomingLogs, moodLogs: s.moodLogs,
    vaccines: s.vaccines, appointments: s.appointments,
    addFeedingLog: s.addFeedingLog, toggleChecklistItem: s.toggleChecklistItem, addGroomingLog: s.addGroomingLog,
    fetchChecklist: s.fetchChecklist, fetchFeedingLogs: s.fetchFeedingLogs,
    fetchGroomingSummary: s.fetchGroomingSummary, fetchGroomSettings: s.fetchGroomSettings,
    fetchMoodLogs: s.fetchMoodLogs, fetchGroomingLogs: s.fetchGroomingLogs,
    fetchVaccines: s.fetchVaccines, fetchAppointments: s.fetchAppointments,
  })));

  const today  = useMemo(() => dateStr(new Date()), []);
  const userId = authUser?.id ?? null;
  const insets = useSafeAreaInsets();

  const allPetIds = useMemo(() => pets.map(p => p.id), [pets]);
  const lostSet   = useActiveLostAlerts(allPetIds);
  const guardLost = useCallback((petId: string, petName?: string): boolean => {
    if (!lostSet.has(petId)) return false;
    showAlert('🔴 Pet reported lost',
      `${petName ?? 'This pet'} is currently reported missing. Resolve the lost alert in SOS before logging care activities.`);
    return true;
  }, [lostSet]);

  const goAddPet = useCallback(async () => {
    const petLimit = LIMITS[tier].pets;
    const limitLabel = petLimit === -1 ? 'unlimited' : `${petLimit} pet${petLimit === 1 ? '' : 's'}`;
    const ok = await gate('pets', { title: 'Pet limit reached', message: `Your ${tier === 'free' ? 'free' : tier === 'ultimate' ? 'Ultimate' : 'Pro'} plan supports ${limitLabel}. Upgrade to add more.` });
    if (ok) router.push('/onboarding/add-pet' as any);
  }, [gate, tier, router]);

  // ── Domain hooks ──────────────────────────────────────────────────────────
  const { loading, refreshing, scheduledMeds, weather, weightLogs, streak, load, handleRefresh } = useTodayData(pets, today);

  // ── Pet filter chips ───────────────────────────────────────────────────────
  const [filterIds, setFilterIds] = useState<Set<string>>(new Set());
  const deferredFilterIds = useDeferredValue(filterIds);
  useEffect(() => {
    if (!pets.length) return;
    setFilterIds(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const p of pets) { if (!next.has(p.id)) { next.add(p.id); changed = true; } }
      return changed ? next : prev;
    });
  }, [pets]);

  const toggleFilter = useCallback((petId: string) => {
    setFilterIds(prev => {
      const next = new Set(prev);
      if (next.size === 1 && next.has(petId)) return next;
      next.has(petId) ? next.delete(petId) : next.add(petId);
      return next;
    });
  }, []);

  // ── Pet picker → log sheet ────────────────────────────────────────────────
  const [pickerFor, setPickerFor] = useState<QuickLogKind | null>(null);
  const [logSheet,  setLogSheet]  = useState<{ kind: QuickLogKind; petIds: string[]; mealType?: 'meal' | 'breakfast' | 'lunch' | 'dinner' } | null>(null);

  const openLogSheet = useCallback((kind: QuickLogKind) => {
    if (pets.length < 2) {
      const id = pets[0]?.id; if (!id) return;
      if (guardLost(id, pets[0]?.name)) return;
      setLogSheet({ kind, petIds: [id] });
    } else { setPickerFor(kind); }
  }, [pets, guardLost]);

  // ── Actions hook ──────────────────────────────────────────────────────────
  const actions = useTodayActions({
    pets, userId, today, checklist, groomingLogs, lostSet, guardLost,
    reload: load,
    fetchChecklist, fetchFeedingLogs, fetchMoodLogs, fetchGroomingLogs,
    fetchGroomingSummary, fetchVaccines,
    addFeedingLog, addGroomingLog, toggleChecklistItem,
    setLogSheet,
  });

  // ── Mood scan ──────────────────────────────────────────────────────────────
  const [moodPickerOpen, setMoodPickerOpen] = useState(false);
  const openMoodScan = useCallback(() => {
    if (pets.length < 2) {
      const id = pets[0]?.id; if (!id) return;
      if (guardLost(id, pets[0]?.name)) return;
      setActivePet(id); router.push('/ai/mood-camera');
    } else { setMoodPickerOpen(true); }
  }, [pets, setActivePet, router, guardLost]);

  // ── Groom sheet ────────────────────────────────────────────────────────────
  const [groomSheetOpen,  setGroomSheetOpen]  = useState(false);
  const [groomSheetPetId, setGroomSheetPetId] = useState<string | null>(null);
  const openGroomFlow = useCallback(() => {
    setGroomSheetPetId(activePetId ?? pets[0]?.id ?? null);
    setGroomSheetOpen(true);
  }, [pets, activePetId]);

  // ── Note modal ─────────────────────────────────────────────────────────────
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [notePetId,     setNotePetId]     = useState<string | null>(null);
  const [todayNotes,    setTodayNotes]    = useState<Record<string, string>>({}); // petId → note

  const openNoteModal = useCallback(() => {
    const petId = activePetId ?? pets[0]?.id; if (!petId) return;
    setNotePetId(petId);
    setNoteModalOpen(true);
  }, [activePetId, pets]);

  // Fetch existing notes for badge display
  useEffect(() => {
    if (!pets.length) return;
    const ids = pets.map((p: any) => p.id);
    Promise.resolve(supabase.from('daily_notes').select('pet_id, note').in('pet_id', ids).eq('date', today))
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        for (const row of data) { map[row.pet_id] = row.note; }
        setTodayNotes(map);
      }).catch(() => {});
  }, [pets, today]);

  // ── Weather nudge ──────────────────────────────────────────────────────────
  const [dismissedNudge, setDismissedNudge] = useState(false);
  const weatherNudge = useMemo((): string | null => {
    if (!weather) return null;
    const tempC = weather.unit === '°F' ? (weather.temperature - 32) * 5 / 9 : weather.temperature;
    if (weather.warnings.some(w => w.type === 'thunderstorm')) return "⛈️ Thunderstorm warning — skip outdoor walks today";
    if (weather.warnings.some(w => w.type === 'heatwave'))     return "🔥 Heat advisory — avoid walks between 11am–4pm";
    if (tempC > 32) return "🌡️ It's very hot today — keep walks short and bring water";
    if (tempC < 0)  return "🧊 Freezing temps — protect paws from ice and salt";
    return null;
  }, [weather]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [category, setCategory] = useState<CategoryKey>('all');
  const [search,   setSearch]   = useState('');

  // ── Scroll-to-top FAB ─────────────────────────────────────────────────────
  const scrollRef  = useRef<ScrollView>(null);
  const fabOpacity = useRef(new Animated.Value(0)).current;
  const [fabVisible, setFabVisible] = useState(false);
  const pulseAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,   duration: 1000, useNativeDriver: true }),
    ])).start();
  }, [pulseAnim]);

  const onScroll = useCallback((e: any) => {
    const shouldShow = e.nativeEvent.contentOffset.y > 220;
    if (shouldShow && !fabVisible) {
      setFabVisible(true);
      Animated.timing(fabOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (!shouldShow && fabVisible) {
      Animated.timing(fabOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setFabVisible(false));
    }
  }, [fabVisible, fabOpacity]);

  // ── Visual helpers ─────────────────────────────────────────────────────────
  const petColor   = (p: Pet) => (p as any).accent_color ?? colors.primary;
  const stripeColor = (u: Urgency) =>
    u === 'critical' ? colors.danger : u === 'warn' ? colors.warning : colors.success;
  const iconBg = (u: Urgency) =>
    u === 'critical' ? (isDark ? '#3B0000' : '#FEE2E2')
    : u === 'warn'   ? (isDark ? '#2D1800' : '#FEF3C7')
    : (isDark ? '#002000' : '#DCFCE7');

  // ── Completion rings — prefer DB daily score, fall back to local compute ───
  const petCompletion = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of pets) {
      out[p.id] = Math.round(computeCareProgress({ petId: p.id, today, species: p.species, checklist, feedingLogs, moodLogs }) * 100);
    }
    return out;
  }, [pets, feedingLogs, checklist, moodLogs, today]);

  const hasUrgent = (petId: string) =>
    (checklist[petId] ?? []).some(i => !i.completed && i.type === 'medicine');

  // ── Hour tick for urgency tier ─────────────────────────────────────────────
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Schedule items ─────────────────────────────────────────────────────────
  const todaySchedule = useMemo((): TodayItem[] => {
    const items: TodayItem[] = [];
    const now = new Date();
    const todayStart = new Date(today + 'T00:00:00');
    const todayEnd   = new Date(today + 'T23:59:59');
    for (const pet of pets) {
      if (!filterIds.has(pet.id)) continue;
      for (const a of (appointments[pet.id] ?? []).filter((x: any) => x.status === 'upcoming' || x.status === 'scheduled')) {
        if (!a.scheduled_at) continue;
        const d = new Date(a.scheduled_at); if (isNaN(d.getTime())) continue;
        if (d < todayStart || d > todayEnd) continue;
        items.push({
          id: `appt-${a.id}`, type: 'appointment',
          title: a.type || 'Appointment',
          subtitle: [a.clinic_name, a.vet_name].filter(Boolean).join(' · ') || a.type || 'Appointment',
          sortTime: d.getTime(), timeLabel: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          petId: pet.id, petName: pet.name, petEmoji: pet.emoji, isOverdue: d < now,
          apptId: a.id, apptType: a.type ?? undefined, apptVetName: a.vet_name ?? undefined,
          apptClinicName: a.clinic_name ?? undefined, apptClinicAddress: a.clinic_address ?? undefined,
          apptNotes: a.notes ?? undefined, apptStatus: a.status ?? undefined, apptCost: null,
        });
      }
    }
    for (const m of scheduledMeds) {
      const pet = pets.find(p => p.id === m.pet_id); if (!pet || !filterIds.has(pet.id)) continue;
      items.push({
        id: `med-${m.id}`, type: 'medication', title: m.name,
        subtitle: [m.dosage, m.frequency].filter(Boolean).join(' · ') || 'Medication',
        sortTime: new Date(today + 'T23:59:59').getTime(), timeLabel: 'Today',
        petId: m.pet_id, petName: pet.name, petEmoji: pet.emoji, isOverdue: false,
        medId: m.id, medDosage: m.dosage ?? undefined, medFrequency: m.frequency ?? undefined,
        medStartDate: m.start_date ?? undefined, medEndDate: m.end_date ?? undefined,
        medNotes: m.notes ?? undefined, medIsActive: m.is_active,
      });
    }
    return items.sort((a, b) => a.sortTime - b.sortTime);
  }, [pets, filterIds, appointments, scheduledMeds, today]);

  // ── Priority engine ────────────────────────────────────────────────────────
  const priorities = useMemo((): PriorityCard[] => {
    const cards: PriorityCard[] = [];
    for (const pet of pets) {
      if (!deferredFilterIds.has(pet.id)) continue;
      const feeds     = feedingLogs[`${pet.id}:${today}`] ?? [];
      const petList   = checklist[pet.id] ?? [];
      const petGroom  = groomingSummary[pet.id] ?? {};
      const todayMood = (moodLogs[pet.id] ?? []).filter(l => l.date === today);
      const name      = pet.name ?? 'Pet';
      const species   = (pet as any).species as string | undefined;

      const IS_MEAL = (t: string) => t === 'meal' || t === 'breakfast' || t === 'lunch' || t === 'dinner';
      const mealFeeds  = feeds.filter(f => IS_MEAL(f.meal_type as string));
      const waterFeeds = feeds.filter(f => f.meal_type === 'water');
      const hasBreakfast = mealFeeds.some(f => (f.meal_type as string) === 'breakfast' || (f.meal_type as string) === 'meal');
      const hasDinner    = mealFeeds.some(f => (f.meal_type as string) === 'dinner');
      const petCreatedToday = pet.created_at
        ? differenceInCalendarDays(new Date(), parseISO(pet.created_at.substring(0, 10))) === 0 : false;

      if (!waterFeeds.length && !petCreatedToday)
        cards.push({ id: `water-${pet.id}`, petId: pet.id, urgency: 'suggest',
          emoji: '💧', title: `${name} — refill water bowl`, subtitle: 'Not yet marked today',
          actionLabel: 'Refilled', onAction: () => actions.quickWater(pet.id) });

      if (!hasBreakfast && hour >= 9 && !petCreatedToday)
        cards.push({ id: `meal-${pet.id}-bkfast`, petId: pet.id,
          urgency: hour >= 11 ? 'critical' : 'warn',
          emoji: '🍳', title: `${name} — breakfast missing`,
          subtitle: feeds.length ? `${feeds.length} other log(s) today` : 'No meals logged today',
          actionLabel: 'Fed', onAction: () => setLogSheet({ kind: 'meal', petIds: [pet.id], mealType: 'breakfast' }) });

      if (!hasDinner && hour >= 18 && !petCreatedToday)
        cards.push({ id: `meal-${pet.id}-dinner`, petId: pet.id,
          urgency: hour >= 20 ? 'critical' : 'warn',
          emoji: '🍽️', title: `${name} — dinner missing`,
          subtitle: mealFeeds.length ? `${mealFeeds.length} meal(s) logged · dinner not yet` : 'No meals logged today',
          actionLabel: 'Fed', onAction: () => setLogSheet({ kind: 'meal', petIds: [pet.id], mealType: 'dinner' }) });

      for (const med of petList.filter(i => i.type === 'medicine' && !i.completed))
        cards.push({ id: `med-${med.id}`, petId: pet.id, urgency: 'warn',
          emoji: '💊', title: `${name} — ${med.label}`, subtitle: 'Not yet given today',
          actionLabel: 'Mark done', onAction: () => actions.markDone(med.id) });

      const checklistMedNames = new Set(petList.map(i => i.label?.toLowerCase?.() ?? ''));
      for (const m of scheduledMeds.filter(m => m.pet_id === pet.id)) {
        if (checklistMedNames.has(m.name?.toLowerCase?.() ?? '')) continue;
        const doseSub = [m.dosage, m.frequency].filter(Boolean).join(' · ');
        cards.push({ id: `sched-med-${m.id}`, petId: pet.id, urgency: 'warn',
          emoji: '💊', title: `${name} — ${m.name}`,
          subtitle: doseSub || 'Scheduled medication',
          actionLabel: 'Mark done', onAction: () => actions.logScheduledMed(pet.id, m.name, doseSub || undefined) });
      }

      for (const item of petList.filter(i => i.type !== 'medicine' && !i.completed))
        cards.push({ id: `todo-${item.id}`, petId: pet.id, urgency: 'suggest',
          emoji: '📋', title: `${name} — ${item.label}`, subtitle: 'Scheduled task',
          actionLabel: 'Done', onAction: () => actions.markDone(item.id) });

      const relevantTypes = groomTypesForSpecies(species).map(t => t.key);
      for (const type of relevantTypes) {
        const meta = GROOM_META[type]; if (!meta) continue;
        const lastDate = petGroom[type];
        const dueDays  = groomInterval(pet.id, type, species, groomSettings);
        const baseline = lastDate
          ? parseISO(lastDate.substring(0, 10))
          : pet.created_at ? parseISO(pet.created_at.substring(0, 10)) : new Date();
        const days = differenceInCalendarDays(new Date(), baseline);
        if (days > dueDays) {
          const neverDone = !lastDate;
          cards.push({ id: `groom-${pet.id}-${type}`, petId: pet.id,
            urgency: neverDone || days > dueDays * 1.5 ? 'critical' : 'warn',
            emoji: meta.emoji,
            title: `${name} — ${meta.label.toLowerCase()} overdue`,
            subtitle: neverDone ? `Never logged · schedule: every ${dueDays}d` : `${days}d since last · every ${dueDays}d`,
            actionLabel: 'Done ✓', onAction: () => actions.handleGroomLog(pet.id, type) });
        }
      }

      for (const appt of (appointments[pet.id] ?? []).filter(a => a.status === 'upcoming')) {
        if (!appt.scheduled_at) continue;
        const daysUntil = differenceInCalendarDays(parseISO(appt.scheduled_at), new Date());
        if (daysUntil > 1) continue;
        const when = daysUntil === 0 ? 'Today' : 'Tomorrow';
        cards.push({ id: `appt-${appt.id}`, petId: pet.id,
          urgency: daysUntil === 0 ? 'critical' : 'warn',
          emoji: '🏥', title: `${name} — ${appt.title}`,
          subtitle: `${when}${appt.vet_name ? ` · ${appt.vet_name}` : ''}${appt.clinic_name ? ` @ ${appt.clinic_name}` : ''}`,
          actionLabel: 'View →',
          onAction: () => { setActivePet(pet.id); router.push({ pathname: '/(tabs)/care', params: { section: 'health' } } as any); } });
      }

      for (const vax of (vaccines[pet.id] ?? [])) {
        if (!vax.next_due) continue;
        const daysUntil = differenceInCalendarDays(parseISO(vax.next_due), new Date());
        if (daysUntil > 1) continue;
        const overdue = daysUntil < 0;
        const when = overdue ? `Overdue by ${Math.abs(daysUntil)}d` : daysUntil === 0 ? 'Due today' : 'Due tomorrow';
        const logVaccineGiven = async () => {
          try {
            await supabase.from('vaccines').update({ last_given: today, next_due: null }).eq('id', vax.id);
            fetchVaccines(pet.id);
          } catch (e: any) { showAlert('Error', e?.message ?? 'Could not mark vaccine as done.'); }
        };
        cards.push({ id: `vax-${vax.id}`, petId: pet.id,
          urgency: overdue ? 'critical' : 'warn',
          emoji: '💉', title: `${name} — ${vax.name}`,
          subtitle: `${when}${vax.vet_name ? ` · ${vax.vet_name}` : ''}`,
          actionLabel: overdue ? 'Book vet' : 'Mark done',
          onAction: overdue
            ? () => { setActivePet(pet.id); router.push({ pathname: '/(tabs)/care', params: { section: 'health' } } as any); }
            : logVaccineGiven });
      }

      if (!todayMood.length)
        cards.push({ id: `mood-${pet.id}`, petId: pet.id, urgency: 'suggest',
          emoji: '😊', title: `Scan ${name}'s mood`, subtitle: 'No AI mood check today',
          actionLabel: 'Scan', onAction: () => { setActivePet(pet.id); router.push('/ai/mood-camera'); } });
    }
    return cards.sort((a, b) => {
      const d = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      if (d !== 0) return d;
      const na = pets.find(p => p.id === a.petId)?.name ?? '';
      const nb = pets.find(p => p.id === b.petId)?.name ?? '';
      return na.localeCompare(nb);
    });
  }, [pets, deferredFilterIds, feedingLogs, checklist, groomingSummary, groomSettings,
    moodLogs, appointments, scheduledMeds, today, hour, actions]);

  // ── Done today timeline ────────────────────────────────────────────────────
  const doneToday = useMemo((): DoneEntry[] => {
    const entries: DoneEntry[] = [];
    for (const pet of pets) {
      if (!deferredFilterIds.has(pet.id)) continue;
      const feeds     = feedingLogs[`${pet.id}:${today}`] ?? [];
      const moods     = (moodLogs[pet.id] ?? []).filter(l => l.date === today);
      const grooms    = (groomingLogs[pet.id] ?? []).filter(g => g.done_at.substring(0, 10) === today);
      const doneItems = (checklist[pet.id] ?? []).filter(i => i.completed && i.completed_at);

      const FEED_LABEL: Record<string, string> = { meal: 'Meal', treat: 'Treat', water: 'Water' };
      const FEED_EMOJI: Record<string, string> = { meal: '🍽️', treat: '🦴', water: '💧' };

      const waterLog = feeds.filter(f => f.meal_type === 'water')
        .sort((a, b) => ((b as any).fed_at ?? '') > ((a as any).fed_at ?? '') ? 1 : -1)[0];
      if (waterLog) entries.push({ id: `f-${waterLog.id}`, rawId: waterLog.id, source: 'feeding', pet, emoji: '💧', label: 'Water refilled', time: (waterLog as any).fed_at ?? today });

      const treats = feeds.filter(f => f.meal_type === 'treat');
      if (treats.length > 0) {
        const last = treats.sort((a, b) => ((b as any).fed_at ?? '') > ((a as any).fed_at ?? '') ? 1 : -1)[0];
        entries.push({ id: `f-treat-${pet.id}`, rawId: last.id, source: 'feeding', pet, emoji: '🦴',
          label: treats.length > 1 ? `Treat × ${treats.length}` : 'Treat', time: (last as any).fed_at ?? today });
      }

      const mealsByType: Record<string, typeof feeds[0]> = {};
      for (const f of feeds.filter(f => f.meal_type !== 'water' && f.meal_type !== 'treat')) {
        const t = f.meal_type as string; const existing = mealsByType[t];
        if (!existing || ((f as any).fed_at ?? '') > ((existing as any).fed_at ?? '')) mealsByType[t] = f;
      }
      for (const f of Object.values(mealsByType))
        entries.push({ id: `f-${f.id}`, rawId: f.id, source: 'feeding', pet,
          emoji: FEED_EMOJI[f.meal_type as string] ?? '🍽️',
          label: FEED_LABEL[f.meal_type as string] ?? toTitle(f.meal_type as string),
          time: (f as any).fed_at ?? today });

      for (const m of moods)
        entries.push({ id: `m-${m.id}`, rawId: m.id, source: 'mood', pet,
          emoji: MOOD_EMOJI[m.mood_label] ?? '😊',
          label: `${toTitle(m.mood_label)} · ${m.mood_score}/100`,
          time: m.created_at ?? m.date });

      const groomByType: Record<string, typeof grooms> = {};
      for (const g of grooms) { const t = (g as any).type as string; (groomByType[t] ??= []).push(g); }
      for (const [t, logs] of Object.entries(groomByType)) {
        const latest = logs.sort((a, b) => ((b as any).done_at_time ?? b.done_at) > ((a as any).done_at_time ?? a.done_at) ? 1 : -1)[0];
        const meta = GROOM_META[t];
        entries.push({ id: `g-${latest.id}`, rawId: latest.id, source: 'grooming', pet,
          emoji: meta?.emoji ?? '✂️',
          label: (meta?.label ?? toTitle(t)) + (logs.length > 1 ? ` × ${logs.length}` : ''),
          time: (latest as any).done_at_time ?? latest.done_at });
      }
      for (const i of doneItems)
        entries.push({ id: `t-${i.id}`, rawId: i.id, source: 'checklist', itemType: i.type, pet,
          emoji: i.type === 'medicine' ? '💊' : '✅', label: i.label, time: i.completed_at! });
    }

    // Weight logs
    const imperial = usesImperial();
    for (const w of weightLogs.filter((w: any) => deferredFilterIds.has(w.pet_id))) {
      const pet = pets.find(p => p.id === w.pet_id); if (!pet) continue;
      const displayWeight = imperial ? `${(w.weight_kg * 2.20462).toFixed(1)} lbs` : `${w.weight_kg} kg`;
      entries.push({ id: `w-${w.id}`, rawId: w.id, source: 'weight' as any, pet, emoji: '⚖️', label: `Weight: ${displayWeight}`, time: today + 'T12:00:00Z' });
    }

    return entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [pets, deferredFilterIds, feedingLogs, moodLogs, groomingLogs, checklist, weightLogs, today]);

  // ── Tomorrow preview ───────────────────────────────────────────────────────
  const tomorrowItems = useMemo(() => {
    const items: { id: string; petName: string; petEmoji: string; emoji: string; label: string }[] = [];
    for (const pet of pets) {
      if (!deferredFilterIds.has(pet.id)) continue;
      for (const a of (appointments[pet.id] ?? []).filter((a: any) => a.status === 'upcoming')) {
        if (!a.scheduled_at) continue;
        if (differenceInCalendarDays(parseISO(a.scheduled_at), new Date()) !== 1) continue;
        items.push({ id: `ta-${a.id}`, petName: pet.name, petEmoji: pet.emoji ?? '🐾', emoji: '🏥', label: a.type || a.title || 'Appointment' });
      }
      for (const v of (vaccines[pet.id] ?? [])) {
        if (!v.next_due) continue;
        if (differenceInCalendarDays(parseISO(v.next_due), new Date()) !== 1) continue;
        items.push({ id: `tv-${v.id}`, petName: pet.name, petEmoji: pet.emoji ?? '🐾', emoji: '💉', label: v.name });
      }
    }
    return items;
  }, [pets, deferredFilterIds, appointments, vaccines]);

  // ── Category + search filtering ────────────────────────────────────────────
  const categoryOf = useCallback((id: string): CategoryKey => {
    if (id.startsWith('water-') || id.startsWith('meal-') || id.startsWith('f-treat-')) return 'feeding';
    if (id.startsWith('med-') || id.startsWith('sched-med-')) return 'meds';
    if (id.startsWith('groom-')) return 'grooming';
    if (id.startsWith('appt-') || id.startsWith('vax-')) return 'health';
    if (id.startsWith('mood-')) return 'mood';
    if (id.startsWith('todo-')) return 'tasks';
    return 'all';
  }, []);

  const doneCategoryOf = useCallback((e: DoneEntry): CategoryKey => {
    if (e.source === 'feeding')   return 'feeding';
    if (e.source === 'mood')      return 'mood';
    if (e.source === 'grooming')  return 'grooming';
    if (e.source === 'checklist') return e.itemType === 'medicine' ? 'meds' : 'tasks';
    return 'all';
  }, []);

  const q = search.toLowerCase();
  const filteredPriorities = useMemo(() => priorities.filter(c => {
    if (category !== 'all' && categoryOf(c.id) !== category) return false;
    if (q) return c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q);
    return true;
  }), [priorities, category, q, categoryOf]);

  const filteredDone = useMemo(() => doneToday.filter(e => {
    if (category !== 'all' && doneCategoryOf(e) !== category) return false;
    if (q) return e.label.toLowerCase().includes(q) || e.pet.name.toLowerCase().includes(q);
    return true;
  }), [doneToday, category, q, doneCategoryOf]);

  // ── Quick log grid callbacks ───────────────────────────────────────────────
  const handleWater = useCallback(() => {
    const id = activePetId ?? pets[0]?.id; if (!id) return;
    actions.quickWater(id);
  }, [activePetId, pets, actions]);

  const handleWalk = useCallback(() => {
    const id = activePetId ?? pets[0]?.id; if (!id) return;
    actions.logWalk(id);
  }, [activePetId, pets, actions]);

  const handleBathroom = useCallback(() => {
    const id = activePetId ?? pets[0]?.id; if (!id) return;
    Alert.alert('Bathroom log', 'How was it?', [
      { text: 'Normal ✅',  onPress: () => actions.logBathroom(id, 'normal') },
      { text: 'Soft ⚠️',   onPress: () => actions.logBathroom(id, 'soft') },
      { text: 'Hard ⚠️',   onPress: () => actions.logBathroom(id, 'hard') },
      { text: 'Blood 🔴',  style: 'destructive', onPress: () => actions.logBathroom(id, 'blood') },
      { text: 'Cancel',    style: 'cancel' },
    ]);
  }, [activePetId, pets, actions]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <PawBondLoader size={64} />
      </View>
    );
  }

  const multiPet = pets.length > 1;
  const activeId = activePetId ?? pets[0]?.id ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        onScroll={onScroll}
        scrollEventThrottle={60}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none">

        {/* Zone 1: Pet filter chips */}
        {pets.length > 0 && (
          <PetFilterStrip
            pets={pets} filterIds={filterIds} petCompletion={petCompletion}
            hasUrgent={hasUrgent} petColor={petColor} onToggle={toggleFilter}
            onAddPet={goAddPet} colors={colors}
          />
        )}

        {/* Care streak banner */}
        <StreakBanner streak={streak} colors={colors} />

        {/* Filters */}
        <TodayFilters
          category={category} search={search}
          onCategory={setCategory} onSearch={setSearch}
          colors={colors} isDark={isDark}
        />

        {/* Weather nudge */}
        {weatherNudge && !dismissedNudge && (
          <WeatherNudge nudge={weatherNudge} onDismiss={() => setDismissedNudge(true)} colors={colors} />
        )}

        {/* Zone 2: Quick log grid */}
        <QuickLogGrid
          feedingLogs={feedingLogs}
          checklist={checklist}
          todayNotes={todayNotes}
          activeId={activeId}
          today={today}
          colors={colors}
          pulseAnim={pulseAnim}
          onMeal={() => openLogSheet('meal')}
          onTreat={() => openLogSheet('treat')}
          onWater={handleWater}
          onMood={openMoodScan}
          onGroom={openGroomFlow}
          onWalk={handleWalk}
          onBathroom={handleBathroom}
          onNote={openNoteModal}
        />

        {/* Zone 2.5: Scheduled today */}
        <TodayScheduleCard
          items={todaySchedule} colors={colors} isDark={isDark}
          onApptOverdue={() => {}}
          onMedDone={(item) => {
            if (item.medId && item.petId) actions.logScheduledMed(item.petId, item.title);
          }}
        />

        {/* Zone 3: Needs attention */}
        <NeedsAttentionSection
          priorities={filteredPriorities} pets={pets}
          colors={colors} isDark={isDark}
          petColor={petColor} stripeColor={stripeColor} iconBg={iconBg}
          onTaskAdded={() => pets.forEach(p => fetchChecklist(p.id, today))}
        />

        {/* Zone 4: Done today */}
        <DoneTodaySection
          entries={filteredDone} onUndo={actions.handleUndo}
          colors={colors} petColor={petColor} multiPet={multiPet}
        />

        {/* Tomorrow preview */}
        <TomorrowPreview items={tomorrowItems} colors={colors} />
      </ScrollView>

      {/* Note modal */}
      <NoteModal
        visible={noteModalOpen}
        petId={notePetId}
        today={today}
        colors={colors}
        onClose={() => setNoteModalOpen(false)}
        onSaved={(pid, note) => { setTodayNotes(prev => ({ ...prev, [pid]: note })); setNoteModalOpen(false); }}
      />

      {/* Pet picker → meal/treat */}
      <PetPickerSheet
        visible={!!pickerFor} pets={pets} activePetId={activePetId}
        title={pickerFor === 'meal' ? 'Meal for which babies?' : 'Treat for which babies?'}
        confirmLabel="Continue"
        onConfirm={ids => {
          const kind = pickerFor!; setPickerFor(null);
          if (!ids.length) return;
          const blockedId = ids.find(id => lostSet.has(id));
          if (blockedId) { const p = pets.find(x => x.id === blockedId); guardLost(blockedId, p?.name); return; }
          setLogSheet({ kind, petIds: ids });
        }}
        onCancel={() => setPickerFor(null)}
      />

      {logSheet && userId && (
        <QuickLogSheet
          visible kind={logSheet.kind} petIds={logSheet.petIds}
          pets={pets} userId={userId} today={today}
          initialMealType={logSheet.mealType}
          onClose={() => setLogSheet(null)}
          onSaved={() => setLogSheet(null)}
        />
      )}

      <PetPickerSheet
        visible={moodPickerOpen} pets={pets} activePetId={activePetId}
        title="Scanning mood for…" confirmLabel="Scan" singleSelect
        onConfirm={ids => { setMoodPickerOpen(false); const id = ids[0]; if (id) { setActivePet(id); router.push('/ai/mood-camera'); } }}
        onCancel={() => setMoodPickerOpen(false)}
      />

      {/* Scroll-to-top FAB */}
      {fabVisible && (
        <Animated.View style={[s.fab, { opacity: fabOpacity, backgroundColor: colors.primary, bottom: insets.bottom + 16 }]}>
          <TouchableOpacity onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} style={s.fabInner} activeOpacity={0.8}>
            <Ionicons name="chevron-up" size={22} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Groom sheet */}
      <GroomSheet
        visible={groomSheetOpen} onClose={() => setGroomSheetOpen(false)}
        pets={pets} selectedPetId={groomSheetPetId} onSelectPet={setGroomSheetPetId}
        groomingLogs={groomingLogs} today={today} petColor={petColor}
        colors={colors} isDark={isDark} onGroomLog={actions.handleGroomLog}
      />
    </View>
  );
}

const s = StyleSheet.create({
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section:      { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
  sectionLabel: { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  fab:          { position: 'absolute', right: 20, width: 48, height: 48, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  fabInner:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
