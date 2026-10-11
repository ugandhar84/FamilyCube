/**
 * ApprovalDetailScreen — action center for one already-approved chore.
 *
 * Opened by tapping a "Recently approved" row in ChoreReviewSection (the row
 * only shows a status badge). Everything a parent can do about an approval
 * lives here, all inline — no modals, alerts or toasts:
 *   - not disputed, viewer isn't the approver: Flag for Discussion / Request Reversal
 *   - flagged / reversal requested, viewer is the approver: Discuss / Stand By / Co-Sign & Reverse
 *   - flagged / reversal requested, viewer raised it: Waiting + Discuss / Withdraw
 * Server rules (co-sign, identity, atomic coin clawback) are enforced by the
 * flag_approval / request_reversal / cosign_reversal / stand_by_approval RPCs.
 */
import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MessageCircle, Flag, Undo2, ShieldCheck, Check, AlertTriangle } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { useChoreStore, type DisputeResult } from '@/store/choreStore';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { dmChannelId } from '@/store/chatStore';
import { parseDbTime } from '@/lib/dates';
import { GEMINI } from '@/constants/geminiRhythm';

type Panel = 'none' | 'flag' | 'reverse' | 'cosign';
type Note = { kind: 'success' | 'error'; text: string } | null;

export function approvalStatusBadge(
  c: { status: string; disputeStatus?: string; disputedById?: string; reviewedById?: string },
  activeId: string,
  nameOf: (id?: string) => string,
): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  if (c.status === 'declined') return { label: 'Reversed', tone: 'neutral' };
  if (!c.disputeStatus) return { label: 'Approved', tone: 'ok' };
  const iAmApprover = activeId === c.reviewedById;
  if (c.disputeStatus === 'flagged') {
    return iAmApprover ? { label: 'Flagged — needs you', tone: 'warn' } : { label: `Flagged · waiting on ${nameOf(c.reviewedById)}`, tone: 'warn' };
  }
  return iAmApprover ? { label: 'Reversal requested — needs you', tone: 'danger' } : { label: `Reversal requested · waiting on ${nameOf(c.reviewedById)}`, tone: 'danger' };
}

