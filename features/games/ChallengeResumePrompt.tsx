/**
 * ChallengeResumePrompt — "Game in progress with X, tap to resume" card for
 * an 'active' game_sessions row the current member participates in. Was
 * MISSING entirely — game_sessions.board_state already persists correctly
 * across a force-close (see submit_game_move's own transactional write),
 * but there was no way back INTO that session from a cold start: sessionId
 * only ever existed as a navigation param, never a persisted "which game
 * was I in" pointer, so a relaunch dropped the player on the Hub with no
 * path back to their board (live-requested: rejoin-after-close support,
 * same card style as ChallengeIncomingPrompt/ChallengeOutgoingPrompt).
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useGameStore, type GameSession } from '@/store/gameStore';
import { showAlert } from '@/components/AppAlert';

const GAME_LABEL: Record<string, string> = { tic_tac_toe: 'Tic-Tac-Toe', memory: 'Memory' };
const GAME_ROUTE: Record<string, '/hub/games/tic-tac-toe' | '/hub/games/memory'> = {
  tic_tac_toe: '/hub/games/tic-tac-toe', memory: '/hub/games/memory',
};

export function ChallengeResumePrompt({ session, colors, activeMemberId }: { session: GameSession; colors: any; activeMemberId: string }) {
  const members = useFamilyStore(s => s.members);
  const leaveGame = useGameStore(s => s.leaveGame);
  const [leaving, setLeaving] = useState(false);
  const opponentId = session.challengerId === activeMemberId ? session.challengedId : session.challengerId;
  const opponent = members.find(m => m.id === opponentId);
  const gameLabel = GAME_LABEL[session.gameType] ?? session.gameType;
  const myTurn = session.currentTurnMemberId === activeMemberId;

  // Was Resume-only — the only way to walk away from a stale/unwanted
  // active game was to open it and find the in-game Leave button there
  // [live-requested: "we should have the resume or leave button on that
  // card"]. leaveGame() already exists and is exactly what the in-game
  // screens call — reused here directly so this card can end the game
  // without navigating into it first.
  const handleLeave = () => {
    showAlert('Leave this game?', `${opponent?.name?.split(' ')[0] ?? 'They'} will be credited the win.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave Game', style: 'destructive',
        onPress: async () => { setLeaving(true); await leaveGame(session.id); setLeaving(false); },
      },
    ]);
  };

  return (
    <View style={{
      borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.accent + '60',
      backgroundColor: colors.card, padding: 14, marginTop: 8, gap: 10,
    }}>
      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
        {gameLabel} in progress with {opponent?.name?.split(' ')[0] ?? 'them'}
      </Text>
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
        {myTurn ? "It's your turn" : `Waiting on ${opponent?.name?.split(' ')[0] ?? 'them'}`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: GAME_ROUTE[session.gameType] as any, params: { mode: 'multiplayer', sessionId: session.id } })}
          style={{ flex: 1, borderRadius: RADIUS.md, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.accent }}
        >
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Resume Game</Text>
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
