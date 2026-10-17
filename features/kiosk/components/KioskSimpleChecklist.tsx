/**
 * KioskSimpleChecklist — the kid's "My day" card: one big tap-to-finish row
 * per task ("Put the library book in your bag"), nothing else. No filters,
 * lanes, coins math or decline dialogs — those stay on the Tasks tab.
 * Same store calls as KidChoresWidget (submitQuest), so a tap here is the
 * same "Mark Done" it offers, gated by the same deriveQuestActions.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Check, Camera, PartyPopper, Plus } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { showToast } from '@/components/AppToast';
import { localDateStr } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { kioskPastels, type KioskColors } from '../kioskPalette';
import { fmt12 } from './KioskHomeParts';
import { visibleQuestsFor, poolQuestsIn } from '../kidQuestLanes';
import { WidgetCard, WidgetHeader } from './KioskOS';
import { ListChecks } from 'lucide-react-native';

function BareFrame({ children }: { k: KioskColors; isDark: boolean; children: React.ReactNode }) {
  return <View style={{ gap: KIOSK_SPACE.sm }}>{children}</View>;
}

/** Today's chores for one member (due today, overdue or undated), split into
 *  still-to-do and finished. Shared by the checklist and the kid Home pulse. */
export function useKidDay(active: FamilyMember, members: FamilyMember[]) {
  const { quests } = useQuestStore();
  const mine = useMemo(() => {
    const visible = visibleQuestsFor(quests, members, { id: active.id, role: active.role });
    const poolIds = new Set(poolQuestsIn(visible).map(q => q.id));
    // Today's list only: due today, overdue, or undated — a chore due next
    // week isn't something to tick off this morning. Earliest due time first
    // so it reads top-to-bottom as the order to do things in.
    const today = localDateStr();
    return visible
      .filter(q => !poolIds.has(q.id) && q.assignedToId === active.id && (!q.dueDate || q.dueDate <= today))
      .sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') || a.title.localeCompare(b.title));
  }, [quests, members, active.id, active.role]);
  const todo = mine.filter(q => ['todo', 'claimed', 'in_progress', 'declined'].includes(q.status));
  const done = mine.filter(q => ['pending_approval', 'approved', 'done'].includes(q.status));
  return { todo, done, total: todo.length + done.length };
}

