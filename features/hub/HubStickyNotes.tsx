/**
 * HubStickyNotes — sticky notes on the phone Hub, for every role. Same data as the kiosk Home
 * (useStickyNotes): notes shared with you or everyone, with an "add" note that lets you pick who sees it.
 */
import { useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { showToast } from '@/components/AppToast';
import { useStickyNotes, noteStamp, NOTE_MAX, NOTE_COLORS, type NoteColor } from './useStickyNotes';

export function HubStickyNotes({ active, members, colors, isDark }: { active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean }) {
  const { notes, add, remove, canRemove } = useStickyNotes(active, members);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [color, setColor] = useState<NoteColor>('amber');
  const [to, setTo] = useState<string[]>([]);
  const tone: Record<string, { bg: string; fg: string }> = {
    amber: { bg: colors.amberLight, fg: colors.amber }, sage: { bg: colors.tealLight, fg: colors.teal },
    lavender: { bg: colors.pinkLight, fg: colors.pink }, peach: { bg: colors.primaryLight, fg: colors.primary },
  };
  const first = (id: string) => members.find(m => m.id === id)?.name?.trim().split(' ')[0] ?? '';
  const others = members.filter(m => m.id !== active.id && !(m as any).deletedAt);
  const save = async () => {
    if (!(await add(text, color, to))) { showToast('Could not post the note'); return; }
    setText(''); setTo([]); setAdding(false); showToast('Note posted');
  };
  if (notes.length === 0 && !adding) {
    return (
      <Pressable onPress={() => setAdding(true)} style={[s.empty, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Add a sticky note">
        <Plus size={16} color={colors.textSecondary} /><Text style={[s.emptyT, { color: colors.textSecondary }]}>Leave a sticky note</Text>
      </Pressable>
    );
  }
  return (
    <View style={s.wrap}>
      <Text style={[s.eyebrow, { color: colors.textTertiary }]}>STICKY NOTES</Text>
      <View style={s.grid}>
        {notes.map((n, i) => {
          const t = tone[n.color] ?? tone.amber;
          return (
            <View key={n.id} style={[s.note, { backgroundColor: t.bg, transform: [{ rotate: i % 2 ? '1deg' : '-1deg' }] }]}>
              <Text style={[s.body, { color: colors.textPrimary }]}>{n.body}</Text>
              <Text style={[s.by, { color: t.fg }]}>— {first(n.author_id)}{n.recipient_ids?.length ? ` → ${n.recipient_ids.map(first).join(', ')}` : ''}</Text>
              <Text style={[s.when, { color: colors.textTertiary }]}>{noteStamp(n.created_at)}</Text>
              {canRemove(n) && <Pressable onPress={() => remove(n)} hitSlop={8} style={s.x} accessibilityRole="button" accessibilityLabel="Remove note"><X size={13} color={colors.textSecondary} /></Pressable>}
            </View>
          );
        })}
        <Pressable onPress={() => setAdding(true)} style={[s.note, s.add, { backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Add a sticky note">
          <Plus size={18} color={colors.textSecondary} /><Text style={[s.by, { color: colors.textSecondary }]}>Add a note</Text>
        </Pressable>
      </View>

      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAdding(false)} />
          <View style={[s.sheet, { backgroundColor: isDark ? colors.card : '#FFFFFF' }]}>
            <Text style={[s.sheetT, { color: colors.textPrimary }]}>New sticky note</Text>
            <TextInput value={text} onChangeText={setText} maxLength={NOTE_MAX} multiline autoFocus placeholder="e.g. Soccer cleats are in the garage" placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, backgroundColor: tone[color].bg }]} accessibilityLabel="Note" />
            <Text style={[s.count, { color: colors.textTertiary }]}>{text.length}/{NOTE_MAX}</Text>
            <Text style={[s.eyebrow, { color: colors.textTertiary }]}>SHARE WITH</Text>
            <View style={s.chips}>
              <Pressable onPress={() => setTo([])} style={[s.chip, { backgroundColor: to.length === 0 ? colors.primary : colors.surface }]}><Text style={[s.chipT, { color: to.length === 0 ? '#fff' : colors.textSecondary }]}>Everyone</Text></Pressable>
              {others.map(m => {
                const on = to.includes(m.id);
                return <Pressable key={m.id} onPress={() => setTo(p => (p.includes(m.id) ? p.filter(x => x !== m.id) : [...p, m.id]))} style={[s.chip, { backgroundColor: on ? colors.primary : colors.surface }]}><Text style={[s.chipT, { color: on ? '#fff' : colors.textSecondary }]}>{first(m.id)}</Text></Pressable>;
              })}
            </View>
            <Text style={[s.eyebrow, { color: colors.textTertiary }]}>COLOR</Text>
            <View style={s.chips}>
              {NOTE_COLORS.map(c => <Pressable key={c} onPress={() => setColor(c)} style={[s.chip, { backgroundColor: color === c ? colors.primary : tone[c].bg }]}><Text style={[s.chipT, { color: color === c ? '#fff' : tone[c].fg }]}>{c}</Text></Pressable>)}
            </View>
            <View style={s.row}>
              <Pressable onPress={() => setAdding(false)} style={[s.btn, { backgroundColor: colors.surface }]}><Text style={[s.btnT, { color: colors.textPrimary }]}>Cancel</Text></Pressable>
              <Pressable onPress={save} disabled={!text.trim()} style={[s.btn, { backgroundColor: colors.primary, opacity: text.trim() ? 1 : 0.4 }]}><Text style={[s.btnT, { color: '#fff' }]}>Post note</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 8 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  note: { width: '47.5%', minHeight: 84, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomRightRadius: 18, borderBottomLeftRadius: 6, padding: 12, gap: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  body: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  by: { fontSize: 12, fontWeight: '800' },
  when: { fontSize: 11, fontWeight: '700' },
  x: { position: 'absolute', top: 6, right: 6 },
  add: { alignItems: 'center', justifyContent: 'center', shadowOpacity: 0, elevation: 0 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 6, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 12, justifyContent: 'center' },
  emptyT: { fontSize: 14, fontWeight: '700' },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10 },
  sheetT: { fontSize: 20, fontWeight: '800' },
  input: { minHeight: 96, borderRadius: 16, padding: 14, fontSize: 17, fontWeight: '700', textAlignVertical: 'top' },
  count: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 100, paddingHorizontal: 14, paddingVertical: 9 },
  chipT: { fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  btnT: { fontSize: 15, fontWeight: '800' },
});