export function ApprovalDetailScreen({ choreId, onClose }: { choreId: string; onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const chore = useChoreStore(s => s.chores.find(c => c.id === choreId));
  const flag = useChoreStore(s => s.flagApprovalForDiscussion);
  const standBy = useChoreStore(s => s.standByApproval);
  const requestReversal = useChoreStore(s => s.requestApprovalReversal);
  const coSign = useChoreStore(s => s.coSignReversal);
  const acknowledge = useChoreStore(s => s.acknowledgeRecentApproval);
  const { members, activeMemberId } = useFamilyStore();

  const [panel, setPanel] = useState<Panel>('none');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  // The dispute/co-sign windows below are computed from Date.now() — with
  // no ticking state, this screen only re-evaluated "window has passed"
  // whenever something else happened to re-render it (a store update), so
  // the countdown looked frozen/dead the whole time it was open [live-
  // reported: "timer is not running there"]. Ticks once a minute (window is
  // 24h, no need for anything finer) so pastDisputeWindow/pastCosignWindow
  // and the "X has until..." copy actually advance in real time.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const first = (id?: string | null) => members.find(m => m.id === id)?.name?.split(' ')[0] ?? 'A parent';

  if (!chore || !activeMemberId) {
    return (
      <View style={{ flex: 1, backgroundColor: canvas, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>This approval is no longer available.</Text>
      </View>
    );
  }

  const me = activeMemberId;
  const iAmApprover = me === chore.reviewedById;
  const iRaisedIt = me === chore.disputedById;
  const kidName = first(chore.assignedToId);
  const approverName = first(chore.reviewedById);
  const otherName = iAmApprover ? first(chore.disputedById) : approverName;
  const coins = (chore.basePoints > 0 ? chore.basePoints : chore.coinsReward) + (chore.bonusCoins ?? 0);
  const badge = approvalStatusBadge(chore, me, id => first(id));
  const reversed = chore.status === 'declined';
  const approvedOn = chore.approvedAt && Number.isFinite(parseDbTime(chore.approvedAt).getTime())
    ? parseDbTime(chore.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  // A dispute can only be raised within 24h of the approval it's
  // challenging — after that the server rejects flag_approval/
  // request_reversal outright (_dispute_guard). Checked client-side too so
  // the buttons don't invite an action that's guaranteed to fail.
  const approvalTime = (chore as any).reviewedAt ?? chore.approvedAt;
  const pastDisputeWindow = !!approvalTime && Number.isFinite(parseDbTime(approvalTime).getTime())
    && (Date.now() - parseDbTime(approvalTime).getTime()) > 24 * 60 * 60 * 1000;

  // Separate clock: once a reversal is requested, the approver has 24h from
  // disputed_at to co-sign it — a different window than the one above
  // (raising vs. responding), checked server-side in cosign_reversal.
  const disputedAt = (chore as any).disputedAt;
  const pastCosignWindow = chore.disputeStatus === 'reversal_requested' && !!disputedAt
    && Number.isFinite(parseDbTime(disputedAt).getTime())
    && (Date.now() - parseDbTime(disputedAt).getTime()) > 24 * 60 * 60 * 1000;

  const fmtDeadline = (iso: string) => parseDbTime(iso).toLocaleString('en-US',
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

  const disputedOn = disputedAt && Number.isFinite(parseDbTime(disputedAt).getTime())
    ? fmtDeadline(disputedAt) : null;

  // Shown to BOTH parents (the approver and the other parent) while the
  // approval is still disputable — not just to whoever might dispute it.
  const disputeDeadline = !!approvalTime && Number.isFinite(parseDbTime(approvalTime).getTime())
    ? new Date(parseDbTime(approvalTime).getTime() + 24 * 60 * 60 * 1000) : null;
  const showRaiseWindowNotice = !reversed && !chore.disputeStatus && !pastDisputeWindow && !!disputeDeadline;

  const cosignDeadline = chore.disputeStatus === 'reversal_requested' && !!disputedAt
    && Number.isFinite(parseDbTime(disputedAt).getTime())
    ? new Date(parseDbTime(disputedAt).getTime() + 24 * 60 * 60 * 1000) : null;
  const showCosignWindowNotice = chore.disputeStatus === 'reversal_requested' && !pastCosignWindow && !!cosignDeadline;

  const tone = {
    ok:      { bg: colors.tealLight,  fg: colors.teal },
    warn:    { bg: colors.amberLight, fg: colors.amber },
    danger:  { bg: isDark ? colors.danger + '22' : colors.danger + '14', fg: colors.danger },
    neutral: { bg: colors.surface,    fg: (isDark ? colors.textSecondary : GEMINI.bodyColor) },
  }[badge.tone];

  const run = async (fn: () => Promise<DisputeResult>, okText: string, after?: () => void) => {
    setBusy(true); setNote(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      setNote({ kind: 'success', text: okText });
      setPanel('none'); setText('');
      after?.();
    } else {
      setNote({ kind: 'error', text: res.error ?? "Couldn't update the approval — please try again." });
    }
  };

  const discuss = () => {
    const other = iAmApprover ? chore.disputedById : chore.reviewedById;
    if (!other) return;
    useUIStore.getState().setPendingChatChannelId(dmChannelId(me, other));
    onClose();
    router.push('/(tabs)/chat');
  };

  const btn = (bg: string, border: string) => ({
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6,
    paddingVertical: 12, borderRadius: 12, backgroundColor: bg, borderWidth: 1, borderColor: border,
  });
  const Primary = ({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) => (
    <Pressable disabled={busy || disabled} onPress={onPress}
      style={{ ...btn(danger ? colors.danger : colors.primary, 'transparent'), opacity: busy || disabled ? 0.55 : 1 }}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#FFFFFF' }}>{label}</Text>}
    </Pressable>
  );
  const Secondary = ({ label, onPress, icon }: { label: string; onPress: () => void; icon?: React.ReactNode }) => (
    <Pressable disabled={busy} onPress={onPress} style={{ ...btn(isDark ? colors.card : '#FFFFFF', colors.border), opacity: busy ? 0.55 : 1 }}>
      {icon}
      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>{label}</Text>
    </Pressable>
  );
  const DiscussBtn = () => (
    <Pressable onPress={discuss} style={btn(colors.pinkLight, colors.pink + '40')}>
      <MessageCircle size={16} color={colors.pink} />
      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.pink }}>Discuss with {otherName}</Text>
    </Pressable>
  );

  const reasonPanel = (kind: 'flag' | 'reverse') => (
    <View style={{ gap: 10, borderRadius: 14, padding: 14, backgroundColor: kind === 'flag' ? colors.amberLight : (isDark ? colors.danger + '14' : colors.danger + '0D') }}>
      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>
        {kind === 'flag' ? `Why do you want to discuss this with ${approverName}? (optional)`
          : `This asks ${approverName} to co-sign reversing the ${coins}-coin payout. Nothing changes until they agree. Why? (optional)`}
      </Text>
      <TextInput
        value={text} onChangeText={setText} multiline maxLength={300} editable={!busy}
        placeholder="Add a reason" placeholderTextColor={colors.textTertiary}
        style={{ minHeight: 72, borderRadius: 12, padding: 12, fontSize: TYPO.body, color: (isDark ? colors.textPrimary : GEMINI.titleColor),
          backgroundColor: isDark ? colors.surface : '#FFFFFF', borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' }}
      />
      <Text style={{ fontSize: TYPO.micro, fontWeight: '600', color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
        {kind === 'flag'
          ? `Disputes can only be raised within 24 hours of an approval — ${disputeDeadline ? `this one is open until ${fmtDeadline(disputeDeadline.toISOString())}.` : "this one's window has passed."}`
          : `Once sent, ${approverName} will have a separate 24-hour window to co-sign it — after that it can no longer be reversed this way.`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Secondary label="Cancel" onPress={() => { setPanel('none'); setText(''); }} /></View>
        <View style={{ flex: 1 }}>
          {kind === 'flag'
            ? <Primary label="Send flag" onPress={() => run(() => flag(choreId, me, text.trim(), { inline: true }), `Flag sent to ${approverName}. No coins have moved.`)} />
            : <Primary label="Request reversal" danger
                onPress={() => run(() => requestReversal(choreId, me, text.trim(), { inline: true }),
                  `Reversal requested. Nothing changes until ${approverName} co-signs.`)} />}
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, gap: 6,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: canvas }}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>← Hub</Text>
        </Pressable>
        <Text style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: (isDark ? colors.textPrimary : GEMINI.titleColor) }} numberOfLines={2}>{chore.title}</Text>
        <View style={{ alignSelf: 'flex-start', borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: tone.bg }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: tone.fg }}>{badge.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>
        <View style={{ borderRadius: 16, padding: 16, gap: 6, backgroundColor: isDark ? colors.card : colors.surface }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>
            {approverName} approved this{approvedOn ? ` on ${approvedOn}` : ''}.
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
            {kidName} earned {coins} coins.
          </Text>
          {!!chore.disputeStatus && (
            <Text style={{ fontSize: TYPO.caption, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
              {first(chore.disputedById)} {chore.disputeStatus === 'flagged' ? 'flagged it for discussion' : 'asked to reverse it'}
              {chore.disputeReason ? ` — "${chore.disputeReason}"` : ''}.
            </Text>
          )}
          {reversed && (
            <Text style={{ fontSize: TYPO.caption, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
              Reversed{chore.reversedById ? ` by ${first(chore.reversedById)}` : ''}. {kidName}'s coins were taken back.
            </Text>
          )}
          {showRaiseWindowNotice && (
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.amber }}>
              Either parent can dispute this until {fmtDeadline(disputeDeadline!.toISOString())}.
            </Text>
          )}
          {showCosignWindowNotice && (
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.danger }}>
              {approverName} has until {fmtDeadline(cosignDeadline!.toISOString())} to co-sign this reversal.
            </Text>
          )}
        </View>

        {note && (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 12, padding: 12,
            backgroundColor: note.kind === 'success' ? colors.tealLight : (isDark ? colors.danger + '22' : colors.danger + '14') }}>
            {note.kind === 'success' ? <Check size={16} color={colors.teal} /> : <AlertTriangle size={16} color={colors.danger} />}
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '600', color: note.kind === 'success' ? colors.teal : colors.danger }}>{note.text}</Text>
          </View>
        )}

        {!reversed && !chore.disputeStatus && !iAmApprover && panel === 'none' && (
          pastDisputeWindow ? (
            <View style={{ borderRadius: 12, padding: 12, backgroundColor: colors.surface }}>
              <Text style={{ fontSize: TYPO.caption, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
                The 24-hour window to dispute this approval has passed{approvedOn ? ` (approved ${approvedOn})` : ''}. It's final.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: TYPO.caption, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
                Disagree with {approverName}'s approval? Nothing changes for {kidName} unless {approverName} agrees.
              </Text>
              <Pressable onPress={() => { setNote(null); setPanel('flag'); }} style={btn(colors.amberLight, colors.amber + '50')}>
                <Flag size={16} color={colors.amber} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.amber }}>Flag for discussion</Text>
              </Pressable>
              <Pressable onPress={() => { setNote(null); setPanel('reverse'); }} style={btn(isDark ? colors.danger + '14' : colors.danger + '0D', colors.danger + '40')}>
                <Undo2 size={16} color={colors.danger} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.danger }}>Request reversal</Text>
              </Pressable>
            </View>
          )
        )}
        {panel === 'flag' && reasonPanel('flag')}
        {panel === 'reverse' && reasonPanel('reverse')}

        {!reversed && !chore.disputeStatus && iAmApprover && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: TYPO.caption, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>You approved this. Nobody has raised a concern.</Text>
            <Secondary label="Dismiss from list" onPress={async () => { await acknowledge(choreId, me); onClose(); }} />
          </View>
        )}

        {!reversed && chore.disputeStatus && iAmApprover && panel !== 'cosign' && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: TYPO.caption, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
              {chore.disputeStatus === 'flagged'
                ? `No coins have moved. Talk it over with ${otherName}, or keep your approval as is.`
                : `Nothing changes unless you co-sign. If you do, ${kidName} loses ${coins} coins and the chore is marked declined.`}
            </Text>
            {disputedOn && (
              <Text style={{ fontSize: TYPO.caption, color: (isDark ? colors.textTertiary : colors.textSecondary) }}>
                {otherName} {chore.disputeStatus === 'flagged' ? 'flagged' : 'requested reversal of'} this on {disputedOn}.
              </Text>
            )}
            {pastCosignWindow && (
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.danger }}>
                The 24-hour window to co-sign this has passed — standing by keeps the approval as is.
              </Text>
            )}
            <DiscussBtn />
            <Secondary label="Stand by my approval"
              onPress={() => run(() => standBy(choreId, me, { inline: true }), `Approval stands. ${otherName} has been told.`)} />
            {chore.disputeStatus === 'reversal_requested' && !pastCosignWindow && (
              <Primary label="Co-sign & reverse" danger onPress={() => { setNote(null); setPanel('cosign'); }} />
            )}
          </View>
        )}
        {panel === 'cosign' && (
          <View style={{ gap: 10, borderRadius: 14, padding: 14, backgroundColor: isDark ? colors.danger + '14' : colors.danger + '0D' }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <ShieldCheck size={18} color={colors.danger} />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>
                This removes {coins} coins from {kidName} and marks "{chore.title}" as declined. {kidName} will be told. This can't be undone.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Secondary label="Cancel" onPress={() => setPanel('none')} /></View>
              <View style={{ flex: 1 }}>
                <Primary label={`Remove ${coins} coins`} danger
                  onPress={() => run(() => coSign(choreId, me, { inline: true }), `Reversed. ${kidName}'s ${coins} coins were taken back.`)} />
              </View>
            </View>
          </View>
        )}

        {!reversed && chore.disputeStatus && !iAmApprover && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: TYPO.caption, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
              Waiting on {approverName} to respond. {kidName} sees nothing unless {approverName} agrees.
            </Text>
            <DiscussBtn />
            {iRaisedIt && (
              <Secondary label={chore.disputeStatus === 'flagged' ? 'Withdraw flag' : 'Withdraw request'}
                onPress={() => run(() => standBy(choreId, me, { inline: true }), 'Withdrawn. The approval stands.')} />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
