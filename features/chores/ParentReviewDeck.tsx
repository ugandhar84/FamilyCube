/**
 * ParentReviewDeck — All approval flows for parents:
 *   1. Grandparent quests pending PARENT approval
 *   2. Child chore submissions (pending_approval)
 *   3. Cash-out requests
 *   4. Redo requests / pushback (Two-Bounce rule → lock)
 */
import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, Pressable, TextInput, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import AppBottomSheet from '@/components/AppBottomSheet';
import {
  useChoreStore, REJECTION_PRESETS,
  type ChoreTask, type RejectionPresetKey,
} from '@/store/choreStore';
import { choreToQuest } from '@/store/choreAdapter';
import { QuestApprovalCard } from '../hub/parent/QuestApprovalCard';
import type { FamilyMember } from '@/store/familyStore';

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(expiryIso?: string) {
  const [hoursLeft, setHoursLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiryIso) { setHoursLeft(null); return; }
    const tick = () => {
      const diff = (new Date(expiryIso).getTime() - Date.now()) / 3600_000;
      setHoursLeft(Math.max(0, diff));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [expiryIso]);
  return hoursLeft;
}

// ─── Auto-approve badge ───────────────────────────────────────────────────────

function AutoApproveBadge({ expiresAt, colors }: { expiresAt?: string; colors: any }) {
  const hoursLeft = useCountdown(expiresAt);
  if (hoursLeft === null) return null;
  const urgent = hoursLeft < 4;
  return (
    <View style={{ backgroundColor: urgent ? '#FEE2E2' : '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: urgent ? '#EF4444' : colors.textTertiary }}>
        {hoursLeft < 1 ? 'Auto-approves soon ⚡' : `Auto in ${Math.round(hoursLeft)}h`}
      </Text>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ emoji, title, count, colors }: {
  emoji: string; title: string; count: number; colors: any;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>{title}</Text>
      <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>{count}</Text>
      </View>
    </View>
  );
}

// ─── Child submission review card ─────────────────────────────────────────────

interface ReviewCardProps {
  task: ChoreTask; members: FamilyMember[];
  colors: any; isDark: boolean;
  onApprove: (t: ChoreTask) => void;
  onRedo: (t: ChoreTask) => void;
}
function ReviewCard({ task, members, colors, isDark, onApprove, onRedo }: ReviewCardProps) {
  const child = members.find(m => m.id === task.assignedToId);
  const isGP  = task.categoryType === 'grandparent_quest';
  const { acknowledgeGPReimbursement } = useChoreStore();
  const hasReceipt  = !!task.receiptPhotoUrl || !!task.receiptAmount;
  const reimbursed  = !!task.receiptReimbursedAt;

  return (
    <View style={{
      backgroundColor: isDark ? colors.card : '#fff',
      borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 12, padding: 16,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {child && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 4 }}>
            <FamilyAvatar name={child.name} emoji={(child as any).emoji} avatarUrl={(child as any).avatarUrl} size={26} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{child.name.split(' ')[0]}</Text>
          </View>
        )}
        {isGP && (
          <View style={{ backgroundColor: '#DBEAFE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#2563EB' }}>GP Quest</Text>
          </View>
        )}
        {task.basePoints > 0 && (
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#D97706' }}>+{task.basePoints} pts</Text>
          </View>
        )}
        {task.requiresPhotoProof && <Text style={{ fontSize: 14 }}>📸</Text>}
        <View style={{ flex: 1 }} />
        <AutoApproveBadge expiresAt={task.approvalWindowExpiresAt} colors={colors} />
      </View>

      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>{task.title}</Text>

      {/* Photo proof submitted by kid */}
      {task.submissionPhotoUrl && (
        <View style={{ marginTop: 8, marginBottom: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#BBF7D0' }}>
          <Image source={{ uri: task.submissionPhotoUrl }} style={{ width: '100%', height: 180 }} resizeMode="cover" />
          <View style={{ backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: '#059669' }}>📸 Proof photo attached</Text>
          </View>
        </View>
      )}
      {task.requiresPhotoProof && !task.submissionPhotoUrl && (
        <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13 }}>⚠️</Text>
          <Text style={{ fontSize: TYPO.caption, color: '#92400E', fontWeight: '600' }}>No photo submitted — photo was required</Text>
        </View>
      )}

      {task.submissionNote && (
        <View style={{ backgroundColor: isDark ? colors.surface : '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, marginBottom: 2 }}>CHILD'S NOTE</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 }}>{task.submissionNote}</Text>
        </View>
      )}
      {(task.redoCount ?? 0) > 0 && (
        <Text style={{ fontSize: TYPO.caption, color: '#D97706', fontWeight: '600', marginBottom: 8 }}>
          ↩ Submitted {task.redoCount} time{task.redoCount === 1 ? '' : 's'} — next redo auto-approves
        </Text>
      )}

      {/* GP Receipt block */}
      {hasReceipt && (
        <View style={{ borderRadius: 14, borderWidth: 1.5,
          borderColor: reimbursed ? '#BBF7D0' : '#FDE68A',
          backgroundColor: reimbursed ? '#F0FDF4' : (isDark ? '#1C1500' : '#FFFBEB'),
          overflow: 'hidden', marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
            borderBottomWidth: task.receiptPhotoUrl ? 1 : 0,
            borderBottomColor: reimbursed ? '#BBF7D0' : '#FDE68A40' }}>
            <Text style={{ fontSize: 16 }}>🧾</Text>
            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '800',
              color: reimbursed ? '#059669' : '#92400E' }}>
              {reimbursed ? 'Receipt reimbursed ✓' : 'GP submitted a receipt'}
            </Text>
            {task.receiptAmount != null && (
              <View style={{ backgroundColor: reimbursed ? '#059669' : '#F59E0B', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                  ${task.receiptAmount.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
          {task.receiptPhotoUrl && (
            <Image source={{ uri: task.receiptPhotoUrl }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
          )}
          {task.receiptNote && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: TYPO.label, color: isDark ? '#FCD34D' : '#78350F', fontStyle: 'italic' }}>
                "{task.receiptNote}"
              </Text>
            </View>
          )}
          {!reimbursed && (
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Mark as Reimbursed?',
                  task.receiptAmount != null
                    ? `Confirm you've paid $${task.receiptAmount.toFixed(2)} back to ${child?.name?.split(' ')[0] ?? 'the helper'}.`
                    : `Confirm you've reimbursed ${child?.name?.split(' ')[0] ?? 'the helper'} for this receipt.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: '💳 Reimbursed', onPress: () => acknowledgeGPReimbursement(task.id) },
                  ]
                );
              }}
              style={({ pressed }) => ({ margin: 10, backgroundColor: '#F59E0B', borderRadius: 10,
                paddingVertical: 10, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>💳 Mark Reimbursed</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Pressable
          onPress={() => onRedo(task)}
          style={({ pressed }) => ({
            flex: 1, backgroundColor: isDark ? colors.surface : '#FEF2F2',
            borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A5',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>↩ Redo</Text>
        </Pressable>
        <Pressable
          onPress={() => onApprove(task)}
          style={({ pressed }) => ({
            flex: 2, backgroundColor: '#059669', borderRadius: 12, padding: 10,
            alignItems: 'center', opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>✓ Approve</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Cash-out approval card ───────────────────────────────────────────────────

function CashOutCard({ req, member, colors, isDark }: {
  req: any; member?: FamilyMember; colors: any; isDark: boolean;
}) {
  const { approveCashOut, denyCashOut } = useChoreStore();
  const ratio = useChoreStore(s => s.householdSettings.pointsToFiatRatio);

  return (
    <View style={{
      backgroundColor: isDark ? colors.card : '#F0FDF4',
      borderRadius: 16, borderWidth: 1, borderColor: '#BBF7D0',
      marginBottom: 12, padding: 16,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {member && <FamilyAvatar name={member.name} emoji={(member as any).emoji} size={28} />}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>Cash-Out Request</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>{member?.name?.split(' ')[0] ?? req.userId}</Text>
        </View>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: '#059669' }}>
          ${(req.amount * ratio).toFixed(2)}
        </Text>
      </View>

      <View style={{ backgroundColor: isDark ? colors.surface : '#ECFDF5', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        {[
          { l: '🛍️ Spend', v: req.spendAllocation },
          { l: '🏦 Save',  v: req.saveAllocation  },
          { l: '❤️ Give',  v: req.giveAllocation  },
        ].map(j => (
          <View key={j.l} style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.textSecondary }}>{j.l}</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#059669' }}>
              {j.v} pts (${(j.v * ratio).toFixed(2)})
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={() => Alert.alert('Deny Cash-Out?', "Funds stay in their wallet.", [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Deny', style: 'destructive', onPress: () => denyCashOut(req.id) },
          ])}
          style={({ pressed }) => ({
            flex: 1, backgroundColor: isDark ? colors.surface : '#FEF2F2',
            borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A5',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>Deny</Text>
        </Pressable>
        <Pressable
          onPress={() => approveCashOut(req.id)}
          style={({ pressed }) => ({
            flex: 2, backgroundColor: '#059669', borderRadius: 12, padding: 10,
            alignItems: 'center', opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>💵 Approve Payout</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Redo sheet with preset reasons ──────────────────────────────────────────

function RedoSheet({ task, visible, onClose, isDark, colors }: {
  task: ChoreTask | null; visible: boolean; onClose: () => void;
  isDark: boolean; colors: any;
}) {
  const { requestRedo } = useChoreStore();
  const [preset, setPreset]   = useState<RejectionPresetKey | null>(null);
  const [customMsg, setCustomMsg] = useState('');
  const [loading, setLoading]     = useState(false);

  const handleSend = () => {
    if (!task) return;
    const msg = preset === 'CUSTOM'
      ? customMsg.trim()
      : REJECTION_PRESETS.find(p => p.key === preset)?.label ?? '';
    if (!msg) { Alert.alert('Pick a reason', 'Choose a preset or type a custom message.'); return; }
    setLoading(true);
    requestRedo(task.id, '', msg, preset ?? undefined);
    setLoading(false);
    setPreset(null); setCustomMsg('');
    onClose();
  };

  if (!task) return null;

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title="Request Redo">
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 }}>
          {task.title}
        </Text>

        {(task.redoCount ?? 0) >= 1 && (
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#D97706' }}>
              ⚠️ This has already been sent back once. Next rejection will auto-approve.
            </Text>
          </View>
        )}

        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 10 }}>
          What needs fixing?
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {REJECTION_PRESETS.map(p => (
            <Pressable
              key={p.key}
              onPress={() => setPreset(p.key)}
              style={({ pressed }) => ({
                backgroundColor: preset === p.key ? BRAND.purple : isDark ? colors.surface : '#F3F4F6',
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                borderWidth: 1, borderColor: preset === p.key ? BRAND.purple : colors.border,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: preset === p.key ? '#fff' : colors.textSecondary }}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {preset === 'CUSTOM' && (
          <TextInput
            value={customMsg}
            onChangeText={setCustomMsg}
            placeholder="Describe what needs to be fixed…"
            placeholderTextColor={colors.textTertiary}
            multiline numberOfLines={3}
            style={{
              backgroundColor: isDark ? colors.surface : '#F9FAFB',
              borderRadius: 12, borderWidth: 1, borderColor: colors.border,
              padding: 12, fontSize: TYPO.body, color: colors.textPrimary,
              minHeight: 80, textAlignVertical: 'top', marginBottom: 16,
            }}
          />
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: preset === 'CUSTOM' ? 0 : 8 }}>
          <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F3F4F6', borderRadius: 14, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSend}
            disabled={loading || !preset}
            style={({ pressed }) => ({
              flex: 2, backgroundColor: preset ? '#EF4444' : colors.border,
              borderRadius: 14, padding: 14, alignItems: 'center', opacity: pressed || loading ? 0.7 : 1,
            })}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: preset ? '#fff' : colors.textTertiary }}>↩ Send Redo</Text>
            }
          </Pressable>
        </View>
      </View>
    </AppBottomSheet>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ParentReviewDeckProps {
  parent: FamilyMember;
  members: FamilyMember[];
  colors: any;
  isDark: boolean;
}

export function ParentReviewDeck({ parent, members, colors, isDark }: ParentReviewDeckProps) {
  const {
    approveChore, requestRedo,
    scanAndAutoApprove, resetDueRecurringChores, syncFromDB, loadFromStorage,
  } = useChoreStore();
  const allNames = members.map(m => m.name);

  const chores       = useChoreStore(s => s.chores);
  const transactions = useChoreStore(s => s.transactions);
  const getPendingCashOuts = useChoreStore(s => s.getPendingCashOuts);

  const { pendingSubmissions, pendingCashOuts } = useMemo(() => ({
    // pending_grandparent_approval is that GP's own completion review, not
    // the parent's — this deck's Approve button calls approveChore, which
    // requires status === 'pending_approval' and silently no-ops on
    // anything else, so including it here rendered a dead "Approve" button
    // for a chore only the sponsoring grandparent can actually complete.
    pendingSubmissions: chores.filter(c => c.status === 'pending_approval'),
    pendingCashOuts:    getPendingCashOuts(),
  }), [chores, transactions]);

  const [redoTask, setRedoTask] = useState<ChoreTask | null>(null);
  const [redoOpen, setRedoOpen] = useState(false);

  useEffect(() => {
    loadFromStorage().then(() => { syncFromDB(); scanAndAutoApprove(); resetDueRecurringChores(); });
  }, []);

  const totalCount = pendingSubmissions.length + pendingCashOuts.length;

  if (totalCount === 0) {
    // Matches HouseholdBacklogSection's empty state — compact single-line
    // treatment, not a large heading+subtext box, so every Hub section's
    // "nothing here" moment reads the same.
    return (
      <View style={{ alignItems: 'center', paddingVertical: 12, gap: 4 }}>
        <CheckCircle2 size={18} color={colors.textTertiary} />
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center' }}>
          All caught up
        </Text>
      </View>
    );
  }

  return (
    <>
      {/* Plain View, not a ScrollView — this only ever renders nested inside
          ChoreReviewSection's own SectionCard, which already sits inside the
          Hub's outer ScrollView. A second ScrollView here caused scroll-
          inside-scroll AND double horizontal padding (this component's own
          16px on top of the section's), which visibly narrowed these cards
          versus the section header and every sibling card above them. */}
      <View>

        {/* 1. Child chore submissions — same card design as the (removed)
             duplicate that used to also show in Action Needed, so a
             submission only ever looks one way, in one place. Receipt-
             bearing submissions (a GP's purchase receipt awaiting
             reimbursement) keep the richer ReviewCard — QuestApprovalCard
             has no receipt/reimbursement UI at all, so routing those
             through it would silently drop that feature. No "Waiting for
             Review" sub-header here — when this deck renders inside
             ChoreReviewSection (the Hub), that section's own header
             ("Chore Reviews · N pending approval") already says the same
             thing; repeating it directly above the list read as a bug. */}
        {pendingSubmissions.length > 0 && (
          <>
            {pendingSubmissions.map(task => (
              task.receiptPhotoUrl || task.receiptAmount != null ? (
                <ReviewCard
                  key={task.id} task={task} members={members}
                  colors={colors} isDark={isDark}
                  onApprove={(t) => Alert.alert('Approve?', `Award ${t.basePoints} pts for "${t.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: '✓ Approve', onPress: () => approveChore(t.id, parent.id) },
                  ])}
                  onRedo={(t) => { setRedoTask(t); setRedoOpen(true); }}
                />
              ) : (
                <QuestApprovalCard
                  key={task.id} q={choreToQuest(task)} active={parent} members={members} allNames={allNames}
                  colors={colors} isDark={isDark}
                  approveQuest={(id) => approveChore(id, parent.id)}
                  declineQuest={(id, by, reason) => requestRedo(id, by, reason)}
                  onDeclinePress={() => { setRedoTask(task); setRedoOpen(true); }}
                />
              )
            ))}
          </>
        )}

        {/* 2. Cash-out requests */}
        {pendingCashOuts.length > 0 && (
          <>
            <SectionHeader emoji="💵" title="Cash-Out Requests" count={pendingCashOuts.length} colors={colors} />
            {pendingCashOuts.map((req: any) => (
              <CashOutCard
                key={req.id} req={req} member={members.find(m => m.id === req.userId)}
                colors={colors} isDark={isDark}
              />
            ))}
          </>
        )}
      </View>

      <RedoSheet
        task={redoTask} visible={redoOpen}
        onClose={() => { setRedoOpen(false); setRedoTask(null); }}
        isDark={isDark} colors={colors}
      />
    </>
  );
}
