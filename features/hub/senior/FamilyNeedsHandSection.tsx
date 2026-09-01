import { View, Text, Pressable, Alert } from 'react-native';
import { Car, Hand, MapPin, BookOpen, PartyPopper, ShoppingBag, ClipboardList, AlertTriangle } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { CollapsibleCard } from '../hubComponents';
import { fmtTime, hoursUntilEvent } from '../hubUtils';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { ChoreTask } from '@/store/choreStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { KidRequest } from '@/store/kidRequestStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';

// Green — "GP Welcome" accent for parent-flagged requests/chores, distinct
// from brand teal used elsewhere in this section. Not colors.success (which
// IS brand teal in this app) — kept as one local constant.
const GP_WELCOME_GREEN = '#22c55e';

// "Family could use a hand" — anything still needing a volunteer. Rides
// already on GP's plate live under Today, so they're not duplicated here.
// Four sub-lists: kid-initiated open requests, parent-flagged GP-welcome
// requests, GP-welcome supply chores, and the "step in" volunteer pool.
export function FamilyNeedsHandSection({
  openRequests, gpWelcomeRequests, gpWelcomeChores, volunteerPool,
  active, members, allNames, colors, isDark,
  updateEvent, updateChore, assignRequest, claimGPErrand,
}: {
  openRequests: FamilyEvent[];
  gpWelcomeRequests: KidRequest[];
  gpWelcomeChores: ChoreTask[];
  volunteerPool: FamilyEvent[];
  active: FamilyMember; members: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => Promise<void>;
  updateChore: (id: string, patch: Partial<ChoreTask>) => void;
  assignRequest: (id: string, memberId: string) => void;
  // Per explicit product decision, GP-Welcome claims direct — no
  // parent-approval offer gate (that's Flow 3's separate claimGPErrand
  // mechanism, still used by the sponsored-errand offer flow elsewhere).
  // This matches QuestCard.tsx's canGpClaimPool "I'd Love To Help" on the
  // Chores tab, which was reconciled to the same direct-claim behavior.
  claimGPErrand: (choreId: string, gpMemberId: string) => void;
}) {
  if (openRequests.length === 0 && gpWelcomeRequests.length === 0 &&
      gpWelcomeChores.length === 0 && volunteerPool.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
      <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textSecondary }}>
        The family could use a hand
      </Text>
      {openRequests.map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        return (
          <CollapsibleCard key={ev.id} accent={BRAND.amber} colors={colors} isDark={isDark} defaultExpanded={false}
            summary={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Hand size={16} color={BRAND.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: GP.body, fontWeight: '700', color: BRAND.amber }} numberOfLines={1}>{ev.title}</Text>
                  <Text style={{ fontSize: GP.sub, color: BRAND.amber, opacity: 0.75 }}>{fmtTime(ev.time)}{ev.location ? ` · ${ev.location}` : ''}</Text>
                </View>
                <View style={{ backgroundColor: BRAND.amber + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: BRAND.amber }}>Open</Text>
                </View>
              </View>
            }>
            {kid && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} siblings={allNames} size={26} ringColor={BRAND.amber} />
                <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>For <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{kid.name.split(' ')[0]}</Text></Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => {
                // Race-safe: this open request is visible to every eligible
                // GP at once, so two grandparents can both tap "I'll Drive"
                // within the same round-trip window — claimHelperSlot's
                // conditional DB write (only succeeds while helper_status is
                // still unset) makes sure only the actual first-to-land
                // claim sticks, rather than both devices' optimistic state
                // showing themselves as the confirmed helper.
                useEventStore.getState().claimHelperSlot(ev.id, 'helper', active.name, { approvalPending: false }, () => showToast("You're driving ✓"));
              }}
                style={{ flex: 1, backgroundColor: BRAND.purple, paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Car size={14} color="#fff" />
                <Text style={{ fontSize: GP.body, fontWeight: '800', color: '#fff' }}>I'll Drive</Text>
              </Pressable>
              <Pressable onPress={() => {
                // Live QA finding: this used to write approvalPending:false
                // — a shared, event-wide field with nothing to do with
                // "hide this from MY OWN feed" — so tapping Pass here
                // didn't actually behave like the ride card's own Pass
                // right above it (which correctly appends to
                // grandparentPassedIds, a per-viewer, persisted list).
                // Now uses the same mechanism, so Pass means the same
                // thing everywhere in this section.
                updateEvent(ev.id, { grandparentPassedIds: [...new Set([...(ev.grandparentPassedIds ?? []), active.id])] });
              }}
                style={{ flex: 1, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '40', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.danger }}>Pass</Text>
              </Pressable>
            </View>
          </CollapsibleCard>
        );
      })}
      {/* Parent-flagged requests GP can take */}
      {gpWelcomeRequests.map(req => {
        const kid = members.find(m => m.id === req.fromMemberId);
        const TypeIcon = req.type === 'ride' ? Car : req.type === 'tutor' ? BookOpen : PartyPopper;
        return (
          <CollapsibleCard key={`gp-${req.id}`} accent={GP_WELCOME_GREEN} colors={colors} isDark={isDark} defaultExpanded={true}
            summary={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TypeIcon size={16} color={GP_WELCOME_GREEN} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: GP.body, fontWeight: '700', color: GP_WELCOME_GREEN }} numberOfLines={1}>
                    {kid?.name.split(' ')[0] ?? 'Kid'} — {req.detail}
                  </Text>
                  {req.scheduledDate || req.scheduledTime ? (
                    <Text style={{ fontSize: GP.sub, color: GP_WELCOME_GREEN, opacity: 0.75 }}>
                      {req.scheduledDate ?? ''}{req.scheduledTime ? ` at ${req.scheduledTime}` : ''}
                    </Text>
                  ) : null}
                </View>
                <View style={{ backgroundColor: GP_WELCOME_GREEN + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: GP_WELCOME_GREEN }}>GP Invited</Text>
                </View>
              </View>
            }>
            {kid && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} siblings={allNames} size={26} ringColor={GP_WELCOME_GREEN} />
                <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>For <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{kid.name.split(' ')[0]}</Text></Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => { assignRequest(req.id, active.id); showToast("You're on it ✓"); }}
                style={{ flex: 1, backgroundColor: GP_WELCOME_GREEN, paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Hand size={14} color="#fff" />
                <Text style={{ fontSize: GP.body, fontWeight: '800', color: '#fff' }}>I'll Help</Text>
              </Pressable>
              {/* Was a true no-op — no state change, no dismiss, nothing —
                  so the card just sat there with no feedback that Pass had
                  been tapped. Matches the ride card's own Pass right above
                  (a real state change, not a per-viewer hide), declining
                  the underlying request so it clears for everyone rather
                  than silently staying open with no visible effect. */}
              <Pressable onPress={() => { useKidRequestStore.getState().declineRequest(req.id, active.id); showToast('Passed'); }}
                style={{ flex: 1, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '40', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.danger }}>Pass</Text>
              </Pressable>
            </View>
          </CollapsibleCard>
        );
      })}

      {/* Partner chores flagged for GP — buy supplies + scan receipt */}
      {gpWelcomeChores.map(c => {
        const assignee = members.find(m => m.id === c.assignedToId);
        const si = c.shoppingItems;
        return (
          <CollapsibleCard key={`gpc-${c.id}`} accent={GP_WELCOME_GREEN} colors={colors} isDark={isDark} defaultExpanded={true}
            summary={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {si?.length ? <ShoppingBag size={16} color={GP_WELCOME_GREEN} /> : <ClipboardList size={16} color={GP_WELCOME_GREEN} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: GP.body, fontWeight: '700', color: GP_WELCOME_GREEN }} numberOfLines={1}>{c.title}</Text>
                  <Text style={{ fontSize: GP.sub, color: GP_WELCOME_GREEN, opacity: 0.75 }}>
                    {assignee ? `Assigned to ${assignee.name.split(' ')[0]}` : 'Unassigned'}{si?.length ? ` · ${si.length} items` : ''}{c.shoppingStore ? ` · ${c.shoppingStore}` : ''}
                  </Text>
                </View>
                <View style={{ backgroundColor: GP_WELCOME_GREEN + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: GP_WELCOME_GREEN }}>GP Welcome</Text>
                </View>
              </View>
            }>
            {si && si.length > 0 && (
              <View style={{ marginBottom: 10, gap: 4 }}>
                {si.map((item, i) => (
                  <Text key={i} style={{ fontSize: GP.sub, color: colors.textSecondary }}>• {item}</Text>
                ))}
                {c.shoppingBudget != null && (
                  <Text style={{ fontSize: GP.sub, color: GP_WELCOME_GREEN, fontWeight: '700', marginTop: 4 }}>Budget: ${c.shoppingBudget}</Text>
                )}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => {
                // Was an unconditional updateChore with no CAS — two GPs
                // tapping "I'll Handle It" on the same open_to_gp chore
                // simultaneously could both succeed, last-writer-wins.
                // claim_gp_welcome_chore row-locks and CAS-guards the claim.
                supabase.rpc('claim_gp_welcome_chore', { p_chore_id: c.id, p_gp_member_id: active.id })
                  .then(({ error }) => {
                    if (error) { console.warn('[FamilyNeedsHandSection] claim_gp_welcome_chore failed', error.message); return; }
                    showToast("You're on it ✓");
                  });
              }}
                style={{ flex: 1, backgroundColor: GP_WELCOME_GREEN, paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <Hand size={14} color="#fff" />
                <Text style={{ fontSize: GP.body, fontWeight: '800', color: '#fff' }}>I'll Handle It</Text>
              </Pressable>
            </View>
          </CollapsibleCard>
        );
      })}

      {volunteerPool.map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        const hrs = hoursUntilEvent(ev.date, ev.time);
        const isReallyUrgent = hrs < 1;
        return (
          <CollapsibleCard key={`vol-${ev.id}`} accent={isReallyUrgent ? colors.danger : BRAND.teal}
            colors={colors} isDark={isDark} defaultExpanded={isReallyUrgent}
            summary={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Car size={16} color={isReallyUrgent ? colors.danger : BRAND.teal} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: GP.body, fontWeight: '800', color: isReallyUrgent ? colors.danger : BRAND.teal }} numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <Text style={{ fontSize: GP.sub, color: isReallyUrgent ? colors.danger : BRAND.teal, opacity: 0.75 }}>
                    {kid?.name.split(' ')[0] ?? 'Kid'} · {fmtTime(ev.time)} · {ev.helper} hasn't replied
                  </Text>
                </View>
                <View style={{ backgroundColor: (isReallyUrgent ? colors.danger : BRAND.teal) + '25', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {isReallyUrgent && <AlertTriangle size={11} color={colors.danger} />}
                  <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: isReallyUrgent ? colors.danger : BRAND.teal }}>
                    {isReallyUrgent ? 'Step In' : 'Volunteer?'}
                  </Text>
                </View>
              </View>
            }>
            {ev.location && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                <MapPin size={12} color={colors.textSecondary} />
                <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>{ev.location}</Text>
              </View>
            )}
            <View style={{ backgroundColor: isDark ? '#1e2540' : '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>
                <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{ev.helper}</Text> was asked but hasn't replied.
                {' '}If you step in, they'll be notified they're no longer needed.
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Step In as Driver?',
                  `You'll replace ${ev.helper} and be confirmed immediately. ${ev.helper} will be notified they're off the hook.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: "Yes, I'll Drive",
                      onPress: () => {
                        // Routed through the ONE shared reassignEvent
                        // (store/eventStore.ts) — every surface that can
                        // reassign a driver/helper calls the same function
                        // now, instead of each hand-copying the
                        // reassign_event RPC call and guessing its own
                        // local patch. Row-locked server-side; since
                        // active.id === active.id (self-assign) it
                        // auto-confirms.
                        useEventStore.getState().reassignEvent(ev.id, active.id, 'helper', active.id);
                      },
                    },
                  ]
                );
              }}
              style={{ backgroundColor: BRAND.teal, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <Car size={15} color="#fff" />
              <Text style={{ fontSize: GP.body, fontWeight: '800', color: '#fff' }}>I'll Step In — Confirm Drive</Text>
            </Pressable>
          </CollapsibleCard>
        );
      })}
    </View>
  );
}
