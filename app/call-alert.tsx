/**
 * call-alert — post-answer screen for a call-style chore/event reminder.
 * The native ringing UI (CallKit/ConnectionService) already happened before
 * this screen ever mounts; landing here means the person tapped Answer.
 * Reads the item aloud via TTS, then offers Snooze (10/5/on-time re-ring)
 * or Done.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as Speech from 'expo-speech';
import { PhoneOff, Bell, Check } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useEventStore } from '@/store/eventStore';
import { resolveSpeechLocale } from '@/lib/units';
import { endCallAlert } from '@/lib/callAlert';

const SNOOZE_TIERS = [
  { label: 'On time', minutes: 0 },
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
];

export default function CallAlertScreen() {
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ itemType?: string; itemId?: string; callUUID?: string }>();
  const itemType = params.itemType as 'chore' | 'event' | undefined;
  const itemId = params.itemId;
  const callUUID = params.callUUID;

  const chores = useChoreStore(s => s.chores);
  const events = useEventStore(s => [...s.dayEvents, ...s.rangeEvents]);

  const item = itemType === 'chore'
    ? chores.find(c => c.id === itemId)
    : events.find(e => e.id === itemId);
  const title = item?.title ?? 'Your reminder';

  const pulse = useRef(new Animated.Value(1)).current;
  const [spoken, setSpoken] = useState(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  useEffect(() => {
    if (spoken || !item) return;
    setSpoken(true);
    const dueLabel = itemType === 'chore' ? (item as any).dueTime : (item as any).time;
    const text = `Reminder: ${title}${dueLabel ? `, due at ${dueLabel}` : ''}.`;
    Speech.speak(text, { language: resolveSpeechLocale(), rate: 0.95 });
    return () => { Speech.stop(); };
  }, [item, spoken]);

  const finish = async () => {
    Speech.stop();
    if (callUUID) await endCallAlert(callUUID);
    router.back();
  };

  const snooze = async (minutes: number) => {
    Speech.stop();
    if (callUUID) await endCallAlert(callUUID);
    // Re-arms the same item for another ring `minutes` from now by clearing
    // its call_reminder_log row — the sweeper picks it up again once the
    // new lead-time window (now + minutes, relative to the still-unchanged
    // due time) is reached. A snoozed-to-0 ("on time") request just clears
    // the dedupe row immediately so the very next sweep tick re-fires.
    if (itemType && itemId) {
      try {
        const { supabase } = await import('@/lib/supabase');
        await supabase.from('call_reminder_log').delete().eq('item_type', itemType).eq('item_id', itemId);
      } catch { /* best-effort — worst case the item just doesn't re-ring */ }
    }
    router.back();
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: isDark ? '#0B0F1A' : '#1E2D6B' }]}>
      <View style={styles.center}>
        <Animated.View style={[styles.avatarRing, { transform: [{ scale: pulse }], borderColor: colors.primary + '55' }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Bell size={40} color="#fff" />
          </View>
        </Animated.View>
        <Text style={styles.kicker}>FAMILY CUBE REMINDER</Text>
        <Text style={styles.title} numberOfLines={3}>{title}</Text>
        {!!item && (
          <Text style={styles.subtitle}>
            {itemType === 'chore' ? 'Chore' : 'Event'} due {itemType === 'chore' ? (item as any).dueTime : (item as any).time}
          </Text>
        )}
      </View>

      <View style={styles.snoozeRow}>
        {SNOOZE_TIERS.map(t => (
          <Pressable key={t.minutes} onPress={() => snooze(t.minutes)} style={styles.snoozeChip}>
            <Text style={styles.snoozeChipText}>Snooze {t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actionRow}>
        <Pressable onPress={finish} style={[styles.actionBtn, { backgroundColor: colors.success }]}>
          <Check size={26} color="#fff" />
          <Text style={styles.actionLabel}>Done</Text>
        </Pressable>
        <Pressable onPress={finish} style={[styles.actionBtn, { backgroundColor: colors.danger }]}>
          <PhoneOff size={26} color="#fff" />
          <Text style={styles.actionLabel}>Dismiss</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between', paddingVertical: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  avatarRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  snoozeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 24 },
  snoozeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)' },
  snoozeChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', justifyContent: 'center', gap: 40 },
  actionBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 },
});
