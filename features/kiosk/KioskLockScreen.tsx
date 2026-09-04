/**
 * KioskLockScreen — shown after idle timeout or a manual lock. Doubles as
 * an ambient clock display (a wall-mounted tablet showing nothing useful
 * while "locked" wastes the one thing it's always visible for), and taps
 * anywhere to unlock — no PIN, matching kiosk mode's other PIN-free
 * interactions on this shared device (see useKioskIdleLock's own comment
 * for why).
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
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function KioskLockScreen({ familyName, onUnlock, colors }: {
  familyName: string; onUnlock: () => void; colors: any;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Modal visible transparent={false} animationType="fade">
      <Pressable style={[s.root, { backgroundColor: colors.background }]} onPress={onUnlock}>
        <SafeAreaView style={s.center}>
          <Text style={[s.clock, { color: colors.textPrimary }]}>{clock}</Text>
          <Text style={[s.date, { color: colors.textSecondary }]}>{date}</Text>
          <Text style={[s.familyName, { color: colors.primary }]}>{familyName}</Text>
          <Text style={[s.hint, { color: colors.textTertiary }]}>Tap anywhere to open</Text>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  clock: { fontSize: 72, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  date: { fontSize: 20, fontWeight: '600' },
  familyName: { fontSize: 17, fontWeight: '800', marginTop: 18 },
  hint: { fontSize: 13, fontWeight: '600', marginTop: 40 },
});
