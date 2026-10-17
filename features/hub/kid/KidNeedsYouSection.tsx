import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  X, AlertTriangle, Clock, PartyPopper, Car,
  UserCheck, Check, Navigation, MapPin,
} from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import { useCelebrationStore } from '@/store/celebrationStore';
import { fmtTime, hoursUntilEvent } from '../hubUtils';
import { parseDbTime } from '@/lib/dates';
import { eventAssignee } from '@/store/eventStore';
import { driverLabelByName } from '@/lib/format';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { Quest, QuestCheer } from '@/store/questStore';
import { KidSectionHeader } from './KidSectionHeader';
import { GEMINI } from '@/constants/geminiRhythm';

// Money-green — positive/confirmed accent used throughout this section
// (approved quest, cheer, confirmed pickup, en-route trip). Not
// colors.success (which IS brand teal in this app) — kept as one local
// constant, matching every component this section merges.
const MONEY_GREEN = '#10B981';

// ─── Shared row shell ──────────────────────────────────────────────────────
// Every "Needs You" row — alert, reply, ride banner, awaiting-driver,
// live trip — renders through this one shell so the merged list reads as
// ONE consistent kind of thing, not four components stitched together.
// Rebuilt to match the Parent Hub's NeedsYouCard row rhythm (icon chip,
// status pill, flush divider-separated rows inside one shared card) instead
// of each row being its own separate bordered/tinted box
// [live-reported via screenshot: "see this needs you not exactly same
// stucture as the parent?"]. Kid keeps its own per-row dismiss-X (DB-backed
// per-item dismissal) and onPress navigation, both of which the parent
// card doesn't need — those two affordances are additive on top of the
// shared chrome, not a departure from it.
function NeedsYouRow({ Icon, accent, colors, isDark, title, detail, statusLabel, onPress, onDismiss, tone = 'flat', children }: {
  Icon: typeof AlertTriangle; accent: string; colors: any; isDark: boolean; title: string; detail?: string;
  // Short colored-pill label (e.g. "Sent back", "Approved!") shown next to
  // the detail line — same role as NeedsYouCard's status pill.
  statusLabel?: string;
  onPress?: () => void; onDismiss?: () => void;
  // 'flat' — icon chip in accent tint (default).
  // 'solid' — full-color background with white text, reserved for the ride
  // banner's overdue/here states which need to read as more urgent/alive
  // than a flat row.
  tone?: 'flat' | 'solid';
  children?: React.ReactNode;
}) {
  const Wrapper = onPress ? Pressable : View;
  const solid = tone === 'solid';
  return (
    <View style={{
      paddingVertical: 10, paddingHorizontal: 12, gap: 6,
      ...(solid ? { borderRadius: 14, backgroundColor: accent, marginVertical: 2 } : null),
    }}>
      <Wrapper onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: solid ? 'rgba(255,255,255,0.22)' : accent + '20',
        }}>
          <Icon size={18} color={solid ? '#fff' : accent} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: KID.sub, fontWeight: '900', color: solid ? '#fff' : colors.textPrimary }} numberOfLines={2}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {!!statusLabel && (
              <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 9, backgroundColor: solid ? 'rgba(255,255,255,0.22)' : accent + '20' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: solid ? '#fff' : accent }}>{statusLabel}</Text>
              </View>
            )}
            {!!detail && <Text style={{ fontSize: KID.tiny, color: solid ? 'rgba(255,255,255,0.85)' : colors.textSecondary, flex: 1 }} numberOfLines={2}>{detail}</Text>}
          </View>
        </View>
        {onDismiss && (
          <Pressable onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={15} color={solid ? '#fff' : colors.textTertiary} />
          </Pressable>
        )}
      </Wrapper>
      {children}
    </View>
  );
}

