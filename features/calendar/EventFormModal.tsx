/**
 * EventFormModal — Add / Edit family events.
 *
 * RBAC:
 *  Parent  — full form, all categories, immediate helper assignment
 *  Senior  — can create Work / Event for themselves; can accept helper role
 *  Kid     — limited to Ride & Study requests → auto approvalPending = true,
 *            no helper picker (parent assigns later), can withdraw before approved
 *
 * Edit mode restrictions (same as quests):
 *  - Past events: read-only for kids; parents can edit notes/helper only
 *  - After approval: kid cannot edit or delete
 *  - Parent: full edit always
 *
 * Swipe-to-delete is handled in CalendarScreen (this file exports the modals only).
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Modal, KeyboardAvoidingView, Platform, StyleSheet, Alert,
  Switch, ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType, HelperStatus } from '@/store/eventStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import Svg, { Path, Circle } from 'react-native-svg';

// ─── Icons ─────────────────────────────────────────────────────────────────────
const X = ({ c, size = 14 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);
const ChevronDown = ({ c, size = 14 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 9l6 6 6-6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// ─── Category definitions ──────────────────────────────────────────────────────
export type EventCategory = 'Medical' | 'Sports' | 'Study' | 'Ride' | 'Work' | 'Event' | 'Birthday';

const CATEGORIES: { key: EventCategory; emoji: string; label: string; color: string }[] = [
  { key: 'Medical',  emoji: '🏥', label: 'Medical',  color: '#EF4444' },
  { key: 'Sports',   emoji: '🏅', label: 'Sports',   color: '#F59E0B' },
  { key: 'Study',    emoji: '📚', label: 'Study',    color: '#3B82F6' },
  { key: 'Ride',     emoji: '🚗', label: 'Ride',     color: '#10B981' },
  { key: 'Work',     emoji: '💼', label: 'Work',     color: '#A855F7' },
  { key: 'Event',    emoji: '🎉', label: 'Event',    color: '#6C5CE7' },
  { key: 'Birthday', emoji: '🎂', label: 'Birthday', color: '#F59E0B' },
];

// ─── Smart suggestions ─────────────────────────────────────────────────────────
const SUGGESTIONS: Record<EventCategory, { title: string; hint: string }[]> = {
  Medical:  [
    { title: 'Dentist appointment',   hint: '🦷 Routine checkup' },
    { title: 'Vaccine checkup',       hint: '💉 Immunisation' },
    { title: 'Eye exam',              hint: '👁️ Annual vision test' },
    { title: 'Pediatric checkup',     hint: '🩺 Annual well-child' },
    { title: 'Therapy session',       hint: '💙 Counselling' },
    { title: 'Orthodontist visit',    hint: '😬 Braces checkup' },
    { title: 'Allergy shot',          hint: '💊 Regular shot' },
  ],
  Sports:   [
    { title: 'Soccer practice',       hint: '⚽ Weekly training' },
    { title: 'Swimming lesson',       hint: '🏊 Coached session' },
    { title: 'Basketball game',       hint: '🏀 Match day' },
    { title: 'Tennis lesson',         hint: '🎾 Court session' },
    { title: 'Cricket match',         hint: '🏏 Tournament' },
    { title: 'Gymnastics class',      hint: '🤸 Skills training' },
    { title: 'Karate practice',       hint: '🥋 Belt training' },
  ],
  Study:    [
    { title: 'Math tutoring',         hint: '➕ Numbers session' },
    { title: 'Science study',         hint: '🔬 Lab review' },
    { title: 'English tutoring',      hint: '📖 Writing & reading' },
    { title: 'Hindi practice',        hint: '🪔 Language session' },
    { title: 'Coding lesson',         hint: '💻 Programming' },
    { title: 'SAT / exam prep',       hint: '📝 Test readiness' },
    { title: 'Music lesson',          hint: '🎵 Instrument practice' },
  ],
  Ride:     [
    { title: 'Ride to school',        hint: '🏫 Morning drop' },
    { title: 'Ride home from practice', hint: '🏠 After training' },
    { title: 'Pickup from chess club', hint: '♟️ Club pickup' },
    { title: 'Ride to friend\'s place', hint: '👫 Social trip' },
    { title: 'Airport pickup',        hint: '✈️ Terminal run' },
    { title: 'Library drop-off',      hint: '📚 Study session' },
  ],
  Work:     [
    { title: 'Team meeting',          hint: '👥 Office sync' },
    { title: 'Work presentation',     hint: '📊 Board deck' },
    { title: 'Conference call',       hint: '📞 Remote meeting' },
    { title: 'Office errand',         hint: '🏢 Quick run' },
    { title: 'Client visit',          hint: '🤝 Site meeting' },
    { title: 'Doctor visit',          hint: '🩺 Own health' },
  ],
  Event:    [
    { title: 'Family game night',     hint: '🎲 Board games' },
    { title: 'Movie night',           hint: '🎬 Film evening' },
    { title: 'Family dinner',         hint: '🍽️ Table time' },
    { title: 'Weekend outing',        hint: '🌳 Outside fun' },
    { title: 'House party',           hint: '🏠 Hosting guests' },
  ],
  Birthday: [
    { title: 'Birthday party',        hint: '🎁 Celebration' },
    { title: 'Birthday dinner',       hint: '🎂 Family meal' },
    { title: 'Friend\'s birthday',   hint: '🎊 Guest at party' },
  ],
};

// ─── Sport type chips ──────────────────────────────────────────────────────────
const SPORT_TYPES = ['Soccer','Basketball','Swimming','Tennis','Cricket','Gymnastics','Karate','Rugby','Athletics','Badminton','Cycling'];
const SUBJECTS    = ['Math','Science','English','Hindi','Coding','Music','Art','History','Geography','Economics'];
const WORK_TYPES  = ['Meeting','Presentation','Conference','Errand','Doctor','Client Visit','Training'];
const APPT_TYPES  = ['Routine checkup','Vaccine','Dental','Eye exam','Therapy','Ortho','Allergy','Blood test','Specialist'];

// ─── Date / time helpers ───────────────────────────────────────────────────────
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTimeDisplay(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ─── Shared chip ───────────────────────────────────────────────────────────────
function Chip({ label, active, color, onPress, small }: {
  label: string; active: boolean; color: string;
  onPress: () => void; small?: boolean;
}) {
  const { colors, isDark } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        borderRadius: 20, borderWidth: 1.5, paddingHorizontal: small ? 10 : 12, paddingVertical: small ? 5 : 7,
        backgroundColor: active ? color + '20' : (isDark ? colors.surface : '#F5F4FA'),
        borderColor: active ? color : (isDark ? colors.border : '#E2E8F0'),
      }}
    >
      <Text style={{ fontSize: small ? TYPO.micro : TYPO.label, fontWeight: '700', color: active ? color : colors.textTertiary }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Avatar picker (member row) ────────────────────────────────────────────────
function MemberPicker({ label, selectedId, members, onSelect, colors, isDark, siblings }: {
  label: string; selectedId?: string;
  members: any[]; onSelect: (id: string) => void;
  colors: any; isDark: boolean; siblings: string[];
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[f.label, { color: colors.textSecondary }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 12 }}>
        {members.map(m => {
          const sel = selectedId === m.id;
          return (
            <TouchableOpacity key={m.id} style={{ alignItems: 'center', gap: 4 }} onPress={() => onSelect(m.id)}>
              <View style={{ position: 'relative' }}>
                <FamilyAvatar
                  name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl}
                  siblings={siblings} size={44}
                  ringColor={sel ? BRAND.purple : 'transparent'}
                  ringWidth={sel ? 2.5 : 0}
                  bgColor={sel ? BRAND.purple + '20' : (isDark ? '#1E293B' : '#F1F5F9')}
                />
                {sel && (
                  <View style={{
                    position: 'absolute', bottom: -2, right: -2,
                    width: 16, height: 16, borderRadius: 8,
                    backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>✓</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: sel ? BRAND.purple : colors.textTertiary }} numberOfLines={1}>
                {m.name.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AddEventModal
// ═══════════════════════════════════════════════════════════════════════════════
export function AddEventModal({ visible, onClose, activeMemberId }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
}) {
  const { colors, isDark } = useTheme();
  const { addEvent } = useEventStore();
  const members = useFamilyStore(s => s.members);
  const siblings = members.map(m => m.name);

  const activeMember = members.find(m => m.id === activeMemberId);
  const isParent  = activeMember?.role === 'parent';
  const isSenior  = activeMember?.role === 'senior';
  const isKid     = activeMember?.role === 'kid';

  // Kids can only request Ride or Study
  const allowedCategories = isKid
    ? CATEGORIES.filter(c => c.key === 'Ride' || c.key === 'Study')
    : CATEGORIES;

  // ── State ──────────────────────────────────────────────────────────────────
  const [category,       setCategory]       = useState<EventCategory>(isKid ? 'Ride' : 'Medical');
  const [title,          setTitle]          = useState('');
  const [titleFocused,   setTitleFocused]   = useState(false);
  const [notes,          setNotes]          = useState('');
  const [saving,         setSaving]         = useState(false);

  // Date/time
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; };
  const [eventDate,      setEventDate]      = useState<Date>(tomorrow());
  const [showDatePick,   setShowDatePick]   = useState(false);
  const [showTimePick,   setShowTimePick]   = useState(false);
  const [allDay,         setAllDay]         = useState(false);

  // Category-specific
  const [memberId,       setMemberId]       = useState<string | undefined>(isKid ? activeMemberId : undefined);
  const [helperId,       setHelperId]       = useState<string | undefined>();
  const [helperName,     setHelperName]     = useState('');
  const [doctorName,     setDoctorName]     = useState('');
  const [clinicLocation, setClinicLocation] = useState('');
  const [apptType,       setApptType]       = useState('');
  const [sportType,      setSportType]      = useState('');
  const [coachName,      setCoachName]      = useState('');
  const [venueLocation,  setVenueLocation]  = useState('');
  const [returnTime,     setReturnTime]     = useState('');
  const [kitReminder,    setKitReminder]    = useState(false);
  const [subject,        setSubject]        = useState('');
  const [tutorName,      setTutorName]      = useState('');
  const [isOnline,       setIsOnline]       = useState(false);
  const [meetingUrl,     setMeetingUrl]     = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation,   setDropLocation]   = useState('');
  const [workType,       setWorkType]       = useState('');
  const [workLocation,   setWorkLocation]   = useState('');
  const [generalLocation,setGeneralLocation]= useState('');

  const suggPressing = useRef(false);

  // ── Suggestions ────────────────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    const pool = SUGGESTIONS[category] ?? [];
    if (!title.trim()) return pool.slice(0, 6);
    const q = title.toLowerCase();
    return pool.filter(s => s.title.toLowerCase().includes(q)).slice(0, 6);
  }, [category, title]);

  const applySuggestion = (s: { title: string }) => {
    suggPressing.current = false;
    setTitle(s.title);
    setTitleFocused(false);
  };

  // ── Member pickers ─────────────────────────────────────────────────────────
  const kids   = members.filter(m => m.role === 'kid');
  const adults = members.filter(m => m.role === 'parent' || m.role === 'senior');
  const forMembers = category === 'Work' ? adults : kids;

  // When parent picks helper from list, fill name from member record
  const handleHelperSelect = (id: string) => {
    const m = members.find(x => x.id === id);
    setHelperId(id);
    setHelperName(m?.name ?? '');
  };

  // Auto-build title when relevant fields change (for Ride)
  const autoTitle = useMemo(() => {
    if (category === 'Ride' && dropLocation && !title)
      return `Ride to ${dropLocation}`;
    if (category === 'Study' && subject && !title)
      return `${subject} tutoring`;
    return '';
  }, [category, dropLocation, subject, title]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = () => {
    setCategory(isKid ? 'Ride' : 'Medical');
    setTitle(''); setNotes(''); setEventDate(tomorrow()); setAllDay(false);
    setMemberId(isKid ? activeMemberId : undefined);
    setHelperId(undefined); setHelperName('');
    setDoctorName(''); setClinicLocation(''); setApptType('');
    setSportType(''); setCoachName(''); setVenueLocation(''); setReturnTime(''); setKitReminder(false);
    setSubject(''); setTutorName(''); setIsOnline(false); setMeetingUrl('');
    setPickupLocation(''); setDropLocation('');
    setWorkType(''); setWorkLocation(''); setGeneralLocation('');
    setShowDatePick(false); setShowTimePick(false);
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const finalTitle = title.trim() || autoTitle;
  const canSubmit = !!finalTitle && (allDay || true); // time optional

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);

    const location =
      category === 'Medical'  ? clinicLocation || undefined
      : category === 'Sports' ? venueLocation  || undefined
      : category === 'Study'  ? (isOnline ? 'Online — Zoom' : venueLocation || undefined)
      : category === 'Ride'   ? dropLocation   || undefined
      : category === 'Work'   ? workLocation   || undefined
      : generalLocation       || undefined;

    const helper = helperName.trim() || undefined;

    addEvent({
      title:           finalTitle,
      date:            localDateStr(eventDate),
      time:            allDay ? undefined : fmtTime(eventDate),
      type:            (category === 'Birthday' ? 'birthday' : category === 'Medical' ? 'appointment' : 'event') as EventType,
      category,
      allDay,
      location,
      notes:           notes.trim() || undefined,
      memberId,
      // Helper
      helper,
      helperStatus:    helper ? 'pending' : undefined,
      helperRequestedBy: isKid ? activeMember?.name : undefined,
      // Medical
      doctorName:      doctorName.trim() || undefined,
      // Study
      subject:         subject || undefined,
      // Sports
      coachName:       coachName.trim() || undefined,
      // Ride/Sports
      pickupLocation:  pickupLocation.trim() || undefined,
      dropLocation:    dropLocation.trim()   || undefined,
      // Approval flow
      approvalPending: isKid, // kids' requests go to parent approval
      conflict:        false,
      color:           CATEGORIES.find(c => c.key === category)?.color,
    });

    setSaving(false);
    reset();
    onClose();
  };

  const catColor = CATEGORIES.find(c => c.key === category)?.color ?? BRAND.purple;
  const catEmoji = CATEGORIES.find(c => c.key === category)?.emoji ?? '📅';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={[f.sheet, { backgroundColor: colors.card }]}
            contentContainerStyle={{ paddingBottom: 48 }}
          >
            <View style={[f.handle, { backgroundColor: colors.border }]} />

            {/* ── Header ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>
                  {isKid ? '🙋 Request Help' : '+ New Event'}
                </Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: catColor }}>
                  {isKid
                    ? 'Your request goes to a parent for approval'
                    : `${catEmoji} ${category} — ${isParent ? 'full access' : 'senior view'}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { reset(); onClose(); }}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}
              >
                <X c={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Category selector ── */}
            <Text style={[f.label, { color: colors.textSecondary }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {allowedCategories.map(c => {
                  const active = category === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      onPress={() => { setCategory(c.key); setTitle(''); }}
                      style={{
                        borderRadius: 16, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8,
                        alignItems: 'center', gap: 3, minWidth: 64,
                        backgroundColor: active ? c.color + '18' : (isDark ? colors.surface : '#F5F4FA'),
                        borderColor: active ? c.color : (isDark ? colors.border : '#E2E8F0'),
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: active ? c.color : colors.textTertiary }}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* ── Title ── */}
            <Text style={[f.label, { color: colors.textSecondary }]}>Title *</Text>
            <TextInput
              style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface,
                borderColor: finalTitle ? colors.border : '#EF444460' }]}
              placeholder={autoTitle || `e.g. ${SUGGESTIONS[category]?.[0]?.title ?? 'Event title'}`}
              placeholderTextColor={colors.textTertiary}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTimeout(() => { if (!suggPressing.current) setTitleFocused(false); }, 200)}
              returnKeyType="next"
            />
            {/* Suggestions */}
            {suggestions.length > 0 && (
              <View style={{ marginTop: -8, marginBottom: 14 }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 6, fontWeight: '600' }}>
                  {title.trim() ? 'Matching — tap to fill' : 'Quick picks'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {suggestions.map((s, i) => (
                      <TouchableOpacity
                        key={i}
                        onPressIn={() => { suggPressing.current = true; }}
                        onPress={() => applySuggestion(s)}
                        style={[f.suggPill, {
                          backgroundColor: title === s.title ? catColor + '20' : (isDark ? colors.surface : '#F5F4FA'),
                          borderColor: title === s.title ? catColor : (isDark ? colors.border : '#E2E8F0'),
                        }]}
                      >
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textSecondary }} numberOfLines={1}>
                          {s.title}
                        </Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginLeft: 4 }}>{s.hint}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* ── Date / Time ── */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <TouchableOpacity
                style={[f.dateBtn, { flex: 3, backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setShowDatePick(true); setShowTimePick(false); }}
              >
                <Text style={{ fontSize: 13 }}>📅</Text>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                  {fmtDisplay(eventDate)}
                </Text>
                <ChevronDown c={colors.textTertiary} />
              </TouchableOpacity>
              {!allDay && (
                <TouchableOpacity
                  style={[f.dateBtn, { flex: 2, backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => { setShowTimePick(true); setShowDatePick(false); }}
                >
                  <Text style={{ fontSize: 13 }}>🕐</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                    {fmtTimeDisplay(eventDate)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* All day toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
              paddingHorizontal: 4 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>All day</Text>
              <Switch
                value={allDay} onValueChange={setAllDay}
                trackColor={{ false: colors.border, true: catColor + '80' }}
                thumbColor={allDay ? catColor : colors.textTertiary}
              />
            </View>

            {/* Date pickers */}
            {showDatePick && (
              <DateTimePicker
                value={eventDate} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                onChange={(_, d) => { setShowDatePick(Platform.OS === 'ios'); if (d) { const m = new Date(d); m.setHours(eventDate.getHours(), eventDate.getMinutes()); setEventDate(m); } }}
              />
            )}
            {showTimePick && !allDay && (
              <DateTimePicker
                value={eventDate} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => { setShowTimePick(Platform.OS === 'ios'); if (d) { const m = new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setEventDate(m); } }}
              />
            )}

            {/* ── MEDICAL fields ── */}
            {category === 'Medical' && (
              <>
                <Text style={[f.sectionLabel, { color: catColor }]}>🏥 Medical details</Text>

                {/* Appointment type */}
                <Text style={[f.label, { color: colors.textSecondary }]}>Appointment type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {APPT_TYPES.map(t => <Chip key={t} label={t} active={apptType === t} color={catColor} onPress={() => setApptType(p => p === t ? '' : t)} small />)}
                  </View>
                </ScrollView>

                {/* Doctor + clinic in one row */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>🩺 Doctor</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                      placeholder="Dr. Smith" placeholderTextColor={colors.textTertiary}
                      value={doctorName} onChangeText={setDoctorName} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>📍 Clinic</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                      placeholder="Clinic name" placeholderTextColor={colors.textTertiary}
                      value={clinicLocation} onChangeText={setClinicLocation} />
                  </View>
                </View>
              </>
            )}

            {/* ── SPORTS fields ── */}
            {category === 'Sports' && (
              <>
                <Text style={[f.sectionLabel, { color: catColor }]}>🏅 Sports details</Text>

                <Text style={[f.label, { color: colors.textSecondary }]}>Sport</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {SPORT_TYPES.map(t => <Chip key={t} label={t} active={sportType === t} color={catColor} onPress={() => setSportType(p => p === t ? '' : t)} small />)}
                  </View>
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>🏅 Coach</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                      placeholder="Coach Williams" placeholderTextColor={colors.textTertiary}
                      value={coachName} onChangeText={setCoachName} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>📍 Venue</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                      placeholder="Riverside Park" placeholderTextColor={colors.textTertiary}
                      value={venueLocation} onChangeText={setVenueLocation} />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>📍 Pickup from</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                      placeholder="Home / School" placeholderTextColor={colors.textTertiary}
                      value={pickupLocation} onChangeText={setPickupLocation} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Return time</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                      placeholder="5:00 PM" placeholderTextColor={colors.textTertiary}
                      value={returnTime} onChangeText={setReturnTime} />
                  </View>
                </View>

                {/* Kit reminder */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 }}>
                  <View>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>🎒 Kit reminder</Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>Notify player to pack gear beforehand</Text>
                  </View>
                  <Switch value={kitReminder} onValueChange={setKitReminder}
                    trackColor={{ false: colors.border, true: catColor + '80' }}
                    thumbColor={kitReminder ? catColor : colors.textTertiary} />
                </View>
              </>
            )}

            {/* ── STUDY fields ── */}
            {category === 'Study' && (
              <>
                <Text style={[f.sectionLabel, { color: catColor }]}>📚 Study details</Text>

                <Text style={[f.label, { color: colors.textSecondary }]}>Subject</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {SUBJECTS.map(s => <Chip key={s} label={s} active={subject === s} color={catColor} onPress={() => setSubject(p => p === s ? '' : s)} small />)}
                  </View>
                </ScrollView>

                <Text style={[f.label, { color: colors.textSecondary }]}>📚 Tutor name</Text>
                <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="Mr. Kumar" placeholderTextColor={colors.textTertiary}
                  value={tutorName} onChangeText={setTutorName} />

                {/* Online toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>🖥️ Online session</Text>
                  <Switch value={isOnline} onValueChange={setIsOnline}
                    trackColor={{ false: colors.border, true: catColor + '80' }}
                    thumbColor={isOnline ? catColor : colors.textTertiary} />
                </View>
                {isOnline ? (
                  <>
                    <Text style={[f.label, { color: colors.textSecondary }]}>🔗 Meeting link</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                      placeholder="https://zoom.us/j/..." placeholderTextColor={colors.textTertiary}
                      value={meetingUrl} onChangeText={setMeetingUrl} keyboardType="url" autoCapitalize="none" />
                  </>
                ) : (
                  <>
                    <Text style={[f.label, { color: colors.textSecondary }]}>📍 Location</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                      placeholder="Home / Library" placeholderTextColor={colors.textTertiary}
                      value={venueLocation} onChangeText={setVenueLocation} />
                  </>
                )}
              </>
            )}

            {/* ── RIDE fields ── */}
            {category === 'Ride' && (
              <>
                <Text style={[f.sectionLabel, { color: catColor }]}>🚗 Ride details</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>📍 Pickup from</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                      placeholder="Home / School" placeholderTextColor={colors.textTertiary}
                      value={pickupLocation} onChangeText={setPickupLocation} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[f.label, { color: colors.textSecondary }]}>🏁 Drop to</Text>
                    <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface,
                      borderColor: dropLocation ? colors.border : '#F59E0B60' }]}
                      placeholder="Chess Club, Oak St" placeholderTextColor={colors.textTertiary}
                      value={dropLocation} onChangeText={setDropLocation} />
                  </View>
                </View>
                <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Return pickup time (optional)</Text>
                <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="e.g. 5:30 PM — if someone needs to pick up after" placeholderTextColor={colors.textTertiary}
                  value={returnTime} onChangeText={setReturnTime} />
              </>
            )}

            {/* ── WORK fields ── */}
            {category === 'Work' && (
              <>
                <Text style={[f.sectionLabel, { color: catColor }]}>💼 Work details</Text>
                <Text style={[f.label, { color: colors.textSecondary }]}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {WORK_TYPES.map(t => <Chip key={t} label={t} active={workType === t} color={catColor} onPress={() => setWorkType(p => p === t ? '' : t)} small />)}
                  </View>
                </ScrollView>
                <Text style={[f.label, { color: colors.textSecondary }]}>📍 Location / Link</Text>
                <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="Office HQ or https://meet.google.com/..." placeholderTextColor={colors.textTertiary}
                  value={workLocation} onChangeText={setWorkLocation} />
              </>
            )}

            {/* ── EVENT / BIRTHDAY fields ── */}
            {(category === 'Event' || category === 'Birthday') && (
              <>
                <Text style={[f.sectionLabel, { color: catColor }]}>🎉 Event details</Text>
                <Text style={[f.label, { color: colors.textSecondary }]}>📍 Location</Text>
                <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="Living Room / Park / Restaurant" placeholderTextColor={colors.textTertiary}
                  value={generalLocation} onChangeText={setGeneralLocation} />
              </>
            )}

            {/* ── For (member picker) ── */}
            {category !== 'Event' && category !== 'Birthday' && !isKid && (
              <MemberPicker
                label={
                  category === 'Medical' ? 'Patient (which child?)' :
                  category === 'Sports'  ? 'Player (which child?)' :
                  category === 'Study'   ? 'Student (which child?)' :
                  category === 'Ride'    ? 'Passenger' :
                  'For'
                }
                selectedId={memberId}
                members={forMembers}
                onSelect={setMemberId}
                colors={colors} isDark={isDark} siblings={siblings}
              />
            )}

            {/* ── Helper assignment (parent only; kid sees "Parent will assign") ── */}
            {category !== 'Work' && category !== 'Event' && category !== 'Birthday' && (
              <>
                {isKid ? (
                  <View style={[f.kidNote, { backgroundColor: isDark ? '#1C1700' : '#FFFBEB', borderColor: '#F59E0B40' }]}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#D97706' }}>
                      👋 Parent will assign someone to help
                    </Text>
                    <Text style={{ fontSize: TYPO.micro, color: '#D97706', opacity: 0.8, marginTop: 2 }}>
                      Your request is sent for approval — a parent will pick who accompanies or drives you.
                    </Text>
                  </View>
                ) : (
                  <MemberPicker
                    label={
                      category === 'Medical' ? '🏥 Accompanied by (adult)' :
                      category === 'Study'   ? '📚 Tutored by (pick from family or type name)' :
                      category === 'Sports'  ? '🚗 Drop-off by (adult)' :
                      '🚗 Driven by (adult)'
                    }
                    selectedId={helperId}
                    members={adults}
                    onSelect={handleHelperSelect}
                    colors={colors} isDark={isDark} siblings={siblings}
                  />
                )}
                {/* Manual name entry for external helpers (tutors, coaches, etc.) */}
                {!isKid && (
                  <TextInput
                    style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, marginTop: -8 }]}
                    placeholder={
                      category === 'Study' ? 'Or type tutor name (e.g. Mr. Kumar)'
                      : 'Or type name (e.g. Grandma Mary)'
                    }
                    placeholderTextColor={colors.textTertiary}
                    value={helperName}
                    onChangeText={t => { setHelperName(t); if (!t) setHelperId(undefined); }}
                  />
                )}
              </>
            )}

            {/* ── Notes ── */}
            <Text style={[f.label, { color: colors.textSecondary, marginTop: 4 }]}>📝 Notes (optional)</Text>
            <TextInput
              style={[f.input, f.multiInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder={isKid ? 'Any message for parents? (e.g. please pick me up early)' : 'Any details, instructions, or reminders…'}
              placeholderTextColor={colors.textTertiary}
              value={notes} onChangeText={t => setNotes(t.slice(0, 200))}
              multiline numberOfLines={3} textAlignVertical="top"
            />
            <Text style={{ fontSize: TYPO.micro, color: notes.length > 180 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: 16 }}>
              {notes.length}/200
            </Text>

            {/* ── Kid approval reminder ── */}
            {isKid && (
              <View style={[f.kidNote, { backgroundColor: isDark ? '#1E1B4B' : '#F0F0FE', borderColor: BRAND.purple + '40', marginBottom: 16 }]}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>
                  ⏳ Sent for parent approval
                </Text>
                <Text style={{ fontSize: TYPO.micro, color: BRAND.purple, opacity: 0.8, marginTop: 2 }}>
                  A parent will review and assign someone. You'll see it on your schedule once confirmed.
                </Text>
              </View>
            )}

            {/* ── Submit ── */}
            <TouchableOpacity
              style={[f.submitBtn, { backgroundColor: canSubmit && !saving ? catColor : colors.border, opacity: saving ? 0.7 : 1 }]}
              onPress={submit} disabled={!canSubmit || saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '900' }}>
                    {isKid ? 'Send Request to Parent 🙋' : `Add to Family Schedule ${catEmoji}`}
                  </Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EditEventModal
// ═══════════════════════════════════════════════════════════════════════════════
export function EditEventModal({ event, activeMemberId, onClose, onDelete }: {
  event: FamilyEvent;
  activeMemberId: string;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { updateEvent } = useEventStore();
  const members  = useFamilyStore(s => s.members);
  const siblings = members.map(m => m.name);
  const adults   = members.filter(m => m.role === 'parent' || m.role === 'senior');
  const kids     = members.filter(m => m.role === 'kid');

  const activeMember = members.find(m => m.id === activeMemberId);
  const isParent = activeMember?.role === 'parent';
  const isKid    = activeMember?.role === 'kid';

  // Kids can only edit their own pending requests
  const isOwnPending   = isKid && event.approvalPending && event.memberId === activeMemberId;
  const isParentApproved = !event.approvalPending;
  const restricted     = isKid && isParentApproved; // kid, already approved → read-only

  const [notes,      setNotes]      = useState(event.notes ?? '');
  const [helperName, setHelperName] = useState(event.helper ?? '');
  const [helperId,   setHelperId]   = useState<string | undefined>();
  const [saving,     setSaving]     = useState(false);

  const catColor = CATEGORIES.find(c => c.key === event.category)?.color ?? BRAND.purple;
  const catEmoji = CATEGORIES.find(c => c.key === event.category)?.emoji ?? '📅';

  const handleHelperSelect = (id: string) => {
    const m = members.find(x => x.id === id);
    setHelperId(id);
    setHelperName(m?.name ?? '');
  };

  const save = async () => {
    setSaving(true);
    const patch: Partial<FamilyEvent> = {};
    if (isParent) {
      if (notes !== event.notes) patch.notes = notes.trim() || undefined;
      if (helperName !== event.helper) {
        patch.helper = helperName.trim() || undefined;
        patch.helperStatus = helperName.trim() ? 'pending' : undefined;
      }
    } else if (isOwnPending) {
      // Kid can only update notes on their own pending request
      patch.notes = notes.trim() || undefined;
    }
    if (Object.keys(patch).length > 0) {
      updateEvent(event.id, patch);
    }
    setSaving(false);
    onClose();
  };

  const handleDelete = () => {
    if (restricted) return; // blocked in UI
    Alert.alert(
      isOwnPending ? 'Withdraw Request' : 'Delete Event',
      isOwnPending
        ? `Withdraw your request for "${event.title}"?`
        : `Remove "${event.title}" from the family schedule?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: isOwnPending ? 'Withdraw' : 'Delete', style: 'destructive', onPress: () => { onDelete?.(); onClose(); } },
      ]
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={[f.sheet, { backgroundColor: colors.card }]}
            contentContainerStyle={{ paddingBottom: 48 }}
          >
            <View style={[f.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>
                  {restricted ? 'Event Details' : `Edit ${catEmoji}`}
                </Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: catColor }}>
                  {restricted
                    ? '🔒 Approved — read-only for you'
                    : isOwnPending
                    ? '📝 Your pending request — you can update notes'
                    : `${event.category} · ${isParent ? 'full edit' : 'limited edit'}`}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X c={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Event summary (always shown) */}
            <View style={[f.summaryCard, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: catColor + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{catEmoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{event.title}</Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                    {event.date}{event.time ? ` · ${event.time}` : ''}
                    {event.location ? ` · ${event.location}` : ''}
                  </Text>
                </View>
              </View>

              {/* Category-specific details */}
              <View style={{ marginTop: 10, gap: 4 }}>
                {event.category === 'Medical' && event.doctorName && (
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                    🩺 Doctor: <Text style={{ fontWeight: '700' }}>{event.doctorName}</Text>
                  </Text>
                )}
                {event.category === 'Study' && event.subject && (
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                    📖 Subject: <Text style={{ fontWeight: '700' }}>{event.subject}</Text>
                  </Text>
                )}
                {event.category === 'Sports' && event.coachName && (
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                    🏅 Coach: <Text style={{ fontWeight: '700' }}>{event.coachName}</Text>
                  </Text>
                )}
                {(event.pickupLocation || event.dropLocation) && (
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                    🚗 {event.pickupLocation ?? '?'} → {event.dropLocation ?? '?'}
                  </Text>
                )}
                {event.memberId && (
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                    👤 {event.category === 'Medical' ? 'Patient' : event.category === 'Study' ? 'Student' : 'For'}:{' '}
                    <Text style={{ fontWeight: '700' }}>
                      {members.find(m => m.id === event.memberId)?.name?.split(' ')[0] ?? 'Unknown'}
                    </Text>
                  </Text>
                )}
                {event.helper && (
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                    {event.category === 'Medical' ? '🏥 Accompanied by' :
                     event.category === 'Study'   ? '📚 Tutored by' :
                     event.category === 'Sports'  ? '🚗 Drop-off by' :
                     '🚗 Driven by'}:{' '}
                    <Text style={{ fontWeight: '700', color: event.helperStatus === 'confirmed' ? '#10B981' : event.helperStatus === 'rejected' ? '#EF4444' : '#D97706' }}>
                      {event.helper}
                      {event.helperStatus === 'confirmed' ? ' ✓' : event.helperStatus === 'rejected' ? ' ✕' : ' ⏳'}
                    </Text>
                  </Text>
                )}
              </View>
            </View>

            {/* Editable: helper reassignment (parent only) */}
            {isParent && event.category !== 'Work' && event.category !== 'Event' && (
              <>
                <Text style={[f.sectionLabel, { color: BRAND.purple, marginTop: 16 }]}>Reassign helper</Text>
                <MemberPicker
                  label={
                    event.category === 'Medical' ? '🏥 Accompanied by'   :
                    event.category === 'Study'   ? '📚 Tutored by'       :
                    event.category === 'Sports'  ? '🚗 Drop-off by'      :
                    '🚗 Driven by'
                  }
                  selectedId={helperId ?? members.find(m => m.name === event.helper)?.id}
                  members={adults}
                  onSelect={handleHelperSelect}
                  colors={colors} isDark={isDark} siblings={siblings}
                />
                <TextInput
                  style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, marginTop: -8 }]}
                  placeholder="Or type name (e.g. external tutor)"
                  placeholderTextColor={colors.textTertiary}
                  value={helperName}
                  onChangeText={t => { setHelperName(t); if (!t) setHelperId(undefined); }}
                />
              </>
            )}

            {/* Editable: notes */}
            {!restricted && (
              <>
                <Text style={[f.label, { color: colors.textSecondary, marginTop: 8 }]}>📝 Notes</Text>
                <TextInput
                  style={[f.input, f.multiInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="Add or update notes…"
                  placeholderTextColor={colors.textTertiary}
                  value={notes} onChangeText={t => setNotes(t.slice(0, 200))}
                  multiline numberOfLines={3} textAlignVertical="top"
                />
              </>
            )}

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              {/* Delete / Withdraw — shown when: parent (any event) OR kid (own pending) */}
              {(isParent || isOwnPending) && onDelete && (
                <TouchableOpacity
                  style={{ paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
                    borderWidth: 1, borderColor: '#FCA5A560', backgroundColor: isDark ? '#2D1515' : '#FEF2F2' }}
                  onPress={handleDelete}
                >
                  <X c="#EF4444" size={16} />
                </TouchableOpacity>
              )}
              {!restricted && (
                <TouchableOpacity
                  style={[f.submitBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]}
                  onPress={save} disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '900' }}>Save Changes</Text>}
                </TouchableOpacity>
              )}
              {restricted && (
                <TouchableOpacity style={[f.submitBtn, { flex: 1, backgroundColor: colors.surface }]} onPress={onClose}>
                  <Text style={{ color: colors.textSecondary, fontSize: TYPO.caption, fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              )}
            </View>

            {restricted && (
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center', marginTop: 12 }}>
                This event was approved by a parent. Ask a parent to make changes.
              </Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const f = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%' },
  handle:      { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:       { fontSize: 17, fontWeight: '900' },
  label:       { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
  sectionLabel:{ fontSize: TYPO.caption, fontWeight: '900', letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },
  input:       { borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, marginBottom: 10 },
  multiInput:  { minHeight: 72, textAlignVertical: 'top' },
  dateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  suggPill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 180 },
  kidNote:     { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  submitBtn:   { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
                 flexDirection: 'row', gap: 8, backgroundColor: BRAND.purple },
  summaryCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 8 },
});
