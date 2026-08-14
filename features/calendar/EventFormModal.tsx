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

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Modal, KeyboardAvoidingView, Platform, StyleSheet, Alert,
  Switch, ActivityIndicator, Pressable,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType, HelperStatus } from '@/store/eventStore';
import { useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_ITEMS, DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
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

// ─── Category definitions ──────────────────────────────────────────────────────
export type EventCategory = 'Medical' | 'Sports' | 'Study' | 'Ride' | 'Work' | 'Event' | 'Birthday' | 'Errand' | 'Other';

const CATEGORIES: { key: EventCategory; emoji: string; label: string; color: string }[] = [
  { key: 'Medical',  emoji: '🏥', label: 'Medical',  color: '#EF4444' },
  { key: 'Sports',   emoji: '🏅', label: 'Sports',   color: '#F59E0B' },
  { key: 'Study',    emoji: '📚', label: 'Study',    color: '#3B82F6' },
  { key: 'Ride',     emoji: '🚗', label: 'Ride',     color: '#10B981' },
  { key: 'Work',     emoji: '💼', label: 'Work',     color: '#A855F7' },
  { key: 'Event',    emoji: '🎉', label: 'Event',    color: '#6C5CE7' },
  { key: 'Birthday', emoji: '🎂', label: 'Birthday', color: '#F59E0B' },
  { key: 'Errand',   emoji: '🛒', label: 'Errand',   color: '#0EA5E9' },
  { key: 'Other',    emoji: '✨', label: 'Other',    color: '#64748B' },
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
  Errand: [
    { title: 'Grocery run',           hint: '🛒 Supermarket' },
    { title: 'Shopping trip',         hint: '🛍️ Mall / stores' },
    { title: 'Pharmacy pickup',       hint: '💊 Medicines' },
    { title: 'Bank errand',           hint: '🏦 Branch visit' },
    { title: 'Post office run',       hint: '📮 Drop / collect' },
    { title: 'Car service drop-off',  hint: '🔧 Garage' },
  ],
  Other: [],
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
      <Text style={{ fontSize: small ? TYPO.micro : TYPO.label, fontWeight: '700', color: active ? color : colors.textSecondary }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Multi-select member picker ────────────────────────────────────────────────
function MemberPicker({ label, selectedIds, members, onToggle, onSelectAll, colors, isDark, siblings }: {
  label: string; selectedIds: string[];
  members: any[]; onToggle: (id: string) => void; onSelectAll?: () => void;
  colors: any; isDark: boolean; siblings: string[];
}) {
  const allSelected = members.length > 0 && members.every(m => selectedIds.includes(m.id));
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={[f.label, { color: colors.textSecondary }]}>{label}</Text>
        {onSelectAll && members.length > 1 && (
          <TouchableOpacity onPress={onSelectAll}
            style={{ backgroundColor: allSelected ? BRAND.purple + '22' : (isDark ? '#1E293B' : '#F1F5F9'), borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: allSelected ? BRAND.purple : (isDark ? '#334155' : '#E2E8F0') }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: allSelected ? BRAND.purple : colors.textTertiary }}>
              {allSelected ? '✓ All' : 'All'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 12 }}>
        {members.map(m => {
          const sel = selectedIds.includes(m.id);
          return (
            <TouchableOpacity key={m.id} style={{ alignItems: 'center', gap: 4 }} onPress={() => onToggle(m.id)}>
              <View style={{ position: 'relative' }}>
                <FamilyAvatar
                  name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl}
                  siblings={siblings} size={44}
                  ringColor={sel ? BRAND.purple : (isDark ? '#64748B' : '#94A3B8')}
                  ringWidth={sel ? 2.5 : 0}
                  bgColor={sel ? BRAND.purple + '20' : (isDark ? '#1E293B' : '#F1F5F9')}
                />
                {sel && (
                  <View style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center' }}>
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

// ─── Family-specific custom categories/suggestions — backed by DB ─────────────
import { fetchCustomSuggestions, recordCustomSuggestion, fetchCustomCategories, CustomCategory } from '@/lib/familyCustomCategories';

// ═══════════════════════════════════════════════════════════════════════════════
// AddEventModal
// ═══════════════════════════════════════════════════════════════════════════════
export function AddEventModal({ visible, onClose, activeMemberId }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
}) {
  const { colors, isDark } = useTheme();
  const { addEvent } = useEventStore();
  const members = useFamilyStore(s => s.members);
  const { pastStores: cachedStores, pastItemNames: cachedItemNames, appendToCache } = useGroceryStore();
  const siblings = members.map(m => m.name);

  const activeMember = members.find(m => m.id === activeMemberId);
  const isParent  = activeMember?.role === 'parent';
  const isSenior  = activeMember?.role === 'senior';
  const isKid     = activeMember?.role === 'kid';

  // Kids can only request Ride or Study (allCategories computed after state is declared below)

  // ── State ──────────────────────────────────────────────────────────────────
  const [category,       setCategory]       = useState<EventCategory>(isKid ? 'Ride' : 'Medical');
  const [title,          setTitle]          = useState('');
  const [titleFocused,   setTitleFocused]   = useState(false);
  const [notes,          setNotes]          = useState('');
  const [saving,         setSaving]         = useState(false);

  // Date/time
  const nowRounded = () => { const d = new Date(); const m = d.getMinutes(); d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1); return d; };
  const [eventDate,      setEventDate]      = useState<Date>(nowRounded());
  const [showDatePick,   setShowDatePick]   = useState(false);
  const [showTimePick,   setShowTimePick]   = useState(false);
  const [allDay,         setAllDay]         = useState(false);

  // Category-specific
  const [memberIds,      setMemberIds]      = useState<string[]>(isKid ? [activeMemberId] : []);
  const [helperId,       setHelperId]       = useState<string | undefined>();
  const [helperName,     setHelperName]     = useState('');
  const [doctorName,     setDoctorName]     = useState('');
  const [clinicLocation, setClinicLocation] = useState('');
  const [apptType,       setApptType]       = useState('');
  const [sportType,      setSportType]      = useState('');
  const [coachName,      setCoachName]      = useState('');
  const [venueLocation,  setVenueLocation]  = useState('');
  const [returnDate,     setReturnDate]     = useState<Date | null>(null);
  const [showReturnDatePick, setShowReturnDatePick] = useState(false);
  const [showReturnTimePick, setShowReturnTimePick] = useState(false);
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
  const [customSuggestions,  setCustomSuggestions]  = useState<{ title: string; hint: string }[]>([]);
  const [customCategories,   setCustomCategories]   = useState<CustomCategory[]>([]);

  // Grocery run attachment (Errand category)
  const [linkGroceries,      setLinkGroceries]      = useState(false);
  const [groceryItems,       setGroceryItems]        = useState<{ id: string; name: string; quantity?: string; category?: string; storePreference?: string }[]>([]);
  const [selectedItemIds,    setSelectedItemIds]    = useState<Set<string>>(new Set());
  const [loadingGroceries,   setLoadingGroceries]   = useState(false);
  const [newGroceryLines,    setNewGroceryLines]    = useState<{ name: string; qty: string; store: string }[]>([]);
  const [focusedLineIdx,     setFocusedLineIdx]     = useState<number | null>(null);
  const [focusedField,       setFocusedField]       = useState<'name' | 'store' | null>(null);

  const familyId = activeMember?.familyId ?? '';

  useEffect(() => {
    if (!familyId) return;
    fetchCustomCategories(familyId, 'event').then(setCustomCategories);
  }, [familyId]);

  useEffect(() => {
    if (!familyId || category !== 'Other') return;
    fetchCustomSuggestions(familyId, 'event', 'Other').then(setCustomSuggestions);
  }, [familyId, category]);

  useEffect(() => {
    if (!linkGroceries || !familyId) return;
    setLoadingGroceries(true);
    supabase.from('grocery_items')
      .select('id, name, quantity, category, store_preference')
      .eq('family_id', familyId).eq('is_bought', false).order('category')
      .then(({ data }) => {
        setGroceryItems((data ?? []).map((r: any) => ({
          id: r.id, name: r.name, quantity: r.quantity ?? undefined,
          category: r.category ?? undefined, storePreference: r.store_preference ?? undefined,
        })));
        setLoadingGroceries(false);
      });
  }, [linkGroceries, familyId]);

  // Merge system + family custom categories (after state is declared)
  const allCategories = [
    ...CATEGORIES,
    ...customCategories
      .filter(cc => !CATEGORIES.some(sc => sc.key === cc.key))
      .map(cc => ({ key: cc.key as EventCategory, emoji: cc.emoji, label: cc.label, color: cc.color })),
  ];
  const allowedCategories = isKid
    ? allCategories.filter(c => c.key === 'Ride' || c.key === 'Study')
    : allCategories;

  const suggPressing = useRef(false);

  // ── Suggestions ────────────────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    const base = SUGGESTIONS[category] ?? [];
    const pool = category === 'Other' ? customSuggestions : base;
    if (!title.trim()) return pool.slice(0, 6);
    const q = title.toLowerCase();
    return pool.filter(s => s.title.toLowerCase().includes(q)).slice(0, 6);
  }, [category, title, customSuggestions]);

  const applySuggestion = (s: { title: string }) => {
    suggPressing.current = false;
    setTitle(s.title);
    setTitleFocused(false);
  };

  // ── Member pickers ─────────────────────────────────────────────────────────
  const kids   = members.filter(m => m.role === 'kid');
  const adults = members.filter(m => m.role === 'parent' || m.role === 'senior');
  // Show all family members in "For" picker; exclude the selected helper so one person isn't in both roles
  const forMembers = members.filter(m => m.id !== helperId);

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
    setTitle(''); setNotes(''); setEventDate(nowRounded()); setAllDay(false);
    setMemberIds(isKid ? [activeMemberId] : []);
    setHelperId(undefined); setHelperName('');
    setDoctorName(''); setClinicLocation(''); setApptType('');
    setSportType(''); setCoachName(''); setVenueLocation(''); setKitReminder(false);
    setSubject(''); setTutorName(''); setIsOnline(false); setMeetingUrl('');
    setPickupLocation(''); setDropLocation(''); setReturnDate(null);
    setWorkType(''); setWorkLocation(''); setGeneralLocation('');
    setShowDatePick(false); setShowTimePick(false);
    setShowReturnDatePick(false); setShowReturnTimePick(false);
    setLinkGroceries(false); setGroceryItems([]); setSelectedItemIds(new Set()); setNewGroceryLines([]);
    setFocusedLineIdx(null); setFocusedField(null);
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
      memberId:        memberIds[0],
      memberIds:       memberIds.length > 1 ? memberIds : undefined,
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
      returnTime:      returnDate ? fmtTimeDisplay(returnDate) : undefined,
      // Approval flow
      approvalPending: isKid, // kids' requests go to parent approval
      conflict:        false,
      color:           CATEGORIES.find(c => c.key === category)?.color,
    });

    // Persist custom title so it appears in future suggestions for this family
    if (category === 'Other' && finalTitle && familyId) {
      recordCustomSuggestion(familyId, 'event', 'Other', finalTitle);
    }

    // Create grocery run(s) when items are selected or new items typed
    if (category === 'Errand' && linkGroceries && familyId) {
      const hasExisting = selectedItemIds.size > 0;
      const validNewLines = newGroceryLines.filter(l => l.name.trim());
      if (hasExisting || validNewLines.length > 0) {
        try {
          // Insert new items to grocery_items first, collect their IDs
          const newItemsByStore: Record<string, string[]> = {};
          for (const line of validNewLines) {
            const store = line.store.trim() || 'Any store';
            const { data: inserted } = await supabase
              .from('grocery_items')
              .insert({ family_id: familyId, name: line.name.trim(), quantity: line.qty.trim() || null, store_preference: line.store.trim() || null, added_by: activeMemberId ?? '', is_bought: false, ai_generated: false })
              .select('id')
              .single();
            if (inserted?.id) {
              if (!newItemsByStore[store]) newItemsByStore[store] = [];
              newItemsByStore[store].push(inserted.id);
            }
          }

          // Group existing selected items by store
          const existingByStore: Record<string, string[]> = {};
          for (const id of selectedItemIds) {
            const item = groceryItems.find(i => i.id === id);
            const store = item?.storePreference || 'Any store';
            if (!existingByStore[store]) existingByStore[store] = [];
            existingByStore[store].push(id);
          }

          // Merge all stores
          const allStores = new Set([...Object.keys(existingByStore), ...Object.keys(newItemsByStore)]);

          // Create one run per store
          for (const store of allStores) {
            const itemIds = [...(existingByStore[store] ?? []), ...(newItemsByStore[store] ?? [])];
            if (itemIds.length === 0) continue;
            const { data: runRow, error: runErr } = await supabase
              .from('grocery_runs')
              .insert({
                family_id:  familyId,
                name:       finalTitle,
                store:      store === 'Any store' ? (generalLocation.trim() || 'Store') : store,
                status:     'draft',
                created_by: activeMemberId ?? '',
                planned_at: localDateStr(eventDate),
              })
              .select('id')
              .single();
            if (!runErr && runRow?.id) {
              const rows = itemIds.map(itemId => ({ run_id: runRow.id, item_id: itemId, checked_in_run: false }));
              await supabase.from('grocery_run_items').insert(rows);
            }
          }
          // Update local cache immediately so next form open has suggestions
          const newNames  = validNewLines.map(l => l.name.trim()).filter(Boolean);
          const newStores = [...allStores].filter(s => s !== 'Any store');
          if (newNames.length || newStores.length) appendToCache(newNames, newStores);
        } catch (e: any) {
          console.warn('[EventFormModal] grocery run creation failed', e?.message);
        }
      }
    }

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
          <View style={[f.sheet, { backgroundColor: colors.card }]}>
            {/* Drag handle */}
            <View style={[f.handle, { backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }]} />

            {/* ── Fixed header ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
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

            {/* ── Scrollable form fields (category included) ── */}
            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}
            >
            {/* ── Category selector ── */}
            <Text style={[f.label, { color: colors.textSecondary, marginBottom: 6 }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
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
                      <Text style={{ fontSize: 20, opacity: active ? 1 : 0.6 }}>{c.emoji}</Text>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: active ? c.color : colors.textSecondary }}>
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
              onBlur={() => setTitleFocused(false)}
              returnKeyType="next"
            />
            {/* Suggestions */}
            {suggestions.length > 0 && (
              <View style={{ marginTop: -8, marginBottom: 14 }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 6, fontWeight: '600' }}>
                  {title.trim() ? 'Matching — tap to fill' : 'Quick picks'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {suggestions.map((s, i) => (
                      <TouchableOpacity
                        key={i}
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
            <Text style={[f.label, { color: colors.textSecondary }]}>Date & Time</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <TouchableOpacity
                style={[f.dateBtn, { flex: 3, backgroundColor: showDatePick ? catColor + '20' : colors.surface, borderColor: showDatePick ? catColor : colors.border }]}
                onPress={() => { setShowDatePick(p => !p); setShowTimePick(false); }}
              >
                <Text style={{ fontSize: 13 }}>📅</Text>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showDatePick ? catColor : colors.textPrimary }}>
                  {fmtDisplay(eventDate)}
                </Text>
              </TouchableOpacity>
              {!allDay && (
                <TouchableOpacity
                  style={[f.dateBtn, { flex: 2, backgroundColor: showTimePick ? catColor + '20' : colors.surface, borderColor: showTimePick ? catColor : colors.border }]}
                  onPress={() => { setShowTimePick(p => !p); setShowDatePick(false); }}
                >
                  <Text style={{ fontSize: 13 }}>🕐</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showTimePick ? catColor : colors.textPrimary }}>
                    {fmtTimeDisplay(eventDate)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Picker overlay — floats above form, no layout shift */}
            {(showDatePick || showTimePick) && (
              <Modal transparent animationType="fade" visible onRequestClose={() => { setShowDatePick(false); setShowTimePick(false); }}>
                <TouchableOpacity style={f.pickerOverlay} activeOpacity={1} onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                  <TouchableOpacity activeOpacity={1} style={[f.pickerCard, { backgroundColor: colors.card }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>
                        {showDatePick ? '📅 Pick a Date' : '🕐 Pick a Time'}
                      </Text>
                      <TouchableOpacity onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                        <Text style={{ color: catColor, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    {showDatePick && (
                      <DateTimePicker
                        value={eventDate} mode="date" display="spinner"
                        minimumDate={new Date()}
                        onChange={(_, d) => { if (d) { const m = new Date(d); m.setHours(eventDate.getHours(), eventDate.getMinutes()); setEventDate(m); } }}
                        textColor={colors.textPrimary}
                        style={{ height: 180, width: '100%' }}
                      />
                    )}
                    {showTimePick && (
                      <DateTimePicker
                        value={eventDate} mode="time" display="spinner"
                        is24Hour={false}
                        onChange={(_, d) => { if (d) { const m = new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setEventDate(m); } }}
                        textColor={colors.textPrimary}
                        style={{ height: 180, width: '100%' }}
                      />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            )}

            {/* All day toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>All day</Text>
              <Switch
                value={allDay} onValueChange={setAllDay}
                trackColor={{ false: colors.border, true: catColor + '80' }}
                thumbColor={allDay ? catColor : colors.textTertiary}
              />
            </View>

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

                <Text style={[f.label, { color: colors.textSecondary }]}>📍 Pickup from</Text>
                <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="Home / School" placeholderTextColor={colors.textTertiary}
                  value={pickupLocation} onChangeText={setPickupLocation} />

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
                    {/* External tutor + in-person → show drop & pickup */}
                    {!helperId && tutorName.trim().length > 0 && (
                      <>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={[f.label, { color: colors.textSecondary }]}>📍 Pickup from</Text>
                            <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                              placeholder="Home / School" placeholderTextColor={colors.textTertiary}
                              value={pickupLocation} onChangeText={setPickupLocation} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[f.label, { color: colors.textSecondary }]}>🏁 Drop to</Text>
                            <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                              placeholder="Tutor's place / Library" placeholderTextColor={colors.textTertiary}
                              value={dropLocation} onChangeText={setDropLocation} />
                          </View>
                        </View>
                        <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Return pickup (optional)</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                          <TouchableOpacity
                            style={[f.dateBtn, { flex: 3, backgroundColor: showReturnDatePick ? catColor + '20' : colors.surface, borderColor: showReturnDatePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                            onPress={() => { setShowReturnDatePick(p => !p); setShowReturnTimePick(false); setShowDatePick(false); setShowTimePick(false); }}
                          >
                            <Text style={{ fontSize: 13 }}>📅</Text>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnDatePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                              {returnDate ? fmtDisplay(returnDate) : 'Return date'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[f.dateBtn, { flex: 2, backgroundColor: showReturnTimePick ? catColor + '20' : colors.surface, borderColor: showReturnTimePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                            onPress={() => { setShowReturnTimePick(p => !p); setShowReturnDatePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
                          >
                            <Text style={{ fontSize: 13 }}>🕐</Text>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnTimePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                              {returnDate ? fmtTimeDisplay(returnDate) : 'Time'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
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
                <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Return pickup (optional)</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <TouchableOpacity
                    style={[f.dateBtn, { flex: 3, backgroundColor: showReturnDatePick ? catColor + '20' : colors.surface, borderColor: showReturnDatePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                    onPress={() => { setShowReturnDatePick(p => !p); setShowReturnTimePick(false); setShowDatePick(false); setShowTimePick(false); }}
                  >
                    <Text style={{ fontSize: 13 }}>📅</Text>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnDatePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                      {returnDate ? fmtDisplay(returnDate) : 'Return date'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[f.dateBtn, { flex: 2, backgroundColor: showReturnTimePick ? catColor + '20' : colors.surface, borderColor: showReturnTimePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                    onPress={() => { setShowReturnTimePick(p => !p); setShowReturnDatePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
                  >
                    <Text style={{ fontSize: 13 }}>🕐</Text>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnTimePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                      {returnDate ? fmtTimeDisplay(returnDate) : 'Time'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {(showReturnDatePick || showReturnTimePick) && (
                  <Modal transparent animationType="fade" visible onRequestClose={() => { setShowReturnDatePick(false); setShowReturnTimePick(false); }}>
                    <TouchableOpacity style={f.pickerOverlay} activeOpacity={1} onPress={() => { setShowReturnDatePick(false); setShowReturnTimePick(false); }}>
                      <TouchableOpacity activeOpacity={1} style={[f.pickerCard, { backgroundColor: colors.card }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>
                            {showReturnDatePick ? '📅 Return Date' : '🕐 Return Time'}
                          </Text>
                          <TouchableOpacity onPress={() => { setShowReturnDatePick(false); setShowReturnTimePick(false); }}>
                            <Text style={{ color: catColor, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
                          </TouchableOpacity>
                        </View>
                        {showReturnDatePick && (
                          <DateTimePicker
                            value={returnDate ?? eventDate}
                            mode="date" display="spinner"
                            minimumDate={new Date()}
                            onChange={(_, d) => { if (d) { const m = returnDate ? new Date(returnDate) : new Date(eventDate); m.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setReturnDate(m); } }}
                            textColor={colors.textPrimary}
                            style={{ height: 180, width: '100%' }}
                          />
                        )}
                        {showReturnTimePick && (
                          <DateTimePicker
                            value={returnDate ?? eventDate}
                            mode="time" display="spinner" is24Hour={false}
                            onChange={(_, d) => { if (d) { const m = returnDate ? new Date(returnDate) : new Date(eventDate); m.setHours(d.getHours(), d.getMinutes()); setReturnDate(m); } }}
                            textColor={colors.textPrimary}
                            style={{ height: 180, width: '100%' }}
                          />
                        )}
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </Modal>
                )}
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
                <Text style={[f.sectionLabel, { color: catColor }]}>
                  {category === 'Birthday' ? '🎂 Party details' : '🎉 Event details'}
                </Text>
                <Text style={[f.label, { color: colors.textSecondary }]}>📍 Location</Text>
                <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder={category === 'Birthday' ? "Friend's house / venue" : 'Living Room / Park / Restaurant'}
                  placeholderTextColor={colors.textTertiary}
                  value={generalLocation} onChangeText={setGeneralLocation} />
                {category === 'Birthday' && (
                  <>
                    <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Return pickup (optional)</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                      <TouchableOpacity
                        style={[f.dateBtn, { flex: 3, backgroundColor: showReturnDatePick ? catColor + '20' : colors.surface, borderColor: showReturnDatePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                        onPress={() => { setShowReturnDatePick(p => !p); setShowReturnTimePick(false); setShowDatePick(false); setShowTimePick(false); }}
                      >
                        <Text style={{ fontSize: 13 }}>📅</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnDatePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                          {returnDate ? fmtDisplay(returnDate) : 'Pickup date'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[f.dateBtn, { flex: 2, backgroundColor: showReturnTimePick ? catColor + '20' : colors.surface, borderColor: showReturnTimePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                        onPress={() => { setShowReturnTimePick(p => !p); setShowReturnDatePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
                      >
                        <Text style={{ fontSize: 13 }}>🕐</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnTimePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                          {returnDate ? fmtTimeDisplay(returnDate) : 'Time'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </>
            )}

            {/* ── ERRAND fields ── */}
            {category === 'Errand' && (
              <>
                <Text style={[f.sectionLabel, { color: catColor }]}>🛒 Errand details</Text>
                <Text style={[f.label, { color: colors.textSecondary }]}>📍 Where</Text>
                <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="Supermarket / Mall / Pharmacy" placeholderTextColor={colors.textTertiary}
                  value={generalLocation} onChangeText={setGeneralLocation} />
                <Text style={[f.label, { color: colors.textSecondary }]}>🔁 Expected return (optional)</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <TouchableOpacity
                    style={[f.dateBtn, { flex: 3, backgroundColor: showReturnDatePick ? catColor + '20' : colors.surface, borderColor: showReturnDatePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                    onPress={() => { setShowReturnDatePick(p => !p); setShowReturnTimePick(false); setShowDatePick(false); setShowTimePick(false); }}
                  >
                    <Text style={{ fontSize: 13 }}>📅</Text>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnDatePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                      {returnDate ? fmtDisplay(returnDate) : 'Return date'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[f.dateBtn, { flex: 2, backgroundColor: showReturnTimePick ? catColor + '20' : colors.surface, borderColor: showReturnTimePick ? catColor : (returnDate ? catColor + '80' : colors.border) }]}
                    onPress={() => { setShowReturnTimePick(p => !p); setShowReturnDatePick(false); setShowDatePick(false); setShowTimePick(false); if (!returnDate) setReturnDate(new Date(eventDate)); }}
                  >
                    <Text style={{ fontSize: 13 }}>🕐</Text>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: showReturnTimePick ? catColor : (returnDate ? colors.textPrimary : colors.textTertiary) }}>
                      {returnDate ? fmtTimeDisplay(returnDate) : 'Time'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ── Link grocery list ── */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={[f.label, { color: colors.textSecondary, marginBottom: 0 }]}>🛍️ Attach grocery list</Text>
                  <Switch
                    value={linkGroceries}
                    onValueChange={setLinkGroceries}
                    trackColor={{ false: colors.border, true: catColor + '80' }}
                    thumbColor={linkGroceries ? catColor : colors.textTertiary}
                  />
                </View>

                {linkGroceries && (
                  <>
                    {/* ── Existing pending items ── */}
                    {loadingGroceries ? (
                      <ActivityIndicator color={catColor} style={{ marginVertical: 8 }} />
                    ) : groceryItems.length > 0 ? (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                            From your list
                          </Text>
                          <Pressable onPress={() => {
                            if (selectedItemIds.size === groceryItems.length) setSelectedItemIds(new Set());
                            else setSelectedItemIds(new Set(groceryItems.map(i => i.id)));
                          }}>
                            <Text style={{ fontSize: 12, color: catColor, fontWeight: '700' }}>
                              {selectedItemIds.size === groceryItems.length ? 'Deselect all' : 'Select all'}
                            </Text>
                          </Pressable>
                        </View>
                        {(() => {
                          const groups: Record<string, typeof groceryItems> = {};
                          for (const item of groceryItems) {
                            const key = item.storePreference || 'Any store';
                            if (!groups[key]) groups[key] = [];
                            groups[key].push(item);
                          }
                          return Object.entries(groups)
                            .sort(([a], [b]) => a === 'Any store' ? 1 : b === 'Any store' ? -1 : a.localeCompare(b))
                            .map(([store, items]) => {
                              const storeSelected = items.every(i => selectedItemIds.has(i.id));
                              const storePartial  = !storeSelected && items.some(i => selectedItemIds.has(i.id));
                              return (
                                <View key={store} style={{ marginBottom: 10 }}>
                                  <Pressable
                                    onPress={() => {
                                      const next = new Set(selectedItemIds);
                                      if (storeSelected) items.forEach(i => next.delete(i.id));
                                      else items.forEach(i => next.add(i.id));
                                      setSelectedItemIds(next);
                                    }}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                                      backgroundColor: storeSelected ? catColor + '15' : (storePartial ? catColor + '08' : isDark ? '#252540' : '#F3F4F6'),
                                      borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 3,
                                      borderWidth: 1, borderColor: storeSelected ? catColor + '60' : (storePartial ? catColor + '30' : colors.border) }}
                                  >
                                    <Text style={{ fontSize: 14 }}>🏪</Text>
                                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: storeSelected ? catColor : colors.textPrimary }}>{store}</Text>
                                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                                      {items.filter(i => selectedItemIds.has(i.id)).length}/{items.length}
                                    </Text>
                                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                                      borderColor: (storeSelected || storePartial) ? catColor : colors.border,
                                      backgroundColor: storeSelected ? catColor : 'transparent',
                                      alignItems: 'center', justifyContent: 'center' }}>
                                      {storeSelected && <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>✓</Text>}
                                      {storePartial && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: catColor }} />}
                                    </View>
                                  </Pressable>
                                  {items.map(item => {
                                    const selected = selectedItemIds.has(item.id);
                                    return (
                                      <Pressable
                                        key={item.id}
                                        onPress={() => {
                                          const next = new Set(selectedItemIds);
                                          selected ? next.delete(item.id) : next.add(item.id);
                                          setSelectedItemIds(next);
                                        }}
                                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12,
                                          paddingLeft: 26, backgroundColor: selected ? catColor + '10' : colors.surface,
                                          borderRadius: 8, marginBottom: 2,
                                          borderWidth: 1, borderColor: selected ? catColor + '40' : colors.border }}
                                      >
                                        <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                                          borderColor: selected ? catColor : colors.border,
                                          backgroundColor: selected ? catColor : 'transparent',
                                          alignItems: 'center', justifyContent: 'center', marginRight: 9 }}>
                                          {selected && <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900' }}>✓</Text>}
                                        </View>
                                        <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: selected ? '600' : '400' }}>{item.name}</Text>
                                        {item.quantity ? <Text style={{ fontSize: 11, color: colors.textSecondary }}>{item.quantity}</Text> : null}
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              );
                            });
                        })()}
                      </>
                    ) : null}

                    {/* ── New items typed inline ── */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: groceryItems.length > 0 ? 10 : 0, marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        Add new items
                      </Text>
                      <Pressable onPress={() => setNewGroceryLines(prev => [...prev, { name: '', qty: '', store: generalLocation.trim() || '' }])}
                        style={{ backgroundColor: catColor, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>+ Add item</Text>
                      </Pressable>
                    </View>
                    {newGroceryLines.length === 0 ? (
                      <Pressable onPress={() => setNewGroceryLines([{ name: '', qty: '', store: generalLocation.trim() || '' }])}
                        style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: catColor + '60', borderRadius: 10,
                          paddingVertical: 12, alignItems: 'center' }}>
                        <Text style={{ color: catColor, fontSize: 13 }}>+ Tap to add grocery items</Text>
                      </Pressable>
                    ) : (
                      newGroceryLines.map((line, idx) => {
                        const allItemPool = [...new Set([...cachedItemNames, ...DEFAULT_GROCERY_ITEMS])];
                        const allStorePool = [...new Set([...cachedStores, ...DEFAULT_GROCERY_STORES])];
                        const nameSuggs = line.name.trim().length > 0
                          ? allItemPool.filter(n => n.toLowerCase().includes(line.name.toLowerCase()) && n.toLowerCase() !== line.name.toLowerCase()).slice(0, 6)
                          : [];
                        const storeSuggs = line.store.trim().length === 0
                          ? allStorePool.slice(0, 6)
                          : allStorePool.filter(s => s.toLowerCase().includes(line.store.toLowerCase()) && s.toLowerCase() !== line.store.toLowerCase()).slice(0, 6);
                        const showNameSuggs  = focusedLineIdx === idx && focusedField === 'name'  && nameSuggs.length > 0;
                        const showStoreSuggs = focusedLineIdx === idx && focusedField === 'store' && storeSuggs.length > 0;

                        return (
                          <View key={idx} style={{ marginBottom: 8 }}>
                            {/* Row 1: name + qty + delete */}
                            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                              <TextInput
                                style={[f.input, { flex: 2.5, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: focusedLineIdx === idx && focusedField === 'name' ? catColor : colors.border, marginBottom: 0 }]}
                                placeholder="Item name" placeholderTextColor={colors.textTertiary}
                                value={line.name}
                                onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, name: v } : l))}
                                onFocus={() => { setFocusedLineIdx(idx); setFocusedField('name'); }}
                                onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                              />
                              <TextInput
                                style={[f.input, { flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 0 }]}
                                placeholder="Qty" placeholderTextColor={colors.textTertiary}
                                value={line.qty}
                                onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: v } : l))}
                              />
                              <Pressable onPress={() => setNewGroceryLines(prev => prev.filter((_, i) => i !== idx))} style={{ padding: 6 }}>
                                <X c={colors.textTertiary} size={16} />
                              </Pressable>
                            </View>
                            {/* Name suggestions */}
                            {showNameSuggs && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginBottom: 4 }}>
                                {nameSuggs.map(s => (
                                  <Pressable key={s} onPress={() => { setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, name: s } : l)); setFocusedField(null); }}
                                    style={{ backgroundColor: catColor + '15', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginRight: 6, borderWidth: 1, borderColor: catColor + '40' }}>
                                    <Text style={{ fontSize: 12, color: catColor, fontWeight: '600' }}>{s}</Text>
                                  </Pressable>
                                ))}
                              </ScrollView>
                            )}
                            {/* Row 2: store field */}
                            <TextInput
                              style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: focusedLineIdx === idx && focusedField === 'store' ? catColor : colors.border, marginBottom: 0 }]}
                              placeholder="🏪 Store (e.g. Walmart, Costco)" placeholderTextColor={colors.textTertiary}
                              value={line.store}
                              onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, store: v } : l))}
                              onFocus={() => { setFocusedLineIdx(idx); setFocusedField('store'); }}
                              onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                            />
                            {/* Store suggestions */}
                            {showStoreSuggs && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginTop: 4 }}>
                                {storeSuggs.map(s => (
                                  <Pressable key={s} onPress={() => { setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, store: s } : l)); setFocusedField(null); }}
                                    style={{ backgroundColor: isDark ? '#252540' : '#F3F4F6', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginRight: 6, borderWidth: 1, borderColor: colors.border }}>
                                    <Text style={{ fontSize: 12, color: colors.textPrimary }}>🏪 {s}</Text>
                                  </Pressable>
                                ))}
                              </ScrollView>
                            )}
                          </View>
                        );
                      })
                    )}
                  </>
                )}
              </>
            )}

            {/* ── OTHER fields ── */}
            {category === 'Other' && (
              <>
                <Text style={[f.sectionLabel, { color: catColor }]}>✨ Custom event</Text>
                <Text style={[f.label, { color: colors.textSecondary }]}>📍 Location (optional)</Text>
                <TextInput style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="Where is this happening?" placeholderTextColor={colors.textTertiary}
                  value={generalLocation} onChangeText={setGeneralLocation} />
              </>
            )}

            {/* ── For (member picker — multi-select) ── */}
            {category !== 'Event' && !isKid && (
              <MemberPicker
                label={
                  category === 'Medical'  ? 'Patient — select all who attend' :
                  category === 'Sports'   ? 'Player — select participants' :
                  category === 'Study'    ? 'Student — select all studying' :
                  category === 'Ride'     ? 'Passenger(s)' :
                  category === 'Birthday' ? '🎂 Who\'s attending?' :
                  category === 'Other'    ? '👤 For (optional)' :
                  'For'
                }
                selectedIds={memberIds}
                members={forMembers}
                onToggle={id => setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                onSelectAll={() => {
                  const allIds = forMembers.map(m => m.id);
                  setMemberIds(memberIds.length === forMembers.length ? [] : allIds);
                }}
                colors={colors} isDark={isDark} siblings={siblings}
              />
            )}

            {/* ── Helper assignment (parent only; kid sees "Parent will assign") ── */}
            {category !== 'Work' && category !== 'Event' && (
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
                      category === 'Medical'  ? '🏥 Accompanied by (adult)' :
                      category === 'Study'    ? '📚 Tutored by (pick from family or type name)' :
                      category === 'Sports'   ? '🚗 Drop-off by (adult)' :
                      category === 'Birthday' ? '🚗 Driven by / accompanying' :
                      '🚗 Driven by (adult)'
                    }
                    selectedIds={helperId ? [helperId] : []}
                    members={adults}
                    onToggle={handleHelperSelect}
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
  const isPast   = (() => {
    if (!event.date) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (event.date < today) return true;
    if (event.date > today) return false;
    // Same day — compare time
    if (!event.time) return false;
    const [h, m] = event.time.split(':').map(Number);
    const now = new Date();
    return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
  })();

  // Kids can only edit their own pending requests
  const isOwnPending   = isKid && event.approvalPending && event.memberId === activeMemberId;
  const isParentApproved = !event.approvalPending;
  const restricted     = isPast || (isKid && isParentApproved); // past or kid approved → read-only

  const [notes,      setNotes]      = useState(event.notes ?? '');
  const [helperName, setHelperName] = useState('');
  const [helperId,   setHelperId]   = useState<string | undefined>(
    members.find((m: any) => m.name === event.helper)?.id
  );
  const [editMemberIds, setEditMemberIds] = useState<string[]>(
    event.memberIds?.length ? event.memberIds : event.memberId ? [event.memberId] : []
  );
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
      const origIds = event.memberIds?.length ? event.memberIds : event.memberId ? [event.memberId] : [];
      if (JSON.stringify(editMemberIds) !== JSON.stringify(origIds)) {
        patch.memberIds = editMemberIds.length > 1 ? editMemberIds : undefined;
        patch.memberId  = editMemberIds[0];
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

          {/* Sheet — header outside scroll, content scrolls */}
          <View style={[f.sheet, { backgroundColor: colors.card }]}>
            {/* Drag handle */}
            <View style={[f.handle, { backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }]} />

            {/* ── Fixed header (never scrolls) ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: catColor + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>{catEmoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>{event.title}</Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                  {event.date}{event.time ? ` · ${event.time}` : ''}{event.location ? ` · ${event.location}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X c={colors.textSecondary} size={14} />
              </TouchableOpacity>
            </View>

            {/* Detail pills — fixed */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {(() => {
                const ids = event.memberIds?.length ? event.memberIds : event.memberId ? [event.memberId] : [];
                return ids.map(mid => {
                  const name = members.find((m: any) => m.id === mid)?.name?.split(' ')[0];
                  return name ? (
                    <View key={mid} style={{ backgroundColor: catColor + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: catColor }}>
                        {event.category === 'Medical' ? '🩺' : event.category === 'Study' ? '🎓' : '👤'} {name}
                      </Text>
                    </View>
                  ) : null;
                });
              })()}
              {event.category === 'Medical' && event.doctorName && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>🩺 {event.doctorName}</Text>
                </View>
              )}
              {event.category === 'Study' && event.subject && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>📖 {event.subject}</Text>
                </View>
              )}
              {event.category === 'Sports' && event.coachName && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>🏅 {event.coachName}</Text>
                </View>
              )}
              {(event.pickupLocation || event.dropLocation) && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>📍 {event.pickupLocation ?? '?'} → {event.dropLocation ?? '?'}</Text>
                </View>
              )}
              {event.helper && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: event.helperStatus === 'confirmed' ? '#10B981' : event.helperStatus === 'rejected' ? '#EF4444' : '#D97706' }}>
                    {event.helperStatus === 'confirmed' ? '✓' : event.helperStatus === 'rejected' ? '✕' : '⏳'} {event.helper}
                  </Text>
                </View>
              )}
              {restricted && (
                <View style={{ backgroundColor: '#FEF3C715', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: TYPO.micro, color: '#D97706', fontWeight: '700' }}>🔒 Read-only</Text>
                </View>
              )}
            </View>

            {/* ── Scrollable body (editable fields only) ── */}
            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
            >
              {/* Change who it's for */}
              {isParent && !['Work', 'Event'].includes(event.category ?? '') && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 }}>
                  <MemberPicker
                    label={
                      event.category === 'Medical'  ? '🩺 Change patient(s)' :
                      event.category === 'Sports'   ? '🏅 Change player(s)' :
                      event.category === 'Study'    ? '📚 Change student(s)' :
                      event.category === 'Ride'     ? '🚗 Passenger(s)' : '👤 For'
                    }
                    selectedIds={editMemberIds}
                    members={event.category === 'Work' ? adults : kids}
                    onToggle={id => setEditMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                    onSelectAll={() => {
                      const pool = event.category === 'Work' ? adults : kids;
                      setEditMemberIds(editMemberIds.length === pool.length ? [] : pool.map(m => m.id));
                    }}
                    colors={colors} isDark={isDark} siblings={siblings}
                  />
                </View>
              )}

              {/* Helper reassignment */}
              {isParent && !['Work', 'Event'].includes(event.category ?? '') && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>
                    {event.category === 'Medical' ? '🏥 Reassign escort' :
                     event.category === 'Study'   ? '📚 Change tutor / helper' :
                     event.category === 'Sports'  ? '🚗 Reassign drop-off' :
                     '🚗 Reassign driver'}
                  </Text>
                  <MemberPicker
                    label={
                      event.category === 'Medical' ? '🏥 Accompanied by' :
                      event.category === 'Study'   ? '📚 Tutored by'     :
                      event.category === 'Sports'  ? '🚗 Drop-off by'    :
                      '🚗 Driven by'
                    }
                    selectedIds={helperId ? [helperId] : []}
                    members={adults}
                    onToggle={handleHelperSelect}
                    colors={colors} isDark={isDark} siblings={siblings}
                  />
                  {!helperId && (
                    <TextInput
                      style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, marginTop: -4 }]}
                      placeholder="Or type a name (e.g. external tutor)"
                      placeholderTextColor={colors.textTertiary}
                      value={helperName}
                      onChangeText={t => setHelperName(t)}
                    />
                  )}
                </View>
              )}

              {/* Notes */}
              {!restricted && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>📝 Notes</Text>
                  <TextInput
                    style={[f.input, f.multiInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                    placeholder="Add or update notes…"
                    placeholderTextColor={colors.textTertiary}
                    value={notes} onChangeText={t => setNotes(t.slice(0, 200))}
                    multiline numberOfLines={3} textAlignVertical="top"
                  />
                </View>
              )}

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                {!isPast && (isParent || isOwnPending) && onDelete && (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
                      borderWidth: 1, borderColor: '#FCA5A560', backgroundColor: isDark ? '#2D1515' : '#FEF2F2' }}
                    onPress={handleDelete}>
                    <X c="#EF4444" size={16} />
                  </TouchableOpacity>
                )}
                {!restricted && (
                  <TouchableOpacity style={[f.submitBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]} onPress={save} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" />
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
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center' }}>
                  {isPast ? 'This event is in the past — no edits allowed.' : 'This event was approved by a parent. Ask a parent to make changes.'}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const f = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, maxHeight: '75%' },
  handle:      { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title:       { fontSize: 17, fontWeight: '900' },
  label:       { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
  sectionLabel:{ fontSize: TYPO.caption, fontWeight: '900', letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },
  input:       { borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, marginBottom: 10 },
  multiInput:  { minHeight: 72, textAlignVertical: 'top' },
  dateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  pickerCard:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
  suggPill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0 },
  kidNote:     { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  submitBtn:   { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
                 flexDirection: 'row', gap: 8, backgroundColor: BRAND.purple },
  summaryCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 8 },
});
