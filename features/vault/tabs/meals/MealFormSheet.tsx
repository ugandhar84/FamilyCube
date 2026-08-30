import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Modal,
  KeyboardAvoidingView, Platform, Keyboard, StyleSheet, ActivityIndicator,
} from 'react-native';
import { X, ChevronLeft } from 'lucide-react-native';
import { Meal, MEAL_TYPES, MEAL_EMOJIS, DIETARY_OPTIONS, MEAL_TYPE_COLOR } from './types';
import { em } from './styles';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';
import { fmtTimeLabel } from '@/features/quests/components/questFormShared';
import StepProgressBar from '@/components/StepProgressBar';
import StepTransition from '@/components/StepTransition';

// ─── Meal Form Sheet — shared Add/Edit stepper ─────────────────────────────────
//
// Was two separate components (AddMealSheet.tsx with 11 fields lifted up
// into MealsTab.tsx's own state, EditMealModal.tsx with its own internal
// state seeded from a `meal` prop) hand-maintaining the same 8-field form
// twice. One component now, self-contained state either way — `day`
// (add mode) or `editingMeal` (edit mode) decides which; MealsTab.tsx only
// ever sees a single onSave(patch) callback, matching EditMealModal's
// original, simpler contract.
//
// Stepper — was one long scroll cramming all 8 fields into a single pass.
// Broken into steps matching AddMedModal's own "only the first step is
// required, the rest are skippable via Next" pattern: Basics is the only
// step that blocks Save (name required); Details and Recipe are optional.
const STEPS = ['basics', 'details', 'recipe'] as const;
type Step = typeof STEPS[number];
const STEP_TITLES: Record<Step, string> = {
  basics: 'Name & Type', details: 'Who & Diet', recipe: 'Ingredients & Steps',
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

export default function MealFormSheet({
  visible, day, editingMeal, members, colors, isDark, onClose, onSave, saving,
}: {
  visible: boolean;
  day: string | null;              // add mode: which day this meal is for
  editingMeal: Meal | null;        // edit mode: the meal being edited
  members: any[]; colors: any; isDark: boolean;
  onClose: () => void;
  onSave: (patch: MealFormPatch) => void | Promise<void>;
  saving?: boolean;
}) {
  const isEdit = !!editingMeal;
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(90);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
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

  // Fresh state (pre-filled for edit, blank for add) every time the sheet
  // opens — same reset-on-open pattern AddMedModal uses for stepIndex.
  useEffect(() => {
    if (!visible) return;
    setStepIndex(0);
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

  const goNext = () => {
    if (step === 'basics' && !title.trim()) { setTouched(true); return; }
    if (stepIndex < STEPS.length - 1) setStepIndex(i => i + 1);
  };
  const goBack = () => { if (stepIndex > 0) setStepIndex(i => i - 1); };

  const handleSave = () => {
    if (!title.trim()) { setStepIndex(0); setTouched(true); return; }
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
            paddingHorizontal: 20, paddingTop: 12, maxHeight: keyboardAwareMaxHeight ?? '90%',
            backgroundColor: isDark ? colors.card : '#FAFAFA' }}>

            {/* Drag handle */}
            <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border,
              alignSelf: 'center', marginBottom: 14 }} />

            {/* Fixed header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                {stepIndex > 0 && (
                  <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <ChevronLeft size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowEmoji(v => !v)}
                  style={{ width: 46, height: 46, borderRadius: 14,
                    backgroundColor: typeColor + '20',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: typeColor + '40' }}>
                  <Text style={{ fontSize: 26 }}>{emoji}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary }}>
                    {stepIndex === 0 ? (isEdit ? 'Edit Meal' : `Add Meal — ${day}`) : STEP_TITLES[step]}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: typeColor, marginTop: 1 }}>
                    Step {stepIndex + 1} of {STEPS.length}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Step progress */}
            <View style={{ marginBottom: 12 }}>
              <StepProgressBar stepCount={STEPS.length} activeIndex={stepIndex} accentColor={typeColor} trackColor={colors.border} />
            </View>

            {/* Scrollable body */}
            {/* No automaticallyAdjustKeyboardInsets — double-compensates
                alongside this sheet's own KeyboardAvoidingView for the same
                keyboard event, producing a blank gap above the real content
                (see AppBottomSheet.tsx's fix for the full writeup). */}
            <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}>
              <StepTransition stepKey={step}>

              {step === 'basics' && (
                <>
                  {/* Emoji picker */}
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

                  {/* Meal name */}
                  <Text style={em.label}>Meal Name</Text>
                  <TextInput value={title} onChangeText={setTitle}
                    placeholder="e.g. Grilled Chicken & Veggies"
                    placeholderTextColor={colors.textTertiary} autoFocus={!isEdit}
                    style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, fontWeight: '600',
                      marginBottom: touched && !title.trim() ? 4 : 10,
                      backgroundColor: isDark ? colors.surface : colors.background,
                      borderColor: touched && !title.trim() ? colors.danger : colors.border,
                      color: colors.textPrimary }} />
                  {touched && !title.trim() && (
                    <Text style={{ fontSize: 11, color: colors.danger, marginBottom: 10 }}>Meal name is required</Text>
                  )}

                  {/* Meal type */}
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

                  {/* Meal time (optional — powers the 1hr-before reminder) */}
                  <Text style={em.label}>Meal Time (optional — for a reminder)</Text>
                  <TouchableOpacity onPress={() => setShowTimePicker(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11,
                      marginBottom: 10, backgroundColor: isDark ? colors.surface : colors.background,
                      borderColor: colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: '600',
                      color: startTime ? colors.textPrimary : colors.textTertiary }}>
                      🕐 {startTime ? fmtTimeLabel(startTime) : 'No reminder set'}
                    </Text>
                    {startTime && (
                      <TouchableOpacity onPress={() => setStartTime(null)} hitSlop={8}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {step === 'details' && (
                <>
                  {/* Chef + prep time */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 2 }}>
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
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={em.label}>Prep Time</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                        borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 9,
                        backgroundColor: isDark ? colors.surface : colors.background,
                        borderColor: colors.border, marginBottom: 10 }}>
                        <TextInput value={prepMins} onChangeText={setPrepMins} placeholder="30"
                          placeholderTextColor={colors.textTertiary} keyboardType="numeric"
                          style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary }} />
                        <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '700' }}>min</Text>
                      </View>
                    </View>
                  </View>

                  {/* Dietary tags */}
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
                </>
              )}

              {step === 'recipe' && (
                <>
                  {/* Ingredients */}
                  <Text style={em.label}>Ingredients (one per line)</Text>
                  <TextInput value={ingredients} onChangeText={setIngredients}
                    placeholder={'chicken breast\nquinoa\nlemon\nolive oil'}
                    placeholderTextColor={colors.textTertiary} multiline numberOfLines={4}
                    style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13,
                      marginBottom: 10, height: 100, textAlignVertical: 'top',
                      backgroundColor: isDark ? colors.surface : colors.background,
                      borderColor: colors.border, color: colors.textPrimary }} />

                  {/* Steps */}
                  <Text style={em.label}>Steps (one per line)</Text>
                  <TextInput value={prepSteps} onChangeText={setPrepSteps}
                    placeholder={'Season chicken\nBoil quinoa 15 min\nGrill 6 min each side'}
                    placeholderTextColor={colors.textTertiary} multiline numberOfLines={5}
                    style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13,
                      marginBottom: 10, height: 120, textAlignVertical: 'top',
                      backgroundColor: isDark ? colors.surface : colors.background,
                      borderColor: colors.border, color: colors.textPrimary }} />
                </>
              )}

              </StepTransition>
            </ScrollView>

            {/* Footer — Back/Next through steps, Save on the last */}
            <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 16,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <TouchableOpacity onPress={stepIndex === 0 ? onClose : goBack}
                style={{ flex: 1, borderRadius: 16, borderWidth: 1.5, paddingVertical: 14,
                  alignItems: 'center', borderColor: colors.border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>
                  {stepIndex === 0 ? 'Cancel' : 'Back'}
                </Text>
              </TouchableOpacity>
              {stepIndex < STEPS.length - 1 ? (
                <TouchableOpacity onPress={goNext}
                  style={{ flex: 2, borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                    backgroundColor: colors.accent }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Next</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleSave} disabled={!title.trim() || saving}
                  style={{ flex: 2, borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                    backgroundColor: colors.accent, opacity: title.trim() ? 1 : 0.4,
                    flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>
                        {isEdit ? '✅ Save Changes' : '+ Add Meal'}
                      </Text>}
                </TouchableOpacity>
              )}
            </View>

          </View>
        </View>
      </KeyboardAvoidingView>

      <PickerOverlay
        showDate={false}
        showTime={showTimePicker}
        value={startTime ?? new Date()}
        onChangeDate={() => {}}
        onChangeTime={(d) => setStartTime(d)}
        onDone={() => setShowTimePicker(false)}
        accentColor={typeColor}
        colors={colors}
        timeLabel="🕐 What time is this meal?"
      />
    </Modal>
  );
}
