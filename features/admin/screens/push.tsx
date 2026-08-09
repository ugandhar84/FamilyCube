import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

const SEGMENTS = [
  { key: 'all',       label: 'All users',           icon: '👥' },
  { key: 'dog',       label: 'Dog owners',           icon: '🐶' },
  { key: 'cat',       label: 'Cat owners',           icon: '🐱' },
  { key: 'rabbit',    label: 'Rabbit owners',        icon: '🐰' },
  { key: 'bird',      label: 'Bird owners',          icon: '🐦' },
  { key: 'consented', label: 'AI consent users',     icon: '🤝' },
] as const;

type Segment = typeof SEGMENTS[number]['key'];

export default function PushScreen() {
  const { colors, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [showGoTop, setShowGoTop] = useState(false);
  const [title, setTitle]       = useState('');
  const [body, setBody]         = useState('');
  const [segment, setSegment]   = useState<Segment>('all');
  const [deep, setDeep]         = useState('');
  const [schedule, setSchedule] = useState(false);
  const [sendAt, setSendAt]     = useState('');
  const [sending, setSending]         = useState(false);
  const [preview, setPreview]         = useState(false);
  const [reachCount, setReachCount]   = useState<number | null>(null);
  const [reachLoading, setReachLoading] = useState(false);

  const inp = isDark ? '#2A2242' : '#F4F0FF';
  const sub = isDark ? '#9A8FC0' : '#8A7FAA';

  const getTokens = async (): Promise<string[]> => {
    let filterUserIds: string[] | null = null;

    if (segment !== 'all' && segment !== 'consented') {
      const { data: pets } = await supabase
        .from('pets').select('owner_id').eq('species', segment).eq('is_active', true);
      filterUserIds = [...new Set((pets ?? []).map((p: any) => p.owner_id))];
      if (!filterUserIds.length) return [];
    } else if (segment === 'consented') {
      const { data: profiles } = await supabase.from('profiles').select('id').eq('ai_mood_consent', true);
      filterUserIds = (profiles ?? []).map((p: any) => p.id);
      if (!filterUserIds.length) return [];
    }

    // Paginate in chunks of 1000 to avoid PostgREST row cap
    const PAGE = 1000;
    const tokens: string[] = [];
    let offset = 0;
    while (true) {
      let q = supabase.from('push_tokens').select('token').range(offset, offset + PAGE - 1);
      if (filterUserIds) q = q.in('user_id', filterUserIds);
      const { data } = await q;
      if (!data || data.length === 0) break;
      tokens.push(...data.map((t: any) => t.token).filter(Boolean));
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    return tokens;
  };

  // Re-estimate reach whenever segment changes
  useEffect(() => {
    setReachCount(null);
    let cancelled = false;
    setReachLoading(true);
    (async () => {
      try {
        const tokens = await getTokens();
        if (!cancelled) setReachCount(tokens.length);
      } catch { if (!cancelled) setReachCount(null); }
      finally  { if (!cancelled) setReachLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [segment]);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      showAlert('Required', 'Title and message are required.');
      return;
    }

    showAlert(
      `Send to ${SEGMENTS.find(s => s.key === segment)?.label}?`,
      `"${title}" — this will push to all matching devices.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: async () => {
          setSending(true);
          const tokens = await getTokens();

          if (!tokens.length) {
            showAlert('No recipients', 'No push tokens found for this segment.');
            setSending(false);
            return;
          }

          // Batch into chunks of 100 (Expo push limit)
          const chunks: string[][] = [];
          for (let i = 0; i < tokens.length; i += 100) chunks.push(tokens.slice(i, i + 100));

          let sent = 0;
          for (const chunk of chunks) {
            const messages = chunk.map(token => ({
              to: token, title, body,
              data: deep.trim() ? { url: deep.trim() } : {},
              sound: 'default',
            }));
            try {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messages),
              });
              sent += chunk.length;
            } catch { /* continue */ }
          }

          // Log to notifications table for audit
          await supabase.from('notification_logs').insert({
            user_id: null,
            type: 'broadcast',
            title,
            body,
            data: { segment, deep_link: deep || null, tokens_sent: sent },
            read: false,
          });

          setSending(false);
          showAlert('Sent!', `Notification dispatched to ${sent} device${sent !== 1 ? 's' : ''}.`);
          setTitle(''); setBody(''); setDeep('');
        }},
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled"
          onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}>

          {/* Segment */}
          <Text style={[s.label, { color: sub }]}>SEND TO</Text>
          <View style={s.chipRow}>
            {SEGMENTS.map(seg => (
              <TouchableOpacity
                key={seg.key}
                onPress={() => setSegment(seg.key)}
                style={[s.chip, { backgroundColor: segment === seg.key ? colors.primary : colors.card, borderColor: segment === seg.key ? colors.primary : colors.border }]}
              >
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: segment === seg.key ? '#fff' : sub }}>
                  {seg.icon} {seg.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reach estimate */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 4 }}>
            <Ionicons name="phone-portrait-outline" size={13} color={sub} />
            {reachLoading ? (
              <Text style={{ fontSize: TYPO.body, color: sub }}>Estimating reach…</Text>
            ) : reachCount !== null ? (
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: reachCount > 0 ? '#16A34A' : '#E24B4A' }}>
                ~{reachCount.toLocaleString()} device{reachCount !== 1 ? 's' : ''} will receive this
              </Text>
            ) : null}
          </View>

          {/* Title */}
          <Text style={[s.label, { color: sub, marginTop: 20 }]}>TITLE</Text>
          <TextInput
            style={[s.input, { backgroundColor: inp, color: colors.textPrimary, borderColor: colors.border }]}
            value={title} onChangeText={setTitle}
            placeholder="e.g. 🐾 New feature alert!" placeholderTextColor={sub}
            maxLength={65}
          />
          <Text style={[s.counter, { color: sub }]}>{title.length}/65</Text>

          {/* Body */}
          <Text style={[s.label, { color: sub, marginTop: 12 }]}>MESSAGE</Text>
          <TextInput
            style={[s.input, { backgroundColor: inp, color: colors.textPrimary, borderColor: colors.border, height: 90 }]}
            value={body} onChangeText={setBody}
            placeholder="What do you want to tell your users?" placeholderTextColor={sub}
            multiline textAlignVertical="top" maxLength={240}
          />
          <Text style={[s.counter, { color: sub }]}>{body.length}/240</Text>

          {/* Deep link */}
          <Text style={[s.label, { color: sub, marginTop: 12 }]}>DEEP LINK (optional)</Text>
          <TextInput
            style={[s.input, { backgroundColor: inp, color: colors.textPrimary, borderColor: colors.border }]}
            value={deep} onChangeText={setDeep}
            placeholder="e.g. /social or /admin/sponsored" placeholderTextColor={sub}
          />

          {/* Preview */}
          {(title || body) && (
            <View style={[s.preview, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: sub, marginBottom: 8, letterSpacing: 0.6 }}>NOTIFICATION PREVIEW</Text>
              <View style={[s.previewBubble, { backgroundColor: isDark ? '#2A2242' : '#F0EAFB' }]}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: sub, marginBottom: 2 }}>PawBond</Text>
                <Text style={[s.previewTitle, { color: colors.textPrimary }]}>{title || '…'}</Text>
                <Text style={[s.previewBody, { color: colors.textSecondary }]}>{body || '…'}</Text>
              </View>
            </View>
          )}

          {/* Send button */}
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: colors.primary }]}
            onPress={send} disabled={sending}
          >
            {sending
              ? <PawBondLoader size={20} bars={false} isDark={false} />
              : <Text style={s.sendBtnText}>Send Push Notification</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      {showGoTop && (
        <TouchableOpacity
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  scroll:       { padding: 16, paddingBottom: 48 },
  label:        { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  input:        { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: TYPO.body },
  counter:      { fontSize: TYPO.body, textAlign: 'right', marginTop: 3 },
  preview:      { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16 },
  previewBubble:{ borderRadius: 12, padding: 12 },
  previewTitle: { fontSize: TYPO.body, fontWeight: '700', marginBottom: 3 },
  previewBody:  { fontSize: TYPO.body, lineHeight: 18 },
  sendBtn:      { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  sendBtnText:  { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },
});
