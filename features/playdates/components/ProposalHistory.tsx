import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { fmtDate, fmtTime, relTime } from '@/features/playdates/components/playdateDetailTypes';
import type { Proposal, Pet } from '@/features/playdates/components/playdateDetailTypes';
import { TYPO } from '@/constants/theme';

interface Props {
  proposals: Proposal[];
  userId: string | undefined;
  myPet: Pet | null;
  otherPet: Pet | null;
  ac: string;
  isTerminal: boolean;
  requestStatus: string;
}

function Avatar({ pet, size = 30 }: { pet: Pet | null; size?: number }) {
  const ac = pet?.accent_color ?? '#7C5CBF';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', flexShrink: 0 }}>
      {pet?.avatar_url
        ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk" style={{ width: size, height: size }} contentFit="cover" />
        : <LinearGradient colors={[ac + '50', ac + '20']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.46 }}>{pet?.emoji ?? '🐾'}</Text>
          </LinearGradient>
      }
    </View>
  );
}

function ProposalHistory({ proposals, userId, myPet, otherPet, ac, isTerminal, requestStatus }: Props) {
  const { colors } = useTheme();

  if (proposals.length === 0) return null;

  const sorted = [...proposals].sort((a, b) => a.round - b.round);

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', letterSpacing: 0.8, color: colors.textSecondary, textTransform: 'uppercase' }}>
          Negotiation thread
        </Text>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{proposals.length} round{proposals.length !== 1 ? 's' : ''}</Text>
      </View>

      {sorted.map((p, idx) => {
        const isMe     = p.proposed_by_owner_id === userId;
        const pet      = isMe ? myPet : otherPet;
        const propAc   = pet?.accent_color ?? ac;
        const isLast   = idx === sorted.length - 1;
        const acceptedButTerminal = p.status === 'accepted' && isTerminal;

        const statusColor = acceptedButTerminal ? '#94A3B8'
          : p.status === 'accepted'   ? '#22C55E'
          : p.status === 'declined'   ? '#E24B4A'
          : p.status === 'superseded' ? '#94A3B8'
          : propAc;

        const statusLabel = p.status === 'pending'    ? (isLast ? '⏳ Awaiting reply' : 'Pending')
          : p.status === 'accepted'   ? (acceptedButTerminal ? `✓ Accepted · ${requestStatus}` : '✅ Accepted!')
          : p.status === 'declined'   ? '✗ Declined'
          : '↩ Countered';

        return (
          <View key={p.id}>
            {/* Connector line between bubbles */}
            {idx > 0 && (
              <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', paddingHorizontal: 48 }}>
                <View style={{ width: 1.5, height: 12, backgroundColor: colors.border, marginVertical: -2 }} />
              </View>
            )}

            <View style={[s.row, isMe ? s.rowRight : s.rowLeft]}>
              {!isMe && <Avatar pet={pet} size={30} />}

              <View style={[s.bubble, isMe ? s.bubbleRight : s.bubbleLeft, {
                backgroundColor: isMe ? propAc + '18' : colors.card,
                borderColor: isMe ? propAc + '35' : colors.border,
                maxWidth: '78%',
              }]}>
                {/* Bubble header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: propAc }}>
                    {isMe ? `You (${myPet?.name ?? 'your pet'})` : (pet?.name ?? 'Them')}
                  </Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginLeft: 'auto' }}>
                    Round {p.round} · {relTime(p.created_at)}
                  </Text>
                </View>

                {/* Date */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <Ionicons name="calendar-outline" size={13} color={propAc} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                    {fmtDate(p.proposed_date)}
                  </Text>
                </View>

                {/* Time */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: p.proposed_location || p.message ? 3 : 0 }}>
                  <Ionicons name="time-outline" size={13} color={propAc} />
                  <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary }}>
                    {fmtTime(p.proposed_time)}
                    {p.proposed_end_time ? ` → ${fmtTime(p.proposed_end_time)}` : ''}
                  </Text>
                </View>

                {/* Location */}
                {p.proposed_location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: p.message ? 3 : 0 }}>
                    <Ionicons name="location-outline" size={13} color={propAc} />
                    <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary }}>{p.proposed_location}</Text>
                  </View>
                )}

                {/* Note */}
                {p.message && (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={13} color={propAc} style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontStyle: 'italic', flex: 1 }}>
                      "{p.message}"
                    </Text>
                  </View>
                )}

                {/* Status pill */}
                <View style={[s.statusRow, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
                  <View style={[s.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor + '30' }]}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                  </View>
                </View>
              </View>

              {isMe && <Avatar pet={pet} size={30} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default React.memo(ProposalHistory);

const s = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowLeft:    { justifyContent: 'flex-start' },
  rowRight:   { justifyContent: 'flex-end' },
  bubble:     { borderRadius: 16, borderWidth: 1, padding: 12 },
  bubbleLeft: { borderBottomLeftRadius: 4 },
  bubbleRight:{ borderBottomRightRadius: 4 },
  statusRow:  { flexDirection: 'row', marginTop: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
});
