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
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Sparkles, Lock } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from './kioskTheme';

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

  // AUDIT FIX: was `members.slice(0, 6)` over the raw list — so a
  // soft-deleted member, or one whose invite is still pending (i.e. has
  // never actually joined), rendered as a tappable profile in the switcher.
  // KioskLockScreen already filters exactly this way (its own
  // visibleMembers, `!m.deletedAt && m.inviteStatus !== 'pending'`); the
  // header simply never got the same filter, so the two profile pickers on
  // the same device disagreed about who exists. Switching INTO a
  // soft-deleted member is the real problem: it sets them active, and every
  // subsequent write goes out under a member id the backend considers gone.
  const switchable = useMemo(
    () => members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending'),
    [members],
  );

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
        <View style={s.clockRow}>
          <Text style={[s.clock, { color: colors.textPrimary }]} numberOfLines={1}>{clock}</Text>
          <Text style={[s.date, { color: colors.textSecondary }]} numberOfLines={1}>{date}</Text>
        </View>
      </View>

      <View style={s.right}>
        {/* AUDIT FIX: was a fixed `members.slice(0, 6)` row — a family with
            more than six members simply could not switch to the seventh
            onwards from the header at all, with no indication any were
            missing. A horizontal ScrollView shows every switchable member
            and scrolls when they don't fit. flexShrink on the wrapper lets
            it give way to the Ask Fam / Lock buttons rather than pushing
            them off-screen. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.avatarScroll}
          contentContainerStyle={s.avatarRow}
        >
          {switchable.map(m => {
            const isActive = m.id === activeId;
            const tint = m.role === 'parent' ? colors.teal : m.role === 'senior' ? colors.pink : colors.amber;
            const needsPin = !!m.pinEnabled && !!m.pin;
            const firstName = m.name?.trim().split(' ')[0] || 'Family member';
            return (
              <Pressable
                key={m.id}
                onPress={() => handleSwitch(m.id)}
                style={s.avatarItem}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={firstName}
                accessibilityHint={
                  isActive ? 'Already the active profile'
                    : needsPin ? 'Switch to this profile, PIN required'
                    : 'Switch to this profile'
                }
              >
                <View style={[s.avatarRing, { backgroundColor: colors.surface, borderColor: isActive ? tint : colors.border }]}>
                  <Text style={s.avatarEmoji}>{m.emoji ?? '👤'}</Text>
                  {needsPin && (
                    <View style={[s.pinBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Lock size={12} color={colors.textSecondary} />
                    </View>
                  )}
                </View>
                <Text
                  style={[s.avatarName, { color: isActive ? colors.textPrimary : colors.textTertiary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {firstName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {isParent && (
          <Pressable
            onPress={onAskFam}
            style={[s.askFam, { backgroundColor: colors.pink }]}
            accessibilityRole="button"
            accessibilityLabel="Ask Fam"
            accessibilityHint="Open the family assistant"
          >
            <Sparkles size={28} color="#fff" />
          </Pressable>
        )}

        <Pressable
          onPress={onLock}
          style={[s.lockBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Lock kiosk"
          accessibilityHint="Hides the current profile until someone signs back in"
        >
          <Lock size={26} color={colors.textSecondary} />
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

// Scaled to the kiosk ladder throughout. The clock leads at KIOSK_TYPO.title
// (32) rather than the old 26 — it's the element most often read from a
// distance — and every tappable control here now meets KIOSK_HIT.control.
const s = StyleSheet.create({
  root: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: KIOSK_SPACE.lg, paddingVertical: KIOSK_SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: KIOSK_SPACE.md,
  },
  left: { flexShrink: 1 },
  eyebrow: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1.4, marginBottom: 2 },
  clockRow: { flexDirection: 'row', alignItems: 'baseline', gap: KIOSK_SPACE.sm, flexWrap: 'wrap' },
  clock: { fontSize: KIOSK_TYPO.title, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  date: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, flexShrink: 1 },
  avatarScroll: { flexGrow: 0, flexShrink: 1 },
  avatarRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm, alignItems: 'center' },
  avatarItem: { alignItems: 'center', gap: 4, width: 76 },
  avatarRing: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_HIT.min / 2, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 26 },
  pinBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  avatarName: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  divider: { width: StyleSheet.hairlineWidth, height: 44 },
  askFam: {
    width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  lockBtn: {
    width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
