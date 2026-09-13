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
  const onlineMemberIds = useGameStore(s => s.onlineMemberIds);
  // Was single-select — closing and reopening this sheet once per person
  // was the only way to invite more than one family member at all
  // [live-reported: "we should send the multiple times invite"]. Since
  // Tic-Tac-Toe/Memory are inherently 1v1, "multiple" here means fanning
  // out a SEPARATE pending challenge to each selected person at once
  // (e.g. a parent inviting several kids, whoever accepts first plays) —
  // not one game with N people in it.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const opponents = members.filter(m => m.id !== activeMemberId);
  const siblings = members.map(m => m.name);
  const toggleSelected = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  // Was gameType-only — ignored `difficulty`, so picking a DIFFERENT
  // difficulty against the same already-challenged person routed back
  // into the old challenge's waiting screen instead of allowing the new
  // one, silently discarding the difficulty choice.
  const existingFor = (id: string) => outgoingChallenges.find(c => c.gameType === gameType && c.difficulty === difficulty && c.challengedId === id);
  const allExisting = selectedIds.length > 0 && selectedIds.every(id => !!existingFor(id));

  const handleSend = async () => {
    if (!selectedIds.length) return;
    setSending(true);
    try {
      // Single existing pending challenge, single selection: jump straight
      // back into its waiting screen instead of hitting the RPC's own "a
      // pending challenge already exists" rejection — that error existing
      // at all only makes sense as a safety net, never as the everyday
      // path for "I already challenged them, let me check in."
      if (selectedIds.length === 1 && existingFor(selectedIds[0])) {
        const existing = existingFor(selectedIds[0])!;
        onClose();
        setSelectedIds([]);
        router.push({ pathname: gameRoute as any, params: { mode: 'multiplayer', sessionId: existing.id } });
        return;
      }

      const results = await Promise.all(selectedIds.map(async id => {
        const existing = existingFor(id);
        if (existing) return { id, session: existing, alreadyPending: true };
        const session = await createChallenge(gameType, difficulty, id);
        return { id, session, alreadyPending: false };
      }));
      const sent = results.filter(r => r.session);
      const failed = results.filter(r => !r.session);
      if (!sent.length) {
        const message = useGameStore.getState().lastChallengeError ?? 'Please try again.';
        showAlert('Could not send challenge', message);
        return;
      }
      onClose();
      setSelectedIds([]);
      const names = sent.map(r => members.find(m => m.id === r.id)?.name?.split(' ')[0] ?? 'them').join(', ');
      showToast(
        failed.length
          ? `Challenge sent to ${names} (${failed.length} failed)`
          : sent.length === 1
            ? `Challenge sent to ${names}`
            : `Challenges sent to ${names}`,
      );
      // Multiple invites fanned out — nothing single to navigate into yet;
      // whoever accepts first surfaces via the existing incoming-challenge
      // realtime channel/notification. A single invite still jumps
      // straight into its own waiting screen, same as before.
      if (sent.length === 1) {
        router.push({ pathname: gameRoute as any, params: { mode: 'multiplayer', sessionId: sent[0].session!.id } });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <AppBottomSheet
      visible={visible}
      onClose={() => { onClose(); setSelectedIds([]); }}
      title={`Challenge to ${gameLabel}`}
      subtitle="Who do you want to play against? Tap to select multiple."
      minHeight="40%"
      footer={
        <TouchableOpacity
          onPress={handleSend}
          disabled={!selectedIds.length || sending}
          style={{
            borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center',
            backgroundColor: selectedIds.length ? colors.primary : colors.border,
          }}
        >
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>
            {sending
              ? 'Sending…'
              : allExisting
                ? (selectedIds.length === 1 ? 'Go to Waiting Game' : 'Check Waiting Games')
                : selectedIds.length > 1
                  ? `Send ${selectedIds.length} Challenges`
                  : 'Send Challenge'}
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
          const sel = selectedIds.includes(m.id);
          const online = onlineMemberIds.has(m.id);
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => toggleSelected(m.id)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                borderRadius: RADIUS.md, borderWidth: 1.5,
                borderColor: sel ? colors.primary : colors.border,
                backgroundColor: sel ? (isDark ? colors.primary + '22' : colors.primary + '10') : colors.card,
                paddingVertical: 12, paddingHorizontal: 14,
              }}
            >
              <View>
                <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={siblings} size={38} />
                {/* Currently viewing the games area right now — a proxy
                    for "likely to see this invite immediately," not full
                    app-wide login detection [live-requested: "detect and
                    prompt to log in to the board"]. */}
                <View style={{
                  position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6,
                  backgroundColor: online ? colors.success : colors.textTertiary,
                  borderWidth: 2, borderColor: colors.card,
                }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{m.name}</Text>
                <Text style={{ fontSize: TYPO.micro, color: online ? colors.success : colors.textTertiary, textTransform: 'capitalize' }}>
                  {online ? 'In the games area now' : m.role}
                </Text>
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
