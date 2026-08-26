import { View, Text, Pressable } from 'react-native';
import { Sparkles, Footprints, Home, Backpack, AlertOctagon } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { SectionCard } from '../hubComponents';
import { decodeRideLate, SUPPLIES_PREFIX } from '../KidModals';
import { hoursUntilEvent } from '../hubUtils';
import { InlineReplyCard } from './InlineReplyCard';
import { RideRequestCard } from './RideRequestCard';
import { RideRequiredEventCard } from './RideRequiredEventCard';
import { QuestApprovalCard } from './QuestApprovalCard';
import { RideLateAlertCard } from './RideLateAlertCard';
import { ServiceRequestCard } from './ServiceRequestCard';
import { GroceryRequestCard } from './GroceryRequestCard';
import { QuestProposalCard } from './QuestProposalCard';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { Quest } from '@/store/questStore';
import { dedupeRideSeries } from '../lib/dedupeRideSeries';

// Money-green — "grocery request" accent, distinct from brand teal used
// elsewhere for confirmed/assigned state. Not colors.success (which IS
// brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';
// Indigo — "school supplies" accent, distinct from brand purple; kept as
// one local constant instead of a repeated bare hex.
const INDIGO_ACCENT = '#6366F1';

// ─── Priority ranking ───────────────────────────────────────────────────────
// A parent glances at this list for seconds between tasks — it has to read
// urgency at a glance, not just "is it in this bucket." Each entry gets a
// numeric score (higher = more urgent) so a stranded kid always beats a
// routine grocery approval, regardless of insertion order. Ties break by
// oldest-first (whoever has been waiting longest surfaces first).
const SEVERITY = { emergency: 4, urgent: 3, soon: 2, normal: 1 } as const;
type Severity = keyof typeof SEVERITY;

function severityColor(s: Severity, colors: any): string {
  if (s === 'emergency') return colors.danger;
  if (s === 'urgent') return colors.danger;
  if (s === 'soon') return colors.warning;
  return colors.textTertiary;
}

type RankedItem = { key: string; score: number; severity: Severity; age: number; node: React.ReactNode };

// A colored rail on the leading edge of each card makes urgency legible at a
// glance while scrolling — without it, the sort order is invisible and the
// list reads the same as before, just silently reshuffled.
function UrgencyRail({ severity, colors, children }: { severity: Severity; colors: any; children: React.ReactNode }) {
  if (severity === 'normal') return <>{children}</>;
  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ width: 3, borderRadius: 2, marginRight: 8, backgroundColor: severityColor(severity, colors) }} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

// A pending check-in ("I'm home" / "running late") — an acknowledgment, not
// an approval, so it's a single tap-and-done row rather than a full card.
function CheckinRow({ req, kidName, colors, isDark, active, approveRequest }: {
  req: any; kidName: string; colors: any; isDark: boolean; active: FamilyMember;
  approveRequest: (id: string, by: string) => void;
}) {
  const CheckinIcon = req.detail.includes('late') || req.detail.includes('Late') ? Footprints
    : req.detail.includes('home') || req.detail.includes('Home') ? Home : Backpack;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: isDark ? '#1e293b' : '#F0FDF4', borderRadius: 14, padding: 12,
      borderLeftWidth: 3, borderLeftColor: colors.parent }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.parent + '20', alignItems: 'center', justifyContent: 'center' }}>
        <CheckinIcon size={17} color={colors.parent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.parent }}>{kidName}</Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }} numberOfLines={2}>{req.detail}</Text>
      </View>
      <Pressable onPress={() => approveRequest(req.id, active.id)}
        style={{ backgroundColor: colors.parent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Got it</Text>
      </Pressable>
    </View>
  );
}

