/**
 * KioskHeader — the one persistent header row every kiosk screen shares:
 * family name + live clock/date on the left, member avatar strip + Ask Fam
 * on the right. Previously each tab (KioskHubTab, etc.) built its own
 * clock, and the member switcher lived crammed into the bottom of the nav
 * rail next to the icons — live-reported as reading like "two sidebars."
 * One header, rendered once above the active screen, replaces both: the
 * rail goes back to being icons only, and every screen (not just Hub) gets
 * the same family/time context and one-tap profile switching.
 *
 * Sized for a few-feet-away kitchen glance, not phone-close reading — the
 * clock (the one thing genuinely useful at a distance) leads as the
 * dominant element with the family name as a small eyebrow above it,
 * rather than the two competing for the same visual weight on one
 * baseline-aligned row. Avatar labels are sized up for the same reason.
 *
 * Switching is intentionally PIN-free here, unlike the phone app's own
 * PersonaSwitcherSheet — a wall-mounted shared kitchen tablet is used by
 * whoever's standing in front of it; gating a tap-to-switch behind a PIN
 * on a device the whole family already shares physical access to adds
 * friction with no real security benefit, and no kiosk reference product
 * (Skylight, Hearth, etc.) gates it either.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Sparkles, Lock } from 'lucide-react-native';
import { LETTER_SPACING } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';

export function KioskHeader({
  familyName, members, activeId, onSwitch, isParent, onAskFam, onLock, colors,
}: {
  familyName: string;
  members: FamilyMember[];
  activeId: string;
  onSwitch: (id: string) => void;
  isParent: boolean;
  onAskFam: () => void;
  /** Manual "lock and go" — live-requested, separate from the idle-timeout
   * auto-lock (useKioskIdleLock). Available to anyone, not parent-gated —
   * locking is a privacy courtesy, not a permission. */
  onLock: () => void;
  colors: any;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={[s.root, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={s.left}>
        <Text style={[s.eyebrow, { color: colors.textTertiary }]} numberOfLines={1}>{familyName.toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={[s.clock, { color: colors.textPrimary }]}>{clock}</Text>
          <Text style={[s.date, { color: colors.textSecondary }]} numberOfLines={1}>{date}</Text>
        </View>
      </View>

      <View style={s.right}>
        <View style={s.avatarRow}>
          {members.slice(0, 6).map(m => {
            const isActive = m.id === activeId;
            const tint = m.role === 'parent' ? colors.teal : m.role === 'senior' ? colors.pink : colors.amber;
            return (
              <Pressable key={m.id} onPress={() => onSwitch(m.id)} style={s.avatarItem}>
                <View style={[s.avatarRing, { backgroundColor: colors.surface, borderColor: isActive ? tint : colors.border }]}>
                  <Text style={s.avatarEmoji}>{m.emoji ?? '👤'}</Text>
                </View>
                <Text style={[s.avatarName, { color: isActive ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
                  {m.name.split(' ')[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {isParent && (
          <Pressable onPress={onAskFam} style={[s.askFam, { backgroundColor: colors.pink }]}>
            <Sparkles size={19} color="#fff" />
          </Pressable>
        )}

        <Pressable onPress={onLock} style={[s.lockBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} hitSlop={8}>
          <Lock size={17} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  left: { flexShrink: 1 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: LETTER_SPACING.sectionLabel, marginBottom: 2 },
  clock: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  date: { fontSize: 13.5, fontWeight: '600' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRow: { flexDirection: 'row', gap: 12 },
  avatarItem: { alignItems: 'center', gap: 4, width: 52 },
  avatarRing: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 19 },
  avatarName: { fontSize: 11, fontWeight: '700' },
  divider: { width: StyleSheet.hairlineWidth, height: 34 },
  askFam: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  lockBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
