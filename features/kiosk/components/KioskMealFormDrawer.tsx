/**
 * KioskMealFormDrawer — kiosk-only fork of MealFormSheet.tsx (mobile's
 * shared Add/Edit Meal stepper), same minimal-diff fork pattern as
 * KioskAddChoreForm.tsx/AddQuestModal.tsx and KioskAddEventForm.tsx/
 * EventFormModal.tsx: real field logic (the 3-step Basics/Details/Recipe
 * flow, the add-vs-edit dual mode keyed off `day`/`editingMeal`, the
 * save-patch shape) is byte-identical — only the shell is swapped
 * [live-requested: "there should be manual addition/view/edit/delete
 * right similar to the mobile but side forms here in kiosk"].
 *
 * Two real chrome differences from the mobile bottom sheet:
 *   1. TaskFormShell -> KioskTaskFormShell (right-side drawer instead of a
 *      bottom sheet), same as every other kiosk form this session.
 *   2. PickerOverlay's floating time-spinner card -> KioskDateTimePicker /
 *      openAndroidPicker (iOS inline-calendar-shaped time spinner /
 *      Android native dialog), matching the "separate date/time pickers,
 *      similar to Add Med" convention established for Smart Tasker.
 *      Meal time is time-only (no date component — it always applies to
 *      the day already being added/edited), so this only needs the
 *      mode="time" half of that pattern, not the full date+time pair.
 *
 * MealFormSheet.tsx/PickerOverlay.tsx are completely untouched.
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Meal, MEAL_TYPES, MEAL_EMOJIS, DIETARY_OPTIONS, MEAL_TYPE_COLOR } from '@/features/vault/tabs/meals/types';
import { em } from '@/features/vault/tabs/meals/styles';
import { fmtTimeLabel } from '@/features/quests/components/questFormShared';
import { KioskTaskFormShell } from './KioskTaskFormShell';
import { KioskDateTimePicker, openAndroidPicker } from './KioskDateTimePicker';
import { useKioskColors } from '../kioskPalette';

// Kiosk-only reduction from mobile's own 3-step Basics/Details/Recipe flow
// down to 2: 'basics' now also carries the real 'details' content (who's
// cooking, prep time, dietary tags) on the same screen — same merge
// pattern KioskAddChoreForm.tsx/KioskAddEventForm.tsx already use for
// their own what+when steps, kiosk's wide drawer has the room to show
// both without scrolling past a single field group (live-requested: "we
// can reduce the add meal steppers since this is bigger screen").
// MealFormSheet.tsx's own 3-step flow is untouched.
const STEPS = ['basics', 'recipe'] as const;
type Step = typeof STEPS[number];
const STEP_TITLES: Record<Step, string> = {
  basics: 'Meal & Who', recipe: 'Ingredients & Steps',
};

function parseTimeLabel(label: string | null | undefined): Date | null {
  if (!label) return null;
  const m = label.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (m[3] === 'PM' && h !== 12) h += 12;
  if (m[3] === 'AM' && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, parseInt(m[2], 10), 0, 0);
  return d;
}

export interface MealFormPatch {
  title: string; type: string; emoji: string;
  chef_id: string | null; prep_minutes: number | null;
  dietary_tags: string[]; ingredients: string[]; prep_steps: string[];
  start_time: string | null; timezone: string | null;
}

export function KioskMealFormDrawer({
  visible, day, editingMeal, members, colors, isDark, onClose, onSave, saving,
}: {
  visible: boolean;
  day: string | null;
  editingMeal: Meal | null;
  members: any[]; colors: any; isDark: boolean;
  onClose: () => void;
  onSave: (patch: MealFormPatch) => void | Promise<void>;
  saving?: boolean;
}) {
  const { k } = useKioskColors();
  const isEdit = !!editingMeal;
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);

  const [title, setTitle]           = useState('');
  const [type, setType]             = useState('dinner');
  const [emoji, setEmoji]           = useState('🍽️');
  const [showEmoji, setShowEmoji]   = useState(false);
  const [chefId, setChefId]         = useState('');
  const [prepMins, setPrepMins]     = useState('');
  const [dietTags, setDietTags]     = useState<string[]>([]);
  const [ingredients, setIngredients] = useState('');
  const [prepSteps, setPrepSteps]     = useState('');
  const [startTime, setStartTime]     = useState<Date | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setTouched(false);
    if (editingMeal) {
      setTitle(editingMeal.title ?? '');
      setType(editingMeal.type ?? 'dinner');
      setEmoji(editingMeal.emoji ?? '🍽️');
      setChefId(editingMeal.chef_id ?? '');
      setPrepMins(editingMeal.prep_minutes ? String(editingMeal.prep_minutes) : '');
      setDietTags(editingMeal.dietary_tags ?? []);
      setIngredients((editingMeal.ingredients ?? []).join('\n'));
      setPrepSteps((editingMeal.prep_steps ?? []).join('\n'));
      setStartTime(parseTimeLabel(editingMeal.start_time));
    } else {
      setTitle(''); setType('dinner'); setEmoji('🍽️'); setChefId('');
      setPrepMins(''); setDietTags([]); setIngredients(''); setPrepSteps('');
      setStartTime(null);
    }
  }, [visible, editingMeal]);

  const typeColor = MEAL_TYPE_COLOR[type] ?? colors.amber;

  const stepIds = STEPS;
  const currentStepId = stepIds[step];

  const handleSave = () => {
    if (!title.trim()) { setStep(0); setTouched(true); return; }
    onSave({
      title: title.trim(), type, emoji,
      chef_id: chefId || null,
      prep_minutes: prepMins ? parseInt(prepMins) : null,
      dietary_tags: dietTags,
      ingredients: ingredients.split('\n').map(s => s.trim()).filter(Boolean),
      prep_steps: prepSteps.split('\n').map(s => s.trim()).filter(Boolean),
      start_time: startTime ? fmtTimeLabel(startTime) : null,
      timezone: startTime ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
    });
  };

  return (
    <KioskTaskFormShell
      visible={visible}
      onClose={onClose}
      stepIds={stepIds}
      stepTitles={STEP_TITLES}
      step={step}
      setStep={(next) => {
        // Basics blocks advancing without a title — same real gate
        // MealFormSheet.tsx's own goNext enforces.
        const resolved = typeof next === 'function' ? (next as (p: number) => number)(step) : next;
        if (resolved > step && currentStepId === 'basics' && !title.trim()) {
          setTouched(true);
          return;
        }
        setStep(resolved);
      }}
      accentColor={typeColor}
      headerTitle={isEdit ? 'Edit Meal' : `Add Meal — ${day}`}
      headerSubtitle={STEP_TITLES[currentStepId]}
      reviewStepId="recipe"
    >
      {currentStepId === 'basics' && <>
        {showEmoji && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderRadius: 16,
            backgroundColor: isDark ? colors.surface : '#F0EEFF',
            borderWidth: 1, borderColor: colors.accent + '30', marginBottom: 12 }}>
            {MEAL_EMOJIS.map(e => (
              <TouchableOpacity key={e} onPress={() => { setEmoji(e); setShowEmoji(false); }}
                style={{ width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: emoji === e ? colors.accent + '25' : 'transparent' }}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity onPress={() => setShowEmoji(v => !v)}
          style={{ alignSelf: 'flex-start', width: 46, height: 46, borderRadius: 14, marginBottom: 10,
            backgroundColor: typeColor + '20',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: typeColor + '40' }}>
          <Text style={{ fontSize: 26 }}>{emoji}</Text>
        </TouchableOpacity>

        <Text style={em.label}>Meal Name</Text>
        <TextInput value={title} onChangeText={setTitle}
          placeholder="e.g. Grilled Chicken & Veggies"
          placeholderTextColor={colors.textTertiary}
          style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, fontWeight: '600',
            marginBottom: touched && !title.trim() ? 4 : 10,
            backgroundColor: isDark ? colors.surface : colors.background,
            borderColor: touched && !title.trim() ? colors.danger : colors.border,
            color: colors.textPrimary }} />
        {touched && !title.trim() && (
          <Text style={{ fontSize: 11, color: colors.danger, marginBottom: 10 }}>Meal name is required</Text>
        )}

        <Text style={em.label}>Meal Type</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {MEAL_TYPES.map(t => {
            const tc = MEAL_TYPE_COLOR[t.toLowerCase()] ?? colors.amber;
            const sel = type === t.toLowerCase();
            return (
              <TouchableOpacity key={t} onPress={() => setType(t.toLowerCase())}
                style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, paddingVertical: 9,
                  alignItems: 'center', gap: 2,
                  backgroundColor: sel ? tc + '18' : 'transparent',
                  borderColor: sel ? tc : colors.border }}>
                <Text style={{ fontSize: 14 }}>
                  {t === 'Breakfast' ? '🌅' : t === 'Lunch' ? '☀️' : t === 'Dinner' ? '🌙' : '🍎'}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '800', color: sel ? tc : colors.textSecondary }}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={em.label}>Meal Time (optional — for a reminder)</Text>
        <TouchableOpacity
          onPress={() => {
            if (Platform.OS === 'android') {
              openAndroidPicker({ mode: 'time', value: startTime ?? new Date(), onChange: setStartTime });
            } else {
              setShowTimePicker(v => !v);
            }
          }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11,
            marginBottom: 10, backgroundColor: isDark ? colors.surface : colors.background,
            borderColor: showTimePicker ? typeColor : colors.border }}>
          <Text style={{ fontSize: 13, fontWeight: '600',
            color: startTime ? colors.textPrimary : colors.textTertiary }}>
            🕐 {startTime ? fmtTimeLabel(startTime) : 'No reminder set'}
          </Text>
          {startTime && (
            <TouchableOpacity onPress={() => { setStartTime(null); setShowTimePicker(false); }} hitSlop={8}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>Clear</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {Platform.OS === 'ios' && (
          <KioskDateTimePicker
            mode="time" visible={showTimePicker} k={k} isDark={isDark}
            value={startTime ?? new Date()}
            onChange={setStartTime}
            onDone={() => setShowTimePicker(false)}
          />
        )}

        {/* ── Who & Diet — merged onto this same step (kiosk-only
             reduction, see STEPS comment above); mobile's own
             MealFormSheet.tsx keeps this as its separate 'details' step. ── */}
        <Text style={em.label}>Who's Cooking</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setChefId('')}
              style={{ borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7,
                backgroundColor: !chefId ? colors.teal + '20' : 'transparent',
                borderColor: !chefId ? colors.teal : colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: '800',
                color: !chefId ? colors.teal : colors.textSecondary }}>Anyone</Text>
            </TouchableOpacity>
            {members.map(m => {
              const sel = chefId === m.id;
              const initials = (m.name as string).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
              const hue = (m.name as string).charCodeAt(0) % 360;
              const avatarBg = `hsl(${hue},60%,55%)`;
              return (
                <TouchableOpacity key={m.id} onPress={() => setChefId(m.id)}
                  style={{ alignItems: 'center', gap: 3 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18,
                    backgroundColor: avatarBg,
                    borderWidth: 2.5, borderColor: sel ? colors.teal : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>{initials}</Text>
                  </View>
                  <Text style={{ fontSize: 9, fontWeight: '700',
                    color: sel ? colors.teal : colors.textTertiary }}>
                    {(m.name as string).split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <Text style={em.label}>Prep Time</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
          borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 9,
          backgroundColor: isDark ? colors.surface : colors.background,
          borderColor: colors.border, marginBottom: 10, alignSelf: 'flex-start', width: 140 }}>
          <TextInput value={prepMins} onChangeText={setPrepMins} placeholder="30"
            placeholderTextColor={colors.textTertiary} keyboardType="numeric"
            style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary }} />
          <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '700' }}>min</Text>
        </View>

        <Text style={em.label}>Dietary Tags</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {DIETARY_OPTIONS.map(tag => {
            const sel = dietTags.includes(tag);
            return (
              <TouchableOpacity key={tag}
                onPress={() => setDietTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5,
                  backgroundColor: sel ? colors.teal + '22' : 'transparent',
                  borderColor: sel ? colors.teal : colors.border }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: sel ? colors.teal : colors.textSecondary }}>{tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </>}

      {currentStepId === 'recipe' && <>
        <Text style={em.label}>Ingredients (one per line)</Text>
        <TextInput value={ingredients} onChangeText={setIngredients}
          placeholder={'chicken breast\nquinoa\nlemon\nolive oil'}
          placeholderTextColor={colors.textTertiary} multiline numberOfLines={4}
          style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13,
            marginBottom: 10, height: 100, textAlignVertical: 'top',
            backgroundColor: isDark ? colors.surface : colors.background,
            borderColor: colors.border, color: colors.textPrimary }} />

        <Text style={em.label}>Steps (one per line)</Text>
        <TextInput value={prepSteps} onChangeText={setPrepSteps}
          placeholder={'Season chicken\nBoil quinoa 15 min\nGrill 6 min each side'}
          placeholderTextColor={colors.textTertiary} multiline numberOfLines={5}
          style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13,
            marginBottom: 10, height: 120, textAlignVertical: 'top',
            backgroundColor: isDark ? colors.surface : colors.background,
            borderColor: colors.border, color: colors.textPrimary }} />

        <TouchableOpacity onPress={handleSave} disabled={!title.trim() || saving}
          style={{ borderRadius: 16, paddingVertical: 14, alignItems: 'center',
            backgroundColor: typeColor, opacity: title.trim() ? 1 : 0.4,
            flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>
            {saving ? 'Saving…' : isEdit ? '✅ Save Changes' : '+ Add Meal'}
          </Text>
        </TouchableOpacity>
      </>}
    </KioskTaskFormShell>
  );
}
