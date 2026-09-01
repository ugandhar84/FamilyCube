import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Medal, HeartPulse, BookOpen, Car, Calendar, Clock, CheckCircle2, Repeat, StickyNote } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import { deriveEventActions } from '@/features/tasks/lib/deriveCardActions';
import { fmtDate, fmtTime } from '@/lib/dates';

// Confirmed-green — "confirmed" status accent, distinct from brand teal
// used elsewhere in this card. Not colors.success (which IS brand teal in
// this app) — kept as one local constant.
const CONFIRMED_GREEN = '#22c55e';
// Pending-amber — a warmer amber than BRAND.amber, used only for the small
// "Pending" status badge/icon pairing with CONFIRMED_GREEN; kept as one
// local constant instead of a repeated bare hex.
const PENDING_AMBER = '#D97706';

// A calendar event where this parent is the driver/helper and hasn't
// confirmed yet — take it over from a co-parent, or confirm your own slot.
export function HelperEventCard({ ev, members, active, colors, isDark, updateEvent, updateEventScoped }: {
  ev: FamilyEvent; members: FamilyMember[]; active: FamilyMember; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => Promise<void>;
  // Optional so any call site that hasn't been updated still compiles —
  // when omitted, both actions below just fall back to a single-row update.
  updateEventScoped?: (id: string, patch: Partial<FamilyEvent>, scope: 'this' | 'following' | 'all') => void;
}) {
  const CatIcon = ev.category === 'Sports' ? Medal : ev.category === 'Medical' ? HeartPulse : ev.category === 'Study' ? BookOpen : ev.category === 'Ride' ? Car : Calendar;
  const kidName = members.find(m => m.id === ev.memberId)?.name.split(' ')[0] ?? '';
  const [notesExpanded, setNotesExpanded] = useState(false);
  // Button-visibility now comes from the same shared derivation
  // EventDetailSheet already used (the canonical shared event-action
  // surface) instead of this card's own hand-rolled ev.helper===active.name
  // checks — closes the drift class documented below (a past hand-rolled
  // "Can't" here bypassed the canonical decline path entirely).
  // assigneeRole (which field-pair this event's assignee lives in) now
  // comes straight from deriveEventActions instead of being re-derived
  // locally — previously this card hardcoded 'helper' on every write
  // regardless of which pair was actually populated, so a driver-paired
  // event (Ride category, or rideRequired) got a second, independently-
  // tracked helper_* pair written alongside its real driver_* pair — the
  // exact conflicting-data bug this whole redesign exists to fix.
  const { showAssignToMe, showConfirm, showCantMakeIt, assignee, assigneeRole } = deriveEventActions(
    ev,
    { id: active.id, name: active.name, role: active.role, hasCar: active.hasCar },
  );

  return (
    <View style={{ borderRadius: 14, borderWidth: 1,
      borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderLeftWidth: 3, borderLeftColor: colors.parent,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
      padding: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CatIcon size={15} color={colors.parent} />
        <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: assignee.status === 'confirmed' ? `${CONFIRMED_GREEN}20` : colors.warning + '20',
          borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          {assignee.status === 'confirmed' ? <CheckCircle2 size={10} color={CONFIRMED_GREEN} /> : <Clock size={10} color={PENDING_AMBER} />}
          <Text style={{ fontSize: TYPO.micro, fontWeight: '700',
            color: assignee.status === 'confirmed' ? CONFIRMED_GREEN : PENDING_AMBER }}>
            {assignee.status === 'confirmed' ? 'Confirmed' : 'Pending'}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginLeft: 24 }}>
        {fmtDate(ev.date)}{ev.time ? ` · ${fmtTime(ev.time)}` : ''}
        {kidName ? ` · for ${kidName}` : ''}
        {ev.pickupLocation ? ` · From: ${ev.pickupLocation}` : ''}
        {ev.dropLocation ? ` → ${ev.dropLocation}` : ev.location ? ` → ${ev.location}` : ''}
      </Text>
      {ev.notes ? (
        <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "${notesExpanded ? 'Collapse' : 'Expand'} notes" on "${ev.title}" (id=${ev.id}) [features/hub/parent/backlog/HelperEventCard.tsx:59]`); setNotesExpanded(v => !v); }}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginLeft: 24 }}>
          <StickyNote size={10} color={colors.textTertiary} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={notesExpanded ? undefined : 1}>
            {ev.notes}
          </Text>
        </Pressable>
      ) : null}
      {(assignee.status !== 'confirmed' || showCantMakeIt) && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginLeft: 24 }}>
          {showAssignToMe && assignee.status !== 'confirmed' && (
            <AnimatedPressable
              onPress={() => {
                console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Take Over" on "${ev.title}" from ${assignee.name} (id=${ev.id}) [features/hub/parent/backlog/HelperEventCard.tsx:72]`);
                Alert.alert(
                  'Take Over',
                  `Reassign this from ${assignee.name} to yourself?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: "Yes, I'll do it", onPress: () => {
                      console.log(`[UserAction] screen=Hub role=parent member=${active.name} confirmed "Take Over" on "${ev.title}" from ${assignee.name} (id=${ev.id}) → reassign_event(${assigneeRole}) [features/hub/parent/backlog/HelperEventCard.tsx:77]`);
                      // A one-off take-over ("I'll cover THIS one") is a
                      // direct reassign, authority-based (the parent tapping
                      // this already has the right to override) — the RPC
                      // writes the correct field pair (driver_* or helper_*)
                      // based on assigneeRole instead of always hardcoding
                      // helper_*, which is the exact bug that let a
                      // driver-paired event end up with a second,
                      // independently-tracked stale helper_* pair.
                      supabase.rpc('reassign_event', {
                        p_event_id: ev.id, p_new_member_id: active.id, p_role: assigneeRole, p_actor_id: active.id,
                      }).then(({ error }) => {
                        if (error) {
                          console.warn('[HelperEventCard] Take Over reassign_event failed', error.message);
                          showToast("Couldn't take over — please try again", 'error');
                          return;
                        }
                        // Same local-state gap as every other RPC call
                        // site in this file — DB write succeeds but the
                        // local Zustand copy never reflected it.
                        updateEvent(ev.id, assigneeRole === 'driver'
                          ? { driverName: active.name, driverId: active.id, driverStatus: 'confirmed' }
                          : { helper: active.name, helperId: active.id, helperStatus: 'confirmed' });
                        showToast('Taken over ✓');
                      });
                      const msg = `✅ ${active.name.split(' ')[0]} has taken over "${ev.title}" — you're off the hook.`;
                      useChatStore.getState().sendMessage('all', active.id, msg);
                    }},
                  ]
                );
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.parent + '20', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
                borderWidth: 1, borderColor: colors.parent + '40' }}>
              <Repeat size={12} color={colors.parent} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.parent }}>Take Over</Text>
            </AnimatedPressable>
          )}
          {(showConfirm || showCantMakeIt) && (
            <>
              {showConfirm && (
              <AnimatedPressable
                onPress={() => {
                  console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Confirm I'll do it" on "${ev.title}" (id=${ev.id}) → confirm_event_assignment(${assigneeRole}) [features/hub/parent/backlog/HelperEventCard.tsx:98]`);
                  // Confirming yourself as the already-named driver IS the
                  // "yes, I'm your driver going forward" moment — propagate
                  // to future occurrences, same as RideRequestCard's own
                  // "I'll Drive". Distinct from "Take Over" above, which is a
                  // one-time favor for just this occurrence.
                  //
                  // Was: confirm_event_assignment (single-event) then, on
                  // success, updateEventScoped(id, patch, 'following') to
                  // "propagate" — a real bug, not just a UX gap. updateEventScoped's
                  // bulk 'following' path writes to EVERY row in the series
                  // with no assignee filter at all (by design, for plain
                  // field edits — see its own comments) — so this would
                  // have force-confirmed occurrences reassigned to a
                  // DIFFERENT person partway through the series, not just
                  // your own. confirm_event_assignment_series_forward is a
                  // dedicated RPC that confirms the tapped occurrence, then
                  // sweeps forward through the SAME series confirming ONLY
                  // occurrences where THIS member still holds THIS role and
                  // is still pending — never touching a reassigned or
                  // already-resolved occurrence.
                  supabase.rpc('confirm_event_assignment_series_forward', {
                    p_event_id: ev.id, p_member_id: active.id, p_role: assigneeRole,
                  }).then(({ error }) => {
                    if (error) {
                      console.warn('[HelperEventCard] confirm_event_assignment_series_forward failed', error.message);
                      showToast("Couldn't confirm — please try again", 'error');
                      return;
                    }
                    // DB write succeeds but nothing told the local Zustand
                    // store which rows changed — same gap as every other
                    // RPC call site in this file. Since the RPC may have
                    // confirmed MANY future occurrences (not just this one),
                    // patch every same-series, same-assignee, still-locally-
                    // pending occurrence rather than only ev.id.
                    const statusKey = assigneeRole === 'driver' ? 'driverStatus' : 'helperStatus';
                    const idKey = assigneeRole === 'driver' ? 'driverId' : 'helperId';
                    if (ev.seriesId && updateEventScoped) {
                      updateEventScoped(ev.id, { [statusKey]: 'confirmed' } as Partial<FamilyEvent>, 'this');
                    } else {
                      updateEvent(ev.id, { [statusKey]: 'confirmed' } as Partial<FamilyEvent>);
                    }
                    showToast(ev.seriesId ? 'Confirmed — future rides too ✓' : 'Confirmed ✓');
                  });
                }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: `${CONFIRMED_GREEN}20`, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
                  borderWidth: 1, borderColor: `${CONFIRMED_GREEN}40` }}>
                <CheckCircle2 size={12} color={CONFIRMED_GREEN} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: CONFIRMED_GREEN }}>Confirm I'll do it</Text>
              </AnimatedPressable>
              )}
              {/* Previously the only action offered to the named-but-
                  unconfirmed parent was Confirm — no way to say no without
                  leaving this card for the Calendar's detail sheet. The
                  teen and GP equivalents of this card both already pair
                  confirm with a decline (QA Round 11, Medium Finding M4).
                  Also the ONLY way to back out once already confirmed —
                  live-traced QA finding: this whole action row used to be
                  gated on assignee.status !== 'confirmed', hiding Can't
                  Make It the moment a parent confirmed, even though
                  deriveEventActions already computed showCantMakeIt:true
                  for exactly that state. The only path left was the
                  Calendar tab's EventDetailSheet — this restores Hub
                  parity with that. */}
              <AnimatedPressable
                onPress={() => {
                  console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Can't" on "${ev.title}" (id=${ev.id}) → decline_event_assignment(${assigneeRole}) [features/hub/parent/backlog/HelperEventCard.tsx:119]`);
                  // Now the same decline_event_assignment RPC every other
                  // decline surface in the app calls — one owner of
                  // decline-and-reopen instead of each surface re-deriving
                  // it, and correctly targets whichever field pair
                  // (driver_*/helper_*) this event's assignee is actually
                  // in, instead of always hardcoding helper_status. The RPC
                  // doesn't (yet) send the "back open" notification
                  // eventStore.ts's updateEvent() fires on decline — that
                  // logic stays client-side only, hasn't moved server-side
                  // in this pass — so replicate it here rather than lose it.
                  const declinerName = active.name;
                  supabase.rpc('decline_event_assignment', {
                    p_event_id: ev.id, p_member_id: active.id, p_role: assigneeRole, p_reason: null,
                  }).then(({ error }) => {
                    if (error) {
                      console.warn('[HelperEventCard] decline_event_assignment failed', error.message);
                      showToast("Couldn't update — please try again", 'error');
                      return;
                    }
                    // Same local-state gap as the Confirm button above — the
                    // RPC succeeded server-side but nothing told the shared
                    // Zustand store, so the Hub kept showing the pre-decline
                    // state (name + "Pending") until some unrelated fetch
                    // happened to refresh it, even though the DB and other
                    // screens (e.g. Tasks, which fetches fresh) were already
                    // correct. updateEvent's own clearOnDecline logic
                    // handles clearing the right field pair based on the
                    // 'rejected' status transition passed in here.
                    updateEvent(ev.id, { [assigneeRole === 'driver' ? 'driverStatus' : 'helperStatus']: 'rejected' } as Partial<FamilyEvent>);
                    showToast("Marked — you're off this one ✓");
                    try {
                      const recipients = new Set<string>();
                      if (ev.updatedBy && ev.updatedBy !== active.id) recipients.add(ev.updatedBy);
                      if (ev.memberId && ev.memberId !== active.id) recipients.add(ev.memberId);
                      const msg = `🚫 ${declinerName} can't make "${ev.title}" — it's back open for someone else.`;
                      for (const recipientId of recipients) {
                        useChatStore.getState().sendMessage(recipientId, active.id, msg);
                      }
                    } catch (e) {
                      console.warn('[HelperEventCard] decline notification failed', e);
                    }
                  });
                }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
                  borderWidth: 1, borderColor: colors.danger + '40' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.danger }}>Can't</Text>
              </AnimatedPressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}
