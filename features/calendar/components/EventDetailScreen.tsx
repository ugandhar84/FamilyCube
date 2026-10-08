/**
 * EventDetailScreen — feature-rich event command centre.
 *
 * All coordination actions live here — confirm/decline/reassign driver/helper,
 * RSVP, attendee acknowledge, add/edit notes, mark pickup confirmed, dismiss
 * conflicts. The Edit button is for core fields only (title, date, location).
 *
 * Top bar: ‹ Back · Edit pill · Delete pill
 * Sections: hero · info card · inline notes · who's involved (actions)
 *           · RSVP (optional events) · conflicts · activity log
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { fmtTime, fmtHumanDate, catColor } from '@/features/hub/hubUtils';
import FamilyAvatar from '@/components/FamilyAvatar';
import { fetchActivityLog, type ActivityLogRow } from '@/lib/activityLog';
import { parseDbTime } from '@/lib/dates';
import JustDescribeItEventScreen from './JustDescribeItEventScreen';
import SwipeBackWrapper from '@/components/SwipeBackWrapper';
import { CallReminderToggle } from '@/features/tasks/components/forms/CallReminderToggle';

// ── helpers ──────────────────────────────────────────────────────────────────

const CAT_EMOJI: Record<string, string> = {
  Medical: '🏥', Work: '💼', Sports: '⚽', School: '📚',
  Study: '📖', Event: '📅', Ride: '🚗', Birthday: '🎂',
};

function fmtDuration(min: number) {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

function fmtStamp(iso: string) {
  try {
    const d = parseDbTime(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

const RECUR_LABEL: Record<string, string> = {
  daily: 'Every day', weekly: 'Every week', monthly: 'Every month',
};

function toMin(hhmm?: string | null) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function helperLabelFor(cat: string) {
  if (cat === 'Medical') return 'Accompanying';
  if (cat === 'Study')   return 'Tutoring';
  if (cat === 'School' || cat === 'Sports') return 'Drop-off';
  if (cat === 'Ride')    return 'Driving';
  return 'Organising';
}

const ACTION_META: Record<string, { icon: string; dotColor: string; label: string }> = {
  created:           { icon: '✨', dotColor: '#3D7A5A', label: 'Created' },
  driver_assigned:   { icon: '🚗', dotColor: '#D97706', label: 'Driver assigned' },
  driver_reassigned: { icon: '🔀', dotColor: '#7B5EA7', label: 'Driver reassigned' },
  driver_removed:    { icon: '✕',  dotColor: '#C54A27', label: 'Driver removed' },
  reassigned:        { icon: '↔',  dotColor: '#7B5EA7', label: 'Reassigned' },
  date_changed:      { icon: '📅', dotColor: '#3D7A5A', label: 'Date changed' },
  time_changed:      { icon: '🕐', dotColor: '#3D7A5A', label: 'Time changed' },
  notes_changed:     { icon: '📝', dotColor: '#A69A8A', label: 'Notes updated' },
  status_changed:    { icon: '🔄', dotColor: '#7B5EA7', label: 'Status changed' },
  declined:          { icon: '✕',  dotColor: '#C54A27', label: 'Declined' },
  cancelled:         { icon: '✕',  dotColor: '#C54A27', label: 'Cancelled' },
  deleted:           { icon: '🗑️', dotColor: '#C54A27', label: 'Deleted' },
};
const DEFAULT_META = { icon: '·', dotColor: '#A69A8A', label: 'Updated' };

// ── sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children, color }: { children: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8,
      textTransform: 'uppercase', color: color ?? colors.textTertiary, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

function ActionRow({ label, color, onPress, busy, icon }: {
  label: string; color: string; onPress: () => void; busy?: boolean; icon?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={busy}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 10, paddingHorizontal: 16,
        borderRadius: 12, borderWidth: 1.5, borderColor: color + '50',
        backgroundColor: color + '0E' }}>
      {busy
        ? <ActivityIndicator size="small" color={color} />
        : <>
            {icon && <Text style={{ fontSize: 14 }}>{icon}</Text>}
            <Text style={{ fontSize: 13, fontWeight: '700', color }}>{label}</Text>
          </>}
    </TouchableOpacity>
  );
}

function LogRow({ entry, members, colors, isLast }: {
  entry: ActivityLogRow; members: any[]; colors: any; isLast: boolean;
}) {
  const actor = members.find(m => m.id === entry.actorId);
  const meta  = ACTION_META[entry.action] ?? DEFAULT_META;
  const stamp = entry.createdAt ? fmtStamp(entry.createdAt) : '';
  const oldMember = entry.oldValue ? members.find(m => m.id === entry.oldValue) : null;
  const newMember = entry.newValue ? members.find(m => m.id === entry.newValue) : null;
  const changeStr = oldMember && newMember
    ? `${oldMember.name.split(' ')[0]} → ${newMember.name.split(' ')[0]}`
    : entry.oldValue && entry.newValue ? `${entry.oldValue} → ${entry.newValue}` : null;

  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingBottom: isLast ? 0 : 16 }}>
      <View style={{ alignItems: 'center', width: 30 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15,
          backgroundColor: meta.dotColor + '18', borderWidth: 1, borderColor: meta.dotColor + '40',
          alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12 }}>{meta.icon}</Text>
        </View>
        {!isLast && <View style={{ width: 1, flex: 1, backgroundColor: colors.border, marginTop: 4 }} />}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{meta.label}</Text>
          {actor && <Text style={{ fontSize: 12, color: colors.textTertiary }}>by {actor.name.split(' ')[0]}</Text>}
        </View>
        {changeStr && <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{changeStr}</Text>}
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{stamp}</Text>
        {entry.note && (
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
            "{entry.note}"
          </Text>
        )}
      </View>
    </View>
  );
}

// ── inline reassign picker — expands in place under the triggering row, no sheet/overlay ──

function ReassignPicker({ ev, role, members, activeMemberId, colors, isDark, onDone, onCancel }: {
  ev: FamilyEvent; role: 'driver' | 'helper';
  members: any[]; activeMemberId: string;
  colors: any; isDark: boolean;
  onDone: () => void; onCancel: () => void;
}) {
  const { reassignEvent } = useEventStore();
  const [busy, setBusy] = useState<string | null>(null);
  // Excludes whoever currently holds THIS role — reassigning the driver to
  // the person who's already the driver (or the helper to the current
  // helper) is a no-op dressed up as an action, same gap fixed on the
  // chore-side reassign pickers (QuestDetailModal/DelegateSheet).
  const currentHolderId = role === 'driver' ? ev.driverId : ev.helperId;
  const parents = members.filter(m => m.role === 'parent' && m.id !== currentHolderId);

  async function pick(memberId: string) {
    setBusy(memberId);
    const ok = await reassignEvent(ev.id, memberId, role, activeMemberId);
    setBusy(null);
    if (ok) onDone();
    else Alert.alert('Could not reassign', 'Please try again.');
  }

  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {role === 'driver'
          ? (ev.driverId ? 'Reassign driver to' : 'Assign driver')
          : `Reassign ${helperLabelFor(ev.category ?? '').toLowerCase()} to`}
      </Text>
      {parents.map(m => (
        <TouchableOpacity key={m.id} onPress={() => pick(m.id)} disabled={!!busy}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingVertical: 10, paddingHorizontal: 14,
            backgroundColor: isDark ? colors.surface : colors.tealLight,
            borderRadius: 14 }}>
          <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={36} />
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>{m.name}</Text>
          {busy === m.id && <ActivityIndicator size="small" color={colors.teal} />}
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onCancel} style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ fontSize: 13, color: colors.textTertiary }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function EventDetailScreen({
  ev, onClose, onEdit, onDelete,
}: {
  ev: FamilyEvent;
  onClose: () => void;
  onEdit?: () => void;
  // Takes the id of the event actually being deleted — previously took no
  // argument and every caller hardcoded deletion of the event the screen
  // was FIRST opened with (ev.id / the parent's own captured detailEvent
  // id). That was wrong the instant "View →" on a linked leg switched
  // viewingEventId to a different event: Delete still removed the
  // ORIGINAL event, not the one actually on screen and named in the
  // confirm dialog — a user viewing the pick-up leg and deleting it
  // instead silently deleted the drop-off leg out from under them.
  onDelete: (id: string) => Promise<void>;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const { members, activeMemberId } = useFamilyStore();
  const allEvents  = useEventStore(s => s.events);
  const { confirmEventAssignment, declineEventAssignment, updateEvent } = useEventStore();
  // Lets "View the other leg" (a 2-leg ride's drop-off ↔ pick-up) swap the
  // whole detail view in place without the parent needing its own prop
  // plumbing — defaults to the event this screen was opened with.
  const [viewingEventId, setViewingEventId] = useState(ev.id);
  const liveEv = useEventStore(s => s.events.find(e => e.id === viewingEventId) ?? ev);
  const linkedEv = liveEv.linkedLegId ? allEvents.find(e => e.id === liveEv.linkedLegId) : undefined;

  const [deleting,     setDeleting]     = useState(false);
  const [log,          setLog]          = useState<ActivityLogRow[]>([]);
  const [reassignRole, setReassignRole] = useState<'driver' | 'helper' | null>(null);
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);

  // Inline decline compose
  const [decliningRole,  setDecliningRole]  = useState<'driver' | 'helper' | null>(null);
  const [declineReason,  setDeclineReason]  = useState('');

  // Inline notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText,    setNotesText]    = useState(liveEv.notes ?? '');
  const [notesBusy,    setNotesBusy]    = useState(false);

  // Inline call reminder toggle — local state mirrors liveEv so the Switch
  // responds instantly; writes straight through to updateEvent on change,
  // no separate "save" step (same as the acknowledge/RSVP actions above).
  const [alertCall, setAlertCall] = useState(liveEv.alertCall ?? false);
  const [alertCallLeadMinutes, setAlertCallLeadMinutes] = useState(liveEv.alertCallLeadMinutes ?? 10);
  useEffect(() => {
    setAlertCall(liveEv.alertCall ?? false);
    setAlertCallLeadMinutes(liveEv.alertCallLeadMinutes ?? 10);
  }, [liveEv.alertCall, liveEv.alertCallLeadMinutes]);

  const refreshLog = () => fetchActivityLog('event', ev.id, 20).then(setLog);
  useEffect(() => { refreshLog(); }, [ev.id, liveEv.helperStatus, liveEv.driverStatus]);

  const cat      = liveEv.category ?? 'Event';
  const accent   = catColor(cat);
  const emoji    = CAT_EMOJI[cat] ?? '📅';
  const duration = (liveEv as any).durationMinutes as number | undefined;
  const recur    = (liveEv as any).recurrence as string | undefined;
  const isPast   = new Date(`${liveEv.date}T23:59:00`) < new Date();
  const isToday  = liveEv.date === new Date().toISOString().slice(0, 10);
  const isNowOrPast = isPast || (isToday && liveEv.time
    ? toMin(liveEv.time)! <= new Date().getHours() * 60 + new Date().getMinutes()
    : false);

  const allAssignees = liveEv.memberIds?.length
    ? members.filter(m => liveEv.memberIds!.includes(m.id))
    : liveEv.memberId ? members.filter(m => m.id === liveEv.memberId) : [];

  const helperMember = liveEv.helperId ? members.find(m => m.id === liveEv.helperId) : null;
  const driverMember = liveEv.driverId ? members.find(m => m.id === liveEv.driverId) : null;
  const helperStatus = liveEv.helperStatus;
  const driverStatus = liveEv.driverStatus;

  // A ride whose driver declined/was removed must not silently read as "Scheduled".
  const needsDriver = !driverMember && !liveEv.driverName && (
    !!liveEv.rideRequired || cat === 'Ride' || log.some(r => r.action.startsWith('driver_'))
  );
  const amIParent = members.find(m => m.id === activeMemberId)?.role === 'parent';

  const amIHelper = liveEv.helperId === activeMemberId;
  const amIDriver = liveEv.driverId === activeMemberId;

  // Acknowledgement
  const myAck = liveEv.acknowledgedBy?.includes(activeMemberId ?? '') ?? false;
  const amIAttendee = allAssignees.some(m => m.id === activeMemberId);

  // Pickup confirmation
  const canConfirmPickup = isNowOrPast && (amIDriver || amIHelper) && !liveEv.pickupConfirmedAt;

  // RSVP
  const isRsvpEvent  = liveEv.isOptionalRsvp;
  const myRsvp       = activeMemberId ? (liveEv.rsvps?.[activeMemberId] ?? null) : null;
  const rsvpCounts   = liveEv.rsvps
    ? Object.values(liveEv.rsvps).reduce((acc, v) => { acc[v] = (acc[v] ?? 0) + 1; return acc; }, {} as Record<string, number>)
    : {};

  const statusInfo = isPast
    ? { label: 'Past', color: colors.textTertiary }
    : needsDriver
      ? { label: 'Needs a driver', color: colors.amber }
    : helperStatus === 'rejected' || driverStatus === 'rejected'
      ? { label: 'Assignment declined', color: colors.danger }
      : helperStatus === 'pending' || driverStatus === 'pending'
        ? { label: 'Needs confirmation', color: colors.amber }
        : { label: 'Scheduled', color: colors.teal };

  let timeStr = liveEv.time ? fmtTime(liveEv.time) : '';
  if (liveEv.time && duration) {
    const [h, m] = liveEv.time.split(':').map(Number);
    const endMin = h * 60 + m + duration;
    const endH   = Math.floor(endMin / 60) % 24;
    const endM   = endMin % 60;
    timeStr += ` → ${fmtTime(`${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`)}`;
  }

  // Conflicts
  const involvedIds = [
    ...allAssignees.map(m => m.id),
    ...(liveEv.helperId ? [liveEv.helperId] : []),
    ...(liveEv.driverId ? [liveEv.driverId] : []),
  ];
  const evStart = toMin(liveEv.time);
  const evEnd   = evStart != null ? evStart + (duration ?? 60) : null;
  const conflicts = liveEv.conflictAcknowledged ? [] : allEvents.filter(other => {
    if (other.id === liveEv.id || other.date !== liveEv.date) return false;
    const oStart = toMin(other.time);
    const oDur   = (other as any).durationMinutes ?? 60;
    const oEnd   = oStart != null ? oStart + oDur : null;
    if (evStart == null || oStart == null || evEnd == null || oEnd == null) return false;
    if (oStart >= evEnd || evStart >= oEnd) return false;
    const oIds = [
      ...(other.memberIds ?? (other.memberId ? [other.memberId] : [])),
      ...(other.helperId ? [other.helperId] : []),
      ...((other as any).driverId ? [(other as any).driverId] : []),
    ];
    return involvedIds.some(id => oIds.includes(id));
  });

  // ── actions ───────────────────────────────────────────────────────────────

  async function doConfirm(role: 'driver' | 'helper') {
    setActionBusy(`confirm-${role}`);
    await confirmEventAssignment(liveEv.id, activeMemberId!, role);
    setActionBusy(null);
    refreshLog();
  }

  async function sendDecline(role: 'driver' | 'helper') {
    setActionBusy(`decline-${role}`);
    await declineEventAssignment(liveEv.id, activeMemberId ?? '', role, declineReason.trim() || undefined);
    setActionBusy(null);
    setDecliningRole(null);
    setDeclineReason('');
    refreshLog();
  }

  async function doAcknowledge() {
    if (!activeMemberId) return;
    setActionBusy('ack');
    const current = liveEv.acknowledgedBy ?? [];
    await updateEvent(liveEv.id, { acknowledgedBy: [...current, activeMemberId] });
    setActionBusy(null);
  }

  async function doRsvp(r: 'going' | 'not_going' | 'maybe') {
    if (!activeMemberId) return;
    setActionBusy(`rsvp-${r}`);
    const current = liveEv.rsvps ?? {};
    await updateEvent(liveEv.id, { rsvps: { ...current, [activeMemberId]: r } });
    setActionBusy(null);
  }

  async function doConfirmPickup() {
    setActionBusy('pickup');
    await updateEvent(liveEv.id, {
      pickupConfirmedAt: new Date().toISOString(),
      pickupConfirmedBy: activeMemberId ?? undefined,
    });
    setActionBusy(null);
  }

  async function doSaveNotes() {
    setNotesBusy(true);
    await updateEvent(liveEv.id, { notes: notesText.trim() || undefined });
    setNotesBusy(false);
    setEditingNotes(false);
    refreshLog();
  }

  async function doDismissConflict() {
    await updateEvent(liveEv.id, { conflictAcknowledged: true });
  }

  function handleAlertCallChange(v: boolean | ((prev: boolean) => boolean)) {
    const next = typeof v === 'function' ? v(alertCall) : v;
    setAlertCall(next);
    updateEvent(liveEv.id, { alertCall: next });
  }
  function handleLeadMinutesChange(v: number) {
    setAlertCallLeadMinutes(v);
    updateEvent(liveEv.id, { alertCallLeadMinutes: v });
  }

  function confirmDelete() {
    Alert.alert('Delete event', `Delete "${liveEv.title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeleting(true); await onDelete(liveEv.id);
      }},
    ]);
  }

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';

  if (editing) {
    return (
      <JustDescribeItEventScreen
        visible
        editEvent={liveEv}
        activeMemberId={activeMemberId ?? undefined}
        onClose={() => { setEditing(false); refreshLog(); }}
      />
    );
  }

  // ── participant row ───────────────────────────────────────────────────────

  // Plain render function, not a component — a nested component remounts every render and drops TextInput focus.
  function renderParticipant({ member, sublabel, status, role, isMe, isLast }: {
    member: any; sublabel: string; status?: string;
    role?: 'driver' | 'helper'; isMe?: boolean; isLast: boolean;
  }) {
    const isKid     = member.role === 'kid';
    const roleColor = isKid ? colors.kid : colors.parent;
    const isMePending    = isMe && status === 'pending';
    const isMeConfirmed  = isMe && status === 'confirmed';
    const isMeRejected   = isMe && status === 'rejected';
    const showDeclineBox = decliningRole === role && isMe;
    // A confirmed assignment can still fall through later — plans change — so
    // "Can't do it" stays available after confirming, not just while pending.
    // None of that applies once the event itself is past — confirming or
    // declining something already over is meaningless.
    const showButtons    = (isMePending || isMeConfirmed || isMeRejected) && role && !showDeclineBox && !isPast;
    const amIParent      = members.find(m => m.id === activeMemberId)?.role === 'parent';

    const statusBadge =
      status === 'pending'   ? { label: 'Awaiting',  color: colors.amber } :
      status === 'rejected'  ? { label: 'Declined',  color: colors.danger } :
      status === 'confirmed' ? { label: 'Confirmed', color: colors.teal } :
      null;

    return (
      <View style={{ paddingHorizontal: 16, paddingVertical: 13,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(44,39,34,0.07)' }}>

        {/* Avatar row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <FamilyAvatar name={member.name} emoji={member.emoji} avatarUrl={member.avatarUrl} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
              {member.name}{isMe ? '  (you)' : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: roleColor + '20' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: roleColor }}>
                  {isKid ? 'Kid' : 'Parent'}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.textTertiary }}>{sublabel}</Text>
              {statusBadge && (
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: statusBadge.color + '18' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: statusBadge.color }}>{statusBadge.label}</Text>
                </View>
              )}
            </View>
          </View>
          {/* Reassign — shown to any parent (any status, including already-confirmed), OR to anyone when the role was declined. Not for a past event. */}
          {role && (status === 'rejected' || (!isMe && amIParent)) && !showDeclineBox && !isPast && (
            <TouchableOpacity onPress={() => setReassignRole(role)}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
                borderWidth: 1.5, borderColor: status === 'rejected' ? colors.amber + '80' : colors.border,
                backgroundColor: status === 'rejected' ? colors.amberLight : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: status === 'rejected' ? colors.amber : colors.textSecondary }}>
                {status === 'rejected' ? '↔ Reassign' : 'Reassign'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Confirm / "Can't do it" buttons */}
        {showButtons && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginLeft: 52 }}>
            {isMePending && (
              <TouchableOpacity onPress={() => doConfirm(role!)} disabled={!!actionBusy}
                style={{ flex: 1, height: 38, borderRadius: 12, backgroundColor: colors.teal,
                  alignItems: 'center', justifyContent: 'center' }}>
                {actionBusy === `confirm-${role}`
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>✓  Confirm</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { setDecliningRole(role!); setDeclineReason(''); }}
              disabled={!!actionBusy}
              style={{ flex: 1, height: 38, borderRadius: 12,
                borderWidth: 1.5, borderColor: colors.danger + '60', backgroundColor: colors.danger + '0E',
                alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>
                ✕  Can't make it
              </Text>
            </TouchableOpacity>
            {(isMeRejected || (isMeConfirmed && amIParent)) && (
              <TouchableOpacity onPress={() => setReassignRole(role!)}
                style={{ flex: 1, height: 38, borderRadius: 12,
                  backgroundColor: isDark ? colors.surface : colors.amberLight,
                  alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.amber }}>↔  Reassign</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Inline decline reason box */}
        {showDeclineBox && (
          <View style={{ marginTop: 10, marginLeft: 52, gap: 8 }}>
            <TextInput
              value={declineReason}
              onChangeText={setDeclineReason}
              placeholder="Reason — let the family know (optional)"
              placeholderTextColor={colors.textTertiary}
              multiline
              autoFocus
              style={{ backgroundColor: isDark ? colors.surface : colors.background,
                borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                paddingHorizontal: 12, paddingVertical: 10,
                fontSize: 14, color: colors.textPrimary, minHeight: 72, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => { setDecliningRole(null); setDeclineReason(''); }}
                style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                  alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => sendDecline(role!)} disabled={!!actionBusy}
                style={{ flex: 2, height: 38, borderRadius: 10, backgroundColor: colors.danger,
                  alignItems: 'center', justifyContent: 'center' }}>
                {actionBusy === `decline-${role}`
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Send decline</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Inline reassign picker — expands in place, no bottom sheet */}
        {reassignRole === role && role && (
          <ReassignPicker
            ev={liveEv} role={role} members={members}
            activeMemberId={activeMemberId ?? ''}
            colors={colors} isDark={isDark}
            onDone={() => { setReassignRole(null); refreshLog(); }}
            onCancel={() => setReassignRole(null)}
          />
        )}
      </View>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <SwipeBackWrapper onDismiss={onClose}>
    <View style={{ flex: 1, backgroundColor: canvas }}>

        {/* ── Top bar ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 10, gap: 8 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.teal }}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {/* A past event is read-only — editing/action-center controls on
              something already over invite stale-state confusion (e.g.
              "confirming" a drive that already happened). Delete stays
              available since removing a stale past entry is still a
              legitimate cleanup action. */}
          {!isPast && (
            <TouchableOpacity onPress={() => setEditing(true)}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={confirmDelete} disabled={deleting}
            style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
              borderWidth: 1.5, borderColor: colors.danger + '50', backgroundColor: colors.danger + '0E' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>
              {deleting ? '…' : 'Delete'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* ── Hero ── */}
          <View style={{ paddingHorizontal: 20, paddingTop: 8, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start',
              justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <Text style={{ flex: 1, fontSize: 28, fontWeight: '800', letterSpacing: -0.5,
                color: colors.textPrimary, lineHeight: 34 }}>
                {liveEv.title}
              </Text>
              <View style={{ marginTop: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                backgroundColor: statusInfo.color + '18', borderWidth: 1.5, borderColor: statusInfo.color + '50' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: statusInfo.color }}>
                  {statusInfo.label}
                </Text>
              </View>
            </View>

            {/* Sync badge */}
            {liveEv.lastExternalSyncProvider && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                  🔗 Synced from {liveEv.lastExternalSyncProvider}
                  {liveEv.lastExternalSyncAccount ? ` · ${liveEv.lastExternalSyncAccount}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* ── Info card ── */}
          <View style={{ marginHorizontal: 20, marginBottom: 20,
            backgroundColor: isDark ? colors.surface : accent + '12',
            borderRadius: 16, padding: 16, gap: 12 }}>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Text style={{ fontSize: 18, marginTop: 1 }}>{emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
                  textTransform: 'uppercase', color: colors.textTertiary }}>
                  {timeStr ? 'Date & Time' : 'Date'}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
                  {fmtHumanDate(liveEv.date)}{timeStr ? `  ·  ${timeStr}` : ''}
                </Text>
                {duration ? <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>{fmtDuration(duration)}</Text> : null}
              </View>
            </View>

            {liveEv.location ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Text style={{ fontSize: 18, marginTop: 1 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
                    textTransform: 'uppercase', color: colors.textTertiary }}>Location</Text>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>{liveEv.location}</Text>
                </View>
              </View>
            ) : (cat === 'Ride' || cat === 'Sports' || cat === 'School' || cat === 'Medical' || liveEv.rideRequired) && !liveEv.pickupLocation && !liveEv.dropLocation && (
              // Previously silently omitted this whole row when no address
              // was set — looked identical to "this event simply has no
              // location," indistinguishable from a bug. For a category
              // where an address is actually relevant, show an explicit
              // empty state with a direct way to add one instead.
              <TouchableOpacity onPress={() => setEditing(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 18, opacity: 0.4 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
                    textTransform: 'uppercase', color: colors.textTertiary }}>Location</Text>
                  <Text style={{ fontSize: 14, color: colors.textTertiary, fontStyle: 'italic' }}>No address added</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: accent }}>+ Add</Text>
              </TouchableOpacity>
            )}

            {/* Ride legs */}
            {(liveEv.pickupLocation || liveEv.dropLocation) && (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {liveEv.pickupLocation && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
                      textTransform: 'uppercase', color: colors.textTertiary }}>Pick up</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{liveEv.pickupLocation}</Text>
                  </View>
                )}
                {liveEv.dropLocation && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
                      textTransform: 'uppercase', color: colors.textTertiary }}>Drop off</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{liveEv.dropLocation}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Linked leg — a ride created with both Drop-off and Pick-up
                toggled on forks into 2 separate events; previously there was
                no way to tell from either one's own detail page that the
                other leg even existed. */}
            {linkedEv && (
              <TouchableOpacity onPress={() => setViewingEventId(linkedEv.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: isDark ? colors.card : '#fff',
                  borderRadius: 12, padding: 12, borderWidth: 1, borderColor: accent + '30' }}>
                <Text style={{ fontSize: 16 }}>🔁</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
                    textTransform: 'uppercase', color: colors.textTertiary }}>Linked leg</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                    {linkedEv.title}{linkedEv.time ? `  ·  ${fmtTime(linkedEv.time)}` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: accent, fontWeight: '600' }}>View →</Text>
              </TouchableOpacity>
            )}

            {/* Category + recurrence chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: accent + '22' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: accent }}>{cat}</Text>
              </View>
              {recur && RECUR_LABEL[recur] && (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.pink + '18' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.pink }}>🔄 {RECUR_LABEL[recur]}</Text>
                </View>
              )}
              {liveEv.pickupConfirmedAt && (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.teal + '18' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>✓ Pickup confirmed</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Notes — inline edit ── */}
          <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <SectionLabel>Notes</SectionLabel>
              <View style={{ flex: 1 }} />
              {!editingNotes && !isPast && (
                <TouchableOpacity onPress={() => { setNotesText(liveEv.notes ?? ''); setEditingNotes(true); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>
                    {liveEv.notes ? 'Edit' : '+ Add note'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {editingNotes ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={notesText}
                  onChangeText={setNotesText}
                  placeholder="Add a note for the family…"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  autoFocus
                  style={{ backgroundColor: isDark ? colors.surface : colors.background,
                    borderRadius: 12, borderWidth: 1, borderColor: colors.teal + '60',
                    paddingHorizontal: 14, paddingVertical: 12,
                    fontSize: 15, color: colors.textPrimary, minHeight: 80, textAlignVertical: 'top' }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => setEditingNotes(false)}
                    style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                      alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={doSaveNotes} disabled={notesBusy}
                    style={{ flex: 2, height: 40, borderRadius: 10, backgroundColor: colors.teal,
                      alignItems: 'center', justifyContent: 'center' }}>
                    {notesBusy
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Save note</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : liveEv.notes ? (
              <View style={{ backgroundColor: isDark ? colors.surface : colors.amberLight,
                borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 15, color: colors.textPrimary, lineHeight: 22 }}>{liveEv.notes}</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 14, color: colors.textTertiary, fontStyle: 'italic' }}>No notes yet.</Text>
            )}
          </View>

          {/* ── Call reminder — ringing (CallKit-style) alert before the
              event, distinct from an ordinary push notification. Previously
              only settable from the Edit form; now toggleable right here.
              A reminder for a past event is meaningless — reads-only there. ── */}
          {!isPast && (
            <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
              <SectionLabel>Reminder</SectionLabel>
              <View style={{ backgroundColor: isDark ? colors.surface : colors.card,
                borderRadius: 14, padding: 14,
                borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(44,39,34,0.08)' }}>
                <CallReminderToggle
                  alertCall={alertCall} setAlertCall={handleAlertCallChange as any}
                  alertCallLeadMinutes={alertCallLeadMinutes} setAlertCallLeadMinutes={handleLeadMinutesChange}
                  accentColor={accent} colors={colors} isDark={isDark}
                  variant="icon"
                />
              </View>
            </View>
          )}

          {/* ── Quick actions — pickup confirm, acknowledge. Pickup confirm
              deliberately stays available even when past (confirming a
              pickup happened IS a post-event action by design — see
              canConfirmPickup's own isNowOrPast gate) — only "mark as seen"
              is gated here, since acknowledging you know about something
              already over doesn't mean anything. ── */}
          {(canConfirmPickup || (amIAttendee && !myAck && !isPast)) && (
            <View style={{ marginHorizontal: 20, marginBottom: 20, gap: 10 }}>
              <SectionLabel>Your actions</SectionLabel>
              {canConfirmPickup && (
                <ActionRow icon="🚗" label="Confirm pickup happened" color={colors.teal}
                  busy={actionBusy === 'pickup'} onPress={doConfirmPickup} />
              )}
              {amIAttendee && !myAck && !isPast && (
                <ActionRow icon="👀" label="Mark as seen — I know about this" color={colors.parent}
                  busy={actionBusy === 'ack'} onPress={doAcknowledge} />
              )}
            </View>
          )}

          {/* ── RSVP — no point RSVPing to something already over ── */}
          {isRsvpEvent && !isPast && (
            <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
              <SectionLabel>RSVP</SectionLabel>
              {Object.keys(rsvpCounts).length > 0 && (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  {rsvpCounts.going    > 0 && <Text style={{ fontSize: 13, color: colors.teal,    fontWeight: '600' }}>✓ Going {rsvpCounts.going}</Text>}
                  {rsvpCounts.maybe    > 0 && <Text style={{ fontSize: 13, color: colors.amber,   fontWeight: '600' }}>? Maybe {rsvpCounts.maybe}</Text>}
                  {rsvpCounts.not_going > 0 && <Text style={{ fontSize: 13, color: colors.danger, fontWeight: '600' }}>✕ Can't {rsvpCounts.not_going}</Text>}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['going', 'maybe', 'not_going'] as const).map(r => {
                  const selected = myRsvp === r;
                  const label = r === 'going' ? '✓ Going' : r === 'maybe' ? '? Maybe' : '✕ Can\'t';
                  const color = r === 'going' ? colors.teal : r === 'maybe' ? colors.amber : colors.danger;
                  return (
                    <TouchableOpacity key={r} onPress={() => doRsvp(r)} disabled={!!actionBusy}
                      style={{ flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: selected ? color : color + '12',
                        borderWidth: 1.5, borderColor: selected ? color : color + '40' }}>
                      {actionBusy === `rsvp-${r}`
                        ? <ActivityIndicator size="small" color={color} />
                        : <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500',
                            color: selected ? '#fff' : color }}>{label}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Who's involved ── */}
          {(allAssignees.length > 0 || helperMember || driverMember || needsDriver) && (
            <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
              <SectionLabel>Who's involved</SectionLabel>
              <View style={{ backgroundColor: isDark ? colors.card : colors.surface, borderRadius: 16, overflow: 'hidden' }}>
                {allAssignees.map((m, i) => (
                  <View key={m.id}>
                    {renderParticipant({ member: m, sublabel: 'Attending',
                      isMe: m.id === activeMemberId,
                      isLast: i === allAssignees.length - 1 && !helperMember && !driverMember })}
                  </View>
                ))}
                {helperMember && renderParticipant({ member: helperMember, sublabel: helperLabelFor(cat),
                  status: helperStatus, role: 'helper', isMe: amIHelper, isLast: !driverMember })}
                {driverMember && renderParticipant({ member: driverMember, sublabel: 'Driving',
                  status: driverStatus, role: 'driver', isMe: amIDriver, isLast: true })}
                {needsDriver && (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 13,
                    borderTopWidth: allAssignees.length > 0 || helperMember ? 1 : 0,
                    borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(44,39,34,0.07)',
                    backgroundColor: colors.amberLight }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed',
                        borderColor: colors.amber, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 18 }}>🚗</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>No driver yet</Text>
                        <Text style={{ fontSize: 12, color: colors.amber, marginTop: 2, fontWeight: '600' }}>
                          Someone needs to take this ride
                        </Text>
                      </View>
                      {amIParent && reassignRole !== 'driver' && !isPast && (
                        <TouchableOpacity onPress={() => setReassignRole('driver')}
                          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.amber }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Assign driver</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {reassignRole === 'driver' && (
                      <ReassignPicker
                        ev={liveEv} role="driver" members={members}
                        activeMemberId={activeMemberId ?? ''}
                        colors={colors} isDark={isDark}
                        onDone={() => { setReassignRole(null); refreshLog(); }}
                        onCancel={() => setReassignRole(null)}
                      />
                    )}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ── Conflicts ── */}
          {conflicts.length > 0 && (
            <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <SectionLabel color={colors.danger}>⚠ Schedule conflicts</SectionLabel>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={doDismissConflict} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textTertiary }}>Not a conflict</Text>
                </TouchableOpacity>
              </View>
              <View style={{ backgroundColor: isDark ? colors.card : colors.danger + '08',
                borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.danger + '25' }}>
                {conflicts.map((other, i) => {
                  const sharedNames = [
                    ...(other.memberIds ?? (other.memberId ? [other.memberId] : [])),
                    ...(other.helperId ? [other.helperId] : []),
                    ...((other as any).driverId ? [(other as any).driverId] : []),
                  ]
                    .filter(id => involvedIds.includes(id))
                    .map(id => members.find(m => m.id === id)?.name.split(' ')[0])
                    .filter(Boolean).join(', ');
                  return (
                    <View key={other.id} style={{ paddingHorizontal: 16, paddingVertical: 13,
                      borderBottomWidth: i < conflicts.length - 1 ? 1 : 0,
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(44,39,34,0.07)' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{other.title}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3 }}>
                        {other.time ? `${fmtTime(other.time)}  ·  ` : ''}{fmtHumanDate(other.date)}
                      </Text>
                      {sharedNames ? (
                        <Text style={{ fontSize: 12, color: colors.danger, marginTop: 3, fontWeight: '600' }}>
                          Shared: {sharedNames}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Activity log ── */}
          <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
            <SectionLabel>Activity & history</SectionLabel>
            {log.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.textTertiary, fontStyle: 'italic' }}>No history yet.</Text>
            ) : (
              log.map((entry, i) => (
                <LogRow key={`${entry.createdAt}-${i}`}
                  entry={entry} members={members} colors={colors}
                  isLast={i === log.length - 1} />
              ))
            )}
          </View>

        </ScrollView>

    </View>
    </SwipeBackWrapper>
  );
}
