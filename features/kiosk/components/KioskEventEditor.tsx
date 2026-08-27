/**
 * KioskEventEditor — edit or delete an existing calendar event from kiosk
 * mode. New kiosk-sized modal, writes through the exact same
 * eventStore.updateEvent/deleteEvent the phone's EventFormModal already
 * calls.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, Alert, StyleSheet } from 'react-native';
import { X, Trash2 } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';

export function KioskEventEditor({ event, onClose, colors, isDark }: {
  event: FamilyEvent | null; onClose: () => void; colors: any; isDark: boolean;
}) {
  const updateEvent = useEventStore(s => s.updateEvent);
  const deleteEvent = useEventStore(s => s.deleteEvent);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setTime(event.time ?? '');
      setLocation(event.location ?? '');
    }
  }, [event?.id]);

  if (!event) return null;

  const save = () => {
    if (!title.trim()) return;
    updateEvent(event.id, {
      title: title.trim(),
      time: time.trim() || undefined,
      location: location.trim() || undefined,
    });
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
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Edit Event</Text>
            <Pressable onPress={onClose} hitSlop={12}><X size={22} color={colors.textSecondary} /></Pressable>
          </View>

          <View style={s.body}>
            <Text style={[s.label, { color: colors.textSecondary }]}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
            <Text style={[s.label, { color: colors.textSecondary }]}>Time</Text>
            <TextInput
              value={time}
              onChangeText={setTime}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
            <Text style={[s.label, { color: colors.textSecondary }]}>Location</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
          </View>

          <View style={s.footer}>
            <Pressable onPress={confirmDelete} style={[s.iconBtn, { borderColor: colors.danger }]}>
              <Trash2 size={18} color={colors.danger} />
            </Pressable>
            <Pressable onPress={onClose} style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}>
              <Text style={[s.btnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={!title.trim()} style={[s.btn, { backgroundColor: title.trim() ? colors.primary : colors.border, flex: 2 }]}>
              <Text style={[s.btnText, { color: '#fff' }]}>Save Changes</Text>
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
  iconBtn: { width: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: TYPO.body, fontWeight: '800' },
});
