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
import { useFamilyStore } from '@/store/familyStore';
import { resolveSpeechLocale } from '@/lib/units';
import { endCallAlert, waitForAudioSession, routeAudioToSpeaker } from '@/lib/callAlert';

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
  // Selecting each array separately keeps stable references — spreading
  // them into a new array inside the selector ([...a, ...b]) returns a
  // fresh array identity on every call, which breaks useSyncExternalStore's
  // snapshot-caching contract and causes an infinite render loop the
  // instant this screen actually mounts (never triggered until the
  // cold-start CallKit answer flow started working).
  const dayEvents = useEventStore(s => s.dayEvents);
  const rangeEvents = useEventStore(s => s.rangeEvents);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);

  const item = itemType === 'chore'
    ? chores.find(c => c.id === itemId)
    : (dayEvents.find(e => e.id === itemId) ?? rangeEvents.find(e => e.id === itemId));
  const title = item?.title ?? 'Your reminder';

  const listener = members.find(m => m.id === activeMemberId);
  const creatorId = itemType === 'chore' ? (item as any)?.createdById : (item as any)?.createdBy;
  const creator = members.find(m => m.id === creatorId);
  const firstName = (n?: string) => n?.split(' ')[0];

  const pulse = useRef(new Animated.Value(1)).current;
  // A ref, not useState — React Strict Mode's dev-only mount→cleanup→
  // remount of every effect was breaking this when it was state: the first
  // (throwaway) mount called setSpoken(true) and got cleaned up before
  // waitForAudioSession() resolved; by the time the SECOND, real mount ran,
  // `spoken` was already true from the first one, so the guard skipped
  // speaking entirely on the mount that actually survives. A ref keyed by
  // item id survives the double-invoke correctly: cleanup cancels the
  // aborted first attempt via its own local `cancelled` closure (unrelated
  // to this ref), and the ref only blocks a genuine repeat for the SAME
  // item, not the StrictMode remount of the same logical attempt.
  const spokenForItemId = useRef<string | null>(null);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  useEffect(() => {
    const effectId = Math.random().toString(36).slice(2, 8);
    console.log(`[call-alert][${effectId}] speak effect MOUNTED — spokenForItemId=`, spokenForItemId.current, 'item=', !!item, 'itemId=', itemId, 'itemType=', itemType);
    if (!item || spokenForItemId.current === item.id) return;
    const dueLabel = itemType === 'chore' ? (item as any).dueTime : (item as any).time;
    const kind = itemType === 'chore' ? 'chore' : 'event';
    const greeting = listener ? `Hi ${firstName(listener.name)}, ` : 'Hi, ';
    const from = creator && creator.id !== listener?.id
      ? ` It was set by ${firstName(creator.name)}.`
      : '';
    const text = `${greeting}this is your Family Cube reminder for the ${kind} "${title}"${dueLabel ? `, due at ${dueLabel}` : ''}.${from}`;
    let cancelled = false;
    console.log(`[call-alert][${effectId}] waiting for audio session before speaking:`, text);
    // CallKit still owns the audio session for a moment after Answer —
    // speaking before it hands control back (didActivateAudioSession) is
    // silently dropped, no error, just no sound. See waitForAudioSession.
    waitForAudioSession().then(async () => {
      console.log(`[call-alert][${effectId}] audio session ready, cancelled=`, cancelled);
      if (cancelled) return;
      // CallKit's call-oriented audio session can route Speech's output to
      // the earpiece or a connected accessory instead of the speaker —
      // audio "plays" (onStart fires, no error) but is inaudible held
      // normally. Force it to the speaker before speaking.
      if (callUUID) await routeAudioToSpeaker(callUUID);
      if (cancelled) return;
      // Mark as spoken only once we're actually committing to speak — not
      // at effect-start, which would poison a StrictMode-cancelled first
      // attempt into blocking the real second mount from ever speaking.
      spokenForItemId.current = item.id;
      // Repeats up to 3 times total (1 initial + 2 repeats), 1.5s apart —
      // without this, a person who answers but doesn't immediately tap
      // Done/Dismiss is left on a silently-connected call after the first
      // (and only) reading, indistinguishable from the call having dropped.
      const MAX_SPEAKS = 3;
      const REPEAT_GAP_MS = 1500;
      let speakCount = 0;
      const speakOnce = () => {
        if (cancelled) return;
        speakCount++;
        console.log(`[call-alert][${effectId}] calling Speech.speak now (attempt ${speakCount}/${MAX_SPEAKS})`);
        Speech.speak(text, {
          language: resolveSpeechLocale(),
          rate: 0.95,
          onStart: () => console.log(`[call-alert][${effectId}] Speech onStart (attempt ${speakCount})`),
          onDone: () => {
            console.log(`[call-alert][${effectId}] Speech onDone (attempt ${speakCount})`);
            if (cancelled || speakCount >= MAX_SPEAKS) return;
            setTimeout(speakOnce, REPEAT_GAP_MS);
          },
          onError: (e) => console.warn(`[call-alert][${effectId}] Speech onError`, e),
        });
      };
      speakOnce();
    });
    return () => {
      console.log(`[call-alert][${effectId}] speak effect CLEANUP fired`);
      cancelled = true;
      Speech.stop();
    };
    // item is a fresh object reference every render (Array.find over a
    // store-derived array) even when nothing relevant changed — depending
    // on the whole object re-ran this effect (cancelling the in-flight
    // waitForAudioSession() wait, so Speech.speak() never actually fired)
    // every time an unrelated realtime update touched the chores/events
    // array, which happens almost immediately after this screen mounts.
    // item?.id is a stable primitive across those re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // Dismiss just closes the call — it never touched the chore/event.
  const dismiss = async () => {
    Speech.stop();
    if (callUUID) await endCallAlert(callUUID);
    router.back();
  };

  // Done previously did the exact same thing as Dismiss (close the call
  // only) despite the checkmark icon and "Done" label implying the task
  // itself was completed — a real gap, since a parent tapping Done here
  // reasonably expects the chore to actually be marked done, not just the
  // call to hang up.
  //
  // A chore requiring photo proof can't be completed from this screen (no
  // camera UI here) — Done instead hands off to the real Submit flow on the
  // Chores tab, same as if they'd tapped the chore there. A chore with no
  // photo requirement submits directly via the same submitChore path the
  // in-app Submit button uses. Events have no universal "done" concept
  // outside the helper/driver-specific flow (which this alert isn't scoped
  // to), so Done behaves the same as Dismiss for events.
  const done = async () => {
    Speech.stop();
    if (callUUID) await endCallAlert(callUUID);
    if (itemType === 'chore' && item) {
      const chore = item as any;
      if (chore.requiresPhotoProof) {
        router.replace({ pathname: '/(tabs)/quests', params: { questId: itemId } } as any);
        return;
      }
      useChoreStore.getState().submitChore(itemId!, {});
    }
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
        <Pressable onPress={done} style={[styles.actionBtn, { backgroundColor: colors.success }]}>
          <Check size={26} color="#fff" />
          <Text style={styles.actionLabel}>Done</Text>
        </Pressable>
        <Pressable onPress={dismiss} style={[styles.actionBtn, { backgroundColor: colors.danger }]}>
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
