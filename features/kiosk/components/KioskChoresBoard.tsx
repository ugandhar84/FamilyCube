/**
 * KioskChoresBoard — the kitchen display's Chores page: ONE person's board at
 * a time, in status columns — To do, Submitted, Approved, Bounties — with big
 * picture cards. A kid / teen only ever sees their own board. A parent starts
 * on their own and switches person with the chips; approvals happen in the
 * Submitted column.
 *
 * Same store calls as the rest of kiosk (submitQuest / approveQuest /
 * declineQuest / claimQuest) and the same per-viewer gating
 * (deriveQuestActions), so a tap here does exactly what it does on the full
 * board. Everything the old board also carries — cash-out and grandparent
 * offer reviews, terms changes, disputes, history, series, the composer —
 * stays one tap away behind "Full view".
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { deriveQuestActions, isAssignedTo } from '@/features/tasks/lib/deriveCardActions';
import { showToast } from '@/components/AppToast';
import { localDateStr } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels, type KioskColors } from '../kioskPalette';
import { visibleQuestsFor, poolQuestsIn } from '../kidQuestLanes';
import { KioskRedoReasonDialog } from './KioskRedoReasonDialog';
import { firstName } from './KioskHomeParts';
import { KioskAvatar } from './KioskAvatar';
import { KioskChoreDetailDrawer } from './KioskChoreDetailDrawer';
import { KioskKidRequestsPanel, pendingKidRequests } from './KioskKidRequestsPanel';
import { useKidRequestStore } from '@/store/kidRequestStore';

const CATEGORY_EMOJI: Record<string, string> = {
  Kitchen: '🍽️', Room: '🛏️', Yard: '🍂', School: '📚', Pet: '🐕', 'Living Room': '🛋️', Garage: '🧰',
  Bathroom: '🛁', Laundry: '🧺', Errand: '🛍️', Tech: '💻', Finance: '💵', Health: '💊', Garden: '🪴',
  Car: '🚗', Shopping: '🛒', Cooking: '🥘', Social: '👋', Creative: '🎨', Other: '📋',
};
const KEYWORD_EMOJI: [RegExp, string][] = [
  [/trash|garbage|bin/i, '🗑️'], [/dog|cat|pet|feed|walk/i, '🐕'], [/bed/i, '🛏️'], [/teeth|brush/i, '🪥'],
  [/dish|plate|table|dinner/i, '🍽️'], [/book|read|homework|library/i, '📚'], [/piano|guitar|music|practice/i, '🎹'],
  [/laundry|clothes|dress/i, '🧺'], [/plant|water|herb|garden/i, '🪴'], [/car|wash/i, '🚗'], [/vacuum|sweep|mop|clean|wipe/i, '🧽'],
];
function emojiFor(q: Quest): string {
  for (const [re, e] of KEYWORD_EMOJI) if (re.test(q.title)) return e;
  return CATEGORY_EMOJI[q.category as string] ?? '📋';
}

const TODO_STATUSES = ['todo', 'claimed', 'in_progress', 'declined'];
const DONE_STATUSES = ['approved', 'done'];
const sameDay = (iso?: string) => !!iso && localDateStr(new Date(iso)) === localDateStr();

export function KioskChoresBoard({ active, members, onFullView }: {
  active: FamilyMember; members: FamilyMember[];
  /** Opens the original full board (optionally straight into the composer). */
  onFullView: (opts?: { composer?: boolean }) => void;
}) {
  const { k, isDark } = useKioskColors();
  const { quests, submitQuest, approveQuest, declineQuest, claimQuest } = useQuestStore();
  const isActiveApprover = useTemporaryApproverStore(s => s.isActiveApprover(active.id));
  const isParent = active.role === 'parent';
  const people = useMemo(() => members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending'), [members]);
  const [boardId, setBoardId] = useState(active.id);
  const [redoId, setRedoId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const kidRequests = useKidRequestStore(s => s.requests);
  const requestCount = useMemo(() => (active.role === 'parent' ? pendingKidRequests(kidRequests).length : 0), [kidRequests, active.role]);
  // Parent: Board (per-person columns) or Requests (what the kids are asking
  // for). Opens on Requests when that is the only thing waiting.
  const [view, setView] = useState<'board' | 'requests' | null>(null);

  const viewId = isParent ? boardId : active.id;
  const person = people.find(p => p.id === viewId) ?? active;
  // The phone's four pastels. Each person gets one (stable by roster order);
  // each status column gets its own.
  const pastels = kioskPastels(k);
  const pastelOf = (id: string) => pastels[Math.max(0, people.findIndex(p => p.id === id)) % pastels.length];
  const mine_ = pastelOf(person.id);
  const [PP, PS, PA, PL] = pastels; // primary(terracotta) · sage · amber · lavender
  type Pastel = typeof PP;

  const visible = useMemo(() => visibleQuestsFor(quests, members, active), [quests, members, active]);
  const mine = useMemo(() => visible.filter(q => !q.isPool && isAssignedTo(q, person.id)), [visible, person.id]);
  const today = localDateStr();
  const todo = useMemo(
    () => mine.filter(q => TODO_STATUSES.includes(q.status) && (!q.dueDate || q.dueDate <= today))
      .sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') || a.title.localeCompare(b.title)),
    [mine, today],
  );
  const submitted = useMemo(() => mine.filter(q => q.status === 'pending_approval'), [mine]);
  const approved = useMemo(
    () => mine.filter(q => DONE_STATUSES.includes(q.status) && sameDay(q.approvedAt ?? q.completedAt)),
    [mine],
  );
  const bounties = useMemo(() => poolQuestsIn(visible), [visible]);
  const total = todo.length + submitted.length + approved.length;
  const pct = total ? (approved.length + submitted.length) / total : 0;
  const earned = approved.reduce((n, q) => n + (q.coins ?? 0), 0);
  const redoQuest = submitted.find(q => q.id === redoId);
  const anyChoreWaiting = isParent && visible.some(q => q.status === 'pending_approval');
  const shownView: 'board' | 'requests' = !isParent ? 'board' : (view ?? (requestCount > 0 && !anyChoreWaiting ? 'requests' : 'board'));
  const viewer = { id: active.id, role: active.role, isActiveApprover };

  const tick = (q: Quest) => {
    if (person.id !== active.id) return;
    const a = deriveQuestActions(q, viewer);
    if (q.photoRequired) { showToast('This one needs a photo. Opening the full board.'); onFullView(); return; }
    if (a.canSubmit || a.canResubmit) { submitQuest(q.id, undefined, active.id); showToast('Great job! ✓'); }
    else onFullView();
  };

  const card = (q: Quest, kind: 'todo' | 'sub' | 'ok' | 'bounty', tone: Pastel) => {
    const a = deriveQuestActions(q, viewer);
    const mineTap = kind === 'todo' && person.id === active.id;
    return (
      <Pressable
        key={q.id}
        onPress={() => setDetailId(q.id)}
        accessibilityRole="button"
        accessibilityLabel={`${q.title}. Open details`}
        style={({ pressed }) => [s.card, { backgroundColor: tone.card }, pressed && { opacity: 0.75 }, kind === 'ok' && { opacity: 0.7 }]}
      >
        <View style={[s.icon, { backgroundColor: k.card }]}><Text style={{ fontSize: 22 }}>{emojiFor(q)}</Text></View>
        <View style={s.cardText}>
          <Text style={[s.cardTitle, { color: k.text }, kind === 'ok' && { textDecorationLine: 'line-through' }]} numberOfLines={2}>{q.title}</Text>
          <Text style={[s.cardSub, { color: k.textMuted }]} numberOfLines={1}>
            {kind === 'sub' ? (a.canApprove ? 'Tapped done' : 'Waiting for a parent')
              : kind === 'ok' ? `+${q.coins ?? 0} 🪙 earned`
              : kind === 'bounty' ? `First to claim · 🪙 ${q.coins ?? 0}`
              : [q.dueTime ? fmt12(q.dueTime) : '', `🪙 ${q.coins ?? 0}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {kind === 'todo' && (
          <Pressable
            onPress={mineTap ? () => tick(q) : () => setDetailId(q.id)} hitSlop={10}
            accessibilityRole="button" accessibilityLabel={mineTap ? `Mark ${q.title} done` : `Open ${q.title}`}
            style={[s.box, { borderColor: tone.fg, backgroundColor: k.card }]}
          />
        )}
        {kind === 'ok' && <View style={[s.box, { borderColor: tone.fg, backgroundColor: tone.fg }]}><Check size={16} color={k.onAccent} strokeWidth={3.5} /></View>}
        {kind === 'sub' && a.canApprove && (
          <View style={s.apprRow}>
            <Pressable onPress={() => setRedoId(q.id)} accessibilityRole="button" accessibilityLabel={`Redo ${q.title}`}
              style={[s.miniBtn, { backgroundColor: k.card }]}>
              <Text style={[s.miniText, { color: k.text }]}>Redo</Text>
            </Pressable>
            <Pressable onPress={() => { approveQuest(q.id, active.id); showToast('Approved ✓'); }} accessibilityRole="button" accessibilityLabel={`Approve ${q.title}`}
              style={[s.miniBtn, { backgroundColor: k.primary }]}>
              <Text style={[s.miniText, { color: k.onPrimary }]}>Approve</Text>
            </Pressable>
          </View>
        )}
        {kind === 'bounty' && (a.canClaim || isParent) && (
          <Pressable
            onPress={() => { claimQuest(q.id, person.id); showToast(`Claimed for ${firstName(person)} ✓`); }}
            accessibilityRole="button" accessibilityLabel={`Claim ${q.title}`}
            style={[s.miniBtn, { backgroundColor: k.gold }]}>
            <Text style={[s.miniText, { color: k.onAccent }]}>Claim</Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  const column = (title: string, items: Quest[], kind: 'todo' | 'sub' | 'ok' | 'bounty', empty: string, tone: Pastel) => (
    <View key={title} style={[s.col, { backgroundColor: tone.col }]}>
      <View style={s.colHead}>
        <Text style={[s.colTitle, { color: k.text }]}>{title}</Text>
        <View style={[s.count, { backgroundColor: tone.fg }]}><Text style={[s.countText, { color: k.onAccent }]}>{items.length}</Text></View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: KIOSK_SPACE.sm }}>
        {items.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>{empty}</Text> : items.map(q => card(q, kind, tone))}
      </ScrollView>
    </View>
  );

  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <Text style={[s.title, { color: k.text }]}>{isParent ? 'Chores' : 'My chores'}</Text>
        {isParent && (
          <View style={[s.seg, { backgroundColor: k.well }]}>
            {([['board', 'Board', 0], ['requests', 'Requests', requestCount]] as const).map(([key, label, n]) => {
              const on = shownView === key;
              return (
                <Pressable key={key} onPress={() => setView(key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                  style={[s.segBtn, on && { backgroundColor: k.card }]}>
                  <Text style={[s.segText, { color: on ? k.text : k.textMuted }]}>{label}</Text>
                  {n > 0 && <View style={[s.dot, { backgroundColor: k.primary }]}><Text style={[s.dotText, { color: k.onPrimary }]}>{n}</Text></View>}
                </Pressable>
              );
            })}
          </View>
        )}
        {isParent && shownView === 'board' && (
          <View style={s.chips}>
            {people.map(p => {
              const on = p.id === person.id;
              const pc = pastelOf(p.id);
              const waiting = visible.filter(q => q.status === 'pending_approval' && isAssignedTo(q, p.id)).length;
              return (
                <Pressable key={p.id} onPress={() => setBoardId(p.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  accessibilityLabel={`${firstName(p)}'s chores${waiting ? `, ${waiting} waiting` : ''}`}
                  style={[s.chip, { backgroundColor: pc.card, opacity: on ? 1 : 0.5, borderColor: on ? pc.fg : 'transparent' }]}>
                  <KioskAvatar name={p.name} emoji={p.emoji} avatarUrl={p.avatarUrl} size={28} bgColor={k.card} k={k} />
                  <Text style={[s.chipText, { color: pc.fg }]}>{firstName(p)}</Text>
                  {waiting > 0 && <View style={[s.dot, { backgroundColor: k.primary }]}><Text style={[s.dotText, { color: k.onPrimary }]}>{waiting}</Text></View>}
                </Pressable>
              );
            })}
          </View>
        )}
        <Pressable onPress={() => onFullView()} accessibilityRole="button" style={[s.fullBtn, { backgroundColor: k.well }]}>
          <Text style={[s.fullText, { color: k.textMuted }]}>Full view</Text>
        </Pressable>
      </View>

      {shownView === 'requests' ? (
        <KioskKidRequestsPanel active={active} members={members} />
      ) : (<>
      <View style={[s.person, { backgroundColor: mine_.card }]}>
        <KioskAvatar name={person.name} emoji={person.emoji} avatarUrl={person.avatarUrl} size={44} bgColor={k.card} k={k} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.pName, { color: k.text }]}>{firstName(person)}{person.id === active.id ? <Text style={[s.you, { color: k.textMuted }]}>  · you</Text> : null}</Text>
          <View style={[s.track, { backgroundColor: k.card }]}><View style={[s.fill, { backgroundColor: mine_.fg, width: `${Math.round(pct * 100)}%` }]} /></View>
        </View>
        <View style={s.stat}><Text style={[s.statNum, { color: k.text }]}>{approved.length + submitted.length}/{total}</Text><Text style={[s.statCap, { color: k.textMuted }]}>done</Text></View>
        <View style={s.stat}><Text style={[s.statNum, { color: k.text }]}>🪙 {earned}</Text><Text style={[s.statCap, { color: k.textMuted }]}>earned today</Text></View>
      </View>

      <View style={s.cols}>
        {column('To do', todo, 'todo', 'Nothing left. Great job! 🎉', PP)}
        {column('Submitted', submitted, 'sub', 'Nothing waiting', PL)}
        {column('Approved', approved, 'ok', 'Finished chores show here', PS)}
        {column('Bounties', bounties, 'bounty', 'No open bounties', PA)}
      </View>

      </>)}

      {isParent && (
        <Pressable onPress={() => onFullView({ composer: true })} accessibilityRole="button" accessibilityLabel="Add a chore"
          style={[s.fab, { backgroundColor: k.primary }]}>
          <Plus size={28} color={k.onPrimary} strokeWidth={2.5} />
        </Pressable>
      )}

      <KioskChoreDetailDrawer
        questId={detailId} active={active} members={members}
        onClose={() => setDetailId(null)} onFullView={() => onFullView()}
      />

      <KioskRedoReasonDialog
        visible={!!redoQuest}
        choreTitle={redoQuest?.title ?? ''}
        k={k as KioskColors}
        onClose={() => setRedoId(null)}
        onSend={(reason) => {
          if (!redoQuest) return;
          declineQuest(redoQuest.id, active.id, reason, 'custom');
          showToast('Sent back for a redo ✓');
          setRedoId(null);
        }}
      />
    </View>
  );
}

