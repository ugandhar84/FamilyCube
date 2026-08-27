/**
 * KioskEventComposer — create a new calendar event for a given date from
 * kiosk mode. New kiosk-sized modal, writes through the exact same
 * eventStore.addEvent the phone's EventFormModal already calls.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useEventStore } from '@/store/eventStore';

export function KioskEventComposer({ date, onClose, colors, isDark }: {
  date: string | null; onClose: () => void; colors: any; isDark: boolean;
}) {
  const addEvent = useEventStore(s => s.addEvent);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    if (date) { setTitle(''); setTime(''); setLocation(''); }
  }, [date]);

  if (!date) return null;

  const save = () => {
    if (!title.trim()) return;
    addEvent({
      title: title.trim(),
      date,
      time: time.trim() || undefined,
      location: location.trim() || undefined,
      type: 'event',
    } as any);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card }]}>
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
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="e.g. 4:30 PM"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
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
      </View>
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
  footer: { flexDirection: 'row', gap: 10, padding: 20 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: TYPO.body, fontWeight: '800' },
});
