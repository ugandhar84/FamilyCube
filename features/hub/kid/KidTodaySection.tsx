import { View, Text, Pressable } from 'react-native';
import { Home, Backpack, Timer, MessageCircle } from 'lucide-react-native';
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
// "I'm safe" one-tap check-ins and "Ask Parent" folded in as one row of
// inline actions right above the strip. "Need a Ride?" used to sit next to
// Ask Parent as its own separate button, but it opened the exact same
// KidRequestModal AskParentSheet's own "Ask for a Ride" choice already
// does — a genuine duplicate, not two different things — so it's gone and
// Ask Parent joined the check-in row instead of keeping its own.
export function KidTodaySection({
  active, members, events, updateEvent, colors, isDark,
  onCheckin, onAskParent,
}: {
  active: FamilyMember; members: FamilyMember[]; events: FamilyEvent[];
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  colors: any; isDark: boolean;
  onCheckin: (type: 'home' | 'ready' | 'late') => void;
  onAskParent: () => void;
}) {
  return (
    // No marginBottom here — HubTimelineSection (the last child) already
    // carries its own bottom margin; wrapping it in another one doubled the
    // gap before My Chores (confirmed live: visibly too much padding above
    // the My Chores card).
    <View>
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            { key: 'home',  label: "I'm Home!",   Icon: Home,     color: MONEY_GREEN,  bg: `${MONEY_GREEN}15`, border: `${MONEY_GREEN}40`, onPress: () => onCheckin('home') },
            { key: 'ready', label: "I'm Ready!",   Icon: Backpack, color: BRAND.amber,  bg: BRAND.amber + '15', border: BRAND.amber + '40', onPress: () => onCheckin('ready') },
            { key: 'late',  label: 'Running Late', Icon: Timer,    color: colors.danger, bg: `${colors.danger}15`, border: `${colors.danger}40`, onPress: () => onCheckin('late') },
            { key: 'ask',   label: 'Ask Parent',   Icon: MessageCircle, color: BRAND.purple, bg: BRAND.purple + '15', border: BRAND.purple + '60', onPress: onAskParent },
          ] as const).map(({ key, label, Icon, color, bg, border, onPress }) => (
            <Pressable key={key} onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "${label}" on "KidTodaySection" (id=${key}) [features/hub/kid/KidTodaySection.tsx]`); onPress(); }}
              style={{ flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 5,
                backgroundColor: bg, borderWidth: 1.5, borderColor: border }}>
              <Icon size={19} color={color} strokeWidth={2.2} />
              <Text style={{ fontSize: KID.tiny, fontWeight: '900', color, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <HubTimelineSection active={active} members={members} events={events} updateEvent={updateEvent} colors={colors} isDark={isDark} />
    </View>
  );
}
