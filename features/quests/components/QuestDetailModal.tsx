import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import { useQuestStore } from '@/store/choreAdapter';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { Quest } from '@/store/questStore';
import { parseDbTime, fmtDateShort } from '@/lib/dates';
import { fetchActivityLog, type ActivityLogRow } from '@/lib/activityLog';
import { EditQuestModal } from './EditQuestModal';

function fmt12hFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseDbTime(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmt12hTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  // Handle ISO timestamps (e.g. "2026-10-12T17:00:00Z") and plain "HH:MM"
  if (hhmm.includes('T') || hhmm.length > 5) {
    const d = new Date(hhmm);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '';
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ── Timeline node ────────────────────────────────────────────────────────────
function TimelineNode({
  label, detail, filled, isLast,
}: { label: string; detail?: string; filled: boolean; isLast?: boolean }) {
  const { colors, isDark } = useTheme();
  const dotBorder = filled ? colors.teal : colors.border;
  const dotBg     = filled ? colors.teal : 'transparent';

  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      {/* Dot + line */}
      <View style={{ alignItems: 'center', width: 18 }}>
        <View style={{
          width: 18, height: 18, borderRadius: 9,
          borderWidth: 2, borderColor: dotBorder,
          backgroundColor: dotBg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          {filled && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />}
        </View>
        {!isLast && (
          <View style={{ width: 2, flex: 1, backgroundColor: colors.border, marginTop: 3 }} />
        )}
      </View>
      {/* Text */}
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 22 }}>
        <Text style={{ fontSize: 15, fontWeight: filled ? '700' : '500', color: filled ? colors.textPrimary : colors.textSecondary }}>
          {label}
        </Text>
        <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 2 }}>
          {detail || 'Waiting'}
        </Text>
      </View>
    </View>
  );
}

// ── Detailed log row (parent-only) ───────────────────────────────────────────
const ACTION_META: Record<string, { icon: string; label: string }> = {
  created:    { icon: '✦', label: 'Created' },
  assigned:   { icon: '→', label: 'Assigned' },
  claimed:    { icon: '🤝', label: 'Claimed' },
  submitted:  { icon: '📤', label: 'Submitted' },
  approved:   { icon: '✓',  label: 'Approved' },
  declined:   { icon: '✕',  label: 'Declined' },
  reassigned: { icon: '↔',  label: 'Reassigned' },
  reopened:   { icon: '↩',  label: 'Reopened' },
  cancelled:  { icon: '✕',  label: 'Cancelled' },
  archived:   { icon: '📦', label: 'Archived' },
};

