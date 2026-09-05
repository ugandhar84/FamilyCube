/**
 * KioskHeader — the one persistent status bar every kiosk screen shares,
 * rebuilt to the reference mockup's top bar.
 *
 * Left  · a live "Kitchen Hub" status dot + the family name, then the
 *         profile switcher (avatar strip)
 * Mid   · the clock and date — the single most load-bearing glanceable
 *         element on an always-on display, and what the device shows for
 *         the ~99% of the day nobody is touching it
 * Right · Intercom, Standby, Ask Fam (parent), Lock
 *
 * Deliberately NOT in the mockup's version of this bar: the weather pill.
 * The mockup hardcodes "72°F". This codebase has no weather provider and no
 * key for one, so any temperature here would be a fabricated reading
 * presented on a surface a household would reasonably trust for exactly
 * that. Omitted cleanly rather than stubbed — see the report.
 *
 * Profile switching matches the phone's own PersonaSwitcherSheet rule
 * exactly: a member with no PIN switches instantly; a member with
 * `pinEnabled && pin` must enter it, via the same PinEntryModal the phone
 * uses. A wall-mounted shared tablet is still used by whoever is standing
 * in front of it, but someone who deliberately set a PIN expects it to
 * matter everywhere, not only on phones.
 *
 * The switchable list filters soft-deleted and still-pending members, the
 * same way KioskLockScreen filters. Switching INTO a soft-deleted member is
 * the real hazard the filter prevents: it sets them active, and every
 * subsequent write goes out under a member id the backend considers gone.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Sparkles, Lock, Megaphone, Moon } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from './kioskTheme';
import { useKioskColors, kioskRoleAccent } from './kioskPalette';

export function KioskHeader({
  familyName, members, activeId, onSwitch, isParent, onAskFam, onIntercom, onStandby, onLock,
}: {
  familyName: string;
  members: FamilyMember[];
  activeId: string;
  onSwitch: (id: string) => void;
  isParent: boolean;
  /** Opens the real AI assistant (AskCubeChat). Parent-only. */
  onAskFam: () => void;
  /** Opens the house intercom broadcast modal. */
  onIntercom: () => void;
  /** Enters the ambient standby display immediately, rather than waiting
   *  out the idle timer — the mockup's sparkle button. */
  onStandby: () => void;
  /** Manual "lock and go", separate from the idle-timeout auto-lock.
   *  Available to anyone, not parent-gated — locking is a courtesy, not a
   *  permission. */
  onLock: () => void;
}) {
  const { k, isDark } = useKioskColors();
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);

  const switchable = useMemo(
    () => members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending'),
    [members],
  );

  const handleSwitch = (id: string) => {
    if (id === activeId) return;
    const m = members.find(x => x.id === id);
    if (m?.pinEnabled && m.pin) setPinTarget(m);
    else onSwitch(id);
  };

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={[s.root, { backgroundColor: k.card, borderBottomColor: k.cardBorder }]}>
      {/* ── Left: status + family, then profiles ─────────────────────── */}
      <View style={s.left}>
        <View style={s.brand}>
          <View style={[s.liveDot, { backgroundColor: k.sage }]} />
          <Text style={[s.brandText, { color: k.textFaint }]} numberOfLines={1}>
            {familyName.toUpperCase()}
          </Text>
        </View>

        {/* Horizontal scroll rather than a fixed slice: a family with more
            members than fit must still be able to reach the last one. A
            hardcoded slice(0, 6) previously made the seventh profile
            unreachable with no sign any were missing. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.avatarScroll}
          contentContainerStyle={s.avatarRow}
        >
          {switchable.map(m => {
            const isActive = m.id === activeId;
            const tint = kioskRoleAccent(k, m.role);
            const needsPin = !!m.pinEnabled && !!m.pin;
            const firstName = m.name?.trim().split(' ')[0] || 'Family member';
            return (
              <Pressable
                key={m.id}
                onPress={() => handleSwitch(m.id)}
                style={({ pressed }) => [s.avatarItem, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={firstName}
                accessibilityHint={
                  isActive ? 'Already the active profile'
                    : needsPin ? 'Switch to this profile, PIN required'
                    : 'Switch to this profile'
                }
              >
                <View
                  style={[
                    s.avatarRing,
                    {
                      backgroundColor: isActive ? tint + (isDark ? '2E' : '1F') : k.well,
                      borderColor: isActive ? tint : k.cardBorder,
                    },
                  ]}
                >
                  <Text style={s.avatarEmoji}>{m.emoji ?? '👤'}</Text>
                  {needsPin && (
                    <View style={[s.pinBadge, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
                      <Lock size={9} color={k.textMuted} />
                    </View>
                  )}
                </View>
                <Text
                  style={[s.avatarName, { color: isActive ? k.text : k.textFaint }]}
                  numberOfLines={1}
                >
                  {firstName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Middle: clock ────────────────────────────────────────────
          Display-scale and LIGHT-weight, deliberately: at this size a heavy
          weight reads as an alarm clock, a light one as an ambient wall
          clock — and this is the element the device shows for most of its
          life. */}
      <View style={s.clockBlock} accessible accessibilityRole="text" accessibilityLabel={`${clock}, ${date}`}>
        <Text style={[s.clock, { color: k.text }]} numberOfLines={1}>{clock}</Text>
        <Text style={[s.date, { color: k.textMuted }]} numberOfLines={1}>{date}</Text>
      </View>

      {/* ── Right: actions ───────────────────────────────────────────── */}
      <View style={s.right}>
        <HeaderButton
          Icon={Megaphone} label="Intercom" accent={k.primary} k={k} isDark={isDark}
          onPress={onIntercom}
          hint="Broadcast an announcement to every family phone"
          wide
        />
        <HeaderButton
          Icon={Moon} label="Standby" accent={k.gold} k={k} isDark={isDark}
          onPress={onStandby}
          hint="Show the ambient clock display now"
        />
        {isParent && (
          <HeaderButton
            Icon={Sparkles} label="Assistant" accent={k.purple} k={k} isDark={isDark}
            onPress={onAskFam}
            hint="Open the family AI assistant"
          />
        )}
        <HeaderButton
          Icon={Lock} label="Lock" accent={k.textMuted} k={k} isDark={isDark}
          onPress={onLock}
          hint="Hide the current profile until someone signs back in"
          neutral
        />
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

