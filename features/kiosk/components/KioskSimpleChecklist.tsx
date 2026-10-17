/**
 * KioskSimpleChecklist — the kid's "My day" card: one big tap-to-finish row
 * per task ("Put the library book in your bag"), nothing else. No filters,
 * lanes, coins math or decline dialogs — those stay on the Tasks tab.
 * Same store calls as KidChoresWidget (submitQuest), so a tap here is the
 * same "Mark Done" it offers, gated by the same deriveQuestActions.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
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
import { KioskDateTimePicker, openAndroidPicker } from './KioskDateTimePicker';
import { useKioskColors } from '../kioskPalette';
import { addPersonalTask, quickDeadlines, deadlineLabel, customDeadline } from '@/lib/personalTasks';
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
    // Every task assigned to me: all the unfinished ones (past, today and upcoming) are kept, and only the 10 most
    // recent finished ones are shown (see below). Soonest deadline first, undated last.
    return visible
      .filter(q => !poolIds.has(q.id) && q.assignedToId === active.id)
      .sort((a, b) => `${a.dueDate ?? '9999-99-99'} ${a.dueTime ?? '99:99'}`.localeCompare(`${b.dueDate ?? '9999-99-99'} ${b.dueTime ?? '99:99'}`) || a.title.localeCompare(b.title));
  }, [quests, members, active.id, active.role]);
  const todo = mine.filter(q => ['todo', 'claimed', 'in_progress', 'declined'].includes(q.status));
  const doneAll = mine.filter(q => ['pending_approval', 'approved', 'done', 'auto_approved'].includes(q.status));
  // Every unfinished task, plus only the 10 most recently finished (submitted or approved) so the list stays short.
  const stamp = (q: any) => q.submittedAt ?? q.approvedAt ?? q.updatedAt ?? q.createdAt ?? '';
  const done = [...doneAll].sort((a, b) => String(stamp(b)).localeCompare(String(stamp(a)))).slice(0, 10);
  return { todo, done, total: todo.length + doneAll.length, doneCount: doneAll.length };
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
  const { todo, done, total, doneCount } = useKidDay(active, members);

  // The kid's own entry: no coins, no review — a plain reminder for
  // themselves (trusted so one tap completes it).
  const [deadlineKey, setDeadlineKey] = useState('today');
  const [pickDate, setPickDate] = useState<Date | null>(null);
  const [pickTime, setPickTime] = useState<Date | null>(null);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const { isDark: kioskDark } = useKioskColors();
  const addOwn = () => {
    const title = draft.trim();
    if (!title) return;
    const dl = deadlineKey === 'custom' && pickDate ? customDeadline(pickDate, pickTime) : (quickDeadlines().find(d => d.key === deadlineKey) ?? quickDeadlines()[1]);
    addPersonalTask(active, title, dl);
    setDraft(''); setAdding(false); setDeadlineKey('today'); setPickDate(null); setPickTime(null); setPicker(null);
    showToast('Added to your list ✓');
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
          title={total === 0 ? 'My day' : `My day · ${doneCount} of ${total} done`}
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
                <Text style={[s.subT, { color: k.textMuted }]} numberOfLines={1}>{(q as any).dueDate || q.dueTime ? `${deadlineLabel((q as any).dueDate, q.dueTime)} · ` : ''}tap when finished</Text>
              </View>
              {!!q.coins && <View style={[s.coinPill, { backgroundColor: k.pastelAmberCard }]}><Text style={[s.coinT, { color: k.gold }]}>🪙 {q.coins}</Text></View>}
            </Pressable>
          );
        })}
        {adding ? (
          <View style={{ gap: 8 }}>
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
          <Text style={[s.subT, { color: k.textFaint }]}>DEADLINE</Text>
          <View style={s.dlRow}>
            {quickDeadlines().map(d => (
              <Pressable key={d.key} onPress={() => setDeadlineKey(d.key)} accessibilityRole="button" accessibilityState={{ selected: deadlineKey === d.key }}
                style={[s.dlChip, { backgroundColor: deadlineKey === d.key ? k.primary : k.well }]}>
                <Text style={[s.dlT, { color: deadlineKey === d.key ? k.onPrimary : k.textMuted }]}>{d.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => { setDeadlineKey('custom'); if (!pickDate) setPickDate(new Date()); setPicker(p => (p === 'date' ? null : 'date')); }} accessibilityRole="button" accessibilityState={{ selected: deadlineKey === 'custom' }}
              style={[s.dlChip, { backgroundColor: deadlineKey === 'custom' ? k.primary : k.well }]}>
              <Text style={[s.dlT, { color: deadlineKey === 'custom' ? k.onPrimary : k.textMuted }]}>{deadlineKey === 'custom' && pickDate ? customDeadline(pickDate, pickTime).label : 'Pick a date…'}</Text>
            </Pressable>
          </View>
          {deadlineKey === 'custom' && (
            <View style={s.dlRow}>
              <Pressable onPress={() => (Platform.OS === 'android' ? openAndroidPicker({ mode: 'date', value: pickDate ?? new Date(), onChange: setPickDate }) : setPicker(p => (p === 'date' ? null : 'date')))} accessibilityRole="button" style={[s.dlChip, { backgroundColor: k.pastelSageCard }]}><Text style={[s.dlT, { color: k.sage }]}>Date</Text></Pressable>
              <Pressable onPress={() => { if (!pickTime) { const t0 = new Date(); t0.setMinutes(0, 0, 0); t0.setHours(t0.getHours() + 1); setPickTime(t0); } if (Platform.OS === 'android') openAndroidPicker({ mode: 'time', value: pickTime ?? new Date(), onChange: setPickTime }); else setPicker(p => (p === 'time' ? null : 'time')); }} accessibilityRole="button" style={[s.dlChip, { backgroundColor: k.pastelAmberCard }]}><Text style={[s.dlT, { color: k.gold }]}>{pickTime ? 'Time set' : 'Add a time'}</Text></Pressable>
              {!!pickTime && <Pressable onPress={() => { setPickTime(null); setPicker(null); }} accessibilityRole="button" style={[s.dlChip, { backgroundColor: k.well }]}><Text style={[s.dlT, { color: k.textMuted }]}>No time</Text></Pressable>}
            </View>
          )}
          {picker === 'date' && pickDate && <KioskDateTimePicker mode="date" visible k={k} isDark={kioskDark} value={pickDate} minimumDate={new Date(new Date().setHours(0, 0, 0, 0))} onChange={setPickDate} onDone={() => setPicker(null)} />}
          {picker === 'time' && pickTime && <KioskDateTimePicker mode="time" visible k={k} isDark={kioskDark} value={pickTime} onChange={setPickTime} onDone={() => setPicker(null)} />}
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
  dlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dlChip: { minHeight: 44, borderRadius: 100, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  dlT: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
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
