import { View, Text, Pressable } from 'react-native';
import { MapPin, Car, Flag, HeartHandshake, Hand } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { GP } from './seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Amber accent matching the header chip below — distinct hue kept as a
// local constant instead of a repeated bare hex.
const RIDE_AMBER = '#F59E0B';

// Open ride requests inside "Lend a Hand" — first-come-first-claim, no
// obligation. Rides GP already owns live in Today (YourRidesSection) instead.
export function OpenRideRequestsList({
  openRides, members, atWeeklyCap,
  onClaim, onPass, colors, isDark, active,
}: {
  openRides: FamilyEvent[];
  members: FamilyMember[];
  atWeeklyCap: boolean;
  onClaim: (evId: string) => void;
  onPass: (evId: string) => void;
  colors: any; isDark: boolean;
  active?: { name: string };
}) {
  if (openRides.length === 0) return null;
  const actorName = active?.name ?? 'senior';

  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
      {openRides.map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        const evDay = ev.date ? new Date(ev.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ev.date;
        return (
          <View key={ev.id} style={{ borderRadius: 16, borderWidth: 1,
            borderColor: isDark ? '#854D0E30' : '#FDE68A',
            backgroundColor: isDark ? '#2D1800' : '#FFFBEB',
            overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ backgroundColor: atWeeklyCap ? '#6B7280' : RIDE_AMBER,
              paddingHorizontal: 14, paddingVertical: 13,
              flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Car size={15} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>
                  {evDay}{ev.time ? ` · ${ev.time}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  {!atWeeklyCap && <Flag size={10} color="#ffffffCC" />}
                  <Text style={{ fontSize: GP.tiny, color: '#ffffffCC' }}>
                    {atWeeklyCap ? 'Weekly cap reached · update settings to accept' : 'First to claim wins'}
                  </Text>
                </View>
              </View>
              <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: '#fff' }}>Open</Text>
              </View>
            </View>
            {/* Content */}
            <View style={{ padding: 14, gap: 7 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? '#FCD34D' : '#78350F' }}>
                {kid?.name.split(' ')[0] ?? 'Child'} · {ev.title}
              </Text>
              {(ev.pickupLocation || ev.dropLocation) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: isDark ? '#2D1800' : '#FEF3C7', borderRadius: 8, padding: 8 }}>
                  <MapPin size={12} color="#F59E0B" />
                  <Text style={{ fontSize: GP.sub, color: isDark ? '#FCD34D' : '#92400E', fontWeight: '600', flex: 1 }}>
                    {[ev.pickupLocation, ev.dropLocation].filter(Boolean).join(' → ')}
                  </Text>
                </View>
              )}
              {ev.notes && (
                <Text style={{ fontSize: GP.sub, color: colors.textSecondary, fontStyle: 'italic' }}>
                  "{ev.notes}"
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <HeartHandshake size={12} color={RIDE_AMBER} />
                <Text style={{ fontSize: GP.tiny, color: RIDE_AMBER, fontWeight: '700' }}>
                  Grandparents Welcome · no obligation to accept
                </Text>
              </View>
            </View>
            {/* Action buttons */}
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: isDark ? '#854D0E30' : '#FDE68A' }}>
              <Pressable
                onPress={() => { onClaim(ev.id); }}
                disabled={atWeeklyCap}
                style={{ flex: 2, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 2,
                  backgroundColor: atWeeklyCap ? (isDark ? '#374151' : '#E5E7EB') : RIDE_AMBER }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Hand size={14} color={atWeeklyCap ? (isDark ? '#9CA3AF' : '#6B7280') : '#fff'} />
                  <Text style={{ fontSize: GP.body, fontWeight: '900',
                    color: atWeeklyCap ? (isDark ? '#9CA3AF' : '#6B7280') : '#fff' }}>
                    I'll Drive
                  </Text>
                </View>
                <Text style={{ fontSize: GP.tiny, color: atWeeklyCap ? '#9CA3AF' : '#ffffffCC' }}>
                  {atWeeklyCap ? 'cap reached' : 'syncs to your calendar'}
                </Text>
              </Pressable>
              <View style={{ width: 1, backgroundColor: isDark ? '#854D0E30' : '#FDE68A' }} />
              <Pressable
                onPress={() => { onPass(ev.id); }}
                style={{ flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.textSecondary }}>
                  Pass
                </Text>
                <Text style={{ fontSize: GP.tiny, color: colors.textTertiary }}>no guilt 💙</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}
