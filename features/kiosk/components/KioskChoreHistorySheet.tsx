/**
 * KioskChoreHistorySheet — the full activity_log trail for one chore, in
 * kiosk's own visual language.
 *
 * ── Why this is a port and not a reuse ──────────────────────────────────
 * features/tasks/components/ChoreHistorySheet.tsx is the phone's version,
 * opened from the small History icon on both phone chore cards (QuestCard
 * on the Tasks tab, KidQuestCard on the Hub). Kiosk's Chores board carries
 * the same History affordance now, so it needs the same content — but the
 * phone sheet is a bottom sheet built entirely on `useTheme()` colors and
 * phone-scale TYPO, with a 32px close button and 11px timestamps. Dropped
 * onto a wall tablet it is both visually foreign and, at the bottom of the
 * ladder, genuinely hard to read from standing distance.
 *
 * What is NOT re-derived is the part that could drift: the data source is
 * the same `fetchActivityLog('chore', id)` call, and the VERB /
 * FIELD_LABEL / actionColor / resolveFieldValue / sanitizeNote formatting
 * rules below are that file's, carried over one-for-one — including its
 * UUID backstop for free-text notes, which exists because three separate
 * RPCs independently logged bare member ids at different times. A kiosk
 * copy that quietly dropped that guard would render raw hex to the whole
 * kitchen.
 *
 * Shell: KioskFormDrawer's 'drawer' variant, not 'dialog'. Per that file's
 * own guidance a drawer is right for "growable lists and long display
 * content" — a chore with a reassignment, two edits and a redo has a
 * genuinely unbounded row count — and a drawer is full-height, so the log
 * gets real vertical room. No `onSubmit` is passed, so it renders no footer
 * button: this is a read-only view, and its only exit is the close control
 * the shell already provides. Building on KioskFormDrawer also means the
 * idle lock is suspended while it's open via KioskModalHost, the same way
 * every other kiosk sheet gets that for free.
 */
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { History } from 'lucide-react-native';

import type { FamilyMember } from '@/store/familyStore';
import { fetchActivityLog, type ActivityLogRow, type ActivityAction } from '@/lib/activityLog';
import { fmtDate } from '@/lib/dates';

import { KIOSK_TYPO, KIOSK_SPACE } from '../kioskTheme';
import type { KioskColors } from '../kioskPalette';
import { KioskFormDrawer } from './KioskFormDrawer';

/**
 * Raw activity_log field names → a human label, so a row reads "Due date:"
 * instead of the literal camelCase column name. ChoreHistorySheet.tsx:17-20
 * verbatim.
 */
const FIELD_LABEL: Record<string, string> = {
  status: 'Status', assignedToId: 'Assigned to', coinsReward: 'Coins', bonusCoins: 'Bonus coins',
  dueDate: 'Due date', description: 'Notes',
};

/** ChoreHistorySheet.tsx:22-34 verbatim — one shared verb vocabulary. */
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

/**
 * Semantic color per row, so "Approved" and "Sent back" don't read
 * identically at a glance. Same outcome mapping the phone sheet uses
 * (ChoreHistorySheet.tsx:40-46), on kiosk tokens — and on the SAME
 * convention kidQuestLanes' kioskQuestMeta follows, where submitted/
 * in-review is gold and a completed outcome is sage.
 */
function actionAccent(action: ActivityAction, k: KioskColors): string | undefined {
  if (action === 'approved' || action === 'redo_dispute_resolved') return k.sage;
  if (action === 'declined' || action === 'redo_disputed') return k.danger;
  if (action === 'submitted') return k.gold;
  return undefined;
}

/** ChoreHistorySheet.tsx:53-64 verbatim. */
function resolveFieldValue(field: string | null, value: string | null, members: FamilyMember[]): string {
  if (value == null) return '—';
  if (field === 'assignedToId') {
    return members.find(m => m.id === value)?.name?.split(' ')[0] ?? value;
  }
  if (field === 'dueDate') return fmtDate(value, value);
  return value;
}

