import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import {
  Trash2, CornerUpLeft, Copy, ShoppingCart, Pencil, type LucideIcon,
} from 'lucide-react-native';
import { ChatMessage } from '@/store/chatStore';
import { QUICK_REACTIONS } from './constants';

// ─── Long-press action sheet ──────────────────────────────────────────────────

export function MessageActionSheet({ visible, msg, isMe, canEdit, colors, isDark, onClose,
  onReact, onReply, onCopy, onEdit, onDelete, onAddGrocery }: {
  visible: boolean; msg: ChatMessage | null; isMe: boolean; canEdit: boolean; colors: any; isDark: boolean;
  onClose: () => void; onReact: (e: string) => void; onReply: () => void;
  onCopy: () => void; onEdit: () => void; onDelete: () => void; onAddGrocery: () => void;
}) {
  if (!msg) return null;

  type Action = { Icon: LucideIcon; label: string; color: string; onPress: () => void };
  const actions: Action[] = [
    { Icon: CornerUpLeft,  label: 'Reply',        color: colors.primary,       onPress: onReply },
    { Icon: Copy,          label: 'Copy Text',    color: colors.textSecondary, onPress: onCopy },
    { Icon: ShoppingCart,  label: 'Add to List',  color: '#10b981',            onPress: onAddGrocery },
    ...(isMe && canEdit ? [
      { Icon: Pencil,      label: 'Edit',         color: '#f59e0b',            onPress: onEdit },
    ] : []),
    ...(isMe ? [
      { Icon: Trash2,      label: 'Delete',       color: '#ef4444',            onPress: onDelete },
    ] : []),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40,
          borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 8 }}>

          {/* Quick emoji reactions */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 18 }}>
            {QUICK_REACTIONS.map(e => (
              <Pressable key={e} onPress={() => { onReact(e); onClose(); }}
                style={{ width: 46, height: 46, borderRadius: 23,
                  backgroundColor: colors.surface,
                  borderWidth: 1, borderColor: colors.border,
                  alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 12 }} />

          {/* Action rows */}
          {actions.map((a, i) => (
            <Pressable key={i} onPress={() => { a.onPress(); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 8, borderRadius: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: a.color+'22',
                alignItems: 'center', justifyContent: 'center' }}>
                <a.Icon size={18} color={a.color} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: a.color }}>{a.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
