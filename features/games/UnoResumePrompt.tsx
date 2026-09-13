/**
 * UnoResumePrompt — "Uno table waiting, tap to join" card. Uno has no
 * accept/decline invite step at all (create_uno_game seats every human
 * member up front and goes straight to 'active') — a seated player's only
 * way to discover the table was a one-shot push notification, easy to
 * miss entirely [live-reported: "once the family member joins they are
 * unable to play their game" — traced to this missing "how do I find the
 * table" gap]. Same card style/slot as ChallengeResumePrompt for
 * Tic-Tac-Toe/Memory.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { TYPO, RADIUS } from '@/constants/theme';
import { useGameStore, type UnoGame } from '@/store/gameStore';
import { showAlert } from '@/components/AppAlert';

export function UnoResumePrompt({ game, colors }: { game: UnoGame; colors: any }) {
  const isLobby = game.status === 'lobby';
  const leaveUnoGame = useGameStore(s => s.leaveUnoGame);
  const [leaving, setLeaving] = useState(false);

  // Was Resume/Join-only — no way to walk away from a stale/unwanted
  // table without opening it [live-reported: "why there is no leave
  // option on the resume card"]. Ends the table for every seated player
  // (leave_uno_game), same as Tic-Tac-Toe's own forfeit-ends-it shape.
  const handleLeave = () => {
    showAlert('Leave this Uno table?', 'This ends the table for everyone seated.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave Table', style: 'destructive',
        onPress: async () => { setLeaving(true); await leaveUnoGame(game.id); setLeaving(false); },
      },
    ]);
  };

  return (
    <View style={{
      borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.accent + '60',
      backgroundColor: colors.card, padding: 14, marginTop: 8, gap: 10,
    }}>
      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
        🎴 Uno table {isLobby ? 'waiting for you' : 'in progress'}
      </Text>
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
        {isLobby ? 'Tap to take your seat' : 'Tap to rejoin the table'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/hub/games/uno' as any, params: { gameId: game.id } })}
          style={{ flex: 1, borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.accent }}
        >
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
            {isLobby ? 'Join Table' : 'Resume Game'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleLeave}
          disabled={leaving}
          style={{ borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.danger }}
        >
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>{leaving ? '…' : 'Leave'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
