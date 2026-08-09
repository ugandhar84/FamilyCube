import React, { RefObject } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { format, parseISO } from 'date-fns';
import { formatTime } from '@/lib/units';

function initials(name: string) {
  return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function msgTime(iso: string) {
  try {
    const d = parseISO(iso);
    return d.toDateString() === new Date().toDateString()
      ? formatTime(d)
      : `${format(d, 'MMM d')} · ${formatTime(d)}`;
  } catch { return ''; }
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  message: string;
  sent_at: string;
  sender: { full_name: string; handle?: string | null } | null;
}

interface EventChatMessagesProps {
  messages: ChatMessage[];
  userId: string | undefined;
  organizerId: string;
  ac: string;
  colors: any;
  isParticipant: boolean;
  scrollRef: RefObject<ScrollView | null>;
  onContentSizeChange: () => void;
}

function EventChatMessagesBase({
  messages, userId, organizerId, ac, colors, isParticipant, scrollRef, onContentSizeChange,
}: EventChatMessagesProps) {
  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={s.list}
      alwaysBounceVertical={false}
      overScrollMode="never"
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={onContentSizeChange}
    >
      {messages.length === 0 && (
        <View style={s.empty}>
          <Text style={{ fontSize: 36 }}>🐾</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
            {isParticipant ? 'Start the conversation' : 'RSVP to join the chat'}
          </Text>
          <Text style={[s.emptySub, { color: colors.textSecondary }]}>
            {isParticipant
              ? 'Ask the organizer questions, share details, coordinate with attendees.'
              : 'Only attendees and the organizer can chat here.'}
          </Text>
        </View>
      )}

      {messages.map(m => {
        const isMine = m.sender_id === userId;
        const isOrg  = m.sender_id === organizerId;
        return (
          <View key={m.id} style={[s.msgRow, isMine && s.msgRowRight]}>
            {!isMine && (
              <View style={[s.avatar, { backgroundColor: isOrg ? `${ac}20` : `${colors.textTertiary}18` }]}>
                <Text style={[s.avatarText, { color: isOrg ? ac : colors.textSecondary }]}>
                  {initials(m.sender?.handle ?? '?')}
                </Text>
              </View>
            )}
            <View style={{ maxWidth: '72%' }}>
              {!isMine && (
                <Text style={[s.senderName, { color: isOrg ? ac : colors.textSecondary }]}>
                  {m.sender?.handle ? `@${m.sender.handle}` : 'PawBond user'}{isOrg ? ' · Organizer' : ''}
                </Text>
              )}
              <View style={[
                s.bubble,
                isMine
                  ? { backgroundColor: ac }
                  : { backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1 },
              ]}>
                <Text style={[s.bubbleText, { color: isMine ? '#fff' : colors.textPrimary }]}>
                  {m.message}
                </Text>
              </View>
              <Text style={[s.msgTime, { color: colors.textSecondary, alignSelf: isMine ? 'flex-end' : 'flex-start' }]}>
                {msgTime(m.sent_at)}
              </Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

export const EventChatMessages = React.memo(EventChatMessagesBase);

const s = StyleSheet.create({
  list:        { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 20, gap: 10 },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:  { fontSize: TYPO.subheading, fontWeight: '700' },
  emptySub:    { fontSize: TYPO.body, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  msgRow:      { flexDirection: 'row', gap: 8, alignSelf: 'flex-start' },
  msgRowRight: { alignSelf: 'flex-end' },
  avatar:      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  avatarText:  { fontSize: TYPO.body, fontWeight: '700' },
  senderName:  { fontSize: TYPO.body, fontWeight: '600', marginBottom: 3, marginLeft: 2 },
  bubble:      { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText:  { fontSize: TYPO.body, lineHeight: 21 },
  msgTime:     { fontSize: TYPO.body, marginTop: 3, marginHorizontal: 4 },
});
