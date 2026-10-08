/**
 * JustDescribeItScreen — full-page natural-language task composer.
 * Single scrollable pageSheet — detection chips appear inline, then
 * the quest/event form expands inline below (pre-filled). No handoff
 * to a separate modal. Figma visual treatment applied throughout.
 *
 * States:
 *   1. Resting  — two info cards + Speak CTA
 *   2. Typing   — detection chips (category / time / assignee)
 *   3. Voice    — waveform + Stop/Cancel
 *   4. Expanded — inline quest form below chips (pre-filled)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Modal, Animated, Easing, ActivityIndicator,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { detectLocalTask } from '../lib/localTaskDetection';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { previewAssignment } from '@/lib/responsibilityCategories';
import { todayLocal, nextHourRoundedStr } from '@/lib/dates';
import { familyAi } from '@/lib/familyAiService';
import { Mic, Square } from 'lucide-react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';

const MIN_CHARS = 3;

// Format YYYY-MM-DD → "Oct 12, 2026"
function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

// Format HH:MM (24h) → "5:00 PM"
function fmt12h(hhmm: string): string {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// Shift YYYY-MM-DD by delta days
function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Shift HH:MM by delta hours
function shiftTime(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const newH = ((h + delta) % 24 + 24) % 24;
  return `${String(newH).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}

function snapToDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDay();
  if (day === 0) return shiftDate(iso, 1);
  if (day === 6) return shiftDate(iso, 2);
  return iso;
}

function WaveformBar({ delay, color }: { delay: number; color: string }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 300 + delay * 80, useNativeDriver: false, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(anim, { toValue: 0.15, duration: 300 + delay * 60, useNativeDriver: false, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={{
      width: 4, borderRadius: 2, backgroundColor: color,
      height: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 36] }),
    }} />
  );
}

function Waveform({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 48 }}>
      {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19].map(i => (
        <WaveformBar key={i} delay={i} color={color} />
      ))}
    </View>
  );
}

export default function JustDescribeItScreen({
  visible, onClose, onOpenFullForm,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenFullForm: (kind: 'event' | 'quest', prefill: {
    title?: string; category?: string; memberId?: string; startAt?: string;
    notes?: string; coins?: number; photoRequired?: boolean;
    pickupLocation?: string; dropLocation?: string; returnTime?: string;
  }) => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const { familyName = 'Family' } = useFamilyStore() as any;
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const { addQuest } = useQuestStore();

  // ── Composer state ──
  const [aiAutoFilling, setAiAutoFilling] = useState(false);
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [detection, setDetection] = useState<ReturnType<typeof detectLocalTask>>(null);
  const [suggestion, setSuggestion] = useState<{ name: string; reason: string } | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  // ── Inline quest form state ──
  const [questFormOpen, setQuestFormOpen] = useState(false);
  const [questTitle, setQuestTitle] = useState('');
  const [questDescription, setQuestDescription] = useState('');
  const [questCoins, setQuestCoins] = useState(30);
  const [questAssigneeIds, setQuestAssigneeIds] = useState<string[]>([]);
  const [questDueDate, setQuestDueDate] = useState(snapToDay(shiftDate(todayLocal(), 1)));
  const [questDueTime, setQuestDueTime] = useState('17:00');
  const [questShowDatePick, setQuestShowDatePick] = useState(false);
  const [questShowTimePick, setQuestShowTimePick] = useState(false);
  const [questRecurrence, setQuestRecurrence] = useState<'once'|'daily'|'weekly'|'monthly'>('once');
  const [questRecurrenceDays, setQuestRecurrenceDays] = useState<number[]>([]);
  const [questEndDate, setQuestEndDate] = useState('');
  const [questShowEndDatePick, setQuestShowEndDatePick] = useState(false);
  const [questIsPool, setQuestIsPool] = useState(false);
  const [questCustomCoins, setQuestCustomCoins] = useState('');
  const [questBonusEnabled, setQuestBonusEnabled] = useState(false);
  const [questBonusCoins, setQuestBonusCoins] = useState('25');
  const [showPreview, setShowPreview] = useState(false);
  const [savingQuest, setSavingQuest] = useState(false);

  const dictation = useVoiceDictation();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const reset = () => {
    setInput('');
    setInputFocused(false);
    setDetection(null);
    setSuggestion(null);
    setLoadingSuggestion(false);
    setAiAutoFilling(false);
    setQuestFormOpen(false);
    setQuestTitle('');
    setQuestDescription('');
    setQuestCoins(30);
    setQuestAssigneeIds([]);
    setQuestDueDate(snapToDay(shiftDate(todayLocal(), 1)));
    setQuestDueTime('17:00');
    setQuestShowDatePick(false);
    setQuestShowTimePick(false);
    setQuestRecurrence('once');
    setQuestRecurrenceDays([]);
    setQuestEndDate('');
    setQuestIsPool(false);
    setQuestCustomCoins('');
    setQuestBonusEnabled(false);
    setQuestBonusCoins('25');
    setShowPreview(false);
    setSavingQuest(false);
    dictation.reset();
  };

  const handleClose = () => { reset(); onClose(); };

  // Live detection
  useEffect(() => {
    if (input.trim().length < MIN_CHARS) { setDetection(null); setQuestFormOpen(false); return; }
    const d = detectLocalTask(input, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
    setDetection(d);
  }, [input, members]);

  // Assignee suggestion
  useEffect(() => {
    if (!detection || !activeMember?.familyId) return;
    const cat = detection.category.kind === 'event' ? detection.category.eventCategory : detection.category.questCategory;
    if (!cat || loadingSuggestion) return;
    setLoadingSuggestion(true);
    setSuggestion(null);
    previewAssignment({
      taskId: 'preview',
      taskType: detection.category.kind === 'event' ? 'event' : 'chore',
      familyId: activeMember.familyId,
      category: cat,
    }).then(s => {
      if (s.selectedMemberId) {
        const m = members.find(mb => mb.id === s.selectedMemberId);
        if (m) setSuggestion({ name: m.name.split(' ')[0], reason: s.explanation.selected ?? `${Math.round((s.confidence ?? 0) * 100)}% confidence` });
      }
      setLoadingSuggestion(false);
    }).catch(() => setLoadingSuggestion(false));
  }, [detection?.category.eventCategory, detection?.category.questCategory]);

  const handleStopVoice = async () => {
    const t = await dictation.stop();
    if (t) setInput(t);
  };

  const handleAiAutoFill = async () => {
    if (!input.trim() || aiAutoFilling) return;
    setAiAutoFilling(true);
    try {
      const result = await familyAi.extractResponsibility(
        input.trim(),
        members.map(m => ({ id: m.id, name: m.name, role: m.role }))
      );
      if (result?.task?.title) {
        // If the inline form is already open, update the chore title field directly;
        // otherwise refine the input so openInlineQuestForm picks it up.
        if (questFormOpen) setQuestTitle(result.task.title);
        else setInput(result.task.title);
      }
    } catch { /* silently fail */ }
    finally { setAiAutoFilling(false); }
  };

  // Open the inline quest form pre-filled from detection
  const openInlineQuestForm = () => {
    // Use the detection's pre-built clean title if available, otherwise fall back to stripping the raw input
    const cleanTitle = detected?.title ?? input.trim()
      .replace(/\s+(at|by|@)\s+\d{1,2}(:\d{2})?\s*(am|pm)?/gi, '')
      .replace(/\s+\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
      .replace(/\s+(today|tonight|tomorrow)/gi, '')
      .replace(/\s+(on|next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, '')
      .replace(/\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, '')
      .replace(/\s+(on|by)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?/gi, '')
      .replace(/\s+every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week|month)/gi, '')
      .replace(/\s{2,}/g, ' ').trim();
    setQuestTitle(cleanTitle);
    if (detected?.when.date) setQuestDueDate(detected.when.date);
    if (detected?.when.time) setQuestDueTime(detected.when.time.slice(0, 5));
    if (detected?.recurrence && detected.recurrence !== 'once') {
      setQuestRecurrence(detected.recurrence);
    }
    if (detected?.recurrenceDays?.length) {
      setQuestRecurrenceDays(detected.recurrenceDays);
    }
    // Pre-select suggested assignee
    if (assigneeMember) setQuestAssigneeIds([assigneeMember.id]);
    setQuestFormOpen(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  };

  const handleSaveQuest = async () => {
    if (!questTitle.trim() || savingQuest) return;
    setSavingQuest(true);
    try {
      const finalCoins = questCustomCoins ? parseInt(questCustomCoins) || questCoins : questCoins;
      const bonusAmt = questBonusEnabled ? (parseInt(questBonusCoins) || 0) : 0;
      await addQuest({
        title: questTitle.trim(),
        description: questDescription.trim() || undefined,
        coins: finalCoins,
        bonusCoins: bonusAmt > 0 ? bonusAmt : undefined,
        assignedToIds: !questIsPool && questAssigneeIds.length > 0 ? questAssigneeIds : undefined,
        isPool: questIsPool || questAssigneeIds.length === 0,
        dueDate: questDueDate || undefined,
        dueTime: questDueTime || undefined,
        recurrence: questRecurrence !== 'once' ? questRecurrence : undefined,
        recurrenceDays: questRecurrence === 'weekly' && questRecurrenceDays.length > 0 ? questRecurrenceDays : undefined,
        recurrenceEndDate: questEndDate || undefined,
        familyId: activeMember?.familyId ?? '',
        createdBy: activeMemberId ?? '',
        category: detected?.category.questCategory as any,
      });
      handleClose();
    } catch {
      setSavingQuest(false);
    }
  };

  const isListening = dictation.state === 'listening';
  const hasInput = input.trim().length >= MIN_CHARS;
  const detected = detection;
  const catLabel = detected
    ? (detected.category.kind === 'event' ? detected.category.eventCategory : detected.category.questCategory)
    : null;
  const catEmoji = detected?.category.emoji ?? '';
  const detectedTime = detected?.when.time ? detected.when.time.slice(0, 5) : null;
  const detectedDate = detected?.when.date;
  const timeLabel = detectedDate && detectedTime
    ? `${detectedDate === todayLocal() ? 'Today' : fmtDate(detectedDate)} · ${fmt12h(detectedTime)}`
    : detectedDate ? (detectedDate === todayLocal() ? 'Today' : fmtDate(detectedDate))
    : detectedTime ? fmt12h(detectedTime) : null;
  const detectedMemberName = detected?.memberNames[0] ?? null;
  const suggestedMemberName = suggestion?.name ?? null;
  const displayAssignee = detectedMemberName ?? suggestedMemberName;
  const assigneeMember = displayAssignee
    ? members.find(m => m.name.split(' ')[0].toLowerCase() === displayAssignee.toLowerCase() || m.name.toLowerCase() === displayAssignee.toLowerCase())
    : null;

  // Figma tokens
  const canvasBg    = isDark ? '#0E0C13' : '#FFFFFF';
  const fieldBg     = isDark ? colors.surface : '#FFFFFF';
  const fieldBorder = isDark ? colors.border : '#DFE5EF';
  const activeBlue  = colors.primary;
  const detCardBg   = isDark ? colors.surface : colors.pinkLight;
  const COIN_OPTIONS = [10, 20, 30, 50, 100];
  const RECUR_OPTIONS: Array<{ label: string; value: typeof questRecurrence }> = [
    { label: 'Once', value: 'once' },
    { label: 'Daily', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: canvasBg }} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: canvasBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 80 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 20 }}>

              {/* ── Nav row: ‹ Today · · · UGANDHAR ── */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <TouchableOpacity onPress={handleClose} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 17, color: activeBlue }}>‹</Text>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: activeBlue }}>Today</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.5 }}>
                  {activeMember?.name?.split(' ')[0]?.toUpperCase() ?? ''}
                </Text>
              </View>

              {/* ── Page title ── */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 34, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, lineHeight: 40 }}>
                  Just describe it
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '400', color: colors.textSecondary, lineHeight: 22 }}>
                  Type a thought. Speak a thought. Make it a plan.
                </Text>
              </View>

              <View style={{ gap: 14 }}>

                {/* ── Natural-language composer ── */}
                <View style={{
                  backgroundColor: colors.card, borderRadius: 20,
                  borderWidth: inputFocused || isListening ? 2 : 1,
                  borderColor: inputFocused || isListening ? activeBlue : colors.border,
                  padding: 20, gap: 12,
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                    {isListening ? 'Editable transcript · listening' : 'What needs doing?'}
                  </Text>
                  <TextInput
                    ref={inputRef}
                    value={isListening ? dictation.liveTranscript : input}
                    onChangeText={setInput}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    editable={!isListening}
                    placeholder="Something on your mind?"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    style={{ fontSize: 22, fontWeight: '500', lineHeight: 30, color: colors.textPrimary, minHeight: 30 }}
                  />
                  {/* Tools row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                        {isListening ? 'Recording…' : hasInput ? 'Unsaved · only a draft' : 'Nothing created yet'}
                      </Text>
                      {hasInput && !isListening && (
                        <TouchableOpacity
                          onPress={handleAiAutoFill}
                          disabled={aiAutoFilling}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.pinkLight }}
                        >
                          {aiAutoFilling ? <ActivityIndicator size="small" color={colors.pink} /> : <Text style={{ fontSize: 11 }}>✨</Text>}
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.pink }}>
                            {aiAutoFilling ? 'Filling…' : 'AI fill'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={isListening ? handleStopVoice : () => dictation.start()}
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
                    >
                      {isListening
                        ? <Square size={16} color={activeBlue} strokeWidth={1.8} fill={activeBlue} />
                        : <Mic size={16} color={colors.textSecondary} strokeWidth={1.8} />}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ── Voice dictation card ── */}
                {isListening && (
                  <View style={{ backgroundColor: colors.pinkLight, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 }}>
                    <View style={{ alignSelf: 'flex-start', backgroundColor: colors.card, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: activeBlue }}>● Listening · speak now</Text>
                    </View>
                    <Waveform color={activeBlue} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={handleStopVoice} style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: activeBlue, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Stop</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => dictation.reset()} style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: activeBlue }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>
                      Audio stays private until you explicitly save.
                    </Text>
                  </View>
                )}

                {/* ── Detection chips — pill row in a beige card ── */}
                {!isListening && hasInput && detected && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {catLabel && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: isDark ? colors.card : colors.navy,
                          borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 }}>
                          {catEmoji ? <Text style={{ fontSize: 14 }}>{catEmoji}</Text> : null}
                          <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? colors.textPrimary : '#FFFFFF' }}>
                            {catLabel}
                            {detected.category.kw.length > 0 ? `  · from "${detected.category.kw[0]}"` : ''}
                          </Text>
                        </View>
                      )}
                      {timeLabel && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                          borderWidth: 1, borderColor: colors.border }}>
                          <Text style={{ fontSize: 13 }}>🕐</Text>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary }}>{timeLabel}</Text>
                        </View>
                      )}
                      {loadingSuggestion && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                          borderWidth: 1, borderColor: colors.border }}>
                          <ActivityIndicator size="small" color={activeBlue} />
                          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Suggesting…</Text>
                        </View>
                      )}
                      {displayAssignee && !loadingSuggestion && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                          borderWidth: 1, borderColor: colors.border }}>
                          <Text style={{ fontSize: 13 }}>👤</Text>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary }}>
                            {displayAssignee}{suggestion && !detectedMemberName ? ' · Suggested' : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>Detected · adjust in the form below</Text>
                  </View>
                )}

                {/* ── Resting empty state ── */}
                {!isListening && !hasInput && (
                  <>
                    {/* "One sentence is enough" — pinkLight card */}
                    <View style={{ backgroundColor: colors.pinkLight, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 8 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, lineHeight: 24 }}>One sentence is enough</Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.pink, lineHeight: 20 }}>
                        "water the plants every Monday" or "Jaswi finish homework by 7 PM"
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: 2 }}>
                        We can suggest category, time and person. You confirm the details before anything is saved.
                      </Text>
                    </View>

                    {/* Speak your task — outlined primary button */}
                    <TouchableOpacity
                      onPress={() => dictation.start()}
                      style={{ height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1.5, borderColor: activeBlue, backgroundColor: colors.card }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '600', color: activeBlue }}>Speak your task</Text>
                    </TouchableOpacity>

                    {/* Privacy — tealLight card */}
                    <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, textAlign: 'center', paddingHorizontal: 8 }}>
                      Your own wording comes first. Use type or voice—there's no extra create menu.
                    </Text>
                    <View style={{ backgroundColor: colors.tealLight, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.teal }}>Your privacy</Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>
                        Detection runs entirely on your device. Nothing is sent anywhere until you explicitly save.
                      </Text>
                    </View>
                  </>
                )}

                {/* ── CTA: open inline form or event form ── */}
                {!isListening && hasInput && detected && !questFormOpen && (
                  detected.category.kind === 'quest' ? (
                    <TouchableOpacity
                      onPress={openInlineQuestForm}
                      style={{ height: 52, borderRadius: 16, backgroundColor: activeBlue, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Set up chore →</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        const cat = detected.category.eventCategory;
                        let startAt: string | undefined;
                        if (detected.when.date && detected.when.time) startAt = `${detected.when.date}T${detected.when.time}:00`;
                        else if (detected.when.date) startAt = `${detected.when.date}T${nextHourRoundedStr()}:00`;
                        onOpenFullForm('event', {
                          title: input.trim(), category: cat ?? undefined,
                          memberId: assigneeMember?.id, startAt,
                          pickupLocation: detected.locations.pickup ?? undefined,
                          dropLocation: detected.locations.dropoff ?? undefined,
                        });
                        reset();
                      }}
                      style={{ height: 52, borderRadius: 16, backgroundColor: activeBlue, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Set up event →</Text>
                    </TouchableOpacity>
                  )
                )}

                {/* No detection fallback */}
                {!isListening && hasInput && !detected && (
                  <TouchableOpacity
                    onPress={() => { onOpenFullForm('quest', { title: input.trim() }); reset(); }}
                    style={{ height: 52, borderRadius: 16, backgroundColor: activeBlue, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Open full form →</Text>
                  </TouchableOpacity>
                )}

                {/* ══════════════════════════════════════════════════════
                    ── Inline quest form (expands below detection chips) ──
                    ══════════════════════════════════════════════════════ */}
                {questFormOpen && (
                  <View style={{ gap: 16 }}>

                    {/* ── WHAT'S THE CHORE? — pink/lavender section ── */}
                    <View style={{ borderRadius: 24, padding: 20, gap: 14,
                      backgroundColor: colors.pinkLight,
                      borderWidth: 1, borderColor: colors.border,
                      shadowColor: colors.pink, shadowOpacity: isDark ? 0 : 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 }}>
                      {/* Section label */}
                      <View style={{ gap: 6 }}>
                        <View style={{ height: 2, width: 28, borderRadius: 1, backgroundColor: colors.pink, opacity: 0.6 }} />
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>WHAT'S THE CHORE</Text>
                      </View>
                      <TextInput
                        value={questTitle}
                        onChangeText={setQuestTitle}
                        placeholder="Chore title"
                        placeholderTextColor={colors.textTertiary}
                        style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontWeight: '500', color: colors.textPrimary }}
                      />
                      <TextInput
                        value={questDescription}
                        onChangeText={setQuestDescription}
                        placeholder="What does done look like? (optional)"
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: colors.textPrimary, minHeight: 80, textAlignVertical: 'top' }}
                      />
                    </View>

                    {/* ── MAKE ROOM FOR IT — teal/sage section ── */}
                    <View style={{ borderRadius: 24, padding: 20, gap: 14,
                      backgroundColor: colors.tealLight,
                      borderWidth: 1, borderColor: colors.border,
                      shadowColor: colors.teal, shadowOpacity: isDark ? 0 : 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 }}>
                      <View style={{ gap: 6 }}>
                        <View style={{ height: 2, width: 28, borderRadius: 1, backgroundColor: colors.teal, opacity: 0.6 }} />
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>WHEN</Text>
                      </View>

                      {/* Date + time row */}
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => setQuestShowDatePick(true)}
                          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        >
                          <Text style={{ fontSize: 15 }}>📅</Text>
                          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>{fmtDate(questDueDate)}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setQuestShowTimePick(true)}
                          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        >
                          <Text style={{ fontSize: 15 }}>🕐</Text>
                          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>{fmt12h(questDueTime)}</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Repeat chips */}
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.3 }}>Repeat</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {RECUR_OPTIONS.map(opt => (
                          <TouchableOpacity
                            key={opt.value}
                            onPress={() => setQuestRecurrence(opt.value)}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center',
                              backgroundColor: questRecurrence === opt.value ? colors.teal : colors.card,
                              borderWidth: 1, borderColor: questRecurrence === opt.value ? colors.teal : colors.border }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: questRecurrence === opt.value ? '#FFFFFF' : colors.textPrimary }}>{opt.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Day-of-week chips — weekly only */}
                      {questRecurrence === 'weekly' && (
                        <>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.3 }}>Repeats on</Text>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {['S','M','T','W','T','F','S'].map((label, idx) => {
                              const sel = questRecurrenceDays.includes(idx);
                              return (
                                <TouchableOpacity
                                  key={idx}
                                  onPress={() => setQuestRecurrenceDays(prev => sel ? prev.filter(d => d !== idx) : [...prev, idx])}
                                  style={{ flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: sel ? colors.teal : colors.card,
                                    borderWidth: 1, borderColor: sel ? colors.teal : colors.border }}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? '#FFFFFF' : colors.textPrimary }}>{label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </>
                      )}

                      {questRecurrence !== 'once' && (
                        <>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.3 }}>Ends on (optional)</Text>
                          <TouchableOpacity
                            onPress={() => setQuestShowEndDatePick(true)}
                            style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                          >
                            <Text style={{ fontSize: 15 }}>🏁</Text>
                            <Text style={{ fontSize: 14, color: questEndDate ? colors.textPrimary : colors.textTertiary }}>
                              {questEndDate ? fmtDate(questEndDate) : 'No end date'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>

                    {/* ── WHO'S ON IT? — amber section ── */}
                    <View style={{ borderRadius: 24, padding: 20, gap: 14,
                      backgroundColor: colors.amberLight,
                      borderWidth: 1, borderColor: colors.border,
                      shadowColor: colors.amber, shadowOpacity: isDark ? 0 : 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ gap: 6 }}>
                          <View style={{ height: 2, width: 28, borderRadius: 1, backgroundColor: colors.amber, opacity: 0.6 }} />
                          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>WHO'S ON IT</Text>
                        </View>
                        {/* Pool toggle pill */}
                        <TouchableOpacity
                          onPress={() => { setQuestIsPool(!questIsPool); if (!questIsPool) setQuestAssigneeIds([]); }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                            backgroundColor: questIsPool ? colors.amber : colors.card,
                            borderWidth: 1, borderColor: questIsPool ? colors.amber : colors.border }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: questIsPool ? '#FFFFFF' : colors.textSecondary }}>
                            ⚡ Pool
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {questIsPool ? (
                        <View style={{ gap: 10 }}>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            {members.map(m => {
                              const isAdult = m.role === 'parent';
                              const accentColor = isAdult ? colors.teal : colors.amber;
                              const lightBg = isAdult ? colors.tealLight : colors.amberLight;
                              return (
                                <View key={m.id} style={{ alignItems: 'center' }}>
                                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: accentColor }}>
                                    <Text style={{ fontSize: 20, fontWeight: '700', color: accentColor }}>{m.name[0].toUpperCase()}</Text>
                                    <View style={{ position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.card }}>
                                      <Text style={{ fontSize: 9 }}>⚡</Text>
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.amber }}>Anyone can claim · first to grab it gets the coins</Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                          {members.map(m => {
                            const sel = questAssigneeIds.includes(m.id);
                            const isAdult = m.role === 'parent';
                            const accentColor = isAdult ? colors.teal : colors.amber;
                            return (
                              <TouchableOpacity
                                key={m.id}
                                onPress={() => setQuestAssigneeIds(prev => sel ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                                style={{ alignItems: 'center', gap: 4 }}
                              >
                                <View style={{
                                  width: 52, height: 52, borderRadius: 26,
                                  backgroundColor: sel ? accentColor : colors.card,
                                  alignItems: 'center', justifyContent: 'center',
                                  borderWidth: sel ? 0 : 1.5, borderColor: colors.border,
                                }}>
                                  <Text style={{ fontSize: 20, fontWeight: '700', color: sel ? '#FFFFFF' : accentColor }}>
                                    {m.name[0].toUpperCase()}
                                  </Text>
                                </View>
                                {m.id === assigneeMember?.id && !sel && (
                                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: accentColor }} />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                          {questAssigneeIds.length === 0 && (
                            <Text style={{ fontSize: 12, color: colors.textTertiary, alignSelf: 'center', paddingTop: 8 }}>Tap to assign · or enable Pool ⚡</Text>
                          )}
                        </View>
                      )}
                    </View>

                    {/* ── REWARD — pink section ── */}
                    <View style={{ borderRadius: 24, padding: 20, gap: 14,
                      backgroundColor: colors.pinkLight,
                      borderWidth: 1, borderColor: colors.border,
                      shadowColor: colors.pink, shadowOpacity: isDark ? 0 : 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 }}>
                      <View style={{ gap: 6 }}>
                        <View style={{ height: 2, width: 28, borderRadius: 1, backgroundColor: colors.pink, opacity: 0.6 }} />
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>REWARD</Text>
                      </View>

                      {/* Coin presets */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {COIN_OPTIONS.map(c => (
                          <TouchableOpacity
                            key={c}
                            onPress={() => { setQuestCoins(c); setQuestCustomCoins(''); }}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center',
                              backgroundColor: questCoins === c && !questCustomCoins ? colors.amber : colors.card,
                              borderWidth: 1, borderColor: questCoins === c && !questCustomCoins ? colors.amber : colors.border }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: questCoins === c && !questCustomCoins ? '#FFFFFF' : colors.textPrimary }}>🪙 {c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Custom coins — prefixed input */}
                      <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: questCustomCoins ? colors.amber : colors.border, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
                        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderRightWidth: 1, borderRightColor: questCustomCoins ? colors.amber : colors.border }}>
                          <Text style={{ fontSize: 15, color: colors.amber }}>🪙</Text>
                        </View>
                        <TextInput
                          value={questCustomCoins}
                          onChangeText={setQuestCustomCoins}
                          placeholder="Custom coins…"
                          placeholderTextColor={colors.textTertiary}
                          keyboardType="number-pad"
                          style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontWeight: '600', color: questCustomCoins ? colors.amber : colors.textPrimary }}
                        />
                        {questCustomCoins ? (
                          <TouchableOpacity onPress={() => setQuestCustomCoins('')} style={{ paddingHorizontal: 16 }}>
                            <Text style={{ fontSize: 13, color: colors.textTertiary }}>✕</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {/* Bonus reward toggle card */}
                      <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: questBonusEnabled ? colors.amber : colors.border, overflow: 'hidden' }}>
                        <TouchableOpacity
                          onPress={() => setQuestBonusEnabled(!questBonusEnabled)}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}
                        >
                          <View style={{ gap: 2 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>⭐ Bonus reward</Text>
                            <Text style={{ fontSize: 11, color: colors.textSecondary }}>Extra coins for early or exceptional finish</Text>
                          </View>
                          <View style={{ width: 36, height: 22, borderRadius: 11,
                            backgroundColor: questBonusEnabled ? colors.amber : colors.surface,
                            alignItems: questBonusEnabled ? 'flex-end' : 'flex-start',
                            paddingHorizontal: 2, justifyContent: 'center' }}>
                            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: questBonusEnabled ? '#FFFFFF' : colors.textTertiary }} />
                          </View>
                        </TouchableOpacity>
                        {questBonusEnabled && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.amberLight }}>
                            <View style={{ paddingHorizontal: 16, paddingVertical: 13, borderRightWidth: 1, borderRightColor: colors.amberLight }}>
                              <Text style={{ fontSize: 15 }}>⭐</Text>
                            </View>
                            <TextInput
                              value={questBonusCoins}
                              onChangeText={setQuestBonusCoins}
                              placeholder="Bonus coins amount"
                              placeholderTextColor={colors.textTertiary}
                              keyboardType="number-pad"
                              style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, fontWeight: '600', color: colors.amber }}
                            />
                          </View>
                        )}
                      </View>
                    </View>

                    {/* PREVIEW CARD — always visible, mirrors real QuestCard collapsed header */}
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' }}>Card preview</Text>
                      <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: fieldBorder,
                        paddingHorizontal: 16, paddingVertical: 14, gap: 8,
                        shadowColor: '#000', shadowOpacity: isDark ? 0.25 : 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>

                        {/* Header — title left, avatar stack right (real card rhythm) */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
                          {/* Title + status line */}
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: questTitle.trim() ? colors.textPrimary : colors.textTertiary }} numberOfLines={1}>
                              {questTitle.trim() || 'Chore title…'}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                              {questIsPool
                                ? 'Open — claim it'
                                : questAssigneeIds.length > 1
                                  ? 'Not started'
                                  : questAssigneeIds.length === 1
                                    ? 'Not started'
                                    : 'Unassigned'}
                              {catLabel ? `  ·  ${catEmoji} ${catLabel}` : ''}
                            </Text>
                          </View>

                          {/* Right side: avatar stack + coin badge */}
                          <View style={{ alignItems: 'flex-end', gap: 6 }}>
                            {/* Stacked avatars (pool = all members + ⚡, assigned = selected members) */}
                            <View style={{ flexDirection: 'row' }}>
                              {questIsPool
                                ? members.slice(0, 3).map((m, i) => {
                                    const isAdult = m.role === 'parent';
                                    return (
                                      <View key={m.id} style={{ width: 30, height: 30, borderRadius: 15, marginLeft: i > 0 ? -8 : 0,
                                        backgroundColor: isAdult ? colors.tealLight : colors.amberLight,
                                        alignItems: 'center', justifyContent: 'center',
                                        borderWidth: 2, borderColor: colors.card }}>
                                        <Text style={{ fontSize: 11, fontWeight: '800', color: isAdult ? colors.teal : colors.amber }}>{m.name[0]}</Text>
                                        <View style={{ position: 'absolute', bottom: -2, right: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.card }}>
                                          <Text style={{ fontSize: 7 }}>⚡</Text>
                                        </View>
                                      </View>
                                    );
                                  })
                                : questAssigneeIds.length > 0
                                  ? questAssigneeIds.slice(0, 3).map((id, i) => {
                                      const m = members.find(mb => mb.id === id);
                                      if (!m) return null;
                                      const isAdult = m.role === 'parent';
                                      return (
                                        <View key={id} style={{ width: 30, height: 30, borderRadius: 15, marginLeft: i > 0 ? -8 : 0,
                                          backgroundColor: isAdult ? colors.tealLight : colors.amberLight,
                                          alignItems: 'center', justifyContent: 'center',
                                          borderWidth: 2, borderColor: colors.card }}>
                                          <Text style={{ fontSize: 11, fontWeight: '800', color: isAdult ? colors.teal : colors.amber }}>{m.name[0]}</Text>
                                        </View>
                                      );
                                    })
                                  : (
                                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                                      <Text style={{ fontSize: 12, color: colors.textTertiary }}>?</Text>
                                    </View>
                                  )
                              }
                            </View>

                            {/* Coins badge */}
                            <View style={{ backgroundColor: colors.amberLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.amber }}>🪙 {questCustomCoins || questCoins}</Text>
                            </View>
                          </View>
                        </View>

                        {/* Chips row: due date · recurrence · bonus */}
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {questDueDate && (
                            <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary }}>
                                📅 {fmtDate(questDueDate)} · {fmt12h(questDueTime)}
                              </Text>
                            </View>
                          )}
                          {questRecurrence !== 'once' && (
                            <View style={{ backgroundColor: colors.tealLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>
                                🔁 {questRecurrence === 'weekly' && questRecurrenceDays.length > 0
                                  ? `Weekly · ${questRecurrenceDays.map(d => ['S','M','T','W','T','F','S'][d]).join('/')}`
                                  : questRecurrence.charAt(0).toUpperCase() + questRecurrence.slice(1)}
                              </Text>
                            </View>
                          )}
                          {questBonusEnabled && parseInt(questBonusCoins) > 0 && (
                            <View style={{ backgroundColor: colors.pinkLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.pink }}>⭐ +{questBonusCoins} bonus</Text>
                            </View>
                          )}
                        </View>

                        {questDescription.trim() ? (
                          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }} numberOfLines={2}>{questDescription}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Save button */}
                    <TouchableOpacity
                      onPress={handleSaveQuest}
                      disabled={!questTitle.trim() || savingQuest}
                      style={{ height: 52, borderRadius: 14,
                        backgroundColor: questTitle.trim() ? activeBlue : (isDark ? colors.surface : '#E6EAF1'),
                        alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
                    >
                      {savingQuest
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={{ fontSize: 15, fontWeight: '700', color: questTitle.trim() ? '#FFFFFF' : colors.textTertiary }}>Save chore</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setQuestFormOpen(false)} style={{ alignItems: 'center', paddingVertical: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>‹ Back · edit description</Text>
                    </TouchableOpacity>

                  </View>
                )}

              </View>
            </View>
          </ScrollView>

          {/* ── Bottom bar — only shown when no inline form open ── */}
          {!questFormOpen && (
            <View style={{ backgroundColor: fieldBg, paddingHorizontal: 24, paddingTop: 16, paddingBottom: Math.max(insets.bottom, 16) + 4, gap: 10, borderTopWidth: 1, borderTopColor: fieldBorder }}>
              <TouchableOpacity onPress={handleClose} style={{ height: 48, borderRadius: 14, backgroundColor: fieldBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: fieldBorder }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: activeBlue }}>Close · return unchanged</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Date pickers */}
          <AppDateTimePicker
            visible={questShowDatePick}
            mode="date"
            value={new Date(questDueDate + 'T00:00:00')}
            onConfirm={d => { setQuestDueDate(d.toISOString().slice(0, 10)); setQuestShowDatePick(false); }}
            onCancel={() => setQuestShowDatePick(false)}
          />
          <AppDateTimePicker
            visible={questShowTimePick}
            mode="time"
            value={(() => { const [h, m] = questDueTime.split(':'); const d = new Date(); d.setHours(+h, +m, 0, 0); return d; })()}
            onConfirm={d => { setQuestDueTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); setQuestShowTimePick(false); }}
            onCancel={() => setQuestShowTimePick(false)}
          />
          <AppDateTimePicker
            visible={questShowEndDatePick}
            mode="date"
            value={new Date((questEndDate || questDueDate) + 'T00:00:00')}
            onConfirm={d => { setQuestEndDate(d.toISOString().slice(0, 10)); setQuestShowEndDatePick(false); }}
            onCancel={() => setQuestShowEndDatePick(false)}
          />

        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
