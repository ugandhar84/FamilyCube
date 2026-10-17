/**
 * KioskEventDetailSheet — kiosk-native port of the phone's own
 * EventDetailSheet (features/hub/hubComponents.tsx:841-1576, read in full
 * before writing this — that file's own DriverChipRow, lines 685-837, is
 * ported here too since it's a private, unexported component on the phone
 * and can't be imported directly).
 *
 * Live-reported gap (Schedule-tab audit): a plain tap on any kiosk event
 * card opened KioskEventEditor directly — the FULL edit form — with no
 * lighter-weight detail/action layer in between, unlike every real mobile
 * calendar view, which opens THIS sheet on tap and reserves the edit form
 * for a separate, deliberate "Edit full details" pencil (or a long-press).
 * That inversion meant every action this sheet exists for — Confirm, Can't
 * Make It, Remind, Take Over/Swap, Override, Acknowledge, RSVP — had no
 * home anywhere on kiosk: KioskEventEditor's own read-only/restricted
 * branches show plain fields with zero actions, since editing was never
 * this file's job on the phone either.
 *
 * Real store actions used, all already proven wired elsewhere in kiosk
 * (KioskOverviewTab.tsx's Pickup radar widget): confirmEventAssignment,
 * declineEventAssignment, reassignEvent, remindEventAssignee. Every write
 * goes through these exact functions, never a hand-rolled patch — matching
 * the phone's own comments at each corresponding site, which call out that
 * a hand-rolled duplicate of this same logic was the actual root cause of
 * a real past bug (drift between HelperEventCard/RideRequiredEventCard/
 * EventDetailSheet each doing their own slightly-different reassign).
 *
 * Deliberately NOT ported: Record Visit (Medical, AI transcription +
 * Vault-encrypted storage — a real, separate, much larger feature
 * depending on audio recording infra this pass doesn't touch) and the
 * "Synced from" provider badge (a lower-priority display-only nicety,
 * left for a later pass; kiosk's own card already shows a sync badge
 * elsewhere per KioskScheduleTab.tsx's showSync logic).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { Bell, Repeat, User, Users, ChevronDown, MapPin, Calendar as CalendarIcon, Pencil, Trash2 } from 'lucide-react-native';
import { useEventStore, eventAssignee, type FamilyEvent } from '@/store/eventStore';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import { deriveEventActions, eventAssigneeRole } from '@/features/tasks/lib/deriveCardActions';
import { hoursUntilEvent, isWorkEvent } from '@/features/hub/hubUtils';
import { notifyTakeover } from '@/features/hub/hubComponents';
import { LocationLink } from '@/features/calendar/components/EventCard';
import { showToast } from '@/components/AppToast';
import { fmtTime, parseDbTime, localDateStr } from '@/lib/dates';
import { fmtHumanDate } from '@/features/hub/hubUtils';
import { fetchActivityLog, type ActivityLogRow } from '@/lib/activityLog';
import { useTheme } from '@/lib/ThemeContext';
import { CallReminderToggle } from '@/features/tasks/components/forms/CallReminderToggle';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useKioskColors, kioskPastels, type KioskColors } from '../kioskPalette';
import { Eyebrow } from './KioskHomeParts';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer } from './KioskFormDrawer';

/** Category → one of the four mobile pastels (index into kioskPastels). */
const CAT_TONE: Record<string, number> = { Medical: 0, Birthday: 0, Sports: 1, Event: 1, School: 2, Ride: 2, Work: 3, Study: 3 };
const CAT_EMOJI: Record<string, string> = {
  Medical: '🏥', Work: '💼', Sports: '⚽', School: '📚', Study: '📖', Event: '📅', Ride: '🚗', Birthday: '🎂',
};
const RECUR_LABEL: Record<string, string> = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
const LOG_META: Record<string, { icon: string; label: string }> = {
  created: { icon: '✨', label: 'Created' }, driver_assigned: { icon: '🚗', label: 'Driver assigned' },
  driver_reassigned: { icon: '🔀', label: 'Driver reassigned' }, driver_removed: { icon: '✕', label: 'Driver removed' },
  reassigned: { icon: '↔', label: 'Reassigned' }, date_changed: { icon: '📅', label: 'Date changed' },
  time_changed: { icon: '🕐', label: 'Time changed' }, confirmed: { icon: '✅', label: 'Confirmed' },
  declined: { icon: '❌', label: 'Declined' }, notes_changed: { icon: '📝', label: 'Notes updated' },
};
const minOf = (t?: string | null) => { const m = t ? /^(\d{1,2}):(\d{2})/.exec(t) : null; return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const stamp = (iso?: string | null) => {
  if (!iso) return '';
  const d = parseDbTime(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function KioskEventDetailSheet({ event, active, members, onClose, onEditFull }: {
  event: FamilyEvent | null;
  active: FamilyMember;
  members: FamilyMember[];
  onClose: () => void;
  /** Opens the full KioskEventEditor drawer (parent "Edit" pencil). */
  onEditFull: () => void;
}) {
  const { k } = useKioskColors();
  const { colors, isDark } = useTheme();
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelledSelfName, setCancelledSelfName] = useState<string | undefined>(undefined);
  const [viewId, setViewId] = useState<string | null>(null); // "View other leg"
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [log, setLog] = useState<ActivityLogRow[]>([]);
  const [alertCall, setAlertCall] = useState(false);
  const [leadMin, setLeadMin] = useState(10);
  // Every hook runs unconditionally above the `!event` return (rules of hooks).
  const updateEvent = useEventStore(s => s.updateEvent);
  const stored = useEventStore(s => s.events);
  const ranged = useEventStore(s => s.rangeEvents);
  const targetId = viewId ?? event?.id ?? null;
  const liveEv: FamilyEvent | null = targetId
    ? (stored.find(e => e.id === targetId) ?? ranged.find(e => e.id === targetId) ?? (event && event.id === targetId ? event : null))
    : null;

  useEffect(() => { setViewId(null); setEditingNotes(false); setChangeOpen(false); setCancelledSelfName(undefined); }, [event?.id]);
  useEffect(() => {
    if (!liveEv) return;
    setAlertCall(liveEv.alertCall ?? false);
    setLeadMin(liveEv.alertCallLeadMinutes ?? 10);
  }, [liveEv?.id, liveEv?.alertCall, liveEv?.alertCallLeadMinutes]);
  const refreshLog = () => { if (liveEv) fetchActivityLog('event', liveEv.id, 20).then(setLog).catch(() => {}); };
  useEffect(() => { refreshLog(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [liveEv?.id, liveEv?.helperStatus, liveEv?.driverStatus]);

  const conflicts = useMemo(() => {
    if (!liveEv || liveEv.conflictAcknowledged) return [] as FamilyEvent[];
    const dur = (liveEv as any).durationMinutes ?? 60;
    const st = minOf(liveEv.time);
    if (st == null) return [];
    const en = st + dur;
    const idsOf = (e: FamilyEvent) => [
      ...(e.memberIds ?? (e.memberId ? [e.memberId] : [])),
      ...(e.helperId ? [e.helperId] : []), ...((e as any).driverId ? [(e as any).driverId] : []),
    ];
    const mine = idsOf(liveEv);
    const seen = new Set<string>();
    return [...stored, ...ranged].filter(o => {
      if (seen.has(o.id)) return false; seen.add(o.id);
      if (o.id === liveEv.id || o.date !== liveEv.date) return false;
      const os = minOf(o.time); if (os == null) return false;
      const oe = os + ((o as any).durationMinutes ?? 60);
      if (os >= en || st >= oe) return false;
      return idsOf(o).some(id => mine.includes(id));
    });
  }, [liveEv, stored, ranged]);

  if (!event || !liveEv) return null;
  const ev = liveEv;
  const linked = ev.linkedLegId ? [...stored, ...ranged].find(e => e.id === ev.linkedLegId) : undefined;
  const cat = ev.category ?? 'Event';
  const pastels = kioskPastels(k);
  const tone = pastels[CAT_TONE[cat] ?? 1];
  const hours = hoursUntilEvent(ev.date, ev.time);
  const isPast = hours < 0;
  const isViewerParent = active.role === 'parent';
  const duration = (ev as any).durationMinutes as number | undefined;
  const recur = (ev as any).recurrence as string | undefined;

  const allAssignees = ev.memberIds?.length
    ? members.filter(m => ev.memberIds!.includes(m.id))
    : ev.memberId ? members.filter(m => m.id === ev.memberId) : [];
  const forLabel =
    cat === 'Medical' ? 'Patient' : cat === 'Sports' ? 'Athlete' : cat === 'Study' ? 'Student' :
    cat === 'School' ? 'Student' : cat === 'Ride' ? 'Attending' : cat === 'Work' ? 'Attending' : 'Attending';
  const helperLabel =
    cat === 'Medical' ? 'Accompanied by' : cat === 'Study' ? 'Tutored by' : cat === 'School' ? 'Dropped off by' :
    cat === 'Sports' ? 'Dropped off by' : cat === 'Ride' ? 'Driven by' : 'Organised by';
  const helperQuestion =
    cat === 'Medical' ? "Who's accompanying?" : cat === 'Study' ? "Who's tutoring?" : cat === 'School' ? "Who's dropping off?" :
    cat === 'Sports' ? "Who's dropping off?" : cat === 'Ride' ? "Who's driving?" : "Who's organising?";

  const {
    assignee, assigneeRole, isSelfAssigned,
    showRemind, showReassign, showAssignToMe, showOverride, showCantMakeIt, showConfirm,
  } = deriveEventActions(ev, { id: active.id, name: active.name, role: active.role, hasCar: active.hasCar }, { isPast });

  const helperMember = assignee.id ? members.find(m => m.id === assignee.id) : members.find(m => m.name === assignee.name);
  const isRejected = assignee.status === 'rejected';
  const isPending = assignee.status === 'pending';
  const showAlarm = isRejected && isViewerParent;
  const hadPriorHelper = !!assignee.name;
  const needsDriver = !assignee.name && (!!ev.rideRequired || cat === 'Ride' || log.some(r => String(r.action).startsWith('driver_')));

  const status = isPast ? { label: 'Past', fg: k.textMuted, bg: k.well }
    : needsDriver ? { label: 'Needs a driver', fg: k.gold, bg: k.pastelAmberCard }
    : isRejected ? { label: 'Assignment declined', fg: k.danger, bg: k.pastelPrimaryCard }
    : isPending ? { label: 'Needs confirmation', fg: k.gold, bg: k.pastelAmberCard }
    : { label: 'Scheduled', fg: k.sage, bg: k.pastelSageCard };

  let timeStr = ev.time ? fmtTime(ev.time) : 'All day';
  if (ev.time && duration) { const st = minOf(ev.time)!; timeStr += ` → ${fmtTime(hhmm(st + duration))}`; }
  else if (ev.time && ev.endTime) timeStr += ` → ${fmtTime(ev.endTime)}`;

  const myAck = ev.acknowledgedBy?.includes(active.id) ?? false;
  const amAttendee = allAssignees.some(m => m.id === active.id);
  const amDriverOrHelper = ev.driverId === active.id || ev.helperId === active.id;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isNowOrPast = isPast || (ev.date === localDateStr() && ev.time ? (minOf(ev.time) ?? 0) <= nowMin : false);
  const canConfirmPickup = isNowOrPast && amDriverOrHelper && !ev.pickupConfirmedAt;
  const rsvps = ev.rsvps ?? {};
  const rsvpCounts = Object.values(rsvps).reduce((acc: Record<string, number>, v) => { acc[v] = (acc[v] ?? 0) + 1; return acc; }, {});

  const setAlert = (v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(alertCall) : v;
    setAlertCall(next);
    if (ev.seriesId) useEventStore.getState().updateEventScoped(ev.id, { alertCall: next }, 'following');
    else updateEvent(ev.id, { alertCall: next });
  };
  const setLead = (v: number) => {
    setLeadMin(v);
    if (ev.seriesId) useEventStore.getState().updateEventScoped(ev.id, { alertCallLeadMinutes: v }, 'following');
    else updateEvent(ev.id, { alertCallLeadMinutes: v });
  };
  const saveNotes = async () => { await updateEvent(ev.id, { notes: notesText.trim() || undefined }); setEditingNotes(false); refreshLog(); };
  const confirmDelete = () => Alert.alert('Delete event', `Delete "${ev.title}"? This can't be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { useEventStore.getState().deleteEvent(ev.id); showToast('Event deleted'); onClose(); } },
  ]);

  const block = (label: string, accent: string, children: ReactNode, right?: ReactNode) => (
    <View style={s.block}>
      <View style={s.blockHead}><Eyebrow label={label} accent={accent} k={k} />{right}</View>
      {children}
    </View>
  );
  const chip = (text: string, bg: string, fg: string) => (
    <View key={text} style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color: fg }]}>{text}</Text></View>
  );
  const bigBtn = (label: string, onPress: () => void, bg: string, fg: string, flex?: boolean) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [s.bigBtn, { backgroundColor: bg }, flex && { flex: 1 }, pressed && { opacity: 0.75 }]}>
      <Text style={[s.bigBtnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
  const personRow = (m: FamilyMember, sub: string, pill?: ReactNode) => (
    <View key={m.id + sub} style={[s.personRow, { backgroundColor: tone.card }]}>
      <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={members.map(x => x.name)} size={38} ringColor={tone.fg} ringWidth={2} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.personName, { color: k.text }]} numberOfLines={1}>{m.name}{m.id === active.id ? ' (you)' : ''}</Text>
        <Text style={[s.personSub, { color: k.textMuted }]}>{sub}</Text>
      </View>
      {pill}
    </View>
  );

  const showYourActions = canConfirmPickup || (amAttendee && !myAck && !isPast && !ev.isOptionalRsvp);
  const showAssignActions = !isPast && (showConfirm || showCantMakeIt || showReassign || showOverride || (changeOpen && !!cancelledSelfName));

  return (
    <KioskFormDrawer
      visible={!!event}
      variant="drawer"
      title={ev.title}
      subtitle={`${cat} · ${fmtHumanDate(ev.date)}`}
      accent={tone.fg}
      Icon={CalendarIcon}
      k={k}
      onClose={onClose}
      headerRight={isViewerParent ? (
        <View style={s.headRight}>
          <Pressable onPress={onEditFull} hitSlop={10} style={[s.editBtn, { backgroundColor: k.well, borderColor: k.cardBorder }]} accessibilityRole="button" accessibilityLabel="Edit full details">
            <Pencil size={16} color={k.textMuted} />
          </Pressable>
          <Pressable onPress={confirmDelete} hitSlop={10} style={[s.editBtn, { backgroundColor: k.dangerSoft, borderColor: k.dangerEdge }]} accessibilityRole="button" accessibilityLabel="Delete event">
            <Trash2 size={16} color={k.danger} />
          </Pressable>
        </View>
      ) : undefined}
    >
      <View style={s.body}>
        {/* Hero */}
        <View style={[s.hero, { backgroundColor: tone.col }]}>
          <View style={[s.heroEmoji, { backgroundColor: tone.card }]}><Text style={{ fontSize: 30 }}>{CAT_EMOJI[cat] ?? '📅'}</Text></View>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={s.chipRow}>{chip(status.label, status.bg, status.fg)}</View>
            <Text style={[s.heroTime, { color: k.text }]}>{timeStr}</Text>
            <Text style={[s.personSub, { color: k.textMuted }]}>{fmtHumanDate(ev.date)}</Text>
          </View>
        </View>
        <View style={s.chipRow}>
          {chip(cat, tone.card, tone.fg)}
          {!!recur && !!RECUR_LABEL[recur] && chip(`🔄 ${RECUR_LABEL[recur]}`, k.pastelLavCard, k.purple)}
          {!!ev.pickupConfirmedAt && chip('✓ Pickup confirmed', k.pastelSageCard, k.sage)}
          {!!duration && chip(`${Math.floor(duration / 60) ? `${Math.floor(duration / 60)}h ` : ''}${duration % 60 ? `${duration % 60}m` : ''}`.trim(), k.well, k.textMuted)}
          {isPast && chip('Done', k.pastelSageCard, k.sage)}
        </View>
        {(ev.createdBy || ev.createdAt) && (
          <Text style={[s.createdMeta, { color: k.textFaint }]}>
            {ev.createdBy ? `Created by ${members.find(m => m.id === ev.createdBy)?.name.split(' ')[0] ?? 'someone'}` : 'Created'}
            {ev.createdAt ? ` · ${stamp(ev.createdAt)}` : ''}
          </Text>
        )}

        {/* Where */}
        {(!!ev.location || !!ev.pickupLocation || !!ev.dropLocation || (cat === 'Medical' && !!ev.doctorName) || (cat === 'Study' && !!ev.subject) || (cat === 'Sports' && !!ev.coachName)) && block('WHERE & WHO', k.sage, (
          <View style={[s.panel, { backgroundColor: k.pastelSage }]}>
            {!!ev.location && <View style={s.row}><MapPin size={16} color={k.sage} /><LocationLink addr={ev.location} color={k.sage} fontSize={KIOSK_TYPO.body} /></View>}
            {!!ev.pickupLocation && <View style={s.row}><Text style={[s.metaKey, { color: k.textMuted }]}>Pick up</Text><LocationLink addr={ev.pickupLocation} color={k.sage} fontSize={KIOSK_TYPO.caption} /></View>}
            {!!ev.dropLocation && <View style={s.row}><Text style={[s.metaKey, { color: k.textMuted }]}>Drop off</Text><LocationLink addr={ev.dropLocation} color={k.sage} fontSize={KIOSK_TYPO.caption} /></View>}
            {cat === 'Medical' && !!ev.doctorName && <Text style={[s.meta, { color: k.text }]}>🩺 Doctor: <Text style={s.bold}>{ev.doctorName}</Text></Text>}
            {cat === 'Study' && !!ev.subject && <Text style={[s.meta, { color: k.text }]}>📖 Subject: <Text style={s.bold}>{ev.subject}</Text></Text>}
            {cat === 'Sports' && !!ev.coachName && <Text style={[s.meta, { color: k.text }]}>🏅 Coach: <Text style={s.bold}>{ev.coachName}</Text></Text>}
          </View>
        ))}

        {linked && (
          <Pressable onPress={() => setViewId(linked.id)} accessibilityRole="button" style={[s.linked, { backgroundColor: k.pastelLav }]}>
            <Repeat size={16} color={k.purple} />
            <View style={{ flex: 1 }}>
              <Text style={[s.metaKey, { color: k.textMuted }]}>LINKED LEG</Text>
              <Text style={[s.meta, { color: k.text }]} numberOfLines={1}>{linked.title}{linked.time ? ` · ${fmtTime(linked.time)}` : ''}</Text>
            </View>
            <Text style={[s.bold, { color: k.purple }]}>View →</Text>
          </Pressable>
        )}

        {/* Notes (inline edit) */}
        {block('NOTES', k.gold, editingNotes ? (
          <View style={{ gap: KIOSK_SPACE.sm }}>
            <TextInput
              value={notesText} onChangeText={setNotesText} multiline autoFocus
              placeholder="Add a note for the family…" placeholderTextColor={k.textFaint}
              style={[s.notesInput, { color: k.text, backgroundColor: k.card, borderColor: k.goldEdge }]}
            />
            <View style={s.row}>
              {bigBtn('Cancel', () => setEditingNotes(false), k.well, k.text, true)}
              {bigBtn('Save note', saveNotes, k.primary, k.onPrimary, true)}
            </View>
          </View>
        ) : (
          <View style={[s.panel, { backgroundColor: k.pastelAmber }]}>
            <Text style={[s.meta, { color: ev.notes ? k.text : k.textMuted, fontStyle: ev.notes ? 'normal' : 'italic' }]}>{ev.notes || 'No notes yet.'}</Text>
          </View>
        ), !editingNotes && !isPast ? (
          <Pressable onPress={() => { setNotesText(ev.notes ?? ''); setEditingNotes(true); }} hitSlop={10} accessibilityRole="button">
            <Text style={[s.bold, { color: k.sage }]}>{ev.notes ? 'Edit' : '+ Add note'}</Text>
          </Pressable>
        ) : undefined)}

        {/* Reminder */}
        {!isPast && block('REMINDER', k.purple, (
          <View style={[s.panel, { backgroundColor: k.pastelLav }]}>
            <CallReminderToggle
              alertCall={alertCall} setAlertCall={setAlert as any}
              alertCallLeadMinutes={leadMin} setAlertCallLeadMinutes={setLead}
              accentColor={tone.fg} colors={colors} isDark={isDark} variant="icon"
            />
          </View>
        ))}

        {/* Your actions */}
        {(showYourActions || showAssignActions) && block('YOUR ACTIONS', k.primary, (
          <View style={{ gap: KIOSK_SPACE.sm }}>
            {canConfirmPickup && bigBtn('🚗  Confirm pickup happened', () => updateEvent(ev.id, { pickupConfirmedAt: new Date().toISOString(), pickupConfirmedBy: active.id }), k.pastelSageCard, k.sage)}
            {amAttendee && !myAck && !isPast && !ev.isOptionalRsvp && bigBtn('👀  Mark as seen. I know about this', () => updateEvent(ev.id, { acknowledgedBy: [...(ev.acknowledgedBy ?? []), active.id] }), k.pastelLavCard, k.purple)}
            {showAssignActions && (
              <View style={{ gap: KIOSK_SPACE.sm }}>
                {(showConfirm || (showCantMakeIt && !changeOpen)) && (
                  <View style={s.row}>
                    {showConfirm && bigBtn('Confirm', () => useEventStore.getState().confirmEventAssignment(ev.id, active.id, assigneeRole).then(refreshLog), k.pastelSageCard, k.sage, true)}
                    {showCantMakeIt && !changeOpen && bigBtn("Can't Make It", () => { setCancelledSelfName(active.name); setChangeOpen(true); }, k.pastelPrimaryCard, k.danger, true)}
                  </View>
                )}
                {(showReassign || showOverride || (changeOpen && !!cancelledSelfName)) && (!hadPriorHelper ? true : changeOpen) && (
                  <View style={s.section}>
                    {changeOpen && (
                      <Pressable
                        onPress={async () => {
                          if (cancelledSelfName) {
                            const ok = await useEventStore.getState().declineEventAssignment(ev.id, active.id, assigneeRole);
                            if (!ok) return;
                            showToast("Marked — you're off this one ✓");
                          }
                          setChangeOpen(false); setCancelledSelfName(undefined); refreshLog();
                        }}
                        style={s.cancelRow}
                      >
                        <ChevronDown size={14} color={k.textFaint} />
                        <Text style={[s.metaKey, { color: k.textFaint }]}>{cancelledSelfName ? "I can't make it — no replacement yet" : 'Cancel'}</Text>
                      </Pressable>
                    )}
                    <Text style={[s.personName, { color: k.text }]}>{(!hadPriorHelper || cancelledSelfName) ? helperQuestion : 'Reassign to'}</Text>
                    <KioskDriverChipRow
                      ev={ev} members={members} k={k} active={active}
                      excludeName={cancelledSelfName ?? assignee.name}
                      excludeId={cancelledSelfName ? active.id : assignee.id}
                      allowGpTeen={cat !== 'Work'}
                      onOpenPool={(kind) => {
                        const doneToast = () => showToast(kind === 'gp' ? 'Opened to Grandparents ✓' : 'Opened to Teens ✓');
                        if (cancelledSelfName) {
                          useEventStore.getState().declineEventAssignment(ev.id, active.id, assigneeRole).then(ok => { if (!ok) return; doneToast(); onClose(); });
                          return;
                        }
                        updateEvent(ev.id, kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true });
                        doneToast(); onClose();
                      }}
                      onAssign={(name, reason, memberId) => {
                        notifyTakeover(ev, name, members, active.name, active.id);
                        const target = memberId ? members.find(m => m.id === memberId) : members.find(m => m.name === name);
                        if (target) {
                          useEventStore.getState().reassignEvent(ev.id, target.id, assigneeRole, active.id);
                        } else {
                          updateEvent(ev.id, assigneeRole === 'driver'
                            ? { driverName: name, driverId: undefined, driverStatus: name === active.name ? 'confirmed' as const : 'pending' as const }
                            : { helper: name, helperId: undefined, helperStatus: name === active.name ? 'confirmed' as const : 'pending' as const });
                          showToast(`Assigned to ${name.split(' ')[0]} ✓`);
                        }
                        if (reason) updateEvent(ev.id, { notes: `${cancelledSelfName ?? active.name} can't do "${helperLabel}" — "${reason}"` });
                        setChangeOpen(false); setCancelledSelfName(undefined); onClose();
                      }}
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        ))}

        {/* RSVP */}
        {ev.isOptionalRsvp && !isPast && block('RSVP', k.gold, (
          <View style={{ gap: KIOSK_SPACE.sm }}>
            {Object.keys(rsvpCounts).length > 0 && (
              <View style={s.chipRow}>
                {!!rsvpCounts.going && chip(`✓ Going ${rsvpCounts.going}`, k.pastelSageCard, k.sage)}
                {!!rsvpCounts.maybe && chip(`? Maybe ${rsvpCounts.maybe}`, k.pastelAmberCard, k.gold)}
                {!!rsvpCounts.not_going && chip(`✕ Can't ${rsvpCounts.not_going}`, k.pastelPrimaryCard, k.danger)}
              </View>
            )}
            <View style={s.row}>
              {([
                { key: 'going', label: '✓ Going', fg: k.sage, bg: k.pastelSageCard },
                { key: 'maybe', label: '? Maybe', fg: k.gold, bg: k.pastelAmberCard },
                { key: 'not_going', label: "✕ Can't", fg: k.danger, bg: k.pastelPrimaryCard },
              ] as const).map(o => {
                const mine = rsvps[active.id] === o.key;
                return (
                  <Pressable key={o.key} onPress={() => updateEvent(ev.id, { rsvps: { ...rsvps, [active.id]: o.key } })}
                    accessibilityRole="button" accessibilityState={{ selected: mine }}
                    style={[s.bigBtn, { flex: 1, backgroundColor: mine ? o.fg : o.bg }]}>
                    <Text style={[s.bigBtnText, { color: mine ? k.onAccent : o.fg }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {/* Who's involved */}
        {(allAssignees.length > 0 || !!assignee.name || needsDriver) && block("WHO'S INVOLVED", k.gold, (
          <View style={{ gap: KIOSK_SPACE.sm }}>
            {allAssignees.map(m => personRow(m, forLabel, ev.acknowledgedBy?.includes(m.id) ? <View key="a" style={[s.pill, { backgroundColor: k.pastelSageCard }]}><Text style={[s.pillText, { color: k.sage }]}>Seen ✓</Text></View> : undefined))}
            {!!assignee.name && !ev.approvalPending && (
              <View style={[s.panel, { backgroundColor: showAlarm ? k.pastelPrimary : isPending ? k.pastelAmber : k.pastelSage, gap: KIOSK_SPACE.sm }]}>
                <View style={s.row}>
                  <Text style={[s.metaKey, { color: k.textMuted }]}>{helperLabel}</Text>
                  <FamilyAvatar
                    name={assignee.name} emoji={helperMember?.emoji} avatarUrl={(helperMember as any)?.avatarUrl}
                    siblings={members.map(m => m.name)} size={38}
                    ringColor={showAlarm ? k.danger : isPending ? k.gold : isRejected ? k.cardBorder : k.sage} ringWidth={2}
                  />
                  <Text style={[s.personName, { color: k.text, flex: 1 }]} numberOfLines={1}>{assignee.name}</Text>
                  {assignee.status === 'confirmed' && <StatusPill k={k} label="Confirmed ✓" color={k.sage} bg={k.pastelSageCard} />}
                  {isPending && <StatusPill k={k} label="⏳ Awaiting" color={k.gold} bg={k.pastelAmberCard} />}
                  {isRejected && !showAlarm && <StatusPill k={k} label="No driver yet" color={k.textFaint} bg={k.well} />}
                  {showAlarm && <StatusPill k={k} label="Declined ✕" color={k.danger} bg={k.pastelPrimaryCard} />}
                </View>
                {showAlarm && !!ev.declineReason && <Text style={[s.meta, { color: k.danger }]} numberOfLines={2}>"{ev.declineReason}"</Text>}
                {!isPast && !isSelfAssigned && (showRemind || showAssignToMe || showReassign || showOverride) && (
                  <View style={s.row}>
                    {showRemind && (
                      <Pressable onPress={() => { if (assignee.id) useEventStore.getState().remindEventAssignee(ev.id, assignee.id, assignee.name ?? 'Driver', active.id); onClose(); }}
                        style={[s.chipBtn, { backgroundColor: k.pastelAmberCard }]} accessibilityRole="button">
                        <Bell size={14} color={k.gold} /><Text style={[s.chipBtnText, { color: k.gold }]}>Remind</Text>
                      </Pressable>
                    )}
                    {(showAssignToMe || showReassign) && (
                      <Pressable onPress={() => setChangeOpen(v => !v)} style={[s.chipBtn, { backgroundColor: isRejected ? k.pastelPrimaryCard : k.pastelLavCard }]} accessibilityRole="button">
                        {isRejected ? <Repeat size={14} color={k.danger} /> : <User size={14} color={k.purple} />}
                        <Text style={[s.chipBtnText, { color: isRejected ? k.danger : k.purple }]}>{isRejected ? 'Swap' : 'Take Over'}</Text>
                      </Pressable>
                    )}
                    {showOverride && (
                      <Pressable
                        onPress={() => Alert.alert('Override Confirmed Ride?', `${assignee.name?.split(' ')[0] ?? 'Driver'} already confirmed this. Only change it if there's a real problem.`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Yes, Reassign', style: 'destructive', onPress: () => setChangeOpen(true) },
                        ])}
                        style={[s.chipBtn, { backgroundColor: k.pastelPrimaryCard }]} accessibilityRole="button">
                        <Repeat size={14} color={k.danger} /><Text style={[s.chipBtnText, { color: k.danger }]}>Override</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            )}
            {needsDriver && !assignee.name && (
              <View style={[s.panel, { backgroundColor: k.pastelAmber }]}>
                <View style={s.row}>
                  <Text style={{ fontSize: 22 }}>🚗</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.personName, { color: k.text }]}>No driver yet</Text>
                    <Text style={[s.personSub, { color: k.gold }]}>Someone needs to take this ride</Text>
                  </View>
                  {isViewerParent && !isPast && (
                    <Pressable onPress={() => setChangeOpen(true)} style={[s.chipBtn, { backgroundColor: k.gold }]} accessibilityRole="button">
                      <Text style={[s.chipBtnText, { color: k.onAccent }]}>Assign driver</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </View>
        ))}

        {/* Conflicts */}
        {conflicts.length > 0 && block('⚠ SCHEDULE CONFLICTS', k.danger, (
          <View style={[s.panel, { backgroundColor: k.pastelPrimary, gap: KIOSK_SPACE.sm }]}>
            {conflicts.map(o => (
              <View key={o.id} style={[s.personRow, { backgroundColor: k.pastelPrimaryCard, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}>
                <Text style={[s.personName, { color: k.text }]}>{o.title}</Text>
                <Text style={[s.personSub, { color: k.textMuted }]}>{o.time ? `${fmtTime(o.time)} · ` : ''}{fmtHumanDate(o.date)}</Text>
              </View>
            ))}
            {bigBtn('Not a conflict', () => updateEvent(ev.id, { conflictAcknowledged: true }), k.card, k.textMuted)}
          </View>
        ))}

        {/* Activity & history */}
        {block('ACTIVITY & HISTORY', k.textFaint, log.length === 0 ? (
          <Text style={[s.meta, { color: k.textMuted, fontStyle: 'italic' }]}>No history yet.</Text>
        ) : (
          <View style={[s.panel, { backgroundColor: k.well }]}>
            {log.map((r, i) => {
              const meta = LOG_META[r.action] ?? { icon: '•', label: String(r.action).replace(/_/g, ' ') };
              const actor = members.find(m => m.id === r.actorId);
              const from = r.oldValue ? members.find(m => m.id === r.oldValue) : null;
              const to = r.newValue ? members.find(m => m.id === r.newValue) : null;
              const change = from && to ? `${from.name.split(' ')[0]} → ${to.name.split(' ')[0]}` : r.oldValue && r.newValue ? `${r.oldValue} → ${r.newValue}` : '';
              return (
                <View key={`${r.createdAt}-${i}`} style={s.logRow}>
                  <View style={s.logRail}>
                    <View style={[s.logDot, { backgroundColor: tone.card }]}><Text style={{ fontSize: 12 }}>{meta.icon}</Text></View>
                    {i < log.length - 1 && <View style={[s.logLine, { backgroundColor: k.cardBorder }]} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 12 }}>
                    <Text style={[s.personName, { color: k.text }]}>{meta.label}{actor ? <Text style={[s.personSub, { color: k.textMuted }]}>{`  by ${actor.name.split(' ')[0]}`}</Text> : null}</Text>
                    {!!change && <Text style={[s.personSub, { color: k.textMuted }]}>{change}</Text>}
                    <Text style={[s.personSub, { color: k.textFaint }]}>{stamp(r.createdAt)}</Text>
                    {!!r.note && <Text style={[s.personSub, { color: k.textMuted, fontStyle: 'italic' }]}>"{r.note}"</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </KioskFormDrawer>
  );
}

function StatusPill({ k, label, color, bg }: { k: KioskColors; label: string; color: string; bg: string }) {
  return (
    <View style={[s.statusPill, { backgroundColor: bg }]}>
      <Text style={[s.statusPillText, { color }]}>{label}</Text>
    </View>
  );
}

/**
 * KioskDriverChipRow — port of hubComponents.tsx's own private DriverChipRow
 * (lines 685-837, unexported, so it can't be imported and had to be
 * reconstructed here). Same real chip logic: Me / other parents / GP-pool /
 * Teen-pool, an optional reason note, and a resolve-then-Confirm step.
 */
function KioskDriverChipRow({ ev, members, k, active, excludeName, excludeId, allowGpTeen, onAssign, onOpenPool }: {
  ev: FamilyEvent;
  members: FamilyMember[];
  k: KioskColors;
  active: FamilyMember;
  excludeName?: string;
  excludeId?: string;
  allowGpTeen: boolean;
  onAssign: (name: string, reason: string, memberId: string | undefined) => void;
  onOpenPool: (kind: 'gp' | 'teen') => void;
}) {
  const assignee = eventAssignee(ev);
  const isExcluded = assignee.id && excludeId ? assignee.id === excludeId : assignee.name === excludeName;
  const initialPicked = assignee.name && !isExcluded
    ? ((assignee.id ? assignee.id === active.id : assignee.name === active.name)
        ? 'me'
        : (assignee.id
            ? members.find(m => m.id === assignee.id && m.role === 'parent')?.id ?? null
            : members.find(m => m.name === assignee.name && m.role === 'parent')?.id ?? null))
    : null;
  const [picked, setPicked] = useState<string | null>(initialPicked);
  const [reason, setReason] = useState('');

  const viewerCanDrive = excludeId ? active.id !== excludeId : active.name !== excludeName;
  const otherParents = members.filter(m =>
    m.role === 'parent' &&
    (excludeId ? m.id !== excludeId : m.name !== excludeName) &&
    m.id !== active.id,
  );
  const gpOpen = !!ev.isOpenToGrandparents && !assignee.name;
  const teenOpen = !!ev.isOpenToTeens && !assignee.name;
  const showGp = allowGpTeen && members.some(m => m.role === 'senior');
  const showTeen = allowGpTeen && members.some(m => m.role === 'teen');

  const chip = (key: string, label: string, Icon: typeof User, onPress: () => void, tone: 'primary' | 'neutral' | 'open' = 'neutral') => {
    const sel = picked === key;
    const isOpenTone = tone === 'open' && !sel;
    const fg = sel ? k.onAccent : isOpenTone ? k.gold : tone === 'primary' ? k.primary : k.text;
    return (
      <Pressable
        key={key} onPress={onPress}
        style={[
          s.driverChip,
          {
            backgroundColor: sel ? k.primary : isOpenTone ? k.goldSoft : tone === 'primary' ? k.primarySoft : k.well,
            borderColor: sel ? k.primary : isOpenTone ? k.gold : tone === 'primary' ? k.primaryEdge : k.cardBorder,
            borderStyle: isOpenTone ? 'dashed' : 'solid',
          },
        ]}
        accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: sel }}
      >
        <Icon size={14} color={fg} />
        <Text style={[s.driverChipText, { color: fg }]}>{label}{isOpenTone ? ' · Open' : ''}</Text>
      </Pressable>
    );
  };

  const resolvedName = picked === 'me' ? active.name : otherParents.find(m => m.id === picked)?.name;
  const resolvedId = picked === 'me' ? active.id : picked ?? undefined;

  return (
    <View style={s.section}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.driverChipRow}>
        {viewerCanDrive && chip('me', 'Me', User, () => setPicked('me'), 'primary')}
        {otherParents.map(m => chip(m.id, m.name.split(' ')[0], User, () => setPicked(m.id)))}
        {showGp && chip('gp', 'Grandparent', Users, () => onOpenPool('gp'), gpOpen ? 'open' : 'neutral')}
        {showTeen && chip('teen', 'Teen', User, () => onOpenPool('teen'), teenOpen ? 'open' : 'neutral')}
      </ScrollView>
      {!!picked && (
        <>
          <View style={[s.reasonBox, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
            <Pencil size={13} color={k.textFaint} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.reasonLabel, { color: k.textFaint }]}>NOTE (OPTIONAL)</Text>
              <TextInput
                value={reason} onChangeText={setReason}
                placeholder="e.g. Conflict with other pickup…"
                placeholderTextColor={k.textFaint}
                style={[s.reasonInput, { color: k.text }]}
                maxLength={120} multiline
              />
            </View>
          </View>
          {!!resolvedName && (
            <Pressable onPress={() => onAssign(resolvedName, reason.trim(), resolvedId)} style={[s.confirmBtn, { backgroundColor: k.primary }]}>
              <Text style={[s.confirmBtnText, { color: k.onAccent }]}>Confirm {picked === 'me' ? 'Me' : resolvedName.split(' ')[0]}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  body: { gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl },
  block: { gap: KIOSK_SPACE.sm },
  blockHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.xl, padding: KIOSK_SPACE.md },
  heroEmoji: { width: 62, height: 62, borderRadius: KIOSK_RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  heroTime: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', letterSpacing: -0.3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 9, paddingHorizontal: 11, paddingVertical: 5 },
  pillText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  panel: { borderRadius: KIOSK_RADIUS.lg, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.xs },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.lg, paddingHorizontal: KIOSK_SPACE.md, paddingVertical: 10 },
  personName: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  personSub: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
  meta: { fontSize: KIOSK_TYPO.body, fontWeight: '600', lineHeight: 21 },
  metaKey: { fontSize: KIOSK_TYPO.label, fontWeight: '800', letterSpacing: 0.4 },
  bold: { fontWeight: '800', fontSize: KIOSK_TYPO.body },
  linked: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.lg, padding: KIOSK_SPACE.md },
  notesInput: { minHeight: 90, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, padding: 12, fontSize: KIOSK_TYPO.body, textAlignVertical: 'top' },
  bigBtn: { minHeight: 52, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: KIOSK_SPACE.lg, alignItems: 'center', justifyContent: 'center' },
  bigBtnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  headRight: { flexDirection: 'row', gap: 8 },
  logRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  logRail: { width: 30, alignItems: 'center' },
  logDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  logLine: { width: 2, flex: 1, marginTop: 3 },
  section: { gap: KIOSK_SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, flexWrap: 'wrap' },
  editBtn: { width: 36, height: 36, borderRadius: KIOSK_RADIUS.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  catRow: { flexDirection: 'row' },
  catPill: { borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 4, borderWidth: 1 },
  catPillText: { fontSize: KIOSK_TYPO.label, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  dateText: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  createdMeta: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: -2 },
  donePill: { borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.xs, paddingVertical: 3 },
  donePillText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  label: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  metaLabel: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
  metaLine: { fontSize: KIOSK_TYPO.body },
  ackBadge: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  ackBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 6 },
  ackBtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  rsvpRow: { flexDirection: 'row', gap: 6 },
  rsvpBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: KIOSK_RADIUS.sm, borderWidth: 1.5 },
  rsvpBtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  helperCard: { borderRadius: KIOSK_RADIUS.md, borderWidth: 1, paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm, gap: KIOSK_SPACE.sm },
  alarmBadge: { position: 'absolute', top: -3, right: -3, borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  alarmBadgeText: { fontSize: 9, color: '#fff', fontWeight: '900' },
  helperLabel: { fontSize: KIOSK_TYPO.label },
  declineReason: { fontSize: KIOSK_TYPO.label, marginTop: 2 },
  // Matches the Schedule card's own catBadge exactly (KioskScheduleTab.tsx)
  // [live-reported: "the sheet radio is not matching with the other card
  // radio"] — this sheet's own pill previously used a rounder, larger
  // shape (KIOSK_RADIUS.sm=10/KIOSK_SPACE.xs=6/micro=12) than the card's
  // tighter one (5/7/2/10), so the same real status read as two different
  // pill conventions depending on whether it was seen on the card or
  // after opening its detail sheet.
  statusPill: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  helperActionsRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, paddingTop: KIOSK_SPACE.sm, borderTopWidth: 1 },
  chipBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 7, borderRadius: KIOSK_RADIUS.sm },
  chipBtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  linkedLegBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm },
  linkedLegText: { flex: 1, fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  notesBox: { borderRadius: KIOSK_RADIUS.md, borderWidth: 1, padding: KIOSK_SPACE.sm },
  notesText: { fontSize: KIOSK_TYPO.body, lineHeight: 20 },
  actionsSection: { gap: KIOSK_SPACE.sm, borderTopWidth: 1, paddingTop: KIOSK_SPACE.md },
  primaryActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: KIOSK_RADIUS.md, borderWidth: 1, minHeight: KIOSK_HIT.control, paddingHorizontal: KIOSK_SPACE.lg },
  primaryActionText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  cancelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  cancelRowText: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  driverChipRow: { gap: KIOSK_SPACE.xs, paddingRight: KIOSK_SPACE.xs },
  driverChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 9, borderRadius: KIOSK_RADIUS.sm, borderWidth: 1.5 },
  driverChipText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  reasonBox: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs, borderWidth: 1.5 },
  reasonLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  reasonInput: { fontSize: KIOSK_TYPO.label, minHeight: 32 },
  confirmBtn: { borderRadius: KIOSK_RADIUS.md, paddingVertical: 11, alignItems: 'center' },
  confirmBtnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
});
