import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { EmojiAvatar } from '@/features/playdates/components/EmojiAvatar';
import type { EmojiPet } from '@/features/playdates/types';
import { TYPO } from '@/constants/theme';

interface ChatMessage {
  id: string;
  sender_id: string;
  message_type: 'text' | 'proposal' | 'system';
  content: string;
  proposed_date?: string | null;
  proposed_time?: string | null;
  proposed_location?: string | null;
  proposal_status?: 'pending' | 'accept' | 'reject' | 'cancelled' | null;
  created_at: string;
}

function relTime(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  userId: string | undefined;
  myPet: EmojiPet | null | undefined;
  otherPet: EmojiPet | null | undefined;
  ac: string;
  colors: any;
  s: any;
  sending: boolean;
  formatTime: (isoOrDate: string | Date) => string;
  onRespondToProposal: (id: string, response: 'accept' | 'reject') => void;
  onCancelProposal: (id: string) => void;
  onProposeNew: (id: string) => void;
}

export const ChatMessageList = React.memo(function ChatMessageList({
  messages, userId, myPet, otherPet, ac, colors, s, sending,
  formatTime, onRespondToProposal, onCancelProposal, onProposeNew,
}: ChatMessageListProps) {
  return (
    <>
      {messages.map((msg, idx) => {
        const isMe  = msg.sender_id === userId;
        const pet   = isMe ? myPet : otherPet;
        const msgAc = pet?.accent_color ?? ac;

        if (msg.message_type === 'system') {
          return (
            <View key={msg.id} style={{ alignItems: 'center', marginVertical: 4 }}>
              <View style={{ backgroundColor: `${ac}18`, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: ac }}>{msg.content}</Text>
              </View>
            </View>
          );
        }

        if (msg.message_type === 'proposal') {
          const isPending   = msg.proposal_status === 'pending';
          const isAccepted  = msg.proposal_status === 'accept';
          const isRejected  = msg.proposal_status === 'reject';
          const isCancelled = msg.proposal_status === 'cancelled';
          const borderColor = isAccepted ? colors.success + '50' : isRejected || isCancelled ? colors.danger + '40' : msgAc + '50';
          const barColor    = isAccepted ? colors.success : isRejected || isCancelled ? colors.danger : msgAc;
          return (
            <View key={msg.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, justifyContent: 'center' }}>
                <EmojiAvatar pet={pet} size={18} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: msgAc }}>{isMe ? `${myPet?.name} proposed` : `${otherPet?.name} proposed`}</Text>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{relTime(msg.created_at)}</Text>
              </View>
              <View style={[s.proposalCard, { backgroundColor: colors.card, borderColor }]}>
                <View style={[s.accentBar, { backgroundColor: barColor }]} />
                <View style={{ paddingLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, marginBottom: 6, lineHeight: 21 }}>{msg.content}</Text>
                  {msg.proposed_location ? (
                    <View style={s.propRow}>
                      <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{msg.proposed_location}</Text>
                    </View>
                  ) : null}
                  {isPending && !isMe ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <TouchableOpacity style={[s.propBtn, { backgroundColor: colors.dangerLight, borderWidth: 1, borderColor: colors.danger + '50' }]}
                        onPress={() => onProposeNew(msg.id)} disabled={sending}>
                        <Text style={{ color: colors.danger, fontWeight: '700', fontSize: TYPO.body }}>📅  Propose new</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.propBtn, { backgroundColor: colors.success }]}
                        onPress={() => onRespondToProposal(msg.id, 'accept')} disabled={sending}>
                        {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>✓  Accept</Text>}
                      </TouchableOpacity>
                    </View>
                  ) : isPending && isMe ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="time-outline" size={13} color={colors.warning} />
                        <Text style={{ fontSize: TYPO.body, color: colors.warning, fontWeight: '600' }}>Waiting for {otherPet?.name}…</Text>
                      </View>
                      <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.danger + '60', backgroundColor: colors.dangerLight }}
                        onPress={() => onCancelProposal(msg.id)} disabled={sending}>
                        <Text style={{ fontSize: TYPO.body, color: colors.danger, fontWeight: '700' }}>↩️ Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : isAccepted ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.success }}>Accepted · Playdate confirmed!</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                      <Ionicons name="close-circle" size={14} color={colors.danger} />
                      <Text style={{ fontSize: TYPO.body, color: colors.danger }}>{isCancelled ? 'Cancelled' : 'Declined'} · Propose another time</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        }

        const prevMsg = messages[idx - 1];
        const nextMsg = messages[idx + 1];
        const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id || prevMsg.message_type !== 'text';
        const isLastInGroup  = !nextMsg || nextMsg.sender_id !== msg.sender_id || nextMsg.message_type !== 'text';

        return (
          <View key={msg.id} style={[s.msgRow, isMe && s.msgRowRight, { marginBottom: isLastInGroup ? 10 : 2 }]}>
            {!isMe && (
              <View style={{ width: 34, alignSelf: 'flex-end', marginBottom: 2 }}>
                {isLastInGroup ? <EmojiAvatar pet={pet} size={32} /> : null}
              </View>
            )}
            <View style={{ maxWidth: '72%' }}>
              {isFirstInGroup && (
                <Text style={[s.senderName, { color: msgAc, textAlign: isMe ? 'right' : 'left' }]}>
                  {isMe ? (myPet?.name ?? 'You') : (otherPet?.name ?? 'Them')}
                </Text>
              )}
              <View style={[s.bubble, isMe
                ? { backgroundColor: msgAc, borderBottomRightRadius: isLastInGroup ? 4 : 18 }
                : { backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: isLastInGroup ? 4 : 18 }]}>
                <Text style={[s.bubbleText, { color: isMe ? '#fff' : colors.textPrimary }]}>{msg.content}</Text>
              </View>
              {isLastInGroup && (
                <Text style={[s.msgTime, { color: colors.textSecondary, textAlign: isMe ? 'right' : 'left' }]}>{formatTime(msg.created_at)}</Text>
              )}
            </View>
            {isMe && (
              <View style={{ width: 34, alignSelf: 'flex-end', marginBottom: 2 }}>
                {isLastInGroup ? <EmojiAvatar pet={myPet} size={32} /> : null}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
});
