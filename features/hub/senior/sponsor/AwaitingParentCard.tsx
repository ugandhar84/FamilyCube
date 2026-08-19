import { View, Text, Pressable, Alert } from 'react-native';
import { Leaf, Laptop, X } from 'lucide-react-native';
import { useChoreStore } from '@/store/choreStore';
import { GP } from '../seniorTheme';
import type { ChoreTask } from '@/store/choreStore';

// Amber accent for the "awaiting" status, matching the chip color below —
// kept as a local constant instead of a repeated bare hex.
const AWAITING_AMBER = '#F59E0B';

// My quests pending the parent safety gate — still cancellable since nobody
// has acted on them yet.
export function AwaitingParentCard({ quests, colors, isDark }: {
  quests: ChoreTask[]; colors: any; isDark: boolean;
}) {
  if (!quests.length) return null;

  return (
    <View style={{ gap: 8, marginBottom: 12 }}>
      <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textTertiary,
        textTransform: 'uppercase', letterSpacing: 0.8 }}>Awaiting Parent Approval</Text>
      {quests.map(c => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
          padding: 12, borderRadius: 12,
          backgroundColor: isDark ? '#F5A62312' : '#FFFBEB',
          borderWidth: 1, borderColor: AWAITING_AMBER + '40' }}>
          {c.questMode === 'virtual' ? <Laptop size={18} color={AWAITING_AMBER} /> : <Leaf size={18} color={AWAITING_AMBER} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
            <Text style={{ fontSize: GP.tiny, color: colors.textSecondary }}>{c.basePoints} pts · sent to parents for review</Text>
          </View>
          <View style={{ backgroundColor: AWAITING_AMBER + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: '#92400E' }}>Pending</Text>
          </View>
          {/* Still their own quest, nobody's acted on it yet — safe to pull back. */}
          <Pressable onPress={() => Alert.alert(
            'Cancel this chore?',
            `"${c.title}" will be removed before a parent even reviews it.`,
            [{ text: 'Keep it', style: 'cancel' },
             { text: 'Cancel Chore', style: 'destructive', onPress: () => useChoreStore.getState().deleteChore(c.id) }],
          )}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color={colors.danger} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
