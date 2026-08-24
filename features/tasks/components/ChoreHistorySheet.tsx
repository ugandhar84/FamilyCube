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
  other: 'Updated',
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago`
    : mins < 24 * 60 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / (60 * 24))}d ago`;
  const abs = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
        <View style={{ borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, paddingTop: 12, maxHeight: '80%', backgroundColor: colors.card }}>
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
                return (
                  <View key={row.id} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ alignItems: 'center', width: 12 }}>
                      <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: i === 0 ? colors.primary : colors.border, marginTop: 4 }} />
                      {!isLast && <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginTop: 4 }} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
                        {verb}{actor ? ` by ${actor.split(' ')[0]}` : ''}
                      </Text>
                      {!!row.note && (
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>{row.note}</Text>
                      )}
                      {!!row.field && (row.oldValue != null || row.newValue != null) && (
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
                          {row.field}: {row.oldValue ?? '—'} → {row.newValue ?? '—'}
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
