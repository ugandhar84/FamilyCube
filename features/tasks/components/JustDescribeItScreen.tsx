/**
 * JustDescribeItScreen — Figma "05 Plan · Tasks and queue" full-page task
 * creator, dedicated to the Tasks tab. Four states matching Figma exactly:
 *   1. Empty   — tip cards + "Speak your task" CTA
 *   2. Typing  — live auto-detection chips (category / time / assignee)
 *   3. Voice   — waveform + Stop / Cancel audio
 *   4. Assignee — full suggestion card + Accept / Override
 *
 * Logic reuses localTaskDetection + useVoiceDictation + previewAssignment
 * from SmartTaskComposer without duplication. On confirm it hands off to
 * AddQuestModal or AddEventModal pre-filled (same onOpenFullForm pattern).
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
import type { FamilyMember } from '@/store/familyStore';
import { todayLocal, nextHourRoundedStr } from '@/lib/dates';

const MIN_CHARS = 3;

// Figma periwinkle-blue primary for this screen
const PERIWINKLE = '#6677bd';
const PERIWINKLE_LIGHT = '#e9edfb';
const PERIWINKLE_DARK = '#3d50a0';

function WaveformBar({ delay }: { delay: number }) {
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
      width: 4, borderRadius: 2, backgroundColor: PERIWINKLE,
      height: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 36] }),
    }} />
  );
}

function Waveform() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: 8 }}>
      {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(i => (
        <WaveformBar key={i} delay={i} />
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

  const [input, setInput] = useState('');
  const [detection, setDetection] = useState<ReturnType<typeof detectLocalTask>>(null);

  // Accepted / locked fields
  const [acceptedCategory, setAcceptedCategory] = useState(false);
  const [acceptedWhen, setAcceptedWhen] = useState(false);
  const [acceptedAssignee, setAcceptedAssignee] = useState<string | null>(null);

  // Suggestion
  const [suggestion, setSuggestion] = useState<{ name: string; reason: string } | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [showAssigneeCard, setShowAssigneeCard] = useState(false);

  const dictation = useVoiceDictation();
  const inputRef = useRef<TextInput>(null);

  const reset = () => {
    setInput('');
    setDetection(null);
    setAcceptedCategory(false);
    setAcceptedWhen(false);
    setAcceptedAssignee(null);
    setSuggestion(null);
    setLoadingSuggestion(false);
    setShowAssigneeCard(false);
    dictation.reset();
  };

  const handleClose = () => { reset(); onClose(); };

  // Live local detection on every keystroke
  useEffect(() => {
    if (input.trim().length < MIN_CHARS) { setDetection(null); return; }
    const d = detectLocalTask(input, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
    setDetection(d);
  }, [input, members]);

  // Fetch assignee suggestion when category is known
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

  // When voice stops, set input to transcript
  const handleStopVoice = async () => {
    const t = await dictation.stop();
    if (t) setInput(t);
  };

  const isListening = dictation.state === 'listening';
  const hasInput = input.trim().length >= MIN_CHARS;
  const detected = detection;
  const catLabel = detected ? (detected.category.kind === 'event' ? detected.category.eventCategory : detected.category.questCategory) : null;
  const catEmoji = detected?.category.emoji ?? '';
  const catSource = detected ? (detected.confidence >= 80 ? 'Auto-detected' : 'Suggested') : null;

  // Build time label
  const detectedTime = detected?.when.time ? detected.when.time.slice(0, 5) : null;
  const detectedDate = detected?.when.date;
  const timeLabel = detectedDate && detectedTime
    ? `${detectedDate === todayLocal() ? 'Today' : detectedDate}, ${detectedTime.replace(':', ':')}`
    : detectedDate ? (detectedDate === todayLocal() ? 'Today' : detectedDate)
    : detectedTime ? detectedTime
    : null;
  const timeInterpretation = detectedTime ? `"at ${detectedTime}" interpreted as ${detectedTime}; is that right?` : null;

  // Suggested member from detection text
  const detectedMemberName = detected?.memberNames[0] ?? null;
  const suggestedMemberName = suggestion?.name ?? null;
  const displayAssignee = detectedMemberName ?? suggestedMemberName;
  const assigneeMember = displayAssignee ? members.find(m => m.name.split(' ')[0].toLowerCase() === displayAssignee.toLowerCase() || m.name.toLowerCase() === displayAssignee.toLowerCase()) : null;

  const handleConfirm = () => {
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
      memberId: acceptedAssignee ?? assigneeMember?.id,
      startAt,
      pickupLocation: detected.locations.pickup ?? undefined,
      dropLocation: detected.locations.dropoff ?? undefined,
    });
    handleClose();
  };

  const CARD_BG = isDark ? 'rgba(102,119,189,0.13)' : PERIWINKLE_LIGHT;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.background : '#f8f7fb' }} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* ── TopBar ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6,
          }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#A89CD0' : '#5265b1', letterSpacing: 0.5 }}>
                {familyName.toUpperCase()} / {activeMember?.name?.split(' ')[1]?.toUpperCase() ?? activeMember?.name?.toUpperCase()} · {activeMember?.name?.split(' ')[0]}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: isDark ? 'rgba(102,119,189,0.25)' : 'white',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#2C3244', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
              }}>
                <Text style={{ fontSize: 18, color: isDark ? '#A89CD0' : PERIWINKLE, fontWeight: '300', lineHeight: 22, marginTop: -1 }}>+</Text>
              </View>
            </View>
          </View>

          {/* ← Close link */}
          <TouchableOpacity onPress={handleClose} style={{ paddingHorizontal: 20, paddingBottom: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#A89CD0' : PERIWINKLE }}>
              ‹ Close · return to Today
            </Text>
          </TouchableOpacity>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 + insets.bottom }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── H1 ── */}
            <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: -0.04 * 34, color: colors.textPrimary, marginTop: 8, lineHeight: 40 }}>
              Just describe it
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: 20, lineHeight: 1.45 * 13 }}>
              Type a thought. Speak a thought. Make it a plan.
            </Text>

            {/* ── Input box ── */}
            <View style={{
              borderRadius: 16, borderWidth: 1.5,
              borderColor: isListening ? PERIWINKLE : (isDark ? colors.border : '#d0d3e0'),
              backgroundColor: isDark ? colors.surface : 'white',
              padding: 14, gap: 10,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, letterSpacing: 0.2 }}>
                {isListening ? 'Editable transcript · listening' : 'What needs doing?'}
              </Text>
              <TextInput
                ref={inputRef}
                value={isListening ? dictation.liveTranscript : input}
                onChangeText={setInput}
                editable={!isListening}
                placeholder="Something on your mind?"
                placeholderTextColor={colors.textTertiary}
                multiline
                style={{
                  fontSize: 22, fontWeight: '500', color: colors.textPrimary,
                  minHeight: 60, lineHeight: 28,
                }}
              />

              {/* Voice state row inside box */}
              {isListening ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, color: isDark ? '#A89CD0' : PERIWINKLE, fontWeight: '600' }}>
                    Listening · {String(Math.floor(0)).padStart(2,'0')}:{String(0).padStart(2,'0')}
                  </Text>
                  <TouchableOpacity
                    onPress={handleStopVoice}
                    style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isDark ? colors.surface : '#f0f1f6', alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: isDark ? '#A89CD0' : PERIWINKLE }} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                    {hasInput ? 'Unsaved · only a draft' : 'Nothing created yet'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => dictation.start()}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontSize: 20, color: isDark ? '#A89CD0' : PERIWINKLE }}>🎤</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── Voice active: waveform + buttons ── */}
            {isListening && (
              <View style={{
                marginTop: 14, borderRadius: 16, padding: 18, gap: 16,
                backgroundColor: isDark ? 'rgba(102,119,189,0.15)' : PERIWINKLE_LIGHT,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#A89CD0' : PERIWINKLE, letterSpacing: 0.5 }}>
                  Recording · Listening
                </Text>
                <Waveform />
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <TouchableOpacity
                    onPress={handleStopVoice}
                    style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: isDark ? '#5265b1' : PERIWINKLE, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Stop</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { dictation.reset(); }}
                    style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: isDark ? colors.surface : 'white', alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: isDark ? colors.border : '#d0d3e0' }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>Cancel audio</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center', lineHeight: 14 }}>
                  Transcript may contain errors. Stop to edit it. Audio and draft stay private until you explicitly save; no task is auto-created.
                </Text>
                {input.trim() ? (
                  <View style={{ width: '100%', borderRadius: 12, padding: 12, backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.7)' }}>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>Transcript · editable after Stop</Text>
                    <Text style={{ fontSize: 14, color: colors.textPrimary }}>{input}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* ── Live detection chips ── */}
            {!isListening && hasInput && detected && !showAssigneeCard && (
              <View style={{ marginTop: 16, gap: 10 }}>
                {catLabel && (
                  <View style={{ gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                      {catSource} · Category: {catEmoji} {catLabel}
                    </Text>
                    {detected.category.kw.length > 0 && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        From "{detected.category.kw[0]}" ·{' '}
                        {acceptedCategory
                          ? <Text style={{ color: isDark ? '#5FA37D' : '#527d6d', fontWeight: '700' }}>Accepted</Text>
                          : <>
                            <Text style={{ color: isDark ? '#A89CD0' : PERIWINKLE, fontWeight: '700' }}
                              onPress={() => setAcceptedCategory(true)}>Accept</Text>
                            {' / '}
                            <Text style={{ color: colors.textSecondary }}>Edit →</Text>
                          </>}
                      </Text>
                    )}
                  </View>
                )}

                {timeLabel && (
                  <View style={{ gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                      Auto-detected · {timeLabel}
                    </Text>
                    {timeInterpretation && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        "{timeInterpretation.split('"')[1]}" ·{' '}
                        {acceptedWhen
                          ? <Text style={{ color: isDark ? '#5FA37D' : '#527d6d', fontWeight: '700' }}>Confirmed</Text>
                          : <>
                            <Text style={{ color: isDark ? '#A89CD0' : PERIWINKLE, fontWeight: '700' }}
                              onPress={() => setAcceptedWhen(true)}>Confirm</Text>
                            {' / '}
                            <Text style={{ color: colors.textSecondary }}>Edit →</Text>
                          </>}
                      </Text>
                    )}
                  </View>
                )}

                {(displayAssignee || loadingSuggestion) && (
                  <View style={{ gap: 2 }}>
                    {loadingSuggestion ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ActivityIndicator size="small" color={isDark ? '#A89CD0' : PERIWINKLE} />
                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>Checking availability…</Text>
                      </View>
                    ) : displayAssignee ? (
                      <>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                          Suggested · {displayAssignee}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          {suggestion?.reason ?? 'Moderate confidence'} ·{' '}
                          <Text style={{ color: isDark ? '#A89CD0' : PERIWINKLE, fontWeight: '700' }}
                            onPress={() => setShowAssigneeCard(true)}>Accept / Override →</Text>
                        </Text>
                      </>
                    ) : null}
                  </View>
                )}

                {/* Time mismatch warning */}
                {detected.when.time && detected.when.returnTime && (
                  <View style={{
                    borderRadius: 14, padding: 14,
                    backgroundColor: isDark ? 'rgba(249,235,231,0.1)' : '#f9ebe7',
                    borderWidth: 1, borderColor: isDark ? 'rgba(213,139,123,0.3)' : '#f0ddd8',
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#E8A090' : '#965f54' }}>
                      Time mismatch · needs your choice
                    </Text>
                    <Text style={{ fontSize: 11, color: isDark ? '#C09080' : '#786a68', marginTop: 3 }}>
                      Check the overlap — source event unchanged.
                    </Text>
                    <TouchableOpacity style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#A89CD0' : PERIWINKLE }}>
                        Correct to {detected.when.returnTime} & lock
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Suggested assignee full card ── */}
            {!isListening && showAssigneeCard && displayAssignee && (
              <View style={{ marginTop: 16, gap: 12 }}>
                <View style={{
                  borderRadius: 16, padding: 18, gap: 8,
                  backgroundColor: isDark ? colors.surface : 'white',
                  borderWidth: 1, borderColor: isDark ? colors.border : '#e2e3ea',
                }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                    Suggested assignee · {displayAssignee}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>
                    {suggestion?.reason ?? 'Moderate confidence. Check calendar availability and travel time first.'}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4 }}>
                    Availability checked against shared plan. No guarantee of acceptance.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { setAcceptedAssignee(assigneeMember?.id ?? null); setShowAssigneeCard(false); handleConfirm(); }}
                  style={{ height: 52, borderRadius: 14, backgroundColor: isDark ? '#5265b1' : PERIWINKLE, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                    Accept {displayAssignee} & lock choice
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setAcceptedAssignee(null); setShowAssigneeCard(false); handleConfirm(); }}
                  style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: isDark ? '#5265b1' : PERIWINKLE }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#A89CD0' : PERIWINKLE }}>
                    Override · choose someone else
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Empty state ── */}
            {!isListening && !hasInput && (
              <View style={{ gap: 14, marginTop: 4 }}>
                {/* "One sentence is enough" tip */}
                <View style={{ borderRadius: 18, padding: 18, backgroundColor: isDark ? colors.surface : 'white',
                  borderWidth: 1, borderColor: isDark ? colors.border : '#e2e3ea' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
                    One sentence is enough
                  </Text>
                  <Text style={{ fontSize: 13, color: isDark ? '#A89CD0' : PERIWINKLE, fontWeight: '600', marginBottom: 6 }}>
                    "pick up Leo from soccer at 4"
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>
                    We can suggest category, time and person. You confirm the details before anything is saved.
                  </Text>
                </View>

                {/* Speak your task CTA */}
                <TouchableOpacity
                  onPress={() => dictation.start()}
                  style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: isDark ? '#5265b1' : PERIWINKLE,
                    backgroundColor: 'transparent' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#A89CD0' : PERIWINKLE }}>
                    Speak your task
                  </Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 17 }}>
                  Your own wording comes first. Use type or voice—there's no extra create menu.
                </Text>

                {/* Your privacy card */}
                <View style={{ borderRadius: 18, padding: 18, backgroundColor: isDark ? colors.surface : 'white',
                  borderWidth: 1, borderColor: isDark ? colors.border : '#e2e3ea' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>Your privacy</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 17 }}>
                    Detection runs entirely on your device. Nothing is sent anywhere until you explicitly save.
                  </Text>
                </View>
              </View>
            )}

            {/* ── Confirm button ── */}
            {!isListening && hasInput && !showAssigneeCard && (
              <TouchableOpacity
                onPress={handleConfirm}
                style={{ marginTop: 20, height: 52, borderRadius: 14, backgroundColor: isDark ? '#5265b1' : PERIWINKLE, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                  {detected ? `Review & save ${detected.category.kind === 'event' ? 'event' : 'task'}` : 'Open full form →'}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
