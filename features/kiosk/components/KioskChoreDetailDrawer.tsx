/**
 * KioskChoreDetailDrawer — the kiosk's "quest details page": a right-anchored
 * side overlay (KioskFormDrawer, variant 'drawer') opened by tapping a chore
 * card. Mirrors the phone's QuestDetailModal in the parts a wall display
 * needs: status + reward + due chips, notes, who it's assigned to, the
 * Created → Claimed → Submitted → Approved progress, the submitted proof,
 * the trail log, and the same per-viewer actions (deriveQuestActions) —
 * Mark done, Claim, Approve, Redo, Edit, Delete.
 *
 * Takes the quest id, not the object, and re-reads it from the store, so a
 * realtime update (a parent approving it elsewhere) shows up live.
 */
import { confirmDeleteChore } from '@/lib/confirmDeleteChore';
import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, Alert, StyleSheet } from 'react-native';
import { ClipboardList } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { useTheme } from '@/lib/ThemeContext';
import { deriveQuestActions, isAssignedTo } from '@/features/tasks/lib/deriveCardActions';
import { fetchActivityLog, type ActivityLogRow } from '@/lib/activityLog';
import { parseDbTime } from '@/lib/dates';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { KioskFormDrawer } from './KioskFormDrawer';
import { KioskAvatar } from './KioskAvatar';
import { KioskRedoReasonDialog } from './KioskRedoReasonDialog';
import { KioskQuestEditor } from './KioskQuestEditor';
import { Eyebrow, firstName } from './KioskHomeParts';

