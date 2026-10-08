/**
 * JustDescribeItEventScreen — full-page natural-language event composer
 * for the Schedule tab's + button.
 *
 * Mirrors JustDescribeItScreen (chores) exactly in rhythm:
 *   nav row ‹ Schedule · MEMBER
 *   34px title + subtitle
 *   composer card (same card style, mic inline)
 *   voice card
 *   detection chips card (colors.surface, dark pill for cat, card pills for time/who)
 *   resting state (tealLight "one sentence" card → outlined CTA → tealLight privacy card)
 *   CTA → "Set up event →"
 *   inline form: pastel section cards (WHAT/tealLight · WHEN/amberLight · WHO/pinkLight)
 *   preview card + save button + ‹ Back
 *   date pickers rendered outside ScrollView
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Animated, Easing, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import { detectLocalTask } from '@/features/tasks/lib/localTaskDetection';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { todayLocal } from '@/lib/dates';
import FamilyAvatar from '@/components/FamilyAvatar';
import { Mic, Square } from 'lucide-react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { supabase } from '@/lib/supabase';

const MIN_CHARS = 3;

// ── Helpers (CLAUDE.md Rule 9 — 12h human format, no ISO display) ─────────────

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

// ── Voice waveform (identical to chore screen) ────────────────────────────────

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
      {Array.from({ length: 20 }, (_, i) => <WaveformBar key={i} delay={i} color={color} />)}
    </View>
  );
}

// ── Event categories ──────────────────────────────────────────────────────────

const EVENT_CATEGORIES = [
  { label: 'Event',    emoji: '🎉', value: 'Event' },
  { label: 'Medical',  emoji: '🏥', value: 'Medical' },
  { label: 'School',   emoji: '🏫', value: 'Study' },
  { label: 'Sports',   emoji: '⚽', value: 'Sports' },
  { label: 'Birthday', emoji: '🎂', value: 'Birthday' },
  { label: 'Ride',     emoji: '🚗', value: 'Ride' },
  { label: 'Work',     emoji: '💼', value: 'Work' },
  { label: 'Reminder', emoji: '🔔', value: 'Reminder' },
  { label: 'Other',    emoji: '📅', value: 'Other' },
];

const RECUR_OPTIONS: Array<{ label: string; value: 'once'|'daily'|'weekly'|'monthly' }> = [
  { label: 'Once',    value: 'once' },
  { label: 'Daily',   value: 'daily' },
  { label: 'Weekly',  value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
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
  const insets = useSafeAreaInsets();
  const { members, activeMemberId: storeMemberId } = useFamilyStore();
  const activeMemberId = propActiveMemberId ?? storeMemberId;
  const { addEvent } = useEventStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  // ── Composer state ─────────────────────────────────────────────────────
  const [input, setInput]             = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [detection, setDetection]     = useState<ReturnType<typeof detectLocalTask>>(null);

  // ── Inline event form state ────────────────────────────────────────────
  const [formOpen, setFormOpen]         = useState(false);
  const [activeStep, setActiveStep]     = useState<0|1|2>(0); // 0=WHAT 1=WHEN 2=WHO
  const [evTitle, setEvTitle]           = useState('');
  const [evCategory, setEvCategory]     = useState('Event');
  const [evDate, setEvDate]             = useState(shiftDate(todayLocal(), 1));
  const [evTime, setEvTime]             = useState('09:00');
  const [evEndTime, setEvEndTime]       = useState('10:00');
  const [evAllDay, setEvAllDay]         = useState(false);
  const [evRecurrence, setEvRecurrence] = useState<'once'|'daily'|'weekly'|'monthly'>('once');
  const [evRecurDays, setEvRecurDays]   = useState<number[]>([]);
  const [evEndDate, setEvEndDate]       = useState('');
  const [evMemberIds, setEvMemberIds]   = useState<string[]>([]);
  const [evNotes, setEvNotes]           = useState('');
  const [evLocation, setEvLocation]     = useState('');
  const [evRideNeeded, setEvRideNeeded] = useState(false);
  const [evPickupFrom, setEvPickupFrom] = useState('');
  const [evDropTo, setEvDropTo]         = useState('');
  const [evDriverId, setEvDriverId]     = useState<string | undefined>();
  const [evIsPrivate, setEvIsPrivate]   = useState(false);
  const [showDatePick, setShowDatePick]     = useState(false);
  const [showTimePick, setShowTimePick]     = useState(false);
  const [showEndTimePick, setShowEndTimePick] = useState(false);
  const [showEndDatePick, setShowEndDatePick] = useState(false);
  const [saving, setSaving]             = useState(false);

  // ── Conflict detection state ───────────────────────────────────────────
  // Map of memberId → conflict description (null = no conflict, undefined = not checked yet)
  const [memberConflicts, setMemberConflicts] = useState<Record<string, string | null>>({});
  const [checkingConflicts, setCheckingConflicts] = useState<Record<string, boolean>>({});

  // ── Listening timer ───────────────────────────────────────────────────
  const [listenSecs, setListenSecs] = useState(0);
  const listenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dictation = useVoiceDictation();
  const inputRef  = useRef<TextInput>(null);
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
    setEvRecurrence('once');
    setEvRecurDays([]);
    setEvEndDate('');
    setEvMemberIds([]);
    setEvNotes('');
    setEvLocation('');
    setShowDatePick(false);
    setShowTimePick(false);
    setShowEndTimePick(false);
    setShowEndDatePick(false);
    setSaving(false);
    setEvRideNeeded(false);
    setEvPickupFrom('');
    setEvDropTo('');
    setEvDriverId(undefined);
    setEvIsPrivate(false);
    setMemberConflicts({});
    setCheckingConflicts({});
    setListenSecs(0);
    dictation.reset();
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Listening timer ───────────────────────────────────────────────────
  const isListeningRef = useRef(false);
  useEffect(() => {
    const listening = dictation.state === 'listening';
    if (listening && !isListeningRef.current) {
      isListeningRef.current = true;
      setListenSecs(0);
      listenTimerRef.current = setInterval(() => setListenSecs(s => s + 1), 1000);
    } else if (!listening && isListeningRef.current) {
      isListeningRef.current = false;
      if (listenTimerRef.current) { clearInterval(listenTimerRef.current); listenTimerRef.current = null; }
    }
    return () => { if (listenTimerRef.current) clearInterval(listenTimerRef.current); };
  }, [dictation.state]);

  // ── Conflict detection ────────────────────────────────────────────────
  const checkMemberConflict = useCallback(async (memberId: string, date: string, startHhmm: string, endHhmm: string) => {
    setCheckingConflicts(prev => ({ ...prev, [memberId]: true }));
    try {
      const member = members.find(m => m.id === memberId);
      if (!member?.familyId) { setCheckingConflicts(prev => ({ ...prev, [memberId]: false })); return; }

      const { data } = await supabase
        .from('calendar_events')
        .select('title, time, end_time')
        .eq('family_id', member.familyId)
        .eq('date', date)
        .or(`member_id.eq.${memberId},member_ids.cs.{${memberId}}`);

      if (!data?.length) {
        setMemberConflicts(prev => ({ ...prev, [memberId]: null }));
        return;
      }

      const toMins = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + (m || 0);
      };
      const newStart = toMins(startHhmm);
      const newEnd   = toMins(endHhmm);

      let conflict: string | null = null;
      for (const ev of data) {
        if (!ev.time) continue;
        const evStart = toMins(ev.time);
        const evEnd   = ev.end_time ? toMins(ev.end_time) : evStart + 60;
        if (newStart < evEnd && newEnd > evStart) {
          conflict = `Conflicts with "${ev.title}" at ${fmt12h(ev.time)}`;
          break;
        }
      }
      setMemberConflicts(prev => ({ ...prev, [memberId]: conflict }));
    } catch {
      setMemberConflicts(prev => ({ ...prev, [memberId]: null }));
    } finally {
      setCheckingConflicts(prev => ({ ...prev, [memberId]: false }));
    }
  }, [members]);

  // Re-check all selected members when date or time changes
  useEffect(() => {
    if (!formOpen || evAllDay || evMemberIds.length === 0) return;
    evMemberIds.forEach(id => checkMemberConflict(id, evDate, evTime, evEndTime));
  }, [evDate, evTime, evEndTime, evAllDay, formOpen]);

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

  // Open inline form pre-filled from detection
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
    if (detection?.recurrence && detection.recurrence !== 'once') {
      setEvRecurrence(detection.recurrence as any);
    }
    if (detection?.recurrenceDays?.length) {
      setEvRecurDays(detection.recurrenceDays);
    }
    // Pre-assign detected member
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
    setActiveStep(0);
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
        rideRequired: evRideNeeded || undefined,
        pickupLocation: evRideNeeded && evPickupFrom.trim() ? evPickupFrom.trim() : undefined,
        dropLocation: evRideNeeded && evDropTo.trim() ? evDropTo.trim() : undefined,
        driverId: evDriverId,
        driverName: evDriverId ? members.find(m => m.id === evDriverId)?.name : undefined,
        driverStatus: evDriverId ? 'pending' : undefined,
        familyId: activeMember?.familyId ?? '',
        createdBy: activeMemberId ?? '',
      } as Omit<FamilyEvent, 'id'>);
      handleClose();
    } catch {
      setSaving(false);
    }
  };

  const isListening = dictation.state === 'listening';
  const fmtListenTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  const hasInput     = input.trim().length >= MIN_CHARS;
  const detected     = detection;
  const catLabel     = detected?.category.kind === 'event' ? detected.category.eventCategory : null;
  const catEmoji     = detected?.category.emoji ?? '';
  const detectedTime = detected?.when.time ? detected.when.time.slice(0, 5) : null;
  const detectedDate = detected?.when.date;
  const timeLabel    = detectedDate && detectedTime
    ? `${detectedDate === todayLocal() ? 'Today' : fmtDate(detectedDate)} · ${fmt12h(detectedTime)}`
    : detectedDate ? (detectedDate === todayLocal() ? 'Today' : fmtDate(detectedDate))
    : detectedTime ? fmt12h(detectedTime) : null;
  const detectedMemberName = detected?.memberNames[0] ?? null;

  // Design tokens — exact same pattern as JustDescribeItScreen
  const canvasBg    = isDark ? '#0E0C13' : '#FFFFFF';
  const fieldBorder = isDark ? colors.border : '#DFE5EF';
  const activeBlue  = colors.teal;   // Schedule accent = sage/teal (CONNECT)

  const catEntry = EVENT_CATEGORIES.find(c => c.value === evCategory);

  // Driver-eligible: parents + seniors + teens with hasCar, excluding event participants
  const driverCandidates = members.filter(m =>
    (m.role === 'parent' || m.role === 'senior' || (m.role === 'teen' && (m as any).hasCar))
  );

  if (!visible) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: canvasBg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 20 }}>

            {/* ── Nav row: ‹ Schedule · · · MEMBER ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity onPress={handleClose} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 17, color: activeBlue }}>‹</Text>
                <Text style={{ fontSize: 15, fontWeight: '500', color: activeBlue }}>Schedule</Text>
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

              {/* ── Natural-language composer — bare input on canvas ── */}
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                  {isListening ? 'Editable transcript · listening' : 'What\'s coming up?'}
                </Text>
                <TextInput
                  ref={inputRef}
                  value={isListening ? dictation.liveTranscript : input}
                  onChangeText={setInput}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  editable={!isListening}
                  placeholder="Something on the calendar?"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  style={{ fontSize: 22, fontWeight: '500', lineHeight: 30, color: colors.textPrimary, minHeight: 40 }}
                />
                <View style={{ height: inputFocused || isListening ? 2 : 1, backgroundColor: inputFocused || isListening ? activeBlue : colors.border, borderRadius: 1 }} />
                {/* Tools row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                    {isListening ? `Listening · ${fmtListenTime(listenSecs)}` : hasInput ? 'Unsaved · only a draft' : 'Nothing created yet'}
                  </Text>
                  <TouchableOpacity
                    onPress={isListening ? handleStopVoice : () => dictation.start()}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {isListening
                      ? <Square size={16} color={activeBlue} strokeWidth={1.8} fill={activeBlue} />
                      : <Mic size={16} color={colors.textSecondary} strokeWidth={1.8} />}
                  </TouchableOpacity>
                </View>
              </View>  {/* end composer gap View */}

              {/* ── Voice dictation card ── */}
              {isListening && (
                <View style={{ backgroundColor: colors.tealLight, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 }}>
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
                    Audio stays private until you tap on-demand AI.
                  </Text>
                </View>
              )}

              {/* ── Detection chips card ── */}
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
                    {detectedMemberName && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                        borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 13 }}>👤</Text>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary }}>{detectedMemberName}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>Detected · adjust in the form below</Text>
                </View>
              )}

              {/* ── Resting empty state ── */}
              {!isListening && !hasInput && (
                <>
                  <View style={{ backgroundColor: colors.tealLight, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 8 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, lineHeight: 24 }}>One sentence is enough</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.teal, lineHeight: 20 }}>
                      "Soccer practice Saturday 4pm" or "Dentist for Mia next Thursday"
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: 2 }}>
                      We'll detect the category, date, time and who's involved. You confirm before anything is saved.
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => dictation.start()}
                    style={{ height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1.5, borderColor: activeBlue, backgroundColor: colors.card }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: activeBlue }}>Speak your event</Text>
                  </TouchableOpacity>

                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, textAlign: 'center', paddingHorizontal: 8 }}>
                    Your own wording comes first. Type or voice — there's no extra create menu.
                  </Text>
                  <View style={{ backgroundColor: colors.tealLight, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.teal }}>Your privacy</Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>
                      Detection runs entirely on your device. Nothing is sent anywhere until you tap on-demand AI.
                    </Text>
                  </View>
                </>
              )}

              {/* ── CTA: open inline form ── */}
              {!isListening && hasInput && detected && !formOpen && (
                <TouchableOpacity
                  onPress={openInlineForm}
                  style={{ height: 52, borderRadius: 16, backgroundColor: activeBlue, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Set up event →</Text>
                </TouchableOpacity>
              )}

              {/* No detection fallback */}
              {!isListening && hasInput && !detected && !formOpen && (
                <TouchableOpacity
                  onPress={openInlineForm}
                  style={{ height: 52, borderRadius: 16, backgroundColor: activeBlue, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Fill in details →</Text>
                </TouchableOpacity>
              )}

              {/* ══════════════════════════════════════════════════════
                  ── Inline event form — accordion stepper ──
                  ══════════════════════════════════════════════════════ */}
              {formOpen && (() => {
                // Summary helpers for collapsed headers
                const whatSummary = evTitle.trim()
                  ? `${catEntry?.emoji ?? '📅'} ${evTitle.trim()}${evLocation.trim() ? `  ·  📍 ${evLocation.trim()}` : ''}`
                  : null;
                const whenSummary = evAllDay
                  ? `📅 ${fmtDate(evDate)}  ·  All day`
                  : `📅 ${fmtDate(evDate)}  ·  ${fmt12h(evTime)} – ${fmt12h(evEndTime)}`;
                const whoSummary = evMemberIds.length > 0
                  ? evMemberIds.map(id => members.find(m => m.id === id)?.name.split(' ')[0] ?? '').filter(Boolean).join(', ')
                  : null;

                const stepAccent = [colors.teal, colors.amber, colors.pink];

                const StepHeader = ({ idx, label, summary, emoji }: { idx: 0|1|2; label: string; summary: string|null; emoji: string }) => {
                  const isActive = activeStep === idx;
                  const isDone = !isActive && summary != null;
                  const accent = stepAccent[idx];
                  return (
                    <TouchableOpacity
                      onPress={() => setActiveStep(idx)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                      activeOpacity={0.7}
                    >
                      {/* Step dot */}
                      <View style={{ width: 28, height: 28, borderRadius: 14,
                        backgroundColor: isActive ? accent : isDone ? accent : colors.surface,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: isActive || isDone ? 0 : 1.5, borderColor: colors.border }}>
                        {isDone
                          ? <Text style={{ fontSize: 14, color: '#FFFFFF' }}>✓</Text>
                          : <Text style={{ fontSize: 13, fontWeight: '700', color: isActive ? '#FFFFFF' : colors.textTertiary }}>{idx + 1}</Text>
                        }
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '500',
                          color: isActive ? accent : isDone ? colors.textPrimary : colors.textSecondary }}>
                          {label}
                        </Text>
                        {!isActive && summary && (
                          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }} numberOfLines={1}>{summary}</Text>
                        )}
                      </View>
                      {!isActive && (
                        <Text style={{ fontSize: 15, color: colors.textTertiary }}>{isActive ? '∧' : '›'}</Text>
                      )}
                    </TouchableOpacity>
                  );
                };

                const Divider = () => (
                  <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
                );

                return (
                  <View style={{ borderRadius: 24, backgroundColor: colors.card,
                    borderWidth: 1, borderColor: colors.border,
                    shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2,
                    overflow: 'hidden' }}>

                    {/* ── WHAT step ── */}
                    <View style={{ padding: 20, gap: activeStep === 0 ? 16 : 0 }}>
                      <StepHeader idx={0} label="What's the event?" summary={whatSummary} emoji="📅" />
                      {activeStep === 0 && (
                        <View style={{ gap: 12 }}>
                          <TextInput
                            value={evTitle}
                            onChangeText={setEvTitle}
                            placeholder="Event title"
                            placeholderTextColor={colors.textTertiary}
                            style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, fontWeight: '500', color: colors.textPrimary }}
                          />
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {EVENT_CATEGORIES.map(c => (
                              <TouchableOpacity
                                key={c.value}
                                onPress={() => setEvCategory(c.value)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14,
                                  backgroundColor: evCategory === c.value ? colors.teal : colors.surface,
                                  borderWidth: 1, borderColor: evCategory === c.value ? colors.teal : colors.border }}
                              >
                                <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: evCategory === c.value ? '#FFFFFF' : colors.textPrimary }}>{c.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <TextInput
                            value={evLocation}
                            onChangeText={setEvLocation}
                            placeholder="📍 Location (optional)"
                            placeholderTextColor={colors.textTertiary}
                            style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14, color: colors.textPrimary }}
                          />
                          <TouchableOpacity
                            onPress={() => setActiveStep(1)}
                            disabled={!evTitle.trim()}
                            style={{ height: 48, borderRadius: 14, backgroundColor: evTitle.trim() ? colors.teal : colors.surface,
                              alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ fontSize: 15, fontWeight: '600', color: evTitle.trim() ? '#FFFFFF' : colors.textTertiary }}>
                              Next: When? →
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    <Divider />

                    {/* ── WHEN step ── */}
                    <View style={{ padding: 20, gap: activeStep === 1 ? 14 : 0 }}>
                      <StepHeader idx={1} label="When is it?" summary={whenSummary} emoji="🗓️" />
                      {activeStep === 1 && (
                        <View style={{ gap: 10 }}>
                          {/* All-day toggle */}
                          <TouchableOpacity
                            onPress={() => setEvAllDay(v => !v)}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                              paddingVertical: 4 }}
                          >
                            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>All day</Text>
                            <View style={{ width: 36, height: 22, borderRadius: 11,
                              backgroundColor: evAllDay ? colors.amber : colors.surface,
                              alignItems: evAllDay ? 'flex-end' : 'flex-start',
                              paddingHorizontal: 2, justifyContent: 'center' }}>
                              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: evAllDay ? '#FFFFFF' : colors.border }} />
                            </View>
                          </TouchableOpacity>
                          {/* Date + time */}
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => setShowDatePick(true)}
                              style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                            >
                              <Text style={{ fontSize: 15 }}>📅</Text>
                              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>{fmtDate(evDate)}</Text>
                            </TouchableOpacity>
                            {!evAllDay && (
                              <TouchableOpacity
                                onPress={() => setShowTimePick(true)}
                                style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                              >
                                <Text style={{ fontSize: 15 }}>🕐</Text>
                                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>{fmt12h(evTime)}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          {!evAllDay && (
                            <TouchableOpacity
                              onPress={() => setShowEndTimePick(true)}
                              style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                            >
                              <Text style={{ fontSize: 15 }}>🏁</Text>
                              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>Ends {fmt12h(evEndTime)}</Text>
                            </TouchableOpacity>
                          )}
                          {/* Repeat */}
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {RECUR_OPTIONS.map(opt => (
                              <TouchableOpacity
                                key={opt.value}
                                onPress={() => setEvRecurrence(opt.value)}
                                style={{ flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center',
                                  backgroundColor: evRecurrence === opt.value ? colors.amber : colors.surface,
                                  borderWidth: 1, borderColor: evRecurrence === opt.value ? colors.amber : colors.border }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '600', color: evRecurrence === opt.value ? '#FFFFFF' : colors.textPrimary }}>{opt.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          {evRecurrence === 'weekly' && (
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              {['S','M','T','W','T','F','S'].map((lbl, idx) => {
                                const sel = evRecurDays.includes(idx);
                                return (
                                  <TouchableOpacity
                                    key={idx}
                                    onPress={() => setEvRecurDays(prev => sel ? prev.filter(d => d !== idx) : [...prev, idx])}
                                    style={{ flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                                      backgroundColor: sel ? colors.amber : colors.surface,
                                      borderWidth: 1, borderColor: sel ? colors.amber : colors.border }}
                                  >
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? '#FFFFFF' : colors.textPrimary }}>{lbl}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                          {evRecurrence !== 'once' && (
                            <TouchableOpacity
                              onPress={() => setShowEndDatePick(true)}
                              style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                            >
                              <Text style={{ fontSize: 15 }}>🏁</Text>
                              <Text style={{ fontSize: 14, color: evEndDate ? colors.textPrimary : colors.textTertiary }}>
                                {evEndDate ? fmtDate(evEndDate) : 'No end date'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => setActiveStep(2)}
                            style={{ height: 48, borderRadius: 14, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Next: Who? →</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    <Divider />

                    {/* ── WHO step ── */}
                    <View style={{ padding: 20, gap: activeStep === 2 ? 16 : 0 }}>
                      <StepHeader idx={2} label="Who's involved?" summary={whoSummary} emoji="👥" />
                      {activeStep === 2 && (
                        <View style={{ gap: 14 }}>
                          {/* Participant emoji chips */}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            {members.map(m => {
                              const sel = evMemberIds.includes(m.id);
                              const isAdult = m.role === 'parent' || m.role === 'senior';
                              const accentColor = isAdult ? colors.teal : colors.amber;
                              const conflict = memberConflicts[m.id];
                              const checking = checkingConflicts[m.id];
                              const hasConflict = sel && conflict != null;
                              return (
                                <TouchableOpacity
                                  key={m.id}
                                  onPress={() => {
                                    const next = sel ? evMemberIds.filter(id => id !== m.id) : [...evMemberIds, m.id];
                                    setEvMemberIds(next);
                                    if (!sel && !evAllDay) checkMemberConflict(m.id, evDate, evTime, evEndTime);
                                  }}
                                  style={{ alignItems: 'center', gap: 5, minWidth: 56 }}
                                >
                                  <View style={{
                                    width: 52, height: 52, borderRadius: 26,
                                    borderWidth: sel ? 2.5 : 1.5,
                                    borderColor: hasConflict ? colors.danger : sel ? accentColor : colors.border,
                                    overflow: 'hidden', opacity: sel ? 1 : 0.5,
                                  }}>
                                    {checking
                                      ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                                          <ActivityIndicator size="small" color={accentColor} />
                                        </View>
                                      : <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={52} />
                                    }
                                  </View>
                                  <Text style={{ fontSize: 11, fontWeight: sel ? '700' : '400',
                                    color: hasConflict ? colors.danger : sel ? accentColor : colors.textSecondary, textAlign: 'center' }}>
                                    {m.name.split(' ')[0]}
                                  </Text>
                                  {hasConflict && <Text style={{ fontSize: 10, color: colors.danger, textAlign: 'center', marginTop: -2 }}>⚠️</Text>}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          {/* Conflict banners */}
                          {evMemberIds.some(id => memberConflicts[id]) && (
                            <View style={{ gap: 6 }}>
                              {evMemberIds.filter(id => memberConflicts[id]).map(id => {
                                const m = members.find(mb => mb.id === id);
                                return m ? (
                                  <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                                    backgroundColor: isDark ? colors.danger + '18' : '#FFF0EE',
                                    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
                                    borderLeftWidth: 3, borderLeftColor: colors.danger }}>
                                    <Text style={{ fontSize: 12, color: colors.danger, flex: 1 }}>
                                      <Text style={{ fontWeight: '700' }}>⚠️ {m.name.split(' ')[0]}</Text>
                                      {' · '}{memberConflicts[id]}
                                    </Text>
                                  </View>
                                ) : null;
                              })}
                            </View>
                          )}
                          {/* Ride toggle */}
                          {evCategory !== 'Ride' && (
                            <View style={{ gap: 10 }}>
                              <TouchableOpacity
                                onPress={() => setEvRideNeeded(v => !v)}
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ fontSize: 16 }}>🚗</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>Ride needed?</Text>
                                </View>
                                <View style={{ width: 36, height: 22, borderRadius: 11,
                                  backgroundColor: evRideNeeded ? colors.amber : colors.surface,
                                  alignItems: evRideNeeded ? 'flex-end' : 'flex-start',
                                  paddingHorizontal: 2, justifyContent: 'center' }}>
                                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: evRideNeeded ? '#FFFFFF' : colors.border }} />
                                </View>
                              </TouchableOpacity>
                              {evRideNeeded && (
                                <View style={{ gap: 10 }}>
                                  <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TextInput
                                      value={evPickupFrom}
                                      onChangeText={setEvPickupFrom}
                                      placeholder="From"
                                      placeholderTextColor={colors.textTertiary}
                                      style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.textPrimary }}
                                    />
                                    <TextInput
                                      value={evDropTo}
                                      onChangeText={setEvDropTo}
                                      placeholder="To"
                                      placeholderTextColor={colors.textTertiary}
                                      style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.textPrimary }}
                                    />
                                  </View>
                                  <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '500' }}>Who's driving?</Text>
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                    {driverCandidates.map(m => {
                                      const sel = evDriverId === m.id;
                                      const conflict = memberConflicts[m.id];
                                      const checking = checkingConflicts[m.id];
                                      const hasConflict = sel && conflict != null;
                                      return (
                                        <TouchableOpacity
                                          key={m.id}
                                          onPress={() => {
                                            setEvDriverId(sel ? undefined : m.id);
                                            if (!sel && !evAllDay) checkMemberConflict(m.id, evDate, evTime, evEndTime);
                                          }}
                                          style={{ alignItems: 'center', gap: 5, minWidth: 52 }}
                                        >
                                          <View style={{ width: 48, height: 48, borderRadius: 24,
                                            borderWidth: sel ? 2.5 : 1.5,
                                            borderColor: hasConflict ? colors.danger : sel ? colors.amber : colors.border,
                                            overflow: 'hidden', opacity: sel ? 1 : 0.5 }}>
                                            {checking
                                              ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                                                  <ActivityIndicator size="small" color={colors.amber} />
                                                </View>
                                              : <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={48} />
                                            }
                                          </View>
                                          <Text style={{ fontSize: 11, fontWeight: sel ? '700' : '400',
                                            color: hasConflict ? colors.danger : sel ? colors.amber : colors.textSecondary, textAlign: 'center' }}>
                                            {m.name.split(' ')[0]}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                </View>
                              )}
                            </View>
                          )}
                          {/* Private toggle */}
                          <TouchableOpacity
                            onPress={() => setEvIsPrivate(v => !v)}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 16 }}>{evIsPrivate ? '🔒' : '👁️'}</Text>
                              <View>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
                                  {evIsPrivate ? 'Private' : 'Visible to family'}
                                </Text>
                                <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                                  {evIsPrivate ? 'Only participants will see this' : 'All family members can see this'}
                                </Text>
                              </View>
                            </View>
                            <View style={{ width: 36, height: 22, borderRadius: 11,
                              backgroundColor: evIsPrivate ? colors.pink : colors.surface,
                              alignItems: evIsPrivate ? 'flex-end' : 'flex-start',
                              paddingHorizontal: 2, justifyContent: 'center' }}>
                              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: evIsPrivate ? '#FFFFFF' : colors.border }} />
                            </View>
                          </TouchableOpacity>
                          {/* Notes */}
                          <TextInput
                            value={evNotes}
                            onChangeText={setEvNotes}
                            placeholder="Notes (optional)"
                            placeholderTextColor={colors.textTertiary}
                            multiline
                            style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.textPrimary, minHeight: 60 }}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })()}

                  {/* ── NOTES — surface card ── */}
                  <View style={{ borderRadius: 24, padding: 20, gap: 14,
                    backgroundColor: colors.surface,
                    borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ gap: 6 }}>
                      <View style={{ height: 2, width: 28, borderRadius: 1, backgroundColor: colors.textTertiary, opacity: 0.5 }} />
                      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>NOTES</Text>
                    </View>
                    <TextInput
                      value={evNotes}
                      onChangeText={setEvNotes}
                      placeholder="Any extra details…"
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: colors.textPrimary, minHeight: 80, textAlignVertical: 'top' }}
                    />
                  </View>

                  {/* ── PREVIEW CARD ── */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' }}>Card preview</Text>
                    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: fieldBorder,
                      paddingHorizontal: 16, paddingVertical: 14, gap: 8,
                      shadowColor: '#000', shadowOpacity: isDark ? 0.25 : 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: evTitle.trim() ? colors.textPrimary : colors.textTertiary }} numberOfLines={1}>
                            {evTitle.trim() || 'Event title…'}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                            {catEntry ? `${catEntry.emoji} ${catEntry.label}` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <View style={{ flexDirection: 'row' }}>
                            {evMemberIds.slice(0, 3).map((id, i) => {
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
                            })}
                            {evMemberIds.length === 0 && (
                              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 12, color: colors.textTertiary }}>?</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Chips row */}
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary }}>
                            📅 {fmtDate(evDate)}{!evAllDay && evTime ? ` · ${fmt12h(evTime)}` : ''}
                          </Text>
                        </View>
                        {evRecurrence !== 'once' && (
                          <View style={{ backgroundColor: colors.amberLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.amber }}>
                              🔁 {evRecurrence === 'weekly' && evRecurDays.length > 0
                                ? `Weekly · ${evRecurDays.map(d => ['S','M','T','W','T','F','S'][d]).join('/')}`
                                : evRecurrence.charAt(0).toUpperCase() + evRecurrence.slice(1)}
                            </Text>
                          </View>
                        )}
                        {evLocation ? (
                          <View style={{ backgroundColor: colors.tealLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>📍 {evLocation}</Text>
                          </View>
                        ) : null}
                      </View>

                      {evNotes.trim() ? (
                        <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }} numberOfLines={2}>{evNotes}</Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Conflict summary above save */}
                  {evMemberIds.some(id => memberConflicts[id]) && (
                    <View style={{ backgroundColor: isDark ? colors.danger + '22' : '#FEF2F2',
                      borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.danger + '40' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger, marginBottom: 4 }}>
                        ⚠️ Schedule conflicts detected
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>
                        You can still save — conflicts are flagged but not blocked. Consider adjusting the time or who's involved.
                      </Text>
                    </View>
                  )}

                  {/* Save button */}
                  <TouchableOpacity
                    onPress={handleSave}
                    disabled={!evTitle.trim() || saving}
                    style={{ height: 52, borderRadius: 14,
                      backgroundColor: evTitle.trim() ? activeBlue : (isDark ? colors.surface : '#E6EAF1'),
                      alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
                  >
                    {saving
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={{ fontSize: 15, fontWeight: '700', color: evTitle.trim() ? '#FFFFFF' : colors.textTertiary }}>Add to schedule</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setFormOpen(false)} style={{ alignItems: 'center', paddingVertical: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>‹ Back · edit description</Text>
                  </TouchableOpacity>

            </View>
          </View>
        </ScrollView>

        {/* Date / time pickers rendered outside ScrollView */}
        <AppDateTimePicker
          visible={showDatePick}
          mode="date"
          value={new Date(evDate + 'T00:00:00')}
          onConfirm={d => { setEvDate(d.toISOString().slice(0, 10)); setShowDatePick(false); }}
          onCancel={() => setShowDatePick(false)}
        />
        <AppDateTimePicker
          visible={showTimePick}
          mode="time"
          value={(() => { const [h, m] = evTime.split(':'); const d = new Date(); d.setHours(+h, +m, 0, 0); return d; })()}
          onConfirm={d => { setEvTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); setShowTimePick(false); }}
          onCancel={() => setShowTimePick(false)}
        />
        <AppDateTimePicker
          visible={showEndTimePick}
          mode="time"
          value={(() => { const [h, m] = evEndTime.split(':'); const d = new Date(); d.setHours(+h, +m, 0, 0); return d; })()}
          onConfirm={d => { setEvEndTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); setShowEndTimePick(false); }}
          onCancel={() => setShowEndTimePick(false)}
        />
        <AppDateTimePicker
          visible={showEndDatePick}
          mode="date"
          value={new Date((evEndDate || evDate) + 'T00:00:00')}
          onConfirm={d => { setEvEndDate(d.toISOString().slice(0, 10)); setShowEndDatePick(false); }}
          onCancel={() => setShowEndDatePick(false)}
        />

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
