/**
 * KioskEventEditor — edit or delete an existing calendar event from kiosk
 * mode. Kiosk-sized modal, writes through the exact same
 * eventStore.updateEvent/deleteEvent the phone's EventFormModal already
 * calls.
 *
 * RBAC: kiosk had zero permission awareness here — any member tapping any
 * event on the shared Hub display could edit or delete it outright, unlike
 * the phone app which gates edits through deriveEventEditPermission's rules
 * (past events lock, a kid's approved event locks, a teen can't touch a
 * sibling's event, a still-pending kid/teen request only gets a notes/alert
 * subset, etc). This mirrors that exact same shared logic — same rules,
 * kiosk-appropriate presentation only — across three tiers: full edit,
 * restricted (notes/alert-call only, matches the phone's "Save Note" path),
 * and read-only (no editable fields, no delete).
 *
 * Time was previously a free-text field storing whatever the row already
 * had verbatim — every other event's `time` is a real "HH:MM" 24h string
 * (sorting, the day's timeline, Agenda all parse it that way); a typed
 * edit here could silently corrupt it into something nothing else can
 * parse. Switched to the same real DateTimePicker every phone-app form
 * already uses.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, Alert, Platform, KeyboardAvoidingView, Switch, StyleSheet } from 'react-native';
import { X, Trash2, Clock, Lock } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { fmtTime, localDateStr, parseLocalDate } from '@/lib/dates';
import { fmtDisplay } from '@/features/calendar/components/eventForm/types';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { deriveEventEditPermission } from '@/features/tasks/lib/deriveCardActions';
// Same picker mobile's own AddEventModal/EditEventModal use (PickerOverlay
// wraps @react-native-community/datetimepicker in a proper "Done"-headed
// bottom sheet, spinner display) — was previously a bare DateTimePicker
// with no header/Done affordance, a genuine functional gap vs. mobile's
// real form UI, not just a visual difference.
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';

function timeStrToDate(t: string | undefined): Date | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function KioskEventEditor({ event, active, onClose, colors, isDark }: {
  event: FamilyEvent | null; active: FamilyMember; onClose: () => void; colors: any; isDark: boolean;
}) {
  const updateEvent = useEventStore(s => s.updateEvent);
  const deleteEvent = useEventStore(s => s.deleteEvent);
  const [title, setTitle] = useState('');
  const [dateValue, setDateValue] = useState<Date>(new Date());
  const [timeValue, setTimeValue] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [alertCall, setAlertCall] = useState(false);
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(80);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDateValue(event.date ? parseLocalDate(event.date) : new Date());
      setTimeValue(timeStrToDate(event.time));
      setLocation(event.location ?? '');
      setNotes(event.notes ?? '');
      setAlertCall(event.alertCall ?? false);
      setShowDatePicker(false);
      setShowTimePicker(false);
    }
  }, [event?.id]);

  if (!event) return null;

  const perm = deriveEventEditPermission(event, { id: active.id, role: active.role });
  const canEditFull = perm.canEditFull;
  const canEditRestricted = perm.canEditRestricted;
  const readOnly = !canEditFull && !canEditRestricted;

  const saveFull = () => {
    if (!title.trim()) return;
    const time = timeValue
      ? `${String(timeValue.getHours()).padStart(2, '0')}:${String(timeValue.getMinutes()).padStart(2, '0')}`
      : undefined;
    updateEvent(event.id, {
      title: title.trim(),
      date: localDateStr(dateValue),
      time,
      allDay: !time,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      alertCall,
    });
    onClose();
  };

  const saveRestricted = () => {
    const patch: Partial<FamilyEvent> = {};
    if (notes !== (event.notes ?? '')) patch.notes = notes.trim() || undefined;
    if (alertCall !== (event.alertCall ?? false)) patch.alertCall = alertCall;
    if (Object.keys(patch).length > 0) updateEvent(event.id, patch);
    onClose();
  };

  const confirmDelete = () => {
    Alert.alert('Delete this event?', `"${event.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteEvent(event.id); onClose(); } },
    ]);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card, ...(keyboardAwareMaxHeight !== undefined ? { maxHeight: keyboardAwareMaxHeight } : {}) }]}>
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {readOnly ? event.title : canEditRestricted ? 'Add a Note' : 'Edit Event'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}><X size={22} color={colors.textSecondary} /></Pressable>
          </View>

          {(readOnly || canEditRestricted) && (
            <View style={[s.lockBadge, { backgroundColor: colors.amberLight, marginHorizontal: 20 }]}>
              <Lock size={12} color={colors.amber} />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.amber }}>
                {readOnly ? 'Read-only' : 'Locked — only a note can be added'}
              </Text>
            </View>
          )}

          <View style={s.body}>
            {readOnly ? (
              <>
                <DetailRow label="Time" value={event.time ? fmtTime(event.time) : 'All day'} colors={colors} />
                {!!event.location && <DetailRow label="Location" value={event.location} colors={colors} />}
                {!!event.notes && <DetailRow label="Notes" value={event.notes} colors={colors} />}
              </>
            ) : canEditRestricted ? (
              <>
                <DetailRow label="Time" value={event.time ? fmtTime(event.time) : 'All day'} colors={colors} />
                {!!event.location && <DetailRow label="Location" value={event.location} colors={colors} />}
                <Text style={[s.label, { color: colors.textSecondary }]}>Notes</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  style={[s.input, s.notesInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                />
                <View style={s.switchRow}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Call reminder</Text>
                  <Switch value={alertCall} onValueChange={setAlertCall} trackColor={{ false: colors.border, true: colors.primary + '80' }} thumbColor={alertCall ? colors.primary : colors.textTertiary} />
                </View>
              </>
            ) : (
              <>
                <Text style={[s.label, { color: colors.textSecondary }]}>Title</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                />
                <Text style={[s.label, { color: colors.textSecondary }]}>Date &amp; Time</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => { setShowDatePicker(true); setShowTimePicker(false); }}
                    style={[s.input, s.timeBtn, { flex: 3, backgroundColor: showDatePicker ? colors.primaryLight : colors.surface, borderColor: showDatePicker ? colors.primary : colors.border }]}
                  >
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                      {fmtDisplay(dateValue)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setShowTimePicker(true); setShowDatePicker(false); }}
                    style={[s.input, s.timeBtn, { flex: 2, backgroundColor: showTimePicker ? colors.primaryLight : colors.surface, borderColor: showTimePicker ? colors.primary : colors.border }]}
                  >
                    <Clock size={16} color={timeValue ? colors.primary : colors.textTertiary} />
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: timeValue ? colors.textPrimary : colors.textTertiary }}>
                      {timeValue ? fmtTime(`${String(timeValue.getHours()).padStart(2, '0')}:${String(timeValue.getMinutes()).padStart(2, '0')}`) : 'All day'}
                    </Text>
                  </Pressable>
                </View>
                {/* Same shared PickerOverlay every mobile event form uses —
                    one overlay, toggled by which button was tapped, not two
                    separate bare pickers. */}
                <PickerOverlay
                  showDate={showDatePicker} showTime={showTimePicker}
                  value={showDatePicker ? dateValue : (timeValue ?? new Date())}
                  onChangeDate={setDateValue}
                  onChangeTime={setTimeValue}
                  onDone={() => { setShowDatePicker(false); setShowTimePicker(false); }}
                  accentColor={colors.primary} colors={colors}
                  dateLabel="📅 Event Date" timeLabel="🕐 Event Time"
                />
                <Text style={[s.label, { color: colors.textSecondary }]}>Location</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                />
                <Text style={[s.label, { color: colors.textSecondary }]}>Notes</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  style={[s.input, s.notesInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                />
                <View style={s.switchRow}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Call reminder</Text>
                  <Switch value={alertCall} onValueChange={setAlertCall} trackColor={{ false: colors.border, true: colors.primary + '80' }} thumbColor={alertCall ? colors.primary : colors.textTertiary} />
                </View>
              </>
            )}
          </View>

          <View style={s.footer}>
            {canEditFull && (
              <Pressable onPress={confirmDelete} style={[s.iconBtn, { borderColor: colors.danger }]}>
                <Trash2 size={18} color={colors.danger} />
              </Pressable>
            )}
            <Pressable onPress={onClose} style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}>
              <Text style={[s.btnText, { color: colors.textSecondary }]}>{readOnly ? 'Close' : 'Cancel'}</Text>
            </Pressable>
            {canEditFull && (
              <Pressable onPress={saveFull} disabled={!title.trim()} style={[s.btn, { backgroundColor: title.trim() ? colors.primary : colors.border, flex: 2 }]}>
                <Text style={[s.btnText, { color: '#fff' }]}>Save Changes</Text>
              </Pressable>
            )}
            {canEditRestricted && (
              <Pressable onPress={saveRestricted} style={[s.btn, { backgroundColor: colors.primary, flex: 2 }]}>
                <Text style={[s.btnText, { color: '#fff' }]}>Save Note</Text>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[s.label, { color: colors.textSecondary, marginTop: 0 }]}>{label}</Text>
      <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: 480, maxWidth: '100%', maxHeight: '85%', borderRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', flexShrink: 1 },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
  body: { paddingHorizontal: 20, gap: 6 },
  label: { fontSize: TYPO.caption, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, padding: 14, fontSize: TYPO.body },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  footer: { flexDirection: 'row', gap: 10, padding: 20 },
  iconBtn: { width: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: TYPO.body, fontWeight: '800' },
});