// ─── Live Pick-up Radar row — was PickupRadarStatus (hubComponents.tsx) ────
// Not dismissible — it reflects a trip that's actually in progress right
// now, not a stale notification; it disappears on its own once the trip
// ends (activeTrips no longer includes it), same as before.
function NeedsYouTripRow({ colors, isDark, activeTrip }: {
  colors: any; isDark: boolean;
  activeTrip: { kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; etaMinutes: number; startedAtMs?: number };
}) {
  const elapsedMin = activeTrip.startedAtMs ? (Date.now() - activeTrip.startedAtMs) / 60_000 : 0;
  const isOverdue = elapsedMin - activeTrip.etaMinutes >= 5;
  const activeColor = isOverdue ? colors.danger : MONEY_GREEN;

  return (
    <NeedsYouRow
      Icon={Navigation} accent={activeColor} colors={colors} isDark={isDark}
      title={`${activeTrip.driverName} picking up ${activeTrip.kidName}`}
      detail={isOverdue ? 'Running behind — trip is still on the way' : 'En route now'}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 18 }}>{activeTrip.driverEmoji ?? '🚗'}</Text>
        <MapPin size={12} color={activeColor} />
        <Text style={{ fontSize: 18 }}>{activeTrip.kidEmoji ?? '🧒'}</Text>
      </View>
    </NeedsYouRow>
  );
}

// ─── Confirmed-ride row — was KidRideBanner.tsx ────────────────────────────
function rideState(rideCountdown: number, confirmed: boolean) {
  if (confirmed) return 'confirmed' as const;
  if (rideCountdown > 15) return 'counting' as const;
  if (rideCountdown > -2) return 'here' as const;
  if (rideCountdown > -30) return 'overdue' as const;
  return 'stale' as const;
}

function NeedsYouRideRow({ ev, rideCountdown, colors, isDark, active, members, onConfirmPickup, onDismiss, onSendDriverLate, lateNudgeSent, conflictReason, driverDispatched }: {
  ev: FamilyEvent; rideCountdown: number; colors: any; isDark: boolean;
  active: FamilyMember; members: FamilyMember[];
  onConfirmPickup: (ev: FamilyEvent) => void;
  onDismiss: (evId: string) => void;
  onSendDriverLate?: (ev: FamilyEvent) => void;
  lateNudgeSent?: Record<string, boolean>;
  // Same assignee-double-booked signal ParentView shows a parent — the
  // kid's driver is also assigned to a different event around the same
  // time. Purely informational here (no reassign action — that's a
  // parent-only decision), just so the kid isn't blindsided if the ride
  // ends up late/needs a swap.
  conflictReason?: string;
  // Real Pick-up Radar signal (an active, undispatched-yet trip exists
  // for this ride's driver), not just the scheduled clock — same
  // master-flow-audit fix as KidRideBanner.tsx's own driverDispatched
  // prop (Teen/Senior use that component directly; this row duplicates
  // its state machine for Kid, so needs the signal passed in separately).
  driverDispatched?: boolean;
}) {
  const confirmed = !!ev.pickupConfirmedAt;
  const state = rideState(rideCountdown, confirmed);
  if (state === 'stale' && !confirmed) return null; // nothing left to say, no dismiss needed — it's just gone

  const rideHere   = state === 'here';
  // A genuinely dispatched driver is never "overdue" — they're actively
  // en route, a materially less alarming situation than the clock alone
  // passing with nobody having said anything.
  const isOverdue  = state === 'overdue' && !driverDispatched;
  const onTheWay   = !!driverDispatched && !confirmed && !rideHere;

  const Icon = confirmed ? Check : isOverdue ? AlertTriangle : (rideHere || onTheWay) ? PartyPopper : Car;
  const accent = confirmed ? MONEY_GREEN : isOverdue ? colors.danger : MONEY_GREEN;
  const tone: 'flat' | 'solid' = (isOverdue || rideHere) ? 'solid' : 'flat';

  const driverFirst = driverLabelByName(eventAssignee(ev).name, members);
  const headline = confirmed
    ? `Pickup confirmed — you're all set`
    : isOverdue
      ? `${driverFirst ?? 'Your ride'} hasn't arrived yet`
      : onTheWay
        ? `${driverFirst ?? 'Your ride'} is on the way!`
      : rideHere
        ? `${driverFirst ?? 'Your ride'} is HERE!`
        : rideCountdown <= 15
          ? `${driverFirst ?? 'Your ride'} arrives in ${rideCountdown} min!`
          : rideCountdown < 60
            ? `${driverFirst ?? 'Your ride'} picks you up in ${rideCountdown}m`
            : `${driverFirst ?? 'Your ride'} picks you up at ${fmtTime(ev.time)}`;

  const alertSent = !!lateNudgeSent?.[ev.id];

  return (
    <NeedsYouRow
      Icon={Icon} accent={accent} colors={colors} isDark={isDark} tone={tone}
      title={headline} detail={`${ev.title} · ${fmtTime(ev.time)}`}
      // Always dismissible — this is meant to be a temporary "heads up"
      // banner, not a fixture sitting on screen for hours until the ride
      // is overdue. Dismissal is per-item and DB-backed
      // (dismissedHubItemsStore), so dismissing an early reminder doesn't
      // lose anything — the ride itself is still on Timeline/Schedule.
      onDismiss={() => { onDismiss(ev.id); }}
    >
      {!confirmed && conflictReason && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <AlertTriangle size={12} color={tone === 'solid' ? '#fff' : colors.danger} />
          <Text style={{ fontSize: KID.sub, fontWeight: '800', color: tone === 'solid' ? '#fff' : colors.danger }}>
            {conflictReason}
          </Text>
        </View>
      )}
      {!confirmed && (rideHere || isOverdue || onTheWay) && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => { onConfirmPickup(ev); }}
            style={{ flex: 1, backgroundColor: tone === 'solid' ? 'rgba(255,255,255,0.9)' : MONEY_GREEN, borderRadius: 12, paddingVertical: 9, alignItems: 'center' }}>
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: tone === 'solid' ? accent : '#fff' }}>I'm picked up</Text>
          </Pressable>
          {onSendDriverLate && (
            <Pressable onPress={() => { onSendDriverLate(ev); }}
              style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: tone === 'solid' ? 'rgba(255,255,255,0.6)' : accent + '60', borderRadius: 12, paddingVertical: 9, alignItems: 'center', opacity: alertSent ? 0.7 : 1 }}>
              <Text style={{ fontSize: KID.sub, fontWeight: '900', color: tone === 'solid' ? '#fff' : accent }}>{alertSent ? 'Sent ✓' : 'Alert my parent'}</Text>
            </Pressable>
          )}
        </View>
      )}
    </NeedsYouRow>
  );
}