function fmtStamp(iso?: string | null): string {
  if (!iso) return '';
  const d = parseDbTime(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmt12(t?: string): string {
  const m = t ? /^(\d{1,2}):(\d{2})/.exec(t) : null;
  if (!m) return t ?? '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDue(date?: string, time?: string): string {
  if (!date) return '';
  const [y, mo, d] = date.split('-').map(Number);
  const label = new Date(y, (mo || 1) - 1, d || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return time ? `${label} · ${fmt12(time)}` : label;
}

const TRAIL_LABEL: Record<string, string> = {
  created: 'Created', claimed: 'Claimed', submitted: 'Submitted for review', approved: 'Approved',
  declined: 'Sent back for a redo', reassigned: 'Reassigned', reopened: 'Reopened', cancelled: 'Cancelled',
  archived: 'Archived', assigned: 'Assigned',
};

export function KioskChoreDetailDrawer({ questId, active, members, onClose }: {
  questId: string | null; active: FamilyMember; members: FamilyMember[];
  onClose: () => void;
}) {
  const { k } = useKioskColors();
  const { colors, isDark } = useTheme();
  const { quests, submitQuest, approveQuest, declineQuest, claimQuest, deleteQuest, skipQuestOccurrence } = useQuestStore();
  const isActiveApprover = useTemporaryApproverStore(s => s.isActiveApprover(active.id));
  const [log, setLog] = useState<ActivityLogRow[]>([]);
  const [redoOpen, setRedoOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const quest: Quest | undefined = questId ? quests.find(q => q.id === questId) : undefined;
  useEffect(() => {
    if (!questId) { setLog([]); return; }
    let off = false;
    fetchActivityLog('chore', questId, 10).then(r => { if (!off) setLog(r); }).catch(() => {});
    return () => { off = true; };
  }, [questId, quest?.status]);

  if (!questId || !quest) return null;

  const a = deriveQuestActions(quest, { id: active.id, role: active.role, isActiveApprover });
  const assignee = members.find(m => m.id === quest.assignedToId);
  const nameOf = (id?: string | null) => firstName(members.find(m => m.id === id));
  const status = statusInfo(quest, k, nameOf(quest.assignedToId));
  const proof = (quest.photoUrls?.[0] ?? quest.photoUrl) || undefined;
  const note = (quest as any).note || quest.completionNote;

  const chips: { text: string; bg: string; fg: string }[] = [{ text: status.label, bg: status.color + '24', fg: status.color }];
  const due = fmtDue(quest.dueDate, quest.dueTime);
  if (due) chips.push({ text: `📅 ${due}`, bg: k.well, fg: k.textMuted });
  chips.push({ text: `🪙 ${quest.coins}${quest.bonusCoins ? ` + ${quest.bonusCoins} bonus` : ''}`, bg: k.goldSoft, fg: k.gold });
  if (quest.category) chips.push({ text: quest.category, bg: k.well, fg: k.textMuted });
  if (quest.recurrence && quest.recurrence !== 'once') chips.push({ text: `🔄 ${quest.recurrence}`, bg: k.well, fg: k.textMuted });
  if (quest.photoRequired) chips.push({ text: '📸 Photo required', bg: k.purpleSoft, fg: k.purple });

  const steps = [
    { label: 'Created', at: (quest as any).createdAt as string | undefined },
    { label: 'Claimed', at: quest.claimedAt },
    { label: 'Submitted', at: quest.submittedAt },
    { label: 'Approved', at: quest.approvedAt },
  ];

  const close = () => { setRedoOpen(false); setEditing(false); onClose(); };
  const btn = (label: string, onPress: () => void, bg: string, fg: string) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [s.btn, { backgroundColor: bg }, pressed && { opacity: 0.75 }]}>
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );

  const actions: React.ReactNode[] = [];
  if (a.canSubmit || a.canResubmit) {
    actions.push(btn(a.canResubmit ? 'Resubmit' : 'Mark done', () => {
      if (quest.photoRequired) { showToast('This one needs a photo. Add it from a phone.'); return; }
      submitQuest(quest.id, undefined, active.id); showToast('Great job! ✓'); close();
    }, k.sage, k.onAccent));
  }
  if (a.canClaim) actions.push(btn('Claim chore', () => { claimQuest(quest.id, active.id); showToast('Claimed ✓'); close(); }, k.gold, k.onAccent));
  if (a.canApprove) {
    actions.push(btn('Approve', () => { approveQuest(quest.id, active.id); showToast('Approved ✓'); close(); }, k.primary, k.onPrimary));
    actions.push(btn('Redo', () => setRedoOpen(true), k.well, k.text));
  }
  if (a.canEdit) actions.push(btn('Edit', () => setEditing(true), k.well, k.text));

  return (
    <>
      <KioskFormDrawer
        visible={!editing}
        variant="drawer"
        title={quest.title}
        subtitle={assignee ? `${firstName(assignee)}'s chore` : quest.isPool ? 'Bounty · open to anyone' : 'Chore'}
        accent={status.color}
        Icon={ClipboardList}
        k={k}
        onClose={close}
      >
        <View style={s.body}>
          <View style={s.chips}>
            {chips.map(c => (
              <View key={c.text} style={[s.chip, { backgroundColor: c.bg }]}><Text style={[s.chipText, { color: c.fg }]}>{c.text}</Text></View>
            ))}
          </View>

          {actions.length > 0 && <View style={s.actions}>{actions}</View>}

          {!!quest.description && (
            <Block label="NOTES" accent={k.sage} k={k}>
              <Text style={[s.para, { color: k.text }]}>{quest.description}</Text>
            </Block>
          )}

          <Block label="ASSIGNED TO" accent={k.gold} k={k}>
            {assignee ? (
              <View style={s.who}>
                <KioskAvatar name={assignee.name} emoji={assignee.emoji} avatarUrl={assignee.avatarUrl} size={40} bgColor={k.well} k={k} />
                <Text style={[s.whoName, { color: k.text }]}>{assignee.name}</Text>
              </View>
            ) : (
              <Text style={[s.para, { color: k.text }]}>
                {quest.isPool ? 'Open pool. Anyone in the family can claim this.' : 'Not assigned yet.'}
              </Text>
            )}
          </Block>

          <Block label="PROGRESS" accent={k.purple} k={k}>
            {steps.map((st, i) => (
              <View key={st.label} style={s.stepRow}>
                <View style={s.stepRail}>
                  <View style={[s.stepDot, { backgroundColor: st.at ? k.sage : k.cardBorder }]} />
                  {i < steps.length - 1 && <View style={[s.stepLine, { backgroundColor: k.cardBorder }]} />}
                </View>
                <View style={{ flex: 1, paddingBottom: 10 }}>
                  <Text style={[s.stepLabel, { color: st.at ? k.text : k.textFaint }]}>{st.label}</Text>
                  {!!st.at && <Text style={[s.stepAt, { color: k.textMuted }]}>{fmtStamp(st.at)}</Text>}
                </View>
              </View>
            ))}
          </Block>

          {(!!proof || !!note) && (
            <Block label="SUBMITTED" accent={k.primary} k={k}>
              {!!proof && <Image source={{ uri: proof }} style={[s.proof, { backgroundColor: k.well }]} resizeMode="cover" />}
              {!!note && <Text style={[s.para, { color: k.text }]}>“{note}”</Text>}
            </Block>
          )}

          {!!(quest as any).rejectionReason && quest.status === 'declined' && (
            <Block label="SENT BACK" accent={k.danger} k={k}>
              <Text style={[s.para, { color: k.text }]}>{(quest as any).rejectionReason}</Text>
            </Block>
          )}

          {log.length > 0 && (
            <Block label="TRAIL" accent={k.textFaint} k={k}>
              {log.map(r => (
                <View key={r.id} style={s.logRow}>
                  <Text style={[s.logText, { color: k.text }]} numberOfLines={2}>
                    {TRAIL_LABEL[r.action] ?? r.action}{r.actorId ? ` · ${nameOf(r.actorId)}` : ''}{r.note ? ` — ${r.note}` : ''}
                  </Text>
                  <Text style={[s.stepAt, { color: k.textMuted }]}>{fmtStamp(r.createdAt)}</Text>
                </View>
              ))}
            </Block>
          )}

          {a.canDelete && (
            <Pressable
              onPress={() => confirmDeleteChore({
                quest, deleteQuest, skipQuestOccurrence,
                onDeleted: () => { showToast('Chore deleted'); close(); },
                onSkipped: () => { showToast('Skipped this time'); close(); },
              })}
              accessibilityRole="button" style={[s.delete, { borderColor: k.dangerEdge }]}>
              <Text style={[s.btnText, { color: k.danger }]}>Delete chore</Text>
            </Pressable>
          )}
        </View>
      </KioskFormDrawer>

      <KioskRedoReasonDialog
        visible={redoOpen}
        choreTitle={quest.title}
        k={k as KioskColors}
        onClose={() => setRedoOpen(false)}
        onSend={(reason) => { declineQuest(quest.id, active.id, reason, 'custom'); showToast('Sent back for a redo ✓'); close(); }}
      />

      <KioskQuestEditor
        quest={editing ? quest : null}
        active={active}
        members={members}
        isActiveApprover={isActiveApprover}
        onClose={() => setEditing(false)}
        colors={colors}
        isDark={isDark}
      />
    </>
  );
}

function statusInfo(q: Quest, k: KioskColors, who: string): { label: string; color: string } {
  switch (q.status) {
    case 'todo': return q.isPool ? { label: 'Bounty', color: k.gold } : { label: 'To do', color: k.primary };
    case 'claimed': return { label: 'Claimed', color: k.sage };
    case 'in_progress': return { label: 'In progress', color: k.sage };
    case 'pending_approval': return { label: who ? `Awaiting review · ${who}` : 'Awaiting review', color: k.purple };
    case 'approved': case 'done': return { label: 'Approved', color: k.sage };
    case 'declined': return { label: 'Needs another try', color: k.danger };
    default: return { label: String(q.status), color: k.textMuted };
  }
}

function Block({ label, accent, k, children }: { label: string; accent: string; k: KioskColors; children: React.ReactNode }) {
  return (
    <View style={s.block}>
      <Eyebrow label={label} accent={accent} k={k} />
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  body: { gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  btn: { minHeight: 52, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  block: { gap: KIOSK_SPACE.sm },
  para: { fontSize: KIOSK_TYPO.body, fontWeight: '600', lineHeight: 22 },
  who: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  whoName: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  stepRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  stepRail: { width: 16, alignItems: 'center' },
  stepDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  stepLine: { width: 2, flex: 1, marginTop: 2 },
  stepLabel: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  stepAt: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
  proof: { width: '100%', height: 220, borderRadius: KIOSK_RADIUS.lg },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', gap: KIOSK_SPACE.sm },
  logText: { flex: 1, fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  delete: { minHeight: 52, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: KIOSK_SPACE.sm },
});
