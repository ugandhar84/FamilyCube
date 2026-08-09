import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

interface Props {
  isAccepted: boolean;
  isActive: boolean;
  iAmFrom: boolean;
  iAmProposer: boolean;
  working: boolean;
  bottomInset: number;
  onCancel: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
}

function PlaydateFAB({ isAccepted, isActive, iAmFrom, iAmProposer, working, bottomInset, onCancel, onDecline, onWithdraw }: Props) {
  const showCancel   = isAccepted;
  const showWithdraw = isActive && iAmFrom;
  const showDecline  = isActive && !iAmFrom;

  if (!showCancel && !showWithdraw && !showDecline) return null;

  const label  = showCancel ? 'Cancel Playdate' : showDecline ? 'Decline' : 'Withdraw';
  const icon   = showCancel ? 'close-circle-outline' : showDecline ? 'thumbs-down-outline' : 'arrow-undo-outline';
  const action = showCancel ? onCancel : showDecline ? onDecline : onWithdraw;

  return (
    <TouchableOpacity
      onPress={action}
      disabled={working}
      style={[s.fab, { bottom: bottomInset + 20 }]}>
      {working
        ? <ActivityIndicator size="small" color="#fff" />
        : <>
            <Ionicons name={icon as any} size={20} color="#fff" />
            <Text style={s.fabLabel}>{label}</Text>
          </>
      }
    </TouchableOpacity>
  );
}

export default React.memo(PlaydateFAB);

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#E24B4A',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#E24B4A',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
  fabLabel: { color: '#fff', fontWeight: '700', fontSize: TYPO.body },
});
