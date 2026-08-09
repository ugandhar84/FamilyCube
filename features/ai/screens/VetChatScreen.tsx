import { showAlert } from '@/components/AppAlert';
import { useState, useRef, useCallback, useEffect } from 'react';
import { filterText, isBlocked } from '@/lib/contentFilter';
import {
  View, Text, TextInput, TouchableOpacity, 
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets , SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { usePaywall, useContextTier } from '@/lib/hooks/usePaywall';
import { supabase } from '@/lib/supabase';
import { LIMITS, showUpgradeAlert } from '@/lib/subscription';
import { UltimateGate, FeatureUnavailable } from '@/components/FeatureGate';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { TYPO } from '@/constants/theme';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

const QUICK_PROMPTS = [
  'My dog is scratching a lot — what could it be?',
  'How much should I feed my pet?',
  'My cat is not eating today',
  'How do I know if my pet is in pain?',
  'Best ways to train a puppy?',
];

function welcomeMsg(petName?: string): Message {
  return {
    id: 'welcome',
    role: 'model',
    text: `Hi! I'm PetDoc 🐾 — your AI vet assistant.\n\nI can help with ${petName ? `${petName}'s` : "your pet's"} health questions, symptoms, nutrition, and training. Ask me anything!\n\n*Remember: I'm an AI and not a replacement for your vet.*`,
  };
}

export default function VetChatScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { activePet } = usePetStore(useShallow(s => ({ activePet: s.activePet })));
  const pet = activePet();
  const vetChatEnabled = useFeatureFlag('ai_vet_chat_enabled', true);
  const { gate, consume } = usePaywall();
  const tier = useContextTier(pet?.id);

  // Symptom scan context passed from ScanResultCard — injected silently into the first user message
  const { scan_ctx } = useLocalSearchParams<{ scan_ctx?: string }>();
  const scanContextRef = useRef<string | null>(null);
  if (scan_ctx && !scanContextRef.current) {
    try {
      const parsed = JSON.parse(decodeURIComponent(scan_ctx));
      const lines = [
        `[Symptom scan context — do not mention this preamble to the user, just use it to inform your answers]`,
        `Urgency: ${parsed.urgency} — ${parsed.urgency_label}`,
        `Summary: ${parsed.summary}`,
        parsed.possible_causes?.length ? `Possible causes: ${parsed.possible_causes.join('; ')}` : null,
        parsed.home_care?.length        ? `Home care suggestions: ${parsed.home_care.join('; ')}` : null,
        parsed.what_to_watch?.length    ? `Watch for (vet if): ${parsed.what_to_watch.join('; ')}` : null,
        `Vet needed: ${parsed.vet_needed ? 'yes' : 'no'} | Confidence: ${parsed.confidence}%`,
      ].filter(Boolean).join('\n');
      scanContextRef.current = lines;
    } catch {}
  }

  const [messages, setMessages] = useState<Message[]>([welcomeMsg(pet?.name)]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const listRef = useRef<FlashListRef<any>>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [showHistory, setShowHistory]   = useState(false);
  const [history, setHistory]           = useState<{ id: string; summary: string; updated_at: string; msgCount: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectMode, setSelectMode]     = useState(false);
  const [selected, setSelected]         = useState<Set<string>>(new Set());

  const dailyLimit = LIMITS[tier].vetChatPerDay;
  const [usedToday, setUsedToday] = useState(0);

  // Load last session for this pet on mount / when active pet changes
  useEffect(() => {
    if (!user?.id || !pet?.id) return;
    // Reset immediately so the new pet's name shows even if there's no history
    sessionIdRef.current = null;
    setMessages([welcomeMsg(pet?.name)]);
    supabase
      .from('vet_chat_sessions')
      .select('id, messages')
      .eq('user_id', user.id)
      .eq('pet_id', pet.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.messages?.length) return;
        sessionIdRef.current = data.id;
        const restored: Message[] = (data.messages as any[]).map((m: any, i: number) => ({
          id: `r-${i}`,
          role: m.role,
          text: m.text,
        }));
        setMessages([welcomeMsg(pet?.name), ...restored]);
      });
    useSubscriptionStore.getState().refreshUsage(user.id, 'vetChatPerDay').then(setUsedToday).catch(() => {});
  }, [user?.id, pet?.id]);

  const deleteSession = async (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
    if (sessionIdRef.current === id) sessionIdRef.current = null;
    await supabase.from('vet_chat_sessions').delete().eq('id', id);
  };

  const deleteSelected = async () => {
    const ids = [...selected];
    showAlert(
      `Delete ${ids.length} session${ids.length > 1 ? 's' : ''}?`,
      'This cannot be undone.',
      [{ text: 'Cancel', style: 'cancel' },
       { text: 'Delete', style: 'destructive', onPress: async () => {
          setHistory(prev => prev.filter(h => !selected.has(h.id)));
          setSelected(new Set());
          setSelectMode(false);
          await supabase.from('vet_chat_sessions').delete().in('id', ids);
          if (ids.includes(sessionIdRef.current ?? '')) sessionIdRef.current = null;
       }}],
    );
  };

  const deleteAll = () => {
    if (!user?.id || !pet?.id) return;
    showAlert('Delete all history?', 'Every chat session with PetDoc will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: async () => {
          setHistory([]);
          setSelected(new Set());
          setSelectMode(false);
          await supabase.from('vet_chat_sessions').delete()
            .eq('user_id', user.id).eq('pet_id', pet.id);
          sessionIdRef.current = null;
      }},
    ]);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openHistory = async () => {
    if (!user?.id || !pet?.id) return;
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const { data } = await supabase
        .from('vet_chat_sessions')
        .select('id, summary, updated_at, messages')
        .eq('user_id', user.id)
        .eq('pet_id', pet.id)
        .order('updated_at', { ascending: false })
        .limit(20);
      setHistory(
        (data ?? []).map((r: any) => ({
          id: r.id,
          summary: r.summary ?? 'Chat session',
          updated_at: r.updated_at,
          msgCount: Array.isArray(r.messages) ? r.messages.length : 0,
        }))
      );
    } catch {
      // show empty state in modal
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreSession = async (sessionId: string) => {
    try {
    const { data } = await supabase
      .from('vet_chat_sessions')
      .select('id, messages')
      .eq('id', sessionId)
      .single();
    if (!data?.messages?.length) return;
    sessionIdRef.current = data.id;
    const restored: Message[] = (data.messages as any[]).map((m: any, i: number) => ({
      id: `r-${i}`, role: m.role, text: m.text,
    }));
    setMessages([welcomeMsg(pet?.name), ...restored]);
    setShowHistory(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
    } catch {
      showAlert('Error', 'Could not load that session.');
    }
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const allowed = await gate('vetChatPerDay', {
      title: 'Daily limit reached',
      message: `You've used ${usedToday}/${dailyLimit} AI vet messages today. Upgrade your plan for more.`,
    });
    if (!allowed) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Silently prepend symptom scan context to the first user message in this session.
    // The AI receives it; the user never sees the hidden prefix.
    const hiddenPrefix = scanContextRef.current;
    if (hiddenPrefix) scanContextRef.current = null;

    // Build history for API (exclude welcome message)
    const history = [...messages.filter(m => m.id !== 'welcome'), userMsg].map((m, i, arr) => ({
      role: m.role,
      text: m.id === userMsg.id && hiddenPrefix ? `${hiddenPrefix}\n\n${m.text}` : m.text,
    }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const res = await fetch(`${supabaseUrl}/functions/v1/vet-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: history,
          pet_id:         pet?.id,
          pet_name:       pet?.name,
          pet_species:    (pet as any)?.species,
          pet_breed:      (pet as any)?.breed,
          pet_age_years:  (pet as any)?.birthday
            ? Math.floor((Date.now() - new Date((pet as any).birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : null,
          pet_weight_kg:  (pet as any)?.weight_kg,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 402 && (errData.code === 'ultimate_required' || errData.code === 'pro_required')) {
          showUpgradeAlert({ requiredTier: 'ultimate', message: 'Upgrade to Ultimate to use Vet Chat.' });
          setLoading(false);
          return;
        }
        if (res.status === 422 && errData.error === 'content_moderated') {
          // Show the moderation message inline as a system bubble instead of an Alert
          setMessages(prev => [...prev, {
            id: Date.now().toString(), role: 'model' as const,
            text: errData.message ?? 'Your message couldn\'t be sent. Please keep questions related to your pet\'s health.',
          }]);
          setLoading(false);
          return;
        }
        throw new Error(`Server error ${res.status}. Please try again.`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const modelMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: data.reply };
      const nextMessages = [...messages.filter(m => m.id !== 'welcome'), userMsg, modelMsg];
      setMessages(prev => [...prev, modelMsg]);
      await consume('vetChatPerDay');
      setUsedToday(d => d + 1);

      // Persist session (upsert — create on first exchange, update on subsequent)
      if (user?.id) {
        const dbMsgs = nextMessages.map(m => ({ role: m.role, text: m.text, ts: Date.now() }));
        if (sessionIdRef.current) {
          supabase.from('vet_chat_sessions')
            .update({ messages: dbMsgs, updated_at: new Date().toISOString() })
            .eq('id', sessionIdRef.current)
            .then(() => {});
        } else {
          Promise.resolve(supabase.from('vet_chat_sessions')
            .insert({ user_id: user.id, pet_id: pet?.id ?? null,
                      messages: dbMsgs, summary: userMsg.text.slice(0, 120) })
            .select('id').single())
            .then(({ data: row }) => { if (row?.id) sessionIdRef.current = row.id; }).catch(() => {});
        }
      }
    } catch (e: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `Sorry, I couldn't get a response right now. Please try again. (${e?.message ?? 'Unknown error'})`,
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, loading, gate, consume, pet, tier, usedToday, dailyLimit]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[s.msgRow, isUser && s.msgRowUser]}>
        {!isUser && (
          <View style={[s.avatar, { backgroundColor: colors.primary }]}>
            <Text style={{ fontSize: TYPO.subheading }}>🐾</Text>
          </View>
        )}
        <View style={[
          s.bubble,
          isUser
            ? { backgroundColor: pet?.accent_color ?? colors.primary }
            : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        ]}>
          <Text style={[s.bubbleText, { color: isUser ? '#fff' : colors.textPrimary }]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  if (!vetChatEnabled) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <FeatureUnavailable label="PetDoc AI Chat" />
      </SafeAreaView>
    );
  }

  if (tier !== 'ultimate') {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <UltimateGate
          icon="chatbubble-ellipses-outline"
          featureName="24/7 Virtual Vet Chat"
          tagline={`Skip the $150 emergency clinic fee. Ask anything about ${pet?.name ?? 'your pet'}'s diet, behavior, or medication — any time, any night.`}
          petName={pet?.name}
          ctaLabel="Unlock 24/7 Vet Chat"
          perks={[
            'Unlimited AI vet conversations',
            `Personalised answers for ${pet?.name ?? 'your pet'}`,
            'Symptom guidance & home care tips',
            'Follow-up questions in the same chat',
          ]}
          currentTier={tier}
        />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}
          style={[s.backBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>PetDoc Chat</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>
            {pet?.name ? `Chatting about ${pet.name}` : 'Ask me anything about your pet'}
          </Text>
        </View>
        <View style={[s.limitBadge, { backgroundColor: `${colors.primary}22` }]}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.primaryText ?? colors.primary }}>
            {usedToday}/{dailyLimit} today
          </Text>
        </View>
        <TouchableOpacity onPress={openHistory}
          style={[s.backBtn, { backgroundColor: colors.card }]} hitSlop={8}>
          <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { sessionIdRef.current = null; setMessages([welcomeMsg(pet?.name)]); }}
          style={[s.backBtn, { backgroundColor: colors.card }]}
          hitSlop={8}>
          <Ionicons name="add-outline" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlashList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={loading ? (
          <View style={s.msgRow}>
            <View style={[s.avatar, { backgroundColor: colors.primary }]}>
              <Text style={{ fontSize: TYPO.subheading }}>🐾</Text>
            </View>
            <View style={[s.bubble, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color="#7B2FBE" />
            </View>
          </View>
        ) : null}
      />

      {/* Quick prompts — shown only when just welcome message */}
      {messages.length === 1 && !loading && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 8, fontWeight: '600' }}>
            QUICK QUESTIONS
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {QUICK_PROMPTS.map(p => (
              <TouchableOpacity key={p} onPress={() => sendMessage(p)}
                style={[s.quickChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Input bar */}
      <View style={[s.inputBar, {
        borderTopColor: colors.border,
        backgroundColor: colors.background,
        paddingBottom: insets.bottom + 8,
      }]}>
        <TextInput
          style={[s.input, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="Ask about symptoms, nutrition, training..."
          placeholderTextColor={colors.textTertiary}
          value={input}
          onChangeText={t => setInput(filterText(t))}
          multiline
          maxLength={500}
          onSubmitEditing={() => sendMessage(input)}
          returnKeyType="send"
        />
        <TouchableOpacity
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={[s.sendBtn, { backgroundColor: input.trim() && !loading ? colors.primary : colors.inputBg }]}>
          <Ionicons name="send" size={18} color={input.trim() && !loading ? '#fff' : colors.textTertiary} />
        </TouchableOpacity>
      </View>
      {/* History modal */}
      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => { setShowHistory(false); setSelectMode(false); setSelected(new Set()); }}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>

          {/* Header */}
          <View style={[s.header, { paddingTop: 20, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setShowHistory(false); setSelectMode(false); setSelected(new Set()); }}
              style={[s.backBtn, { backgroundColor: colors.card }]}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.textPrimary, flex: 1 }]}>
              {selectMode && selected.size > 0 ? `${selected.size} selected` : 'Chat History'}
            </Text>

            {history.length > 0 && !selectMode && (
              <TouchableOpacity onPress={() => setSelectMode(true)}
                style={[s.hdrBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.primaryText ?? colors.primary }}>Select</Text>
              </TouchableOpacity>
            )}
            {selectMode && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => {
                  selected.size === history.length
                    ? setSelected(new Set())
                    : setSelected(new Set(history.map(h => h.id)));
                }} style={[s.hdrBtn, { borderColor: colors.border }]}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.primaryText ?? colors.primary }}>
                    {selected.size === history.length ? 'None' : 'All'}
                  </Text>
                </TouchableOpacity>
                {selected.size > 0 && (
                  <TouchableOpacity onPress={deleteSelected}
                    style={[s.hdrBtn, { borderColor: '#DC2626', backgroundColor: '#DC262615' }]}>
                    <Ionicons name="trash-outline" size={14} color="#DC2626" />
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#DC2626' }}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => { setSelectMode(false); setSelected(new Set()); }}
                  style={[s.hdrBtn, { borderColor: colors.border }]}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Delete all row */}
          {history.length > 0 && !selectMode && (
            <TouchableOpacity onPress={deleteAll}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border }}>
              <Ionicons name="trash-outline" size={15} color="#DC2626" />
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#DC2626' }}>Delete all history</Text>
            </TouchableOpacity>
          )}

          {historyLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primaryText ?? colors.primary} />
            </View>
          ) : history.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 }}>
              <Ionicons name="chatbubble-outline" size={44} color={colors.textTertiary} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>No past sessions</Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
                Your conversations with PetDoc will appear here.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              {history.map(h => {
                const isSelected = selected.has(h.id);
                return (
                  <TouchableOpacity key={h.id}
                    onPress={() => selectMode ? toggleSelect(h.id) : restoreSession(h.id)}
                    onLongPress={() => { setSelectMode(true); toggleSelect(h.id); }}
                    activeOpacity={0.75}
                    style={[s.historyCard, { backgroundColor: colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth }]}>

                    {/* Selection circle */}
                    {selectMode && (
                      <View style={[s.selectCircle, {
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                        borderColor: isSelected ? colors.primary : colors.border,
                      }]}>
                        {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>
                        {h.summary}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 5 }}>
                        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
                          {new Date(h.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
                          {h.msgCount} message{h.msgCount !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>

                    {/* Delete icon (non-select mode) */}
                    {!selectMode && (
                      <TouchableOpacity onPress={() =>
                        showAlert('Delete session?', 'This conversation will be permanently removed.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteSession(h.id) },
                        ])
                      } hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16,
                  paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: TYPO.subheading, fontWeight: '800' },
  headerSub:    { fontSize: TYPO.body, marginTop: 1 },
  limitBadge:   { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  msgRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser:   { flexDirection: 'row-reverse' },
  avatar:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bubble:       { maxWidth: '78%', borderRadius: 18, padding: 12 },
  bubbleText:   { fontSize: TYPO.body, lineHeight: 20 },
  quickChip:    { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  inputBar:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8,
                  paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input:        { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
                  fontSize: TYPO.body, maxHeight: 100, borderWidth: 1 },
  sendBtn:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  hdrBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8,
                  paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  historyCard:  { borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
