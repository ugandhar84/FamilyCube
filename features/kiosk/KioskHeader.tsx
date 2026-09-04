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
 * Switching matches the phone app's own PersonaSwitcherSheet rule exactly
 * (live-requested fix — this used to be unconditionally PIN-free, which
 * was flagged as a real gap: a wall-mounted shared tablet is still used by
 * whoever's standing in front of it, but a member who deliberately set a
 * PIN on their profile expects that PIN to matter everywhere, not just on
 * phones): a member with no PIN set switches to instantly, exactly as
 * before; a member with `pinEnabled && pin` requires it, via the same
 * PinEntryModal the phone app uses.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Sparkles, Lock } from 'lucide-react-native';
import { LETTER_SPACING } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';

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
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);

  const handleSwitch = (id: string) => {
    if (id === activeId) return;
    const m = members.find(x => x.id === id);
    if (m?.pinEnabled && m.pin) {
      setPinTarget(m);
    } else {
      onSwitch(id);
    }
  };

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
              <Pressable key={m.id} onPress={() => handleSwitch(m.id)} style={s.avatarItem}>
                <View style={[s.avatarRing, { backgroundColor: colors.surface, borderColor: isActive ? tint : colors.border }]}>
                  <Text style={s.avatarEmoji}>{m.emoji ?? '👤'}</Text>
                  {!!m.pinEnabled && !!m.pin && (
                    <View style={[s.pinBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Lock size={8} color={colors.textSecondary} />
                    </View>
                  )}
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
            <Sparkles size={22} color="#fff" />
          </Pressable>
        )}

        <Pressable onPress={onLock} style={[s.lockBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} hitSlop={8}>
          <Lock size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <PinEntryModal
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={(member) => { onSwitch(member.id); setPinTarget(null); }}
        onCancel={() => setPinTarget(null)}
      />
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
  pinBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  avatarName: { fontSize: 11, fontWeight: '700' },
  divider: { width: StyleSheet.hairlineWidth, height: 34 },
  // Bumped from 44/40px to match the rest of kiosk's touch-target scale
  // (nav rail buttons are 60px, avatar rings 44-76px elsewhere) — these two
  // are frequently-tapped controls on a few-feet-away kitchen tablet, so
  // they shouldn't be smaller than everything else on screen.
  askFam: {
    width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  lockBtn: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
