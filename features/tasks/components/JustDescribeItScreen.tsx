/**
 * JustDescribeItScreen — Figma "Tasks · Capture" full-page natural-language
 * composer. Three states from the Figma spec:
 *   1. Resting   — empty composer + two info cards + greyed action bar
 *   2. Detection — active composer (2px blue border) + E9EFFF detection card
 *                  + FFE8E3 conflict card + member choice row
 *   3. Voice     — active composer + waveform card + Stop/Cancel + transcript field
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Modal, Animated, Easing, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { detectLocalTask } from '../lib/localTaskDetection';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { previewAssignment } from '@/lib/responsibilityCategories';
import { todayLocal, nextHourRoundedStr } from '@/lib/dates';
import { familyAi } from '@/lib/familyAiService';
import { Mic, Square } from 'lucide-react-native';

const MIN_CHARS = 3;

function fmtQuestDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

function fmtQuest12h(hhmm: string): string {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
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
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyName = useFamilyStore(s => s.familyName) ?? 'Family';

  const [aiAutoFilling, setAiAutoFilling] = useState(false);
  const [input, setInput] = useState('');
  const [detection, setDetection] = useState<ReturnType<typeof detectLocalTask>>(null);
  const [acceptedAssignee, setAcceptedAssignee] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ name: string; reason: string } | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const dictation = useVoiceDictation();
  const inputRef = useRef<TextInput>(null);

  const reset = () => {
    setInput('');
    setDetection(null);
    setAcceptedAssignee(null);
    setSuggestion(null);
    setLoadingSuggestion(false);
    setAiAutoFilling(false);
    setInputFocused(false);
    dictation.reset();
  };

  const handleClose = () => { reset(); onClose(); };

  useEffect(() => {
    if (input.trim().length < MIN_CHARS) { setDetection(null); setAcceptedAssignee(null); return; }
    const d = detectLocalTask(input, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
    setDetection(d);
    setAcceptedAssignee(null);
  }, [input, members]);

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

  const handleConfirmWithAssignee = (resolvedMemberId: string | null) => {
    if (!detected) return;
    const kind = detected.category.kind;
    const cat = kind === 'event' ? detected.category.eventCategory : detected.category.questCategory;
    let startAt: string | undefined;
    if (detected.when.date && detected.when.time) {
      startAt = `${detected.when.date}T${detected.when.time}:00`;
    } else if (detected.when.date) {
      startAt = `${detected.when.date}T${nextHourRoundedStr()}:00`;
    }
    onOpenFullForm(kind, {
      title: input.trim(),
      category: cat ?? undefined,
      memberId: resolvedMemberId ?? undefined,
      startAt,
      pickupLocation: detected.locations.pickup ?? undefined,
      dropLocation: detected.locations.dropoff ?? undefined,
    });
    reset();
  };

  const openQuestForm = () => {
    let cleanTitle = input.trim();
    cleanTitle = cleanTitle
      .replace(/\s+(at|by|@)\s+\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)?/gi, '')
      .replace(/\s+\d{1,2}:\d{2}\s*(am|pm|AM|PM)?/gi, '')
      .replace(/\s+every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week|month)/gi, '')
      .replace(/\s{2,}/g, ' ').trim();
    let startAt: string | undefined;
    if (detected?.when.date && detected?.when.time) {
      startAt = `${detected.when.date}T${detected.when.time}:00`;
    } else if (detected?.when.date) {
      startAt = `${detected.when.date}T09:00:00`;
    }
    onOpenFullForm('quest', {
      title: cleanTitle,
      category: detected?.category.questCategory ?? undefined,
      memberId: assigneeMember?.id ?? undefined,
      startAt,
      coins: 30,
    });
    reset();
  };

  const handleAiAutoFill = async () => {
    if (!input.trim() || aiAutoFilling) return;
    setAiAutoFilling(true);
    try {
      const result = await familyAi.extractResponsibility(
        input.trim(),
        members.map(m => ({ id: m.id, name: m.name, role: m.role }))
      );
      if (result?.task?.title) setInput(result.task.title);
    } catch { /* silently fail */ }
    finally { setAiAutoFilling(false); }
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
    ? `${detectedDate === todayLocal() ? 'Today' : fmtQuestDate(detectedDate)} · ${fmtQuest12h(detectedTime)}`
    : detectedDate ? (detectedDate === todayLocal() ? 'Today' : fmtQuestDate(detectedDate))
    : detectedTime ? fmtQuest12h(detectedTime)
    : null;

  const detectedMemberName = detected?.memberNames[0] ?? null;
  const suggestedMemberName = suggestion?.name ?? null;
  const displayAssignee = detectedMemberName ?? suggestedMemberName;
  const assigneeMember = displayAssignee
    ? members.find(m =>
        m.name.split(' ')[0].toLowerCase() === displayAssignee.toLowerCase() ||
        m.name.toLowerCase() === displayAssignee.toLowerCase()
      )
    : null;

  // Figma tokens
  const canvasBg    = isDark ? '#0E0C13' : '#F5F7FB';
  const fieldBg     = isDark ? colors.surface : '#FFFFFF';
  const fieldBorder = isDark ? colors.border : '#DFE5EF';
  const activeBlue  = colors.primary;            // #345DE3 → colors.primary
  const linkBlue    = colors.primary;            // #294FC7 → same brand primary
  const detectionCardBg  = isDark ? colors.surface : colors.pinkLight;   // #E9EFFF
  const conflictCardBg   = isDark ? colors.surface : colors.primaryLight; // #FFE8E3

  const primaryReady = hasInput && !isListening;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: canvasBg }} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: canvasBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Page body: 24px horizontal padding ── */}
            <View style={{ paddingHorizontal: 24, paddingTop: 24, gap: 16 }}>

              {/* Household chrome row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 44 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                  {familyName.toUpperCase()} / {activeMember?.name?.split(' ')[0]?.toUpperCase()}
                </Text>
                {/* Quick capture + button */}
                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 28, lineHeight: 34, color: activeBlue, fontWeight: '400' }}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Back destination */}
              <TouchableOpacity onPress={handleClose} style={{ marginTop: -8 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: linkBlue }}>
                  ‹ Close · return to Today
                </Text>
              </TouchableOpacity>

              {/* Page title */}
              <Text style={{ fontSize: 29, fontWeight: '700', color: colors.textPrimary, lineHeight: 41 }}>
                Just describe it
              </Text>

              {/* ── Feature content ── */}
              <View style={{ gap: 12 }}>

                {/* Supporting line */}
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                  Type or speak — we'll figure out the rest
                </Text>

                {/* ── Natural-language composer ── */}
                <View style={{
                  backgroundColor: fieldBg,
                  borderRadius: 22,
                  borderWidth: inputFocused || isListening ? 2 : 1,
                  borderColor: inputFocused || isListening ? activeBlue : fieldBorder,
                  padding: 20,
                  gap: 16,
                  minHeight: 170,
                }}>
                  {/* Persistent label */}
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                    {isListening ? 'Editable transcript · listening' : 'What needs doing?'}
                  </Text>

                  {/* Natural description input */}
                  <TextInput
                    ref={inputRef}
                    value={isListening ? dictation.liveTranscript : input}
                    onChangeText={setInput}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    editable={!isListening}
                    placeholder="Something on your mind?"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    style={{
                      fontSize: 24, fontWeight: '500', lineHeight: 34,
                      color: hasInput || isListening ? colors.textPrimary : colors.textSecondary,
                      minHeight: 34,
                    }}
                  />

                  {/* Composer tools row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 48 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                        {isListening ? 'Recording…' : hasInput ? 'Unsaved · only a draft' : 'Nothing created yet'}
                      </Text>
                      {hasInput && !isListening && (
                        <TouchableOpacity
                          onPress={handleAiAutoFill}
                          disabled={aiAutoFilling}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: detectionCardBg }}
                        >
                          {aiAutoFilling
                            ? <ActivityIndicator size="small" color={colors.pink} />
                            : <Text style={{ fontSize: 12 }}>✨</Text>}
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.pink }}>
                            {aiAutoFilling ? 'Filling…' : 'AI fill'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* Mic / Stop button — Figma: 48px circle, #E9EFFF bg */}
                    <TouchableOpacity
                      onPress={isListening ? handleStopVoice : () => dictation.start()}
                      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: detectionCardBg, alignItems: 'center', justifyContent: 'center' }}
                    >
                      {isListening
                        ? <Square size={20} color={activeBlue} strokeWidth={1.8} fill={activeBlue} />
                        : <Mic size={20} color={activeBlue} strokeWidth={1.8} />}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ── Voice dictation state ── */}
                {isListening && (
                  <View style={{ backgroundColor: detectionCardBg, borderRadius: 22, padding: 16, gap: 12 }}>
                    {/* Status pill */}
                    <View style={{ alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(52,93,227,0.1)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: activeBlue }}>● Listening · speak now</Text>
                    </View>
                    {/* Waveform */}
                    <Waveform color={activeBlue} />
                    {/* Stop / Cancel */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={handleStopVoice}
                        style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: activeBlue, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Stop</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => dictation.reset()}
                        style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: fieldBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: fieldBorder }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '600', color: linkBlue }}>Cancel audio</Text>
                      </TouchableOpacity>
                    </View>
                    {/* Privacy note */}
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                      Audio and transcript stay private until you explicitly save. No task is auto-created.
                    </Text>
                  </View>
                )}

                {/* ── Live detection state ── */}
                {!isListening && hasInput && detected && (
                  <>
                    {/* Detection card — Figma: #E9EFFF, 22px radius */}
                    <View style={{ backgroundColor: detectionCardBg, borderRadius: 22, padding: 16, gap: 12 }}>
                      {/* Category + keyword */}
                      {catLabel && (
                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, lineHeight: 22 }}>
                          {catEmoji ? `${catEmoji}  ` : ''}{catLabel}
                          {detected.category.kw.length > 0 ? `  ·  from "${detected.category.kw[0]}"` : ''}
                        </Text>
                      )}
                      {/* Time */}
                      {timeLabel && (
                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, lineHeight: 22 }}>
                          🕐  {timeLabel}
                        </Text>
                      )}
                      {/* Member suggestion loading */}
                      {loadingSuggestion && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <ActivityIndicator size="small" color={activeBlue} />
                          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>Checking schedule…</Text>
                        </View>
                      )}
                    </View>

                    {/* Conflict / category card — Figma: #FFE8E3 terracotta-light */}
                    {detected.category.kind === 'quest' && (
                      <View style={{ backgroundColor: conflictCardBg, borderRadius: 22, padding: 16, gap: 12 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, lineHeight: 22 }}>
                          Quest detected — set it up below
                        </Text>
                        <TouchableOpacity
                          onPress={openQuestForm}
                          style={{ height: 48, borderRadius: 14, backgroundColor: fieldBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: fieldBorder }}
                        >
                          <Text style={{ fontSize: 15, fontWeight: '600', color: linkBlue }}>Set up quest →</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Who's this for? */}
                    {detected.category.kind === 'event' && !loadingSuggestion && (
                      <>
                        <Text style={{ fontSize: 16, fontWeight: '400', color: colors.textPrimary, lineHeight: 22 }}>
                          Who should be involved in this event?
                        </Text>
                        {members.map(m => {
                          const isSuggested = m.id === assigneeMember?.id;
                          return (
                            <TouchableOpacity
                              key={m.id}
                              onPress={() => handleConfirmWithAssignee(m.id)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: fieldBg, borderRadius: 14, padding: 8, minHeight: 56 }}
                            >
                              <View style={{ width: 40, height: 40, borderRadius: 100, backgroundColor: detectionCardBg, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 15, fontWeight: '700', color: activeBlue }}>
                                  {m.name[0].toUpperCase()}
                                </Text>
                              </View>
                              <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.textPrimary, lineHeight: 22 }}>
                                {m.name.split(' ')[0]}{isSuggested ? '\nSuggested · ' + (suggestion?.reason ?? 'based on schedule') : '\n' + (m.role === 'parent' ? 'Parent' : 'Kid')}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                          You can also set this in the event form. Selection is just a shortcut.
                        </Text>
                      </>
                    )}
                  </>
                )}

                {/* ── Labeled field (transcript / description) shown after voice stops ── */}
                {!isListening && hasInput && (
                  <View style={{ backgroundColor: fieldBg, borderRadius: 14, borderWidth: 1, borderColor: fieldBorder, padding: 14, minHeight: 88 }}>
                    <Text style={{ fontSize: 14, fontWeight: '400', lineHeight: 24, color: colors.textPrimary }}>
                      {input}
                    </Text>
                  </View>
                )}

                {/* ── Resting state info cards ── */}
                {!isListening && !hasInput && (
                  <>
                    {/* "One sentence" card — Figma: white, shadow, 22px radius */}
                    <View style={{ backgroundColor: fieldBg, borderRadius: 22, padding: 16, gap: 12, shadowColor: '#172337', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
                      <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
                        One sentence is enough
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '400', color: colors.textPrimary, lineHeight: 22 }}>
                        "Pick up trash every Monday at 5 PM" or "Jaswi finish homework by 7 PM"
                      </Text>
                    </View>

                    {/* "Your privacy" card — Figma: white, shadow, 22px radius */}
                    <View style={{ backgroundColor: fieldBg, borderRadius: 22, padding: 16, gap: 12, shadowColor: '#172337', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
                      <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, lineHeight: 28 }}>
                        Your privacy
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '400', color: colors.textPrimary, lineHeight: 22 }}>
                        Detection runs entirely on your device. Nothing is sent anywhere until you explicitly save. No task is auto-created.
                      </Text>
                    </View>
                  </>
                )}

              </View>
            </View>
          </ScrollView>

          {/* ── Bottom action bar — Figma: white bg, 24px padding, gap 12 ── */}
          <View style={{
            backgroundColor: fieldBg,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            gap: 12,
          }}>
            {/* Primary action — greyed when no input, active blue when ready */}
            <TouchableOpacity
              onPress={primaryReady
                ? (detected?.category.kind === 'quest' ? openQuestForm : detected?.category.kind === 'event' ? () => handleConfirmWithAssignee(assigneeMember?.id ?? null) : () => handleConfirmWithAssignee(null))
                : undefined
              }
              activeOpacity={primaryReady ? 0.85 : 1}
              style={{
                height: 48, borderRadius: 14,
                backgroundColor: primaryReady ? activeBlue : (isDark ? colors.surface : '#E6EAF1'),
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: primaryReady ? '#FFFFFF' : (isDark ? colors.textTertiary : '#778396') }}>
                {detected?.category.kind === 'quest'
                  ? 'Set up quest →'
                  : detected?.category.kind === 'event'
                  ? 'Set up event →'
                  : hasInput
                  ? 'Open full form →'
                  : 'Next · When'}
              </Text>
            </TouchableOpacity>

            {/* Secondary action */}
            <TouchableOpacity
              onPress={handleClose}
              style={{ height: 48, borderRadius: 14, backgroundColor: fieldBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: fieldBorder }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: linkBlue }}>
                Close · return unchanged
              </Text>
            </TouchableOpacity>
          </View>

        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