export function ActionNeededSection({
  actionCount, pendingRequests, pendingRideRequiredEvents, awaitingApproval, pendingKidRequests, events,
  active, members, allNames, colors, isDark,
  updateEvent, addEvent, updateEventScoped, approveQuest, declineQuest,
  approveRequest, declineRequest, toggleGPWelcome, approveItemsAndSync, rejectItems,
  approveQuestProposal, declineQuestProposal,
}: {
  actionCount: number;
  pendingRequests: FamilyEvent[];
  pendingRideRequiredEvents?: FamilyEvent[];
  awaitingApproval: Quest[];
  pendingKidRequests: any[];
  events: FamilyEvent[];
  active: FamilyMember; members: FamilyMember[]; allNames: string[];
  colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  addEvent: (ev: Omit<FamilyEvent, 'id'>) => string;
  updateEventScoped?: (id: string, patch: Partial<FamilyEvent>, scope: 'this' | 'following' | 'all') => void;
  approveQuest: (id: string, by: string) => void;
  declineQuest: (id: string, by: string, reason: string) => void;
  approveRequest: (id: string, by: string, note?: string) => void;
  declineRequest: (id: string, by: string, note?: string) => void;
  toggleGPWelcome: (id: string, open: boolean) => void;
  approveItemsAndSync: (reqId: string, itemIds: string[], isSupplies: boolean) => void;
  rejectItems: (reqId: string, itemIds: string[], by: string) => void;
  // Scenario 1.4 — approving a quest_proposal request must ALSO create the
  // live quest (choreStore.addChore), not just flip the request's status
  // the way every other request type's approve action does. Kept as its
  // own callback rather than overloading approveRequest so the "create a
  // real chore row" side-effect lives in one obvious place (ParentView).
  approveQuestProposal?: (req: any, finalCoins: number) => void;
  declineQuestProposal?: (req: any, reason?: string) => void;
}) {
  if (actionCount === 0) return null;

  const ranked: RankedItem[] = [];
  const ageMinutes = (iso: string | undefined) => iso ? (Date.now() - new Date(iso).getTime()) / 60000 : 0;

  // Ride requests: a driver hasn't been assigned yet. Severity climbs as the
  // event approaches — same "how much runway is left" logic AlertBanner
  // already uses elsewhere in ParentView, applied here per-card.
  //
  // A recurring ride series (e.g. "Pickup from chess club" every Mon/Wed/Fri)
  // previously materialized every future occurrence with no driver, and
  // EACH ONE showed up here as its own separate unassigned-ride card —
  // 12 weeks out meant a dozen near-identical cards demanding the same
  // decision over and over. Now only the single soonest occurrence per
  // series surfaces; RideRequestCard's own assignment actions use
  // updateEventScoped('following') to carry the chosen driver forward to
  // every later occurrence in the same series, so deciding once is enough.
  // Was hardcoded severity:'soon' regardless of how close the ride
  // actually was — a still-unconfirmed ride 15 minutes out ranked
  // identically to one 3 days out, with no escalation as the deadline
  // approached (unlike the age-based question/permission escalation right
  // below, or ParentView's own <1hr/<2hr/<4hr urgency banners). Mirrors
  // those same thresholds: <1hr with nobody driving is 'urgent', <4hr is
  // 'soon' escalated by score only (stays visually 'soon' but sorts above
  // a plain 'soon' card), otherwise 'normal'.
  const rideSeverity = (ev: FamilyEvent): { severity: Severity; score: number } => {
    const h = hoursUntilEvent(ev.date, ev.time);
    if (h < 0) return { severity: 'normal', score: SEVERITY.normal };
    if (h < 1) return { severity: 'urgent', score: SEVERITY.urgent };
    if (h < 4) return { severity: 'soon', score: SEVERITY.soon + 0.5 };
    return { severity: 'normal', score: SEVERITY.normal };
  };

  const [dedupedPendingRequests, dedupedRideRequiredEvents] =
    dedupeRideSeries(pendingRequests, pendingRideRequiredEvents ?? []);
  for (const ev of dedupedPendingRequests) {
    const age = ageMinutes(ev.date ? `${ev.date}T${ev.time ?? '00:00'}` : undefined);
    const { severity, score } = rideSeverity(ev);
    ranked.push({
      key: `ride-${ev.id}`, age,
      severity, score,
      node: <RideRequestCard key={ev.id} ev={ev} active={active} members={members} colors={colors} isDark={isDark}
        updateEvent={updateEvent} addEvent={addEvent} updateEventScoped={updateEventScoped} />,
    });
  }

  // Non-Ride events with their own rideRequired flag (e.g. "Cricket match"
  // needing a driver) — same Action Needed surface, same series-dedup/
  // carry-forward treatment as a real Ride event now gets, instead of
  // being invisible here entirely and only ever showing up buried in the
  // day's Schedule/Agenda list.
  for (const ev of dedupedRideRequiredEvents) {
    const age = ageMinutes(ev.date ? `${ev.date}T${ev.time ?? '00:00'}` : undefined);
    const { severity, score } = rideSeverity(ev);
    ranked.push({
      key: `ride-required-${ev.id}`, age,
      severity, score,
      node: <RideRequiredEventCard key={ev.id} ev={ev} active={active} members={members} colors={colors} isDark={isDark}
        updateEvent={updateEvent} updateEventScoped={updateEventScoped} addEvent={addEvent} />,
    });
  }

  // Quest approvals: a kid finished work and is waiting to get paid — every
  // minute that sits unreviewed is a minute their reward is delayed.
  for (const q of awaitingApproval) {
    const age = ageMinutes((q as any).submittedAt);
    ranked.push({
      key: `quest-${q.id}`, age,
      severity: 'soon', score: SEVERITY.soon,
      node: <QuestApprovalCard key={q.id} q={q} active={active} members={members} allNames={allNames}
        colors={colors} isDark={isDark} approveQuest={approveQuest} declineQuest={declineQuest} />,
    });
  }

  for (const req of pendingKidRequests) {
    const kid = members.find(m => m.id === req.fromMemberId);
    const kidName = kid?.name.split(' ')[0] ?? 'Kid';
    const isSupplies   = req.detail.startsWith(SUPPLIES_PREFIX);
    const isCashOut    = req.type === 'delegation' && req.detail.startsWith('💵');
    const isVehicleIssue = req.type === 'emergency' && req.detail.startsWith('🚗');
    const isGrocery    = req.type === 'delegation' && !isSupplies && !isCashOut && (req.items?.length ?? 0) > 0;
    const isPermission = req.type === 'permission';
    const isQuestion   = req.type === 'question';
    const isMedical    = req.type === 'medication';
    const isCheckin    = req.type === 'checkin';
    const accent = isMedical ? colors.danger : isVehicleIssue ? colors.danger : isCashOut ? colors.warning : isGrocery ? MONEY_GREEN : isSupplies ? INDIGO_ACCENT : isPermission ? colors.warning : isQuestion ? colors.primary : colors.parent;
    const age = ageMinutes(req.requestedAt);

    // A reported vehicle issue (TeenView's "Report Vehicle Issue") also uses
    // type 'emergency' but isn't a ride-lateness report — routed to its own
    // plain approve/decline card via InlineReplyCard below instead of the
    // "My driver hasn't arrived" framing, which only fits a real late ride.
    if (isVehicleIssue) {
      ranked.push({
        key: `req-${req.id}`, age,
        severity: 'urgent', score: SEVERITY.urgent,
        node: <InlineReplyCard key={req.id} req={req} kidName={kidName}
          isPermission={false} isQuestion={false} isMedical={false}
          accent={accent} colors={colors} isDark={isDark}
          onApprove={(reply) => approveRequest(req.id, active.id, reply || undefined)}
          onDecline={(reply) => declineRequest(req.id, active.id, reply || undefined)} />,
      });
      continue;
    }

    // "My driver hasn't arrived" — a stranded kid, not an approval. Always top severity.
    const rideLate = decodeRideLate(req.detail);
    if (rideLate) {
      const ev = events.find(e => e.id === rideLate.eventId);
      ranked.push({
        key: `req-${req.id}`, age,
        severity: 'emergency', score: SEVERITY.emergency + age / 1000,
        node: <RideLateAlertCard key={req.id} req={req} rideLate={rideLate} kidName={kidName} ev={ev}
          active={active} colors={colors} isDark={isDark}
          approveRequest={approveRequest} updateEvent={updateEvent} />,
      });
      continue;
    }

    if (isCheckin) {
      ranked.push({
        key: `req-${req.id}`, age,
        severity: 'normal', score: SEVERITY.normal,
        node: <CheckinRow key={req.id} req={req} kidName={kidName} colors={colors} isDark={isDark} active={active} approveRequest={approveRequest} />,
      });
      continue;
    }

    if (isMedical) {
      ranked.push({
        key: `req-${req.id}`, age,
        severity: 'urgent', score: SEVERITY.urgent,
        node: <InlineReplyCard key={req.id} req={req} kidName={kidName}
          isPermission={false} isQuestion={false} isMedical
          accent={accent} colors={colors} isDark={isDark}
          onApprove={(reply) => approveRequest(req.id, active.id, reply || undefined)}
          onDecline={(reply) => declineRequest(req.id, active.id, reply || undefined)} />,
      });
      continue;
    }

    if (req.type === 'ride' || req.type === 'tutor' || req.type === 'cheer') {
      ranked.push({
        key: `req-${req.id}`, age,
        severity: 'soon', score: SEVERITY.soon,
        node: <ServiceRequestCard key={req.id} req={req} kidName={kidName} active={active} colors={colors} isDark={isDark}
          approveRequest={approveRequest} declineRequest={declineRequest} toggleGPWelcome={toggleGPWelcome} />,
      });
      continue;
    }

    if (isQuestion || isPermission) {
      // A question/permission a kid is blocked on gets more urgent the
      // longer it sits — 30+ min unanswered escalates from "soon" to "urgent".
      const sev: Severity = age > 30 ? 'urgent' : 'soon';
      ranked.push({
        key: `req-${req.id}`, age,
        severity: sev, score: SEVERITY[sev],
        node: <InlineReplyCard key={req.id} req={req} kidName={kidName}
          isPermission={isPermission} isQuestion={isQuestion} isMedical={false}
          accent={accent} colors={colors} isDark={isDark}
          onApprove={(reply) => approveRequest(req.id, active.id, reply || undefined)}
          onDecline={(reply) => declineRequest(req.id, active.id, reply || undefined)} />,
      });
      continue;
    }

    if (req.type === 'quest_proposal') {
      // A pending quest idea isn't blocking anyone — same "soon," not
      // "urgent," tier as a routine ride/tutor/cheer service request.
      ranked.push({
        key: `req-${req.id}`, age,
        severity: 'soon', score: SEVERITY.soon,
        node: <QuestProposalCard key={req.id} req={req} kidName={kidName} active={active} colors={colors} isDark={isDark}
          onApprove={(finalCoins) => approveQuestProposal?.(req, finalCoins)}
          onDecline={(reason) => declineQuestProposal?.(req, reason)} />,
      });
      continue;
    }

    if (isCashOut) {
      // Teen's cash-out request — plain approve/decline, no item picker
      // (it has no items[], only a free-text amount/method — see
      // TeenView's requestCashOut). Never rendered before this fix; the
      // old delegation-with-zero-items filter dropped it before it ever
      // reached this feed at all.
      ranked.push({
        key: `req-${req.id}`, age,
        severity: 'soon', score: SEVERITY.soon,
        node: <InlineReplyCard key={req.id} req={req} kidName={kidName}
          isPermission={false} isQuestion={false} isMedical={false}
          accent={accent} colors={colors} isDark={isDark}
          onApprove={(reply) => approveRequest(req.id, active.id, reply || undefined)}
          onDecline={(reply) => declineRequest(req.id, active.id, reply || undefined)} />,
      });
      continue;
    }

    // Grocery/supplies — nobody is blocked waiting, lowest urgency tier.
    ranked.push({
      key: `req-${req.id}`, age,
      severity: 'normal', score: SEVERITY.normal,
      node: <GroceryRequestCard key={req.id} req={req} kidName={kidName} isGrocery={isGrocery} isSupplies={isSupplies}
        accent={accent} active={active} colors={colors} isDark={isDark}
        approveItemsAndSync={approveItemsAndSync} rejectItems={rejectItems}
        approveRequest={approveRequest} declineRequest={declineRequest} />,
    });
  }

  // Highest severity first; within a tier, whoever has waited longest surfaces first.
  ranked.sort((a, b) => b.score - a.score || b.age - a.age);
  const topSeverity = ranked[0]?.severity ?? 'normal';

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        icon={topSeverity === 'emergency' ? <AlertOctagon size={16} color={colors.danger} /> : <Sparkles size={16} color={colors.danger} />}
        title="Action Needed" accent={colors.danger} badge={actionCount}
        badgeLabel="Pending" badgeColor={colors.danger}
        collapsible defaultExpanded
        colors={colors} isDark={isDark}>
        <View style={{ gap: 10 }}>
          {ranked.map(item => (
            <UrgencyRail key={item.key} severity={item.severity} colors={colors}>
              {item.node}
            </UrgencyRail>
          ))}
        </View>
      </SectionCard>
    </View>
  );
}
