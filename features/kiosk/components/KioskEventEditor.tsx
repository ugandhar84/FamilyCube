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
import { Modal, View, Text, TextInput, Pressable, Alert, Platform, KeyboardAvoidingView, ScrollView, Switch, StyleSheet } from 'react-native';
import { X, Trash2, Clock, Lock } from 'lucide-react-native';
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
import { KioskModalHost } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';

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
    // AUDIT FIX: re-check the permission at the point of the actual write,
    // not only where the button is rendered. KioskQuestEditor's own header
    // already documents this belt-and-suspenders reasoning for quests
    // ("a future second entry point ... would silently reopen full write
    // access"); the event editor's save/delete paths were the half that
    // never got it, and they're the more exposed pair — a calendar event
    // delete is irreversible and this runs on a device anyone in the house
    // can walk up to.
    if (!canEditFull || !title.trim()) return;
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
    if (!canEditRestricted) return;
    const patch: Partial<FamilyEvent> = {};
    if (notes !== (event.notes ?? '')) patch.notes = notes.trim() || undefined;
    if (alertCall !== (event.alertCall ?? false)) patch.alertCall = alertCall;
    if (Object.keys(patch).length > 0) updateEvent(event.id, patch);
    onClose();
  };

  const confirmDelete = () => {
    // Same point-of-write re-check as saveFull above. deriveEventEditPermission
    // is the single source of truth for who may delete an event, and this is
    // where kiosk actually acts on it.
    if (!canEditFull) return;
    Alert.alert('Delete this event?', `"${event.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteEvent(event.id); onClose(); } },
    ]);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KioskModalHost>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
        <View
          style={[s.card, { backgroundColor: colors.card, ...(keyboardAwareMaxHeight !== undefined ? { maxHeight: keyboardAwareMaxHeight } : {}) }]}
          accessibilityViewIsModal
        >
          <View style={s.header}>
            <Text
              style={[s.headerTitle, { color: colors.textPrimary }]}
              numberOfLines={2}
              accessibilityRole="header"
            >
              {readOnly ? event.title : canEditRestricted ? 'Add a Note' : 'Edit Event'}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={16}
              style={s.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={readOnly ? 'Close' : 'Close without saving'}
            >
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {(readOnly || canEditRestricted) && (
            <View style={[s.lockBadge, { backgroundColor: colors.amberLight, marginHorizontal: KIOSK_SPACE.lg }]}>
              <Lock size={13} color={colors.amber} />
              <Text style={{ fontSize: KIOSK_TYPO.micro, fontWeight: '700', color: colors.amber }}>
                {readOnly ? 'Read-only' : 'Locked — only a note can be added'}
              </Text>
            </View>
          )}

          {/* AUDIT FIX: was a plain View. The card is maxHeight-capped
              (keyboardAwareMaxHeight + the 85% cap in s.card), and the
              full-edit branch below stacks title + date/time + location +
              notes + a switch — comfortably taller than that cap once the
              on-screen keyboard is up on a kiosk. With no scroll container
              the overflowing fields were simply unreachable: you could see
              the Title field but never scroll down to Notes or the Save
              button. Needs BOTH style (so it takes bounded height and
              scrolls) and contentContainerStyle (for the padding — putting
              that padding on `style` instead would pad the viewport rather
              than the content and clip the last field). */}
          <ScrollView
            style={s.bodyScroll}
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
                  <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Call reminder</Text>
                  <Switch value={alertCall} onValueChange={setAlertCall} trackColor={{ false: colors.border, true: colors.primary + '80' }} thumbColor={alertCall ? colors.primary : colors.textTertiary} />
                </View>
              </>
            ) : (
              <>
                <Text style={[s.label, { color: colors.textSecondary }]}>Title</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  accessibilityLabel="Event title"
                  maxLength={120}
                  style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                />
                <Text style={[s.label, { color: colors.textSecondary }]}>Date &amp; Time</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => { setShowDatePicker(true); setShowTimePicker(false); }}
                    style={[s.input, s.timeBtn, { flex: 3, backgroundColor: showDatePicker ? colors.primaryLight : colors.surface, borderColor: showDatePicker ? colors.primary : colors.border }]}
                  >
                    <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                      {fmtDisplay(dateValue)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setShowTimePicker(true); setShowDatePicker(false); }}
                    style={[s.input, s.timeBtn, { flex: 2, backgroundColor: showTimePicker ? colors.primaryLight : colors.surface, borderColor: showTimePicker ? colors.primary : colors.border }]}
                  >
                    <Clock size={16} color={timeValue ? colors.primary : colors.textTertiary} />
                    <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '700', color: timeValue ? colors.textPrimary : colors.textTertiary }}>
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
                  <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Call reminder</Text>
                  <Switch value={alertCall} onValueChange={setAlertCall} trackColor={{ false: colors.border, true: colors.primary + '80' }} thumbColor={alertCall ? colors.primary : colors.textTertiary} />
                </View>
              </>
            )}
          </ScrollView>

          <View style={s.footer}>
            {canEditFull && (
              <Pressable
                onPress={confirmDelete}
                style={[s.iconBtn, { borderColor: colors.danger }]}
                accessibilityRole="button"
                accessibilityLabel={`Delete event ${event.title}`}
              >
                <Trash2 size={19} color={colors.danger} />
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={readOnly ? 'Close' : 'Cancel'}
            >
              <Text style={[s.btnText, { color: colors.textSecondary }]}>{readOnly ? 'Close' : 'Cancel'}</Text>
            </Pressable>
            {canEditFull && (
              <Pressable
                onPress={saveFull}
                disabled={!title.trim()}
                style={[s.btn, { backgroundColor: title.trim() ? colors.primary : colors.border, flex: 2 }]}
                accessibilityRole="button"
                accessibilityLabel="Save changes"
                accessibilityState={{ disabled: !title.trim() }}
              >
                <Text style={[s.btnText, { color: '#fff' }]}>Save Changes</Text>
              </Pressable>
            )}
            {canEditRestricted && (
              <Pressable
                onPress={saveRestricted}
                style={[s.btn, { backgroundColor: colors.primary, flex: 2 }]}
                accessibilityRole="button"
                accessibilityLabel="Save note"
              >
                <Text style={[s.btnText, { color: '#fff' }]}>Save Note</Text>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      </KioskModalHost>
    </Modal>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[s.label, { color: colors.textSecondary, marginTop: 0 }]}>{label}</Text>
      <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{value}</Text>
    </View>
  );
}

// Scaled to KIOSK_TYPO/KIOSK_HIT — this form is filled in standing at a
// counter, so fields and buttons are sized for that rather than for a
// phone in the hand.
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: KIOSK_SPACE.lg },
  card: { width: 540, maxWidth: '100%', maxHeight: '88%', borderRadius: KIOSK_RADIUS.lg, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.sm, gap: KIOSK_SPACE.sm,
  },
  headerTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', flexShrink: 1 },
  closeBtn: {
    width: 44, height: 44, borderRadius: KIOSK_RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  lockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, alignSelf: 'flex-start',
    borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 6, marginBottom: KIOSK_SPACE.xs,
  },
  // `bodyScroll` bounds the scroll viewport (flexShrink lets it give way to
  // the fixed header/footer); `body` is the content container and owns the
  // padding — see the ScrollView's own comment above for why the two must
  // stay separate.
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.sm, gap: 6 },
  label: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.xs },
  input: {
    borderWidth: 1.5, borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.md,
    paddingVertical: KIOSK_SPACE.sm, minHeight: KIOSK_HIT.min, fontSize: KIOSK_TYPO.body,
  },
  notesInput: { minHeight: 110, textAlignVertical: 'top', paddingTop: KIOSK_SPACE.sm },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: KIOSK_SPACE.md },
  footer: { flexDirection: 'row', gap: KIOSK_SPACE.sm, padding: KIOSK_SPACE.lg },
  iconBtn: {
    width: KIOSK_HIT.min, minHeight: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.sm,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  btn: {
    flex: 1, borderRadius: KIOSK_RADIUS.sm, minHeight: KIOSK_HIT.min,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.sm,
  },
  btnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
});
