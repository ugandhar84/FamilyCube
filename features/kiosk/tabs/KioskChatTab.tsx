/**
 * KioskChatTab — the family "All" group channel, kiosk-sized: big bubbles,
 * a bottom text input, no attachments/reactions/replies UI (a shared wall
 * tablet is for reading and firing off quick texts, not composing media).
 * Reads/writes the exact same chatStore ('all' is a fixed group channel —
 * see GROUP_CHANNEL_IDS in chatStore.ts) the phone's ChatScreen uses.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { Send } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { fmtTime } from '@/lib/dates';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';

const CHANNEL = 'all';

export function KioskChatTab({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { channels, loadChannel, sendMessage } = useChatStore();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => { loadChannel(CHANNEL); }, []);

  const messages = channels[CHANNEL]?.messages ?? [];
  const memberName = (id: string) => members?.find(m => m.id === id)?.name?.split(' ')[0] ?? 'Someone';
  const memberEmoji = (id: string) => members?.find(m => m.id === id)?.emoji ?? '👤';

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    sendMessage(CHANNEL, active.id, t);
  };

  return (
    <View style={s.root}>
      <Text style={[s.title, { color: colors.textPrimary }]}>Family Chat</Text>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={s.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const mine = item.senderId === active.id;
          return (
            <View style={[s.row, mine && { flexDirection: 'row-reverse' }]}>
              <Text style={s.avatar}>{memberEmoji(item.senderId)}</Text>
              <View style={[s.bubble, { backgroundColor: mine ? colors.primary : colors.card, borderColor: colors.border }]}>
                {!mine && <Text style={[s.sender, { color: colors.teal }]}>{memberName(item.senderId)}</Text>}
                {!!item.text && <Text style={[s.text, { color: mine ? '#fff' : colors.textPrimary }]}>{item.text}</Text>}
                <Text style={[s.time, { color: mine ? 'rgba(255,255,255,0.75)' : colors.textTertiary }]}>
                  {fmtTime(new Date(item.timestamp).toTimeString().slice(0, 5))}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={[s.empty, { color: colors.textTertiary }]}>No messages yet — say hi 👋</Text>
        }
      />

      <View style={[s.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message the family…"
          placeholderTextColor={colors.textTertiary}
          style={[s.input, { color: colors.textPrimary }]}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable onPress={send} disabled={!text.trim()} style={[s.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.border }]}>
          <Send size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  list: { gap: 12, paddingBottom: 12, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '70%' },
  avatar: { fontSize: 22 },
  bubble: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  sender: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  text: { fontSize: TYPO.body, fontWeight: '600' },
  time: { fontSize: 9.5, fontWeight: '600', marginTop: 4, textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: TYPO.body, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 999, paddingLeft: 18, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, fontSize: TYPO.body, fontWeight: '600' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
