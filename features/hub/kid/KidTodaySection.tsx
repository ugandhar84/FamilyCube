import { View, Text, Pressable } from 'react-native';
import { Home, Backpack, Timer, MessageCircle } from 'lucide-react-native';
import { KID } from './kidTheme';
import { HubTimelineSection } from '../HubTimelineSection';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

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
            // Same 4 brand tokens ParentQuickActions uses (accent/parent/
            // kid/danger) — no off-palette hex, matching the exact Parent
            // Hub tile colors instead of a different local set.
            { key: 'home',  label: "I'm Home!",   Icon: Home,     color: colors.parent, onPress: () => onCheckin('home') },
            { key: 'ready', label: "I'm Ready!",   Icon: Backpack, color: colors.kid,    onPress: () => onCheckin('ready') },
            { key: 'late',  label: 'Running Late', Icon: Timer,    color: colors.danger, onPress: () => onCheckin('late') },
            { key: 'ask',   label: 'Ask Parent',   Icon: MessageCircle, color: colors.accent, onPress: onAskParent },
          ] as const).map(({ key, label, Icon, color, onPress }) => (
            <Pressable key={key} onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "${label}" on "KidTodaySection" (id=${key}) [features/hub/kid/KidTodaySection.tsx]`); onPress(); }}
              style={{ flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 6,
                backgroundColor: isDark ? color + '22' : color + '1E', borderWidth: 1, borderColor: color + (isDark ? '38' : '2C') }}>
              {/* Solid-tint icon chip with a white icon — matches the Parent
                  Hub's quick-action tile treatment instead of a bare icon
                  floating directly on the tinted wash. */}
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
                <Icon size={17} color="#fff" strokeWidth={2.4} />
              </View>
              <Text style={{ fontSize: KID.tiny, fontWeight: '900', color, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <HubTimelineSection active={active} members={members} events={events} updateEvent={updateEvent} colors={colors} isDark={isDark} />
    </View>
  );
}
