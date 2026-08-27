/**
 * cantMakeIt — one "reason + what happens next" vocabulary for the CHORE
 * side of "can't make it" (features/quests/components/QuestCard.tsx's
 * onCantMakeIt, wired into both the Tasks tab and Hub's KidView/TeenView).
 *
 * The EVENT side deliberately does NOT route through here: hubComponents.tsx's
 * EventDetailSheet already implements a more complete flow than this
 * module's event branch offers (a staged "Can't Make It" → named-driver-chip
 * picker → open-to-pool sequence that avoids writing 'rejected' to the DB
 * until a replacement search actually fails, so no other device briefly
 * sees a bare decline flash by). Since EventDetailSheet is already shared
 * between CalendarScreen and every Hub role view, events already meet the
 * "one action surface" goal without this sheet. The event branch below is
 * kept as a plainer building block for any FUTURE event entry point that
 * doesn't have EventDetailSheet's context (e.g. a from-scratch card that
 * only has an id and a reason, no staged-write requirement) — not currently
 * called by anything.
 *
 * Deliberately thin: every branch below delegates to an existing store
 * action rather than re-deriving logic. choreStore.declineChoreAssignment
 * already centralizes the chore-side 3-way dispatch (GP quest / team-clone
 * / plain chore); the event-side "reopen to pool" mirrors the exact fields
 * RideLateAlertCard.tsx's own "Ask someone else to go" button already sets.
 *
 * Two-Bounce adult delegation (parent_quest_assignments / PushbackSheet)
 * is intentionally NOT covered here — SNOOZE/BLOCKER/TRADE/DISCUSS/
 * bounceCount/isLocked are a genuinely different negotiation model that
 * would lose meaning flattened into this simpler reason-based flow.
 */
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';

export type CantMakeItItem =
  | { kind: 'chore'; item: ChoreTask }
  | { kind: 'event'; item: FamilyEvent };

export type CantMakeItOutcome = 'pool' | 'reassign' | 'later' | 'cancel';

export function resolveCantMakeIt(
  target: CantMakeItItem,
  outcome: CantMakeItOutcome,
  reason: string,
  byMemberId: string,
  opts?: { reassignToMemberId?: string; reassignToMemberName?: string; laterDate?: string; laterTime?: string },
): void | Promise<boolean> {
  if (target.kind === 'chore') {
    const { item } = target;
    switch (outcome) {
      case 'pool':
        useChoreStore.getState().declineChoreAssignment(item.id, byMemberId, reason);
        return;
      case 'reassign':
        if (!opts?.reassignToMemberId) return;
        // Named handoff, not a blind immediate reassignment — the receiver
        // gets a real Accept ("I've got it") / Pass-again ("can't either —
        // put it back") choice via offerChoreHandoff (offer_chore_handoff/
        // accept_chore_handoff/decline_chore_handoff RPCs). This used to
        // call reassign_chore directly, which sets assigned_to_id
        // immediately — the chore just appeared live on the receiver's
        // screen with zero say in it, the exact "blind repost" the
        // master-flow spec calls out as wrong for this specific outcome.
        useChoreStore.getState().offerChoreHandoff(item.id, opts.reassignToMemberId, byMemberId, reason);
        return;
      case 'later':
        // A counter-offer awaiting a parent's Approve/Decline, not a
        // silent self-service reschedule — CantMakeItSheet's own copy
        // ("Goes back to a parent to re-time") previously didn't match
        // what this actually did (an immediate, unconditional dueDate
        // rewrite). proposeLaterDate/approveLaterDate/declineLaterDate
        // leave dueDate untouched until a parent actually approves it.
        if (!opts?.laterDate) return;
        useChoreStore.getState().proposeLaterDate(item.id, byMemberId, opts.laterDate, reason);
        return;
      case 'cancel':
        // Only the creator or a parent may cancel outright (master-flow
        // spec) — enforced server-side by cancel_chore, not trusted from
        // client role state. Returns a promise so the sheet can wait for
        // the real answer before showing "Cancelled" and closing.
        return useChoreStore.getState().cancelChore(item.id, byMemberId);
    }
    return;
  }

  const { item } = target;
  switch (outcome) {
    case 'pool':
      // Mirrors RideLateAlertCard.tsx's existing "Ask someone else to go"
      // reopen — same three fields, same reasoning (a stranded helper's
      // slot needs to go back to whoever else is eligible, not just sit
      // rejected).
      useEventStore.getState().updateEvent(item.id, {
        isOpenToGrandparents: true, isOpenToTeens: true, helperStatus: undefined, driverStatus: undefined,
      });
      return;
    case 'reassign':
      if (!opts?.reassignToMemberName) return;
      useEventStore.getState().updateEvent(item.id, {
        helper: opts.reassignToMemberName, helperStatus: 'pending',
      });
      return;
    case 'later':
      useEventStore.getState().updateEvent(item.id, {
        ...(opts?.laterDate ? { date: opts.laterDate } : {}),
        ...(opts?.laterTime ? { time: opts.laterTime } : {}),
        helperStatus: 'pending',
      });
      return;
    case 'cancel':
      useEventStore.getState().deleteEvent(item.id);
      return;
  }
}
