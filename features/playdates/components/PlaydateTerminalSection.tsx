import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PlaydateRequest, Pet } from '@/features/playdates/components/playdateDetailTypes';
import { TYPO } from '@/constants/theme';

interface Props {
  request: PlaydateRequest;
  userId: string | undefined;
  myPet: Pet | null;
  otherPet: Pet | null;
}

function PlaydateTerminalSection({ request, userId, myPet, otherPet }: Props) {
  const canceller = request.responder_user_id
    ? (request.responder_user_id === userId ? myPet : otherPet)
    : null;
  const cancellerName = canceller?.name ?? null;
  const cancellerEmoji = canceller?.emoji ?? '';

  let headline = '';
  if (request.status === 'declined')       headline = 'This request was declined. You can send a new one from Nearby.';
  else if (request.status === 'withdrawn') headline = 'This request was withdrawn.';
  else if (request.status === 'expired')   headline = 'This request expired before anyone responded.';
  else if (request.status === 'completed') headline = 'This playdate has been completed. Hope it was a great time! 🐾';
  else if (request.status === 'cancelled' && cancellerName) headline = `${cancellerEmoji} ${cancellerName} cancelled this playdate.`;
  else                                     headline = 'This playdate was cancelled.';

  return (
    <View style={[s.card, { backgroundColor: '#94A3B812', borderColor: '#94A3B830' }]}>
      <View style={[s.cardStrip, { backgroundColor: '#94A3B8' }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ fontSize: TYPO.body, color: '#94A3B8', fontWeight: '600' }}>{headline}</Text>
        {request.cancel_reason ? (
          <View style={s.reasonRow}>
            <Text style={{ fontSize: TYPO.body }}>💬</Text>
            <Text style={{ fontSize: TYPO.body, color: '#94A3B8', fontStyle: 'italic', flex: 1 }}>
              "{request.cancel_reason}"
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(PlaydateTerminalSection);

const s = StyleSheet.create({
  card:      { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden', paddingVertical: 14, paddingRight: 14 },
  cardStrip: { width: 4, marginRight: 12 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#94A3B810', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
});
