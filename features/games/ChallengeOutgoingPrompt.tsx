/**
 * ChallengeOutgoingPrompt — shows a challenge the current member SENT and
 * is still waiting on, with a Cancel action. Without this, a pending
 * outgoing challenge had no UI path to clear at all — it just silently
 * blocked re-challenging the same person (create_game_challenge raises
 * "a pending challenge already exists") until the 24h cron sweep expired
 * it, with no visible reason why in the app itself.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useGameStore, type GameSession } from '@/store/gameStore';

const GAME_LABEL: Record<string, string> = { tic_tac_toe: 'Tic-Tac-Toe', memory: 'Memory' };

export function ChallengeOutgoingPrompt({ session, colors }: { session: GameSession; colors: any }) {
  const members = useFamilyStore(s => s.members);
  const cancelChallenge = useGameStore(s => s.cancelChallenge);
  const [cancelling, setCancelling] = useState(false);

  const challenged = members.find(m => m.id === session.challengedId);
  const gameLabel = GAME_LABEL[session.gameType] ?? session.gameType;

  const handleCancel = async () => {
    setCancelling(true);
    try { await cancelChallenge(session.id); } finally { setCancelling(false); }
  };

  return (
    <View style={{
      borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.card, padding: 14, marginTop: 8, gap: 10,
    }}>
      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
        Waiting for {challenged?.name?.split(' ')[0] ?? 'them'} to accept your {gameLabel} challenge
      </Text>
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, textTransform: 'capitalize' }}>
        {session.difficulty} difficulty
      </Text>
      <TouchableOpacity
        onPress={handleCancel}
        disabled={cancelling}
        style={{ borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        {cancelling ? <ActivityIndicator size="small" color={colors.textSecondary} /> : (
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textSecondary }}>Cancel Challenge</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
