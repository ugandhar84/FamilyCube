/**
 * ChoreHistorySheet — full activity_log trail for one chore, opened from the
 * history icon on QuestCard (Tasks tab) and KidQuestCard (Hub). One shared
 * sheet for both card forks rather than duplicating the fetch/format logic.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import { fetchActivityLog, type ActivityLogRow, type ActivityAction } from '@/lib/activityLog';
import { fmtDate } from '@/lib/dates';

// Raw activity_log field names → a human label, so a row reads "Due date:"
// instead of the literal camelCase column name "dueDate:".
const FIELD_LABEL: Record<string, string> = {
  status: 'Status', assignedToId: 'Assigned to', coinsReward: 'Coins', bonusCoins: 'Bonus coins',
  dueDate: 'Due date', description: 'Notes',
};

const VERB: Record<ActivityAction, string> = {
  created: 'Posted', deleted: 'Deleted',
  date_changed: 'Date changed', time_changed: 'Time changed',
  recurrence_changed: 'Recurrence changed', recurrence_cancelled: 'Recurrence cancelled',
  driver_assigned: 'Driver assigned', driver_reassigned: 'Driver reassigned', driver_removed: 'Driver removed',
  gp_welcome_changed: 'Grandparent welcome changed', teen_welcome_changed: 'Teen welcome changed',
  notes_changed: 'Notes changed',
  claimed: 'Claimed', submitted: 'Submitted for review', approved: 'Approved',
  declined: 'Sent back', reassigned: 'Reassigned',
  status_changed: 'Status changed', reward_changed: 'Reward changed', due_date_changed: 'Due date changed',
  redo_disputed: 'Disputed the redo request', redo_dispute_resolved: 'Dispute resolved',
  other: 'Updated',
};

// Status/semantic color-coding for the timeline — was plain textPrimary
// for every row regardless of outcome, so "Approved" and "Declined" read
// identically at a glance despite the app already having a real
// approved/declined color pattern (see KidQuestCard's questStatusMeta).
function actionColor(action: ActivityAction, colors: any): string | undefined {
  if (action === 'approved') return colors.success;
  if (action === 'declined' || action === 'redo_disputed') return colors.danger;
  if (action === 'submitted') return colors.amber;
  if (action === 'redo_dispute_resolved') return colors.success;
  return undefined;
}

// "Reassigned" rows log the raw assignedToId (a member uuid) as old/new
// value — shown verbatim, a parent just sees two meaningless UUIDs instead
// of who the chore moved from/to. Resolve through the member list the same
// way `actor` already is above; falls back to the raw id only if the
// member no longer exists (e.g. removed from the family since).
function resolveFieldValue(field: string | null, value: string | null, members: FamilyMember[]): string {
  if (value == null) return '—';
  if (field === 'assignedToId') {
    return members.find(m => m.id === value)?.name?.split(' ')[0] ?? value;
  }
  // dueDate is a raw "YYYY-MM-DD" — was shown verbatim instead of the
  // app's normal "Aug 27, 2026" display format used everywhere else.
  if (field === 'dueDate') {
    return fmtDate(value, value);
  }
  return value;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago`
    : mins < 24 * 60 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / (60 * 24))}d ago`;
  // hour12 explicit — toLocaleString with no hour12 option follows the
  // device locale's own convention, which renders 24-hour time on a
  // 24-hour-locale device even though every other time display in this app
  // (lib/dates.ts's fmtTime, etc.) always uses 12-hour AM/PM.
  const abs = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${abs} · ${rel}`;
}

export function ChoreHistorySheet({ choreId, title, members, onClose }: {
  choreId: string | null;
  title?: string;
  members: FamilyMember[];
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!choreId) return;
    setLoading(true);
    fetchActivityLog('chore', choreId).then(r => { setRows(r); setLoading(false); });
  }, [choreId]);

  const close = () => { setRows([]); onClose(); };

  return (
    <Modal visible={!!choreId} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={{ borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, paddingTop: 12, maxHeight: '80%', backgroundColor: colors.card,
          borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 8 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>History</Text>
              {!!title && <Text style={{ fontSize: TYPO.caption, fontWeight: '700', marginTop: 2, color: colors.textSecondary }} numberOfLines={1}>{title}</Text>}
            </View>
            <Pressable onPress={close} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? colors.surface : '#F1F5F9' }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 14 }} showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : rows.length === 0 ? (
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>No history yet.</Text>
            ) : (
              rows.map((row, i) => {
                const actor = row.actorId ? members.find(m => m.id === row.actorId)?.name : undefined;
                const verb = VERB[row.action] ?? row.action;
                const isLast = i === rows.length - 1;
                const rowColor = actionColor(row.action, colors);
                return (
                  <View key={row.id} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ alignItems: 'center', width: 12 }}>
                      <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: rowColor ?? (i === 0 ? colors.primary : colors.border), marginTop: 4 }} />
                      {!isLast && <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginTop: 4 }} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: rowColor ?? colors.textPrimary }}>
                        {verb}{actor ? ` by ${actor.split(' ')[0]}` : ''}
                      </Text>
                      {!!row.note && (
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>{row.note}</Text>
                      )}
                      {!!row.field && (row.oldValue != null || row.newValue != null) && (
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
                          {FIELD_LABEL[row.field] ?? row.field}: {resolveFieldValue(row.field, row.oldValue, members)} → {resolveFieldValue(row.field, row.newValue, members)}
                        </Text>
                      )}
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 3 }}>{fmtWhen(row.createdAt)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
