/**
 * AskCubeSnapshotCard — where the family stands today in one card: chores by state, then the day's events, then anything
 * waiting on a parent. Each tile is a count; tapping a tile with something in it opens the matching list in chat.
 */
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { RHYTHM } from '@/constants/theme';

export interface AskCubeSnapshot {
  summary: {
    date: string;
    chores: { approvedToday: number; waitingForReview: number; sentBack: number; open: number; overdue: number };
    schedule: { doneToday: number; upNext: number; needDriver: number };
    kidRequestsPending: number;
    rewardRequestsPending?: number;
  };
}

export default function AskCubeSnapshotCard({ snapshot, isParent, onAsk }: { snapshot: AskCubeSnapshot; isParent: boolean; onAsk: (q: string) => void }) {
  const { colors } = useTheme();
  const s = snapshot.summary;
  const Tile = ({ n, label, tone, q }: { n: number; label: string; tone: string; q?: string }) => (
    <Pressable disabled={!q || n === 0} onPress={() => q && onAsk(q)} accessibilityRole="button" accessibilityLabel={`${n} ${label}`}
      style={{ flexGrow: 1, flexBasis: '30%', minWidth: 92, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface, gap: 2 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: n === 0 ? colors.textTertiary : tone }}>{n}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
  const Heading = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase', color: colors.textTertiary }}>{children}</Text>
  );
  return (
    <View style={{ width: '94%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: RHYTHM.card - 4, gap: RHYTHM.inline }}>
      <Heading>Chores today</Heading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: RHYTHM.inline }}>
        <Tile n={s.chores.approvedToday} label="Approved" tone={colors.success} />
        <Tile n={s.chores.waitingForReview} label={isParent ? 'To review' : 'Submitted'} tone={colors.amber} q="Which chores are waiting for review?" />
        <Tile n={s.chores.sentBack} label="Sent back" tone={colors.danger} q="Which chores were sent back?" />
        <Tile n={s.chores.open} label="Open" tone={colors.primary} q="What chores are open?" />
        <Tile n={s.chores.overdue} label="Overdue" tone={colors.danger} q="What chores are overdue?" />
      </View>
      <Heading>Schedule today</Heading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: RHYTHM.inline }}>
        <Tile n={s.schedule.doneToday} label="Done" tone={colors.success} />
        <Tile n={s.schedule.upNext} label="Up next" tone={colors.primary} />
        {s.schedule.needDriver > 0 && <Tile n={s.schedule.needDriver} label="Need a driver" tone={colors.danger} />}
        {isParent && <Tile n={s.kidRequestsPending} label="Requests" tone={colors.amber} q="Any kid requests pending?" />}
        {isParent && (s.rewardRequestsPending ?? 0) > 0 && <Tile n={s.rewardRequestsPending ?? 0} label="Rewards" tone={colors.amber} q="Any reward requests pending?" />}
      </View>
    </View>
  );
}
