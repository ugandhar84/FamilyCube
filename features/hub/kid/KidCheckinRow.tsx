import { View, Text, Pressable } from 'react-native';
import { Home, Backpack, Timer } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';

// Money-green — "I'm home" positive check-in accent, distinct from brand
// teal (used elsewhere for confirmed/assigned state). Not colors.success
// (which IS brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

export function KidCheckinRow({ colors, onCheckin }: { colors: any; onCheckin: (type: 'home' | 'ready' | 'late') => void }) {
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
      <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.textTertiary, marginBottom: 8, letterSpacing: 0.6 }}>LET FAMILY KNOW</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([
          { type: 'home',  label: "I'm Home!",    Icon: Home,    color: MONEY_GREEN, bg: `${MONEY_GREEN}15`, border: `${MONEY_GREEN}40` },
          { type: 'ready', label: "I'm Ready!",    Icon: Backpack, color: BRAND.amber, bg: BRAND.amber + '15', border: BRAND.amber + '40' },
          { type: 'late',  label: 'Running Late',  Icon: Timer,   color: colors.danger, bg: `${colors.danger}15`, border: `${colors.danger}40` },
        ] as const).map(({ type, label, Icon, color, bg, border }) => (
          <Pressable key={type} onPress={() => onCheckin(type)}
            style={{ flex: 1, borderRadius: 18, paddingVertical: 16, alignItems: 'center', gap: 6,
              backgroundColor: bg, borderWidth: 1.5, borderColor: border }}>
            <Icon size={24} color={color} strokeWidth={2.2} />
            <Text style={{ fontSize: KID.tiny, fontWeight: '900', color, textAlign: 'center' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
