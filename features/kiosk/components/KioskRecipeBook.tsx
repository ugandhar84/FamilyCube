/**
 * KioskRecipeBook — the "Recipe book" area of the kiosk Meals page: the phone's
 * Family Recipe Book on the `family_recipes` table.
 *   · search + dietary filters, pastel recipe cards
 *   · a parent sees recipes kids proposed (status 'pending') and approves them
 *     (update → 'approved') or declines them (row deleted); a kid sees their own
 *     proposals with "Waiting for a parent"
 *   · tap a recipe: ingredients, steps, "Add to week" (inserts into
 *     family_meals for a chosen day + meal type), "Ingredients" to the grocery
 *     list, delete (parent)
 *   · Add recipe: emoji, title, dictate, AI refine (family-ai refine_recipe),
 *     tags, prep time, ingredients, steps. A kid's recipe goes to review.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Plus, Search, Mic, Sparkles, Trash2, ShoppingCart, CalendarPlus, Clock, Users } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { DIETARY_OPTIONS, type Meal } from '@/features/vault/tabs/meals/types';
import { localDateStr } from '@/lib/dates';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { KioskFormDrawer } from './KioskFormDrawer';
import { KioskAvatar } from './KioskAvatar';
import { Eyebrow, firstName } from './KioskHomeParts';

interface FamilyRecipe {
  id: string; family_id: string; title: string; emoji?: string | null; image_url?: string | null;
  ingredients: string[]; prep_steps: string[]; dietary_tags: string[];
  prep_minutes?: number | null; servings?: number | null; created_by?: string | null;
  created_at?: string; status?: 'pending' | 'approved';
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const FILTERS = ['All', 'Kid-Friendly', 'Vegetarian', 'Gluten-Free', 'High-Protein'];
/** The Monday of this week (offset 0) or next week (1), and one day's date in it. */
const mondayOf = (offset: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7); return d; };
const dayDate = (offset: number, i: number) => { const d = mondayOf(offset); d.setDate(d.getDate() + i); return d; };
const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/* Module-level building blocks (a component declared inside another's render is a
 * new type every render, which remounts text fields and drops the keyboard). */
function ChipBtn({ label, on, onPress, tone, disabled }: { label: string; on: boolean; onPress: () => void; tone?: string; disabled?: boolean }) {
  const { k } = useKioskColors();
  const t = tone ?? k.primary;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: on, disabled }} accessibilityLabel={label}
      style={[s.chip, { backgroundColor: on ? t : k.well }, disabled && { opacity: 0.4 }]}>
      <Text style={[s.chipText, { color: on ? k.onAccent : k.textMuted }]}>{label}</Text>
    </Pressable>
  );
}
function Field({ label, value, set, placeholder, multiline, numeric }: { label: string; value: string; set: (t: string) => void; placeholder: string; multiline?: boolean; numeric?: boolean }) {
  const { k } = useKioskColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.flab, { color: k.textFaint }]}>{label}</Text>
      <TextInput value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={k.textFaint} multiline={multiline}
        keyboardType={numeric ? 'number-pad' : undefined}
        style={[s.field, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder }, multiline && { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }]} />
    </View>
  );
}

