import { View, Text, Pressable } from 'react-native';
import { KID } from '../kid/kidTheme';

// One square dashboard tile — tap opens a bottom sheet with the section's
// full content instead of expanding inline. A small badge count (unread
// offers, open pickups, etc.) surfaces on the icon so a teen can tell
// what's worth opening without visiting every tile.
export function TeenTile({ label, sublabel, Icon, accent, badge, onPress, colors, isDark }: {
  label: string; sublabel?: string; Icon: any; accent: string; badge?: number;
  onPress: () => void; colors: any; isDark: boolean;
}) {
  return (
    <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=teen tapped "${label}" on "TeenTile" → onPress [features/hub/teen/TeenTile.tsx:13]`); onPress(); }}
      style={({ pressed }) => ({
        flexBasis: '48%', flexGrow: 1,
        borderRadius: 18, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
        backgroundColor: colors.card, padding: 14, gap: 8,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: accent + '20',
          alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={19} color={accent} />
        </View>
        {!!badge && badge > 0 && (
          <View style={{ backgroundColor: accent, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
            <Text style={{ fontSize: KID.tiny, fontWeight: '900', color: '#fff' }}>{badge}</Text>
          </View>
        )}
      </View>
      <View>
        <Text style={{ fontSize: KID.body, fontWeight: '800', color: colors.textPrimary }}>{label}</Text>
        {sublabel ? (
          <Text style={{ fontSize: KID.tiny, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>{sublabel}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
