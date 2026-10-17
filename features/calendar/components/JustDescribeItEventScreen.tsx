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
import { showToast } from '@/components/AppToast';
import { PageHeading } from '@/components/PageHeading';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Pressable,
  Animated, Easing, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, fromRow } from '@/store/eventStore';
import type { FamilyEvent, EventRecurrenceRule } from '@/store/eventStore';
import { detectLocalTask } from '@/features/tasks/lib/localTaskDetection';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { todayLocal } from '@/lib/dates';
import FamilyAvatar from '@/components/FamilyAvatar';
import { Mic, Square, CalendarDays, X } from 'lucide-react-native';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { supabase } from '@/lib/supabase';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { familyAi } from '@/lib/familyAiService';
import SwipeBackWrapper from '@/components/SwipeBackWrapper';

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

// A pick-up leg's `time` is the exact moment the driver needs to arrive
// (the main event's end time) and was previously saved with `endTime:
// undefined` — the day-timeline grid had no real duration to size the
// block with, so it defaulted to a full 60-minute block starting there,
// visually showing "Pick-up" an hour later/longer than it actually is
// [live-reported: "when creating ride or event with the drop off and
// pickup we should create the exact time no need to give +60 default? as
// it creates the legs wrongly"]. A pick-up is a short, point-in-time
// errand, not an hour-long block — give it a real 15-minute endTime so it
// renders as the compact marker it actually is.
const PICKUP_LEG_DURATION_MIN = 15;
function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Strips any leg-direction wording the user's own title might already
// contain ("Drop off at soccer" → "soccer") before a leg label gets
// prepended — otherwise a pick-up leg built from a "Drop off at X" title
// reads as "Pick-up · Drop off at X", doubling the direction. Matches every
// casing/spacing variant (dropoff/drop off/drop-off, pickup/pick up/
// pick-up), case-insensitively, as a leading phrase only (so "pickup" used
// mid-sentence elsewhere in the title is left alone).
function stripLegWords(title: string): string {
  return title
    .replace(/^(drop[\s-]?off|pick[\s-]?up)\s*(at|from|to)?\s*/i, '')
    .trim() || title.trim();
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
  prefillDate,
  prefillTime,
  initialText,
  autoOpenForm,
  editEvent,
  backLabel,
}: {
  editEvent?: FamilyEvent;
  visible: boolean;
  onClose: () => void;
  activeMemberId?: string;
  prefillDate?: string; // 'YYYY-MM-DD'
  prefillTime?: string; // 'HH:MM'
  /** Text already typed elsewhere (e.g. detected as an event from Tasks' Just describe): starts in the box so it is read again here. */
  initialText?: string;
  /** The caller already knows this is an event (e.g. detected in Tasks): open the event form as soon as the text is read. */
  autoOpenForm?: boolean;
  // Nav-row back label — defaults to the original "Event"/"Schedule" pair
  // (Calendar/Tasks' own call sites) when omitted. HubScreen's "Schedule"
  // Quick Action passes its own label since closing here returns to Hub,
  // not back to the calendar's Schedule segment.
  backLabel?: string;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId: storeMemberId } = useFamilyStore();
  const activeMemberId = propActiveMemberId ?? storeMemberId;
  const { addEvent, addRecurringEvent, updateEvent } = useEventStore();
  const allEvents = useEventStore(s => s.events);
  const isEdit = !!editEvent;
  const ed = editEvent;
  // The linked pick-up leg's own row — previously never looked up, so
  // reopening an event that already has one (ed.linkedLegId set) started
  // the Pick-up toggle off with empty fields, hiding a leg that actually
  // exists instead of letting it be seen or edited.
  const linkedPickupLeg = ed?.linkedLegId ? allEvents.find(e => e.id === ed.linkedLegId) : undefined;
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  // ── Slide-up / slide-down entrance animation ───────────────────────────
  const slideAnim = useRef(new Animated.Value(visible ? 0 : 60)).current;
  const fadeAnim  = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    if (visible) {
      slideAnim.setValue(60);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // ── Composer state ─────────────────────────────────────────────────────
  const [input, setInput]             = useState(initialText ?? '');
  const [inputFocused, setInputFocused] = useState(false);
  const [detection, setDetection]     = useState<ReturnType<typeof detectLocalTask>>(null);
  const [aiAutoFilling, setAiAutoFilling] = useState(false);

  // ── Inline event form state ────────────────────────────────────────────
  const [formOpen, setFormOpen]         = useState(isEdit);
  const [evTitle, setEvTitle]           = useState(ed?.title ?? '');
  const [evCategory, setEvCategory]     = useState(ed?.category ?? 'Event');
  const [evDate, setEvDate]             = useState(ed?.date ?? prefillDate ?? (autoOpenForm ? todayLocal() : shiftDate(todayLocal(), 1)));
  const [evTime, setEvTime]             = useState(ed?.time?.slice(0, 5) ?? prefillTime ?? '09:00');
  const [evEndTime, setEvEndTime]       = useState(() => {
    if (ed?.endTime) return ed.endTime.slice(0, 5);
    if (prefillTime) {
      const [h, m] = prefillTime.split(':').map(Number);
      const endH = (h + 1) % 24;
      return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return '10:00';
  });
  const [evAllDay, setEvAllDay]         = useState(!!ed?.allDay);
  const [evRecurrence, setEvRecurrence] = useState<'once'|'daily'|'weekly'|'monthly'>('once');
  const [evRecurDays, setEvRecurDays]   = useState<number[]>([]);
  const [evEndDate, setEvEndDate]       = useState('');
  const [evMemberIds, setEvMemberIds]   = useState<string[]>(ed?.memberIds ?? (ed?.memberId ? [ed.memberId] : []));
  const [evNotes, setEvNotes]           = useState(ed?.notes ?? '');
  const [evLocation, setEvLocation]     = useState(ed?.location ?? '');
  // Transport — two independent legs
  const [evDropNeeded, setEvDropNeeded]       = useState(!!ed?.rideRequired);
  const [evDropFrom, setEvDropFrom]           = useState(ed?.pickupLocation ?? '');
  const [evDropTo, setEvDropTo]               = useState(ed?.dropLocation ?? '');
  const [evDropDriverId, setEvDropDriverId]   = useState<string | undefined>(ed?.driverId);
  const [evPickupNeeded, setEvPickupNeeded]   = useState(!!linkedPickupLeg);
  // "Pick up Cherry at 6" means ONE pick-up at 6, not a drop-off at 6 and a pick-up an hour later. Read from the words, editable.
  const [pickupOnly, setPickupOnly]       = useState(false);
  const rideMode: 'none' | 'dropoff' | 'pickup' | 'both' =
    pickupOnly && evPickupNeeded ? 'pickup'
    : evDropNeeded && evPickupNeeded ? 'both'
    : evDropNeeded ? 'dropoff'
    : evPickupNeeded ? 'pickup' : 'none';
  // Changing the ride re-times the legs: a single pick-up happens AT the event time; with both, the drop-off is at the start
  // and the pick-up at the end (an hour later by default); the spoken time is never silently lost.
  const setRideMode = (mode: 'none' | 'dropoff' | 'pickup' | 'both') => {
    const from = rideMode;
    if (mode === from) return;
    if (from === 'pickup' && (mode === 'both')) {
      const pickAt = evTime;
      setEvTime(pickAt < '01:00' ? '00:00' : addMinutesToHHMM(pickAt, -60));
      setEvEndTime(pickAt);
    }
    if (from === 'both' && mode === 'pickup') setEvTime(evEndTime);
    if (from === 'dropoff' && mode === 'both') { /* start stays the drop-off; the end is the pick-up */ }
    if (from === 'both' && mode === 'dropoff') { /* keep the start as the drop-off time */ }
    if (from === 'pickup' && mode === 'dropoff') { /* same single time */ }
    setPickupOnly(mode === 'pickup');
    setEvDropNeeded(mode === 'dropoff' || mode === 'both');
    setEvPickupNeeded(mode === 'pickup' || mode === 'both');
    if (mode === 'pickup' || mode === 'both') {
      const venue = evDropTo || evLocation.trim();
      if (!evPickupFrom) setEvPickupFrom(venue);
      if (!evPickupTo) setEvPickupTo(evDropFrom);
      if (!evPickupDriverId && evDropDriverId) setEvPickupDriverId(evDropDriverId);
    }
    if (mode === 'dropoff' || mode === 'both') {
      if (!evDropTo && evLocation.trim()) setEvDropTo(evLocation.trim());
    }
  };
  const [evPickupFrom, setEvPickupFrom]       = useState(linkedPickupLeg?.pickupLocation ?? '');
  const [evPickupTo, setEvPickupTo]           = useState(linkedPickupLeg?.dropLocation ?? '');
  const [evPickupDriverId, setEvPickupDriverId] = useState<string | undefined>(linkedPickupLeg?.driverId);
  const [evIsPrivate, setEvIsPrivate]         = useState(ed?.privacyLevel === 'private');
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
    setEvDropNeeded(false);
    setEvDropFrom('');
    setEvDropTo('');
    setEvDropDriverId(undefined);
    setEvPickupNeeded(false);
    setEvPickupFrom('');
    setEvPickupTo('');
    setEvPickupDriverId(undefined);
    setEvIsPrivate(false);
    setMemberConflicts({});
    setCheckingConflicts({});
    setListenSecs(0);
    setPickupOnly(false);
    timeTouched.current = false;
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

  // The end must never be before the start (the database rejects it): when the start moves past the end, push the end to an
  // hour later, capped at 23:59 so a late start cannot wrap around midnight.
  useEffect(() => {
    if (evAllDay || !evTime) return;
    if (!evEndTime || evEndTime <= evTime) {
      const next = addMinutesToHHMM(evTime, 60);
      setEvEndTime(next > evTime ? next : '23:59');
    }
  }, [evTime, evEndTime, evAllDay]);

  // Re-check all selected members when date or time changes
  useEffect(() => {
    if (!formOpen || evAllDay || evMemberIds.length === 0) return;
    evMemberIds.forEach(id => checkMemberConflict(id, evDate, evTime, evEndTime));
  }, [evDate, evTime, evEndTime, evAllDay, formOpen]);

  // Live detection — composer-only; must never touch formOpen in edit mode,
  // where the form is always open and there's no composer input to react to.
  useEffect(() => {
    if (isEdit) return;
    if (input.trim().length < MIN_CHARS) { setDetection(null); setFormOpen(false); return; }
    const d = detectLocalTask(input, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
    setDetection(d);
  }, [input, members, isEdit]);

  // Handed over from Tasks as a confirmed event: skip the describe step and show the filled-in event form straight away.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!autoOpenForm || autoOpened.current || isEdit || !detection) return;
    autoOpened.current = true;
    openInlineForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenForm, detection, isEdit]);

  // The spoken time always wins over a hand-over guess: if the words are read again after the form opened, follow them,
  // unless the person already picked a time themselves.
  const timeTouched = useRef(false);
  useEffect(() => {
    const spoken = detection?.when.time?.slice(0, 5);
    if (!autoOpened.current || timeTouched.current || !spoken || spoken === evTime) return;
    setEvTime(spoken);
    setEvEndTime(detection?.when.returnTime ? detection.when.returnTime.slice(0, 5) : addMinutesToHHMM(spoken, 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detection?.when.time]);

  // Keep pick-up locations mirrored as drop-off is filled (only when pick-up is enabled)
  useEffect(() => {
    if (!evPickupNeeded) return;
    // Pick-up "From" mirrors drop-off "To" (the venue)
    if (evDropTo.trim()) setEvPickupFrom(evDropTo);
    // Pick-up "To" mirrors drop-off "From" (home)
    if (evDropFrom.trim()) setEvPickupTo(evDropFrom);
  }, [evDropTo, evDropFrom, evPickupNeeded]);

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
    // Fill the transport part from what was said (all of it stays editable below).
    const dir = detection?.rideDirection ?? null;
    const isRide = detection?.category.kind === 'event' && detection.category.eventCategory === 'Ride';
    const loc = detection?.locations;
    if (isRide || dir) {
      const place = loc?.dropoff ?? loc?.pickup ?? '';
      if (dir === 'pickup') {
        // One pick-up at the spoken time.
        setPickupOnly(true); setEvPickupNeeded(true); setEvDropNeeded(false);
        if (loc?.pickup) setEvPickupFrom(loc.pickup);
        if (loc?.dropoff) setEvPickupTo(loc.dropoff);
      } else if (dir === 'both') {
        // Drop-off at the spoken time, pick-up at the second time (or an hour later when none was said).
        setPickupOnly(false); setEvDropNeeded(true); setEvPickupNeeded(true);
        if (detection?.when.returnTime) setEvEndTime(detection.when.returnTime.slice(0, 5));
        if (loc?.dropoff ?? place) setEvDropTo(loc?.dropoff ?? place);
        if (loc?.pickup ?? place) setEvPickupFrom(loc?.pickup ?? place);
      } else if (dir === 'dropoff') {
        setPickupOnly(false); setEvDropNeeded(true);
        if (loc?.dropoff) setEvDropTo(loc.dropoff);
      }
    }
    setFormOpen(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
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
        // Always open the form and fill it — never overwrite what the user typed
        const t = result.task;
        if (!formOpen) openInlineForm();
        setEvTitle(t.title);
        // Fill the ride from the AI's reading only where the built-in reader left it empty — never override a choice already made.
        const local = detection?.rideDirection ?? null;
        const dir = t.category === 'transport' || t.rideDirection ? t.rideDirection : null;
        if (dir && !local && !evDropNeeded && !evPickupNeeded) {
          setRideMode(dir);
          if (dir === 'both' && t.returnTime && /^\d{2}:\d{2}$/.test(t.returnTime)) setEvEndTime(t.returnTime);
        } else if (dir === 'both' && local === 'both' && !detection?.when.returnTime && t.returnTime && /^\d{2}:\d{2}$/.test(t.returnTime)) {
          setEvEndTime(t.returnTime);
        }
        if (dir) {
          if (t.dropoffLocation) { setEvDropTo(prev => prev || t.dropoffLocation!); setEvPickupTo(prev => prev); }
          if (t.pickupLocation) setEvPickupFrom(prev => prev || t.pickupLocation!);
        }
        if (t.startAt?.includes('T') && !timeTouched.current && !detection?.when.time) {
          setEvTime(t.startAt.split('T')[1].slice(0, 5));
        }
      }
    } catch { /* silently fail */ }
    finally { setAiAutoFilling(false); }
  };

  const handleSave = async () => {
    if (!evTitle.trim() || saving) return;
    // If pick-up leg is enabled, end time is required (it becomes the pick-up departure time)
    if (evPickupNeeded && !evAllDay && !evEndTime) {
      Alert.alert('End time needed', 'Add an end time so we know when to schedule the pick-up ride.');
      return;
    }
    setSaving(true);
    const familyId = activeMember?.familyId ?? '';
    const createdBy = activeMemberId ?? '';
    const dropDriver = members.find(m => m.id === evDropDriverId);
    const pickupDriver = members.find(m => m.id === evPickupDriverId);
    const isSelfDrop = evDropDriverId === activeMemberId;
    const isSelfPickup = evPickupDriverId === activeMemberId;

    // Default recurrence end date = 2 months from event date
    const defaultEndDate = (() => {
      const d = new Date(evDate + 'T00:00:00');
      d.setMonth(d.getMonth() + 2);
      return d.toISOString().slice(0, 10);
    })();
    const recurrenceEndDate = evEndDate || defaultEndDate;

    if (ed) {
      try {
        const driverChanged = evDropDriverId !== ed.driverId;
        // pickupLocation/dropLocation/driverId were previously gated on
        // evDropNeeded (the Transport section's visibility toggle) — but
        // evDropNeeded is keyed off a DIFFERENT field (ed.rideRequired)
        // than evDropFrom/evDropTo (keyed off ed.pickupLocation/
        // dropLocation themselves, see their useState initializers above).
        // Whenever those two fields disagreed on an existing event (e.g.
        // addresses were set but rideRequired wasn't, or vice versa), the
        // toggle opened in the "off" position while the address fields
        // were still populated from real data — saving ANY other change to
        // that event, with the toggle never touched, silently wiped the
        // addresses back to undefined. Save whatever is actually in the
        // fields now, regardless of the toggle's cosmetic on/off state.
        await updateEvent(ed.id, {
          title: evTitle.trim(),
          date: evDate,
          time: evAllDay ? undefined : evTime,
          endTime: evAllDay ? undefined : evEndTime,
          // all_day is NOT NULL on calendar_events — must always send a real
          // boolean, never undefined (see NOT_NULL_EMPTY_DEFAULT's comment
          // in eventStore.ts for the live failure this caused).
          allDay: evAllDay,
          category: evCategory,
          memberIds: evMemberIds.length > 0 ? evMemberIds : undefined,
          memberId: evMemberIds[0],
          notes: evNotes.trim() || undefined,
          location: evLocation.trim() || undefined,
          privacyLevel: evIsPrivate ? 'private' : 'normal',
          rideRequired: evDropNeeded || !!(evDropFrom.trim() || evDropTo.trim()) || undefined,
          pickupLocation: evDropFrom.trim() || undefined,
          dropLocation: evDropTo.trim() || undefined,
          driverId: evDropDriverId,
          driverName: dropDriver ? dropDriver.name : undefined,
          driverStatus: !evDropDriverId ? undefined
            : !driverChanged ? ed.driverStatus
            : isSelfDrop ? 'confirmed' : 'pending',
        });

        // Pick-up leg — previously only ever created on the CREATE path
        // (addEvent below); editing an existing event to turn on "Pick-up
        // needed" silently did nothing — evPickupNeeded/From/To/DriverId
        // were read nowhere in this branch, so toggling it on and saving
        // looked successful but created no second event at all.
        if (evPickupNeeded) {
          if (ed.linkedLegId) {
            // Already has a linked pick-up leg from a previous save — update
            // it. Compare against the PICK-UP leg's own prior driver/status
            // (linkedPickupLeg), not the main drop-off event's (ed) — they're
            // two separate rows with independent driver assignments.
            const pickupDriverChanged = evPickupDriverId !== linkedPickupLeg?.driverId;
            await updateEvent(ed.linkedLegId, {
              date: evDate,
              time: evAllDay ? undefined : evEndTime,
              endTime: evAllDay ? undefined : addMinutesToHHMM(evEndTime, PICKUP_LEG_DURATION_MIN),
              pickupLocation: evPickupFrom.trim() || evDropTo.trim() || undefined,
              dropLocation: evPickupTo.trim() || evDropFrom.trim() || undefined,
              driverId: evPickupDriverId,
              driverName: pickupDriver ? pickupDriver.name : undefined,
              driverStatus: !evPickupDriverId ? undefined
                : !pickupDriverChanged ? linkedPickupLeg?.driverStatus
                : isSelfPickup ? 'confirmed' : 'pending',
            });
          } else {
            const pickupLegId = await addEvent({
              title: `Pick-up · ${stripLegWords(evTitle.trim())}`,
              date: evDate,
              time: evAllDay ? undefined : evEndTime,
              endTime: evAllDay ? undefined : addMinutesToHHMM(evEndTime, PICKUP_LEG_DURATION_MIN),
              category: evCategory,
              type: 'event',
              memberIds: evMemberIds.length > 0 ? evMemberIds : undefined,
              memberId: evMemberIds[0],
              rideRequired: true,
              pickupLocation: evPickupFrom.trim() || evDropTo.trim() || undefined,
              dropLocation: evPickupTo.trim() || evDropFrom.trim() || undefined,
              driverId: evPickupDriverId,
              driverName: pickupDriver ? pickupDriver.name : undefined,
              driverStatus: evPickupDriverId ? (isSelfPickup ? 'confirmed' : 'pending') : undefined,
              linkedLegId: ed.id,
              familyId: activeMember?.familyId ?? '', createdBy: activeMemberId ?? '',
            } as Omit<FamilyEvent, 'id'>);
            if (pickupLegId) await updateEvent(ed.id, { linkedLegId: pickupLegId });
          }
        }

        handleClose();
      } catch {
        setSaving(false);
        Alert.alert('Could not save changes', 'Your edits were not saved. Check your connection and try again.');
      }
      return;
    }

    try {
      const baseEvent: Omit<FamilyEvent, 'id'> = {
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
        rideRequired: evDropNeeded || undefined,
        pickupLocation: evDropNeeded && evDropFrom.trim() ? evDropFrom.trim() : undefined,
        dropLocation: evDropNeeded && evDropTo.trim() ? evDropTo.trim() : undefined,
        driverId: evDropNeeded ? evDropDriverId : undefined,
        driverName: evDropNeeded && dropDriver ? dropDriver.name : undefined,
        driverStatus: evDropNeeded && evDropDriverId ? (isSelfDrop ? 'confirmed' : 'pending') : undefined,
        familyId, createdBy,
      } as Omit<FamilyEvent, 'id'>;

      if (pickupOnly && evPickupNeeded && evRecurrence === 'once') {
        const onlyId = await addEvent({
          ...baseEvent,
          title: `Pick-up · ${stripLegWords(evTitle.trim())}`,
          time: evAllDay ? undefined : evTime,
          endTime: evAllDay ? undefined : addMinutesToHHMM(evTime, PICKUP_LEG_DURATION_MIN),
          rideRequired: true,
          pickupLocation: evPickupFrom.trim() || evDropTo.trim() || undefined,
          dropLocation: evPickupTo.trim() || evDropFrom.trim() || undefined,
          driverId: evPickupDriverId,
          driverName: pickupDriver ? pickupDriver.name : undefined,
          driverStatus: evPickupDriverId ? (isSelfPickup ? 'confirmed' : 'pending') : undefined,
        } as Omit<FamilyEvent, 'id'>);
        if (!onlyId) { setSaving(false); return; }
        handleClose();
        return;
      }

      const mainEventId = evRecurrence !== 'once'
        ? await addRecurringEvent(baseEvent, {
            frequency: evRecurrence as 'daily' | 'weekly' | 'monthly',
            endDate: recurrenceEndDate,
            ...(evRecurrence === 'weekly' && evRecurDays.length > 0 ? { days: evRecurDays } : {}),
          })
        : await addEvent(baseEvent);
      if (!mainEventId) {
        // addEvent returns '' when the database refused the row: say so instead of closing as if it saved.
        setSaving(false);
        showToast('Could not save the event. Check the time and details and try again.');
        return;
      }

      // Pick-up leg — separate event linked back to main. linkedLegId was
      // previously only set on this new pick-up leg (pointing AT the main
      // drop-off event) — the main leg itself never got updated to point
      // back, so opening the drop-off event's own detail page had no way
      // to find its pick-up leg at all; only the reverse direction worked.
      if (evPickupNeeded && mainEventId) {
        const basePickup = {
          title: `Pick-up · ${stripLegWords(evTitle.trim())}`,
          time: evAllDay ? undefined : evEndTime,  // starts when the event ends
          endTime: evAllDay ? undefined : addMinutesToHHMM(evEndTime, PICKUP_LEG_DURATION_MIN),
          category: evCategory,
          type: 'event' as const,
          memberIds: evMemberIds.length > 0 ? evMemberIds : undefined,
          memberId: evMemberIds[0],
          rideRequired: true,
          pickupLocation: evPickupFrom.trim() || evDropTo.trim() || undefined,
          dropLocation: evPickupTo.trim() || evDropFrom.trim() || undefined,
          driverId: evPickupDriverId,
          driverName: pickupDriver ? pickupDriver.name : undefined,
          driverStatus: evPickupDriverId ? (isSelfPickup ? 'confirmed' : 'pending') : undefined,
          familyId, createdBy,
        };

        if (evRecurrence === 'once') {
          const pickupLegId = await addEvent({
            ...basePickup, date: evDate, linkedLegId: mainEventId,
          } as Omit<FamilyEvent, 'id'>);
          if (pickupLegId) await updateEvent(mainEventId, { linkedLegId: pickupLegId });
        } else {
          // Recurring drop-off needs a parallel recurring PICK-UP series
          // (its own seriesId, same recurrenceRule) — not one one-off
          // pick-up event pinned to the anchor's date, which is what a
          // plain addEvent() here produced before this fix (live-reported:
          // a weekly recurring drop-off's future occurrences each silently
          // had no pick-up leg, only the very first one did). Same
          // anchor-then-pair-by-date shape EventFormModal.tsx's own
          // recurring pickup-fork block already uses.
          const { data: rows, error } = await supabase.from('calendar_events')
            .select('*').eq('series_id', mainEventId).is('deleted_at', null);
          if (error || !rows) throw error ?? new Error('series lookup returned no rows');
          const occurrences = rows.map(fromRow).sort((a, b) => a.date.localeCompare(b.date));
          const anchor = occurrences.find(r => r.isSeriesAnchor) ?? occurrences[0];
          if (anchor?.recurrenceRule && occurrences.length > 0) {
            const pickupAnchorId = await addRecurringEvent({
              ...basePickup, date: occurrences[0].date,
            } as Omit<FamilyEvent, 'id'>, anchor.recurrenceRule);
            if (pickupAnchorId) {
              const { data: pickupRows, error: pickupErr } = await supabase.from('calendar_events')
                .select('*').eq('series_id', pickupAnchorId).is('deleted_at', null);
              if (pickupErr || !pickupRows) throw pickupErr ?? new Error('pickup series lookup returned no rows');
              const pickupByDate = new Map(pickupRows.map(fromRow).map(r => [r.date, r]));
              const pairs: { dropoffId: string; pickupId: string }[] = [];
              for (const dropoff of occurrences) {
                const pickup = pickupByDate.get(dropoff.date);
                if (pickup) pairs.push({ dropoffId: dropoff.id, pickupId: pickup.id });
              }
              await Promise.all(pairs.flatMap(p => [
                supabase.from('calendar_events').update({ linked_leg_id: p.pickupId }).eq('id', p.dropoffId),
                supabase.from('calendar_events').update({ linked_leg_id: p.dropoffId }).eq('id', p.pickupId),
              ]));
              await useEventStore.getState().syncFromDB();
            }
          }
        }
      }
      handleClose();
    } catch (e: any) {
      setSaving(false);
      showToast(e?.message ? `Could not save the event: ${e.message}` : 'Could not save the event. Try again.');
    }
  };

  // Safety net: a save that has not finished after 25 seconds is treated as failed so the button never spins forever.
  useEffect(() => {
    if (!saving) return;
    const t = setTimeout(() => { setSaving(false); showToast('Saving is taking too long. Check your connection and try again.'); }, 25000);
    return () => clearTimeout(t);
  }, [saving]);

  const isListening = dictation.state === 'listening';
  const micPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isListening) { micPulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, { toValue: 1.18, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isListening]);
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
  const canvasBg    = isDark ? colors.background : GEMINI.canvas;
  const fieldBorder = isDark ? colors.border : GEMINI.border;
  const activeBlue  = colors.teal;   // Schedule accent = sage/teal (CONNECT)
  const ctaBlue     = '#5872C4';     // dimmed CTA blue (Home Care/Health button pattern) — distinct from the teal role accent above, not GEMINI.blue
  const titleC      = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC       = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const tertiaryC   = isDark ? colors.textTertiary : GEMINI.bodyColorLight;

  const catEntry = EVENT_CATEGORIES.find(c => c.value === evCategory);

  // Driver-eligible: parents + seniors + teens with hasCar, excluding event participants
  const driverCandidates = members.filter(m =>
    (m.role === 'parent' || m.role === 'senior' || (m.role === 'teen' && (m as any).hasCar))
  );

  if (!visible) return null;

  return (
    <SwipeBackWrapper onDismiss={handleClose} backgroundColor={canvasBg}>
    <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: canvasBg }} edges={['top']}>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 20 }}>

            <PageHeading eyebrow="FAMILY CUBE · SCHEDULE" title={isEdit ? 'Edit event' : 'Just describe your schedule'} subtitle={isEdit ? 'Change the core details. Confirmations and reassignments live on the event page.' : 'Type a thought. Speak a thought. Make it a plan.'} accent="teal" Icon={CalendarDays} onTitlePress={handleClose} topInset={0} paddingHorizontal={0} />

            <View style={{ gap: 14 }}>

              {!isEdit && (<>
              {/* ── Natural-language composer ── */}
              <View style={{
                backgroundColor: colors.card, borderRadius: 20,
                borderWidth: inputFocused || isListening ? 2 : 1,
                borderColor: inputFocused || isListening ? activeBlue : colors.border,
                padding: 20, gap: 12,
              }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: bodyC }}>
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
                  style={{ fontSize: 22, fontWeight: '500', lineHeight: 30, color: titleC, minHeight: 30 }}
                />
                {/* Tools row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 12, color: tertiaryC }}>
                      {isListening ? `Listening · ${fmtListenTime(listenSecs)}` : hasInput ? 'Unsaved · only a draft' : 'Nothing created yet'}
                    </Text>
                    {(hasInput || formOpen) && !isListening && (
                      <TouchableOpacity
                        onPress={reset}
                        accessibilityRole="button" accessibilityLabel="Clear the text and the form"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface }}
                      >
                        <X size={12} color={bodyC} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: bodyC }}>Clear</Text>
                      </TouchableOpacity>
                    )}
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
                  <Animated.View style={{ transform: [{ scale: micPulse }] }}>
                    <TouchableOpacity
                      onPress={isListening ? handleStopVoice : () => dictation.start()}
                      style={{
                        width: 48, height: 48, borderRadius: 24,
                        backgroundColor: colors.tealLight,
                        borderWidth: isListening ? 2 : 0, borderColor: activeBlue,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isListening
                        ? <Square size={20} color={activeBlue} strokeWidth={1.8} fill={activeBlue} />
                        : <Mic size={22} color={activeBlue} strokeWidth={1.8} />}
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>

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
                  <Text style={{ fontSize: 12, color: bodyC, lineHeight: 17 }}>
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
                        <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? titleC : '#FFFFFF' }}>
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
                        <Text style={{ fontSize: 13, fontWeight: '500', color: titleC }}>{timeLabel}</Text>
                      </View>
                    )}
                    {detectedMemberName && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                        borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 13 }}>👤</Text>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: titleC }}>{detectedMemberName}</Text>
                      </View>
                    )}
                    {detected.recurrence && detected.recurrence !== 'once' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: colors.amberLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                        borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 13 }}>🔁</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.amber }}>
                          {detected.recurrence.charAt(0).toUpperCase() + detected.recurrence.slice(1)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: bodyC }}>Detected · adjust in the form below</Text>
                </View>
              )}

              {/* ── Resting empty state ── */}
              {!isListening && !hasInput && (
                <>
                  <View style={{ backgroundColor: colors.amberLight, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 8 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: titleC, lineHeight: 24 }}>One sentence is enough</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.amber, lineHeight: 20 }}>
                      "Soccer practice Saturday 4pm" or "Dentist for Mia next Thursday"
                    </Text>
                    <Text style={{ fontSize: 13, color: bodyC, lineHeight: 19, marginTop: 2 }}>
                      We'll detect the category, date, time and who's involved. You confirm before anything is saved.
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => dictation.start()}
                    style={{ height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: ctaBlue }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Speak your event</Text>
                  </TouchableOpacity>

                  <Text style={{ fontSize: 13, color: bodyC, lineHeight: 19, textAlign: 'center', paddingHorizontal: 8 }}>
                    Your own wording comes first. Type or voice — there's no extra create menu.
                  </Text>
                  <View style={{ backgroundColor: colors.tealLight, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.teal }}>Your privacy</Text>
                    <Text style={{ fontSize: 13, color: bodyC, lineHeight: 19 }}>
                      Detection runs entirely on your device. Nothing is sent anywhere until you tap on-demand AI.
                    </Text>
                  </View>
                </>
              )}

              {/* ── CTA: open inline form ── */}
              {!isListening && hasInput && detected && !formOpen && (
                <TouchableOpacity
                  onPress={openInlineForm}
                  style={{ height: 52, borderRadius: 16, backgroundColor: ctaBlue, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Set up event →</Text>
                </TouchableOpacity>
              )}

              {/* No detection fallback */}
              {!isListening && hasInput && !detected && !formOpen && (
                <TouchableOpacity
                  onPress={openInlineForm}
                  style={{ height: 52, borderRadius: 16, backgroundColor: ctaBlue, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Fill in details →</Text>
                </TouchableOpacity>
              )}

              </>)}

              {/* ── Inline event form — flat, no stepper ── */}
              {formOpen && (() => {

                // ── Reusable row helpers ────────────────────────────
                const FieldLabel = ({ text }: { text: string }) => (
                  <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, color: tertiaryC, textTransform: 'uppercase', marginBottom: 2 }}>{text}</Text>
                );
                const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
                  <TouchableOpacity onPress={onChange} style={{ width: 44, height: 26, borderRadius: 13,
                    backgroundColor: value ? activeBlue : colors.surface,
                    borderWidth: 1, borderColor: value ? activeBlue : colors.border,
                    justifyContent: 'center', paddingHorizontal: 2 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF',
                      alignSelf: value ? 'flex-end' : 'flex-start',
                      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }} />
                  </TouchableOpacity>
                );

                return (
                  <View style={{ gap: 32 }}>

                    {/* ── Title ── */}
                    <View style={{ gap: 10 }}>
                      <FieldLabel text="Event" />
                      <TextInput
                        value={evTitle}
                        onChangeText={setEvTitle}
                        placeholder="What's happening?"
                        placeholderTextColor={colors.textTertiary}
                        style={{ fontSize: 20, fontWeight: '600', color: titleC, paddingVertical: 2 }}
                      />
                      <View style={{ height: 1.5, backgroundColor: colors.border }} />
                    </View>

                    {/* ── Category ── */}
                    <View style={{ gap: 12 }}>
                      <FieldLabel text="Type" />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {EVENT_CATEGORIES.map(c => {
                          const sel = evCategory === c.value;
                          return (
                            <TouchableOpacity
                              key={c.value}
                              onPress={() => setEvCategory(c.value)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                                backgroundColor: sel ? colors.textPrimary : colors.surface,
                                borderWidth: sel ? 0 : 1, borderColor: colors.border }}
                            >
                              <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                              <Text style={{ fontSize: 13, fontWeight: sel ? '700' : '400',
                                color: sel ? canvasBg : bodyC }}>{c.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* ── Date & Time ── */}
                    <View style={{ gap: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <FieldLabel text="When" />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 12, color: bodyC }}>All day</Text>
                          <Toggle value={evAllDay} onChange={() => setEvAllDay(v => !v)} />
                        </View>
                      </View>

                      {/* Date + start time row */}
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={() => setShowDatePick(true)}
                          style={{ flex: 1.5, backgroundColor: colors.surface, borderRadius: 14,
                            paddingHorizontal: 16, paddingVertical: 14,
                            flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: titleC }}>{fmtDate(evDate)}</Text>
                        </TouchableOpacity>
                        {!evAllDay && (
                          <TouchableOpacity onPress={() => setShowTimePick(true)}
                            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14,
                              paddingHorizontal: 14, paddingVertical: 14,
                              flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: titleC }}>{fmt12h(evTime)}</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* End time pill */}
                      {!evAllDay && (
                        <TouchableOpacity onPress={() => setShowEndTimePick(true)}
                          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
                            backgroundColor: colors.amberLight, borderRadius: 12,
                            paddingHorizontal: 14, paddingVertical: 10,
                            borderWidth: 1, borderColor: colors.amber }}>
                          <Text style={{ fontSize: 13, color: colors.amber, fontWeight: '500' }}>ends</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.amber }}>{fmt12h(evEndTime)}</Text>
                        </TouchableOpacity>
                      )}

                      {!isEdit && (<>
                      {/* Divider before repeat */}
                      <View style={{ height: 1, backgroundColor: colors.border }} />

                      {/* Repeat pills */}
                      <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: tertiaryC, textTransform: 'uppercase' }}>Repeat</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {RECUR_OPTIONS.map(opt => {
                            const sel = evRecurrence === opt.value;
                            return (
                              <TouchableOpacity key={opt.value} onPress={() => setEvRecurrence(opt.value)}
                                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                                  backgroundColor: sel ? colors.textPrimary : colors.surface,
                                  borderWidth: sel ? 0 : 1, borderColor: colors.border }}>
                                <Text style={{ fontSize: 13, fontWeight: sel ? '700' : '500',
                                  color: sel ? canvasBg : bodyC }}>{opt.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* Weekday picker */}
                      {evRecurrence === 'weekly' && (
                        <View style={{ flexDirection: 'row', gap: 5 }}>
                          {['Su','Mo','Tu','We','Th','Fr','Sa'].map((lbl, idx) => {
                            const sel = evRecurDays.includes(idx);
                            return (
                              <TouchableOpacity key={idx}
                                onPress={() => setEvRecurDays(prev => sel ? prev.filter(d => d !== idx) : [...prev, idx])}
                                style={{ flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                                  backgroundColor: sel ? activeBlue : colors.surface,
                                  borderWidth: sel ? 0 : 1, borderColor: colors.border }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? '#FFFFFF' : tertiaryC }}>{lbl}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Recurrence end date */}
                      {evRecurrence !== 'once' && (
                        <TouchableOpacity onPress={() => setShowEndDatePick(true)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Text style={{ fontSize: 13, color: tertiaryC }}>Ends</Text>
                          {evEndDate ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                              backgroundColor: colors.tealLight, borderRadius: 12,
                              paddingHorizontal: 12, paddingVertical: 8 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}>{fmtDate(evEndDate)}</Text>
                              <TouchableOpacity onPress={() => setEvEndDate('')}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Text style={{ fontSize: 16, color: colors.teal, fontWeight: '400', lineHeight: 18 }}>×</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                              backgroundColor: colors.primaryLight, borderRadius: 12,
                              paddingHorizontal: 12, paddingVertical: 8,
                              borderWidth: 1.5, borderColor: colors.primary }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>2 months by default</Text>
                              <Text style={{ fontSize: 11, color: colors.primary, opacity: 0.7 }}>· tap to change</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      )}
                      </>)}
                    </View>

                    {/* ── Location ── */}
                    <View style={{ gap: 8 }}>
                      <FieldLabel text="Location" />
                      <LocationAutocompleteInput
                        value={evLocation}
                        onChangeText={setEvLocation}
                        placeholder="Add a place"
                        accent={activeBlue}
                        colors={colors}
                      />
                    </View>

                    {/* ── Who's coming ── */}
                    <View style={{ gap: 12 }}>
                      <FieldLabel text="Who's coming" />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        {members.map(m => {
                          const sel = evMemberIds.includes(m.id);
                          const isAdult = m.role === 'parent' || m.role === 'senior';
                          const accentColor = isAdult ? colors.teal : colors.amber;
                          const conflict = memberConflicts[m.id];
                          const checking = checkingConflicts[m.id];
                          const hasConflict = sel && conflict != null;
                          return (
                            <TouchableOpacity key={m.id}
                              onPress={() => {
                                const next = sel ? evMemberIds.filter(id => id !== m.id) : [...evMemberIds, m.id];
                                setEvMemberIds(next);
                                if (!sel && !evAllDay) checkMemberConflict(m.id, evDate, evTime, evEndTime);
                              }}
                              style={{ alignItems: 'center', gap: 6, minWidth: 52 }}>
                              <View style={{ width: 52, height: 52 }}>
                                <View style={{
                                  width: 52, height: 52, borderRadius: 26, overflow: 'hidden',
                                  borderWidth: sel ? 2.5 : 1,
                                  borderColor: hasConflict ? colors.danger : sel ? accentColor : colors.border,
                                  opacity: sel ? 1 : 0.45,
                                }}>
                                  {checking
                                    ? <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                                        <ActivityIndicator size="small" color={accentColor} />
                                      </View>
                                    : <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={52} />
                                  }
                                </View>
                                {sel && !hasConflict && (
                                  <View style={{ position: 'absolute', bottom: 0, right: 0,
                                    width: 18, height: 18, borderRadius: 9,
                                    backgroundColor: accentColor,
                                    borderWidth: 2, borderColor: canvasBg,
                                    alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '800', lineHeight: 12 }}>✓</Text>
                                  </View>
                                )}
                                {hasConflict && (
                                  <View style={{ position: 'absolute', bottom: 0, right: 0,
                                    width: 18, height: 18, borderRadius: 9,
                                    backgroundColor: colors.danger,
                                    borderWidth: 2, borderColor: canvasBg,
                                    alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '800' }}>!</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={{ fontSize: 11, fontWeight: sel ? '700' : '400',
                                color: hasConflict ? colors.danger : sel ? titleC : tertiaryC, textAlign: 'center' }}>
                                {m.name.split(' ')[0]}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {evMemberIds.some(id => memberConflicts[id]) && (
                        <View style={{ gap: 4 }}>
                          {evMemberIds.filter(id => memberConflicts[id]).map(id => {
                            const m = members.find(mb => mb.id === id);
                            return m ? (
                              <Text key={id} style={{ fontSize: 12, color: colors.danger }}>
                                ⚠️ <Text style={{ fontWeight: '600' }}>{m.name.split(' ')[0]}</Text> · {memberConflicts[id]}
                              </Text>
                            ) : null;
                          })}
                        </View>
                      )}
                    </View>

                    {/* ── Transport ──
                        Was hidden entirely when evCategory === 'Ride' — exactly
                        backwards: a Ride event is precisely where pickup/
                        drop-off addresses matter most. Any category can need
                        a ride (dropping a kid at soccer practice included),
                        so this section always shows now. */}
                    <View style={{ gap: 4 }}>
                        <FieldLabel text="Transport" />
                        <View style={{ gap: 12, marginTop: 6 }}>

                          {/* One clear choice for the ride. Pre-set from what was said; changing it re-times the legs sensibly. */}
                          <View style={{ gap: 8 }}>
                            <View style={{ flexDirection: 'row', backgroundColor: isDark ? colors.surface : '#F0EDE6', borderRadius: 14, padding: 3 }}>
                              {([['none', 'No ride'], ['dropoff', 'Drop-off'], ['pickup', 'Pick-up'], ['both', 'Both ways']] as const).map(([key, label]) => (
                                <TouchableOpacity key={key} onPress={() => setRideMode(key)} accessibilityRole="button" accessibilityState={{ selected: rideMode === key }}
                                  style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11, backgroundColor: rideMode === key ? (isDark ? colors.card : '#FFFFFF') : 'transparent' }}>
                                  <Text style={{ fontSize: 13, fontWeight: rideMode === key ? '800' : '600', color: rideMode === key ? titleC : tertiaryC }} numberOfLines={1}>{label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <Text style={{ fontSize: 12, color: tertiaryC }}>
                              {rideMode === 'none' ? 'No driver needed.'
                                : rideMode === 'dropoff' ? `Someone drives them there at ${fmt12h(evTime)}.`
                                : rideMode === 'pickup' ? `Someone picks them up at ${fmt12h(evTime)}.`
                                : `Drop-off at ${fmt12h(evTime)}, pick-up at ${fmt12h(evEndTime)}.`}
                            </Text>
                          </View>

                          {/* Drop-off leg (hidden while this is just a pick-up) */}
                          {rideMode === 'dropoff' || rideMode === 'both' ? (
                          <View style={{ gap: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <View>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: titleC }}>Drop-off</Text>
                                <Text style={{ fontSize: 11, color: tertiaryC, marginTop: 1 }}>{`At ${fmt12h(evTime)}`}</Text>
                              </View>
                            </View>
                            {evDropNeeded && (
                              <View style={{ gap: 8 }}>
                                <LocationAutocompleteInput value={evDropFrom} onChangeText={setEvDropFrom}
                                  placeholder="From" accent={colors.amber} colors={colors} />
                                <LocationAutocompleteInput value={evDropTo} onChangeText={setEvDropTo}
                                  placeholder="To" accent={colors.amber} colors={colors} />
                                <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: tertiaryC, textTransform: 'uppercase', marginTop: 4 }}>Who's driving?</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                                  {driverCandidates.map(m => {
                                    const sel = evDropDriverId === m.id;
                                    const hasConflict = sel && memberConflicts[m.id] != null;
                                    return (
                                      <TouchableOpacity key={m.id}
                                        onPress={() => { setEvDropDriverId(sel ? undefined : m.id); if (!sel && !evAllDay) checkMemberConflict(m.id, evDate, evTime, evEndTime); }}
                                        style={{ alignItems: 'center', gap: 6, minWidth: 52 }}>
                                        <View style={{ width: 48, height: 48 }}>
                                          <View style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden',
                                            borderWidth: sel ? 2.5 : 1, borderColor: hasConflict ? colors.danger : sel ? colors.amber : colors.border,
                                            opacity: sel ? 1 : 0.45 }}>
                                            <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={48} />
                                          </View>
                                          {sel && !hasConflict && (
                                            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 8,
                                              backgroundColor: colors.amber, borderWidth: 2, borderColor: canvasBg, alignItems: 'center', justifyContent: 'center' }}>
                                              <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '800', lineHeight: 11 }}>✓</Text>
                                            </View>
                                          )}
                                          {hasConflict && (
                                            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 8,
                                              backgroundColor: colors.danger, borderWidth: 2, borderColor: canvasBg, alignItems: 'center', justifyContent: 'center' }}>
                                              <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '800' }}>!</Text>
                                            </View>
                                          )}
                                        </View>
                                        <Text style={{ fontSize: 11, fontWeight: sel ? '700' : '400', color: sel ? titleC : tertiaryC, textAlign: 'center' }}>
                                          {m.name.split(' ')[0]}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              </View>
                            )}
                          </View>
                          ) : null}

                          {/* Pick-up leg */}
                          {!evAllDay && (rideMode === 'pickup' || rideMode === 'both') && (
                            <>
                              {rideMode === 'both' && <View style={{ height: 1, backgroundColor: colors.border }} />}
                              <View style={{ gap: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <View>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: titleC }}>Pick-up</Text>
                                    <Text style={{ fontSize: 11, color: tertiaryC, marginTop: 1 }}>{`At ${fmt12h(pickupOnly ? evTime : evEndTime)}`}</Text>
                                  </View>
                                </View>
                                {evPickupNeeded && (
                                  <View style={{ gap: 8 }}>
                                    <LocationAutocompleteInput value={evPickupFrom} onChangeText={setEvPickupFrom}
                                      placeholder="From" accent={colors.amber} colors={colors} />
                                    <LocationAutocompleteInput value={evPickupTo} onChangeText={setEvPickupTo}
                                      placeholder="To" accent={colors.amber} colors={colors} />
                                    <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: tertiaryC, textTransform: 'uppercase', marginTop: 4 }}>Who's driving?</Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                                      {driverCandidates.map(m => {
                                        const sel = evPickupDriverId === m.id;
                                        const hasConflict = sel && memberConflicts[m.id] != null;
                                        return (
                                          <TouchableOpacity key={m.id}
                                            onPress={() => { setEvPickupDriverId(sel ? undefined : m.id); if (!sel && !evAllDay) checkMemberConflict(m.id, evDate, evEndTime, evEndTime); }}
                                            style={{ alignItems: 'center', gap: 6, minWidth: 52 }}>
                                            <View style={{ width: 48, height: 48 }}>
                                              <View style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden',
                                                borderWidth: sel ? 2.5 : 1, borderColor: hasConflict ? colors.danger : sel ? colors.amber : colors.border,
                                                opacity: sel ? 1 : 0.45 }}>
                                                <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={48} />
                                              </View>
                                              {sel && !hasConflict && (
                                                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 8,
                                                  backgroundColor: colors.amber, borderWidth: 2, borderColor: canvasBg, alignItems: 'center', justifyContent: 'center' }}>
                                                  <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '800', lineHeight: 11 }}>✓</Text>
                                                </View>
                                              )}
                                              {hasConflict && (
                                                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 8,
                                                  backgroundColor: colors.danger, borderWidth: 2, borderColor: canvasBg, alignItems: 'center', justifyContent: 'center' }}>
                                                  <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '800' }}>!</Text>
                                                </View>
                                              )}
                                            </View>
                                            <Text style={{ fontSize: 11, fontWeight: sel ? '700' : '400', color: sel ? titleC : tertiaryC, textAlign: 'center' }}>
                                              {m.name.split(' ')[0]}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </View>
                                  </View>
                                )}
                              </View>
                            </>
                          )}

                        </View>
                      </View>

                    {/* ── Private ── */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View>
                        <FieldLabel text="Private event" />
                        <Text style={{ fontSize: 12, color: tertiaryC, marginTop: 2 }}>
                          {evIsPrivate ? 'Only participants will see this' : 'Visible to the whole family'}
                        </Text>
                      </View>
                      <Toggle value={evIsPrivate} onChange={() => setEvIsPrivate(v => !v)} />
                    </View>

                    {/* ── Notes ── */}
                    <View style={{ gap: 10 }}>
                      <FieldLabel text="Notes" />
                      <View style={{ backgroundColor: colors.surface, borderRadius: 14,
                        paddingHorizontal: 14, paddingVertical: 12, minHeight: 64 }}>
                        <TextInput value={evNotes} onChangeText={setEvNotes} placeholder="Anything else…"
                          placeholderTextColor={colors.textTertiary} multiline
                          style={{ fontSize: 14, color: titleC, textAlignVertical: 'top' }}
                        />
                      </View>
                    </View>

                    {/* ── Save ── */}
                    <TouchableOpacity onPress={handleSave} disabled={!evTitle.trim() || saving}
                      style={{ height: 56, borderRadius: 18,
                        backgroundColor: evTitle.trim() ? ctaBlue : colors.surface,
                        alignItems: 'center', justifyContent: 'center',
                        shadowColor: evTitle.trim() ? ctaBlue : 'transparent',
                        shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
                      {saving
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={{ fontSize: 16, fontWeight: '700', color: evTitle.trim() ? '#FFFFFF' : tertiaryC }}>
                            {isEdit ? 'Save changes' : 'Add to schedule'}
                          </Text>}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={isEdit ? handleClose : () => setFormOpen(false)} style={{ alignItems: 'center', paddingVertical: 6 }}>
                      <Text style={{ fontSize: 13, color: tertiaryC }}>{isEdit ? 'Cancel' : '‹ Back'}</Text>
                    </TouchableOpacity>

                  </View>
                );
              })()}

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
          onConfirm={d => { timeTouched.current = true; setEvTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`); setShowTimePick(false); }}
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
    </Animated.View>
    </SwipeBackWrapper>
  );
}
