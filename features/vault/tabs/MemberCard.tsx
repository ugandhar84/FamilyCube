/**
 * MemberCard — matches the reference mock's MemberCard 1:1: square-ish
 * rounded avatar (top-left) with a small generation badge on its corner,
 * name/relation stacked to the right, key icon top-right corner (in place
 * of the mock's like-counter, since PIN management is this app's
 * equivalent small per-card action). Frosted-glass shell for the card body.
 */
import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';

// Every call site (FamilyTreeView's renderCard, Profile's carousel .map())
// passes onPress/onLongPress/onPinPress as fresh inline arrow functions —
// their identity changes every render regardless of whether the underlying
// member data did. A plain React.memo would see those as "changed props"
// on every single render and never actually skip re-rendering, so this
// comparator deliberately ignores the three callback props and only
// compares what actually determines this card's appearance: the member
// record itself (shallow key check covers every field that changes on
// edit/PIN-set/avatar-upload), active/viewer flags, theme, and the
// siblings list (only MemberCard uses it, for FamilyAvatar's disambiguation
// logic — a new array each render would otherwise defeat the memo too).
function memberPropsEqual(prev: { m: FamilyMember; isActive: boolean; isParentViewer: boolean; colors: any; isDark: boolean; siblings?: string[]; sidePrefix?: string }, next: typeof prev) {
  if (prev.m !== next.m) return false; // reference check — familyStore replaces the object on any change
  if (prev.isActive !== next.isActive) return false;
  if (prev.isParentViewer !== next.isParentViewer) return false;
  if (prev.isDark !== next.isDark) return false;
  if (prev.colors !== next.colors) return false;
  if (prev.sidePrefix !== next.sidePrefix) return false;
  if (prev.siblings !== next.siblings) {
    // Fall back to a length+order shallow compare — Profile's carousel
    // passes members.map(m => m.name) freshly each render (new array
    // identity even when the underlying names haven't changed), so a bare
    // reference check alone would still defeat the memo for that call site.
    const a = prev.siblings, b = next.siblings;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  }
  return true;
}

export const roleColor = (role: string, colors: any) =>
  role === 'parent' ? colors.accent : role === 'senior' ? colors.info : role === 'teen' ? colors.amber : colors.success;

const I = {
  Lock: ({ c }: { c: string }) => <Svg width={10} height={10} viewBox="0 0 24 24"><Path d="M3 11h18v11H3zM7 11V7a5 5 0 0 1 10 0v4" stroke={c} strokeWidth={2.5} fill="none" strokeLinecap="round"/></Svg>,
  Key:  ({ c }: { c: string }) => <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
  // Filled variant for the carousel's single bottom-right PIN badge — solid
  // body reads clearly at 18px where the outline Lock above (drawn for
  // MemberCard's tiny 10px inline badge) would look too thin.
  LockFilled: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={c} strokeWidth={2.5} fill="none" strokeLinecap="round"/>
      <Path d="M5 11h14a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a1 1 0 0 1 1-1z" fill={c}/>
    </Svg>
  ),
  Car:  ({ c }: { c: string }) => <Svg width={10} height={10} viewBox="0 0 24 24"><Path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0" stroke={c} strokeWidth={2} fill="none" strokeLinecap="round"/></Svg>,
};

const GEN_LABEL: Record<string, string> = { senior: 'G1', parent: 'G2', teen: 'G3', kid: 'G3' };
const ROLE_LABEL: Record<string, string> = { parent: 'Parent', senior: 'Grandparent', teen: 'Teen', kid: 'Kid' };

function MemberCardImpl({ m, isActive, isParentViewer, colors, isDark, siblings, sidePrefix, onPress, onLongPress, onPinPress }: {
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
  const rc = roleColor(m.role, colors);
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

/** Memoized — see memberPropsEqual's own comment above for why a plain
 * React.memo wouldn't have worked here (inline callback props). */
export const MemberCard = memo(MemberCardImpl, memberPropsEqual);

/**
 * CarouselMemberCard — square variant for Profile's own horizontal-scroll
 * member carousel (features/profile/ProfileSettingsScreen.tsx). MemberCard
 * above stays untouched (its wide side-by-side layout is tuned for
 * FamilyTreeView's generation-grouped grid and reads fine there) — this is
 * a separate component for a context that explicitly wants a square,
 * avatar-forward tile instead: avatar centered near the top, first name
 * below it, a small role/relation chip underneath, PIN-lock as a corner
 * badge (same corner-badge language MemberCard's key icon already uses).
 * Same three actions, same wiring shape as MemberCard: tap → view,
 * long-press parent-only → edit, key icon → PIN — all landing in the same
 * unified MemberProfileSheet instance (its own internal `section` state
 * picks which one shows), purely a layout change here, not a new
 * interaction model.
 */
function CarouselMemberCardImpl({ m, isActive, isParentViewer, colors, isDark, onPress, onLongPress, onPinPress }: {
  m: FamilyMember; isActive: boolean; isParentViewer: boolean; colors: any; isDark: boolean;
  /** Tap — opens the read-only profile sheet. */
  onPress: () => void;
  /** Long-press — parents only, opens the edit modal. */
  onLongPress: () => void; onPinPress: () => void;
}) {
  const rc = roleColor(m.role, colors);
  const hasPin = !!m.pin;
  const label = m.relationship ?? ROLE_LABEL[m.role] ?? m.role;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} onLongPress={onLongPress} delayLongPress={500}
      style={{
        width: 96, borderRadius: 16, position: 'relative', overflow: 'hidden',
        borderWidth: isActive ? 1.5 : 1, borderColor: isActive ? rc : colors.border,
      }}>
      <LinearGradient
        colors={[rc + '14', rc + '00']}
        start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={16} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card + (isDark ? 'CC' : 'E6') }]} pointerEvents="none" />
      )}

      <View style={{ paddingTop: 14, paddingBottom: 10, paddingHorizontal: 8, alignItems: 'center' }}>
        <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl}
          siblings={[]} size={44} ringColor={rc} ringWidth={1.5} />
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginTop: 8 }} numberOfLines={1}>
          {isActive ? 'You' : m.name.split(' ')[0]}
        </Text>
        <View style={{ marginTop: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1.5, backgroundColor: rc + '18' }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: rc }} numberOfLines={1}>{label}</Text>
        </View>
      </View>

      {/* Single PIN badge, bottom-right, filled — replaces the old separate
          top-right key icon + top-left outline-lock pair. Filled color when
          a PIN is already set, filled neutral otherwise; tappable (in place
          of the old key icon) whenever the viewer is allowed to manage it. */}
      {(isParentViewer || isActive) ? (
        <TouchableOpacity onPress={onPinPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ position: 'absolute', bottom: 6, right: 6, width: 20, height: 20, borderRadius: 10,
            backgroundColor: hasPin ? colors.success : colors.textTertiary,
            alignItems: 'center', justifyContent: 'center' }}>
          <I.LockFilled c="#fff" />
        </TouchableOpacity>
      ) : hasPin ? (
        <View style={{ position: 'absolute', bottom: 6, right: 6, width: 20, height: 20, borderRadius: 10,
          backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
          <I.LockFilled c="#fff" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/** Memoized — same rationale as MemberCard above. */
export const CarouselMemberCard = memo(CarouselMemberCardImpl, memberPropsEqual);
