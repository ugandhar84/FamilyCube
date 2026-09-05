/**
 * ChallengeInviteSheet — "who do you want to challenge?" picker for
 * Tic-Tac-Toe/Memory multiplayer. Deliberately uses the app's normal
 * AppBottomSheet rather than arcade styling — member-picker UI (avatars,
 * selection checkmarks) is a system-native interaction pattern reused as-is
 * across the app (rides, chores, delegation), so it stays in the plain
 * theme even though it's launched from GameLauncherScreen's arcade screen.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import AppBottomSheet from '@/components/AppBottomSheet';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useGameStore, type GameType, type Difficulty } from '@/store/gameStore';
import { showAlert } from '@/components/AppAlert';
import { showToast } from '@/components/AppToast';

export default function ChallengeInviteSheet({
  visible, onClose, gameType, difficulty, gameLabel, gameRoute,
}: {
  visible: boolean;
  onClose: () => void;
  gameType: GameType;
  difficulty: Difficulty;
  gameLabel: string;
  gameRoute: '/hub/games/tic-tac-toe' | '/hub/games/memory';
}) {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const createChallenge = useGameStore(s => s.createChallenge);
  const outgoingChallenges = useGameStore(s => s.outgoingChallenges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const opponents = members.filter(m => m.id !== activeMemberId);
  const siblings = members.map(m => m.name);
  const hasExistingChallenge = !!selectedId && outgoingChallenges.some(c => c.gameType === gameType && c.challengedId === selectedId);

  const handleSend = async () => {
    if (!selectedId) return;
    setSending(true);
    try {
      // Already have a pending challenge with this person for this game?
      // Jump straight back into its waiting screen instead of hitting the
      // RPC's own "a pending challenge already exists" rejection — that
      // error existing at all only makes sense as a safety net, never as
      // the everyday path for "I already challenged them, let me check in."
      const existing = outgoingChallenges.find(c => c.gameType === gameType && c.challengedId === selectedId);
      if (existing) {
        onClose();
        setSelectedId(null);
        router.push({ pathname: gameRoute as any, params: { mode: 'multiplayer', sessionId: existing.id } });
        return;
      }

      const session = await createChallenge(gameType, difficulty, selectedId);
      if (!session) {
        const message = useGameStore.getState().lastChallengeError ?? 'Please try again.';
        showAlert('Could not send challenge', message);
        return;
      }
      onClose();
      setSelectedId(null);
      showToast(`Challenge sent to ${members.find(m => m.id === selectedId)?.name?.split(' ')[0] ?? 'them'}`);
      router.push({ pathname: gameRoute as any, params: { mode: 'multiplayer', sessionId: session.id } });
    } finally {
      setSending(false);
    }
  };

  return (
    <AppBottomSheet
      visible={visible}
      onClose={() => { onClose(); setSelectedId(null); }}
      title={`Challenge to ${gameLabel}`}
      subtitle="Who do you want to play against?"
      minHeight="40%"
      footer={
        <TouchableOpacity
          onPress={handleSend}
          disabled={!selectedId || sending}
          style={{
            borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center',
            backgroundColor: selectedId ? colors.primary : colors.border,
          }}
        >
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>
            {sending ? 'Sending…' : hasExistingChallenge ? 'Go to Waiting Game' : 'Send Challenge'}
          </Text>
        </TouchableOpacity>
      }
    >
      <View style={{ gap: 8 }}>
        {opponents.length === 0 && (
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 }}>
            No other family members to challenge yet.
          </Text>
        )}
        {opponents.map(m => {
          const sel = selectedId === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => setSelectedId(m.id)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                borderRadius: RADIUS.md, borderWidth: 1.5,
                borderColor: sel ? colors.primary : colors.border,
                backgroundColor: sel ? (isDark ? colors.primary + '22' : colors.primary + '10') : colors.card,
                paddingVertical: 12, paddingHorizontal: 14,
              }}
            >
              <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={siblings} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{m.name}</Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textTransform: 'capitalize' }}>{m.role}</Text>
              </View>
              <View style={{
                width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                borderColor: sel ? colors.primary : colors.border,
                backgroundColor: sel ? colors.primary : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {sel && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </AppBottomSheet>
  );
}