function fmt12(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.xl, paddingTop: KIOSK_SPACE.sm, paddingBottom: KIOSK_SPACE.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  chips: { flex: 1, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingVertical: 5, paddingLeft: 6, paddingRight: 14, borderWidth: 2, minHeight: 44 },
  chipText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  dot: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dotText: { fontSize: 11, fontWeight: '800' },
  seg: { flexDirection: 'row', borderRadius: 100, padding: 3 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: 100, paddingHorizontal: 16 },
  segText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  fullBtn: { marginLeft: 'auto', minHeight: 44, borderRadius: 100, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  fullText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  person: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.xl, paddingVertical: 10, paddingHorizontal: KIOSK_SPACE.md },
  pName: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  you: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  fill: { height: 8, borderRadius: 4 },
  stat: { alignItems: 'center', paddingHorizontal: 8 },
  statNum: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  statCap: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  cols: { flex: 1, flexDirection: 'row', gap: KIOSK_SPACE.sm, minHeight: 0 },
  col: { flex: 1, borderRadius: KIOSK_RADIUS.xl, padding: KIOSK_SPACE.sm, gap: KIOSK_SPACE.sm, minHeight: 0 },
  colHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  colTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  count: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  countText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.lg, padding: 10, minHeight: 64 },
  icon: { width: 42, height: 42, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, minWidth: 90 },
  cardTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  cardSub: { fontSize: KIOSK_TYPO.label, fontWeight: '700', marginTop: 2 },
  box: { width: 30, height: 30, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  apprRow: { flexDirection: 'row', gap: 6, width: '100%', justifyContent: 'flex-end' },
  miniBtn: { minHeight: 40, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  miniText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  empty: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', textAlign: 'center', paddingVertical: KIOSK_SPACE.lg },
  fab: { position: 'absolute', right: KIOSK_SPACE.xl, bottom: KIOSK_SPACE.md, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
