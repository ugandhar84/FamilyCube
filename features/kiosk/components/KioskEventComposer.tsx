/**
 * KioskEventComposer — create a new calendar event for a given date from
 * kiosk mode. New kiosk-sized modal, writes through the exact same
 * eventStore.addEvent the phone's EventFormModal already calls.
 *
 * Time was previously a free-text field ("e.g. 4:30 PM") stored verbatim —
 * every other event's `time` field is a real "HH:MM" 24h string (Event
 * cards, sorting, the day's timeline all parse it that way), so a typed
 * "4:30ish" or "around 5" would have silently broken sorting/display
 * everywhere else that reads this event. Switched to the same real
 * DateTimePicker every phone-app form already uses.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView, StyleSheet } from 'react-native';
import { X, Clock } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useEventStore } from '@/store/eventStore';
import { fmtTime } from '@/lib/dates';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
// Same picker mobile's own AddEventModal uses — see KioskEventEditor.tsx's
// own comment for why a bare DateTimePicker (no header/Done affordance)
// was a real functional gap, not just cosmetic.
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';

export function KioskEventComposer({ date, onClose, colors, isDark }: {
  date: string | null; onClose: () => void; colors: any; isDark: boolean;
}) {
  const addEvent = useEventStore(s => s.addEvent);
  const [title, setTitle] = useState('');
  const [timeValue, setTimeValue] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(80);

  useEffect(() => {
    if (date) { setTitle(''); setTimeValue(null); setLocation(''); setShowTimePicker(false); }
  }, [date]);

  if (!date) return null;

  const save = () => {
    if (!title.trim()) return;
    const time = timeValue
      ? `${String(timeValue.getHours()).padStart(2, '0')}:${String(timeValue.getMinutes()).padStart(2, '0')}`
      : undefined;
    addEvent({
      title: title.trim(),
      date,
      time,
      allDay: !time,
      location: location.trim() || undefined,
      type: 'event',
    } as any);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card, ...(keyboardAwareMaxHeight !== undefined ? { maxHeight: keyboardAwareMaxHeight } : {}) }]}>
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>New Event</Text>
            <Pressable onPress={onClose} hitSlop={12}><X size={22} color={colors.textSecondary} /></Pressable>
          </View>

          <View style={s.body}>
            <Text style={[s.label, { color: colors.textSecondary }]}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Soccer practice"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              autoFocus
            />
            <Text style={[s.label, { color: colors.textSecondary }]}>Time (optional)</Text>
            <Pressable
              onPress={() => setShowTimePicker(p => !p)}
              style={[s.input, s.timeBtn, { backgroundColor: showTimePicker ? colors.primaryLight : colors.surface, borderColor: showTimePicker ? colors.primary : colors.border }]}
            >
              <Clock size={16} color={timeValue ? colors.primary : colors.textTertiary} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: timeValue ? colors.textPrimary : colors.textTertiary }}>
                {timeValue ? fmtTime(`${String(timeValue.getHours()).padStart(2, '0')}:${String(timeValue.getMinutes()).padStart(2, '0')}`) : 'All day'}
              </Text>
            </Pressable>
            {showTimePicker && (
              <PickerOverlay
                showDate={false} showTime={true}
                value={timeValue ?? new Date()}
                onChangeDate={() => {}}
                onChangeTime={setTimeValue}
                onDone={() => setShowTimePicker(false)}
                accentColor={colors.primary} colors={colors}
                timeLabel="🕐 Event Time"
              />
            )}
            <Text style={[s.label, { color: colors.textSecondary }]}>Location (optional)</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Riverside Park"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
          </View>

          <View style={s.footer}>
            <Pressable onPress={onClose} style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}>
              <Text style={[s.btnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={!title.trim()} style={[s.btn, { backgroundColor: title.trim() ? colors.primary : colors.border, flex: 2 }]}>
              <Text style={[s.btnText, { color: '#fff' }]}>Add Event</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 480, maxWidth: '90%', borderRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  body: { paddingHorizontal: 20, gap: 6 },
  label: { fontSize: TYPO.caption, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, padding: 14, fontSize: TYPO.body },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: { flexDirection: 'row', gap: 10, padding: 20 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: TYPO.body, fontWeight: '800' },
});