/**
 * ChoreHistorySheet.tsx:77-84 verbatim, guard and all. `note` is free text
 * written server-side by whichever RPC logged the row, and several have
 * historically embedded a bare member id. This is the one place they all
 * render, so it stays the backstop: resolve a UUID to a name if it matches
 * a known member, strip it otherwise rather than showing hex.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function sanitizeNote(note: string | null | undefined, members: FamilyMember[]): string | null {
  if (!note) return null;
  if (!UUID_RE.test(note)) return note;
  UUID_RE.lastIndex = 0;
  const cleaned = note.replace(UUID_RE, (uuid) => members.find(m => m.id === uuid)?.name?.split(' ')[0] ?? '');
  return cleaned.replace(/\s{2,}/g, ' ').trim() || null;
}

/** ChoreHistorySheet.tsx:86-97 verbatim, including the explicit hour12. */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago`
    : mins < 24 * 60 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / (60 * 24))}d ago`;
  const abs = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${abs} · ${rel}`;
}

export function KioskChoreHistorySheet({ choreId, choreTitle, members, k, onClose }: {
  /** null closes the sheet — same convention the phone sheet uses. */
  choreId: string | null;
  choreTitle?: string;
  members: FamilyMember[];
  k: KioskColors;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!choreId) return;
    let alive = true;
    setLoading(true);
    fetchActivityLog('chore', choreId).then(r => {
      // A kiosk sheet can be closed (or another chore's history opened)
      // while this request is still in flight — without the guard the
      // resolved rows would land in whatever is on screen by then.
      if (!alive) return;
      setRows(r);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [choreId]);

  const close = () => { setRows([]); onClose(); };

  return (
    <KioskFormDrawer
      visible={!!choreId}
      title="History"
      subtitle={choreTitle}
      accent={k.primary}
      Icon={History}
      k={k}
      onClose={close}
      variant="drawer"
    >
      {loading ? (
        <ActivityIndicator
          color={k.primary}
          style={{ marginTop: KIOSK_SPACE.lg }}
          accessibilityLabel="Loading this chore's history"
        />
      ) : rows.length === 0 ? (
        <Text style={[s.empty, { color: k.textMuted }]} numberOfLines={2}>
          Nothing has happened on this chore yet.
        </Text>
      ) : (
        <View style={s.log} accessibilityRole="list">
          {rows.map((row, i) => {
            const actor = row.actorId ? members.find(m => m.id === row.actorId)?.name : undefined;
            const verb = VERB[row.action] ?? row.action;
            const isLast = i === rows.length - 1;
            const accent = actionAccent(row.action, k);
            const note = sanitizeNote(row.note, members);
            const headline = `${verb}${actor ? ` by ${actor.split(' ')[0]}` : ''}`;
            const change = row.field && (row.oldValue != null || row.newValue != null)
              ? `${FIELD_LABEL[row.field] ?? row.field}: ${resolveFieldValue(row.field, row.oldValue, members)} → ${resolveFieldValue(row.field, row.newValue, members)}`
              : null;
            return (
              <View
                key={row.id}
                style={s.row}
                accessibilityRole="text"
                accessibilityLabel={[headline, note, change, fmtWhen(row.createdAt)].filter(Boolean).join('. ')}
              >
                {/* Dot-and-rail spine. The newest row leads with the brand
                    accent so "what just happened" is the first thing the
                    eye lands on, exactly as the phone sheet does. */}
                <View style={s.spine}>
                  <View style={[s.dot, { backgroundColor: accent ?? (i === 0 ? k.primary : k.cardBorder) }]} />
                  {!isLast && <View style={[s.rail, { backgroundColor: k.cardBorder }]} />}
                </View>
                <View style={s.body}>
                  <Text style={[s.headline, { color: accent ?? k.text }]} numberOfLines={2}>{headline}</Text>
                  {!!note && (
                    <Text style={[s.detail, { color: k.textMuted }]} numberOfLines={3}>{note}</Text>
                  )}
                  {!!change && (
                    <Text style={[s.detail, { color: k.textMuted }]} numberOfLines={2}>{change}</Text>
                  )}
                  <Text style={[s.when, { color: k.textFaint }]} numberOfLines={1}>{fmtWhen(row.createdAt)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  empty: {
    fontSize: KIOSK_TYPO.body, fontWeight: '600',
    textAlign: 'center', marginTop: KIOSK_SPACE.lg,
  },
  log: { gap: KIOSK_SPACE.md },
  row: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  // Fixed-width gutter so every headline starts on the same left edge no
  // matter how tall its own row grows.
  spine: { alignItems: 'center', width: 14 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  rail: { flex: 1, width: 2, marginTop: 4, borderRadius: 1 },
  body: { flex: 1, minWidth: 0, paddingBottom: KIOSK_SPACE.xs, gap: 2 },
  headline: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  detail: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  when: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 2 },
});
