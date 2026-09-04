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
import { TYPO } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';

export function KioskLockScreen({ familyName, members, onUnlock, colors }: {
  familyName: string;
  members: FamilyMember[];
  /** Called once a profile has been selected (and PIN-verified, if it has
   * one) — the caller is responsible for setActiveMember + actually
   * dropping the lock. */
  onUnlock: (memberId: string) => void;
  colors: any;
}) {
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
            <Text style={[s.clock, { color: colors.textPrimary }]}>{clock}</Text>
            <Text style={[s.date, { color: colors.textSecondary }]}>{date}</Text>
          </View>

          <View style={s.lockPill}>
            <Lock size={13} color={colors.textTertiary} />
            <Text style={[s.lockPillText, { color: colors.textTertiary }]}>Locked · {familyName}</Text>
          </View>

          <Text style={[s.prompt, { color: colors.textSecondary }]}>Tap your profile to continue</Text>

          <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
            {visibleMembers.map(m => (
              <Pressable key={m.id} onPress={() => selectMember(m)} style={s.tile}>
                <View style={[s.avatarRing, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={s.avatarEmoji}>{m.emoji ?? '👤'}</Text>
                  {!!m.pinEnabled && !!m.pin && (
                    <View style={[s.pinBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Lock size={10} color={colors.textSecondary} />
                    </View>
                  )}
                </View>
                <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>
                  {m.name.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
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

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, alignItems: 'center' },
  clockBlock: { alignItems: 'center', marginTop: 28, gap: 2 },
  clock: { fontSize: 56, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  date: { fontSize: 16, fontWeight: '600' },
  lockPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
  },
  lockPillText: { fontSize: 12, fontWeight: '700' },
  prompt: { fontSize: 17, fontWeight: '700', marginTop: 28, marginBottom: 8 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 22, padding: 28, paddingTop: 12,
  },
  tile: { alignItems: 'center', gap: 8, width: 100 },
  avatarRing: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 32 },
  pinBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700' },
});
