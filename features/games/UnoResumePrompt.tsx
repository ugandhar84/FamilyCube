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
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { TYPO, RADIUS } from '@/constants/theme';
import { type UnoGame } from '@/store/gameStore';

export function UnoResumePrompt({ game, colors }: { game: UnoGame; colors: any }) {
  const isLobby = game.status === 'lobby';
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
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/hub/games/uno' as any, params: { gameId: game.id } })}
        style={{ borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.accent }}
      >
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
          {isLobby ? 'Join Table' : 'Resume Game'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
