/**
 * KioskDisputeApprovalWidget — kiosk-native port of
 * features/hub/parent/ChoreReviewSection.tsx's "Scenario 4.7" dispute-
 * approval flow: when one parent approves a kid's chore, the OTHER parent
 * gets a card for it and can Flag for Discussion or Request Reversal —
 * live-reported as a real gap: "in approval there is missing cards to the
 * partner when other partner approved chore for revoke / dispute."
 *
 * Parent-only (never a kid — the phone's own comment is explicit: "no
 * visibility into the parents' disagreement"), so this only ever mounts
 * alongside ParentApprovalsWidget, which is already gated the same way.
 *
 * ── Real data source, not the Quest shim ────────────────────────────────
 * choreAdapter.ts's Quest shape (what kiosk's existing useQuestStore()
 * reads everywhere else) only carries reviewedById — none of
 * disputeStatus/disputeReason/reviewAckIds/basePoints/bonusCoins exist on
 * it. This widget reads useChoreStore(s => s.chores) directly instead,
 * the same real ChoreTask array ChoreReviewSection.tsx itself uses for
 * this exact feature. No separate load() call needed: choreAdapter.ts is
 * already a live shim ON TOP of choreStore, so choreStore is already
 * loaded and populated everywhere kiosk's own Approvals widget works
 * today (confirmed: KioskTasksTab.tsx already subscribes to useChoreStore
 * directly for its own unrelated actions).
 *
 * ── Same 7-day window + dismiss tracking as the phone ───────────────────
 * recentlyApproved below is byte-identical logic to ChoreReviewSection.tsx's
 * own filter: approved/auto_approved (or already disputed) chores from the
 * last 7 days, excluding ones this viewer already dismissed via
 * reviewAckIds — except a LIVE dispute (disputeStatus set) always stays
 * visible even to someone who dismissed the plain approval earlier,
 * exactly matching the phone's own reasoning (dismissing isn't a way to
 * duck an active conversation).
 *
 * ── Real store actions, not reimplemented ───────────────────────────────
 * flagApprovalForDiscussion/standByApproval/requestApprovalReversal/
 * coSignReversal/acknowledgeRecentApproval are the same five real
 * choreStore.ts actions the phone calls — this widget only renders UI and
 * calls them, all coin-clawback/notification/co-sign logic lives in the
 * store exactly as it does for the phone. requestApprovalReversal already
 * branches internally on householdSettings.allowUnilateralReversal, so
 * this UI never needs to know or replicate that branching itself.
 */
import { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, StyleSheet } from 'react-native';
import { Coins, Flag, Undo2 } from 'lucide-react-native';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import { parseDbTime } from '@/lib/dates';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { WidgetCard, PanelHead, KioskListRow, KioskListRowAction } from './KioskOS';
import { KioskFormDrawer, KioskFieldLabel, kioskInputStyle } from './KioskFormDrawer';

export function KioskDisputeApprovalWidget({ active, members, k, isDark }: {
  active: FamilyMember; members: FamilyMember[]; k: KioskColors; isDark: boolean;
}) {
  const chores = useChoreStore(s => s.chores);
  const flagApprovalForDiscussion = useChoreStore(s => s.flagApprovalForDiscussion);
  const standByApproval = useChoreStore(s => s.standByApproval);
  const requestApprovalReversal = useChoreStore(s => s.requestApprovalReversal);
  const coSignReversal = useChoreStore(s => s.coSignReversal);
  const acknowledgeRecentApproval = useChoreStore(s => s.acknowledgeRecentApproval);

  // Same real filter as ChoreReviewSection.tsx's recentlyApproved, read in full.
  const recentlyApproved = chores.filter(c => {
    if (!['approved', 'auto_approved'].includes(c.status) && !c.disputeStatus) return false;
    if (!c.reviewedById) return false;
    if (c.disputeStatus) return true;
    if ((c.reviewAckIds ?? []).includes(active.id)) return false;
    const t = c.approvedAt ? parseDbTime(c.approvedAt).getTime() : 0;
    return Number.isFinite(t) && t > 0 && (Date.now() - t) < 7 * 24 * 3600_000;
  });

  if (recentlyApproved.length === 0) return null;

  return (
    <WidgetCard k={k} isDark={isDark}>
      <PanelHead
        title="Recently Approved"
        k={k}
        right={<Text style={[s.panelCount, { color: k.textFaint }]}>{recentlyApproved.length}</Text>}
      />
      <View>
        {recentlyApproved.map((c, i) => (
          <DisputeApprovalRow
            key={c.id}
            c={c}
            members={members}
            active={active}
            k={k}
            isDark={isDark}
            isFirst={i === 0}
            flagApprovalForDiscussion={flagApprovalForDiscussion}
            standByApproval={standByApproval}
            requestApprovalReversal={requestApprovalReversal}
            coSignReversal={coSignReversal}
            acknowledgeRecentApproval={acknowledgeRecentApproval}
          />
        ))}
      </View>
    </WidgetCard>
  );
}

