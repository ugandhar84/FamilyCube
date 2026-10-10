/**
 * CompleteNoteSheet — confirmation + optional comment before marking a
 * maintenance reminder complete [live-requested: "while clicking on
 * complete we should ask for the confirmation swith comments text"].
 * A plain Modal + TextInput (not Alert.prompt, which is iOS-only) so this
 * works identically on both platforms, same pattern as the Add/Edit
 * sheets' own free-text fields.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { ChevronLeft, CheckCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FullPageOverlay from '@/components/FullPageOverlay';
import type { HomeownerNote } from '@/store/homeownerNotesStore';

export function CompleteNoteSheet({ visible, note, colors, onClose, onConfirm, zIndex = 61 }: {
  visible: boolean; note: HomeownerNote | null; colors: any;
  onClose: () => void;
  onConfirm: (comment: string) => void;
  zIndex?: number;
}) {
  const [comment, setComment] = useState('');
  const insets = useSafeAreaInsets();

  const close = () => { setComment(''); onClose(); };
  const confirm = () => { onConfirm(comment); setComment(''); };

  if (!note) return null;

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 14,
          borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={close} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={20} color={colors.teal} strokeWidth={2.5} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}>Home Care</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}>Complete task</Text>
          <View style={{ width: 70 }} />
        </View>

        <View style={{ padding: 20, gap: 20 }}>
          {/* Task name */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12,
            padding: 16, borderRadius: 16, backgroundColor: colors.tealLight }}>
            <CheckCircle size={22} color={colors.teal} strokeWidth={2} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.teal }}>{note.title}</Text>
          </View>

          <View>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 6, letterSpacing: 0.4 }}>
              COMPLETION NOTES (OPTIONAL)
            </Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="e.g. Used ABC HVAC, cost $180"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              autoFocus
              style={{
                borderWidth: 1.5, borderColor: colors.border, borderRadius: 14,
                paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, fontSize: 15,
                backgroundColor: colors.card, minHeight: 100, textAlignVertical: 'top',
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={close}
              style={{ flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm}
              style={{ flex: 2, borderRadius: 14, backgroundColor: colors.teal, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Mark complete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </FullPageOverlay>
  );
}
