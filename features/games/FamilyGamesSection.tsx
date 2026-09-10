/**
 * FamilyGamesSection — Hub section rendered by all 4 role views (Parent/
 * Kid/Teen/Senior). Tic-Tac-Toe tile linking to the launcher, plus any
 * live incoming challenges rendered inline as accept/decline cards (same
 * slot pattern ActionNeededSection uses for ride/grocery request cards).
 */
import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useGameStore } from '@/store/gameStore';
import { useAppStateRefresh } from '@/lib/useAppStateRefresh';
import { ChallengeIncomingPrompt } from './ChallengeIncomingPrompt';
import { ChallengeOutgoingPrompt } from './ChallengeOutgoingPrompt';
import { ChallengeResumePrompt } from './ChallengeResumePrompt';

export function FamilyGamesSection({ colors, isDark }: { colors: any; isDark: boolean }) {
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyId = (members.find(m => m.id === activeMemberId) as any)?.familyId ?? (members[0] as any)?.familyId ?? null;
  const incomingChallenges = useGameStore(s => s.incomingChallenges);
  const outgoingChallenges = useGameStore(s => s.outgoingChallenges);
  const myActiveSessions = useGameStore(s => s.myActiveSessions);
  const loadChallenges = useGameStore(s => s.loadChallenges);
  const ensureChallengeRealtime = useGameStore(s => s.ensureChallengeRealtime);

  // Was keyed on [familyId] only — PIN-switching between two family
  // members who share the same familyId (a common shared-device case)
  // never re-ran this effect, so ensureChallengeRealtime's own dedup guard
  // (keyed only on familyId before this fix) kept the OLD member's
  // subscription alive indefinitely. Both must now change the channel;
  // see ensureChallengeRealtime's own _rtChallengeMemberId comment for the
  // matching store-side half of this fix (live-reported: "the other
  // person is not showing the realtime invitation on the hub (showing
  // after relaunch)").
  useEffect(() => {
    if (!familyId) return;
    loadChallenges(familyId);
    ensureChallengeRealtime(familyId);
  }, [familyId, activeMemberId]);

  // A silently dropped Realtime socket (common after the app spends time
  // backgrounded on iOS) previously had NO recovery path short of a full
  // relaunch — nothing ever re-subscribed or re-fetched once the channel's
  // own status callback nulled it out. Foregrounding now forces both a
  // fresh fetch and a fresh subscribe.
  useAppStateRefresh(() => {
    if (!familyId) return;
    loadChallenges(familyId);
    ensureChallengeRealtime(familyId);
  });

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
      <Text style={{ fontSize: TYPO.sectionLabel, fontWeight: '800', color: colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Family Games
      </Text>
      <Pressable
        onPress={() => router.push('/hub/games')}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.card, padding: 14,
        }}
      >
        <View style={{
          width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.accent,
        }}>
          <Text style={{ fontSize: 20 }}>🎮</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
            Play a game
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            Tic-Tac-Toe, Memory, Snake — vs the computer or challenge family
          </Text>
        </View>
      </Pressable>

      {myActiveSessions.map(session => (
        <ChallengeResumePrompt key={session.id} session={session} colors={colors} activeMemberId={activeMemberId ?? ''} />
      ))}
      {incomingChallenges.map(session => (
        <ChallengeIncomingPrompt key={session.id} session={session} colors={colors} isDark={isDark} />
      ))}
      {outgoingChallenges.map(session => (
        <ChallengeOutgoingPrompt key={session.id} session={session} colors={colors} />
      ))}
    </View>
  );
}