/**
 * One recently-approved chore. Three real sub-states, same order/logic as
 * ChoreReviewSection.tsx's DisputeApprovalCard:
 *   1. disputeStatus 'reversal_requested', viewer IS the original approver
 *      → Co-Sign Reversal / Stand By Approval
 *   2. disputeStatus 'flagged', viewer IS the original approver
 *      → Stand By Approval
 *   3. disputeStatus set, viewer is NOT the original approver
 *      → read-only "waiting on {approver}"
 *   4. not disputed, viewer IS the original approver → Dismiss only
 *   5. not disputed, viewer is NOT the original approver
 *      → Flag for Discussion / Request Reversal, + Dismiss
 */
function DisputeApprovalRow({ c, members, active, k, isDark, isFirst, flagApprovalForDiscussion, standByApproval, requestApprovalReversal, coSignReversal, acknowledgeRecentApproval }: {
  c: ChoreTask; members: FamilyMember[]; active: FamilyMember; k: KioskColors; isDark: boolean; isFirst: boolean;
  flagApprovalForDiscussion: (choreId: string, byParentId: string, note?: string) => Promise<void>;
  standByApproval: (choreId: string, byParentId: string) => Promise<void>;
  requestApprovalReversal: (choreId: string, byParentId: string, reason: string) => Promise<void>;
  coSignReversal: (choreId: string, coSigningParentId: string) => Promise<void>;
  acknowledgeRecentApproval: (choreId: string, byParentId: string) => Promise<void>;
}) {
  const kid = members.find(m => m.id === c.assignedToId);
  const approver = members.find(m => m.id === c.reviewedById);
  const isOriginalApprover = active.id === c.reviewedById;
  const totalCoins = (c.basePoints > 0 ? c.basePoints : c.coinsReward) + (c.bonusCoins ?? 0);
  const [flaggingOpen, setFlaggingOpen] = useState(false);
  const [reversalOpen, setReversalOpen] = useState(false);

  if (c.disputeStatus === 'reversal_requested' && isOriginalApprover) {
    return (
      <View style={[s.row, { backgroundColor: k.danger + (isDark ? '1F' : '14'), borderColor: k.danger + '50' }]}>
        <Text style={[s.rowTitle, { color: k.danger }]}>Reversal requested — "{c.title}"</Text>
        <Text style={[s.rowMeta, { color: k.textMuted }]}>
          A co-parent wants to reverse this {totalCoins}-coin payout to {kid?.name?.trim().split(' ')[0] ?? 'them'}
          {c.disputeReason ? ` — "${c.disputeReason}"` : ''}. Nothing changes unless you co-sign.
        </Text>
        <View style={s.actionRow}>
          <Pressable
            onPress={() => standByApproval(c.id, active.id)}
            style={[s.actionBtn, { backgroundColor: k.primary + '18', borderColor: k.primary + '40' }]}
          >
            <Text style={[s.actionBtnText, { color: k.primary }]}>Stand By Approval</Text>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert(
              'Co-Sign Reversal',
              `This will remove ${totalCoins} coins from ${kid?.name?.trim().split(' ')[0] ?? 'their'} balance and mark "${c.title}" as declined. This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Co-Sign & Reverse', style: 'destructive', onPress: () => coSignReversal(c.id, active.id) },
              ],
            )}
            style={[s.actionBtn, { backgroundColor: k.danger, borderColor: k.danger }]}
          >
            <Text style={[s.actionBtnText, { color: k.onAccent }]}>Co-Sign & Reverse</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (c.disputeStatus === 'flagged' && isOriginalApprover) {
    return (
      <View style={[s.row, { backgroundColor: k.gold + (isDark ? '1F' : '14'), borderColor: k.gold + '50' }]}>
        <Text style={[s.rowTitle, { color: k.gold }]}>Flagged for discussion — "{c.title}"</Text>
        <Text style={[s.rowMeta, { color: k.textMuted }]}>
          A co-parent flagged your approval{c.disputeReason ? ` — "${c.disputeReason}"` : ''}. No coins have moved.
        </Text>
        <Pressable
          onPress={() => standByApproval(c.id, active.id)}
          style={[s.actionBtn, { backgroundColor: k.primary + '18', borderColor: k.primary + '40', alignSelf: 'flex-start' }]}
        >
          <Text style={[s.actionBtnText, { color: k.primary }]}>Stand By Approval</Text>
        </Pressable>
      </View>
    );
  }

  // Live-requested: "we should the same card as the approvals" — these
  // three not-yet-(actively)-disputed states are the same flat one-line
  // shape Approvals' own rows use (KioskListRow), not a separate boxed
  // "well" card. The two ACTIVE-dispute states above stay their own
  // richer cards on purpose — the phone's own ChoreReviewSection.tsx
  // renders those as visually distinct colored boxes too, since they
  // carry multi-line explanatory copy and two full-width buttons that a
  // one-line row shape can't hold without truncating.
  if (c.disputeStatus) {
    return (
      <KioskListRow
        k={k}
        isFirst={isFirst}
        leading={<Coins size={14} color={k.textFaint} />}
        title={c.title}
        meta={`${c.disputeStatus === 'reversal_requested' ? 'Waiting on' : 'Flagged for'} ${approver?.name?.trim().split(' ')[0] ?? 'the other parent'} to respond`}
      />
    );
  }

  if (isOriginalApprover) {
    return (
      <KioskListRow
        k={k}
        isFirst={isFirst}
        leading={<Coins size={14} color={k.textFaint} />}
        title={c.title}
        meta={`${kid?.name?.trim().split(' ')[0] ?? 'Kid'} earned ${totalCoins} coins · approved by you`}
        actions={
          <KioskListRowAction
            k={k} label="Dismiss" color={k.textMuted}
            onPress={() => acknowledgeRecentApproval(c.id, active.id)}
          />
        }
      />
    );
  }

  return (
    <>
      <KioskListRow
        k={k}
        isFirst={isFirst}
        leading={<Coins size={14} color={k.textFaint} />}
        title={c.title}
        meta={`Approved by ${approver?.name?.trim().split(' ')[0] ?? 'a parent'} · ${kid?.name?.trim().split(' ')[0] ?? 'kid'} earned ${totalCoins} coins`}
        actions={
          <>
            <KioskListRowAction
              k={k} label="Flag" color={k.gold}
              onPress={() => setFlaggingOpen(true)}
              accessibilityLabel="Flag for discussion"
            />
            <KioskListRowAction
              k={k} label="Reverse" color={k.danger}
              onPress={() => setReversalOpen(true)}
              accessibilityLabel="Request reversal"
            />
            <KioskListRowAction
              k={k} label="Dismiss" color={k.textMuted}
              onPress={() => acknowledgeRecentApproval(c.id, active.id)}
            />
          </>
        }
      />

      <ReasonSheet
        visible={flaggingOpen}
        title="Flag for Discussion"
        subtitle={`Let ${approver?.name?.trim().split(' ')[0] ?? 'the other parent'} know why you want to discuss "${c.title}" (optional)`}
        accent={k.gold}
        submitLabel="Flag"
        required={false}
        k={k}
        onClose={() => setFlaggingOpen(false)}
        onSubmit={note => { setFlaggingOpen(false); flagApprovalForDiscussion(c.id, active.id, note || undefined); }}
      />
      <ReasonSheet
        visible={reversalOpen}
        title="Request Reversal"
        subtitle={`This asks ${approver?.name?.trim().split(' ')[0] ?? 'the other parent'} to co-sign reversing the ${totalCoins}-coin payout for "${c.title}". Nothing changes until they agree. Why?`}
        accent={k.danger}
        submitLabel="Request"
        required
        k={k}
        onClose={() => setReversalOpen(false)}
        onSubmit={reason => { setReversalOpen(false); requestApprovalReversal(c.id, active.id, reason || 'No reason given'); }}
      />
    </>
  );
}

/**
 * Kiosk-native replacement for components/ReasonPromptModal.tsx — that
 * component is a phone Modal, so its backdrop can't be narrowed from the
 * kiosk side (same reasoning KioskFormDrawer's own header documents for
 * every other phone bottom sheet this session replaced). A short, fixed
 * one-field form is exactly the 'dialog' case KioskFormDrawer calls out.
 */
function ReasonSheet({ visible, title, subtitle, accent, submitLabel, required, k, onClose, onSubmit }: {
  visible: boolean; title: string; subtitle: string; accent: string; submitLabel: string; required: boolean;
  k: KioskColors; onClose: () => void; onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const input = kioskInputStyle(k);
  const canSubmit = !required || text.trim().length > 0;
  return (
    <KioskFormDrawer
      visible={visible}
      variant="dialog"
      title={title}
      subtitle={subtitle}
      accent={accent}
      Icon={Flag}
      k={k}
      onClose={() => { setText(''); onClose(); }}
      onSubmit={() => { const t = text; setText(''); onSubmit(t); }}
      canSubmit={canSubmit}
      submitLabel={submitLabel}
    >
      <View style={{ gap: KIOSK_SPACE.sm }}>
        <KioskFieldLabel k={k}>{required ? 'REASON' : 'REASON (OPTIONAL)'}</KioskFieldLabel>
        <TextInput
          style={[input, { minHeight: 88, textAlignVertical: 'top' }]}
          placeholder="Type a reason…"
          placeholderTextColor={k.textFaint}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
        />
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  panelCount: { fontSize: 11 },
  // Only the two ACTIVE-dispute states (reversal_requested/flagged, viewed
  // by the original approver) still use this boxed card shape — see
  // DisputeApprovalRow's own comment for why those two stay visually
  // distinct rather than joining the flat KioskListRow list. marginVertical
  // gives them the same breathing room the removed outer `gap` used to.
  row: { borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, padding: KIOSK_SPACE.sm, gap: KIOSK_SPACE.sm, marginVertical: KIOSK_SPACE.xs },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  rowTitle: { fontSize: 13, fontWeight: '800' },
  rowMeta: { fontSize: 11.5, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.md, paddingVertical: 9, minHeight: KIOSK_HIT.control,
  },
  actionBtnText: { fontSize: 12, fontWeight: '800' },
});
