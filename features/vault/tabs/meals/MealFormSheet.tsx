import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Keyboard, StyleSheet, ActivityIndicator,
  Animated, Easing, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Mic, MicOff, X } from 'lucide-react-native';
import { Meal, MEAL_TYPES, MEAL_EMOJIS, DIETARY_OPTIONS, MEAL_TYPE_COLOR } from './types';
import { supabase } from '@/lib/supabase';
import { em } from './styles';
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';
import { fmtTimeLabel } from '@/features/quests/components/questFormShared';
import { useFamilyStore } from '@/store/familyStore';
import SwipeBackWrapper from '@/components/SwipeBackWrapper';

// Voice import — soft: the lib may not be linked in all build variants
let Voice: any = null;
try { Voice = require('@react-native-voice/voice').default; } catch {}

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

// FieldCard — same pattern as JustDescribeItScreen / grocery AddItemSheet
function FieldCard({ label, accent, children, colors }: {
  label: string; accent?: string; children: React.ReactNode; colors: any;
}) {
  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border,
      padding: 14, marginBottom: 12,
    }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: accent ?? colors.textSecondary, marginBottom: 8, letterSpacing: 0.3 }}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

export interface MealFormPatch {
  title: string; type: string; emoji: string;
  chef_id: string | null; prep_minutes: number | null;
  dietary_tags: string[]; ingredients: string[]; prep_steps: string[];
  recipe_text: string | null;
  start_time: string | null; timezone: string | null;
}

type SuggestionItem = {
  id: string; title: string; emoji?: string | null;
  ingredients?: string[]; prep_steps?: string[];
  dietary_tags?: string[]; prep_minutes?: number | null;
  source: 'recipe' | 'history';
};

