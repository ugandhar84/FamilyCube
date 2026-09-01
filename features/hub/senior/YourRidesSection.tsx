import { View, Text, Pressable } from 'react-native';
import { Car, CheckCircle, MapPin, AlertTriangle } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { SectionCard, CollapsibleCard } from '../hubComponents';
import { fmtTime } from '../hubUtils';
import { GP } from './seniorTheme';
import { DeclineReasonPanel } from './DeclineReasonPanel';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';

// Money-green — "accepted / driving today" accent, distinct from brand
// teal used elsewhere in this section. Not colors.success (which IS brand
// teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// Today's rides — what GP is driving, and what still needs a yes/no.
export function YourRidesSection({
  myPendingAssignments, myDrivingToday, myClaimedRides, urgentPending,
  active, members, colors, isDark,
  declineId, declineText, setDeclineId, setDeclineText,
  updateEvent, onEnRoute, conflictReasons,
}: {
  myPendingAssignments: FamilyEvent[];
  myDrivingToday: FamilyEvent[];
  myClaimedRides: FamilyEvent[];
  urgentPending: FamilyEvent[];
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  declineId: string | null; declineText: string;
  setDeclineId: (id: string | null) => void; setDeclineText: (v: string) => void;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => Promise<void>;
  onEnRoute: () => void;
  // Same assignee-double-booked signal ParentView/KidView/TeenView already
  // show — SeniorView had zero conflict-detection wiring at all (a
  // grandparent double-booked as a driver got no warning, unlike every
  // other role). See detectAssigneeConflicts.ts.
  conflictReasons?: Map<string, string>;
}) {
  if (myPendingAssignments.length === 0 && myDrivingToday.length === 0 && myClaimedRides.length === 0) return null;

  const beginDecline = (evId: string) => { setDeclineId(evId); setDeclineText(''); };
  const cancelDecline = () => setDeclineId(null);
  const confirmDecline = async (ev: FamilyEvent) => {
    // Routed through the ONE shared declineEventAssignment (store/
    // eventStore.ts) — was its own hand-copied RPC call, same as every
    // other decline site in the app. Only close/clear the panel on
    // success — a network failure previously looked identical to a
    // successful decline.
    const ok = await useEventStore.getState().declineEventAssignment(ev.id, active.id, 'helper', declineText.trim() || undefined);
    if (!ok) return;
    setDeclineId(null); setDeclineText('');
  };

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        large
        icon={<Car size={18} color={BRAND.teal} />}
        title="Your Rides"
        subtitle={myPendingAssignments.length > 0
          ? `${myPendingAssignments.length} need${myPendingAssignments.length === 1 ? 's' : ''} your answer`
          : `${myDrivingToday.length + myClaimedRides.length} coming up`}
        badge={myPendingAssignments.length || undefined} badgeColor={colors.danger}
        collapsible defaultExpanded
        colors={colors} isDark={isDark}>
        <View style={{ gap: 10 }}>
          {myPendingAssignments.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            const isUrgent = urgentPending.some(u => u.id === ev.id);
            return (
              <CollapsibleCard key={ev.id} accent={isUrgent ? colors.danger : BRAND.amber} colors={colors} isDark={isDark} defaultExpanded
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Car size={16} color={BRAND.amber} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: GP.body, fontWeight: '800', color: BRAND.amber }} numberOfLines={1}>{ev.title}</Text>
                      <Text style={{ fontSize: GP.sub, color: BRAND.amber, opacity: 0.75 }}>{kid?.name.split(' ')[0] ?? 'Kid'} · {fmtTime(ev.time)}</Text>
                    </View>
                    <View style={{ backgroundColor: (isUrgent ? colors.danger : BRAND.amber) + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {isUrgent && <AlertTriangle size={11} color={colors.danger} />}
                      <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: isUrgent ? colors.danger : BRAND.amber }}>
                        {isUrgent ? 'Urgent' : 'Needs Reply'}
                      </Text>
                    </View>
                  </View>
                }>
                {ev.location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <MapPin size={12} color={colors.textSecondary} />
                    <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>{ev.location}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => {
                    // Routed through the ONE shared confirmEventAssignment
                    // (store/eventStore.ts) — was its own hand-copied RPC
                    // call, same as every other confirm site in the app.
                    useEventStore.getState().confirmEventAssignment(ev.id, active.id, 'helper');
                  }}
                    style={{ flex: 1, backgroundColor: MONEY_GREEN, borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Car size={14} color="#fff" />
                    <Text style={{ fontSize: GP.body, fontWeight: '700', color: '#fff' }}>Accept Drive</Text>
                  </Pressable>
                  <Pressable onPress={() => beginDecline(ev.id)}
                    style={{ flex: 1, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '40', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                    <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.danger }}>Decline</Text>
                  </Pressable>
                </View>
                {declineId === ev.id && (
                  <DeclineReasonPanel declineText={declineText} setDeclineText={setDeclineText}
                    onCancel={cancelDecline} onConfirm={() => confirmDecline(ev)} colors={colors} isDark={isDark} />
                )}
              </CollapsibleCard>
            );
          })}
          {myDrivingToday.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            const conflictReason = conflictReasons?.get(ev.id);
            return (
              <CollapsibleCard key={ev.id} accent={MONEY_GREEN} colors={colors} isDark={isDark} defaultExpanded={false}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Car size={16} color={MONEY_GREEN} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: GP.body, fontWeight: '800', color: MONEY_GREEN }} numberOfLines={1}>{ev.title}</Text>
                      <Text style={{ fontSize: GP.sub, color: MONEY_GREEN, opacity: 0.75 }}>{kid?.name.split(' ')[0] ?? 'Kid'} · {fmtTime(ev.time)}</Text>
                    </View>
                    <View style={{ backgroundColor: MONEY_GREEN + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: MONEY_GREEN }}>Assigned</Text>
                    </View>
                  </View>
                }>
                {conflictReason && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <AlertTriangle size={12} color={colors.danger} />
                    <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.danger }}>{conflictReason}</Text>
                  </View>
                )}
                {ev.location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} color={colors.textSecondary} />
                    <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>{ev.location}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={onEnRoute} style={{ flex: 1, backgroundColor: MONEY_GREEN, borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Car size={14} color="#fff" />
                    <Text style={{ fontSize: GP.body, fontWeight: '700', color: '#fff' }}>I'm En Route</Text>
                  </Pressable>
                  <Pressable onPress={() => beginDecline(ev.id)}
                    style={{ flex: 1, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '40', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                    <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.danger }}>Can't Make It</Text>
                  </Pressable>
                </View>
                {declineId === ev.id && (
                  <DeclineReasonPanel declineText={declineText} setDeclineText={setDeclineText}
                    onCancel={cancelDecline} onConfirm={() => confirmDecline(ev)} colors={colors} isDark={isDark} />
                )}
              </CollapsibleCard>
            );
          })}
          {myClaimedRides.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            const evDay = ev.date ? new Date(ev.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : ev.date;
            const conflictReason = conflictReasons?.get(ev.id);
            return (
              <View key={ev.id} style={{ borderRadius: 14, overflow: 'hidden',
                backgroundColor: isDark ? BRAND.teal + '15' : BRAND.teal + '12',
                borderWidth: 1.5, borderColor: BRAND.teal + '40' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                  <CheckCircle size={22} color={BRAND.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: GP.title, fontWeight: '800', color: colors.textPrimary }}>
                      {ev.title}
                    </Text>
                    <Text style={{ fontSize: GP.body, color: colors.textSecondary, marginTop: 2 }}>
                      {kid?.name.split(' ')[0] ?? 'Child'} · {evDay}{ev.time ? ` at ${fmtTime(ev.time)}` : ''}
                    </Text>
                    {conflictReason && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                        <AlertTriangle size={11} color={colors.danger} />
                        <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.danger }}>{conflictReason}</Text>
                      </View>
                    )}
                  </View>
                </View>
                {/* Only "today" claimed rides got a Can't Make It button before —
                    a ride claimed for a future day had no withdraw path at all.
                    Same decline flow as myDrivingToday: helperStatus → rejected,
                    which re-surfaces it in Parent Hub's urgency banner once it's
                    inside the same <4hr window used for any other declined ride. */}
                <Pressable onPress={() => beginDecline(ev.id)}
                  style={{ borderTopWidth: 1, borderTopColor: BRAND.teal + '30',
                    paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.danger }}>Can't Make It</Text>
                </Pressable>
                {declineId === ev.id && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                    <DeclineReasonPanel declineText={declineText} setDeclineText={setDeclineText}
                      onCancel={cancelDecline} onConfirm={() => confirmDecline(ev)} colors={colors} isDark={isDark} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </SectionCard>
    </View>
  );
}