export function KioskRecipeBook({ active, members }: { active: FamilyMember; members: FamilyMember[] }) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const isParent = active.role === 'parent';
  const familyId = active.familyId ?? '';
  const [recipes, setRecipes] = useState<FamilyRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [open, setOpen] = useState<FamilyRecipe | null>(null);
  const [adding, setAdding] = useState(false);
  // No default: the day and the meal type are both chosen on purpose, never silently today.
  const [pick, setPick] = useState<{ offset: number; i: number } | null>(null);
  const [pickType, setPickType] = useState<string | null>(null);
  const [planned, setPlanned] = useState<Meal[]>([]);

  const load = useCallback(async () => {
    if (!familyId) { setLoading(false); return; }
    const { data } = await supabase.from('family_recipes').select('*').eq('family_id', familyId).order('created_at', { ascending: false });
    if (data) setRecipes(data as FamilyRecipe[]);
    setLoading(false);
  }, [familyId]);
  useEffect(() => { load(); }, [load]);
  const loadPlanned = useCallback(async () => {
    if (!familyId) return;
    const { data } = await supabase.from('family_meals').select('id,day,type,week_of').in('week_of', [localDateStr(mondayOf(0)), localDateStr(mondayOf(1))]).eq('family_id', familyId);
    setPlanned((data ?? []) as Meal[]);
  }, [familyId]);
  useEffect(() => { if (open && open.status !== 'pending') { setPick(null); setPickType(null); loadPlanned(); } }, [open?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const visible = recipes.filter(r => r.status !== 'pending' || isParent || r.created_by === active.id);
  const pending = visible.filter(r => r.status === 'pending');
  const approved = visible.filter(r => r.status !== 'pending');
  const shown = useMemo(() => approved.filter(r => {
    const q = query.trim().toLowerCase();
    if (q && !(r.title.toLowerCase().includes(q) || r.ingredients?.some(i => i.toLowerCase().includes(q)))) return false;
    return filter === 'All' || (r.dietary_tags ?? []).some(t => t.toLowerCase() === filter.toLowerCase());
  }), [approved, query, filter]);
  const nameOf = (id?: string | null) => firstName(members.find(m => m.id === id));

  const review = async (r: FamilyRecipe, approve: boolean) => {
    if (approve) {
      await supabase.from('family_recipes').update({ status: 'approved' }).eq('id', r.id);
      setRecipes(p => p.map(x => (x.id === r.id ? { ...x, status: 'approved' } : x)));
      showToast(`${r.title} added to the recipe book`);
    } else {
      await supabase.from('family_recipes').delete().eq('id', r.id);
      setRecipes(p => p.filter(x => x.id !== r.id));
      showToast(`${r.title} declined`);
    }
    setOpen(null);
  };
  const remove = (r: FamilyRecipe) => Alert.alert('Delete this recipe?', `Remove "${r.title}" from the family recipe book?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('family_recipes').delete().eq('id', r.id); setRecipes(p => p.filter(x => x.id !== r.id)); setOpen(null); showToast('Recipe deleted'); } },
  ]);
  const addToList = (r: FamilyRecipe) => {
    const { addItem, items } = useGroceryStore.getState();
    let n = 0;
    (r.ingredients ?? []).forEach(name => {
      const clean = name.trim();
      if (clean && !items.some(e => e.name.toLowerCase() === clean.toLowerCase())) { addItem({ name: clean, category: 'Other', notes: `From ${r.title}`, familyId, addedBy: active.id }); n++; }
    });
    showToast(n ? `${n} ingredients added to the list` : 'Everything is already on the list');
  };
  /** Meal types already planned on the chosen day: a day never gets the same type twice. */
  const takenTypes = useMemo(() => {
    if (!pick) return new Set<string>();
    const wk = localDateStr(mondayOf(pick.offset)); const day = DAY_NAMES[pick.i];
    return new Set(planned.filter(m => m.week_of === wk && m.day === day).map(m => (m.type ?? '').toLowerCase()));
  }, [pick, planned]);
  const addToWeek = async (r: FamilyRecipe) => {
    if (!pick || !pickType) return;
    if (takenTypes.has(pickType.toLowerCase())) { showToast(`That day already has a ${pickType.toLowerCase()}`); return; }
    const wk = localDateStr(mondayOf(pick.offset)); const day = DAY_NAMES[pick.i];
    const id = `${familyId}-${wk}-${day}-recipe-${Date.now()}`;
    const { error } = await supabase.from('family_meals').insert({
      id, family_id: familyId, week_of: wk, day, title: r.title, type: pickType.toLowerCase(),
      emoji: r.emoji ?? null, ingredients: r.ingredients ?? [], prep_steps: r.prep_steps ?? [],
      dietary_tags: r.dietary_tags ?? [], prep_minutes: r.prep_minutes ?? null, chef_id: null, ai_generated: false,
    });
    if (error) { showToast('Could not add to the week. Try again.'); return; }
    showToast(`${r.title} added to ${DAY_FULL[day]}, ${shortDate(dayDate(pick.offset, pick.i))}, ${pickType.toLowerCase()}`);
    setOpen(null);
  };

  const card = (r: FamilyRecipe, i: number) => {
    const tone = pastels[i % pastels.length];
    return (
      <Pressable key={r.id} onPress={() => setOpen(r)} accessibilityRole="button" accessibilityLabel={`${r.title} recipe`}
        style={({ pressed }) => [s.rc, { backgroundColor: tone.col, borderColor: tone.card }, pressed && { opacity: 0.8 }]}>
        <View style={[s.rcPhoto, { backgroundColor: tone.card }]}><Text style={{ fontSize: 46 }}>{r.emoji ?? '🍽️'}</Text></View>
        <Text style={[s.rcTitle, { color: k.text }]} numberOfLines={2}>{r.title}</Text>
        <Text style={[s.rcMeta, { color: k.textMuted }]}>{[r.prep_minutes ? `${r.prep_minutes} min` : '', r.servings ? `serves ${r.servings}` : ''].filter(Boolean).join(' · ')}</Text>
        <View style={s.tags}>{(r.dietary_tags ?? []).slice(0, 3).map(t => <View key={t} style={[s.tag, { backgroundColor: k.card }]}><Text style={[s.tagText, { color: k.textMuted }]}>{t}</Text></View>)}</View>
        {!!r.created_by && <View style={s.by}><KioskAvatar name={nameOf(r.created_by)} size={22} bgColor={k.card} k={k} /><Text style={[s.rcMeta, { color: k.textMuted }]}>by {nameOf(r.created_by)}</Text></View>}
      </Pressable>
    );
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={[s.title, { color: k.text }]}>Family recipe book</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel={isParent ? 'Add a recipe' : 'Propose a recipe'} style={[s.addBtn, { backgroundColor: k.primary }]}>
          <Plus size={18} color={k.onPrimary} strokeWidth={2.5} /><Text style={[s.addText, { color: k.onPrimary }]}>{isParent ? 'Add recipe' : 'Propose recipe'}</Text>
        </Pressable>
      </View>
      <View style={s.filters}>
        <View style={[s.search, { backgroundColor: k.well }]}>
          <Search size={16} color={k.textFaint} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search recipes or ingredients" placeholderTextColor={k.textFaint} style={[s.searchInput, { color: k.text }]} accessibilityLabel="Search recipes" />
        </View>
        {FILTERS.map(f => <ChipBtn key={f} label={f} on={filter === f} onPress={() => setFilter(f)} tone={k.text} />)}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
        {pending.length > 0 && (
          <View style={[s.pend, { backgroundColor: isParent ? k.pastelPrimary : k.pastelLav }]}>
            <Eyebrow label={isParent ? 'WAITING FOR YOUR OK' : 'MY PROPOSED RECIPES'} accent={isParent ? k.terracotta : k.purple} k={k} />
            {pending.map(r => (
              <View key={r.id} style={[s.pendRow, { backgroundColor: k.card }]}>
                <Text style={{ fontSize: 26 }}>{r.emoji ?? '🍽️'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.rcTitle, { color: k.text }]} numberOfLines={1}>{r.title}</Text>
                  <Text style={[s.rcMeta, { color: k.textMuted }]}>{isParent ? `Proposed by ${nameOf(r.created_by)}` : 'Waiting for a parent'}{r.prep_minutes ? ` · ${r.prep_minutes} min` : ''}</Text>
                </View>
                <Pressable onPress={() => setOpen(r)} accessibilityRole="button" style={[s.sbtn, { backgroundColor: k.well }]}><Text style={[s.sbtnText, { color: k.text }]}>View</Text></Pressable>
                {isParent && <>
                  <Pressable onPress={() => review(r, false)} accessibilityRole="button" style={[s.sbtn, { backgroundColor: k.well }]}><Text style={[s.sbtnText, { color: k.text }]}>Decline</Text></Pressable>
                  <Pressable onPress={() => review(r, true)} accessibilityRole="button" style={[s.sbtn, { backgroundColor: k.primary }]}><Text style={[s.sbtnText, { color: k.onPrimary }]}>Approve</Text></Pressable>
                </>}
              </View>
            ))}
          </View>
        )}
        {loading ? <ActivityIndicator color={k.gold} style={{ marginTop: KIOSK_SPACE.xl }} />
          : shown.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>{approved.length === 0 ? 'No recipes yet. Add the first one.' : 'No recipes match.'}</Text>
          : <View style={s.grid}>{shown.map(card)}</View>}
      </ScrollView>

      {/* Recipe detail */}
      <KioskFormDrawer visible={!!open} variant="drawer" title={open?.title ?? ''} subtitle={open ? [open.prep_minutes ? `${open.prep_minutes} min` : '', open.servings ? `serves ${open.servings}` : '', open.created_by ? `by ${nameOf(open.created_by)}` : ''].filter(Boolean).join(' · ') : ''}
        accent={k.sage} Icon={Users} k={k} onClose={() => setOpen(null)}>
        {open && (
          <View style={s.dBody}>
            <View style={s.tags}>{(open.dietary_tags ?? []).map(t => <View key={t} style={[s.tag, { backgroundColor: k.pastelSageCard }]}><Text style={[s.tagText, { color: k.sage }]}>{t}</Text></View>)}</View>
            {open.status !== 'pending' && (
              <View style={{ gap: 8 }}>
                <Eyebrow label="ADD TO THE WEEK" accent={k.primary} k={k} />
                {[0, 1].map(off => (
                  <View key={off} style={{ gap: 6 }}>
                    <Text style={[s.rcMeta, { color: k.textFaint }]}>{off === 0 ? 'THIS WEEK' : 'NEXT WEEK'}</Text>
                    <View style={s.wrapRow}>
                      {DAY_NAMES.map((d, i) => {
                        const dt = dayDate(off, i);
                        const past = dt < new Date(new Date().setHours(0, 0, 0, 0));
                        const on = pick?.offset === off && pick.i === i;
                        return (
                          <Pressable key={d} disabled={past} onPress={() => { setPick({ offset: off, i }); setPickType(null); }} accessibilityRole="button" accessibilityState={{ selected: on, disabled: past }}
                            accessibilityLabel={`${DAY_FULL[d]}, ${shortDate(dt)}`}
                            style={[s.dayPill, { backgroundColor: on ? k.primary : past ? k.well : k.pastelSage, opacity: past ? 0.4 : 1 }]}>
                            <Text style={[s.dayT, { color: on ? k.onPrimary : past ? k.textMuted : k.sage }]}>{d}</Text>
                            <Text style={[s.dayD, { color: on ? k.onPrimary : k.textFaint }]}>{shortDate(dt)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
                <Text style={[s.rcMeta, { color: k.textFaint }]}>MEAL TYPE</Text>
                <View style={s.wrapRow}>
                  {MEAL_TYPES.map(t => {
                    const taken = takenTypes.has(t.toLowerCase());
                    return <ChipBtn key={t} label={taken ? `${t} · planned` : t} on={pickType === t} onPress={() => !taken && pick && setPickType(t)} tone={k.sage} disabled={taken || !pick} />;
                  })}
                </View>
                {!pick && <Text style={[s.rcMeta, { color: k.textMuted }]}>Pick a day, then a meal type.</Text>}
                <View style={s.wrapRow}>
                  <Pressable onPress={() => addToWeek(open)} disabled={!pick || !pickType} accessibilityRole="button" style={[s.bigBtn, { backgroundColor: k.primary, opacity: pick && pickType ? 1 : 0.4 }]}><CalendarPlus size={18} color={k.onPrimary} /><Text style={[s.bigText, { color: k.onPrimary }]}>Add to week</Text></Pressable>
                  <Pressable onPress={() => addToList(open)} accessibilityRole="button" style={[s.bigBtn, { backgroundColor: k.well }]}><ShoppingCart size={18} color={k.text} /><Text style={[s.bigText, { color: k.text }]}>Ingredients to list</Text></Pressable>
                </View>
              </View>
            )}
            <Eyebrow label="INGREDIENTS" accent={k.gold} k={k} />
            {(open.ingredients ?? []).map((g, i) => <View key={i} style={[s.ing, { backgroundColor: k.pastelAmber }]}><Text style={[s.ingText, { color: k.text }]}>{g}</Text></View>)}
            <Eyebrow label="STEPS" accent={k.purple} k={k} />
            {(open.prep_steps ?? []).map((st, i) => (
              <View key={i} style={s.step}><View style={[s.stepNum, { backgroundColor: k.pastelLavCard }]}><Text style={[s.stepNumText, { color: k.purple }]}>{i + 1}</Text></View><Text style={[s.stepText, { color: k.text }]}>{st}</Text></View>
            ))}
            {isParent && open.status === 'pending' && (
              <View style={s.wrapRow}>
                <Pressable onPress={() => review(open, false)} accessibilityRole="button" style={[s.bigBtn, { backgroundColor: k.well }]}><Text style={[s.bigText, { color: k.text }]}>Decline</Text></Pressable>
                <Pressable onPress={() => review(open, true)} accessibilityRole="button" style={[s.bigBtn, { backgroundColor: k.primary }]}><Text style={[s.bigText, { color: k.onPrimary }]}>Approve</Text></Pressable>
              </View>
            )}
            {isParent && open.status !== 'pending' && (
              <Pressable onPress={() => remove(open)} accessibilityRole="button" style={[s.bigBtn, { borderWidth: 1.5, borderColor: k.dangerEdge }]}><Trash2 size={18} color={k.danger} /><Text style={[s.bigText, { color: k.danger }]}>Delete recipe</Text></Pressable>
            )}
          </View>
        )}
      </KioskFormDrawer>

      <AddRecipeDrawer visible={adding} onClose={() => setAdding(false)} active={active} isParent={isParent} familyId={familyId}
        onSaved={r => { setRecipes(p => [r, ...p]); setAdding(false); }} />
    </View>
  );
}

function AddRecipeDrawer({ visible, onClose, active, isParent, familyId, onSaved }: {
  visible: boolean; onClose: () => void; active: FamilyMember; isParent: boolean; familyId: string; onSaved: (r: FamilyRecipe) => void;
}) {
  const { k } = useKioskColors();
  const dictation = useVoiceDictation();
  const [emoji, setEmoji] = useState('');
  const [title, setTitle] = useState('');
  const [ings, setIngs] = useState<string[]>(['']);
  const [steps, setSteps] = useState('');
  const [prep, setPrep] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tip, setTip] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);
  const listening = dictation.state === 'listening';
  const reset = () => { setEmoji(''); setTitle(''); setIngs(['']); setSteps(''); setPrep(''); setTags([]); setTip(null); dictation.reset(); };
  const close = () => { reset(); onClose(); };
  const lines = (t: string) => t.split('\n').map(x => x.trim()).filter(Boolean);

  const refine = async () => {
    if (!title.trim() && !steps.trim() && !ings.some(x => x.trim())) { showToast('Add a title or some ingredients first'); return; }
    setRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: { action: 'refine_recipe', title: title.trim(), ingredients: ings.map(x => x.trim()).filter(Boolean), steps: lines(steps), dietaryTags: tags, prepMinutes: prep ? parseInt(prep, 10) : undefined, familyId },
      });
      if (error) throw error;
      const r = (data as any)?.result ?? data;
      if (r?.title) setTitle(r.title);
      if (r?.emoji) setEmoji(r.emoji);
      if (r?.ingredients?.length) setIngs(r.ingredients);
      if (r?.steps?.length) setSteps(r.steps.join('\n'));
      if (r?.dietaryTags?.length) setTags(r.dietaryTags);
      if (r?.prepMinutes) setPrep(String(r.prepMinutes));
      if (r?.tip) setTip(r.tip);
      showToast('Recipe refined by Cube AI ✨');
    } catch { showToast('AI refinement failed. Try again.'); } finally { setRefining(false); }
  };
  const stopVoice = async () => { const t = await dictation.stop(); if (t) setSteps(p => (p ? p + '\n' : '') + t); };
  const save = async () => {
    if (!title.trim() || !familyId || saving) return;
    setSaving(true);
    const { data, error } = await supabase.from('family_recipes').insert({
      id: `${familyId}-recipe-${Date.now()}`, family_id: familyId, title: title.trim(), emoji: emoji.trim() || null,
      image_url: null, ingredients: ings.map(x => x.trim()).filter(Boolean), prep_steps: lines(steps), dietary_tags: tags,
      prep_minutes: prep ? parseInt(prep, 10) : null, created_by: active.id, ai_refined: false,
      status: isParent ? 'approved' : 'pending',
    }).select().single();
    setSaving(false);
    if (error || !data) { showToast('Could not save the recipe. Try again.'); return; }
    showToast(isParent ? `${title.trim()} added to the recipe book` : 'Sent to a parent for review');
    reset(); onSaved(data as FamilyRecipe);
  };

  return (
    <KioskFormDrawer visible={visible} variant="drawer" title={isParent ? 'Add a recipe' : 'Propose a recipe'} subtitle={isParent ? 'Saved to the family recipe book' : 'A parent reviews it first'}
      accent={k.primary} Icon={Plus} k={k} onClose={close} submitLabel={isParent ? 'Save recipe' : 'Send for approval'} onSubmit={save} canSubmit={!!title.trim()} submitting={saving}>
      <View style={s.dBody}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 84 }}><Field label="EMOJI" value={emoji} set={setEmoji} placeholder="🍽️" /></View>
          <View style={{ flex: 1 }}><Field label="RECIPE NAME" value={title} set={setTitle} placeholder="e.g. Grandma's apple pie" /></View>
        </View>
        <View style={s.wrapRow}>
          <Pressable onPress={listening ? stopVoice : () => dictation.start()} accessibilityRole="button" accessibilityLabel={listening ? 'Stop dictation' : 'Dictate the steps'}
            style={[s.bigBtn, { backgroundColor: listening ? k.danger : k.pastelLavCard }]}><Mic size={18} color={listening ? k.onAccent : k.purple} /><Text style={[s.bigText, { color: listening ? k.onAccent : k.purple }]}>{listening ? 'Stop' : 'Dictate'}</Text></Pressable>
          <Pressable onPress={refine} disabled={refining} accessibilityRole="button" accessibilityLabel="Refine with AI"
            style={[s.bigBtn, { backgroundColor: k.pastelAmberCard }]}>{refining ? <ActivityIndicator size="small" color={k.gold} /> : <Sparkles size={18} color={k.gold} />}<Text style={[s.bigText, { color: k.gold }]}>Refine with AI</Text></Pressable>
        </View>
        {!!tip && <View style={[s.ing, { backgroundColor: k.pastelAmber }]}><Text style={[s.ingText, { color: k.text }]}>💡 {tip}</Text></View>}
        <Field label="PREP TIME (MINUTES)" value={prep} set={x => setPrep(x.replace(/\D/g, ''))} placeholder="e.g. 30" numeric />
        <Eyebrow label="INGREDIENTS" accent={k.gold} k={k} />
        {ings.map((g, i) => (
          <View key={i} style={s.wrapRow}>
            <TextInput value={g} onChangeText={x => setIngs(p => p.map((v, j) => (j === i ? x : v)))} placeholder={i === 0 ? '2 cups flour' : 'Add another'} placeholderTextColor={k.textFaint}
              style={[s.field, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder, flex: 1 }]} accessibilityLabel={`Ingredient ${i + 1}`} />
            {ings.length > 1 && <Pressable onPress={() => setIngs(p => p.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Remove ingredient" style={[s.sbtn, { backgroundColor: k.well }]}><Text style={[s.sbtnText, { color: k.textMuted }]}>✕</Text></Pressable>}
          </View>
        ))}
        <Pressable onPress={() => setIngs(p => [...p, ''])} accessibilityRole="button" style={[s.bigBtn, { backgroundColor: k.pastelSageCard, alignSelf: 'flex-start' }]}><Plus size={18} color={k.sage} /><Text style={[s.bigText, { color: k.sage }]}>Add ingredient</Text></Pressable>
        <Eyebrow label="STEPS · ONE PER LINE" accent={k.purple} k={k} />
        <TextInput value={steps} onChangeText={setSteps} placeholder="Type or dictate the steps" placeholderTextColor={k.textFaint} multiline
          style={[s.field, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder, minHeight: 130, textAlignVertical: 'top', paddingTop: 12 }]} accessibilityLabel="Steps" />
        <Eyebrow label="DIETARY TAGS" accent={k.sage} k={k} />
        <View style={s.wrapRow}>{DIETARY_OPTIONS.map(t => <ChipBtn key={t} label={t} on={tags.includes(t)} onPress={() => setTags(p => (p.includes(t) ? p.filter(x => x !== t) : [...p, t]))} tone={k.sage} />)}</View>
        <View style={s.wrapRow}><Clock size={14} color={k.textFaint} /><Text style={[s.rcMeta, { color: k.textFaint }]}>You can refine with AI after typing a few ingredients.</Text></View>
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: KIOSK_SPACE.xl, paddingTop: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm, minHeight: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 46, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 16 },
  addText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 100, paddingHorizontal: 16, minHeight: 46, minWidth: 220 },
  searchInput: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '600', paddingVertical: 8 },
  chip: { minHeight: 44, borderRadius: 100, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  dayPill: { minWidth: 62, minHeight: 52, borderRadius: 16, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  dayT: { fontSize: 13, fontWeight: '800' },
  dayD: { fontSize: 11, fontWeight: '700' },
  pend: { borderRadius: KIOSK_RADIUS.xl, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  pendRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.lg, padding: 10 },
  sbtn: { minHeight: 44, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  sbtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  rc: { width: '32.4%', borderRadius: KIOSK_RADIUS.xl, borderWidth: 1.5, padding: 12, gap: 6 },
  rcPhoto: { height: 92, borderRadius: KIOSK_RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  rcTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', lineHeight: 21 },
  rcMeta: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: { borderRadius: 100, paddingHorizontal: 9, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '800' },
  by: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  empty: { fontSize: KIOSK_TYPO.body, fontWeight: '700', textAlign: 'center', paddingVertical: KIOSK_SPACE.xl },
  dBody: { gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 18 },
  bigText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  ing: { borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 14, paddingVertical: 11 },
  ingText: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  step: { flexDirection: 'row', gap: 12 },
  stepNum: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  stepText: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '600', lineHeight: 22 },
  flab: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1 },
  field: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: KIOSK_TYPO.body, fontWeight: '600' },
});
