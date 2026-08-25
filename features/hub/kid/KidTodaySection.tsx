import { View, Text, Pressable } from 'react-native';
import { Home, Backpack, Timer, MessageCircle, Car } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import { HubTimelineSection } from '../HubTimelineSection';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Money-green — "I'm home" positive check-in accent, distinct from brand
// teal (used elsewhere for confirmed/assigned state). Not colors.success
// (which IS brand teal in this app) — kept as one local constant, matching
// the original KidCheckinRow.
const MONEY_GREEN = '#10B981';

// "Today" — HubTimelineSection's existing strip, with KidCheckinRow's
// "I'm safe" one-tap check-ins and KidActionRow's "Ask Parent"/"Need a
// Ride" buttons folded in as inline actions right above the strip, instead
// of three separate standalone rows stacked above it.
export function KidTodaySection({
  active, members, events, updateEvent, colors, isDark,
  onCheckin, onAskParent, onNeedRide,
}: {
  active: FamilyMember; members: FamilyMember[]; events: FamilyEvent[];
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  colors: any; isDark: boolean;
  onCheckin: (type: 'home' | 'ready' | 'late') => void;
  onAskParent: () => void;
  onNeedRide: () => void;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            { type: 'home',  label: "I'm Home!",   Icon: Home,     color: MONEY_GREEN,  bg: `${MONEY_GREEN}15`, border: `${MONEY_GREEN}40` },
            { type: 'ready', label: "I'm Ready!",   Icon: Backpack, color: BRAND.amber,  bg: BRAND.amber + '15', border: BRAND.amber + '40' },
            { type: 'late',  label: 'Running Late', Icon: Timer,    color: colors.danger, bg: `${colors.danger}15`, border: `${colors.danger}40` },
          ] as const).map(({ type, label, Icon, color, bg, border }) => (
            <Pressable key={type} onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "${label}" on "KidTodaySection checkin" (id=${type}) → onCheckin("${type}") [features/hub/kid/KidTodaySection.tsx]`); onCheckin(type); }}
              style={{ flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 5,
                backgroundColor: bg, borderWidth: 1.5, borderColor: border }}>
              <Icon size={19} color={color} strokeWidth={2.2} />
              <Text style={{ fontSize: KID.tiny, fontWeight: '900', color, textAlign: 'center' }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "Ask Parent" on "KidTodaySection" [features/hub/kid/KidTodaySection.tsx]`); onAskParent(); }}
            style={{ flex: 1, borderRadius: 16, paddingVertical: 13, alignItems: 'center', gap: 5, flexDirection: 'row', justifyContent: 'center',
              backgroundColor: BRAND.purple, shadowColor: BRAND.purple, shadowOpacity: isDark ? 0 : 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
            <MessageCircle size={17} color="#fff" />
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: '#fff' }}>Ask Parent</Text>
          </Pressable>
          <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "Need a Ride?" on "KidTodaySection" [features/hub/kid/KidTodaySection.tsx]`); onNeedRide(); }}
            style={{ flex: 1, borderRadius: 16, paddingVertical: 13, alignItems: 'center', gap: 5, flexDirection: 'row', justifyContent: 'center',
              backgroundColor: isDark ? colors.card : '#fff',
              borderWidth: 1.5, borderColor: BRAND.teal + '60' }}>
            <Car size={17} color={BRAND.teal} />
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: BRAND.teal }}>Need a Ride?</Text>
          </Pressable>
        </View>
      </View>

      <HubTimelineSection active={active} members={members} events={events} updateEvent={updateEvent} colors={colors} isDark={isDark} />
    </View>
  );
}
