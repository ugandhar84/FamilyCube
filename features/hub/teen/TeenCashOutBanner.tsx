import { View, Text, Pressable } from 'react-native';
import { CreditCard, ChevronRight } from 'lucide-react-native';
import { KID } from '../kid/kidTheme';

// Full-width Hub banner for Cash Out — replaces the small grid TeenTile
// ["Cashout can be a full widdth banner card with theit pending cashouts
// and last cashout status"]. Tapping it opens TeenCashOutPage (same as the
// old tile's onPress), which now shows the Pending/Settled/Rejected/All
// history tabs plus a banner to start a new request.
export function TeenCashOutBanner({ pendingCount, lastStatusLabel, onPress, colors, isDark }: {
  pendingCount: number; lastStatusLabel?: string; onPress: () => void; colors: any; isDark: boolean;
}) {
  const accent = colors.amber;
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: 18, borderWidth: 1, borderColor: accent + (isDark ? '38' : '2C'),
        backgroundColor: isDark ? accent + '22' : accent + '1E', padding: 14,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: accent,
        alignItems: 'center', justifyContent: 'center' }}>
        <CreditCard size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: KID.body, fontWeight: '800', color: colors.textPrimary }}>Cash Out</Text>
        <Text style={{ fontSize: KID.tiny, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
          {pendingCount > 0
            ? `${pendingCount} pending cash-out${pendingCount > 1 ? 's' : ''}`
            : lastStatusLabel
              ? `Last request: ${lastStatusLabel}`
              : 'Request a payout for completed errands'}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textTertiary} />
    </Pressable>
  );
}
