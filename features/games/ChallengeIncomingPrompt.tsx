/**
 * ChallengeIncomingPrompt — accept/decline card for a pending challenge,
 * rendered inline in FamilyGamesSection (Hub). Plain app-theme styling,
 * same slot pattern ActionNeededSection uses for ride/grocery request cards.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useGameStore, type GameSession } from '@/store/gameStore';
import { showAlert } from '@/components/AppAlert';

const GAME_LABEL: Record<string, string> = { tic_tac_toe: 'Tic-Tac-Toe', memory: 'Memory' };
const GAME_ROUTE: Record<string, '/hub/games/tic-tac-toe' | '/hub/games/memory'> = {
  tic_tac_toe: '/hub/games/tic-tac-toe', memory: '/hub/games/memory',
};

export function ChallengeIncomingPrompt({ session, colors, isDark }: { session: GameSession; colors: any; isDark: boolean }) {
  const members = useFamilyStore(s => s.members);
  const acceptChallenge = useGameStore(s => s.acceptChallenge);
  const declineChallenge = useGameStore(s => s.declineChallenge);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  const challenger = members.find(m => m.id === session.challengerId);
  const gameLabel = GAME_LABEL[session.gameType] ?? session.gameType;

  const handleAccept = async () => {
    setBusy('accept');
    try {
      const updated = await acceptChallenge(session.id);
      if (!updated) { showAlert('Could not accept', 'Please try again.'); return; }
      router.push({ pathname: GAME_ROUTE[session.gameType] as any, params: { mode: 'multiplayer', sessionId: session.id } });
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async () => {
    setBusy('decline');
    try { await declineChallenge(session.id); } finally { setBusy(null); }
  };

  return (
    <View style={{
      borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.card, padding: 14, marginTop: 8, gap: 10,
    }}>
      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
        {challenger?.name?.split(' ')[0] ?? 'Someone'} challenged you to {gameLabel}!
      </Text>
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, textTransform: 'capitalize' }}>
        {session.difficulty} difficulty
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={handleDecline}
          disabled={busy !== null}
          style={{ flex: 1, borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          {busy === 'decline' ? <ActivityIndicator size="small" color={colors.textSecondary} /> : (
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textSecondary }}>Decline</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleAccept}
          disabled={busy !== null}
          style={{ flex: 1, borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.primary }}
        >
          {busy === 'accept' ? <ActivityIndicator size="small" color="#fff" /> : (
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Accept</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
