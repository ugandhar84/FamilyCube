/**
 * MemberCard — matches the reference mock's MemberCard 1:1: square-ish
 * rounded avatar (top-left) with a small generation badge on its corner,
 * name/relation stacked to the right, key icon top-right corner (in place
 * of the mock's like-counter, since PIN management is this app's
 * equivalent small per-card action). Frosted-glass shell for the card body.
 */
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from './shared';
import type { FamilyMember } from '@/store/familyStore';

export const roleColor = (role: string) =>
  role === 'parent' ? BRAND.purple : role === 'senior' ? BRAND.blue : role === 'teen' ? BRAND.amber : BRAND.emerald;

const I = {
  Lock: ({ c }: { c: string }) => <Svg width={10} height={10} viewBox="0 0 24 24"><Path d="M3 11h18v11H3zM7 11V7a5 5 0 0 1 10 0v4" stroke={c} strokeWidth={2.5} fill="none" strokeLinecap="round"/></Svg>,
  Key:  ({ c }: { c: string }) => <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
  Car:  ({ c }: { c: string }) => <Svg width={10} height={10} viewBox="0 0 24 24"><Path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
};

const GEN_LABEL: Record<string, string> = { senior: 'G1', parent: 'G2', teen: 'G3', kid: 'G3' };
const ROLE_LABEL: Record<string, string> = { parent: 'Parent', senior: 'Grandparent', teen: 'Teen', kid: 'Kid' };

export function MemberCard({ m, isActive, isParentViewer, colors, isDark, siblings, sidePrefix, onPress, onLongPress, onPinPress }: {
  m: FamilyMember; isActive: boolean; isParentViewer: boolean; colors: any; isDark: boolean;
  siblings: string[];
  /** "Paternal"/"Maternal" — set only for grandparent cards, once their
   * side is known (via linkedParentId). Prefixed onto the relation label,
   * matching the mock's "Paternal Grandfather" style subtitle. */
  sidePrefix?: string;
  /** Tap — opens the read-only profile sheet. */
  onPress: () => void;
  /** Long-press — parents only, opens the edit modal. */
  onLongPress: () => void; onPinPress: () => void;
}) {
  const rc = roleColor(m.role);
  const hasPin = !!m.pin;
  const baseLabel = m.relationship ?? ROLE_LABEL[m.role] ?? m.role;
  const subtitle = isActive ? 'You' : (sidePrefix ? `${sidePrefix} ${baseLabel}` : baseLabel);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} onLongPress={onLongPress} delayLongPress={500}
      style={{
        width: 180, borderRadius: 16, position: 'relative',
        borderWidth: isActive ? 1.5 : 1, borderColor: isActive ? rc : colors.border,
        overflow: 'hidden',
      }}>
      <LinearGradient
        colors={[rc + '14', rc + '00']}
        start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={16} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card + (isDark ? 'CC' : 'E6') }]} pointerEvents="none" />
      )}

      <View style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ position: 'relative' }}>
          <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl}
            siblings={siblings} size={44} ringColor={rc} ringWidth={1.5} />
          <View style={{
            position: 'absolute', bottom: -3, right: -3,
            minWidth: 16, height: 14, borderRadius: 7, paddingHorizontal: 3,
            backgroundColor: rc, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: colors.card,
          }}>
            <Text style={{ fontSize: 8, fontWeight: '900', color: '#fff' }}>{GEN_LABEL[m.role] ?? ''}</Text>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
            {m.name.split(' ')[0]}
          </Text>
          <Text style={{ fontSize: 10, fontWeight: '600', color: rc }} numberOfLines={1}>
            {subtitle}
          </Text>
          {(hasPin || (m.role === 'teen' && m.hasCar)) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {hasPin ? <I.Lock c={colors.success} /> : null}
              {m.role === 'teen' && m.hasCar ? <I.Car c={colors.amber} /> : null}
            </View>
          )}
        </View>
      </View>

      {/* Corner action — matches the mock's top-right corner button slot
          (a like-counter there; PIN management here, since that's this
          app's equivalent small per-card action). */}
      {(isParentViewer || isActive) && (
        <TouchableOpacity onPress={onPinPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ position: 'absolute', top: 6, right: 6, padding: 4 }}>
          <I.Key c={colors.textTertiary} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
