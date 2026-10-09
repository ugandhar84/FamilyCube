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
import { useState } from 'react';
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

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const first = (id?: string | null) => members.find(m => m.id === id)?.name?.split(' ')[0] ?? 'A parent';

  if (!chore || !activeMemberId) {
    return (
      <View style={{ flex: 1, backgroundColor: canvas, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>This approval is no longer available.</Text>
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

  const tone = {
    ok:      { bg: colors.tealLight,  fg: colors.teal },
    warn:    { bg: colors.amberLight, fg: colors.amber },
    danger:  { bg: isDark ? colors.danger + '22' : colors.danger + '14', fg: colors.danger },
    neutral: { bg: colors.surface,    fg: colors.textSecondary },
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
      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>{label}</Text>
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
      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
        {kind === 'flag' ? `Why do you want to discuss this with ${approverName}? (optional)`
          : `This asks ${approverName} to co-sign reversing the ${coins}-coin payout. Nothing changes until they agree. Why? (optional)`}
      </Text>
      <TextInput
        value={text} onChangeText={setText} multiline maxLength={300} editable={!busy}
        placeholder="Add a reason" placeholderTextColor={colors.textTertiary}
        style={{ minHeight: 72, borderRadius: 12, padding: 12, fontSize: TYPO.body, color: colors.textPrimary,
          backgroundColor: isDark ? colors.surface : '#FFFFFF', borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' }}
      />
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
        <Text style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.textPrimary }} numberOfLines={2}>{chore.title}</Text>
        <View style={{ alignSelf: 'flex-start', borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: tone.bg }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: tone.fg }}>{badge.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>
        <View style={{ borderRadius: 16, padding: 16, gap: 6, backgroundColor: isDark ? colors.card : colors.surface }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>
            {approverName} approved this{approvedOn ? ` on ${approvedOn}` : ''}.
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            {kidName} earned {coins} coins.
          </Text>
          {!!chore.disputeStatus && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              {first(chore.disputedById)} {chore.disputeStatus === 'flagged' ? 'flagged it for discussion' : 'asked to reverse it'}
              {chore.disputeReason ? ` — "${chore.disputeReason}"` : ''}.
            </Text>
          )}
          {reversed && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              Reversed{chore.reversedById ? ` by ${first(chore.reversedById)}` : ''}. {kidName}'s coins were taken back.
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
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
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
        )}
        {panel === 'flag' && reasonPanel('flag')}
        {panel === 'reverse' && reasonPanel('reverse')}

        {!reversed && !chore.disputeStatus && iAmApprover && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>You approved this. Nobody has raised a concern.</Text>
            <Secondary label="Dismiss from list" onPress={async () => { await acknowledge(choreId, me); onClose(); }} />
          </View>
        )}

        {!reversed && chore.disputeStatus && iAmApprover && panel !== 'cosign' && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              {chore.disputeStatus === 'flagged'
                ? `No coins have moved. Talk it over with ${otherName}, or keep your approval as is.`
                : `Nothing changes unless you co-sign. If you do, ${kidName} loses ${coins} coins and the chore is marked declined.`}
            </Text>
            <DiscussBtn />
            <Secondary label="Stand by my approval"
              onPress={() => run(() => standBy(choreId, me, { inline: true }), `Approval stands. ${otherName} has been told.`)} />
            {chore.disputeStatus === 'reversal_requested' && (
              <Primary label="Co-sign & reverse" danger onPress={() => { setNote(null); setPanel('cosign'); }} />
            )}
          </View>
        )}
        {panel === 'cosign' && (
          <View style={{ gap: 10, borderRadius: 14, padding: 14, backgroundColor: isDark ? colors.danger + '14' : colors.danger + '0D' }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <ShieldCheck size={18} color={colors.danger} />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
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
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
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
