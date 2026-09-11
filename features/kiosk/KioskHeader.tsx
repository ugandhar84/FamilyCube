/**
 * KioskHeader — the one persistent status bar every kiosk screen shares.
 *
 * Left  · a live status dot + a real weather readout, then the profile
 *         switcher (avatar strip) — given the header's freed width now
 *         that the center clock and two right-side buttons are gone
 * Right · theme mode, Announcement (broadcast), Lock
 *
 * Live-requested removals: the center clock (redundant with the device's
 * own status-bar clock, top-left of the screen — a kiosk still runs
 * inside the OS chrome, not a dedicated always-on display with no other
 * clock in view), Standby, and Assistant (AskCubeChat) — the last one
 * doubly redundant for the one role it was ever shown to, since a parent
 * now has the same real Ask Family AI action pinned at the bottom of
 * ParentStatsColumn instead.
 *
 * ── Weather, now real ────────────────────────────────────────────────────
 * A prior pass of this file deliberately omitted the mockup's hardcoded
 * "72°F" pill: this codebase had no weather provider and no key, so any
 * number shown would have been fabricated on a surface a household would
 * reasonably trust. That's now resolved with a REAL fetch (lib/weather.ts,
 * ported from the proven Petkoinia implementation) — Open-Meteo, keyless,
 * device GPS only, via the same safe expo-location wrapper
 * (lib/location.ts) already used elsewhere in this app. useKioskWeather
 * returns null whenever no real reading is available (permission denied,
 * fetch failed, still loading) and the readout simply doesn't render in
 * that case — never a placeholder value.
 *
 * ── Theme mode ────────────────────────────────────────────────────────────
 * A real three-way cycle (system -> light -> dark -> system) over the same
 * ThemeContext every other screen in this app already reads/writes — kiosk
 * previously had no control for this at all, purely inheriting whatever the
 * household's phone-set preference was. Icon reflects the CURRENT mode, not
 * the mode a tap would switch to, matching how a settings toggle should
 * read (state, not a command).
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
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Lock, Megaphone, Sun, MoonStar, MonitorSmartphone } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';
import { useTheme, type ThemeMode } from '@/lib/ThemeContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from './kioskTheme';
import { useKioskColors, kioskRoleAccent } from './kioskPalette';
import { useKioskLockSuspended } from './KioskActivityContext';
import { useKioskWeather } from './useKioskWeather';
import { KioskAvatar } from './components/KioskAvatar';

export function KioskHeader({
  members, activeId, onSwitch, onIntercom, onLock,
}: {
  members: FamilyMember[];
  activeId: string;
  onSwitch: (id: string) => void;
  /** Opens the house intercom broadcast modal. */
  onIntercom: () => void;
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

  // AUDIT GAP CLOSED: PinEntryModal renders into its own native window, so
  // every digit typed into it is invisible to KioskScreen's root
  // onTouchStart — meaning entering a PIN registered as total inactivity
  // and the idle lock could fire on someone mid-entry, which is both a
  // data-loss annoyance and, worse, confusing (you get bounced to the lock
  // screen while proving who you are). Exactly the class of bug the
  // KioskActivityContext pass fixed for the editors; the header's own PIN
  // modal was simply never covered by it. PinEntryModal is a shared phone
  // component whose root can't be wrapped without changing its layout, so
  // the hook form is the right tool here.
  useKioskLockSuspended(pinTarget !== null);

  const weather = useKioskWeather();

  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const cycleTheme = () => {
    const next: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
    setThemeMode(next[themeMode]);
  };
  const themeIcon = themeMode === 'light' ? Sun : themeMode === 'dark' ? MoonStar : MonitorSmartphone;
  const themeLabel = themeMode === 'light' ? 'Light' : themeMode === 'dark' ? 'Dark' : 'Auto';

  return (
    <View style={[s.root, { backgroundColor: k.card, borderBottomColor: k.cardBorder }]}>
      {/* ── Left: live status + weather, then profiles ──────────────────
          Family name removed from here — it's shown once, in
          ParentStatsColumn's identity card, rather than repeated in every
          header on every screen. The live dot alone still carries "this
          display is live," its original purpose. */}
      <View style={s.left}>
        <View style={s.brandCol}>
          <View style={s.brand}>
            <View style={[s.liveDot, { backgroundColor: k.sage }]} />
          </View>
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
                <View style={s.avatarRingWrap}>
                  <KioskAvatar
                    name={m.name}
                    emoji={m.emoji}
                    avatarUrl={m.avatarUrl}
                    siblings={members.filter(x => x.id !== m.id).map(x => x.name)}
                    size={42}
                    ringWidth={2.5}
                    ringColor={isActive ? tint : k.cardBorder}
                    bgColor={isActive ? tint + (isDark ? '2E' : '1F') : k.well}
                    k={k}
                  />
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

      {/* ── Right: theme mode, then actions ─────────────────────────────
          Live-requested removals: the big center clock (redundant with
          the device's own status-bar clock, top-left of the screen — a
          kiosk still runs inside the OS chrome, it isn't a dedicated
          always-on display with no other clock in view) and both Standby
          and Assistant. Assistant (AskCubeChat via onAskFam) is also now
          redundant for the one role it was ever shown to — a parent has
          the same real Ask Family AI action pinned at the bottom of
          ParentStatsColumn now (added since this button was built),
          closer to hand than a header icon. Theme mode leads, quiet/
          neutral like Lock — a display preference, not a household
          action. Icon reflects the CURRENT mode (state), not what a tap
          switches to (a command) — tapping cycles
          system -> light -> dark -> system. */}
      <View style={s.right}>
        {/* Weather — moved out from beside the live dot to its own chip
            here, roughly the same footprint as an avatar (42px), so it
            reads as its own glanceable readout rather than small print
            buried next to the status dot [live-requested: "show the
            temperature icon right side some where in middle similar size
            of avatar"]. Still renders only once a real reading has come
            back (useKioskWeather returns null otherwise) — never a
            placeholder. */}
        {weather && (
          <View
            style={[s.weatherChip, { backgroundColor: k.well, borderColor: k.cardBorder }]}
            accessible accessibilityRole="text"
            accessibilityLabel={`${weather.temperature}${weather.unit}, ${weather.condition}`}
          >
            <Text style={s.weatherIcon}>{weather.icon}</Text>
            <Text style={[s.weatherText, { color: k.textMuted }]} numberOfLines={1}>
              {weather.temperature}{weather.unit}
            </Text>
          </View>
        )}
        <HeaderButton
          Icon={themeIcon} label={themeLabel} accent={k.textMuted} k={k} isDark={isDark}
          onPress={cycleTheme}
          hint={`Display theme: ${themeLabel}. Tap to change.`}
          neutral
        />
        <HeaderButton
          Icon={Megaphone} label="Announcement" accent={k.primary} k={k} isDark={isDark}
          onPress={onIntercom}
          hint="Broadcast an announcement to every family phone"
        />
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
  // flex:1 (was: sized to its own content only) — with the center clock
  // and two right-side buttons removed per live direction, this row no
  // longer has anything else claiming the header's freed width. Live-
  // requested "give more scroll space" for the switcher: without flex:1
  // here, that freed space just sits empty in the middle of the header
  // instead of the avatar strip actually getting to use it.
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, minWidth: 0 },
  brandCol: { gap: 2 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  brandText: { fontSize: KIOSK_TYPO.micro, fontWeight: '900', letterSpacing: 1.6, maxWidth: 130 },
  avatarScroll: { flex: 1, minWidth: 0 },
  avatarRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, alignItems: 'center' },
  avatarItem: { alignItems: 'center', gap: 3, width: 58 },
  avatarRing: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarRingWrap: { width: 42, height: 42 },
  avatarEmoji: { fontSize: 19 },
  pinBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  avatarName: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },

  right: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, marginLeft: 'auto' },
  weatherChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    height: KIOSK_HIT.min, minWidth: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
  },
  weatherIcon: { fontSize: 17 },
  weatherText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
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
