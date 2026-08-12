import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, Modal, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import type { ChatMessage } from '@/store/chatStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const QUICK_REACTIONS = ['❤️','😂','👍','🎉','🔥','😍'];

// ─── Bubble ───────────────────────────────────────────────────────────────────

function MessageBubble({ message, isMine, sender, onLongPress, onReact, activeMemberId }: {
  message: ChatMessage; isMine: boolean; sender?: { emoji?: string; name: string };
  onLongPress: () => void; onReact: (emoji: string) => void; activeMemberId: string;
}) {
  const { colors } = useTheme();
  const totalReactions = Object.values(message.reactions ?? {}).flat().length;

  return (
    <View style={[styles.bubbleWrapper, { flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }]}>
      {/* Avatar */}
      <View style={[styles.bubbleAvatar, { backgroundColor: colors.surface }]}>
        <Text style={{ fontSize: 20 }}>{sender?.emoji ?? '👤'}</Text>
      </View>

      <View style={{ maxWidth: '72%', gap: 2 }}>
        {/* Name + time */}
        {!isMine && (
          <Text style={[styles.bubbleSender, { color: colors.textTertiary, textAlign: isMine ? 'right' : 'left' }]}>
            {sender?.name.split(' ')[0]}
          </Text>
        )}

        {/* Bubble */}
        <Pressable onLongPress={onLongPress}
          style={[styles.bubble, {
            backgroundColor: isMine ? colors.primary : colors.card,
            borderColor: isMine ? 'transparent' : colors.border,
            alignSelf: isMine ? 'flex-end' : 'flex-start',
            borderBottomRightRadius: isMine ? 4 : RADIUS.xl,
            borderBottomLeftRadius:  isMine ? RADIUS.xl : 4,
          }]}>
          <Text style={[styles.bubbleText, { color: isMine ? '#fff' : colors.textPrimary }]}>
            {message.text}
          </Text>
        </Pressable>

        {/* Reactions */}
        {totalReactions > 0 && (
          <View style={[styles.reactions, { alignSelf: isMine ? 'flex-end' : 'flex-start' }]}>
            {Object.entries(message.reactions ?? {}).map(([emoji, ids]) =>
              ids.length > 0 ? (
                <Pressable key={emoji} onPress={() => onReact(emoji)}
                  style={[styles.reactionChip, {
                    backgroundColor: ids.includes(activeMemberId) ? colors.primaryLight : colors.surface,
                    borderColor: ids.includes(activeMemberId) ? colors.primary : colors.border,
                  }]}>
                  <Text style={{ fontSize: 12 }}>{emoji}</Text>
                  <Text style={[{ fontSize: 11, color: colors.textSecondary }]}>{ids.length}</Text>
                </Pressable>
              ) : null
            )}
          </View>
        )}

        <Text style={[styles.bubbleTime, { color: colors.textTertiary, textAlign: isMine ? 'right' : 'left' }]}>
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
}

// ─── Reaction picker ──────────────────────────────────────────────────────────

function ReactionPicker({ visible, onPick, onClose }: {
  visible: boolean; onPick: (emoji: string) => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.reactionOverlay} onPress={onClose}>
        <View style={[styles.reactionPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {QUICK_REACTIONS.map(e => (
            <Pressable key={e} onPress={() => { onPick(e); onClose(); }} style={styles.reactionOption}>
              <Text style={{ fontSize: 28 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const CHANNEL = 'family';
  const channelData = useChatStore(s => s.channels[CHANNEL]);
  const messages = channelData?.messages ?? [];
  const { loadChannel, sendMessage, addReaction, deleteMessage } = useChatStore();
  const [text, setText]       = useState('');
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadChannel(CHANNEL); }, []);
  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }, [messages.length]);

  const activeMember = members.find(m => m.id === activeMemberId);
  const memberMap    = Object.fromEntries(members.map(m => [m.id, m]));

  const handleSend = () => {
    if (!text.trim() || !activeMemberId) return;
    sendMessage(CHANNEL, activeMemberId, text.trim());
    setText('');
  };

  // Group by day
  const grouped: { label: string; msgs: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const label = formatDay(msg.timestamp);
    const last  = grouped[grouped.length - 1];
    if (last?.label === label) last.msgs.push(msg);
    else grouped.push({ label, msgs: [msg] });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.groupIcon, { backgroundColor: colors.primaryLight }]}>
            <Text style={{ fontSize: 22 }}>🏠</Text>
          </View>
          <View>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Family Chat</Text>
            <Text style={[styles.screenSub, { color: colors.textSecondary }]}>
              {members.map(m => m.emoji).join(' ')} {members.length} members
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Ionicons name="call-outline" size={22} color={colors.textSecondary} />
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {/* Messages */}
        <ScrollView
          ref={scrollRef} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {grouped.map(({ label, msgs }) => (
            <View key={label} style={{ gap: 12 }}>
              {/* Day divider */}
              <View style={styles.dayDivider}>
                <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dayLabel, { color: colors.textTertiary, backgroundColor: colors.background }]}>{label}</Text>
                <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
              </View>
              {msgs.map(msg => (
                <MessageBubble
                  key={msg.id} message={msg}
                  isMine={msg.senderId === activeMemberId}
                  sender={memberMap[msg.senderId]}
                  activeMemberId={activeMemberId ?? ''}
                  onLongPress={() => setPickerFor(msg.id)}
                  onReact={(emoji) => addReaction(CHANNEL, msg.id, emoji, activeMemberId ?? '')}
                />
              ))}
            </View>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={[styles.inputBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable style={{ padding: 4 }}>
              <Ionicons name="happy-outline" size={22} color={colors.textTertiary} />
            </Pressable>
            <TextInput
              value={text} onChangeText={setText} placeholder="Message..."
              placeholderTextColor={colors.placeholder} multiline maxLength={500}
              style={[styles.input, { color: colors.textPrimary }]}
              returnKeyType="default"
            />
            <Pressable style={{ padding: 4 }}>
              <Ionicons name="attach-outline" size={22} color={colors.textTertiary} />
            </Pressable>
          </View>
          <Pressable
            onPress={handleSend} disabled={!text.trim()}
            style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.surface }]}>
            <Ionicons name="send" size={18} color={text.trim() ? '#fff' : colors.textTertiary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ReactionPicker
        visible={!!pickerFor}
        onPick={(emoji) => { if (pickerFor && activeMemberId) addReaction(CHANNEL, pickerFor, emoji, activeMemberId); }}
        onClose={() => setPickerFor(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  screenTitle:    { fontSize: TYPO.body, fontWeight: '800' },
  screenSub:      { fontSize: 12, marginTop: 1 },
  groupIcon:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  dayDivider:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayLine:        { flex: 1, height: 1 },
  dayLabel:       { fontSize: 11, fontWeight: '600', paddingHorizontal: 8 },

  bubbleWrapper:  { marginBottom: 4 },
  bubbleAvatar:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bubbleSender:   { fontSize: 11, fontWeight: '600', marginBottom: 2, marginHorizontal: 4 },
  bubble:         { padding: 10, borderRadius: RADIUS.xl, borderWidth: 1, maxWidth: '100%' },
  bubbleText:     { fontSize: TYPO.body, lineHeight: 20 },
  bubbleTime:     { fontSize: 11, marginTop: 2, marginHorizontal: 4 },

  reactions:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionChip:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },

  reactionOverlay:{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  reactionPicker: { flexDirection: 'row', padding: 12, borderRadius: RADIUS.xl, borderWidth: 1, gap: 8 },
  reactionOption: { padding: 4 },

  inputBar:       { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10, borderTopWidth: 1 },
  inputBubble:    { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  input:          { flex: 1, fontSize: TYPO.body, maxHeight: 100, paddingVertical: 4 },
  sendBtn:        { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
