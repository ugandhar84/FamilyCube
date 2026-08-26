import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { FamilyMember } from '@/store/familyStore';

const I = {
  Lock: ({ c }: { c: string }) => <Svg width={10} height={10} viewBox="0 0 24 24"><Path d="M3 11h18v11H3zM7 11V7a5 5 0 0 1 10 0v4" stroke={c} strokeWidth={2.5} fill="none" strokeLinecap="round"/></Svg>,
  Key:  ({ c }: { c: string }) => <Svg width={12} height={12} viewBox="0 0 24 24"><Path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
  Car:  ({ c }: { c: string }) => <Svg width={10} height={10} viewBox="0 0 24 24"><Path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
};

export const NODE_W = 76;
export const NODE_GAP = 14;

export const roleColor = (role: string, colors: any) =>
  role === 'parent' ? colors.accent : role === 'senior' ? colors.info : role === 'teen' ? colors.amber : colors.success;

// familyStore's fromRow can produce m.emoji === '' (DB stores avatar as an
// empty string rather than null for members who never picked one) — `??`
// alone doesn't catch that, which is why Maya/Leo rendered as blank circles.
const roleEmoji = (m: FamilyMember) =>
  m.emoji || (m.role === 'parent' ? '👨' : m.role === 'senior' ? '👴' : m.role === 'teen' ? '🎧' : '⭐');

export function TreeNode({ m, isActive, isParentViewer, colors, isDark, onLongPress, onPinPress }: {
  m: FamilyMember; isActive: boolean; isParentViewer: boolean; colors: any; isDark: boolean;
  onLongPress: () => void; onPinPress: () => void;
}) {
  const rc = roleColor(m.role, colors);
  const hasPin = !!m.pin;
  return (
    <TouchableOpacity activeOpacity={0.85} onLongPress={onLongPress} delayLongPress={500}
      style={{ alignItems: 'center', width: NODE_W }}>
      <View style={{
        width: 56, height: 56, borderRadius: 14,
        backgroundColor: rc + '18', alignItems: 'center', justifyContent: 'center',
        borderWidth: 2.5, borderColor: isActive ? rc : (isDark ? colors.border : '#EBEBF0'),
      }}>
        <Text style={{ fontSize: 28 }}>{roleEmoji(m)}</Text>
      </View>
      {isActive && (
        <View style={{ marginTop: 2, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: rc + '20' }}>
          <Text style={{ fontSize: 7, fontWeight: '800', color: rc }}>YOU</Text>
        </View>
      )}
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginTop: 3, textAlign: 'center' }} numberOfLines={1}>
        {m.name.split(' ')[0]}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
        {hasPin ? <I.Lock c={colors.success} /> : null}
        {m.role === 'teen' && m.hasCar ? <I.Car c={colors.amber} /> : null}
        {(isParentViewer || isActive) && (
          <TouchableOpacity onPress={onPinPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <I.Key c={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}
