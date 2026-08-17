import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { StickyNote, Check } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChoreStore } from '@/store/choreStore';

// A private, parent-only note on an already-approved quest — never sent
// through choreAdapter (kids/teens never see this), the one field still
// editable once a quest is done and paid. Everything else about the quest
// is locked at that point.
export function ParentSelfNoteRow({ choreId, initialNote, colors, isDark }: {
  choreId: string; initialNote?: string; colors: any; isDark: boolean;
}) {
  const updateChore = useChoreStore(s => s.updateChore);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote ?? '');
  const [saved, setSaved] = useState(false);

  const save = () => {
    updateChore(choreId, { parentNote: note.trim() || undefined });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (!editing) {
    return (
      <Pressable onPress={() => setEditing(true)}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8,
          borderRadius: 12, padding: 10, backgroundColor: isDark ? colors.surface : '#F8FAFC',
          borderWidth: 1, borderColor: colors.border, borderStyle: note ? 'solid' : 'dashed' }}>
        <StickyNote size={14} color={colors.textTertiary} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: TYPO.label, color: note ? colors.textSecondary : colors.textTertiary, fontStyle: note ? 'normal' : 'italic' }}>
          {note || 'Add a private note (only you see this)'}
        </Text>
        {saved && <Check size={14} color={colors.success} />}
      </Pressable>
    );
  }

  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Private note — only you see this"
        placeholderTextColor={colors.textTertiary}
        multiline
        autoFocus
        style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
          padding: 10, fontSize: TYPO.label, color: colors.textPrimary, minHeight: 60, textAlignVertical: 'top',
          backgroundColor: isDark ? colors.surface : '#fff' }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => { setNote(initialNote ?? ''); setEditing(false); }}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10,
            borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primary }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}
