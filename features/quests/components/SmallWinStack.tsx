/**
 * SmallWinStack — recent wins from the family as a stack of cards. Thanking someone is optional: swipe a card away to dismiss
 * it (it stays dismissed), or tap "Send appreciation" to thank them. The next card slides up underneath.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Animated, PanResponder, Dimensions, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Win { id: string; title: string; winnerName: string }

const SWIPE_AWAY = 90;
const SCREEN_W = Dimensions.get('window').width;
const key = (memberId: string) => `familycube_dismissed_wins_${memberId}`;

export default function SmallWinStack({ wins, memberId, colors, onSend }: {
  wins: Win[]; memberId: string; colors: any; onSend: (id: string, note?: string) => void;
}) {
  const [note, setNote] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key(memberId)).then(raw => { if (alive) { try { setDismissed(new Set(JSON.parse(raw ?? '[]'))); } catch { /* start clean */ } setLoaded(true); } }).catch(() => setLoaded(true));
    return () => { alive = false; };
  }, [memberId]);

  const visible = useMemo(() => wins.filter(w => !dismissed.has(w.id)).slice(0, 3), [wins, dismissed]);
  const top = visible[0];

  const dismiss = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev); next.add(id);
      AsyncStorage.setItem(key(memberId), JSON.stringify([...next].slice(-200))).catch(() => {});
      return next;
    });
    x.setValue(0);
    setNote('');
    setSentId(null);
  };

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: Animated.event([null, { dx: x }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > SWIPE_AWAY && topIdRef.current) {
        const id = topIdRef.current;
        Animated.timing(x, { toValue: g.dx > 0 ? SCREEN_W : -SCREEN_W, duration: 180, useNativeDriver: false }).start(() => dismiss(id));
      } else {
        Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
      }
    },
  }), [x, memberId]);
  const topIdRef = useRef<string | null>(null);
  topIdRef.current = top?.id ?? null;

  if (!loaded || !top) return null;
  const rotate = x.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ['-12deg', '0deg', '12deg'] });
  const opacity = x.interpolate({ inputRange: [-SCREEN_W, -SWIPE_AWAY, 0, SWIPE_AWAY, SCREEN_W], outputRange: [0.2, 0.7, 1, 0.7, 0.2] });
  const behind = visible.slice(1);

  return (
    <View style={{ marginHorizontal: 14, marginTop: 14, paddingBottom: behind.length * 8 }}>
      {behind.map((w, i) => (
        <View key={w.id} pointerEvents="none" style={{
          position: 'absolute', left: 8 * (i + 1), right: 8 * (i + 1), top: 8 * (i + 1), bottom: 0,
          borderRadius: 22, backgroundColor: colors.amberLight, opacity: 0.55 - i * 0.15,
        }} />
      ))}
      <Animated.View {...pan.panHandlers} style={{ padding: 18, borderRadius: 22, backgroundColor: colors.amberLight, opacity, transform: [{ translateX: x }, { rotate }] }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.amber }}>
          SMALL WIN{visible.length > 1 ? ` · ${wins.filter(w => !dismissed.has(w.id)).length} to see` : ''}
        </Text>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginTop: 5, marginBottom: 4 }}>
          {top.winnerName} completed "{top.title}"
        </Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>Swipe to dismiss, or say thanks.</Text>
        {sentId === top.id ? (
          <Text style={{ marginTop: 12, fontSize: 13, fontWeight: '800', color: colors.success }}>Thanks sent ✓</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <TextInput
              value={note} onChangeText={setNote} maxLength={30} returnKeyType="send"
              placeholder="Short note (optional)" placeholderTextColor={colors.textTertiary}
              onSubmitEditing={() => { Keyboard.dismiss(); onSend(top.id, note.trim() || undefined); setSentId(top.id); setTimeout(() => dismiss(top.id), 900); }}
              style={{ flex: 1, minHeight: 40, borderRadius: 12, paddingHorizontal: 12, fontSize: 13, color: colors.textPrimary, backgroundColor: colors.card }}
            />
            <TouchableOpacity
              onPress={() => { Keyboard.dismiss(); onSend(top.id, note.trim() || undefined); setSentId(top.id); setTimeout(() => dismiss(top.id), 900); }}
              accessibilityRole="button" accessibilityLabel="Send appreciation"
              style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.amber }}>Send ✨</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
}
