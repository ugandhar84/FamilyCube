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
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TextInput,
  StyleSheet, Image, ActivityIndicator, Alert, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/compressImage';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';

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

type Step = 'capture' | 'processing' | 'review';

const CATEGORIES = ['School', 'Sports', 'Medical', 'Work', 'Event', 'Study'];
const CAT_EMOJI: Record<string, string> = {
  School: '🏫', Sports: '⚽', Medical: '🏥', Work: '💼', Event: '🎉', Study: '📚',
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

// ─── Editable field row ───────────────────────────────────────────────────────
function FieldRow({ label, value, onEdit, accent, colors }: {
  label: string; value: string; onEdit?: () => void; accent?: string; colors: any;
}) {
  return (
    <Pressable onPress={onEdit} style={f.fieldRow}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, width: 88 }}>{label}</Text>
      <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: accent ?? colors.textPrimary, flex: 1 }} numberOfLines={2}>{value || '—'}</Text>
      {onEdit && <Ionicons name="pencil" size={13} color={colors.textTertiary} />}
    </Pressable>
  );
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

  const allNames = members.map(m => m.name);
  const kids     = members.filter(m => m.role === 'kid');

  // ── State ──
  const [step, setStep]             = useState<Step>('capture');
  const [images, setImages]         = useState<CapturedImage[]>([]);
  const [errorMsg, setError]        = useState('');
  const [event, setEvent]           = useState<ExtractedEvent | null>(null);
  const [selectedKids, setSelKids]  = useState<string[]>([]);

  // Edit pickers
  const [pickerField, setPickerField] = useState<'date' | 'time' | 'endTime' | 'rsvp' | null>(null);
  const [editingField, setEditField]  = useState<keyof ExtractedEvent | null>(null);
  const [editText, setEditText]       = useState('');

  // ── Image helpers ──
  const addImage = useCallback((img: CapturedImage) => {
    setImages(prev => prev.length < 3 ? [...prev, img] : prev);
  }, []);

  const removeImage = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));

  const uriToBase64 = async (uri: string): Promise<string> => {
    if (uri.startsWith('data:')) return uri.split(',')[1];
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
    return b64;
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, base64: false });
    if (!result.canceled && result.assets[0]) {
      const { uri, base64 } = await compressImage(result.assets[0].uri);
      addImage({ uri, base64, mimeType: 'image/jpeg' });
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Photo library permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      const { data, error } = await supabase.functions.invoke('parse-flyer', {
        body: {
          images: images.map(img => ({ data: img.base64, mimeType: img.mimeType })),
        },
      });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? 'Parse failed');
      setEvent(data.event as ExtractedEvent);
      // Pre-select all kids if only one kid, else none
      setSelKids(kids.length === 1 ? [kids[0].id] : []);
      setStep('review');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
      setStep('capture');
    }
  };

  // ── Save to schedule ──
  const handleConfirm = () => {
    if (!event) return;
    if (selectedKids.length === 0) {
      Alert.alert('Choose at least one kid for this event');
      return;
    }
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
    Alert.alert('Added to Schedule', `"${event.title}" added for ${kidNames}`, [{ text: 'Great!', onPress: resetAndClose }]);
  };

  const resetAndClose = () => {
    setStep('capture'); setImages([]); setEvent(null);
    setSelKids([]); setError(''); setPickerField(null); setEditField(null);
    onClose();
  };

  // ── Event field updater ──
  const updateEvent = (field: keyof ExtractedEvent, value: any) =>
    setEvent(prev => prev ? { ...prev, [field]: value } : prev);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <Pressable style={f.backdrop} onPress={resetAndClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 0 }}>
        <View style={[f.sheet, { backgroundColor: isDark ? '#0D1117' : '#FFFFFF', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
          <View style={[f.handle, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />

          {/* ── HEADER ── */}
          <View style={f.hdr}>
            <View style={[f.hdrIcon, { backgroundColor: BRAND.purple + '20' }]}>
              <Ionicons name="scan" size={20} color={BRAND.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[f.title, { color: colors.textPrimary }]}>Scan Activity Flyer</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                {step === 'capture'    ? 'Up to 3 photos or 1 PDF → AI extracts the schedule'
                : step === 'processing' ? 'Analysing with Gemini Vision…'
                : 'Review & assign to your kid(s)'}
              </Text>
            </View>
            <Pressable onPress={resetAndClose}
              style={[f.closeBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* ── STEP 1: CAPTURE ── */}
          {step === 'capture' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={f.body}>

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
              <View style={{ gap: 10, marginBottom: 20 }}>
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

              {errorMsg ? (
                <View style={{ backgroundColor: '#EF444420', borderRadius: 14, padding: 12, marginBottom: 14 }}>
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
            </ScrollView>
          )}

          {/* ── STEP 2: PROCESSING ── */}
          {step === 'processing' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40, gap: 16 }}>
              <ActivityIndicator size="large" color={BRAND.purple} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Reading your flyer…</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Gemini Vision is extracting the schedule</Text>
            </View>
          )}

          {/* ── STEP 3: REVIEW ── */}
          {step === 'review' && event && (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              contentContainerStyle={f.body}>

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
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginBottom: 16 }}>No kids in the family yet.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
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

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => { setStep('capture'); setEvent(null); }}
                  style={[f.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Ionicons name="arrow-back" size={15} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Rescan</Text>
                </Pressable>
                <Pressable onPress={handleConfirm}
                  style={[f.submitBtn, { flex: 2, backgroundColor: selectedKids.length ? BRAND.teal : colors.border }]}>
                  <Ionicons name="calendar-outline" size={16} color={selectedKids.length ? '#fff' : colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: selectedKids.length ? '#fff' : colors.textTertiary }}>
                    Add to Schedule →
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const f = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(2,6,23,0.75)' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, maxHeight: '94%', minHeight: 400 },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 12 },
  hdr:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  hdrIcon:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: TYPO.caption, fontWeight: '900' },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body:       { paddingHorizontal: 20, paddingBottom: 40 },
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
  cancelBtn:  { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtn:  { flexDirection: 'row', gap: 6, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});
