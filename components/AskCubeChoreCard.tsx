/**
 * AskCubeChoreCard — the open chores as one compact card under Ask Cube's sentence: a row per chore with a due chip
 * (Overdue / Today / date), the title, and who it is for. Tap a row to open the chore. Theme-aware.
 */
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { RHYTHM } from '@/constants/theme';

export interface AskCubeChore {
  id: string; title: string; status: string; coins: number; dueDate: string | null; assignee: string | null; assigneeId?: string | null;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function niceDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export type ChoreAction = 'approve' | 'remind';

export default function AskCubeChoreCard({ chores, canManage, doneKeys, onOpen, onAction, onApproveAll }: {
  chores: AskCubeChore[]; canManage?: boolean; doneKeys?: Record<string, string>;
  onOpen: (c: AskCubeChore) => void; onAction?: (c: AskCubeChore, a: ChoreAction) => void; onApproveAll?: (list: AskCubeChore[]) => void;
}) {
  const { colors } = useTheme();
  const today = localToday();
  const rank = (c: AskCubeChore) => (c.dueDate && c.dueDate < today ? 0 : c.dueDate === today ? 1 : c.dueDate ? 2 : 3);
  const sorted = [...chores].sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));

  return (
    <View style={{ width: '94%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: 'hidden' }}>
      {canManage && onApproveAll && (() => {
        const waiting = sorted.filter(c => c.status === 'pending_approval' && !doneKeys?.[c.id]);
        if (waiting.length < 2) return null;
        return (
          <Pressable onPress={() => onApproveAll(waiting)} accessibilityRole="button" accessibilityLabel={`Approve all ${waiting.length}`}
            style={{ minHeight: 40, paddingHorizontal: RHYTHM.card - 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primaryLight }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{waiting.length} waiting for review</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>Approve all</Text>
          </Pressable>
        );
      })()}
      {sorted.map((c, i) => {
        const overdue = !!c.dueDate && c.dueDate < today;
        const chip = overdue
          ? { text: `Overdue · ${niceDate(c.dueDate!)}`, color: colors.danger, bg: colors.danger + '1F' }
          : c.dueDate === today
            ? { text: 'Due today', color: colors.amber, bg: colors.amber + '24' }
            : c.dueDate
              ? { text: `Due ${niceDate(c.dueDate)}`, color: colors.textSecondary, bg: colors.surface }
              : { text: 'No date', color: colors.textTertiary, bg: colors.surface };
        const sub = [c.assignee, c.coins ? `${c.coins} coins` : null, c.status === 'pending_approval' ? 'waiting for approval' : null].filter(Boolean).join(' · ');
        return (
          <Pressable key={c.id} onPress={() => onOpen(c)} accessibilityRole="button" accessibilityLabel={c.title}
            style={({ pressed }) => ({ paddingHorizontal: RHYTHM.card - 4, paddingVertical: 11, gap: 5, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border, opacity: pressed ? 0.75 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary, lineHeight: 18 }}>{c.title}</Text>
              <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: chip.bg }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: chip.color }}>{chip.text}</Text>
              </View>
            </View>
            {!!sub && <Text style={{ fontSize: 12, color: colors.textSecondary }}>{sub}</Text>}
            {(() => {
              const done = doneKeys?.[c.id];
              if (done) return <Text style={{ fontSize: 12, fontWeight: '800', color: colors.success }}>{done}</Text>;
              if (!canManage) return null;
              const act: ChoreAction | null = c.status === 'pending_approval' ? 'approve' : c.assigneeId ? 'remind' : null;
              if (!act) return null;
              const primary = act === 'approve';
              return (
                <Pressable onPress={() => onAction?.(c, act)} hitSlop={6} accessibilityRole="button" accessibilityLabel={primary ? 'Approve' : 'Remind'}
                  style={{ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 14, borderRadius: 11, marginTop: 2,
                    backgroundColor: primary ? colors.primary : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: primary ? colors.textInverse : colors.textPrimary }}>{primary ? 'Approve' : 'Remind'}</Text>
                </Pressable>
              );
            })()}
          </Pressable>
        );
      })}
    </View>
  );
}
