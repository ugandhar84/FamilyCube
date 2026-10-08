/**
 * JustDescribeItEventScreen — full-page natural-language event composer
 * for the Schedule tab's + button.
 *
 * Mirrors JustDescribeItScreen (chores) but routes to calendar events:
 *   1. Resting  — lavender info card + example text + "Speak your event" CTA
 *   2. Typing   — detection chips (category / time / who)
 *   3. Voice    — waveform + Stop / Cancel
 *   4. Expanded — inline event form: WHAT / WHEN / WHO sections
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Animated, Easing, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import { detectLocalTask } from '@/features/tasks/lib/localTaskDetection';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { todayLocal } from '@/lib/dates';
import { Mic, Square, X, ChevronDown, ChevronUp, Calendar, Clock } from 'lucide-react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import FamilyAvatar from '@/components/FamilyAvatar';

const MIN_CHARS = 3;

// ── Date/time helpers (CLAUDE.md Rule 9 — 12h human format, no ISO display) ───

function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

function fmt12h(hhmm: string): string {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ── Voice waveform ─────────────────────────────────────────────────────────────

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
      {Array.from({ length: 20 }, (_, i) => (
        <WaveformBar key={i} delay={i} color={color} />
      ))}
    </View>
  );
}

// ── Event category chips ──────────────────────────────────────────────────────

const EVENT_CATEGORIES = [
  { label: 'Medical',  emoji: '🏥', value: 'Medical' },
  { label: 'School',   emoji: '🏫', value: 'Study' },
  { label: 'Sports',   emoji: '⚽', value: 'Sports' },
  { label: 'Birthday', emoji: '🎂', value: 'Birthday' },
  { label: 'Ride',     emoji: '🚗', value: 'Ride' },
  { label: 'Event',    emoji: '🎉', value: 'Event' },
  { label: 'Reminder', emoji: '🔔', value: 'Reminder' },
  { label: 'Work',     emoji: '💼', value: 'Work' },
  { label: 'Other',    emoji: '📅', value: 'Other' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function JustDescribeItEventScreen({
  visible,
  onClose,
  activeMemberId: propActiveMemberId,
}: {
  visible: boolean;
  onClose: () => void;
  activeMemberId?: string;
}) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId: storeMemberId } = useFamilyStore();
  const activeMemberId = propActiveMemberId ?? storeMemberId;
  const { addEvent } = useEventStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  // ── Composer state ─────────────────────────────────────────────────────
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [detection, setDetection] = useState<ReturnType<typeof detectLocalTask>>(null);

  // ── Inline event form state ────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evCategory, setEvCategory] = useState('Event');
  const [evDate, setEvDate] = useState(shiftDate(todayLocal(), 1));
  const [evTime, setEvTime] = useState('09:00');
  const [evEndTime, setEvEndTime] = useState('10:00');
  const [evAllDay, setEvAllDay] = useState(false);
  const [evMemberIds, setEvMemberIds] = useState<string[]>([]);
  const [evNotes, setEvNotes] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);
  const [showEndTimePick, setShowEndTimePick] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const dictation = useVoiceDictation();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const reset = () => {
    setInput('');
    setInputFocused(false);
    setDetection(null);
    setFormOpen(false);
    setEvTitle('');
    setEvCategory('Event');
    setEvDate(shiftDate(todayLocal(), 1));
    setEvTime('09:00');
    setEvEndTime('10:00');
    setEvAllDay(false);
    setEvMemberIds([]);
    setEvNotes('');
    setEvLocation('');
    setShowDatePick(false);
    setShowTimePick(false);
    setShowEndTimePick(false);
    setShowCatPicker(false);
    setSaving(false);
    setShowPreview(false);
    dictation.reset();
  };

  const handleClose = () => { reset(); onClose(); };

  // Live detection
  useEffect(() => {
    if (input.trim().length < MIN_CHARS) { setDetection(null); setFormOpen(false); return; }
    const d = detectLocalTask(input, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
    setDetection(d);
  }, [input, members]);

  const handleStopVoice = async () => {
    const t = await dictation.stop();
    if (t) setInput(t);
  };

  // Open the inline form pre-filled from detection
  const openInlineForm = () => {
    const cleanTitle = detection?.title ?? input.trim()
      .replace(/\s+(at|by|@)\s+\d{1,2}(:\d{2})?\s*(am|pm)?/gi, '')
      .replace(/\s+\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
      .replace(/\s+(today|tonight|tomorrow)/gi, '')
      .replace(/\s+(on|next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, '')
      .replace(/\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, '')
      .replace(/\s+(on|by)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?/gi, '')
      .replace(/\s{2,}/g, ' ').trim();

    setEvTitle(cleanTitle);
    if (detection?.when.date) setEvDate(detection.when.date);
    if (detection?.when.time) setEvTime(detection.when.time.slice(0, 5));
    if (detection?.category.kind === 'event' && detection.category.eventCategory) {
      setEvCategory(detection.category.eventCategory);
    }
    // Pre-assign detected member if mentioned
    if (detection?.memberNames.length) {
      const m = members.find(mb =>
        detection!.memberNames.some(n =>
          mb.name.split(' ')[0].toLowerCase() === n.toLowerCase() ||
          mb.name.toLowerCase() === n.toLowerCase()
        )
      );
      if (m) setEvMemberIds([m.id]);
    }
    setFormOpen(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  };

  const handleSave = async () => {
    if (!evTitle.trim() || saving) return;
    setSaving(true);
    try {
      await addEvent({
        title: evTitle.trim(),
        date: evDate,
        time: evAllDay ? undefined : evTime,
        endTime: evAllDay ? undefined : evEndTime,
        allDay: evAllDay || undefined,
        category: evCategory,
        type: 'event',
        memberIds: evMemberIds.length > 0 ? evMemberIds : undefined,
        memberId: evMemberIds[0],
        notes: evNotes.trim() || undefined,
        location: evLocation.trim() || undefined,
        familyId: activeMember?.familyId ?? '',
        createdBy: activeMemberId ?? '',
      } as Omit<FamilyEvent, 'id'>);
      handleClose();
    } catch {
      setSaving(false);
    }
  };

  const isListening = dictation.state === 'listening';
  const hasInput = input.trim().length >= MIN_CHARS;
  const detected = detection;
  const catLabel = detected?.category.kind === 'event'
    ? detected.category.eventCategory
    : detected?.category.kind === 'quest' ? null : null;
  const catEmoji = detected?.category.emoji ?? '';
  const detectedTime = detected?.when.time ? detected.when.time.slice(0, 5) : null;
  const detectedDate = detected?.when.date;
  const timeLabel = detectedDate && detectedTime
    ? `${detectedDate === todayLocal() ? 'Today' : fmtDate(detectedDate)} · ${fmt12h(detectedTime)}`
    : detectedDate ? (detectedDate === todayLocal() ? 'Today' : fmtDate(detectedDate))
    : detectedTime ? fmt12h(detectedTime) : null;
  const detectedMemberName = detected?.memberNames[0] ?? null;

  // Design tokens
  const canvasBg    = isDark ? '#0E0C13' : '#FFFFFF';
  const fieldBg     = isDark ? colors.surface : '#FFFFFF';
  const fieldBorder = isDark ? colors.border : '#DFE5EF';
  const accent      = colors.teal;   // CONNECT (Schedule = teal)
  const detCardBg   = isDark ? colors.surface : colors.tealLight;
  const chipActive  = colors.teal;
  const chipInact   = isDark ? colors.surface : colors.tealLight;

  if (!visible) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: canvasBg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
          }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 }}>
                New Event
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
                Describe what you're planning
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: isDark ? colors.surface : '#F0F0F0',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ── Text input ── */}
          {!isListening && (
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'flex-start',
                backgroundColor: fieldBg,
                borderRadius: 16, borderWidth: 1.5,
                borderColor: inputFocused ? accent : fieldBorder,
                paddingHorizontal: 16, paddingVertical: 14, gap: 10,
                shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.04,
                shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
              }}>
                <Text style={{ fontSize: 22, marginTop: 1 }}>📅</Text>
                <TextInput
                  ref={inputRef}
                  style={{ flex: 1, fontSize: 16, color: colors.textPrimary, lineHeight: 24, minHeight: 60 }}
                  placeholder={"\"Soccer practice Saturday 4pm\"\n\"Dentist for Mia next Thursday\""}
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  value={input}
                  onChangeText={setInput}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  returnKeyType="done"
                  blurOnSubmit
                />
                {input.length > 0 && (
                  <TouchableOpacity onPress={() => setInput('')} style={{ padding: 2, marginTop: 2 }}>
                    <X size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ── Voice waveform ── */}
          {isListening && (
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              <View style={{
                backgroundColor: detCardBg,
                borderRadius: 16, padding: 20, alignItems: 'center', gap: 12,
              }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: accent }}>
                  Listening…
                </Text>
                <Waveform color={accent} />
                <TouchableOpacity
                  onPress={handleStopVoice}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    backgroundColor: accent, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10,
                  }}
                >
                  <Square size={14} color="#fff" fill="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Stop</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Detection chips ── */}
          {hasInput && !isListening && (
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              <View style={{
                backgroundColor: detCardBg, borderRadius: 14, padding: 14,
                flexDirection: 'row', flexWrap: 'wrap', gap: 8,
              }}>
                {catLabel && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: isDark ? colors.teal + '30' : colors.tealLight,
                    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                  }}>
                    <Text style={{ fontSize: 13 }}>{catEmoji}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: accent }}>{catLabel}</Text>
                  </View>
                )}
                {timeLabel && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: isDark ? colors.amber + '30' : colors.amberLight,
                    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                  }}>
                    <Clock size={12} color={colors.amber} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.amber }}>{timeLabel}</Text>
                  </View>
                )}
                {detectedMemberName && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: isDark ? colors.primary + '30' : colors.primaryLight,
                    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                  }}>
                    <Text style={{ fontSize: 12 }}>👤</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{detectedMemberName}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ── Voice / Fill Form CTAs ── */}
          {!isListening && (
            <View style={{ paddingHorizontal: 20, flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {!hasInput && (
                <TouchableOpacity
                  onPress={() => dictation.start()}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, backgroundColor: accent, borderRadius: 14,
                    paddingVertical: 14,
                  }}
                >
                  <Mic size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Speak your event</Text>
                </TouchableOpacity>
              )}
              {hasInput && !formOpen && (
                <>
                  <TouchableOpacity
                    onPress={() => dictation.start()}
                    style={{
                      width: 48, height: 48, borderRadius: 14,
                      backgroundColor: isDark ? colors.surface : '#F0F0F0',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Mic size={20} color={accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={openInlineForm}
                    style={{
                      flex: 1, backgroundColor: accent, borderRadius: 14,
                      alignItems: 'center', justifyContent: 'center',
                      paddingVertical: 14,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                      Fill in details →
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* ── Resting info card ── */}
          {!hasInput && !isListening && (
            <View style={{ paddingHorizontal: 20, gap: 12 }}>
              <View style={{
                backgroundColor: detCardBg, borderRadius: 16, padding: 16, gap: 8,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: accent }}>
                  📅 How it works
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                  Describe your event naturally — day, time, and who's involved. We'll pull out the details for you.
                </Text>
                <View style={{ gap: 6, marginTop: 4 }}>
                  {[
                    '"Soccer practice Saturday 4pm for Jake"',
                    '"Dentist appointment next Thursday morning"',
                    '"Piano lesson for Mia every Wednesday 3pm"',
                  ].map((ex, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setInput(ex.replace(/"/g, ''))}
                      style={{
                        backgroundColor: isDark ? colors.card : '#FFFFFF',
                        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                        borderWidth: 1, borderColor: fieldBorder,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' }}>
                        {ex}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{
                backgroundColor: isDark ? colors.surface : colors.amberLight,
                borderRadius: 16, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start',
              }}>
                <Text style={{ fontSize: 20 }}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.amber }}>
                    Private until saved
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: 2 }}>
                    Your description stays on-device until you tap on-demand AI.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Inline Event Form ── */}
          {formOpen && (
            <View style={{ paddingHorizontal: 20, gap: 0 }}>

              {/* WHAT section */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: accent, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
                  WHAT
                </Text>

                {/* Title */}
                <View style={{
                  backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: fieldBorder, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
                }}>
                  <TextInput
                    style={{ fontSize: 16, color: colors.textPrimary, fontWeight: '500' }}
                    placeholder="Event title"
                    placeholderTextColor={colors.textTertiary}
                    value={evTitle}
                    onChangeText={setEvTitle}
                  />
                </View>

                {/* Category picker */}
                <TouchableOpacity
                  onPress={() => setShowCatPicker(v => !v)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5,
                    borderColor: fieldBorder, paddingHorizontal: 14, paddingVertical: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>
                      {EVENT_CATEGORIES.find(c => c.value === evCategory)?.emoji ?? '📅'}
                    </Text>
                    <Text style={{ fontSize: 15, color: colors.textPrimary }}>
                      {EVENT_CATEGORIES.find(c => c.value === evCategory)?.label ?? evCategory}
                    </Text>
                  </View>
                  {showCatPicker ? <ChevronUp size={16} color={colors.textSecondary} /> : <ChevronDown size={16} color={colors.textSecondary} />}
                </TouchableOpacity>
                {showCatPicker && (
                  <View style={{
                    backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5,
                    borderColor: fieldBorder, marginTop: 4, overflow: 'hidden',
                  }}>
                    {EVENT_CATEGORIES.map(c => (
                      <TouchableOpacity
                        key={c.value}
                        onPress={() => { setEvCategory(c.value); setShowCatPicker(false); }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingHorizontal: 14, paddingVertical: 12,
                          backgroundColor: evCategory === c.value
                            ? (isDark ? accent + '30' : colors.tealLight)
                            : 'transparent',
                          borderBottomWidth: 1, borderBottomColor: fieldBorder,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>{c.emoji}</Text>
                        <Text style={{ fontSize: 15, color: colors.textPrimary, fontWeight: evCategory === c.value ? '700' : '400' }}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Location */}
                <View style={{
                  backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: fieldBorder, paddingHorizontal: 14, paddingVertical: 12, marginTop: 10,
                }}>
                  <TextInput
                    style={{ fontSize: 15, color: colors.textPrimary }}
                    placeholder="Location (optional)"
                    placeholderTextColor={colors.textTertiary}
                    value={evLocation}
                    onChangeText={setEvLocation}
                  />
                </View>
              </View>

              {/* WHEN section */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.amber, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
                  WHEN
                </Text>

                {/* All-day toggle */}
                <TouchableOpacity
                  onPress={() => setEvAllDay(v => !v)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5,
                    borderColor: fieldBorder, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 15, color: colors.textPrimary }}>All-day</Text>
                  <View style={{
                    width: 44, height: 26, borderRadius: 13,
                    backgroundColor: evAllDay ? accent : (isDark ? colors.surface : '#DDE2EC'),
                    justifyContent: 'center', paddingHorizontal: 3,
                  }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF',
                      alignSelf: evAllDay ? 'flex-end' : 'flex-start',
                      shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2,
                    }} />
                  </View>
                </TouchableOpacity>

                {/* Date */}
                <TouchableOpacity
                  onPress={() => setShowDatePick(true)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5,
                    borderColor: fieldBorder, paddingHorizontal: 14, paddingVertical: 12,
                    marginBottom: evAllDay ? 0 : 10,
                  }}
                >
                  <Calendar size={16} color={accent} />
                  <Text style={{ fontSize: 15, color: evDate ? colors.textPrimary : colors.textTertiary }}>
                    {evDate ? fmtDate(evDate) : 'Pick date'}
                  </Text>
                </TouchableOpacity>
                {showDatePick && (
                  <AppDateTimePicker
                    visible={showDatePick}
                    mode="date"
                    value={new Date(evDate + 'T00:00:00')}
                    onConfirm={d => { setEvDate(d.toISOString().slice(0, 10)); setShowDatePick(false); }}
                    onCancel={() => setShowDatePick(false)}
                  />
                )}

                {/* Time */}
                {!evAllDay && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setShowTimePick(true)}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5,
                        borderColor: fieldBorder, paddingHorizontal: 14, paddingVertical: 12,
                      }}
                    >
                      <Clock size={16} color={accent} />
                      <Text style={{ fontSize: 15, color: colors.textPrimary }}>
                        {fmt12h(evTime)}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowEndTimePick(true)}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5,
                        borderColor: fieldBorder, paddingHorizontal: 14, paddingVertical: 12,
                      }}
                    >
                      <Clock size={16} color={colors.textSecondary} />
                      <Text style={{ fontSize: 15, color: colors.textPrimary }}>
                        {fmt12h(evEndTime)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {showTimePick && (
                  <AppDateTimePicker
                    visible={showTimePick}
                    mode="time"
                    value={(() => { const [h, m] = evTime.split(':'); const d = new Date(); d.setHours(+h, +m, 0, 0); return d; })()}
                    onConfirm={d => { setEvTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); setShowTimePick(false); }}
                    onCancel={() => setShowTimePick(false)}
                  />
                )}
                {showEndTimePick && (
                  <AppDateTimePicker
                    visible={showEndTimePick}
                    mode="time"
                    value={(() => { const [h, m] = evEndTime.split(':'); const d = new Date(); d.setHours(+h, +m, 0, 0); return d; })()}
                    onConfirm={d => { setEvEndTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); setShowEndTimePick(false); }}
                    onCancel={() => setShowEndTimePick(false)}
                  />
                )}
              </View>

              {/* WHO section */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.pink, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
                  WHO
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {members.map(m => {
                    const sel = evMemberIds.includes(m.id);
                    const roleColor = m.role === 'kid' ? colors.kid : m.role === 'parent' ? colors.parent : colors.textSecondary;
                    const roleBg = m.role === 'kid' ? colors.amberLight : m.role === 'parent' ? colors.tealLight : colors.surface;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        onPress={() => setEvMemberIds(prev =>
                          prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                        )}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                          backgroundColor: sel ? (isDark ? roleColor + '40' : roleBg) : (isDark ? colors.surface : '#F5F5F5'),
                          borderRadius: 24, paddingHorizontal: 12, paddingVertical: 8,
                          borderWidth: 2, borderColor: sel ? roleColor : 'transparent',
                        }}
                      >
                        <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={28} siblings={members.filter(s => s.id !== m.id).map(s => s.name)} />
                        <Text style={{ fontSize: 14, fontWeight: sel ? '700' : '400', color: sel ? roleColor : colors.textSecondary }}>
                          {m.name.split(' ')[0]}
                        </Text>
                        {sel && <Text style={{ fontSize: 12, color: roleColor }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* NOTES */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
                  NOTES
                </Text>
                <View style={{
                  backgroundColor: fieldBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: fieldBorder, paddingHorizontal: 14, paddingVertical: 12,
                }}>
                  <TextInput
                    style={{ fontSize: 15, color: colors.textPrimary, minHeight: 64 }}
                    placeholder="Any extra details…"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    value={evNotes}
                    onChangeText={setEvNotes}
                  />
                </View>
              </View>

              {/* Preview toggle */}
              {evTitle.trim().length > 0 && (
                <TouchableOpacity
                  onPress={() => setShowPreview(v => !v)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    paddingVertical: 10, marginBottom: showPreview ? 0 : 16,
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                    {showPreview ? 'Hide preview' : 'Preview event card'}
                  </Text>
                  {showPreview ? <ChevronUp size={14} color={colors.textSecondary} /> : <ChevronDown size={14} color={colors.textSecondary} />}
                </TouchableOpacity>
              )}

              {/* Preview card */}
              {showPreview && evTitle.trim().length > 0 && (
                <View style={{
                  backgroundColor: isDark ? colors.card : '#FFFFFF',
                  borderRadius: 16, padding: 16, marginBottom: 16,
                  borderWidth: 1.5, borderColor: accent + '40',
                  shadowColor: accent, shadowOpacity: 0.08,
                  shadowOffset: { width: 0, height: 3 }, shadowRadius: 8,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 20 }}>
                      {EVENT_CATEGORIES.find(c => c.value === evCategory)?.emoji ?? '📅'}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>
                      {evTitle.trim()}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                      {fmtDate(evDate)}
                      {!evAllDay && evTime ? ` · ${fmt12h(evTime)}` : ''}
                      {!evAllDay && evEndTime ? ` – ${fmt12h(evEndTime)}` : ''}
                    </Text>
                  </View>
                  {evMemberIds.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                      {evMemberIds.map(id => {
                        const m = members.find(mb => mb.id === id);
                        return m ? (
                          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={20} />
                            <Text style={{ fontSize: 12, color: colors.textSecondary }}>{m.name.split(' ')[0]}</Text>
                          </View>
                        ) : null;
                      })}
                    </View>
                  )}
                  {evLocation ? (
                    <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>📍 {evLocation}</Text>
                  ) : null}
                </View>
              )}

              {/* Save button */}
              <TouchableOpacity
                onPress={handleSave}
                disabled={!evTitle.trim() || saving}
                style={{
                  backgroundColor: evTitle.trim() ? accent : (isDark ? colors.surface : '#DDE2EC'),
                  borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 8,
                }}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{
                      fontSize: 16, fontWeight: '700',
                      color: evTitle.trim() ? '#FFFFFF' : colors.textTertiary,
                    }}>
                      Add to Schedule
                    </Text>
                }
              </TouchableOpacity>

            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
