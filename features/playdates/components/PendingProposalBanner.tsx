import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { TYPO } from '@/constants/theme';

interface PendingProposal {
  id: string;
  proposed_date: string;
  proposed_time: string;
  proposed_end_time?: string | null;
  proposed_location?: string | null;
  message?: string | null;
  proposed_by_owner_id: string;
}

interface PendingProposalBannerProps {
  pendingProposal: PendingProposal;
  userId: string | undefined;
  otherPetName: string | undefined;
  ac: string;
  colors: any;
  formatTime: (isoOrDate: string | Date) => string;
  onAccept: () => void;
  onProposeNew: () => void;
}

export const PendingProposalBanner = React.memo(function PendingProposalBanner({
  pendingProposal, userId, otherPetName, ac, colors, formatTime, onAccept, onProposeNew,
}: PendingProposalBannerProps) {
  const iProposed = pendingProposal.proposed_by_owner_id === userId;

  const fmtD2 = (d: string) => { try { return format(parseISO(d), 'EEE, MMM d'); } catch { return d; } };
  const fmtT2 = (t: string) => {
    try {
      const [h, m] = t.split(':').map(Number);
      const tmp = new Date(); tmp.setHours(h, m, 0, 0);
      return formatTime(tmp);
    } catch { return t.slice(0, 5); }
  };

  return (
    <View style={{ marginHorizontal: 12, marginTop: 8, marginBottom: 2, borderRadius: 16, borderWidth: 1.5,
      borderColor: iProposed ? '#94A3B830' : `${ac}30`,
      backgroundColor: iProposed ? '#94A3B810' : `${ac}10`,
      paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={iProposed ? 'time-outline' : 'alert-circle-outline'} size={14} color={iProposed ? '#94A3B8' : ac} />
        <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: iProposed ? '#94A3B8' : ac }}>
          {iProposed ? `Waiting for ${otherPetName ?? 'them'} to respond…` : `${otherPetName ?? 'They'} proposed a new time`}
        </Text>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{fmtD2(pendingProposal.proposed_date)}</Text>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
          🕐 {fmtT2(pendingProposal.proposed_time)}{pendingProposal.proposed_end_time ? ` → ${fmtT2(pendingProposal.proposed_end_time)}` : ''}
          {pendingProposal.proposed_location ? `  📍 ${pendingProposal.proposed_location}` : ''}
        </Text>
        {pendingProposal.message ? <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>"{pendingProposal.message}"</Text> : null}
      </View>
      {!iProposed && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <TouchableOpacity style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center' }} onPress={onAccept}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>✓ Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: ac, backgroundColor: `${ac}12`, alignItems: 'center' }} onPress={onProposeNew}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>New time</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});
