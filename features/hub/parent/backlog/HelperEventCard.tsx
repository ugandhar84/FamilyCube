import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Medal, HeartPulse, BookOpen, Car, Calendar, Clock, CheckCircle2, Repeat, StickyNote, Bell } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { showToast } from '@/components/AppToast';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
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
  // Live-reported bug: this card never destructured showRemind at all —
  // the same event's Schedule/EventDetailSheet view (which DOES use it)
  // showed Remind + Take Over on a co-parent's pending ride, while this
  // Hub card showed only a bare "Pending" badge with zero actions at all.
  // Same underlying deriveEventActions call, same event, same viewer —
  // this card just never rendered one of the two buttons it computed.
  const { showAssignToMe, showConfirm, showCantMakeIt, showRemind, assignee, assigneeRole } = deriveEventActions(
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
          {/* Same Remind action EventDetailSheet already offers on the
              identical co-parent-pending state — was entirely missing on
              this card (deriveEventActions computed showRemind:true, this
              card just never rendered it), so the only thing a viewer who
              isn't eligible to Take Over (e.g. no car) could do here was
              stare at a bare "Pending" badge. */}
          {showRemind && (
            <AnimatedPressable
              onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Remind" on "${ev.title}" (id=${ev.id}) [features/hub/parent/backlog/HelperEventCard.tsx]`); showToast(`Reminder sent to ${(assignee.name?.split(' ')[0] ?? 'Driver')} ✓`); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.warning + '18', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 }}>
              <Bell size={12} color={colors.warningDark ?? colors.warning} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.warningDark ?? colors.warning }}>Remind</Text>
            </AnimatedPressable>
          )}
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
                      // this already has the right to override). Routed
                      // through the ONE shared reassignEvent (store/
                      // eventStore.ts) — every surface that can reassign a
                      // driver/helper (this card, RideRequiredEventCard,
                      // EventDetailSheet) now calls the exact same function
                      // instead of each hand-duplicating the RPC call and
                      // guessing its own local patch afterward.
                      useEventStore.getState().reassignEvent(ev.id, active.id, assigneeRole, active.id);
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
                  // Routed through the ONE shared confirmEventAssignment
                  // (store/eventStore.ts) — was its own hand-copied RPC
                  // call (this file used the series-forward variant;
                  // EventDetailSheet/YourRidesSection/TeenView each used
                  // the plain variant instead, so confirming the exact
                  // same assignment behaved differently depending which
                  // screen you tapped from). The shared function decides
                  // which RPC to use based on whether the event actually
                  // has a seriesId, so every caller now behaves the same.
                  useEventStore.getState().confirmEventAssignment(ev.id, active.id, assigneeRole);
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
                onPress={async () => {
                  console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Can't" on "${ev.title}" (id=${ev.id}) → decline_event_assignment(${assigneeRole}) [features/hub/parent/backlog/HelperEventCard.tsx:119]`);
                  // Routed through the ONE shared declineEventAssignment
                  // (store/eventStore.ts) — was its own hand-copied RPC
                  // call, same as every other decline surface in the app.
                  const ok = await useEventStore.getState().declineEventAssignment(ev.id, active.id, assigneeRole);
                  if (!ok) return;
                  showToast("Marked — you're off this one ✓");
                  try {
                    const recipients = new Set<string>();
                    if (ev.updatedBy && ev.updatedBy !== active.id) recipients.add(ev.updatedBy);
                    if (ev.memberId && ev.memberId !== active.id) recipients.add(ev.memberId);
                    const msg = `🚫 ${active.name} can't make "${ev.title}" — it's back open for someone else.`;
                    for (const recipientId of recipients) {
                      useChatStore.getState().sendMessage(recipientId, active.id, msg);
                    }
                  } catch (e) {
                    console.warn('[HelperEventCard] decline notification failed', e);
                  }
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