// ─── Main merged section ────────────────────────────────────────────────────
// Merges what were 4 separate conditionally-rendered pieces (KidUrgentAlerts,
// KidRideBanner, AwaitingDriverBanner, PickupRadarStatus) into ONE "Needs
// You" list — every entry here is fundamentally "something needs the kid's
// attention," just triggered by a different condition. Renders nothing (no
// empty state / no header) when there's nothing to show, so it never takes
// up space on a quiet day.
export function KidNeedsYouSection({
  declinedRides, pendingRides, declinedQuests, approvedQuests, cheersForMe, recentReplies,
  confirmedRide, rideCountdown, confirmedRideConflict, confirmedRideDispatched, awaitingDriverRide, activeTrips,
  active, members, colors, isDark, dismissedIds, onDismiss,
  onConfirmPickup, onSendDriverLate, lateNudgeSent, onOpenHistory,
  hasChoresCard,
}: {
  declinedRides: FamilyEvent[]; pendingRides: FamilyEvent[];
  declinedQuests: Quest[]; approvedQuests: Quest[];
  cheersForMe: { quest: Quest; cheer: QuestCheer }[];
  recentReplies: any[];
  confirmedRide: FamilyEvent | undefined; rideCountdown: number | null;
  // Assignee-double-booked reason (e.g. "Priya assigned to 2 events") if
  // confirmedRide's driver is also on another event around the same time
  // — see detectAssigneeConflicts.ts, shared with ParentView's own
  // conflict detection.
  confirmedRideConflict?: string;
  // Real Pick-up Radar signal — see NeedsYouRideRow's own doc comment.
  confirmedRideDispatched?: boolean;
  awaitingDriverRide: FamilyEvent | undefined;
  activeTrips?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number }[];
  members: FamilyMember[]; active: FamilyMember; colors: any; isDark: boolean;
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
  onConfirmPickup: (ev: FamilyEvent) => void;
  onSendDriverLate: (ev: FamilyEvent) => void;
  lateNudgeSent: Record<string, boolean>;
  // Opens My Chores' own history/done tab — surfaced only in the empty
  // state below, once there's genuinely nothing left requiring action
  // [live-requested: "we can make the show history link in the empty
  // component"].
  onOpenHistory?: () => void;
  // True when KidChoresNeedsYouCard (rendered just above this section) is
  // already showing its own NEEDS YOU card — in that case this section's
  // "Nothing needs you right now · Show history" empty-state link must
  // stay hidden instead of appearing directly under an already-visible
  // NEEDS YOU card, which read as contradictory
  // ["ther is empty component for needs you when there is already acard"].
  hasChoresCard?: boolean;
}) {
  const filteredDeclinedRides = declinedRides.filter(ev => !dismissedIds.has(`ride-${ev.id}`));
  const filteredPendingRides  = pendingRides.filter(ev => !dismissedIds.has(`pending-${ev.id}`));
  // Declined/approved chores are NOT rendered as their own rows here
  // anymore — KidChoresNeedsYouCard (the compact chores card higher up on
  // the Hub) already surfaces "Chore sent back" as its headline the moment
  // nothing else is more urgent, and now counts declined chores into its
  // own To Do total too. Showing the same status again as a second,
  // separately-dismissible row here was pure duplication of the same fact
  // [live direction: "show what actually need to to the kids without
  // overwheming the hub"]. filteredApprovedQuests is kept ONLY to drive the
  // one-time celebration trigger below (a chore getting approved is worth
  // one confetti burst, not a lingering card) — it is deliberately never
  // rendered as a row.
  const filteredApprovedQuests = approvedQuests.filter(q => !dismissedIds.has(`quest-approved-${q.id}`));
  const filteredCheersForMe = cheersForMe.filter(({ quest, cheer }) => !dismissedIds.has(`cheer-${quest.id}-${cheer.memberId}`));

  // Full-screen celebration (same one Parent's chore-approval flow uses —
  // GlobalCelebration, mounted once at HubScreen's root) instead of the old
  // small in-row confetti burst, which looked cramped/"dumping" confined to
  // a single list row. Fires once per genuinely congratulatory item the kid
  // hasn't already seen: a cheer landing, a chore/quest getting approved,
  // or a permission request getting approved (declines/other reply types
  // don't celebrate — nothing to celebrate there).
  //
  // celebratedKeys alone used to be the ONLY guard — an in-memory ref that
  // resets to empty on every fresh mount (app relaunch, or re-entering
  // this profile), so anything still un-dismissed replayed its
  // celebration every single time, even with nothing new to celebrate
  // (live-reported: "even there is no latest approvals or good news then
  // animation still playing"). Fixed with a real watermark:
  // active.lastCelebrationSeenAt, persisted to members — only an item
  // whose own timestamp (approvedAt/cheer.at/respondedAt) is NEWER than
  // the watermark celebrates; anything older is treated as already seen
  // regardless of dismiss state. celebratedKeys stays as the within-
  // session guard (avoids a double-trigger from a re-render before the
  // watermark write round-trips), the watermark is what survives a
  // restart.
  const celebratedKeys = useRef<Set<string>>(new Set());
  const approvedPermissionReplies = recentReplies.filter(r => r.status === 'approved' && r.type === 'permission');
  const seenWatermark = active.lastCelebrationSeenAt ? parseDbTime(active.lastCelebrationSeenAt).getTime() : 0;
  useEffect(() => {
    const freshItems = [
      ...filteredCheersForMe.map(({ quest, cheer }) => ({ key: `cheer-${quest.id}-${cheer.memberId}`, at: cheer.at })),
      ...filteredApprovedQuests.map(q => ({ key: `quest-approved-${q.id}`, at: q.approvedAt })),
      ...approvedPermissionReplies.map(r => ({ key: `reply-${r.id}`, at: r.respondedAt })),
    ];
    let played = false;
    for (const { key, at } of freshItems) {
      if (celebratedKeys.current.has(key)) continue;
      // Postgres sends timestamps as "2026-08-24 19:53:09.967932+00" (space
      // separator, 2-digit UTC offset) — new Date() on React Native's JS
      // engine returns NaN for that exact shape. NaN <= anything is always
      // false in JS, so the "already seen" skip below silently never fired
      // for ANY item with this timestamp shape — confirmed live, itemMs=NaN
      // on every single quest-approved item, which is why the watermark
      // fix never actually stopped the replay. parseDbTime (lib/dates.ts)
      // is this codebase's existing, already-correct normalizer for
      // exactly this shape — use it instead of trusting the raw string.
      const itemMs = at ? parseDbTime(at).getTime() : 0;
      const validItemMs = Number.isFinite(itemMs) ? itemMs : 0;
      if (validItemMs <= seenWatermark) continue; // already seen in an earlier session, even if never dismissed
      celebratedKeys.current.add(key);
      useCelebrationStore.getState().trigger();
      played = true;
    }
    if (played) {
      const nowIso = new Date().toISOString();
      useFamilyStore.getState().updateMember(active.id, { lastCelebrationSeenAt: nowIso })
        .catch(e => console.warn('[KidNeedsYouSection] update lastCelebrationSeenAt failed', e));
    }
  }, [
    filteredCheersForMe.map(({ quest, cheer }) => `${quest.id}-${cheer.memberId}`).join(','),
    filteredApprovedQuests.map(q => q.id).join(','),
    approvedPermissionReplies.map(r => r.id).join(','),
    seenWatermark,
  ]);

  const showConfirmedRide = !!confirmedRide && rideCountdown !== null && rideCountdown > -180 && !dismissedIds.has(confirmedRide.id);
  const showAwaitingDriver = !confirmedRide && !!awaitingDriverRide && !dismissedIds.has(`awaiting-${awaitingDriverRide.id}`);

  // Cheers and replies (check-in/permission/medical/tutor/question answers)
  // are also resolved-already facts, same reasoning as declined/approved
  // chores above — confirmed via explicit user selection. Cheers still
  // drive the one-time celebration trigger above; replies don't render as
  // rows anymore either.
  const hasAnything = filteredDeclinedRides.length > 0 || filteredPendingRides.length > 0 ||
    showConfirmedRide || showAwaitingDriver || !!activeTrips?.length;

  // Nothing currently needs the kid's action — no NEEDS YOU card at all
  // (per the same "only where action is required" rule that dropped
  // chores/cheers/replies above), just a quiet text link down to past
  // activity instead of an empty card shell.
  if (!hasAnything) {
    if (!onOpenHistory || hasChoresCard) return null;
    return (
      <Pressable onPress={onOpenHistory} style={{ paddingHorizontal: 16, marginTop: 10, marginBottom: 10 }}>
        <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
          Nothing needs you right now · Show history
        </Text>
      </Pressable>
    );
  }

  // Sequential divider counter — every row past the first gets a hairline
  // above it, matching ParentView.tsx's `i > 0` divider pattern for its own
  // needsYouCards stack. A plain mutable counter (not array index) because
  // rows here come from several different conditionals/maps in sequence,
  // not one flat array.
  let rowIndex = 0;
  const Divider = () => {
    const show = rowIndex > 0;
    rowIndex++;
    return show ? <View style={{ height: 1, marginHorizontal: 12, backgroundColor: isDark ? colors.border : GEMINI.border, opacity: 0.6 }} /> : null;
  };

  return (
    // marginBottom bumped from 4 to 14 — these cards sat almost flush
    // against the action-tile row directly below (KidTodaySection),
    // reading as if they were part of the same group rather than two
    // distinct sections. Rebuilt to match ParentView.tsx's NEEDS YOU
    // rhythm: one shared bordered/shadowed outer card with divider lines
    // between rows, instead of each row being its own separate bordered
    // box [live-reported via screenshot: "see this needs you not exactly
    // same stucture as the parent?"]. Row components themselves
    // (NeedsYouRow/NeedsYouRideRow/NeedsYouTripRow) keep their own
    // dismiss/press/state-machine logic untouched.
    // No marginBottom — KidActionGrid right below always supplies its own
    // marginTop: 14, so adding a trailing margin here doubled the gap when
    // this section is actually visible (and when it's hidden/empty,
    // relying on ITS margin for the gap collapsed Quick Actions flush
    // against whatever's above it instead) ["see this Quick actions
    // stupid.. in teens view"].
    <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
      <KidSectionHeader label="NEEDS YOU" accent={colors.pink} colors={colors} />
      <View style={{
        borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
        borderRadius: 22, backgroundColor: colors.amberLight,
        ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow),
        overflow: 'hidden',
      }}>
      {showConfirmedRide && (
        <>
          <Divider />
          <NeedsYouRideRow
            ev={confirmedRide!} rideCountdown={rideCountdown!} colors={colors} isDark={isDark}
            active={active} members={members}
            onConfirmPickup={onConfirmPickup}
            onDismiss={(id) => onDismiss(id)}
            onSendDriverLate={onSendDriverLate} lateNudgeSent={lateNudgeSent}
            conflictReason={confirmedRideConflict}
            driverDispatched={confirmedRideDispatched}
          />
        </>
      )}

      {showAwaitingDriver && (() => {
        const driverFirst = eventAssignee(awaitingDriverRide!).name?.split(' ')[0] ?? 'Someone';
        return (
          <>
            <Divider />
            <NeedsYouRow
              Icon={UserCheck} accent={BRAND.purple} colors={colors} isDark={isDark}
              title={`${driverFirst} was asked to drive you`}
              detail={`${awaitingDriverRide!.title} · ${fmtTime(awaitingDriverRide!.time)} · waiting for ${driverFirst} to confirm`}
              onDismiss={() => { onDismiss(`awaiting-${awaitingDriverRide!.id}`); }}
            />
          </>
        );
      })()}

      {activeTrips?.map(trip => (
        <View key={trip.tripId}><Divider /><NeedsYouTripRow colors={colors} isDark={isDark} activeTrip={trip} /></View>
      ))}

      {filteredDeclinedRides.map(ev => (
        <View key={ev.id}><Divider />
          <NeedsYouRow Icon={Car} accent={colors.danger} colors={colors} isDark={isDark}
            title={`No driver — ${ev.title}`} statusLabel="Unassigned"
            detail={ev.declinedBy ? `${ev.declinedBy} can't make it` : 'Your parent is finding someone'}
            onDismiss={() => { onDismiss(`ride-${ev.id}`); }} />
        </View>
      ))}

      {filteredPendingRides.map(ev => {
        const h = hoursUntilEvent(ev.date, ev.time);
        const isUrgent = h >= 0 && h < 2;
        return (
          <View key={ev.id}><Divider />
            <NeedsYouRow Icon={isUrgent ? AlertTriangle : Clock} accent={isUrgent ? colors.danger : BRAND.amber} colors={colors} isDark={isDark}
              title={isUrgent ? 'Still no driver — getting close!' : 'Waiting on driver…'} statusLabel="Pending"
              detail={`${ev.title} · ${fmtTime(ev.time)}`}
              onDismiss={() => { onDismiss(`pending-${ev.id}`); }} />
          </View>
        );
      })}

      {/* Declined/approved chores, cheers, and replies no longer render
          as rows here — see the filteredApprovedQuests comment above for
          why. KidChoresNeedsYouCard covers chore status; cheers/replies
          are resolved-already facts the kid has already seen the result
          of (cheer landed, question answered) and don't need a second
          dismissible card competing for attention on the Hub. */}
      </View>
    </View>
  );
}
