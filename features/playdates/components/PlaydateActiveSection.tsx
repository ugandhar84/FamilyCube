import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { fmtDate, fmtTime } from '@/features/playdates/components/playdateDetailTypes';
import type { Proposal, Pet } from '@/features/playdates/components/playdateDetailTypes';
import { TYPO } from '@/constants/theme';

interface Props {
  currentProposal: Proposal | null;
  iAmProposer: boolean;
  iAmFrom: boolean;
  otherPet: Pet | null;
  ac: string;
  working: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCounter: () => void;
  // Initial request fields — shown when no counter-proposal exists yet
  requestProposedDate?: string | null;
  requestProposedTime?: string | null;
  requestProposedEndTime?: string | null;
  requestProposedLocation?: string | null;
  requestMessage?: string | null;
}

function PlaydateActiveSection({
  currentProposal, iAmProposer, iAmFrom, otherPet, ac, working, onAccept, onDecline, onCounter,
  requestProposedDate, requestProposedTime, requestProposedEndTime, requestProposedLocation, requestMessage,
}: Props) {
  const { colors } = useTheme();

  // Synthesise a display proposal from the request's own fields when no counter-proposal exists yet
  const displayProposal = currentProposal ?? (requestProposedDate ? {
    proposed_date: requestProposedDate,
    proposed_time: requestProposedTime ?? null,
    proposed_end_time: requestProposedEndTime ?? null,
    proposed_location: requestProposedLocation ?? null,
    message: requestMessage ?? null,
    round: 0,
    proposed_by_owner_id: null, // used below to decide iAmProposer for display
  } as any : null);

  // For initial request: from-side is the proposer
  const displayIsProposer = currentProposal ? iAmProposer : iAmFrom;

  if (displayProposal) {
    const stripColor = displayIsProposer ? '#FF8C55' : ac;
    const label = displayIsProposer
      ? displayProposal.round > 0 ? `YOU PROPOSED · Round ${displayProposal.round}` : 'YOUR REQUEST'
      : displayProposal.round > 0
        ? `${otherPet?.name?.toUpperCase() ?? ''} PROPOSED · Round ${displayProposal.round}`
        : `${otherPet?.name?.toUpperCase() ?? ''}'S REQUEST`;

    return (
      <View style={[s.card, { backgroundColor: colors.card, borderColor: `${ac}40` }]}>
        <View style={[s.cardStrip, { backgroundColor: stripColor }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5, color: colors.textSecondary }}>{label}</Text>
          <View style={s.row}>
            <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{fmtDate(displayProposal.proposed_date)}</Text>
          </View>
          {displayProposal.proposed_time && (
            <View style={s.row}>
              <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>
                {fmtTime(displayProposal.proposed_time)}
                {displayProposal.proposed_end_time ? ` → ${fmtTime(displayProposal.proposed_end_time)}` : ''}
              </Text>
            </View>
          )}
          {displayProposal.proposed_location && (
            <View style={s.row}>
              <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{displayProposal.proposed_location}</Text>
            </View>
          )}
          {displayProposal.message && (
            <View style={s.row}>
              <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', flex: 1 }}>"{displayProposal.message}"</Text>
            </View>
          )}

          {displayIsProposer ? (
            <View style={[s.waitingRow, { backgroundColor: '#FF8C5512' }]}>
              <Ionicons name="time-outline" size={13} color="#FF8C55" />
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#FF8C55', flex: 1 }}>
                Waiting for {otherPet?.name}…
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: colors.inputBg, borderColor: '#E24B4A', borderWidth: 1, flex: 1 }]}
                onPress={onDecline} disabled={working}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#E24B4A' }}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: `${ac}18`, borderColor: ac, borderWidth: 1, flex: 1 }]}
                onPress={onCounter} disabled={working}>
                <Ionicons name="calendar-outline" size={13} color={ac} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>New time</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: '#22C55E', flex: 1 }]}
                onPress={onAccept} disabled={working}>
                {working
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Accept ✓</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  // No current proposal — show waiting/initial state
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[s.cardStrip, { backgroundColor: '#FF8C55' }]} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>
          {iAmFrom
            ? `Waiting for ${otherPet?.name}'s parent to respond…`
            : `${otherPet?.name}'s parent sent a request — no time proposed yet.`}
        </Text>
        {!iAmFrom && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.inputBg, borderColor: '#E24B4A', borderWidth: 1, flex: 1 }]}
              onPress={onDecline} disabled={working}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#E24B4A' }}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: `${ac}18`, borderColor: ac, borderWidth: 1, flex: 2 }]}
              onPress={onCounter} disabled={working}>
              <Ionicons name="calendar-outline" size={13} color={ac} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>Propose a time</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

export default React.memo(PlaydateActiveSection);

const s = StyleSheet.create({
  card:       { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden', paddingVertical: 14, paddingRight: 14 },
  cardStrip:  { width: 4, marginRight: 12 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 8 },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10 },
});
