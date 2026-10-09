import { useEffect, useState, useCallback, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { ChefHat, RefreshCw } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore } from '@/store/eventStore';
import { localDateStr } from '@/lib/dates';

import {
  Meal, DAYS, categorizeItem, weekOf,
} from './meals/types';
import FlatSectionHeader from './meals/FlatSectionHeader';
import RecipeModal from './meals/RecipeModal';
import DayCard from './meals/DayCard';
import MealFormSheet from './meals/MealFormSheet';
import { showToast } from '@/components/AppToast';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';

// ─── Main MealsTab ────────────────────────────────────────────────────────────

export type MealFormState = {
  addDay: string | null;
  editMeal: Meal | null;
  familyId: string;
  saving: boolean;
  onSave: (patch: any) => void | Promise<void>;
  onClose: () => void;
};

export default function MealsTab({ colors, isDark, weekOverride, onAddReady, onFormStateChange, showAddButton }: {
  colors: any; isDark: boolean; weekOverride?: string;
  onAddReady?: (trigger: (day?: string) => void) => void;
  onFormStateChange?: (state: MealFormState | null) => void;
  showAddButton?: boolean;
}) {
  const { members, activeMemberId } = useFamilyStore();
  const familyId    = (members[0] as any)?.familyId ?? 'family-1';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  // Meal add/edit/delete + the CubeAI planner are now parent-only
  // [live-requested: "remove meal editing /add/delete only give readonly
  // access .. with recipie share.. kube ai we can blur and show the
  // overleay parents ony access? / even mobile should do same"] — a
  // deliberate widening of the OLD isKid-only restriction to also cover
  // teen (this used to give teen full edit access, same as parent; this
  // is a genuine behavior change). Recipe viewing/sharing (onRecipe,
  // RecipeModal's own Share) stays available to everyone — it was never
  // an edit action.
  const isKidOrTeen = (activeMember as any)?.role === 'kid' || (activeMember as any)?.role === 'teen';
  const curWeek     = weekOverride ?? weekOf();
  const addQuest    = useQuestStore().addQuest;

  const [meals, setMeals]       = useState<Meal[]>([]);
  const [loading, setLoading]   = useState(true);

  // Modals
  const [activeRecipe, setActiveRecipe] = useState<Meal | null>(null);
  const [editMeal, setEditMeal]         = useState<Meal | null>(null);
  const [addDay, setAddDay]             = useState<string | null>(null);
  // Was a plain `savingMeal` state — a fast double-tap on MealFormSheet's
  // Save could fire saveMeal twice, inserting the same manual meal twice
  // (add mode) [live-requested app-wide: "We should avoid double tab
  // submit for all the app wide"].
  const { submitting: savingMeal, guard: guardSaveMeal } = useSubmitGuard();

  // Notify parent of form state so MealsWeekPage early-returns the form as a full page.
  useEffect(() => {
    if (addDay || editMeal) {
      useUIStore.getState().setFullBleedScreenActive(true);
      onFormStateChange?.({
        addDay, editMeal, familyId,
        saving: savingMeal,
        onSave: saveMeal,
        onClose: () => { setAddDay(null); setEditMeal(null); },
      });
    } else {
      useUIStore.getState().setFullBleedScreenActive(false);
      onFormStateChange?.(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDay, editMeal, savingMeal]);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('family_meals').select('*').eq('family_id', familyId).eq('week_of', curWeek).order('day');
      if (error) console.warn('[MealsTab] load error:', error.message, 'family_id:', familyId, 'week_of:', curWeek);
      if (data) setMeals(data as Meal[]);
    } finally {
      setLoading(false);
    }
  }, [curWeek, familyId]);

  useEffect(() => { load(); }, [load]);

  // Expose "Add meal" trigger to parent
  useEffect(() => { onAddReady?.((day) => setAddDay(day ?? DAYS[0])); }, [onAddReady]);

  const addGroceryItems = async (names: string[], source?: string) => {
    const { addItem, items: existing, familyId: sfId } = useGroceryStore.getState();
    const effectiveFamilyId = sfId ?? familyId;
    const existingNames = new Set(existing.map(i => i.name.toLowerCase().trim()));
    for (const name of names) {
      if (!existingNames.has(name.toLowerCase().trim())) {
        await addItem({ familyId: effectiveFamilyId, name, quantity: '1', category: categorizeItem(name), addedBy: activeMember?.id ?? '', aiGenerated: true, notes: source });
      }
    }
  };

  // Shared "Mon"/"Tue"/etc -> real YYYY-MM-DD for THIS week, used by both
  // the cooking-quest due date and the meal's own linked calendar event.
  const dayNameToDate = (day: string): string => {
    const DAYS_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const todayIdx = new Date().getDay(); // 0=Sun
    const dayIdx = DAYS_ORDER.indexOf(day);
    const daysUntil = ((dayIdx - (todayIdx === 0 ? 6 : todayIdx - 1) + 7) % 7);
    const d = new Date();
    d.setDate(d.getDate() + daysUntil);
    // Was due.toISOString() (UTC date) — for anyone west of UTC in the
    // evening this silently wrote a date one calendar day off from what
    // the day picker showed (e.g. picking "Fri" could write Saturday's date).
    return localDateStr(d);
  };

  // "6:00 PM" -> "18:00" (24h, for calendar_events.start_time). Same
  // simple format MealFormSheet.tsx's own picker writes and parses.
  const parseTimeLabelTo24h = (label: string | null | undefined): string | null => {
    if (!label) return null;
    const m = label.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    if (m[3] === 'PM' && h !== 12) h += 12;
    if (m[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };

  const addMinutesToTime = (hhmm: string, minutes: number): string => {
    const [h, m] = hhmm.split(':').map(Number);
    const total = (h * 60 + m + minutes) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  // Materializes/updates/removes a meal's linked calendar_events row based
  // on whether it currently has a start_time — same "funnel every
  // syncable domain through calendar_events" pattern chores' addChore/
  // updateChore/deleteChore got, so a timed meal rides the existing 2-way
  // calendar sync engine (calendar-sync-push/Apple EventKit) for free.
  // Includes an end time (start + prep_minutes, defaulting to 30min) so a
  // synced external calendar entry covers the actual cooking window
  // instead of being open-ended (live-requested: "put end time too").
  const syncMealCalendarEvent = async (meal: { id: string; day: string; title: string; start_time?: string | null; prep_minutes?: number | null; linked_event_id?: string | null }): Promise<string | null> => {
    const time24 = parseTimeLabelTo24h(meal.start_time);
    const { addEvent, updateEvent, deleteEvent } = useEventStore.getState();

    if (!time24) {
      if (meal.linked_event_id) deleteEvent(meal.linked_event_id);
      return null;
    }
    const date = dayNameToDate(meal.day);
    const endTime = addMinutesToTime(time24, meal.prep_minutes || 30);
    if (meal.linked_event_id) {
      updateEvent(meal.linked_event_id, { title: meal.title, date, time: time24, endTime });
      return meal.linked_event_id;
    }
    return addEvent({
      title: meal.title, date, time: time24, endTime,
      type: 'reminder', category: 'Meal',
      createdBy: activeMemberId ?? undefined,
    });
  };

  // Create a cooking quest for the assigned chef
  const createCookingQuest = (mealTitle: string, chefId: string, day: string, prepMins?: number | null) => {
    const dueDate = dayNameToDate(day);

    addQuest({
      title:            `🍳 Cook ${mealTitle}`,
      description:      `Prepare ${mealTitle} for the family on ${day}.`,
      category:         'Cooking',
      priority:         'medium',
      coins:            15,
      xpReward:         20,
      assignedToId:     chefId,
      assignedToIds:    [chefId],
      isPool:           false,
      isDaily:          false,
      recurrence:       'once',
      status:           'todo',
      dueDate,
      estimatedMinutes: prepMins ?? undefined,
      createdById:      activeMember?.id ?? '',
      photoRequired:    false,
      isAdultTask:      members.find(m => m.id === chefId)?.role === 'parent' || members.find(m => m.id === chefId)?.role === 'senior',
    });
  };

  // Single save handler for both MealFormSheet modes — add mode needs
  // addDay set (which day this new meal belongs to), edit mode needs
  // editMeal set (the row being patched). Was two separate functions
  // (addManualMeal/updateMeal) each hand-maintaining their own insert/
  // update + cooking-quest logic; merged since MealFormSheet.tsx itself
  // is now the single component backing both flows.
  const saveMeal = guardSaveMeal(async (patch: {
    title: string; type: string; emoji: string; chef_id: string | null;
    prep_minutes: number | null; dietary_tags: string[]; ingredients: string[];
    prep_steps: string[]; recipe_text?: string | null;
    start_time: string | null; timezone: string | null;
    createReminder: boolean;
  }) => {
    // Strip fields not in family_meals schema before sending to Supabase
    const { createReminder, recipe_text: _rt, timezone: _tz, ...dbPatch } = patch;
    if (editMeal) {
      const linkedEventId = await syncMealCalendarEvent({ ...editMeal, ...dbPatch });
      const fullPatch = { ...dbPatch, linked_event_id: linkedEventId };
      await supabase.from('family_meals').update(fullPatch).eq('id', editMeal.id);
      setMeals(prev => prev.map(m => m.id === editMeal.id ? { ...m, ...fullPatch } : m));
      showToast('Meal updated');
      if (createReminder && dbPatch.chef_id) {
        createCookingQuest(dbPatch.title, dbPatch.chef_id, editMeal.day, dbPatch.prep_minutes);
      }
      setEditMeal(null);
    } else if (addDay) {
      const newId = `${familyId}-${curWeek}-${addDay}-manual-${Date.now()}`;
      const linkedEventId = await syncMealCalendarEvent({ id: newId, day: addDay, title: dbPatch.title, start_time: dbPatch.start_time, prep_minutes: dbPatch.prep_minutes, linked_event_id: null });
      const { data } = await supabase.from('family_meals').insert({
        id: newId,
        family_id: familyId, week_of: curWeek, day: addDay,
        ...dbPatch, ai_generated: false, linked_event_id: linkedEventId,
      }).select().single();
      if (data) { setMeals(prev => [...prev, data as Meal]); showToast('Meal added'); }
      if (createReminder && dbPatch.chef_id) {
        createCookingQuest(dbPatch.title, dbPatch.chef_id, addDay, dbPatch.prep_minutes);
      }
      setAddDay(null);
    }
  });

  const deleteMeal = async (id: string) => {
    const meal = meals.find(m => m.id === id);
    if (meal?.linked_event_id) useEventStore.getState().deleteEvent(meal.linked_event_id);
    await supabase.from('family_meals').delete().eq('id', id);
    setMeals(prev => prev.filter(m => m.id !== id));
    showToast('Meal deleted');
  };

  const mealsByDay = useMemo(() => {
    const map: Record<string, Meal[]> = {};
    meals.forEach(m => {
      (map[m.day] = map[m.day] ?? []).push(m);
    });
    return map;
  }, [meals]);

  if (loading) return (
    <View style={{ flex: 1 }}>
      <FlatSectionHeader Icon={ChefHat} title="Meal Planner" accent={colors.danger} colors={colors} />
      <ActivityIndicator color={colors.danger} style={{ marginVertical: 24 }} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
    >
      {/* ── Add meal button (scrolls with content) ── */}
      {showAddButton && !isKidOrTeen && (
        <TouchableOpacity
          onPress={() => setAddDay(DAYS[0])}
          activeOpacity={0.82}
          style={{ borderRadius: 14, paddingVertical: 16, alignItems: 'center',
            backgroundColor: colors.primary, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>+ Add meal</Text>
        </TouchableOpacity>
      )}

      {/* ── Weekly Plan Grid ─────────────────────────────── */}
      <View>
        <FlatSectionHeader
          Icon={ChefHat} title="Week Plan" accent={colors.danger} colors={colors}
          badge={`Wk of ${new Date(curWeek + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          onAction={load} actionIcon={<RefreshCw size={14} color={colors.danger} />}
        />

        {/* Day cards */}
        <View>
          {DAYS.map(day => (
            <DayCard key={day} day={day} meals={mealsByDay[day] ?? []}
              members={members as any}
              colors={colors} isDark={isDark}
              onRecipe={m => setActiveRecipe(m)}
              onEdit={isKidOrTeen ? undefined : m => setEditMeal(m)}
              onDelete={isKidOrTeen ? undefined : m => deleteMeal(m.id)}
              onAdd={isKidOrTeen ? undefined : () => setAddDay(day)}
              onChefSwap={isKidOrTeen ? undefined : async (mealId, newChefId) => {
                await supabase.from('family_meals').update({ chef_id: newChefId }).eq('id', mealId);
                setMeals(prev => prev.map(m => m.id === mealId ? { ...m, chef_id: newChefId } : m));
                showToast(newChefId ? 'Chef updated' : 'Chef removed');
              }}
            />
          ))}
        </View>
      </View>

    </ScrollView>

      {/* ── Recipe Detail — full-page ────── */}
      <RecipeModal meal={activeRecipe} visible={!!activeRecipe}
        onClose={() => setActiveRecipe(null)}
        onEdit={isKidOrTeen ? undefined : m => { setActiveRecipe(null); setEditMeal(m); }}
        onAddToGrocery={(names) => addGroceryItems(names, activeRecipe ? `From ${activeRecipe.title}` : undefined)}
        senderId={activeMember?.id ?? ''}
        hideAddToGrocery={isKidOrTeen}
        colors={colors} isDark={isDark} />

    </View>
  );
}
