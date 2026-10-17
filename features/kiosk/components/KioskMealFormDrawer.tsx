/**
 * KioskMealFormDrawer — add / edit a meal in a right-side drawer, with every
 * field the phone's MealFormSheet asks for, as pastel field cards:
 * date (read-only), meal type, title with emoji, time (for a reminder), chef,
 * servings, prep time, dietary tags, ingredients, steps, the recipe you can
 * type or dictate, and a note. The save patch is the same shape the phone
 * writes to family_meals (servings, the note and the dictated recipe are not
 * columns, exactly like the phone; the dictated recipe fills the steps when
 * they were left empty so nothing typed is lost).
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, StyleSheet } from 'react-native';
import { UtensilsCrossed, Mic } from 'lucide-react-native';
import { Meal, MEAL_TYPES, MEAL_EMOJIS, DIETARY_OPTIONS } from '@/features/vault/tabs/meals/types';
import { fmtTimeLabel } from '@/features/quests/components/questFormShared';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { KioskFormDrawer } from './KioskFormDrawer';
import { KioskDateTimePicker, openAndroidPicker } from './KioskDateTimePicker';
import { KioskAvatar } from './KioskAvatar';

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

const TYPE_EMOJI: Record<string, string> = { Breakfast: '🌅', Lunch: '☀️', Dinner: '🌙', Snack: '🍎' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* Module-level so a re-render never remounts a text field and drops the keyboard. */
function Card({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) {
  const { k } = useKioskColors();
  return (
    <View style={[s.card, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
      <Text style={[s.label, { color: tone ?? k.textFaint }]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}
function Chip({ label, on, onPress, tone, disabled }: { label: string; on: boolean; onPress: () => void; tone: { card: string; fg: string }; disabled?: boolean }) {
  const { k } = useKioskColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: on, disabled }} accessibilityLabel={label}
      style={[s.chip, { backgroundColor: on ? k.primary : tone.card }, disabled && { opacity: 0.35 }]}>
      <Text style={[s.chipT, { color: on ? k.onPrimary : tone.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function KioskMealFormDrawer({
  visible, day, weekOf, editingMeal, existingMeals = [], members, onClose, onSave, saving,
}: {
  /** Meals already planned (this and next week), so a day never gets the same type twice. */
  existingMeals?: Meal[];
  visible: boolean;
  day: string | null;
  /** Monday (YYYY-MM-DD) of the week being added to; used for the date line. */
  weekOf?: string;
  editingMeal: Meal | null;
  members: any[];
  colors?: any; isDark?: boolean;
  onClose: () => void;
  /** Resolves to a message when the save is refused (the drawer stays open and shows it), or nothing on success. */
  onSave: (patch: MealFormPatch) => void | string | Promise<void | string>;
  saving?: boolean;
}) {
  const { k, isDark } = useKioskColors();
  const pastels = kioskPastels(k);
  const dictation = useVoiceDictation();
  const isEdit = !!editingMeal;
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [touched, setTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('dinner');
  const [emoji, setEmoji] = useState('🍽️');
  const [showEmoji, setShowEmoji] = useState(false);
  const [chefId, setChefId] = useState('');
  const [servings, setServings] = useState('');
  const [prepMins, setPrepMins] = useState('');
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState('');
  const [prepSteps, setPrepSteps] = useState('');
  const [recipeText, setRecipeText] = useState('');
  const [note, setNote] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const listening = dictation.state === 'listening';
  const mealDay = day ?? editingMeal?.day;
  const mealWeek = editingMeal?.week_of ?? weekOf;
  const taken = new Set(existingMeals.filter(m => m.day === mealDay && m.week_of === mealWeek && m.id !== editingMeal?.id).map(m => (m.type ?? '').toLowerCase()));

  useEffect(() => {
    if (!visible) return;
    setTouched(false); setShowEmoji(false); setShowTimePicker(false); dictation.reset();
    if (editingMeal) {
      setTitle(editingMeal.title ?? ''); setType(editingMeal.type ?? 'dinner'); setEmoji(editingMeal.emoji ?? '🍽️');
      setChefId(editingMeal.chef_id ?? ''); setServings('');
      setPrepMins(editingMeal.prep_minutes ? String(editingMeal.prep_minutes) : '');
      setDietTags(editingMeal.dietary_tags ?? []);
      setIngredients((editingMeal.ingredients ?? []).join('\n'));
      setPrepSteps((editingMeal.prep_steps ?? []).join('\n'));
      setRecipeText(''); setNote('');
      setStartTime(parseTimeLabel(editingMeal.start_time));
    } else {
      setTitle(''); setType(['dinner', 'lunch', 'breakfast', 'snack'].find(t => !taken.has(t)) ?? 'dinner'); setEmoji('🍽️'); setChefId(''); setServings(''); setPrepMins('');
      setDietTags([]); setIngredients(''); setPrepSteps(''); setRecipeText(''); setNote(''); setStartTime(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingMeal]);

  const lines = (t: string) => t.split('\n').map(x => x.trim()).filter(Boolean);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => { if (visible) setFormError(null); }, [visible]);
  const save = async () => {
    setFormError(null);
    if (!title.trim()) { setTouched(true); setFormError('Give the meal a name.'); return; }
    if (taken.has(type)) { setFormError(`This day already has a ${type}. Pick a different meal type, or edit the existing one.`); return; }
    const steps = lines(prepSteps);
    const err = await onSave({
      title: title.trim(), type, emoji,
      chef_id: chefId || null,
      prep_minutes: prepMins ? parseInt(prepMins, 10) : null,
      dietary_tags: dietTags,
      ingredients: lines(ingredients),
      prep_steps: steps.length ? steps : lines(recipeText),
      start_time: startTime ? fmtTimeLabel(startTime) : null,
      timezone: startTime ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
    });
    if (typeof err === 'string' && err) setFormError(err);
  };
  const stopVoice = async () => { const t = await dictation.stop(); if (t) setRecipeText(p => (p ? p + ' ' : '') + t); };

  const dateLine = (() => {
    const name = day ?? editingMeal?.day;
    const idx = DAYS.indexOf(name ?? '');
    if (idx < 0) return '—';
    const base = new Date((editingMeal?.week_of ?? weekOf ?? '') + 'T00:00:00');
    const d = isNaN(base.getTime()) ? new Date() : base;
    if (isNaN(base.getTime())) d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setDate(d.getDate() + idx);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  })();

  return (
    <KioskFormDrawer visible={visible} variant="drawer" title={isEdit ? 'Edit meal' : 'Add a meal'} subtitle={isEdit ? editingMeal?.title : dateLine}
      accent={k.gold} Icon={UtensilsCrossed} k={k} onClose={onClose}
      submitLabel={isEdit ? 'Save meal' : 'Add meal'} onSubmit={save} canSubmit submitting={saving} error={formError}>
      <View style={s.body}>
        <Card label="Date"><Text style={[s.value, { color: k.text }]}>{dateLine}</Text></Card>

        <Card label="Meal type">
          <View style={s.wrap}>
            {MEAL_TYPES.map((t, i) => <Chip key={t} label={`${TYPE_EMOJI[t] ?? ''} ${t}${taken.has(t.toLowerCase()) ? ' · planned' : ''}`} on={type === t.toLowerCase()} disabled={taken.has(t.toLowerCase())} onPress={() => setType(t.toLowerCase())} tone={pastels[(i + 1) % 4]} />)}
          </View>
        </Card>

        <Card label="Title" tone={k.purple}>
          <View style={s.titleRow}>
            <Pressable onPress={() => setShowEmoji(v => !v)} accessibilityRole="button" accessibilityLabel="Change emoji" style={[s.emoji, { backgroundColor: k.pastelAmberCard }]}>
              <Text style={{ fontSize: 26 }}>{emoji}</Text>
            </Pressable>
            <Text style={[s.hint, { color: k.textFaint }]}>Tap to change emoji</Text>
          </View>
          {showEmoji && (
            <View style={[s.wrap, s.emojiGrid, { backgroundColor: k.well }]}>
              {MEAL_EMOJIS.map(e => (
                <Pressable key={e} onPress={() => { setEmoji(e); setShowEmoji(false); }} style={[s.emojiBtn, emoji === e && { backgroundColor: k.pastelLavCard }]}><Text style={{ fontSize: 24 }}>{e}</Text></Pressable>
              ))}
            </View>
          )}
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Lemon chicken bowls" placeholderTextColor={k.textFaint}
            style={[s.input, { color: k.text, backgroundColor: k.well, borderColor: touched && !title.trim() ? k.danger : k.cardBorder }]} accessibilityLabel="Meal name" />
          {touched && !title.trim() && <Text style={{ color: k.danger, fontSize: KIOSK_TYPO.label, fontWeight: '700' }}>Meal name is required</Text>}
        </Card>

        <Card label="Time · reminder">
          <Pressable
            onPress={() => { if (Platform.OS === 'android') openAndroidPicker({ mode: 'time', value: startTime ?? new Date(), onChange: setStartTime }); else setShowTimePicker(v => !v); }}
            accessibilityRole="button" style={[s.input, s.timeRow, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
            <Text style={[s.value, { color: startTime ? k.text : k.textFaint, flex: 1 }]}>🕐 {startTime ? fmtTimeLabel(startTime) : 'No reminder set'}</Text>
            {!!startTime && <Pressable onPress={() => { setStartTime(null); setShowTimePicker(false); }} hitSlop={8}><Text style={{ color: k.danger, fontWeight: '800' }}>Clear</Text></Pressable>}
          </Pressable>
          {Platform.OS === 'ios' && (
            <KioskDateTimePicker mode="time" visible={showTimePicker} k={k} isDark={isDark} value={startTime ?? new Date()} onChange={setStartTime} onDone={() => setShowTimePicker(false)} />
          )}
        </Card>

        <Card label="Chef">
          <View style={s.wrap}>
            <Chip label="Anyone" on={!chefId} onPress={() => setChefId('')} tone={pastels[0]} />
            {members.map((m, i) => (
              <Pressable key={m.id} onPress={() => setChefId(m.id)} accessibilityRole="button" accessibilityState={{ selected: chefId === m.id }}
                style={[s.chip, s.chefChip, { backgroundColor: chefId === m.id ? k.primary : pastels[(i + 1) % 4].card }]}>
                <KioskAvatar name={m.name} size={28} bgColor={k.card} k={k} />
                <Text style={[s.chipT, { color: chefId === m.id ? k.onPrimary : pastels[(i + 1) % 4].fg }]}>{(m.name as string).split(' ')[0]}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <View style={s.two}>
          <View style={{ flex: 1 }}>
            <Card label="Servings">
              <TextInput value={servings} onChangeText={t => setServings(t.replace(/\D/g, ''))} placeholder={String(members.length || 4)} placeholderTextColor={k.textFaint} keyboardType="number-pad"
                style={[s.input, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder }]} accessibilityLabel="Servings" />
            </Card>
          </View>
          <View style={{ flex: 1 }}>
            <Card label="Prep time">
              <View style={s.timeRow}>
                <TextInput value={prepMins} onChangeText={t => setPrepMins(t.replace(/\D/g, ''))} placeholder="35" placeholderTextColor={k.textFaint} keyboardType="number-pad"
                  style={[s.input, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder, flex: 1 }]} accessibilityLabel="Prep minutes" />
                <Text style={[s.hint, { color: k.textFaint }]}>minutes</Text>
              </View>
            </Card>
          </View>
        </View>

        <Card label="Dietary tags · optional" tone={k.sage}>
          <View style={s.wrap}>
            {DIETARY_OPTIONS.map((t, i) => <Chip key={t} label={t} on={dietTags.includes(t)} onPress={() => setDietTags(p => (p.includes(t) ? p.filter(x => x !== t) : [...p, t]))} tone={pastels[(i + 1) % 4]} />)}
          </View>
        </Card>

        <Card label="Ingredients" tone={k.sage}>
          <TextInput value={ingredients} onChangeText={setIngredients} placeholder={'chicken breast\nquinoa\nlemon\nolive oil'} placeholderTextColor={k.textFaint} multiline
            style={[s.input, s.area, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder }]} accessibilityLabel="Ingredients" />
        </Card>

        <Card label="Steps · one per line" tone={k.sage}>
          <TextInput value={prepSteps} onChangeText={setPrepSteps} placeholder={'Season chicken\nBoil quinoa 15 min\nGrill 6 min each side'} placeholderTextColor={k.textFaint} multiline
            style={[s.input, s.area, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder }]} accessibilityLabel="Steps" />
        </Card>

        <Card label="Recipe · type or speak" tone={k.purple}>
          <Text style={[s.hint, { color: k.textMuted }]}>Add a full recipe description, or tap the mic to speak it and it is typed here.</Text>
          <TextInput value={recipeText} onChangeText={setRecipeText} placeholder="Describe the full recipe, cooking tips, serving suggestions…" placeholderTextColor={k.textFaint} multiline
            style={[s.input, s.area, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder, minHeight: 130 }]} accessibilityLabel="Recipe" />
          <View style={s.wrap}>
            <Pressable onPress={listening ? stopVoice : () => dictation.start()} accessibilityRole="button" accessibilityLabel={listening ? 'Stop recording' : 'Speak the recipe'}
              style={[s.micBtn, { backgroundColor: listening ? k.danger : k.pastelLavCard }]}>
              <Mic size={18} color={listening ? k.onAccent : k.purple} />
              <Text style={[s.chipT, { color: listening ? k.onAccent : k.purple }]}>{listening ? 'Tap to stop recording' : 'Speak recipe aloud'}</Text>
            </Pressable>
            {recipeText.length > 0 && <Pressable onPress={() => setRecipeText('')} accessibilityRole="button" style={[s.micBtn, { backgroundColor: k.well }]}><Text style={[s.chipT, { color: k.textMuted }]}>Clear</Text></Pressable>}
          </View>
        </Card>

        <Card label="Note · optional">
          <TextInput value={note} onChangeText={setNote} placeholder="e.g. Ava can help assemble bowls after study group." placeholderTextColor={k.textFaint} multiline
            style={[s.input, s.area, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder, minHeight: 80 }]} accessibilityLabel="Note" />
        </Card>
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  body: { gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl },
  card: { borderRadius: KIOSK_RADIUS.lg, borderWidth: 1.5, padding: 14, gap: 10 },
  label: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1 },
  value: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  hint: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { minHeight: 44, borderRadius: 100, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  chefChip: { flexDirection: 'row', gap: 8, paddingLeft: 8 },
  chipT: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emojiGrid: { padding: 10, borderRadius: 14 },
  emojiBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  area: { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  two: { flexDirection: 'row', gap: KIOSK_SPACE.md },
  micBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 16 },
});
