import { View, Text, Pressable } from 'react-native';
import { BRAND } from '@/components/FamilyCubeLogo';

export function KidCheckinRow({ onCheckin }: { onCheckin: (type: 'home' | 'ready' | 'late') => void }) {
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8', marginBottom: 8, letterSpacing: 0.5 }}>LET FAMILY KNOW</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([
          { type: 'home',  label: "I'm Home!",    emoji: '🏠', color: '#10B981', bg: '#10B98115', border: '#10B98140' },
          { type: 'ready', label: "I'm Ready!",    emoji: '🎒', color: BRAND.amber, bg: BRAND.amber + '15', border: BRAND.amber + '40' },
          { type: 'late',  label: 'Running Late',  emoji: '🏃', color: '#EF4444', bg: '#EF444415', border: '#EF444440' },
        ] as const).map(({ type, label, emoji, color, bg, border }) => (
          <Pressable key={type} onPress={() => onCheckin(type)}
            style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 5,
              backgroundColor: bg, borderWidth: 1.5, borderColor: border }}>
            <Text style={{ fontSize: 24 }}>{emoji}</Text>
            <Text style={{ fontSize: 10, fontWeight: '900', color, textAlign: 'center' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