export function KioskSimpleChecklist({ active, members, k, isDark, onOpenTasks, bare }: {
  active: FamilyMember; members: FamilyMember[]; k: KioskColors; isDark: boolean;
  onOpenTasks: () => void;
  /** Render just the rows (no card/header) so a Home layout can frame it. */
  bare?: boolean;
}) {
  const { submitQuest, addQuest } = useQuestStore();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const isActiveApprover = useTemporaryApproverStore(s => s.isActiveApprover(active.id));
  useEffect(() => { useChoreStore.getState().syncFromDB().catch(() => {}); }, []);
  const { todo, done, total } = useKidDay(active, members);

  // The kid's own entry: no coins, no review — a plain reminder for
  // themselves (trusted so one tap completes it).
  const addOwn = () => {
    const title = draft.trim();
    if (!title) return;
    addQuest({
      title, coins: 0, xpReward: 0, status: 'todo', isPool: false,
      assignedToId: active.id, createdById: active.id,
      trustedAutoApprove: true, photoRequired: false,
      dueDate: localDateStr(), recurrence: 'once', questType: 'general',
    });
    setDraft(''); setAdding(false);
    showToast('Added to your day ✓');
  };

  const tap = (q: Quest) => {
    const a = deriveQuestActions(q, { id: active.id, role: active.role, isActiveApprover });
    if (q.photoRequired) { onOpenTasks(); return; }
    if (a.canSubmit || a.canResubmit) {
      submitQuest(q.id, undefined, active.id);
      showToast('Great job! ✓');
    } else onOpenTasks();
  };

  const pastels = kioskPastels(k);
  const Frame = bare ? BareFrame : WidgetCard;
  return (
    <Frame k={k} isDark={isDark}>
      {!bare && (
        <WidgetHeader
          Icon={ListChecks} eyebrow="Today"
          title={total === 0 ? 'My day' : `My day · ${done.length} of ${total} done`}
          accent={k.sage} k={k} isDark={isDark}
        />
      )}
      {total === 0 && (
        <Text style={[s.empty, { color: k.textMuted }]}>Nothing to do right now. Enjoy your day!</Text>
      )}
      {todo.length === 0 && total > 0 && (
        <View style={[s.allDone, { backgroundColor: k.sageSoft, borderColor: k.sageEdge }]}>
          <PartyPopper size={28} color={k.sage} />
          <Text style={[s.allDoneText, { color: k.sage }]}>All done — amazing!</Text>
        </View>
      )}
      <View style={{ gap: KIOSK_SPACE.sm }}>
        {todo.map((q, i) => {
          const tone = pastels[i % 4];
          return (
            <Pressable
              key={q.id}
              onPress={() => tap(q)}
              style={({ pressed }) => [s.row, { backgroundColor: tone.col, borderColor: i === 0 ? k.primary : tone.card, borderWidth: i === 0 ? 3 : 1.5 }, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel={`${q.title}. Tap when finished`}
            >
              <View style={[s.circle, { borderColor: tone.fg, backgroundColor: k.card }]}>
                {q.photoRequired && <Camera size={20} color={tone.fg} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.title, { color: k.text, flex: 0 }]} numberOfLines={2}>{q.title}</Text>
                <Text style={[s.subT, { color: k.textMuted }]} numberOfLines={1}>{q.dueTime ? `Due ${fmt12(q.dueTime)} · ` : ''}tap when finished</Text>
              </View>
              {!!q.coins && <View style={[s.coinPill, { backgroundColor: k.pastelAmberCard }]}><Text style={[s.coinT, { color: k.gold }]}>🪙 {q.coins}</Text></View>}
            </Pressable>
          );
        })}
        {adding ? (
          <View style={[s.row, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
            <TextInput
              value={draft} onChangeText={setDraft} autoFocus maxLength={80}
              placeholder="What do you need to do?" placeholderTextColor={k.textFaint}
              onSubmitEditing={addOwn} returnKeyType="done"
              style={[s.title, { color: k.text, padding: 0 }]}
            />
            <Pressable onPress={addOwn} style={[s.addBtn, { backgroundColor: k.sage }]} accessibilityRole="button" accessibilityLabel="Add">
              <Check size={22} color={k.onPrimary} strokeWidth={3} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setAdding(true)}
            style={[s.row, { backgroundColor: 'transparent', borderColor: k.cardBorder, borderStyle: 'dashed' }]}
            accessibilityRole="button" accessibilityLabel="Add my own task"
          >
            <Plus size={26} color={k.textMuted} />
            <Text style={[s.title, { color: k.textMuted }]}>Add my own task</Text>
          </Pressable>
        )}
        {done.map((q, i) => {
          const tone = pastels[(todo.length + i) % 4];
          return (
            <View key={q.id} style={[s.row, { backgroundColor: tone.col, borderColor: tone.card, borderWidth: 1.5 }]}>
              <View style={[s.circle, { backgroundColor: k.sage, borderColor: k.sage }]}>
                <Check size={22} color={k.onPrimary} strokeWidth={3} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.title, { color: k.textMuted, flex: 0, textDecorationLine: 'line-through' }]} numberOfLines={2}>{q.title}</Text>
                <Text style={[s.subT, { color: k.textMuted }]}>{q.status === 'approved' ? 'Approved' : 'Sent to a parent to approve'}</Text>
              </View>
              {!!q.coins && <View style={[s.coinPill, { backgroundColor: k.pastelAmberCard }]}><Text style={[s.coinT, { color: k.gold }]}>🪙 {q.coins}</Text></View>}
            </View>
          );
        })}
      </View>
    </Frame>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    minHeight: 60, borderRadius: KIOSK_RADIUS.lg, borderWidth: 1, padding: KIOSK_SPACE.md,
  },
  circle: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  rowNext: { borderWidth: 3 },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  subT: { fontSize: KIOSK_TYPO.label, fontWeight: '700', marginTop: 1 },
  coinPill: { borderRadius: 100, paddingHorizontal: 11, paddingVertical: 4 },
  coinT: { fontSize: 13, fontWeight: '800' },
  empty: { fontSize: KIOSK_TYPO.body, fontWeight: '600', paddingVertical: KIOSK_SPACE.md },
  allDone: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    borderRadius: KIOSK_RADIUS.lg, borderWidth: 1, padding: KIOSK_SPACE.md,
  },
  allDoneText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
});
