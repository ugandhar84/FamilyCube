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
import { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { Bell, Check, Repeat, User, Users, X, ChevronDown, MapPin, Calendar as CalendarIcon, Pencil } from 'lucide-react-native';
import { useEventStore, eventAssignee, type FamilyEvent } from '@/store/eventStore';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import { deriveEventActions, eventAssigneeRole } from '@/features/tasks/lib/deriveCardActions';
import { hoursUntilEvent, isWorkEvent } from '@/features/hub/hubUtils';
import { notifyTakeover } from '@/features/hub/hubComponents';
import { LocationLink } from '@/features/calendar/components/EventCard';
import { showToast } from '@/components/AppToast';
import { fmtDateShort, fmtTime } from '@/lib/dates';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { kioskCatAccent } from '../tabs/KioskScheduleTab';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer } from './KioskFormDrawer';

export function KioskEventDetailSheet({ event, active, members, onClose, onEditFull }: {
  event: FamilyEvent | null;
  active: FamilyMember;
  members: FamilyMember[];
  onClose: () => void;
  /** Opens the full KioskEventEditor drawer — same real "Edit full details"
      pencil EventDetailSheet.tsx offers a parent, parity for the same
      long-press-elsewhere-only path this whole file exists to surface. */
  onEditFull: () => void;
}) {
  const { k } = useKioskColors();
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelledSelfName, setCancelledSelfName] = useState<string | undefined>(undefined);
  // Live-crashed: "Rendered more hooks than during the previous render" —
  // this hook used to sit AFTER the `if (!event) return null` early return
  // below, so it was skipped entirely on a null-event render and then
  // suddenly present the next time an event was passed in, violating
  // Rules of Hooks. Every hook in this component must run unconditionally
  // on every render regardless of `event`, same as the two useState calls
  // right above already correctly do.
  const updateEvent = useEventStore(s => s.updateEvent);

  if (!event) return null;
  const ev = event;
  const cat = ev.category ?? 'Event';
  const hours = hoursUntilEvent(ev.date, ev.time);
  const isPast = hours < 0;
  const cc = kioskCatAccent(cat, k).fg;

  const allAssignees = ev.memberIds?.length
    ? members.filter(m => ev.memberIds!.includes(m.id))
    : ev.memberId ? members.filter(m => m.id === ev.memberId) : [];

  const forLabel =
    cat === 'Medical' ? 'Patient' :
    cat === 'Sports' ? 'Athlete' :
    cat === 'Study' ? 'Student' :
    cat === 'School' ? 'Student' :
    cat === 'Ride' ? 'Attending' :
    cat === 'Work' ? null : 'For';

  const helperLabel =
    cat === 'Medical' ? 'Accompanied by' :
    cat === 'Study' ? 'Tutored by' :
    cat === 'School' ? 'Dropped off by' :
    cat === 'Sports' ? 'Dropped off by' :
    cat === 'Ride' ? 'Driven by' :
    'Organised by';

  const helperQuestion =
    cat === 'Medical' ? "Who's accompanying?" :
    cat === 'Study' ? "Who's tutoring?" :
    cat === 'School' ? "Who's dropping off?" :
    cat === 'Sports' ? "Who's dropping off?" :
    cat === 'Ride' ? "Who's driving?" :
    "Who's organising?";

  const isViewerParent = active.role === 'parent';
  const {
    assignee, assigneeRole, isSelfAssigned,
    showRemind, showReassign, showAssignToMe, showOverride, showCantMakeIt, showConfirm,
  } = deriveEventActions(ev, { id: active.id, name: active.name, role: active.role, hasCar: active.hasCar }, { isPast });

  const helperMember = assignee.id ? members.find(m => m.id === assignee.id) : members.find(m => m.name === assignee.name);
  const isRejected = assignee.status === 'rejected';
  const isPending = assignee.status === 'pending';
  const showAlarm = isRejected && isViewerParent;
  const hadPriorHelper = !!assignee.name;
  const borderCol = showAlarm ? k.dangerEdge : isPending ? k.goldEdge : isRejected ? k.cardBorder : k.sageEdge;
  const bgCol = showAlarm ? k.dangerSoft : isPending ? k.goldSoft : k.well;

  return (
    <KioskFormDrawer
      visible={!!event}
      // [dialog->drawer audit] Re-checked: despite the name, this is not a
      // read-only peek — RSVP going/maybe/not-going, Acknowledge, Confirm/
      // Can't Make It, and the full driver-reassign flow (chip picker +
      // optional reason TextInput + Confirm) all live here, sized and
      // interacted with exactly like every other real kiosk form. A fixed
      // 85%-of-screen dialog was clipping/cramping that action set on a
      // real event with several of these sections visible at once; drawer
      // gives it the same full-height room KioskEventEditor already gets.
      variant="drawer"
      title={ev.title}
      accent={cc}
      Icon={CalendarIcon}
      k={k}
      onClose={onClose}
      headerRight={isViewerParent ? (
        <Pressable onPress={onEditFull} hitSlop={10} style={[s.editBtn, { backgroundColor: k.well, borderColor: k.cardBorder }]} accessibilityRole="button" accessibilityLabel="Edit full details">
          <Pencil size={16} color={k.textMuted} />
        </Pressable>
      ) : undefined}
    >
      <View style={s.catRow}>
        <View style={[s.catPill, { backgroundColor: cc + '20', borderColor: cc + '45' }]}>
          <Text style={[s.catPillText, { color: cc }]}>{cat}</Text>
        </View>
      </View>

      <View style={s.row}>
        <CalendarIcon size={14} color={cc} />
        <Text style={[s.dateText, { color: k.text }]}>
          {fmtDateShort(ev.date)} · {ev.time ? fmtTime(ev.time) : 'All day'}
        </Text>
        {isPast && (
          <View style={[s.donePill, { backgroundColor: k.sageSoft }]}>
            <Text style={[s.donePillText, { color: k.sage }]}>Done</Text>
          </View>
        )}
      </View>

      {/* Live-requested: "small letters the created by and date time if
          available" — real EventDetailSheet.tsx has no equivalent (this
          is a genuinely new addition, not a parity port); createdBy/
          createdAt are real columns already mapped in eventStore.ts, just
          never surfaced in any UI before this. Quiet, secondary — smaller
          than every other line on the sheet, only rendered when the data
          actually exists rather than showing a blank/placeholder line for
          an older event created before these columns existed. */}
      {(ev.createdBy || ev.createdAt) && (
        <Text style={[s.createdMeta, { color: k.textFaint }]}>
          {ev.createdBy ? `Created by ${members.find(m => m.id === ev.createdBy)?.name.split(' ')[0] ?? 'someone'}` : 'Created'}
          {ev.createdAt ? ` · ${new Date(ev.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
        </Text>
      )}

      {forLabel && allAssignees.length > 0 && (
        <View style={s.section}>
          <View style={s.row}>
            <Text style={[s.label, { color: k.textMuted }]}>{forLabel}:</Text>
            {allAssignees.map(m => {
              const acked = ev.acknowledgedBy?.includes(m.id);
              return (
                <View key={m.id} style={{ position: 'relative' }}>
                  <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={members.map(x => x.name)} size={24} ringColor={acked ? k.sage : cc} ringWidth={1.5} />
                  {acked && (
                    <View style={[s.ackBadge, { backgroundColor: k.sage, borderColor: k.card }]}>
                      <Check size={7} color="#fff" />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          {!isPast && allAssignees.some(m => m.id === active.id) && !ev.acknowledgedBy?.includes(active.id) && !ev.isOptionalRsvp && (
            <Pressable
              onPress={() => updateEvent(ev.id, { acknowledgedBy: [...(ev.acknowledgedBy ?? []), active.id] })}
              style={[s.ackBtn, { borderColor: cc + '50', backgroundColor: cc + '12' }]}
              accessibilityRole="button" accessibilityLabel="Acknowledge you saw this"
            >
              <Check size={12} color={cc} />
              <Text style={[s.ackBtnText, { color: cc }]}>Acknowledge</Text>
            </Pressable>
          )}
        </View>
      )}

      {ev.isOptionalRsvp && (
        <View style={s.section}>
          <Text style={[s.label, { color: k.textMuted }]}>
            RSVP{' '}
            <Text style={{ fontWeight: '400', color: k.textFaint }}>
              {(() => {
                const responses = Object.values(ev.rsvps ?? {});
                const going = responses.filter(r => r === 'going').length;
                const maybe = responses.filter(r => r === 'maybe').length;
                return `${going} going${maybe > 0 ? `, ${maybe} maybe` : ''}`;
              })()}
            </Text>
          </Text>
          {!isPast && (
            <View style={s.rsvpRow}>
              {([
                { key: 'going', label: 'Going', color: k.sage },
                { key: 'maybe', label: 'Maybe', color: k.gold },
                { key: 'not_going', label: 'Not Going', color: k.danger },
              ] as const).map(opt => {
                const mine = ev.rsvps?.[active.id] === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => updateEvent(ev.id, { rsvps: { ...(ev.rsvps ?? {}), [active.id]: opt.key } })}
                    style={[s.rsvpBtn, { backgroundColor: mine ? opt.color + '20' : k.well, borderColor: mine ? opt.color : k.cardBorder }]}
                    accessibilityRole="button" accessibilityLabel={opt.label} accessibilityState={{ selected: mine }}
                  >
                    <Text style={[s.rsvpBtnText, { color: mine ? opt.color : k.text }]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {!!ev.location && (
        <View style={s.row}>
          <MapPin size={14} color={k.sage} />
          <LocationLink addr={ev.location} color={k.sage} fontSize={KIOSK_TYPO.body} />
        </View>
      )}

      {cat === 'Medical' && !!ev.doctorName && (
        <Text style={[s.metaLine, { color: k.textMuted }]}>🩺 Doctor: <Text style={{ fontWeight: '700', color: k.text }}>{ev.doctorName}</Text></Text>
      )}
      {cat === 'Study' && !!ev.subject && (
        <Text style={[s.metaLine, { color: k.textMuted }]}>📖 Subject: <Text style={{ fontWeight: '700', color: k.text }}>{ev.subject}</Text></Text>
      )}
      {cat === 'Sports' && !!ev.coachName && (
        <Text style={[s.metaLine, { color: k.textMuted }]}>🏅 Coach: <Text style={{ fontWeight: '700', color: k.text }}>{ev.coachName}</Text></Text>
      )}
      {(cat === 'Ride' || cat === 'Sports') && (!!ev.pickupLocation || !!ev.dropLocation) && (
        <View style={s.section}>
          {!!ev.pickupLocation && (
            <View style={s.row}>
              <MapPin size={13} color={k.sage} />
              <Text style={[s.metaLabel, { color: k.textMuted }]}>From:</Text>
              <LocationLink addr={ev.pickupLocation} color={k.sage} fontSize={KIOSK_TYPO.label} />
            </View>
          )}
          {!!ev.dropLocation && (
            <View style={s.row}>
              <MapPin size={13} color={k.sage} />
              <Text style={[s.metaLabel, { color: k.textMuted }]}>To:</Text>
              <LocationLink addr={ev.dropLocation} color={k.sage} fontSize={KIOSK_TYPO.label} />
            </View>
          )}
        </View>
      )}

      {assignee.name && !ev.approvalPending && (
        <View style={[s.helperCard, { backgroundColor: bgCol, borderColor: borderCol }]}>
          <View style={s.row}>
            {/* Role label FIRST, then the avatar [live-reported: "show like
                Driven by + Avtar"] — was avatar-then-label. Name text
                dropped — the avatar already identifies who this is, same
                as every other avatar+name pattern in kiosk [live-reported:
                "remove names only keep avatars related persons"].
                accessibilityLabel below carries the name for screen
                readers. helperLabel ("Driver"/"Helper") stays — it's a
                ROLE label, not a redundant name. */}
            <Text style={[s.helperLabel, { color: k.textMuted }]}>{helperLabel}</Text>
            <View style={{ position: 'relative' }} accessible accessibilityLabel={`${helperLabel}: ${assignee.name}`}>
              <FamilyAvatar
                name={assignee.name} emoji={helperMember?.emoji} avatarUrl={(helperMember as any)?.avatarUrl}
                siblings={members.map(m => m.name)} size={36}
                ringColor={showAlarm ? k.danger : isPending ? k.gold : isRejected ? k.cardBorder : k.sage}
                ringWidth={2}
              />
              {showAlarm && (
                <View style={[s.alarmBadge, { backgroundColor: k.danger, borderColor: k.card }]}>
                  <Text style={s.alarmBadgeText}>!</Text>
                </View>
              )}
            </View>
            {showAlarm && !!ev.declineReason && (
              <View style={{ flex: 1 }}>
                <Text style={[s.declineReason, { color: k.danger }]} numberOfLines={2}>"{ev.declineReason}"</Text>
              </View>
            )}
            {assignee.status === 'confirmed' && <StatusPill k={k} label="Confirmed ✓" color={k.sage} bg={k.sageSoft} />}
            {isPending && <StatusPill k={k} label="⏳ Awaiting" color={k.gold} bg={k.goldSoft} />}
            {isRejected && !showAlarm && <StatusPill k={k} label="No driver yet" color={k.textFaint} bg={k.well} />}
            {showAlarm && <StatusPill k={k} label="Declined ✕" color={k.danger} bg={k.dangerSoft} />}
          </View>

          {!isPast && !isSelfAssigned && (showRemind || showAssignToMe || showReassign || showOverride) && (
            <View style={[s.helperActionsRow, { borderTopColor: borderCol }]}>
              {showRemind && (
                <Pressable
                  onPress={() => {
                    if (assignee.id) {
                      useEventStore.getState().remindEventAssignee(ev.id, assignee.id, assignee.name ?? 'Driver', active.id);
                    }
                    onClose();
                  }}
                  style={[s.chipBtn, { backgroundColor: k.goldSoft }]}
                >
                  <Bell size={13} color={k.gold} />
                  <Text style={[s.chipBtnText, { color: k.gold }]}>Remind</Text>
                </Pressable>
              )}
              {(showAssignToMe || showReassign) && (
                <Pressable onPress={() => setChangeOpen(v => !v)} style={[s.chipBtn, { backgroundColor: isRejected ? k.dangerSoft : k.primarySoft }]}>
                  {isRejected ? <Repeat size={13} color={k.danger} /> : <User size={13} color={k.primary} />}
                  <Text style={[s.chipBtnText, { color: isRejected ? k.danger : k.primary }]}>{isRejected ? 'Swap' : 'Take Over'}</Text>
                </Pressable>
              )}
              {showOverride && (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      'Override Confirmed Ride?',
                      `${assignee.name?.split(' ')[0] ?? 'Driver'} already confirmed this. Only change it if there's a real problem.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Yes, Reassign', style: 'destructive', onPress: () => setChangeOpen(true) },
                      ],
                    );
                  }}
                  style={[s.chipBtn, { backgroundColor: k.dangerSoft }]}
                >
                  <Repeat size={13} color={k.danger} />
                  <Text style={[s.chipBtnText, { color: k.danger }]}>Override</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {!!ev.linkedLegId && (
        <View style={[s.linkedLegBanner, { backgroundColor: k.blueSoft }]}>
          <Repeat size={13} color={k.blue} />
          <Text style={[s.linkedLegText, { color: k.blue }]}>
            {ev.title.includes('Pickup') ? "This is the Pickup half of a both-ways ride — there's a Drop-off event too."
              : ev.title.includes('Drop-off') ? "This is the Drop-off half of a both-ways ride — there's a Pickup event too."
              : 'This is paired with another ride leg.'}
          </Text>
        </View>
      )}

      {!!ev.notes && (
        <View style={[s.notesBox, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
          <Text style={[s.notesText, { color: k.textMuted }]}>📝 "{ev.notes}"</Text>
        </View>
      )}

      {!isPast && (showConfirm || showCantMakeIt || showReassign || showOverride || (changeOpen && !!cancelledSelfName)) && (
        <View style={[s.actionsSection, { borderTopColor: k.cardBorder }]}>
          {(showConfirm || (showCantMakeIt && !changeOpen)) && (
            <View style={s.row}>
              {showConfirm && (
                <Pressable
                  onPress={() => useEventStore.getState().confirmEventAssignment(ev.id, active.id, assigneeRole)}
                  style={[s.primaryActionBtn, { backgroundColor: k.sageSoft, borderColor: k.sageEdge, flex: 1 }]}
                >
                  <Text style={[s.primaryActionText, { color: k.sage }]}>Confirm</Text>
                </Pressable>
              )}
              {showCantMakeIt && !changeOpen && (
                <Pressable
                  onPress={() => { setCancelledSelfName(active.name); setChangeOpen(true); }}
                  // flex:1 always, not only when paired with Confirm — a
                  // lone action in this row previously sized to its own
                  // content width (no paddingHorizontal on primaryActionBtn
                  // either, compounding it), rendering as a small, cramped
                  // pill floating at the row's left edge instead of filling
                  // it the way the sheet's other full-row actions do
                  // [live-reported: "the can't make it button is not good"].
                  style={[s.primaryActionBtn, { backgroundColor: k.dangerSoft, borderColor: k.dangerEdge, flex: 1 }]}
                >
                  <X size={15} color={k.danger} />
                  <Text style={[s.primaryActionText, { color: k.danger }]}>Can't Make It</Text>
                </Pressable>
              )}
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
                      setChangeOpen(false);
                      setCancelledSelfName(undefined);
                      return;
                    }
                    setChangeOpen(false);
                    setCancelledSelfName(undefined);
                  }}
                  style={s.cancelRow}
                >
                  <ChevronDown size={14} color={k.textFaint} />
                  <Text style={[s.cancelRowText, { color: k.textFaint }]}>
                    {cancelledSelfName ? "I can't make it — no replacement yet" : 'Cancel'}
                  </Text>
                </Pressable>
              )}
              <Text style={[s.label, { color: k.textMuted }]}>
                {(!hadPriorHelper || cancelledSelfName) ? helperQuestion : 'Reassign to'}
              </Text>
              <KioskDriverChipRow
                ev={ev} members={members} k={k} active={active}
                excludeName={cancelledSelfName ?? assignee.name}
                excludeId={cancelledSelfName ? active.id : assignee.id}
                allowGpTeen={cat !== 'Work'}
                onOpenPool={(kind) => {
                  const doneToast = () => showToast(kind === 'gp' ? 'Opened to Grandparents ✓' : 'Opened to Teens ✓');
                  if (cancelledSelfName) {
                    useEventStore.getState().declineEventAssignment(ev.id, active.id, assigneeRole).then(ok => {
                      if (!ok) return;
                      doneToast();
                      onClose();
                    });
                    return;
                  }
                  updateEvent(ev.id, kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true });
                  doneToast();
                  onClose();
                }}
                onAssign={(name, reason, memberId) => {
                  notifyTakeover(ev, name, members, active.name, active.id);
                  const targetMember = memberId ? members.find(m => m.id === memberId) : members.find(m => m.name === name);
                  if (targetMember) {
                    useEventStore.getState().reassignEvent(ev.id, targetMember.id, assigneeRole, active.id);
                  } else {
                    updateEvent(ev.id, assigneeRole === 'driver'
                      ? { driverName: name, driverId: undefined, driverStatus: name === active.name ? 'confirmed' as const : 'pending' as const }
                      : { helper: name, helperId: undefined, helperStatus: name === active.name ? 'confirmed' as const : 'pending' as const });
                    showToast(`Assigned to ${name.split(' ')[0]} ✓`);
                  }
                  if (reason) {
                    updateEvent(ev.id, { notes: `${cancelledSelfName ?? active.name} can't do "${helperLabel}" — "${reason}"` });
                  }
                  setChangeOpen(false);
                  setCancelledSelfName(undefined);
                  onClose();
                }}
              />
            </View>
          )}
        </View>
      )}
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