function LogRow({ entry, members, colors, isLast }: {
  entry: { at: string; action: string; by?: string; note?: string };
  members: any[];
  colors: any;
  isLast: boolean;
}) {
  const actor = members.find(m => m.id === entry.by);
  const meta  = ACTION_META[entry.action] ?? { icon: '·', label: entry.action };
  const d = parseDbTime(entry.at);
  const stamp = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingBottom: isLast ? 0 : 16 }}>
      {/* Icon column + connector */}
      <View style={{ alignItems: 'center', width: 28 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: colors.surface,
          borderWidth: 1, borderColor: colors.border,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>{meta.icon}</Text>
        </View>
        {!isLast && <View style={{ width: 1, flex: 1, backgroundColor: colors.border, marginTop: 4 }} />}
      </View>
      {/* Content */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{meta.label}</Text>
          {actor && (
            <Text style={{ fontSize: 12, color: colors.textTertiary }}>by {actor.name.split(' ')[0]}</Text>
          )}
        </View>
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{stamp}</Text>
        {entry.note && (
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' }}>"{entry.note}"</Text>
        )}
      </View>
    </View>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────
export function QuestDetailModal({ quest, onClose, onDelete, canEdit, isParent }: {
  quest: Quest;
  onClose: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  isParent?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [dbLog, setDbLog] = useState<ActivityLogRow[]>([]);
  const [cheered, setCheered] = useState(false);
  const { updateQuest, quests, cheerQuest } = useQuestStore();
  const activeMemberId = useFamilyStore(s => s.activeMemberId) ?? '';
  const insets    = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const members   = useFamilyStore(s => s.members);
  const choreData = useChoreStore(s => s.chores.find(c => c.id === quest.id));

  // Always read the latest version from the store so edits reflect immediately
  const liveQuest = quests.find(q => q.id === quest.id) ?? quest;

  const canvas  = isDark ? '#0E0C13' : '#FFFFFF';
  const chipBg  = isDark ? '#1E1E2A' : '#EEECF2';

  const refreshLog = () => fetchActivityLog('chore', quest.id, 10).then(rows => setDbLog(rows));
  // Re-fetch whenever the quest id changes OR whenever the status changes
  // (claim → submitted → approved etc. each write a new activity_log row)
  useEffect(() => { refreshLog(); }, [quest.id, liveQuest.status]);

  const assigneeIds = liveQuest.assignedToIds?.length
    ? liveQuest.assignedToIds
    : liveQuest.assignedToId ? [liveQuest.assignedToId] : [];
  const assignees = assigneeIds.map(id => members.find(m => m.id === id)).filter(Boolean) as typeof members;

  // Activity timeline stamps — prefer choreData timestamps (always populated)
  // over quest-adapter fields which may not survive the choreToQuest mapping
  const rawCreatedAt   = choreData?.createdAt ?? (liveQuest as any).createdAt;
  const rawClaimedAt   = liveQuest.claimedAt  ?? choreData?.claimedAt;
  const rawSubmittedAt = liveQuest.submittedAt ?? choreData?.submittedAt;
  const rawApprovedAt  = (liveQuest as any).approvedAt ?? choreData?.approvedAt;
  const rawDeclinedAt  = (liveQuest as any).declinedAt ?? choreData?.declinedAt;

  const createdBy  = members.find(m => m.id === (liveQuest.createdById ?? choreData?.createdById));
  const claimedBy  = members.find(m => m.id === liveQuest.assignedToId);
  const approvedBy = members.find(m => m.id === ((liveQuest as any).reviewedById ?? choreData?.reviewedById));

  const createdDetail = rawCreatedAt
    ? `${createdBy?.name?.split(' ')[0] ?? ''} · ${fmt12hFromIso(rawCreatedAt)}`.trimStart().replace(/^· /, '')
    : undefined;
  const claimedDetail = rawClaimedAt
    ? `${claimedBy?.name?.split(' ')[0] ?? ''} · ${fmt12hFromIso(rawClaimedAt)}`.trimStart().replace(/^· /, '')
    : undefined;
  const submittedDetail = rawSubmittedAt
    ? fmt12hFromIso(rawSubmittedAt)
    : undefined;
  const approvedDetail = rawApprovedAt
    ? `${approvedBy?.name?.split(' ')[0] ?? ''} · ${fmt12hFromIso(rawApprovedAt)}`.trimStart().replace(/^· /, '')
    : rawDeclinedAt
      ? `Declined · ${fmt12hFromIso(rawDeclinedAt)}`
      : undefined;

  // Human-readable label + style per DB action+field combo
  function trailLabel(row: ActivityLogRow): { label: string; detail?: string; emoji: string; dot: string } {
    const actor = members.find(m => m.id === row.actorId)?.name?.split(' ')[0] ?? '';
    const by = actor ? ` — ${actor}` : '';
    switch (row.action) {
      case 'created':      return { label: `Created${by}`, emoji: '✨', dot: colors.teal };
      case 'claimed':      return { label: `Claimed${by}`, emoji: '🙋', dot: colors.pink };
      case 'submitted':    return { label: `Submitted for review${by}`, emoji: '📤', dot: colors.amber };
      case 'approved':     return { label: `Approved${by}`, emoji: '✅', dot: colors.teal };
      case 'declined':     return { label: `Declined${by}`, detail: row.note ?? undefined, emoji: '❌', dot: colors.danger };
      case 'reassigned': {
        const to = members.find(m => m.id === row.newValue)?.name?.split(' ')[0] ?? row.newValue ?? '?';
        return { label: `Reassigned to ${to}${by}`, emoji: '🔀', dot: colors.pink };
      }
      case 'reward_changed': {
        const field = row.field === 'bonusCoins' ? 'bonus coins' : 'coins';
        return { label: `Reward updated${by}`, detail: `${field}: ${row.oldValue ?? '?'} → ${row.newValue ?? '?'}`, emoji: '🪙', dot: colors.amber };
      }
      case 'due_date_changed': {
        const newDate = row.newValue ? fmtDateShort(row.newValue) : '—';
        return { label: `Due date changed${by}`, detail: newDate, emoji: '📅', dot: colors.teal };
      }
      case 'notes_changed':   return { label: `Notes updated${by}`, emoji: '📝', dot: colors.textTertiary };
      case 'status_changed':  return { label: `Status → ${row.newValue ?? '?'}${by}`, emoji: '🔄', dot: colors.pink };
      case 'deleted':         return { label: `Deleted${by}`, emoji: '🗑️', dot: colors.danger };
      default:                return { label: `${row.action}${by}`, emoji: '•', dot: colors.textTertiary };
    }
  }

  const note = (liveQuest as any).note || liveQuest.completionNote || choreData?.parentNote;

  // Bonus expiry info
  const bonusCoins     = choreData?.bonusCoins ?? 0;
  const bonusExpiresAt = choreData?.bonusExpiresAt;
  const bonusExpired   = bonusExpiresAt ? new Date(bonusExpiresAt) < new Date() : false;
  const bonusActive    = bonusCoins > 0 && !bonusExpired;
  const totalCoins     = (liveQuest.coins ?? 0) + (bonusActive ? bonusCoins : 0);

  // Meta chips
  const chips: { label: string; color?: string }[] = [];
  if (liveQuest.dueDate) {
    // dueDate may be a plain YYYY-MM-DD or a full ISO timestamp — normalise to date-only
    const datePart = liveQuest.dueDate.includes('T') ? liveQuest.dueDate.split('T')[0] : liveQuest.dueDate;
    const dateStr = fmtDateShort(datePart);
    const timeStr = liveQuest.dueTime ? ` · ${fmt12hTime(liveQuest.dueTime)}` : '';
    chips.push({ label: `${dateStr}${timeStr}` });
  }
  if (liveQuest.coins > 0 && !liveQuest.isAdultTask) {
    chips.push({ label: bonusCoins > 0 ? `${totalCoins} coins (${liveQuest.coins} + ${bonusCoins} bonus)` : `${liveQuest.coins} coins` });
  }
  if (liveQuest.category) chips.push({ label: liveQuest.category });
  if (liveQuest.difficulty) chips.push({ label: liveQuest.difficulty.charAt(0).toUpperCase() + liveQuest.difficulty.slice(1) });
  if (liveQuest.recurrence && liveQuest.recurrence !== 'once') chips.push({ label: `🔄 ${liveQuest.recurrence}` });
  if (liveQuest.photoRequired) chips.push({ label: '📸 Photo required' });
  if (liveQuest.isAdultTask) chips.push({ label: '👨‍👩 Adult only' });

  // Status badge
  const statusMap: Record<string, { label: string; color: string }> = {
    todo:             { label: 'Open',        color: colors.textSecondary },
    claimed:          { label: 'Claimed',     color: colors.teal },
    in_progress:      { label: 'In Progress', color: colors.teal },
    pending_approval: { label: 'In Review',   color: colors.pink },
    approved:         { label: 'Approved',    color: colors.teal },
    done:             { label: 'Done',        color: colors.teal },
    declined:         { label: 'Declined',    color: colors.danger },
  };
  const statusInfo = statusMap[liveQuest.status] ?? { label: liveQuest.status, color: colors.textSecondary };

  // When in edit mode, render EditQuestModal inside the same already-open Modal
  if (editing) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setEditing(false)}>
        <EditQuestModal
          quest={liveQuest}
          activeMemberId={activeMemberId}
          onClose={() => setEditing(false)}
          onSave={(id, patch) => {
            updateQuest(id, patch);
            setEditing(false);
            setTimeout(refreshLog, 1500); // allow DB write to settle
          }}
          onDelete={onDelete ? (_id: string) => { onDelete(); onClose(); } : undefined}
        />
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: canvas }}>

        {/* Top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 10 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.teal }}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {canEdit && (
            <TouchableOpacity
              onPress={() => setEditing(true)}
              style={{
                paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
                borderWidth: 1.5, borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero block: title + status + description ─────────────────────── */}
          <View style={{ paddingHorizontal: 20, paddingTop: 8, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <Text style={{ flex: 1, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: colors.textPrimary, lineHeight: 34 }}>
                {liveQuest.title}
              </Text>
              <View style={{
                marginTop: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                backgroundColor: statusInfo.color + '18', borderWidth: 1.5, borderColor: statusInfo.color + '50',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: statusInfo.color }}>{statusInfo.label}</Text>
              </View>
            </View>
            {(liveQuest.description || note) && (
              <Text style={{ fontSize: 15, color: colors.textSecondary, lineHeight: 22 }}>
                {liveQuest.description || note}
              </Text>
            )}
          </View>

          {/* ── Reward + due tinted card ─────────────────────────────────────── */}
          <View style={{
            marginHorizontal: 20, marginBottom: 20,
            backgroundColor: isDark ? colors.surface : colors.amberLight,
            borderRadius: 16, padding: 16, gap: 12,
          }}>
            {/* Coins row */}
            {liveQuest.coins > 0 && !liveQuest.isAdultTask && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.amber, marginBottom: 2 }}>Reward</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary }}>
                    {bonusActive ? totalCoins : liveQuest.coins}
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}> coins</Text>
                  </Text>
                  {bonusCoins > 0 && (
                    <Text style={{ fontSize: 12, color: bonusActive ? colors.amber : colors.textTertiary, marginTop: 2 }}>
                      {liveQuest.coins} base
                      {bonusActive ? ` + ${bonusCoins} bonus ⚡` : ` + ${bonusCoins} bonus (expired)`}
                    </Text>
                  )}
                </View>
                {bonusCoins > 0 && bonusExpiresAt && (
                  <View style={{
                    alignItems: 'flex-end', paddingLeft: 12,
                    borderLeftWidth: 1, borderLeftColor: colors.amber + '40',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: bonusActive ? colors.amber : colors.textTertiary }}>
                      {bonusActive ? 'Bonus expires' : 'Bonus expired'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, textAlign: 'right' }}>
                      {new Date(bonusExpiresAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Due date / time row */}
            {liveQuest.dueDate && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 16 }}>📅</Text>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textTertiary }}>Due</Text>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
                    {fmtDateShort(liveQuest.dueDate.includes('T') ? liveQuest.dueDate.split('T')[0] : liveQuest.dueDate)}
                    {liveQuest.dueTime ? `  ·  ${fmt12hTime(liveQuest.dueTime)}` : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Tags row: category · difficulty · recurrence */}
            {(liveQuest.category || liveQuest.difficulty || (liveQuest.recurrence && liveQuest.recurrence !== 'once') || liveQuest.photoRequired) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {liveQuest.category && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.amber + '22' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.amber }}>{liveQuest.category}</Text>
                  </View>
                )}
                {liveQuest.difficulty && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.teal + '18' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>{liveQuest.difficulty.charAt(0).toUpperCase() + liveQuest.difficulty.slice(1)}</Text>
                  </View>
                )}
                {liveQuest.recurrence && liveQuest.recurrence !== 'once' && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.pink + '18' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.pink }}>🔄 {liveQuest.recurrence}</Text>
                  </View>
                )}
                {liveQuest.photoRequired && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: chipBg }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>📸 Photo required</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── Who's on it ──────────────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textTertiary, marginBottom: 14 }}>
              {liveQuest.isPool && assignees.length === 0 ? 'Open to' : 'Assigned to'}
            </Text>
            {liveQuest.isPool && assignees.length === 0 ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: isDark ? colors.surface : colors.primaryLight,
                borderRadius: 12, padding: 14,
              }}>
                <Text style={{ fontSize: 24 }}>⚡</Text>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>Open pool</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Anyone in the family can claim this</Text>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 20 }}>
                {assignees.map(m => {
                  const roleColor = m.role === 'parent' ? colors.teal : colors.amber;
                  return (
                    <View key={m.id} style={{ alignItems: 'center', gap: 6 }}>
                      <FamilyAvatar
                        name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl}
                        siblings={members.map(x => x.name)} size={52}
                        ringColor={roleColor} ringWidth={2}
                      />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{m.name.split(' ')[0]}</Text>
                      <Text style={{ fontSize: 11, color: roleColor }}>{m.role === 'parent' ? 'Parent' : 'Kid'}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── Remaining sections: all padded ──────────────────────────────── */}
          <View style={{ paddingHorizontal: 20 }}>

          {/* ── 6. Submitted proof (kid's note/photo — parent needs to review) ─ */}
          {(liveQuest.status === 'pending_approval' || liveQuest.completionNote || liveQuest.photoUrl) && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 24 }} />
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.amber, marginBottom: 12 }}>
                  Submitted by kid
                </Text>
                {liveQuest.completionNote ? (
                  <View style={{
                    backgroundColor: isDark ? '#231F14' : '#FDF6E3',
                    borderRadius: 12, padding: 14,
                    borderLeftWidth: 3, borderLeftColor: colors.amber,
                  }}>
                    <Text style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 20 }}>{liveQuest.completionNote}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>No note — submitted without a message</Text>
                )}
              </View>
            </>
          )}

          {/* ── 7. Decline reason (parent previously sent this back) ─────────── */}
          {liveQuest.declineReason && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 24 }} />
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.danger, marginBottom: 10 }}>
                  Declined — reason sent
                </Text>
                <View style={{ backgroundColor: colors.danger + '12', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.danger }}>
                  <Text style={{ fontSize: 14, color: colors.danger, lineHeight: 20 }}>{liveQuest.declineReason}</Text>
                </View>
              </View>
            </>
          )}

          {/* ── 8. Lifecycle timeline ───────────────────────────────────────── */}
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 24 }} />
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textTertiary, marginBottom: 18 }}>
              Progress
            </Text>
            <TimelineNode label="Created"   detail={createdDetail}   filled={!!rawCreatedAt} />
            <TimelineNode label="Claimed"   detail={claimedDetail}   filled={!!rawClaimedAt} />
            <TimelineNode label="Submitted" detail={submittedDetail} filled={!!rawSubmittedAt} />
            <TimelineNode label="Approved"  detail={approvedDetail}  filled={!!(rawApprovedAt || rawDeclinedAt)} isLast />
          </View>

          {/* ── 9. Delete ───────────────────────────────────────────────────── */}
          {isParent && onDelete && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 24 }} />
              <TouchableOpacity
                onPress={onDelete}
                style={{
                  paddingVertical: 14, borderRadius: 14, marginBottom: 24,
                  borderWidth: 1.5, borderColor: colors.danger, alignItems: 'center',
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.danger }}>Delete chore</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── 10. Send appreciation (Figma "celebrate" card) ──────────────── */}
          {(() => {
            // Only show when the quest is done (approved) — a quick-thank-you prompt
            if (liveQuest.status !== 'approved') return null;
            const alreadyCheered = cheered || (liveQuest.cheers ?? []).some((c: any) => c.memberId === activeMemberId);
            const cheerCount = (liveQuest.cheers ?? []).length;
            return (
              <>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 24 }} />
                <View style={{
                  marginBottom: 24,
                  backgroundColor: isDark ? '#231F14' : '#FFF2CF',
                  borderRadius: 22, padding: 18,
                }}>
                  <Text style={{
                    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: isDark ? colors.amber : '#B8860B',
                    marginBottom: 6,
                  }}>
                    🏆 Small Win
                  </Text>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>
                    {liveQuest.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : '#786F5F', marginBottom: 14, lineHeight: 17 }}>
                    {alreadyCheered
                      ? `You sent appreciation${cheerCount > 1 ? ` · ${cheerCount} cheers total` : ''} 🎉`
                      : 'A quick thank-you goes a long way.'}
                  </Text>
                  {!alreadyCheered && (
                    <TouchableOpacity
                      onPress={() => {
                        cheerQuest(liveQuest.id, activeMemberId);
                        setCheered(true);
                      }}
                      activeOpacity={0.75}
                      style={{
                        alignSelf: 'flex-start',
                        backgroundColor: isDark ? colors.surface : '#FFFFFF',
                        borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '650' as any, color: isDark ? colors.amber : '#87681C' }}>
                        Send appreciation 🙌
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            );
          })()}

          {/* ── 11. Trail log (parent-only, newest→oldest so latest is on top) */}
          {isParent && dbLog.length > 0 && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 24 }} />
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textTertiary, marginBottom: 14 }}>
                  Trail Log
                </Text>
                {dbLog.map((row, i, arr) => {
                  const { label, detail, emoji, dot } = trailLabel(row);
                  const bgMap: Record<string, string> = {
                    [colors.teal]:         isDark ? '#1A2420' : '#E6F4EC',
                    [colors.pink]:         isDark ? '#1E1A28' : '#F0EBF8',
                    [colors.amber]:        isDark ? '#231F14' : '#FDF6E3',
                    [colors.danger]:       isDark ? '#2A1A1A' : '#FDEAEA',
                    [colors.textTertiary]: isDark ? '#1A1A22' : '#F4F4F6',
                  };
                  const bg = bgMap[dot] ?? (isDark ? '#1A1A22' : '#F4F4F6');
                  return (
                    <View key={row.id} style={{
                      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                      backgroundColor: bg, borderRadius: 12, padding: 12,
                      marginBottom: i < arr.length - 1 ? 8 : 0,
                    }}>
                      <View style={{
                        width: 34, height: 34, borderRadius: 9,
                        backgroundColor: dot + '20',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Text style={{ fontSize: 15 }}>{emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, lineHeight: 18 }}>{label}</Text>
                        {detail && <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{detail}</Text>}
                        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>
                          {new Date(row.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                        </Text>
                      </View>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot, marginTop: 6, flexShrink: 0 }} />
                    </View>
                  );
                })}
              </View>
            </>
          )}

          </View>{/* end padded wrapper */}
        </ScrollView>
      </View>
    </Modal>
  );
}
