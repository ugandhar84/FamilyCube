/**
 * FlyerScannerModal — 3-step flyer-to-schedule flow
 *
 * Step 1: CAPTURE
 *   Up to 3 photos (camera or gallery) OR pick a PDF (rendered as image)
 *   Thumbnail strip shows what's queued; tap to remove
 *
 * Step 2: PROCESSING
 *   Images sent to parse-flyer edge function (Gemini Vision)
 *   Spinner while waiting
 *
 * Step 3: REVIEW + CONFIRM
 *   Extracted event card with all editable fields
 *   Kid-picker chips — choose which kid(s) this goes to
 *   "Add to Schedule" saves an event per selected kid via useEventStore
 *   Parent can tap any field to edit before confirming
 *
 * Migrated onto the canonical AppBottomSheet shell (was a hand-rolled
 * Modal duplicating AppBottomSheet's own keyboard-height tracking, with
 * every step's Rescan/Submit action row living inside its ScrollView
 * instead of a sticky footer — same anti-patterns already found and fixed
 * across HelpRequestModal/RequestHelpModal/SubmitProofSheet/
 * CreateQuestModal/EditQuestModal this session). AppBottomSheet's own
 * `footer` slot renders per-step below, and `children` renders whichever
 * step's body is active.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput,
  StyleSheet, Image, ActivityIndicator, Alert, Platform,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
// SDK 54's default expo-file-system export dropped readAsStringAsync as a
// hard runtime error, not just a deprecation warning — /legacy is the
// documented migration path.
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/compressImage';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { useSchoolStore } from '@/store/schoolStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import AppBottomSheet from '@/components/AppBottomSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CapturedImage {
  uri:      string;
  base64:   string;
  mimeType: string;
}

interface ExtractedEvent {
  title:          string;
  category:       string;
  date:           string | null;
  time:           string | null;
  end_time:       string | null;
  location:       string | null;
  organizer:      string | null;
  description:    string | null;
  rsvp_deadline:  string | null;
  cost:           number | null;
  notes:          string | null;
  recurring:      boolean;
  recurrence_desc:string | null;
}

interface ExtractedPeriod {
  periodName: string;
  subject:    string;
  teacher:    string | null;
  room:       string | null;
  startTime:  string | null;
  endTime:    string | null;
  days:       string[];
  term?:      string | null;
  isLunch?:   boolean;
}

interface ExtractedTimetable {
  student: string | null;
  school:  string | null;
  grade:   string | null;
  periods: ExtractedPeriod[];
}

interface ExtractedCalendar {
  school:  string | null;
  events:  ExtractedEvent[];
}

type FlyerResult =
  | { type: 'event';     event: ExtractedEvent }
  | { type: 'timetable'; timetable: ExtractedTimetable }
  | { type: 'calendar';  calendar: ExtractedCalendar };

type Step = 'capture' | 'processing' | 'review' | 'timetable' | 'multi';

// Same category vocabulary the rest of the app uses (features/calendar/components/eventForm/types.ts's
// CATEGORIES) — a scanned flyer's category must be one of these or the calendar_events_category_fk
// foreign key rejects the insert (confirmed: 'School'/'Work'/'Holiday' were never real categories,
// just something the flyer-parsing prompt invented independently of the app's actual category set).
const CATEGORIES = ['Medical', 'Sports', 'Study', 'Ride', 'Event', 'Birthday', 'Errand', 'Other'];
const CAT_EMOJI: Record<string, string> = {
  Medical: '🏥', Sports: '🏅', Study: '📚', Ride: '🚗', Event: '🎉', Birthday: '🎂', Errand: '🛒', Other: '✨',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateDisplay(d: string | null) {
  if (!d) return 'Not set';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime12(t: string | null) {
  if (!t) return 'Not set';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function parseDateToObj(d: string | null): Date {
  if (!d) return new Date();
  return new Date(d + 'T00:00:00');
}
function parseTimeToObj(t: string | null): Date {
  const d = new Date();
  if (!t) return d;
  const [h, m] = t.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}
function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dateToTimeStr(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FlyerScannerModal({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const { addEvent } = useEventStore();
  const { schedules, addSchedule, updateSchedule } = useSchoolStore();

  const allNames = members.map(m => m.name);
  const kids     = members.filter(m => m.role === 'kid');

  // ── State ──
  const [step, setStep]               = useState<Step>('capture');
  const [images, setImages]           = useState<CapturedImage[]>([]);
  const [errorMsg, setError]          = useState('');
  const [flyerResult, setFlyerResult] = useState<FlyerResult | null>(null);
  const [selectedKids, setSelKids]    = useState<string[]>([]);
  // multi-event: which events are selected for import
  const [selectedEvents, setSelEvts]  = useState<Set<number>>(new Set());
  // timetable: which kid to assign schedule to
  const [timetableKidId, setTTKid]   = useState('');
  // timetable: editable copy of extracted periods
  const [editablePeriods, setEditablePeriods] = useState<ExtractedPeriod[]>([]);
  const [selectedTerm, setSelectedTerm]       = useState<string | null>(null);
  // which period row is expanded for editing
  const [expandedPeriodIdx, setExpandedIdx] = useState<number | null>(null);

  // Convenience accessors
  const event    = flyerResult?.type === 'event'     ? flyerResult.event     : null;
  const timetable= flyerResult?.type === 'timetable' ? flyerResult.timetable : null;
  const multiCal = flyerResult?.type === 'calendar'  ? flyerResult.calendar  : null;

  // ── Toast ──
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState({ text: '', success: true });
  const showToast = useCallback((text: string, success = true) => {
    setToastMsg({ text, success });
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [toastOpacity]);

  // Edit pickers (single event review)
  const [pickerField, setPickerField] = useState<'date' | 'time' | 'endTime' | 'rsvp' | null>(null);
  const [editField, setEditField]     = useState<keyof ExtractedEvent | null>(null);

  // ── Image helpers ──
  const addImage = useCallback((img: CapturedImage) => {
    setImages(prev => prev.length < 3 ? [...prev, img] : prev);
  }, []);

  const removeImage = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, base64: false });
    if (!result.canceled && result.assets[0]) {
      const { uri, base64 } = await compressImage(result.assets[0].uri);
      addImage({ uri, base64, mimeType: 'image/jpeg' });
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Photo library permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      base64: false,
      allowsMultipleSelection: true,
      selectionLimit: 3 - images.length,
    });
    if (!result.canceled) {
      for (const a of result.assets) {
        const { uri, base64 } = await compressImage(a.uri);
        addImage({ uri, base64, mimeType: 'image/jpeg' });
      }
    }
  };

  const pickPDF = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled) return;
    // We can't render PDF to image client-side in RN easily.
    // Send the PDF as base64 with mimeType application/pdf — Gemini handles it natively.
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' as any });
      addImage({ uri: asset.uri, base64: b64, mimeType: 'application/pdf' });
    } catch {
      Alert.alert('Could not read PDF');
    }
  };

  // ── AI call ──
  const processImages = async () => {
    if (!images.length) { Alert.alert('Add at least one photo or PDF'); return; }
    setStep('processing');
    setError('');
    try {
      console.log('[flyer] sending', images.length, 'image(s), mimeTypes:', images.map(i => i.mimeType));
      console.log('[flyer] base64 sizes (chars):', images.map(i => i.base64.length));

      // Use raw fetch so we can read the body even on non-2xx
      const fnUrl = process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/parse-flyer';
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const rawRes = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
        body: JSON.stringify({ images: images.map(img => ({ data: img.base64, mimeType: img.mimeType })) }),
      });
      const rawText = await rawRes.text();
      console.log(`[flyer] HTTP ${rawRes.status} body: ${rawText.slice(0, 500)}`);
      const data = JSON.parse(rawText);
      if (!rawRes.ok || !data?.ok) {
        throw new Error(data?.error ?? `HTTP ${rawRes.status}`);
      }
      console.log('[flyer] result type:', data.type);
      const result = data as FlyerResult;
      setFlyerResult(result);
      setSelKids(kids.length === 1 ? [kids[0].id] : []);
      if (result.type === 'timetable') {
        setTTKid(kids.length === 1 ? kids[0].id : '');
        setEditablePeriods(result.timetable.periods);
        setExpandedIdx(null);
        const firstTerm = result.timetable.periods.find(p => p.term)?.term ?? null;
        setSelectedTerm(firstTerm);
        setStep('timetable');
      } else if (result.type === 'calendar') {
        // Pre-select all events
        setSelEvts(new Set(result.calendar.events.map((_, i) => i)));
        setStep('multi');
      } else {
        setStep('review');
      }
    } catch (e: any) {
      console.error('[flyer] catch:', e?.message ?? e);
      setError(e.message ?? 'Something went wrong');
      setStep('capture');
    }
  };

  // ── Save single event ──
  const handleConfirmEvent = () => {
    if (!event) return;
    if (selectedKids.length === 0) { Alert.alert('Choose at least one kid for this event'); return; }
    for (const kidId of selectedKids) {
      addEvent({
        title:    event.title,
        date:     event.date ?? dateToStr(new Date()),
        time:     event.time ?? undefined,
        endTime:  event.end_time ?? undefined,
        category: event.category,
        location: event.location ?? undefined,
        notes:    [event.description, event.notes, event.recurrence_desc].filter(Boolean).join(' · ') || undefined,
        memberId: kidId,
        type:     'event',
        color:    BRAND.teal,
        approvalPending: false,
      });
    }
    const kidNames = selectedKids.map(id => members.find(m => m.id === id)?.name.split(' ')[0]).join(', ');
    showToast(`✓ "${event.title}" added for ${kidNames}`);
    setTimeout(resetAndClose, 2600);
  };

  // ── Save multi calendar events ──
  const handleConfirmMulti = () => {
    if (!multiCal) return;
    if (selectedKids.length === 0) { Alert.alert('Choose at least one kid'); return; }
    const toAdd = multiCal.events.filter((_, i) => selectedEvents.has(i));
    if (toAdd.length === 0) { Alert.alert('Select at least one event to import'); return; }
    for (const ev of toAdd) {
      for (const kidId of selectedKids) {
        addEvent({
          title:    ev.title,
          date:     ev.date ?? dateToStr(new Date()),
          time:     ev.time ?? undefined,
          endTime:  ev.end_time ?? undefined,
          category: ev.category,
          location: ev.location ?? undefined,
          notes:    ev.notes ?? undefined,
          memberId: kidId,
          type:     'event',
          color:    BRAND.teal,
          approvalPending: false,
        });
      }
    }
    const kidNames = selectedKids.map(id => members.find(m => m.id === id)?.name.split(' ')[0]).join(', ');
    showToast(`✓ ${toAdd.length} event${toAdd.length !== 1 ? 's' : ''} imported for ${kidNames}`);
    setTimeout(resetAndClose, 2600);
  };

  // ── Save timetable ──
  const handleConfirmTimetable = () => {
    if (!timetable) return;
    if (!timetableKidId) { Alert.alert('Choose a kid for this schedule'); return; }
    const kid = kids.find(k => k.id === timetableKidId);
    if (!kid) return;
    const periods = editablePeriods.map((p, i) => ({
      id:        'p' + Date.now() + i,
      period:    i + 1,
      subject:   p.subject,
      room:      p.room ?? '',
      teacher:   p.teacher ?? undefined,
      startTime: p.startTime ?? '08:00',
      endTime:   p.endTime ?? '08:50',
      isLunch:   p.isLunch ?? false,
      days:      p.days.length ? p.days : ['mon','tue','wed','thu','fri'],
      term:      p.term ?? undefined,
    }));
    const existing = schedules.find(s => s.memberId === timetableKidId);
    const schedule = {
      memberId:    timetableKidId,
      memberName:  kid.name,
      semester:    'Fall' as any,
      year:        new Date().getFullYear(),
      gradeYear:   timetable.grade ?? undefined,
      school:      timetable.school ?? undefined,
      lunchPeriod: 'B' as any,
      dayType:     'Regular' as any,
      periods,
    };
    if (existing) updateSchedule(timetableKidId, schedule);
    else           addSchedule(schedule);
    showToast(`✓ ${kid.name.split(' ')[0]}'s timetable saved`);
    setTimeout(resetAndClose, 2600);
  };

  const resetAndClose = () => {
    setStep('capture'); setImages([]); setFlyerResult(null);
    setSelKids([]); setSelEvts(new Set()); setTTKid('');
    setError(''); setPickerField(null); setEditField(null);
    onClose();
  };

  // ── Event field updater ──
  const updateEvent = (field: keyof ExtractedEvent, value: any) =>
    setFlyerResult(prev => prev?.type === 'event' ? { ...prev, event: { ...prev.event, [field]: value } } : prev);

  // ── Per-step title/subtitle ──
  const title = step === 'timetable' ? 'Class Schedule' : step === 'multi' ? 'School Calendar' : 'Scan Activity Flyer';
  const subtitle =
    step === 'capture'    ? 'Up to 3 photos or 1 PDF → AI extracts the schedule'
    : step === 'processing' ? 'Analysing with Gemini Vision…'
    : 'Review & assign to your kid(s)';

  // ── Per-step footer ──
  const footer = step === 'capture' ? (
    <>
      {errorMsg ? (
        <View style={{ backgroundColor: '#EF444420', borderRadius: 14, padding: 12, marginBottom: 10 }}>
          <Text style={{ fontSize: TYPO.caption, color: '#EF4444', fontWeight: '700' }}>⚠️ {errorMsg}</Text>
        </View>
      ) : null}
      <Pressable onPress={processImages}
        style={[f.submitBtn, { backgroundColor: images.length ? BRAND.purple : colors.border }]}>
        <Ionicons name="sparkles" size={16} color={images.length ? '#fff' : colors.textTertiary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: images.length ? '#fff' : colors.textTertiary }}>
          Analyse with AI →
        </Text>
      </Pressable>
    </>
  ) : step === 'review' && event ? (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable onPress={() => { setStep('capture'); setFlyerResult(null); }}
        style={[f.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Ionicons name="arrow-back" size={15} color={colors.textSecondary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Rescan</Text>
      </Pressable>
      <Pressable onPress={handleConfirmEvent}
        style={[f.submitBtn, { flex: 2, backgroundColor: selectedKids.length ? BRAND.teal : colors.border }]}>
        <Ionicons name="calendar-outline" size={16} color={selectedKids.length ? '#fff' : colors.textTertiary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: selectedKids.length ? '#fff' : colors.textTertiary }}>
          Add to Schedule →
        </Text>
      </Pressable>
    </View>
  ) : step === 'timetable' && timetable ? (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable onPress={() => setStep('capture')} style={[f.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Ionicons name="arrow-back" size={15} color={colors.textSecondary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Rescan</Text>
      </Pressable>
      <Pressable onPress={handleConfirmTimetable}
        style={[f.submitBtn, { flex: 2, backgroundColor: timetableKidId ? BRAND.purple : colors.border }]}>
        <Ionicons name="book-outline" size={16} color={timetableKidId ? '#fff' : colors.textTertiary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: timetableKidId ? '#fff' : colors.textTertiary }}>Save Schedule →</Text>
      </Pressable>
    </View>
  ) : step === 'multi' && multiCal ? (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable onPress={() => setStep('capture')} style={[f.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Ionicons name="arrow-back" size={15} color={colors.textSecondary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Rescan</Text>
      </Pressable>
      <Pressable onPress={handleConfirmMulti}
        style={[f.submitBtn, { flex: 2, backgroundColor: selectedKids.length && selectedEvents.size ? BRAND.teal : colors.border }]}>
        <Ionicons name="calendar-outline" size={16} color={selectedKids.length && selectedEvents.size ? '#fff' : colors.textTertiary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: selectedKids.length && selectedEvents.size ? '#fff' : colors.textTertiary }}>
          Import {selectedEvents.size} Event{selectedEvents.size !== 1 ? 's' : ''} →
        </Text>
      </Pressable>
    </View>
  ) : null; // 'processing' has no footer

  return (
    <AppBottomSheet
      visible={visible}
      onClose={resetAndClose}
      title={title}
      subtitle={subtitle}
      accentColor={BRAND.purple}
      minHeight={step === 'processing' ? '40%' : '55%'}
      maxHeight="92%"
      footer={footer}
    >
      {/* ── TOAST ── */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: 8, left: 0, right: 0, zIndex: 99, opacity: toastOpacity }}>
        <View style={{ borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: toastMsg.success ? '#059669' : '#EF4444',
          flexDirection: 'row', alignItems: 'center', gap: 8,
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
          <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>{toastMsg.text}</Text>
        </View>
      </Animated.View>

      {/* ── STEP 1: CAPTURE ── */}
      {step === 'capture' && (
        <>
          {/* Thumbnail strip */}
          {images.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {images.map((img, i) => (
                <View key={i} style={{ position: 'relative' }}>
                  <Image source={{ uri: img.uri }} style={f.thumb} />
                  <Pressable onPress={() => removeImage(i)}
                    style={f.thumbClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </Pressable>
                  {img.mimeType === 'application/pdf' && (
                    <View style={f.pdfBadge}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>PDF</Text>
                    </View>
                  )}
                </View>
              ))}
              {/* Remaining slots */}
              {Array.from({ length: 3 - images.length }).map((_, i) => (
                <View key={`empty-${i}`} style={[f.thumb, f.thumbEmpty, { borderColor: colors.border }]}>
                  <Ionicons name="add" size={22} color={colors.textTertiary} />
                </View>
              ))}
            </View>
          )}

          {/* Add buttons */}
          <View style={{ gap: 10 }}>
            {images.length < 3 && (
              <>
                <Pressable onPress={pickFromCamera}
                  style={[f.addBtn, { backgroundColor: BRAND.purple + '18', borderColor: BRAND.purple + '40' }]}>
                  <Ionicons name="camera" size={22} color={BRAND.purple} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>Take a Photo</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Point camera at the flyer</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={BRAND.purple} />
                </Pressable>

                <Pressable onPress={pickFromGallery}
                  style={[f.addBtn, { backgroundColor: BRAND.teal + '15', borderColor: BRAND.teal + '40' }]}>
                  <Ionicons name="images" size={22} color={BRAND.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.teal }}>Browse Gallery</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                      Pick up to {3 - images.length} photo{3 - images.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={BRAND.teal} />
                </Pressable>

                {!images.some(img => img.mimeType === 'application/pdf') && (
                  <Pressable onPress={pickPDF}
                    style={[f.addBtn, { backgroundColor: BRAND.amber + '15', borderColor: BRAND.amber + '40' }]}>
                    <Ionicons name="document-text" size={22} color={BRAND.amber} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }}>Pick a PDF</Text>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Multi-page flyers, permission slips</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={BRAND.amber} />
                  </Pressable>
                )}
              </>
            )}
          </View>
        </>
      )}

      {/* ── STEP 2: PROCESSING ── */}
      {step === 'processing' && (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 16 }}>
          <ActivityIndicator size="large" color={BRAND.purple} />
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Reading your flyer…</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Gemini Vision is extracting the schedule</Text>
        </View>
      )}

      {/* ── STEP 3: REVIEW ── */}
      {step === 'review' && event && (
        <>
          {/* Extracted event card */}
          <View style={[f.eventCard, { backgroundColor: isDark ? '#0F172A' : '#F8FAFF', borderColor: BRAND.purple + '40' }]}>
            {/* Category badge + title */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={[f.catBadge, { backgroundColor: BRAND.purple + '20' }]}>
                <Text style={{ fontSize: TYPO.subheading }}>{CAT_EMOJI[event.category] ?? '📋'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={event.title}
                  onChangeText={v => updateEvent('title', v)}
                  style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, padding: 0 }}
                  placeholder="Event title"
                  placeholderTextColor={colors.textTertiary}
                />
                {/* Category chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {CATEGORIES.map(cat => (
                    <Pressable key={cat} onPress={() => updateEvent('category', cat)}
                      style={[f.catChip, {
                        backgroundColor: event.category === cat ? BRAND.purple + '20' : colors.surface,
                        borderColor: event.category === cat ? BRAND.purple : colors.border,
                      }]}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: event.category === cat ? BRAND.purple : colors.textTertiary }}>
                        {CAT_EMOJI[cat]} {cat}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Date */}
            <Pressable onPress={() => setPickerField('date')} style={f.fieldRow}>
              <Text style={f.fieldLabel}>📅 Date</Text>
              <Text style={[f.fieldValue, { color: event.date ? colors.textPrimary : colors.textTertiary }]}>
                {fmtDateDisplay(event.date)}
              </Text>
              <Ionicons name="pencil" size={13} color={colors.textTertiary} />
            </Pressable>
            {pickerField === 'date' && (
              <DateTimePicker value={parseDateToObj(event.date)} mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, d) => { if (d) updateEvent('date', dateToStr(d)); setPickerField(null); }} />
            )}

            {/* Time */}
            <Pressable onPress={() => setPickerField('time')} style={f.fieldRow}>
              <Text style={f.fieldLabel}>🕐 Start</Text>
              <Text style={[f.fieldValue, { color: event.time ? colors.textPrimary : colors.textTertiary }]}>
                {fmtTime12(event.time)}
              </Text>
              <Ionicons name="pencil" size={13} color={colors.textTertiary} />
            </Pressable>
            {pickerField === 'time' && (
              <DateTimePicker value={parseTimeToObj(event.time)} mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, d) => { if (d) updateEvent('time', dateToTimeStr(d)); setPickerField(null); }} />
            )}

            {/* End time */}
            <Pressable onPress={() => setPickerField('endTime')} style={f.fieldRow}>
              <Text style={f.fieldLabel}>🕐 End</Text>
              <Text style={[f.fieldValue, { color: event.end_time ? colors.textPrimary : colors.textTertiary }]}>
                {fmtTime12(event.end_time)}
              </Text>
              <Ionicons name="pencil" size={13} color={colors.textTertiary} />
            </Pressable>
            {pickerField === 'endTime' && (
              <DateTimePicker value={parseTimeToObj(event.end_time)} mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, d) => { if (d) updateEvent('end_time', dateToTimeStr(d)); setPickerField(null); }} />
            )}

            {/* Location */}
            <View style={f.fieldRow}>
              <Text style={f.fieldLabel}>📍 Place</Text>
              <TextInput
                value={event.location ?? ''}
                onChangeText={v => updateEvent('location', v || null)}
                placeholder="Location"
                placeholderTextColor={colors.textTertiary}
                style={[f.inlineInput, { color: colors.textPrimary, flex: 1 }]}
              />
            </View>

            {/* Organizer */}
            {event.organizer ? (
              <View style={f.fieldRow}>
                <Text style={f.fieldLabel}>🏫 By</Text>
                <TextInput
                  value={event.organizer ?? ''}
                  onChangeText={v => updateEvent('organizer', v || null)}
                  style={[f.inlineInput, { color: colors.textPrimary, flex: 1 }]}
                />
              </View>
            ) : null}

            {/* Cost */}
            {event.cost !== null && (
              <View style={f.fieldRow}>
                <Text style={f.fieldLabel}>💵 Cost</Text>
                <TextInput
                  value={event.cost !== null ? String(event.cost) : ''}
                  onChangeText={v => updateEvent('cost', v ? parseFloat(v) : null)}
                  keyboardType="decimal-pad"
                  style={[f.inlineInput, { color: colors.textPrimary, flex: 1 }]}
                />
              </View>
            )}

            {/* RSVP deadline */}
            {event.rsvp_deadline && (
              <Pressable onPress={() => setPickerField('rsvp')} style={f.fieldRow}>
                <Text style={f.fieldLabel}>📬 RSVP by</Text>
                <Text style={[f.fieldValue, { color: '#EF4444' }]}>{fmtDateDisplay(event.rsvp_deadline)}</Text>
                <Ionicons name="pencil" size={13} color={colors.textTertiary} />
              </Pressable>
            )}
            {pickerField === 'rsvp' && (
              <DateTimePicker value={parseDateToObj(event.rsvp_deadline)} mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, d) => { if (d) updateEvent('rsvp_deadline', dateToStr(d)); setPickerField(null); }} />
            )}

            {/* Description */}
            {event.description ? (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', marginBottom: 6 }}>Summary</Text>
                <TextInput
                  value={event.description ?? ''}
                  onChangeText={v => updateEvent('description', v)}
                  multiline
                  style={{ fontSize: TYPO.caption, color: colors.textSecondary, padding: 0 }}
                />
              </View>
            ) : null}

            {/* Notes */}
            {event.notes ? (
              <View style={{ marginTop: 10, backgroundColor: BRAND.amber + '15', borderRadius: 12, padding: 10 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber, marginBottom: 4 }}>📋 Notes</Text>
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{event.notes}</Text>
              </View>
            ) : null}

            {/* Recurring badge */}
            {event.recurring && (
              <View style={{ marginTop: 8, backgroundColor: BRAND.teal + '15', borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Ionicons name="repeat" size={15} color={BRAND.teal} />
                <Text style={{ fontSize: TYPO.label, color: BRAND.teal, fontWeight: '700', flex: 1 }}>
                  Recurring: {event.recurrence_desc ?? 'Regular event'}
                </Text>
              </View>
            )}
          </View>

          {/* Kid picker */}
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>
            Add to whose schedule?
          </Text>
          {kids.length === 0 ? (
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No kids in the family yet.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {kids.map(k => {
                const sel = selectedKids.includes(k.id);
                return (
                  <Pressable key={k.id} onPress={() => setSelKids(prev => sel ? prev.filter(id => id !== k.id) : [...prev, k.id])}
                    style={[f.kidChip, {
                      backgroundColor: sel ? BRAND.teal + '20' : colors.surface,
                      borderColor: sel ? BRAND.teal : colors.border,
                    }]}>
                    <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl}
                      siblings={allNames} size={36} ringColor={sel ? BRAND.teal : colors.textTertiary} />
                    <View>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? BRAND.teal : colors.textPrimary }}>
                        {k.name.split(' ')[0]}
                      </Text>
                      {sel && <Text style={{ fontSize: TYPO.micro, color: BRAND.teal, fontWeight: '700' }}>✓ Selected</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* ── STEP: TIMETABLE ── */}
      {step === 'timetable' && timetable && (
        <>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary }}>📚 Class Schedule</Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
                {[timetable.school, timetable.grade].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{editablePeriods.length} periods</Text>
          </View>

          {/* Term tabs — only shown when multiple terms detected */}
          {(() => {
            const terms = [...new Set(editablePeriods.map(p => p.term).filter(Boolean) as string[])];
            if (terms.length < 2) return null;
            const ALL_TERMS = [null, ...terms]; // null = "All"
            return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
                {ALL_TERMS.map(t => {
                  const sel = selectedTerm === t;
                  return (
                    <Pressable key={t ?? 'all'} onPress={() => { setSelectedTerm(t); setExpandedIdx(null); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                        backgroundColor: sel ? BRAND.purple : (isDark ? '#1E293B' : '#F1F5F9'),
                        borderWidth: 1.5, borderColor: sel ? BRAND.purple : colors.border }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? '#fff' : colors.textSecondary }}>
                        {t ?? 'All terms'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            );
          })()}

          {/* Editable period rows */}
          <View style={{ gap: 6, marginBottom: 14 }}>
            {editablePeriods.map((p, i) => {
              // Filter by selected term (null = show all)
              if (selectedTerm && p.term && p.term !== selectedTerm) return null;
              const expanded = expandedPeriodIdx === i;
              const ALL_DAYS_LIST = ['mon','tue','wed','thu','fri','sat','sun'];
              const DAY_ABBR: Record<string,string> = { mon:'M',tue:'T',wed:'W',thu:'Th',fri:'F',sat:'Sa',sun:'Su' };
              const updateP = (patch: Partial<ExtractedPeriod>) =>
                setEditablePeriods(prev => prev.map((x, j) => j === i ? { ...x, ...patch } : x));

              return (
                <View key={i} style={{ borderRadius: 14, borderWidth: 1.5,
                  borderColor: expanded ? BRAND.purple + '60' : (isDark ? colors.border : '#E8E8F0'),
                  backgroundColor: expanded ? (isDark ? BRAND.purple + '10' : BRAND.purple + '06') : (isDark ? colors.card : '#fff'),
                  overflow: 'hidden' }}>

                  {/* Collapsed row — tap to expand */}
                  <Pressable onPress={() => setExpandedIdx(expanded ? null : i)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                    {/* Time block — primary */}
                    <View style={{ alignItems: 'center', width: 52, backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                      borderRadius: 10, paddingVertical: 6 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple, fontVariant: ['tabular-nums'] }}>
                        {p.startTime ? fmtTime12(p.startTime).replace(' AM','a').replace(' PM','p') : '—'}
                      </Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontVariant: ['tabular-nums'] }}>
                        {p.endTime ? fmtTime12(p.endTime).replace(' AM','a').replace(' PM','p') : ''}
                      </Text>
                    </View>
                    {/* Subject + meta */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: p.isLunch ? '#D97706' : colors.textPrimary }} numberOfLines={1}>
                        {p.subject || 'Untitled'}
                      </Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>
                        {[p.teacher, p.room].filter(Boolean).join(' · ') || 'Tap to edit'}
                      </Text>
                    </View>
                    {/* Days + expand icon */}
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: BRAND.teal }}>
                        {p.days.map(d => DAY_ABBR[d] ?? d[0].toUpperCase()).join('')}
                      </Text>
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTertiary} />
                    </View>
                  </Pressable>

                  {/* Expanded inline editor */}
                  {expanded && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#EEF0F4' }}>
                      {/* Subject */}
                      <TextInput value={p.subject} onChangeText={v => updateP({ subject: v })}
                        placeholder="Subject" placeholderTextColor={colors.textTertiary}
                        style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary,
                          borderBottomWidth: 1, borderBottomColor: BRAND.purple + '40', paddingVertical: 6 }} />

                      {/* Teacher + Room */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput value={p.teacher ?? ''} onChangeText={v => updateP({ teacher: v || null })}
                          placeholder="Teacher" placeholderTextColor={colors.textTertiary}
                          style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, padding: 8,
                            borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }} />
                        <TextInput value={p.room ?? ''} onChangeText={v => updateP({ room: v || null })}
                          placeholder="Room" placeholderTextColor={colors.textTertiary}
                          style={{ width: 90, fontSize: TYPO.body, color: colors.textPrimary, padding: 8,
                            borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }} />
                      </View>

                      {/* Times */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TextInput value={p.startTime ?? ''} onChangeText={v => updateP({ startTime: v || null })}
                          placeholder="08:20" placeholderTextColor={colors.textTertiary} keyboardType="numbers-and-punctuation"
                          style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, padding: 8, textAlign: 'center',
                            borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }} />
                        <Text style={{ color: colors.textTertiary }}>→</Text>
                        <TextInput value={p.endTime ?? ''} onChangeText={v => updateP({ endTime: v || null })}
                          placeholder="09:05" placeholderTextColor={colors.textTertiary} keyboardType="numbers-and-punctuation"
                          style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, padding: 8, textAlign: 'center',
                            borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }} />
                      </View>

                      {/* Days */}
                      <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                        {ALL_DAYS_LIST.map(d => {
                          const on = p.days.includes(d);
                          return (
                            <Pressable key={d} onPress={() => updateP({ days: on ? p.days.filter(x=>x!==d) : [...p.days,d] })}
                              style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                                backgroundColor: on ? BRAND.purple : (isDark ? '#1E293B' : '#F1F5F9'),
                                borderWidth: 1.5, borderColor: on ? BRAND.purple : colors.border }}>
                              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: on ? '#fff' : colors.textSecondary }}>
                                {DAY_ABBR[d]}
                              </Text>
                            </Pressable>
                          );
                        })}
                        <Pressable onPress={() => updateP({ isLunch: !p.isLunch })}
                          style={{ paddingHorizontal: 10, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: p.isLunch ? '#F59E0B' : (isDark ? '#1E293B' : '#F1F5F9'),
                            borderWidth: 1.5, borderColor: p.isLunch ? '#F59E0B' : colors.border }}>
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: p.isLunch ? '#fff' : colors.textSecondary }}>🍱 Lunch</Text>
                        </Pressable>
                      </View>

                      {/* Delete */}
                      <Pressable onPress={() => { setEditablePeriods(prev => prev.filter((_,j) => j !== i)); setExpandedIdx(null); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' }}>
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                        <Text style={{ fontSize: TYPO.caption, color: '#EF4444', fontWeight: '700' }}>Remove period</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Add period */}
          <Pressable onPress={() => {
            const last = editablePeriods[editablePeriods.length - 1];
            const newP: ExtractedPeriod = { periodName: '', subject: '', teacher: null, room: null,
              startTime: last?.endTime ?? null, endTime: null, days: ['mon','tue','wed','thu','fri'] };
            setEditablePeriods(prev => [...prev, newP]);
            setExpandedIdx(editablePeriods.length);
          }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            borderRadius: 12, paddingVertical: 12, borderWidth: 1.5, borderStyle: 'dashed',
            borderColor: BRAND.purple + '50', marginBottom: 16 }}>
            <Ionicons name="add" size={18} color={BRAND.purple} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>Add period</Text>
          </Pressable>

          {/* Kid picker */}
          <Text style={f.sectionLabel}>Assign to</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {kids.map(k => {
              const sel = timetableKidId === k.id;
              return (
                <Pressable key={k.id} onPress={() => setTTKid(k.id)}
                  style={[f.kidChip, { backgroundColor: sel ? BRAND.purple + '20' : colors.surface, borderColor: sel ? BRAND.purple : colors.border }]}>
                  <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl} siblings={allNames} size={36} ringColor={sel ? BRAND.purple : colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? BRAND.purple : colors.textPrimary }}>{k.name.split(' ')[0]}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* ── STEP: MULTI CALENDAR ── */}
      {step === 'multi' && multiCal && (
        <>
          <View style={{ backgroundColor: BRAND.teal + '12', borderRadius: 16, padding: 14, marginBottom: 16, gap: 4 }}>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary }}>📅 School Calendar</Text>
            {multiCal.school && <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{multiCal.school}</Text>}
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 4 }}>
              {multiCal.events.length} events found · {selectedEvents.size} selected
            </Text>
          </View>

          {/* Toggle all */}
          <Pressable onPress={() => setSelEvts(selectedEvents.size === multiCal.events.length ? new Set() : new Set(multiCal.events.map((_, i) => i)))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>
              {selectedEvents.size === multiCal.events.length ? 'Deselect all' : 'Select all'}
            </Text>
          </Pressable>

          {/* Event list */}
          <View style={{ gap: 6, marginBottom: 16 }}>
            {multiCal.events.map((ev, i) => {
              const sel = selectedEvents.has(i);
              const isHoliday = ev.category === 'Holiday';
              return (
                <Pressable key={i} onPress={() => setSelEvts(prev => { const s = new Set(prev); sel ? s.delete(i) : s.add(i); return s; })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: sel ? (isHoliday ? '#FEF3C7' : BRAND.teal + '10') : (isDark ? colors.card : '#F8FAFF'),
                    borderRadius: 12, padding: 10, borderWidth: 1.5,
                    borderColor: sel ? (isHoliday ? '#F59E0B' : BRAND.teal) : (isDark ? colors.border : '#E8E8F0') }}>
                  <Text style={{ fontSize: 16 }}>{CAT_EMOJI[ev.category] ?? '📋'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{ev.title}</Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
                      {ev.date ? new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                      {ev.time ? ` · ${fmtTime12(ev.time)}` : ''}
                    </Text>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                    borderColor: sel ? (isHoliday ? '#F59E0B' : BRAND.teal) : colors.border,
                    backgroundColor: sel ? (isHoliday ? '#F59E0B' : BRAND.teal) : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                    {sel && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Kid picker */}
          <Text style={f.sectionLabel}>Add to whose schedule?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {kids.map(k => {
              const sel = selectedKids.includes(k.id);
              return (
                <Pressable key={k.id} onPress={() => setSelKids(prev => sel ? prev.filter(id => id !== k.id) : [...prev, k.id])}
                  style={[f.kidChip, { backgroundColor: sel ? BRAND.teal + '20' : colors.surface, borderColor: sel ? BRAND.teal : colors.border }]}>
                  <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl} siblings={allNames} size={36} ringColor={sel ? BRAND.teal : colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? BRAND.teal : colors.textPrimary }}>{k.name.split(' ')[0]}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </AppBottomSheet>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const f = StyleSheet.create({
  thumb:      { width: 90, height: 90, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1E293B' },
  thumbEmpty: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  thumbClose: { position: 'absolute', top: -6, right: -6 },
  pdfBadge:   { position: 'absolute', bottom: 6, left: 6, backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1, padding: 16 },
  eventCard:  { borderRadius: 20, borderWidth: 1.5, padding: 16, marginBottom: 20 },
  catBadge:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  catChip:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, marginRight: 7 },
  fieldRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.2)' },
  fieldLabel: { fontSize: TYPO.label, fontWeight: '700', color: '#64748B', width: 72 },
  fieldValue: { fontSize: TYPO.caption, fontWeight: '600', flex: 1 },
  inlineInput:{ fontSize: TYPO.caption, fontWeight: '600', padding: 0 },
  kidChip:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1.5, padding: 10, paddingRight: 16 },
  cancelBtn:   { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtn:   { flexDirection: 'row', gap: 6, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  sectionLabel:{ fontSize: TYPO.label, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
});
