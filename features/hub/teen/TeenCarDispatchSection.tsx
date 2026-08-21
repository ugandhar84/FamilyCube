import { View, Text, Pressable } from 'react-native';
import { Car, HandHelping, Coins, CheckCircle, UserCheck } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Sheet body for the "Rides" tile: car on/off toggle up top (opt-in — a
// teen only sees dispatch content once they've said they have a car), then
// the ride pickups open to them and their own confirmed runs.
export function TeenCarDispatchSection({
  hasCar, onToggleCar, openPickups, myPickups, myPendingAssignments, passedPickups, onPass, onClaim, onDrop, onConfirmAssignment,
  rideEarnings, members, colors, isDark,
}: {
  hasCar: boolean; onToggleCar: () => void;
  openPickups: FamilyEvent[]; myPickups: FamilyEvent[];
  // Directly assigned by a parent (helper=me, helperStatus='pending') —
  // distinct from openPickups (claimable pool) and myPickups (already
  // confirmed). Optional so existing call sites don't break.
  myPendingAssignments?: FamilyEvent[];
  passedPickups: string[];
  onPass: (id: string) => void; onClaim: (id: string) => void; onDrop: (id: string) => void;
  onConfirmAssignment?: (id: string) => void;
  rideEarnings: number; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const openVisible = openPickups.filter(e => !passedPickups.includes(e.id));

  return (
    <View style={{ gap: 12 }}>
      <Pressable onPress={onToggleCar}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14,
          backgroundColor: hasCar ? (isDark ? '#1a1000' : '#FFFBEB') : (isDark ? colors.surface : '#F8FAFC'),
          borderWidth: 1.5, borderColor: hasCar ? BRAND.amber : colors.border }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Car size={16} color={hasCar ? BRAND.amber : colors.textSecondary} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: hasCar ? BRAND.amber : colors.textPrimary }}>
              I Have a Car
            </Text>
          </View>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
            {hasCar ? `Pickups routed to you · +${rideEarnings}¢/run` : 'Turn on to join the pickup pool'}
          </Text>
        </View>
        <View style={{ width: 44, height: 26, borderRadius: 13,
          backgroundColor: hasCar ? BRAND.amber : (isDark ? '#334155' : '#CBD5E1'),
          justifyContent: 'center', paddingHorizontal: 3 }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
            alignSelf: hasCar ? 'flex-end' : 'flex-start' }} />
        </View>
      </Pressable>

      {/* A direct assignment ("You Were Asked to Drive") must show
          regardless of the "I Have a Car" toggle — a parent naming this
          teen specifically means the teen needs to respond either way.
          Gating it behind hasCar meant a teen with the toggle off had NO
          confirm/decline surface anywhere in the app for an assignment
          already made to them (QA Round 11, High Finding H4). Only the
          open-pool browsing below stays behind the toggle — that's genuine
          opt-in browsing, not something already directed at them. */}
      {!!myPendingAssignments?.length && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.8 }}>You Were Asked to Drive</Text>
          {myPendingAssignments.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            const evDay = ev.date ? new Date(ev.date + 'T12:00').toLocaleDateString('en-US',
              { weekday: 'short', month: 'short', day: 'numeric' }) : ev.date;
            return (
              <View key={ev.id} style={{ borderRadius: 14, borderWidth: 1.5, overflow: 'hidden',
                borderColor: BRAND.purple + '50', backgroundColor: isDark ? BRAND.purple + '18' : BRAND.purple + '0C' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                  <UserCheck size={16} color={BRAND.purple} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: BRAND.purple }}>
                      {kid?.name.split(' ')[0] ?? 'Sibling'} · {ev.title}
                    </Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }}>
                      {evDay}{ev.time ? ` · ${ev.time}` : ''} · waiting on you to confirm
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: BRAND.purple + '30' }}>
                  <Pressable onPress={() => onConfirmAssignment?.(ev.id)}
                    style={({ pressed }) => ({ flex: 2, paddingVertical: 12, alignItems: 'center',
                      backgroundColor: BRAND.purple, opacity: pressed ? 0.8 : 1 })}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>Confirm</Text>
                  </Pressable>
                  <View style={{ width: 1, backgroundColor: BRAND.purple + '30' }} />
                  <Pressable onPress={() => onDrop(ev.id)}
                    style={({ pressed }) => ({ flex: 1, paddingVertical: 12, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.danger }}>Can't</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* My Confirmed Runs (and its only cancel action) must also show
          regardless of the "I Have a Car" toggle — same reasoning as
          myPendingAssignments above. Was nested inside the hasCar branch:
          a teen who claimed a ride, then flipped the toggle off (e.g. car
          became unavailable — the most realistic reason to toggle off
          mid-commitment), lost the only way to back out of an already-
          confirmed ride, with no signal anywhere that the commitment still
          existed (QA sweep, teen-role audit, High). */}
      {myPickups.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.8 }}>My Confirmed Runs</Text>
          {myPickups.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            const evDay = ev.date ? new Date(ev.date + 'T12:00').toLocaleDateString('en-US',
              { weekday: 'short', month: 'short', day: 'numeric' }) : ev.date;
            return (
              <View key={ev.id} style={{ borderRadius: 12, overflow: 'hidden',
                backgroundColor: isDark ? BRAND.teal + '15' : BRAND.teal + '12',
                borderWidth: 1, borderColor: BRAND.teal + '30' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
                  <CheckCircle size={14} color={BRAND.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>
                      {kid?.name.split(' ')[0] ?? 'Sibling'} · {ev.title}
                    </Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{evDay}{ev.time ? ` · ${ev.time}` : ''}</Text>
                  </View>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: BRAND.teal }}>Confirmed</Text>
                </View>
                <Pressable onPress={() => onDrop(ev.id)}
                  style={{ borderTopWidth: 1, borderTopColor: BRAND.teal + '25', paddingVertical: 9, alignItems: 'center' }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.danger }}>Can't Make It</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {!hasCar ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, textAlign: 'center', paddingVertical: 12 }}>
          Turn on "I Have a Car" to see sibling pickups you can cover.
        </Text>
      ) : (
        <View style={{ gap: 10 }}>
          {openVisible.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            const evDay = ev.date ? new Date(ev.date + 'T12:00').toLocaleDateString('en-US',
              { weekday: 'short', month: 'short', day: 'numeric' }) : ev.date;
            return (
              <View key={ev.id} style={{ borderRadius: 14, borderWidth: 1,
                borderColor: isDark ? BRAND.amber + '40' : '#FDE68A',
                backgroundColor: isDark ? '#2D1800' : '#FFFBEB', overflow: 'hidden' }}>
                <View style={{ backgroundColor: BRAND.amber, paddingHorizontal: 14, paddingVertical: 8,
                  flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Car size={14} color="#fff" />
                  <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
                    RIDE · {evDay}{ev.time ? ` · ${ev.time}` : ''}
                  </Text>
                  {(ev.rideCoins ?? rideEarnings) > 0 && (
                    <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
                      flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Coins size={11} color="#fff" />
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>
                        +{ev.rideCoins ?? rideEarnings}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ padding: 12, gap: 3 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? '#FCD34D' : '#78350F' }}>
                    {kid?.name.split(' ')[0] ?? 'Sibling'} · {ev.title}
                  </Text>
                  {(ev.pickupLocation || ev.dropLocation) && (
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                      {[ev.pickupLocation, ev.dropLocation].filter(Boolean).join(' → ')}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: isDark ? BRAND.amber + '30' : '#FDE68A' }}>
                  <Pressable onPress={() => onClaim(ev.id)}
                    style={({ pressed }) => ({ flex: 2, paddingVertical: 13, alignItems: 'center', gap: 1,
                      backgroundColor: BRAND.amber, opacity: pressed ? 0.8 : 1 })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <HandHelping size={13} color="#fff" />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>I Got This</Text>
                    </View>
                    <Text style={{ fontSize: TYPO.micro, color: '#ffffffCC' }}>
                      earn +{ev.rideCoins ?? rideEarnings} coins
                    </Text>
                  </Pressable>
                  <View style={{ width: 1, backgroundColor: isDark ? BRAND.amber + '30' : '#FDE68A' }} />
                  <Pressable onPress={() => onPass(ev.id)}
                    style={({ pressed }) => ({ flex: 1, paddingVertical: 13, alignItems: 'center', gap: 1, opacity: pressed ? 0.7 : 1 })}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Pass</Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>no pressure</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          {openVisible.length === 0 && (
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, textAlign: 'center', paddingVertical: 8 }}>
              No open pickups — check back later
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