/**
 * A header action. Shows its label beside the icon when there's room
 * (`wide`), icon-only otherwise — but always carries the label as its
 * accessibility name, so an icon-only control is never unlabeled to a
 * screen reader. Every one meets KIOSK_HIT.min.
 */
function HeaderButton({
  Icon, label, accent, k, isDark, onPress, hint, wide, neutral,
}: {
  Icon: typeof Lock;
  label: string;
  accent: string;
  k: ReturnType<typeof useKioskColors>['k'];
  isDark: boolean;
  onPress: () => void;
  hint: string;
  wide?: boolean;
  /** A quiet, un-tinted variant for a secondary action (Lock). */
  neutral?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        s.headerBtn,
        wide && s.headerBtnWide,
        neutral
          ? { backgroundColor: k.well, borderColor: k.cardBorder }
          : { backgroundColor: accent + (isDark ? '1F' : '14'), borderColor: accent + (isDark ? '45' : '38') },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Icon size={20} color={neutral ? k.textMuted : accent} />
      {wide && (
        <Text style={[s.headerBtnText, { color: neutral ? k.textMuted : accent }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: KIOSK_SPACE.md,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, flexShrink: 1, minWidth: 0 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  brandText: { fontSize: KIOSK_TYPO.micro, fontWeight: '900', letterSpacing: 1.6, maxWidth: 130 },
  avatarScroll: { flexGrow: 0, flexShrink: 1 },
  avatarRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, alignItems: 'center' },
  avatarItem: { alignItems: 'center', gap: 3, width: 58 },
  avatarRing: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 19 },
  pinBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  avatarName: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },

  clockBlock: { alignItems: 'center', flexShrink: 0, paddingHorizontal: KIOSK_SPACE.sm },
  clock: {
    fontSize: KIOSK_TYPO.hero, fontWeight: '200', letterSpacing: -1,
    fontVariant: ['tabular-nums'], lineHeight: KIOSK_TYPO.hero * 1.05,
  },
  date: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 1 },

  right: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, marginLeft: 'auto' },
  headerBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  headerBtnWide: {
    width: undefined, flexDirection: 'row', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.md,
  },
  headerBtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
});
