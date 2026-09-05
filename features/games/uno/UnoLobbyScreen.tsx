/**
 * UnoLobbyScreen — routed screen (app/hub/games/uno-lobby.tsx). Seat
 * picker: invite 1-3 other family members and/or fill remaining seats
 * with AI (2-4 total seats, enforced both here and server-side by
 * create_uno_game). Creator is always seated. On create, navigates
 * straight into the table (create_uno_game returns status='active'
 * immediately — there is no separate "waiting for others to join" lobby
 * state server-side, per the plan's v1 scope).
 */
import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ArcadeScreen } from '../arcade/ArcadeScreen';
import { ArcadePrimaryButton } from '../arcade/ArcadePrimaryButton';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO } from '../theme/gameTheme';
import { useFamilyStore } from '@/store/familyStore';
import { useGameStore } from '@/store/gameStore';

const MAX_SEATS = 4;
type Difficulty = 'easy' | 'medium' | 'hard';
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export default function UnoLobbyScreen() {
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId) ?? members[0]?.id ?? null;
  const createUnoGame = useGameStore(s => s.createUnoGame);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(activeMemberId ? [activeMemberId] : []);
  const [aiSeats, setAiSeats] = useState<Difficulty[]>(['medium']);
  const [creating, setCreating] = useState(false);

  const totalSeats = selectedMemberIds.length + aiSeats.length;
  const others = members.filter(m => m.id !== activeMemberId);

  const toggleMember = (id: string) => {
    setSelectedMemberIds(prev => {
      if (prev.includes(id)) return prev.filter(m => m !== id);
      if (totalSeats >= MAX_SEATS) return prev;
      return [...prev, id];
    });
  };

  const addAiSeat = (difficulty: Difficulty) => {
    if (totalSeats >= MAX_SEATS) return;
    setAiSeats(prev => [...prev, difficulty]);
  };
  const removeAiSeat = (index: number) => setAiSeats(prev => prev.filter((_, i) => i !== index));

  const canStart = totalSeats >= 2 && totalSeats <= MAX_SEATS && !creating;

  const handleStart = async () => {
    if (!canStart) return;
    setCreating(true);
    try {
      const game = await createUnoGame(selectedMemberIds, aiSeats);
      if (game) router.push({ pathname: '/hub/games/uno', params: { gameId: game.id } });
    } finally {
      setCreating(false);
    }
  };

  return (
    <ArcadeScreen title="UNO — NEW TABLE">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }}>
        <View>
          <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.heading, color: ARCADE.textPrimary, marginBottom: 10 }}>
            Invite family members
          </Text>
          <View style={{ gap: 8 }}>
            {others.map(m => {
              const selected = selectedMemberIds.includes(m.id);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => toggleMember(m.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    borderRadius: 14, borderWidth: 1.5, borderColor: selected ? ARCADE.uno : ARCADE.line,
                    backgroundColor: selected ? `${ARCADE.uno}22` : ARCADE.surface,
                    paddingVertical: 12, paddingHorizontal: 14,
                  }}
                >
                  <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.body, color: ARCADE.textPrimary }}>
                    {m.name}
                  </Text>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                    borderColor: selected ? ARCADE.uno : ARCADE.line, backgroundColor: selected ? ARCADE.uno : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                  </View>
                </Pressable>
              );
            })}
            {others.length === 0 && (
              <Text style={{ color: ARCADE.textSecondary, fontSize: ARCADE_TYPO.body }}>No other family members yet — fill the table with AI below.</Text>
            )}
          </View>
        </View>

        <View>
          <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.heading, color: ARCADE.textPrimary, marginBottom: 10 }}>
            Fill remaining seats with AI
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            {DIFFICULTIES.map(d => (
              <Pressable
                key={d}
                onPress={() => addAiSeat(d)}
                disabled={totalSeats >= MAX_SEATS}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
                  borderWidth: 1.5, borderColor: ARCADE.line, backgroundColor: ARCADE.surfaceRaised,
                  opacity: totalSeats >= MAX_SEATS ? 0.4 : 1,
                }}
              >
                <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label, textTransform: 'uppercase', color: ARCADE.textSecondary }}>
                  + {d}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ gap: 8 }}>
            {aiSeats.map((d, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderRadius: 14, borderWidth: 1.5, borderColor: ARCADE.uno, backgroundColor: `${ARCADE.uno}18`,
                  paddingVertical: 10, paddingHorizontal: 14,
                }}
              >
                <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.body, color: ARCADE.textPrimary, textTransform: 'capitalize' }}>
                  🤖 AI — {d}
                </Text>
                <Pressable onPress={() => removeAiSeat(i)}>
                  <Text style={{ color: ARCADE.textMuted, fontSize: ARCADE_TYPO.body }}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <Text style={{ textAlign: 'center', color: ARCADE.textSecondary, fontSize: ARCADE_TYPO.body }}>
          {totalSeats}/{MAX_SEATS} seats filled {totalSeats < 2 ? '— need at least 2' : ''}
        </Text>

        <ArcadePrimaryButton label={creating ? 'Starting…' : 'Start Game'} onPress={handleStart} disabled={!canStart} />
      </ScrollView>
    </ArcadeScreen>
  );
}
