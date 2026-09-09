/**
 * KioskLockScreen — shown after idle timeout or a manual lock. Live-flagged
 * gap this closes: the previous version was an ambient clock that unlocked
 * on any tap, straight back into whichever profile was last active — so
 * "locking" the kiosk didn't actually hide anyone's Hub, chores, or chat
 * from a passerby; it just dimmed to a clock for a moment. A real lock has
 * to require picking (and, where set, authenticating as) a profile before
 * revealing ANY member's Hub — this now mirrors the phone app's own
 * full-screen ProfilePickerScreen: a grid of every family member, tap to
 * select, PIN required only for members who have one set
 * (`pinEnabled && pin`, the same rule the phone app and KioskHeader's own
 * switcher use), via the same PinEntryModal.
 *
 * The clock stays as a small ambient strip above the grid — still useful
 * for the "wall-mounted tablet" glance-at-a-distance case — but is no
 * longer the whole screen, and no longer what unlocks it.
 *
 * Rendered inside its own native Modal, not a plain absolutely-positioned
 * View — the composer/editor sheets (KioskQuestComposer, KioskEventEditor,
 * etc.) and AskCubeChat all present via a real Modal too, which always
 * sits in its own native layer ABOVE ordinary views regardless of z-index.
 * A plain View here would render invisibly behind whichever of those
 * happened to still be open when the idle timer fired, leaving someone's
 * private chore edit or AI conversation visible through/under "locked."
 * Modal presentation order is last-in-on-top, so mounting this one fresh
 * exactly when `locked` flips true guarantees it wins regardless of what
 * else was already open.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from './kioskTheme';
import { useKioskColors } from './kioskPalette';
import { KioskAvatar } from './components/KioskAvatar';

export function KioskLockScreen({ familyName, members, onUnlock, colors }: {
  familyName: string;
  members: FamilyMember[];
  /** Called once a profile has been selected (and PIN-verified, if it has
   * one) — the caller is responsible for setActiveMember + actually
   * dropping the lock. */
  onUnlock: (memberId: string) => void;
  colors: any;
}) {
  const { k } = useKioskColors();
  const [now, setNow] = useState(new Date());
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const visibleMembers = members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending');

  const selectMember = (m: FamilyMember) => {
    if (m.pinEnabled && m.pin) {
      setPinTarget(m);
    } else {
      onUnlock(m.id);
    }
  };

  return (
    <Modal visible transparent={false} animationType="fade">
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <SafeAreaView style={s.safe}>
          <View style={s.clockBlock}>
            <Text
              style={[s.clock, { color: colors.textPrimary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              // The single most-read element on the whole device — announce
              // it as a header so a screen-reader user lands on it first.
              accessibilityRole="header"
            >
              {clock}
            </Text>
            <Text style={[s.date, { color: colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
              {date}
            </Text>
          </View>

          <View style={s.lockPill} accessibilityRole="text" accessibilityLabel={`Locked. ${familyName}.`}>
            <Lock size={14} color={colors.textTertiary} />
            <Text style={[s.lockPillText, { color: colors.textTertiary }]} numberOfLines={1}>
              Locked · {familyName}
            </Text>
          </View>

          <Text style={[s.prompt, { color: colors.textSecondary }]}>Tap your profile to continue</Text>

          <ScrollView
            style={s.gridScroll}
            contentContainerStyle={s.grid}
            showsVerticalScrollIndicator={false}
          >
            {visibleMembers.map(m => {
              const needsPin = !!m.pinEnabled && !!m.pin;
              // A member with no name at all would otherwise render an
              // empty tile with nothing to tap-identify or announce.
              const firstName = m.name?.trim().split(' ')[0] || 'Family member';
              return (
                <Pressable
                  key={m.id}
                  onPress={() => selectMember(m)}
                  style={s.tile}
                  accessibilityRole="button"
                  accessibilityLabel={firstName}
                  accessibilityHint={needsPin ? 'Requires a PIN to unlock' : 'Unlocks the kiosk as this person'}
                >
                  <View style={s.avatarRingWrap}>
                    <KioskAvatar
                      name={m.name}
                      emoji={m.emoji}
                      avatarUrl={m.avatarUrl}
                      siblings={visibleMembers.filter(x => x.id !== m.id).map(x => x.name)}
                      size={KIOSK_HIT.avatar}
                      ringWidth={3}
                      ringColor={colors.border}
                      bgColor={colors.surface}
                      k={k}
                    />
                    {needsPin && (
                      <View style={[s.pinBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Lock size={13} color={colors.textSecondary} />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[s.name, { color: colors.textPrimary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {firstName}
                  </Text>
                </Pressable>
              );
            })}
            {visibleMembers.length === 0 && (
              // Previously an entirely blank locked screen with no way
              // forward and nothing explaining why — a genuine dead end on
              // a device with no other navigation.
              <Text style={[s.emptyState, { color: colors.textTertiary }]}>
                No family profiles are set up yet. Add one from the Family Cube app on a phone.
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>

      <PinEntryModal
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={(member) => { onUnlock(member.id); setPinTarget(null); }}
        onCancel={() => setPinTarget(null)}
      />
    </Modal>
  );
}

// Scaled to the kiosk ladder: the clock is the one thing genuinely read
// from across a room, and the profile tiles are the one thing genuinely
// tapped from arm's length — both were sized for a phone before.
const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, alignItems: 'center' },
  clockBlock: { alignItems: 'center', marginTop: KIOSK_SPACE.xl, gap: 4, paddingHorizontal: KIOSK_SPACE.lg },
  clock: {
    fontSize: KIOSK_TYPO.clock, fontWeight: '200', letterSpacing: -2,
    fontVariant: ['tabular-nums'], lineHeight: KIOSK_TYPO.clock * 1.05,
  },
  date: { fontSize: KIOSK_TYPO.subheading, fontWeight: '500' },
  lockPill: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, marginTop: KIOSK_SPACE.md,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.sm,
  },
  lockPillText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  prompt: { fontSize: KIOSK_TYPO.body, fontWeight: '700', marginTop: KIOSK_SPACE.lg, marginBottom: KIOSK_SPACE.xs },
  // ScrollView needs BOTH a bounded style and its own contentContainerStyle
  // — the padding belongs on the content, the flex on the viewport.
  gridScroll: { flex: 1, width: '100%' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: KIOSK_SPACE.xl, padding: KIOSK_SPACE.xl, paddingTop: KIOSK_SPACE.md,
  },
  // 140-wide tile around a 96px avatar ring: this is the primary (and on a
  // locked kiosk, only) control on screen, tapped by kids and grandparents
  // standing at the counter.
  tile: { alignItems: 'center', gap: KIOSK_SPACE.xs, width: 120, minHeight: KIOSK_HIT.avatar + 34 },
  avatarRingWrap: { width: KIOSK_HIT.avatar, height: KIOSK_HIT.avatar },
  avatarRing: {
    width: KIOSK_HIT.avatar, height: KIOSK_HIT.avatar, borderRadius: KIOSK_HIT.avatar / 2, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 36 },
  pinBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: KIOSK_TYPO.body, fontWeight: '700', textAlign: 'center' },
  emptyState: {
    fontSize: KIOSK_TYPO.body, fontWeight: '600', textAlign: 'center',
    paddingHorizontal: KIOSK_SPACE.xl, maxWidth: 560,
  },
});