export default function MealFormSheet({
  visible, day, editingMeal, familyId, colors, isDark, onClose, onSave, saving,
}: {
  visible: boolean;
  day: string | null;
  editingMeal: Meal | null;
  familyId?: string;
  colors: any; isDark: boolean;
  onClose: () => void;
  onSave: (patch: MealFormPatch) => void | Promise<void>;
  saving?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { members } = useFamilyStore();
  const isEdit = !!editingMeal;

  // Animation
  const slideAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      slideAnim.setValue(60); fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [touched, setTouched]               = useState(false);

  const [title, setTitle]           = useState('');
  const [type, setType]             = useState('dinner');
  const [emoji, setEmoji]           = useState('🍽️');
  const [showEmoji, setShowEmoji]   = useState(false);
  const [chefId, setChefId]         = useState('');
  const [prepMins, setPrepMins]     = useState('');
  const [servings, setServings]     = useState('');
  const [dietTags, setDietTags]     = useState<string[]>([]);
  const [ingredients, setIngredients] = useState('');
  const [prepSteps, setPrepSteps]     = useState('');
  const [recipeText, setRecipeText]   = useState('');
  const [note, setNote]               = useState('');
  const [startTime, setStartTime]     = useState<Date | null>(null);

  // Recipe suggestions from recipe book + history
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  useEffect(() => {
    if (!visible || !familyId || editingMeal) { setSuggestions([]); return; }
    Promise.all([
      supabase.from('family_recipes').select('id,title,emoji,ingredients,prep_steps,dietary_tags,prep_minutes')
        .eq('family_id', familyId).order('created_at', { ascending: false }).limit(10),
      supabase.from('family_meals').select('id,title,emoji,ingredients,prep_steps,dietary_tags,prep_minutes')
        .eq('family_id', familyId).order('created_at', { ascending: false }).limit(20),
    ]).then(([recipeRes, histRes]) => {
      const recipeItems: SuggestionItem[] = (recipeRes.data ?? []).map((r: any) => ({ ...r, source: 'recipe' as const }));
      const seen = new Set(recipeItems.map(r => r.title.toLowerCase().trim()));
      const histItems: SuggestionItem[] = (histRes.data ?? [])
        .filter((m: any) => {
          const k = m.title?.toLowerCase().trim();
          if (!k || seen.has(k)) return false;
          seen.add(k); return true;
        })
        .map((m: any) => ({ ...m, source: 'history' as const }));
      setSuggestions([...recipeItems, ...histItems].slice(0, 12));
    });
  }, [visible, familyId, editingMeal]);

  const applySuggestion = (s: SuggestionItem) => {
    setTitle(s.title);
    if (s.emoji) setEmoji(s.emoji);
    if (s.ingredients?.length) setIngredients(s.ingredients.join('\n'));
    if (s.prep_steps?.length) setPrepSteps(s.prep_steps.join('\n'));
    if (s.dietary_tags?.length) setDietTags(s.dietary_tags);
    if (s.prep_minutes) setPrepMins(String(s.prep_minutes));
  };

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [voiceError, setVoiceError]   = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTouched(false);
    setShowEmoji(false);
    setVoiceError(null);
    if (editingMeal) {
      setTitle(editingMeal.title ?? '');
      setType(editingMeal.type ?? 'dinner');
      setEmoji(editingMeal.emoji ?? '🍽️');
      setChefId(editingMeal.chef_id ?? '');
      setPrepMins(editingMeal.prep_minutes ? String(editingMeal.prep_minutes) : '');
      setServings('');
      setDietTags(editingMeal.dietary_tags ?? []);
      setIngredients((editingMeal.ingredients ?? []).join('\n'));
      setPrepSteps((editingMeal.prep_steps ?? []).join('\n'));
      setRecipeText((editingMeal as any).recipe_text ?? '');
      setNote('');
      setStartTime(parseTimeLabel(editingMeal.start_time));
    } else {
      setTitle(''); setType('dinner'); setEmoji('🍽️'); setChefId('');
      setPrepMins(''); setServings(''); setDietTags([]); setIngredients('');
      setPrepSteps(''); setRecipeText(''); setNote('');
      setStartTime(null);
    }
  }, [visible, editingMeal]);

  // Wire up voice handlers
  useEffect(() => {
    if (!Voice) return;
    Voice.onSpeechResults = (e: any) => {
      const text = e?.value?.[0] ?? '';
      setRecipeText(prev => prev ? prev + ' ' + text : text);
    };
    Voice.onSpeechError = () => {
      setVoiceError('Could not recognise speech. Try again.');
      setIsRecording(false);
    };
    Voice.onSpeechEnd = () => setIsRecording(false);
    return () => { Voice?.destroy?.().catch?.(() => {}); };
  }, []);

  const toggleVoice = async () => {
    if (!Voice) { setVoiceError('Voice not available'); return; }
    if (isRecording) {
      await Voice.stop();
      setIsRecording(false);
    } else {
      setVoiceError(null);
      try {
        await Voice.start('en-US');
        setIsRecording(true);
      } catch {
        setVoiceError('Microphone permission needed.');
      }
    }
  };

  const typeColor = MEAL_TYPE_COLOR[type] ?? colors.amber;

  const handleSave = () => {
    if (!title.trim()) { setTouched(true); return; }
    onSave({
      title: title.trim(), type, emoji,
      chef_id: chefId || null,
      prep_minutes: prepMins ? parseInt(prepMins) : null,
      dietary_tags: dietTags,
      ingredients: ingredients.split('\n').map(s => s.trim()).filter(Boolean),
      prep_steps: prepSteps.split('\n').map(s => s.trim()).filter(Boolean),
      recipe_text: recipeText.trim() || null,
      start_time: startTime ? fmtTimeLabel(startTime) : null,
      timezone: startTime ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
    });
  };

  if (!visible) return null;

  const P = colors.primary;
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const activeMember = members.find(m => (m as any).active) ?? members[0];

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }}>
      <SwipeBackWrapper onDismiss={onClose}>
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>

              {/* ── ReviewInbox-style header ── */}
              <View style={{
                paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 16,
                borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
                backgroundColor: '#FFFFFF', gap: 6,
              }}>
                {/* Family chrome */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
                    FAMILY CUBE / {familyName.toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                    {(activeMember as any)?.name} · {(activeMember as any)?.role === 'parent' ? 'Parent / Admin' : 'Member'}
                  </Text>
                </View>

                {/* Breadcrumb + close */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Meal week</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onClose}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface,
                      alignItems: 'center', justifyContent: 'center' }}>
                    <X size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Status pill + title */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <View style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
                    backgroundColor: colors.amberLight }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.amber }}>
                      {day ? `${day} · new draft` : 'edited draft'}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
                  {isEdit ? `Edit ${type}` : 'Add a meal'}
                </Text>
              </View>

              {/* ── Scrollable form body ── */}
              <ScrollView
                keyboardShouldPersistTaps="always"
                onScrollBeginDrag={Keyboard.dismiss}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>

                {/* ── Recipe suggestions — from book + history ── */}
                {!editingMeal && suggestions.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.7,
                      color: colors.teal, marginBottom: 10 }}>
                      FROM YOUR RECIPE BOOK & HISTORY
                    </Text>
                    <FlatList
                      data={suggestions}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={item => item.id}
                      contentContainerStyle={{ gap: 10, paddingRight: 4 }}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => applySuggestion(item)}
                          style={{
                            width: 140, borderRadius: 14,
                            backgroundColor: item.source === 'recipe' ? colors.amberLight : colors.tealLight,
                            padding: 12, gap: 4,
                            borderWidth: 1,
                            borderColor: item.source === 'recipe'
                              ? (colors.amber + '30') : (colors.teal + '30'),
                          }}>
                          <Text style={{ fontSize: 24, marginBottom: 2 }}>
                            {item.emoji || '🍽️'}
                          </Text>
                          <Text style={{ fontSize: 13, fontWeight: '700',
                            color: colors.textPrimary, lineHeight: 17 }} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={{ fontSize: 11, fontWeight: '600',
                            color: item.source === 'recipe' ? colors.amber : colors.teal }}>
                            {item.source === 'recipe' ? '📖 Recipe book' : '🕐 History'}
                          </Text>
                          {item.prep_minutes ? (
                            <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                              {item.prep_minutes} min
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      )}
                    />
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 8 }}>
                      Tap any card to pre-fill this meal
                    </Text>
                  </View>
                )}

                {/* DATE — read-only display */}
                <FieldCard label="Date" colors={colors}>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: colors.textPrimary }}>
                    {day
                      ? new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                      : editingMeal?.day ?? '—'}
                  </Text>
                </FieldCard>

                {/* MEAL TYPE */}
                <FieldCard label="Meal type" colors={colors}>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {MEAL_TYPES.map(t => {
                      const tc = MEAL_TYPE_COLOR[t.toLowerCase()] ?? colors.amber;
                      const sel = type === t.toLowerCase();
                      return (
                        <TouchableOpacity key={t} onPress={() => setType(t.toLowerCase())}
                          style={{ borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7,
                            backgroundColor: sel ? tc + '18' : 'transparent',
                            borderColor: sel ? tc : colors.border }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? tc : colors.textSecondary }}>
                            {t === 'Breakfast' ? '🌅 ' : t === 'Lunch' ? '☀️ ' : t === 'Dinner' ? '🌙 ' : '🍎 '}{t}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </FieldCard>

                {/* TITLE */}
                <FieldCard label="Title" accent={P} colors={colors}>
                  {/* Emoji picker trigger */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <TouchableOpacity onPress={() => setShowEmoji(v => !v)}
                      style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: typeColor + '18',
                        alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: typeColor + '40' }}>
                      <Text style={{ fontSize: 24 }}>{emoji}</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>Tap to change emoji</Text>
                  </View>
                  {showEmoji && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10,
                      padding: 10, borderRadius: 12, backgroundColor: colors.surface }}>
                      {MEAL_EMOJIS.map(e => (
                        <TouchableOpacity key={e} onPress={() => { setEmoji(e); setShowEmoji(false); }}
                          style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: emoji === e ? colors.accent + '25' : 'transparent' }}>
                          <Text style={{ fontSize: 22 }}>{e}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TextInput
                    value={title} onChangeText={setTitle}
                    placeholder="e.g. Lemon chicken bowls"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                    style={{ fontSize: 16, fontWeight: '500', color: colors.textPrimary,
                      borderWidth: touched && !title.trim() ? 1.5 : 0,
                      borderColor: colors.danger, borderRadius: 8, padding: touched && !title.trim() ? 8 : 0 }}
                  />
                  {touched && !title.trim() && (
                    <Text style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}>Meal name is required</Text>
                  )}
                </FieldCard>

                {/* TIME */}
                <FieldCard label="Time" colors={colors}>
                  <TouchableOpacity onPress={() => setShowTimePicker(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 16, fontWeight: '500',
                      color: startTime ? colors.textPrimary : colors.textTertiary }}>
                      {startTime ? fmtTimeLabel(startTime) : 'No time set'}
                    </Text>
                    {startTime && (
                      <TouchableOpacity onPress={() => setStartTime(null)} hitSlop={8}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </FieldCard>

                {/* CHEF */}
                <FieldCard label="Chef" colors={colors}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 12 }}>
                    Who's cooking?
                  </Text>
                  <View style={{ gap: 8 }}>
                    <TouchableOpacity onPress={() => setChefId('')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
                        borderRadius: 12, backgroundColor: !chefId ? colors.tealLight : 'transparent',
                        borderWidth: !chefId ? 0 : 0 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border,
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 16 }}>👨‍👩‍👧</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>Anyone</Text>
                        <Text style={{ fontSize: 12, color: colors.textTertiary }}>No chef assigned</Text>
                      </View>
                      {!chefId && (
                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: P,
                          alignItems: 'center', justifyContent: 'center' }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: P }} />
                        </View>
                      )}
                    </TouchableOpacity>
                    {members.map(m => {
                      const sel = chefId === (m as any).id;
                      const name = (m as any).name as string;
                      const role = (m as any).role as string;
                      const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                      const hue = name.charCodeAt(0) % 360;
                      return (
                        <TouchableOpacity key={(m as any).id} onPress={() => setChefId((m as any).id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
                            borderRadius: 12, backgroundColor: sel ? colors.tealLight : 'transparent' }}>
                          <View style={{ width: 36, height: 36, borderRadius: 18,
                            backgroundColor: `hsl(${hue},60%,55%)`,
                            alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>{initials}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>{name}</Text>
                            <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                              {role === 'kid' ? 'With a parent\'s help' : 'Family member'}
                            </Text>
                          </View>
                          {sel && (
                            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: P,
                              alignItems: 'center', justifyContent: 'center' }}>
                              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: P }} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </FieldCard>

                {/* SERVINGS */}
                <FieldCard label="Servings" colors={colors}>
                  <TextInput
                    value={servings} onChangeText={setServings}
                    placeholder={String(members.length || 4)}
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="numeric"
                    style={{ fontSize: 16, fontWeight: '500', color: colors.textPrimary }}
                  />
                </FieldCard>

                {/* PREP TIME */}
                <FieldCard label="Prep time" colors={colors}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      value={prepMins} onChangeText={setPrepMins}
                      placeholder="35"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                      style={{ fontSize: 16, fontWeight: '500', color: colors.textPrimary, flex: 1 }}
                    />
                    <Text style={{ fontSize: 14, color: colors.textTertiary, fontWeight: '600' }}>minutes</Text>
                  </View>
                </FieldCard>

                {/* DIETARY TAGS */}
                <FieldCard label="Dietary tags · optional" colors={colors}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                    {DIETARY_OPTIONS.map(tag => {
                      const sel = dietTags.includes(tag);
                      return (
                        <TouchableOpacity key={tag}
                          onPress={() => setDietTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                          style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5,
                            backgroundColor: sel ? colors.teal + '22' : 'transparent',
                            borderColor: sel ? colors.teal : colors.border }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? colors.teal : colors.textSecondary }}>{tag}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </FieldCard>

                {/* INGREDIENTS */}
                <FieldCard label="Ingredients" accent={colors.teal} colors={colors}>
                  <TextInput
                    value={ingredients} onChangeText={setIngredients}
                    placeholder={'500g chicken breast\n300g rice\n2 lemons\n1 cucumber'}
                    placeholderTextColor={colors.textTertiary}
                    multiline numberOfLines={5}
                    style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary,
                      minHeight: 110, textAlignVertical: 'top', lineHeight: 22 }}
                  />
                </FieldCard>

                {/* STEPS */}
                <FieldCard label="Steps · one per line" accent={colors.teal} colors={colors}>
                  <TextInput
                    value={prepSteps} onChangeText={setPrepSteps}
                    placeholder={'Season chicken\nBoil quinoa 15 min\nGrill 6 min each side'}
                    placeholderTextColor={colors.textTertiary}
                    multiline numberOfLines={5}
                    style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary,
                      minHeight: 110, textAlignVertical: 'top', lineHeight: 22 }}
                  />
                </FieldCard>

                {/* RECIPE TEXT + MIC */}
                <FieldCard label="Recipe · type or speak" accent={colors.pink} colors={colors}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10, lineHeight: 18 }}>
                    Add a full recipe description — or tap the mic to speak it aloud and it'll be transcribed here.
                  </Text>
                  <TextInput
                    value={recipeText} onChangeText={setRecipeText}
                    placeholder="Describe the full recipe, cooking tips, serving suggestions…"
                    placeholderTextColor={colors.textTertiary}
                    multiline numberOfLines={6}
                    style={{ fontSize: 14, fontWeight: '400', color: colors.textPrimary,
                      minHeight: 130, textAlignVertical: 'top', lineHeight: 22 }}
                  />

                  {/* Voice mic row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
                    paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                    <TouchableOpacity onPress={toggleVoice}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1,
                        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
                        backgroundColor: isRecording ? colors.danger + '15' : colors.pinkLight,
                        borderWidth: 1.5, borderColor: isRecording ? colors.danger : colors.pink + '60' }}>
                      {isRecording
                        ? <MicOff size={18} color={colors.danger} />
                        : <Mic size={18} color={colors.pink} />}
                      <Text style={{ fontSize: 14, fontWeight: '700',
                        color: isRecording ? colors.danger : colors.pink }}>
                        {isRecording ? 'Tap to stop recording' : 'Speak recipe aloud'}
                      </Text>
                      {isRecording && <ActivityIndicator size="small" color={colors.danger} style={{ marginLeft: 'auto' }} />}
                    </TouchableOpacity>
                    {recipeText.length > 0 && (
                      <TouchableOpacity onPress={() => setRecipeText('')}
                        style={{ paddingHorizontal: 12, paddingVertical: 11,
                          borderRadius: 12, borderWidth: 1.5, borderColor: colors.border }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {voiceError && (
                    <Text style={{ fontSize: 12, color: colors.danger, marginTop: 6 }}>{voiceError}</Text>
                  )}
                </FieldCard>

                {/* NOTE */}
                <FieldCard label="Note · optional" colors={colors}>
                  <TextInput
                    value={note} onChangeText={setNote}
                    placeholder="e.g. Ava can help assemble bowls after study group."
                    placeholderTextColor={colors.textTertiary}
                    multiline numberOfLines={3}
                    style={{ fontSize: 14, fontWeight: '400', color: colors.textPrimary,
                      minHeight: 70, textAlignVertical: 'top', lineHeight: 22 }}
                  />
                </FieldCard>

                {/* Keep plan connected tip */}
                <View style={{ borderRadius: 16, backgroundColor: colors.tealLight, padding: 18, marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
                    Keep the plan connected
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                    The recipe and grocery link stay attached. Date, meal time and chef assignment stay unchanged in this draft.
                  </Text>
                </View>
              </ScrollView>

              {/* ── Fixed footer ── */}
              <View style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                paddingBottom: insets.bottom + 8, paddingTop: 12, paddingHorizontal: 20,
                backgroundColor: '#FFFFFF',
                borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
                gap: 10,
              }}>
                <TouchableOpacity onPress={handleSave} disabled={saving}
                  style={{ borderRadius: 16, paddingVertical: 17, alignItems: 'center',
                    backgroundColor: saving ? colors.primary + '80' : colors.primary }}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                        {isEdit ? 'Save dinner changes' : 'Add meal'}
                      </Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: P }}>
                    Cancel · back to week
                  </Text>
                </TouchableOpacity>
              </View>

            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </SwipeBackWrapper>

      <PickerOverlay
        showDate={false} showTime={showTimePicker}
        value={startTime ?? new Date()}
        onChangeDate={() => {}}
        onChangeTime={(d) => setStartTime(d)}
        onDone={() => setShowTimePicker(false)}
        accentColor={typeColor}
        colors={colors}
        timeLabel="🕐 What time is this meal?"
      />
    </View>
  );
}
