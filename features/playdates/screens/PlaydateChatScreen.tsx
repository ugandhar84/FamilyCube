import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Linking, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { format, isPast, isToday, parseISO, formatDistanceToNow, differenceInYears } from 'date-fns';
import { toTitle } from '@/lib/format';
import { containsProfanity, censorText } from '@/lib/profanityFilter';
import { supabase } from '@/lib/supabase';
import { claimChannel } from '@/lib/realtimeChannel';
import { markChatRead } from '@/lib/db';
import { useQueryClient } from '@tanstack/react-query';
import { appendMessageToCache, patchMessageInCache } from '@/lib/hooks/useChat';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { FeatureUnavailable } from '@/components/FeatureGate';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import PetHeaderChip from '@/components/PetHeaderChip';
import BottomSheet from '@/components/BottomSheet';
import { uses24HourClock } from '@/lib/units';
import { EmojiAvatar } from '@/features/playdates/components/EmojiAvatar';
import { CalendarIcon } from '@/features/playdates/components/CalendarIcon';
import { EmojiPet } from '@/features/playdates/types';
import { ChatMessageList } from '@/features/playdates/components/ChatMessageList';
import { PendingProposalBanner } from '@/features/playdates/components/PendingProposalBanner';
import { TYPO } from '@/constants/theme';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  sender_id: string;
  message_type: 'text' | 'proposal' | 'system';
  content: string;
  proposed_date?: string | null;
  proposed_time?: string | null;
  proposed_location?: string | null;
  proposal_status?: 'pending' | 'accept' | 'reject' | 'cancelled' | null;
  created_at: string;
}

interface PlaydateChat {
  id: string;
  status: 'negotiating' | 'agreed' | 'cancelled' | 'declined';
  agreed_date?: string | null;
  agreed_time?: string | null;
  agreed_location?: string | null;
  from_owner_id: string;
  to_owner_id: string;
  from_pet_id: string;
  to_pet_id: string;
  playdate_request_id?: string | null;
  from_pet: EmojiPet | null;
  to_pet: EmojiPet | null;
  from_profile?: { full_name: string | null; handle?: string | null } | null;
  to_profile?: { full_name: string | null; handle?: string | null } | null;
}

// ── Cancel reason picker ──────────────────────────────────────────────────────

const CANCEL_REASONS = [
  "Something came up 🙁", "Bad weather ⛈️", "My baby isn't feeling well 🐾",
  "Schedule conflict 📅", "Change of plans",
];

function pickCancelReason(): Promise<string | null | undefined> {
  return new Promise(resolve =>
    showAlert('Reason for cancelling', 'The other pet\'s parent will be notified.', [
      ...CANCEL_REASONS.map(r => ({ text: r, onPress: () => resolve(r) })),
      { text: 'No reason', onPress: () => resolve(null) },
      { text: 'Keep it', style: 'cancel' as const, onPress: () => resolve(undefined) },
    ]),
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTimeLocale(date: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: !uses24HourClock() }).format(date);
  } catch {
    const h = date.getHours(), m = date.getMinutes();
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
}

function formatTime(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === 'string' ? parseISO(isoOrDate) : isoOrDate;
    const todayStr = new Date().toDateString();
    return d.toDateString() === todayStr ? fmtTimeLocale(d) : `${format(d, 'MMM d')} · ${fmtTimeLocale(d)}`;
  } catch { return ''; }
}

function relTime(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlaydateChatScreen() {
  const { chatId, propose } = useLocalSearchParams<{ chatId: string; propose?: string }>();
  const { colors, isDark } = useTheme();
  const playdatesEnabled = useFeatureFlag('connect_playdates_enabled', true);
  const { tier } = useSubscriptionStore();
  const isPro = tier === 'pro' || tier === 'ultimate';
  const userId = useAuthStore((s) => s.user?.id);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [chat,       setChat]       = useState<PlaydateChat | null>(null);
  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [draft,      setDraft]      = useState('');
  const [sending,    setSending]    = useState(false);
  const [declining,  setDeclining]  = useState(false);
  const [profanityWarning, setProfanityWarning] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore,      setHasMore]      = useState(false);
  const PAGE = 40;

  const [showSheet,    setShowSheet]    = useState(false);
  const [propFrom,     setPropFrom]     = useState<Date>(() => { const d = new Date(); d.setMinutes(0, 0, 0); return d; });
  const [propTo,       setPropTo]       = useState<Date>(() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d; });
  const [propLocation, setPropLocation] = useState('');
  const [pickerTarget, setPickerTarget] = useState<'fromDate' | 'fromTime' | 'toDate' | 'toTime'>('fromDate');
  const [showPicker,   setShowPicker]   = useState(false);

  const [pendingProposal, setPendingProposal] = useState<{
    id: string; proposed_date: string; proposed_time: string;
    proposed_end_time?: string | null; proposed_location?: string | null;
    message?: string | null; proposed_by_owner_id: string; request_id: string;
  } | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const loadMessages = useCallback(async () => {
    if (!chatId) return;
    const { data, error } = await supabase
      .from('playdate_chat_messages')
      .select('id, sender_id, message_type, content, proposed_date, proposed_time, proposed_location, proposal_status, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (error) {
      showAlert('Could not load messages', 'Pull down to try again.');
    } else {
      const page = (data ?? []).reverse();
      setMessages(page as ChatMessage[]);
      setHasMore((data?.length ?? 0) === PAGE);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [chatId]);

  const loadOlderMessages = useCallback(async () => {
    if (!chatId || loadingOlder || !hasMore || messages.length === 0) return;
    const oldest = messages[0].created_at;
    setLoadingOlder(true);
    try {
      const { data, error } = await supabase
        .from('playdate_chat_messages')
        .select('id, sender_id, message_type, content, proposed_date, proposed_time, proposed_location, proposal_status, created_at')
        .eq('chat_id', chatId).lt('created_at', oldest).order('created_at', { ascending: false }).limit(PAGE);
      if (!error && data && data.length > 0) {
        setMessages(prev => [...([...data] as ChatMessage[]).reverse(), ...prev]);
        setHasMore(data.length === PAGE);
      } else { setHasMore(false); }
    } finally { setLoadingOlder(false); }
  }, [chatId, loadingOlder, hasMore, messages]);

  const loadChat = useCallback(async () => {
    if (!chatId) return;
    setLoading(true); setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('playdate_chats')
        .select(`id, status, agreed_date, agreed_time, agreed_location,
          from_owner_id, to_owner_id, from_pet_id, to_pet_id, playdate_request_id,
          from_pet:from_pet_id(name, emoji, accent_color, avatar_url, breed, birthday, species),
          to_pet:to_pet_id(name, emoji, accent_color, avatar_url, breed, birthday, species)`)
        .eq('id', chatId).single();
      if (error || !data) { if (mountedRef.current) setLoadError(error?.message ?? 'Not found'); return; }
      const iAmFrom = data.from_owner_id === userId;
      const otherOwnerId = iAmFrom ? data.to_owner_id : data.from_owner_id;
      const { data: profileData } = otherOwnerId
        ? await supabase.from('profiles').select('full_name, handle').eq('id', otherOwnerId).single()
        : { data: null };
      const parsed = {
        ...data,
        from_pet:     Array.isArray(data.from_pet) ? data.from_pet[0] : data.from_pet,
        to_pet:       Array.isArray(data.to_pet)   ? data.to_pet[0]   : data.to_pet,
        from_profile: iAmFrom ? null : profileData,
        to_profile:   iAmFrom ? profileData : null,
      } as PlaydateChat;
      if (!mountedRef.current) return;
      setChat(parsed);
      if (userId) markChatRead(chatId, userId, iAmFrom).catch(() => {});
      if (parsed.playdate_request_id && parsed.status === 'negotiating') {
        const { data: propData } = await supabase
          .from('playdate_proposals')
          .select('id, proposed_date, proposed_time, proposed_end_time, proposed_location, message, proposed_by_owner_id, request_id')
          .eq('request_id', parsed.playdate_request_id).eq('status', 'pending').maybeSingle();
        setPendingProposal(propData ?? null);
      } else { setPendingProposal(null); }
      await loadMessages();
    } finally { setLoading(false); }
  }, [chatId, loadMessages]);

  useFocusEffect(useCallback(() => { if (chatId) loadChat(); }, [chatId, loadChat]));

  useEffect(() => { if (propose === '1') setShowSheet(true); }, [propose]);

  useEffect(() => {
    if (!chatId) return;
    const channel = claimChannel(`playdate-chat:${chatId}`);
    if (!channel) return;
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'playdate_chat_messages', filter: `chat_id=eq.${chatId}` },
        (p) => {
          const msg = p.new as ChatMessage;
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          if (chatId) appendMessageToCache(qc, chatId, msg as any);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'playdate_chat_messages', filter: `chat_id=eq.${chatId}` },
        (p) => {
          const updated = p.new as ChatMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
          if (chatId) patchMessageInCache(qc, chatId, updated as any);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'playdate_chats', filter: `id=eq.${chatId}` },
        () => { loadChat(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !userId || !chatId || sending) return;
    if (containsProfanity(text)) { setProfanityWarning(true); setDraft(censorText(text)); return; }
    setProfanityWarning(false); setSending(true);
    const prev = draft; setDraft('');
    try {
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: { action: 'chat_send', chat_id: chatId, content: text },
      });
      if (error || data?.error) { setDraft(prev); showAlert('Could not send', data?.error ?? error?.message ?? 'Unknown error'); }
      else { await loadMessages(); }
    } finally { setSending(false); }
  };

  const sendProposal = async () => {
    if (!chatId || !userId || !chat) return;
    if (propTo <= propFrom) { showAlert('Invalid time range', 'End time must be after the start time.'); return; }
    const trimLocation = propLocation.trim();
    if (trimLocation.length > 100) { showAlert('Location too long', 'Location must be 100 characters or fewer.'); return; }
    setSending(true);
    try {
      const fromDateStr = format(propFrom, 'yyyy-MM-dd'); const fromTimeStr = format(propFrom, 'HH:mm');
      const toDateStr   = format(propTo,   'yyyy-MM-dd'); const toTimeStr   = format(propTo,   'HH:mm');
      const sameDay = fromDateStr === toDateStr;
      const rangeLabel = sameDay
        ? `${format(propFrom, 'EEE, MMM d')} · ${formatTime(propFrom)} – ${formatTime(propTo)}`
        : `${format(propFrom, 'MMM d')} · ${formatTime(propFrom)} – ${format(propTo, 'MMM d')} · ${formatTime(propTo)}`;
      const content = `📅 ${rangeLabel}${propLocation ? ` · ${propLocation}` : ''}`;
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: { action: 'chat_send', message_action: 'propose', chat_id: chatId, content,
          proposed_date: fromDateStr, proposed_time: fromTimeStr,
          proposed_end_date: toDateStr, proposed_end_time: toTimeStr, proposed_location: propLocation || null },
      });
      if (error || data?.error) { showAlert('Could not send proposal', data?.error ?? error?.message ?? 'Unknown error'); }
      else {
        setShowSheet(false); setPropLocation('');
        const d = new Date(); d.setMinutes(0, 0, 0); setPropFrom(d);
        const d2 = new Date(d); d2.setHours(d2.getHours() + 1); setPropTo(d2);
        await loadMessages();
      }
    } finally { setSending(false); }
  };

  const cancelProposal = (messageId: string) => {
    showAlert('Cancel proposal?', 'The other party will be notified.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel proposal', style: 'destructive', onPress: async () => {
        setSending(true);
        try {
          const { data, error } = await supabase.functions.invoke('playdates', { body: { action: 'proposal_cancel', message_id: messageId } });
          if (error || data?.error) showAlert('Error', data?.error ?? error?.message ?? 'Unknown error');
          else await loadMessages();
        } finally { setSending(false); }
      }},
    ]);
  };

  const respondToProposal = async (messageId: string, response: 'accept' | 'reject') => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    if (response === 'accept' && msg.proposed_date) {
      const day = new Date(msg.proposed_date + 'T00:00:00');
      if (isPast(day) && !isToday(day)) {
        showAlert('⚠️ Date has passed', `${msg.proposed_date} is in the past. Still confirm?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm anyway', onPress: () => doRespond(messageId, response) },
        ]);
        return;
      }
    }
    doRespond(messageId, response);
  };

  const doRespond = async (messageId: string, response: 'accept' | 'reject'): Promise<boolean> => {
    setSending(true); let ok = true;
    try {
      const { data, error } = await supabase.functions.invoke('playdates', { body: { action: 'proposal_respond', message_id: messageId, response } });
      if (error || data?.error) { showAlert('Error', data?.error ?? error?.message ?? 'Unknown error'); ok = false; }
      else { await Promise.all([loadChat(), loadMessages()]); }
    } finally { setSending(false); }
    return ok;
  };

  const proposeNew = async (messageId: string) => {
    const ok = await doRespond(messageId, 'reject');
    if (ok) setShowSheet(true);
  };

  const addToCalendar = useCallback(async () => {
    if (!chat?.agreed_date) return;
    const timeStr = chat.agreed_time ?? '10:00';
    const [h, m] = timeStr.split(':').map(Number);
    const start = new Date(chat.agreed_date + 'T00:00:00');
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const _other = userId === chat?.from_owner_id ? chat?.to_pet : chat?.from_pet;
    const petName = _other?.name ?? 'Dog';
    const storageKey = chatId ? `playdate_cal_event_${chatId}` : null;
    let CalendarLib: typeof import('expo-calendar') | null = null;
    try { CalendarLib = require('expo-calendar'); } catch {}
    if (!CalendarLib) { showAlert('Not supported', 'Please open your Calendar app manually.'); return; }
    const { status } = await CalendarLib.requestCalendarPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Please allow calendar access in Settings.'); return; }
    const eventDetails = {
      title: `🐾 Playdate with ${petName}`, startDate: start, endDate: end,
      location: chat.agreed_location ?? undefined, notes: 'Playdate arranged via PawBond 🐾',
      alarms: [{ relativeOffset: -60 }] as any[],
    };
    try {
      const { AsyncStorage } = require('@react-native-async-storage/async-storage');
      const existingId = storageKey ? await AsyncStorage.getItem(storageKey) : null;
      if (existingId) {
        try {
          await CalendarLib.updateEventAsync(existingId, eventDetails);
          showAlert('Calendar updated! 🐾', `Your playdate with ${petName} has been updated.`);
          return;
        } catch { if (storageKey) await AsyncStorage.removeItem(storageKey); }
      }
      const calendars = await CalendarLib.getCalendarsAsync(CalendarLib.EntityTypes.EVENT);
      const defaultCal = calendars.find((c: any) => c.allowsModifications && (c.isPrimary || c.source?.name === 'Default')) ?? calendars.find((c: any) => c.allowsModifications);
      if (!defaultCal) { showAlert('No calendar found', 'Could not find a writable calendar on this device.'); return; }
      const newEventId = await CalendarLib.createEventAsync(defaultCal.id, eventDetails);
      if (newEventId && storageKey) { const { AsyncStorage: AS } = require('@react-native-async-storage/async-storage'); await AS.setItem(storageKey, newEventId); }
      showAlert('Added to Calendar! 🐾', `Your playdate with ${petName} is saved.`);
    } catch (e: any) { showAlert('Error', e.message ?? 'Could not add to calendar.'); }
  }, [chat, chatId, userId]);

  const declineChat = useCallback(async () => {
    const isConfirmed = chat?.status === 'agreed';
    let reason: string | null | undefined = null;
    if (isConfirmed) {
      reason = await pickCancelReason();
      if (reason === undefined) return;
    } else {
      const confirmed = await new Promise<boolean>(resolve =>
        showAlert('Leave Chat?', 'This will end the chat and notify the other pet\'s parent.', [
          { text: 'Keep', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Leave', style: 'destructive', onPress: () => resolve(true) },
        ]),
      );
      if (!confirmed) return;
    }
    setDeclining(true);
    try {
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: { action: 'chat_cancel', chat_id: chatId, ...(reason ? { reason } : {}) },
      });
      if (error || data?.error) { showAlert('Failed', data?.error ?? error?.message ?? 'Unknown error'); }
      else { if (navigation.canGoBack()) router.back(); else router.replace('/(tabs)/connect' as any); }
    } finally { setDeclining(false); }
  }, [chatId, chat?.status, navigation]);

  const acceptPendingProposal = useCallback(async () => {
    if (!pendingProposal) return;
    try {
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: { action: 'respond', request_id: pendingProposal.request_id, respond_action: 'accept' },
      });
      if (error || data?.error) { showAlert('Error', data?.error ?? error?.message ?? 'Could not accept'); return; }
      await loadChat();
    } catch (e: any) { showAlert('Error', e.message); }
  }, [pendingProposal, loadChat]);

  const isFrom       = userId === chat?.from_owner_id;
  const myPet        = isFrom ? chat?.from_pet   : chat?.to_pet;
  const otherPet     = isFrom ? chat?.to_pet     : chat?.from_pet;
  const otherProfile = isFrom ? chat?.to_profile : chat?.from_profile;
  const otherParentFirst = otherProfile?.handle ? `@${otherProfile.handle}` : (otherProfile?.full_name?.split(' ')[0]?.trim() ?? null);
  const isClosed = chat?.status === 'cancelled' || chat?.status === 'declined';
  const ac       = otherPet?.accent_color ?? '#1D9E75';
  const otherPetMeta = (() => {
    if (!otherPet) return '';
    const ageYrs = (otherPet as any).birthday ? differenceInYears(new Date(), parseISO((otherPet as any).birthday)) : null;
    return [toTitle((otherPet as any).breed), ageYrs != null ? `${ageYrs} yr${ageYrs !== 1 ? 's' : ''}` : null].filter(Boolean).join(' · ') || toTitle((otherPet as any).species) || '';
  })();

  if (!playdatesEnabled) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: colors.background }]} edges={['top']}>
        <FeatureUnavailable label="Playdates" />
      </SafeAreaView>
    );
  }
  if (!isPro) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: colors.background }]} edges={['top']}>
        <FeatureUnavailable label="Playdate Chat" proGate message="Upgrade to Pro to send messages and coordinate playdates." />
      </SafeAreaView>
    );
  }
  if (loading) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: colors.background }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={s.headerCenter} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <PawBondLoader size={52} isDark={isDark} />
          <Text style={{ color: colors.textSecondary, fontSize: TYPO.body }}>Opening chat…</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (loadError || !chat) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: colors.background }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>😕</Text>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>Couldn't load chat</Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginBottom: 24 }}>
            {loadError ?? 'Chat not found. It may have been removed.'}
          </Text>
          <TouchableOpacity style={{ backgroundColor: ac, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 }} onPress={loadChat}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
          <PetHeaderChip pet={otherPet as any} meta={otherPetMeta || undefined} switchable={false} />
        </View>
        <View style={{ marginLeft: 'auto' }} />
      </View>

      {chat.status === 'negotiating' && pendingProposal && (
        <PendingProposalBanner
          pendingProposal={pendingProposal}
          userId={userId}
          otherPetName={otherPet?.name}
          ac={ac}
          colors={colors}
          formatTime={formatTime}
          onAccept={acceptPendingProposal}
          onProposeNew={() => setShowSheet(true)}
        />
      )}

      {chat.status === 'agreed' && (
        <View style={[s.metaBanner, { backgroundColor: `${ac}12`, borderColor: `${ac}30` }]}>
          <Ionicons name="checkmark-circle" size={15} color={ac} />
          <View style={{ flex: 1 }}>
            <Text style={[s.metaLabel, { color: colors.textSecondary }]}>PLAYDATE CONFIRMED</Text>
            <Text style={[s.metaText, { color: ac }]}>
              {chat.agreed_date ? format(parseISO(chat.agreed_date), 'EEE, MMM d') : ''}
              {chat.agreed_time ? `  ·  ${chat.agreed_time.substring(0, 5)}` : ''}
            </Text>
            {chat.agreed_location ? <Text style={[s.metaSub, { color: colors.textSecondary }]}>📍 {chat.agreed_location}</Text> : null}
          </View>
          <TouchableOpacity onPress={addToCalendar} style={[s.addCalBtn, { backgroundColor: `${ac}20`, borderColor: `${ac}40` }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <CalendarIcon size={15} color={ac} />
            <Text style={[s.addCalText, { color: ac }]}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={declineChat} disabled={declining} style={[s.addCalBtn, { backgroundColor: '#E24B4A18', borderColor: '#E24B4A40', marginLeft: 4 }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {declining ? <ActivityIndicator size="small" color="#E24B4A" /> : <Ionicons name="close-outline" size={15} color="#E24B4A" />}
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} style={s.flex} contentContainerStyle={s.messageList}
          onContentSizeChange={() => { if (!loadingOlder) scrollRef.current?.scrollToEnd({ animated: false }); }}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={({ nativeEvent }) => { if (nativeEvent.contentOffset.y < 60 && hasMore) loadOlderMessages(); }}>
          {hasMore && (
            <TouchableOpacity onPress={loadOlderMessages} style={{ alignItems: 'center', paddingVertical: 10 }} disabled={loadingOlder}>
              {loadingOlder ? <ActivityIndicator size="small" color={ac} /> : <Text style={{ fontSize: TYPO.body, color: ac, fontWeight: '600' }}>⬆ Load older messages</Text>}
            </TouchableOpacity>
          )}
          <View style={s.welcomeRow}>
            {chat?.status === 'agreed' ? (
              <View style={[s.welcomeBubble, { backgroundColor: `${ac}12`, borderColor: `${ac}30` }]}>
                <Text style={[s.welcomeText, { color: ac }]}>
                  🎉 Playdate confirmed!{'\n'}
                  {chat?.agreed_date ? format(parseISO(chat.agreed_date), 'EEEE, MMMM d') : ''}
                  {chat?.agreed_time ? ` at ${chat.agreed_time.substring(0, 5)}` : ''}
                  {chat?.agreed_location ? `\n📍 ${chat.agreed_location}` : ''}
                </Text>
              </View>
            ) : (chat?.status === 'cancelled' || chat?.status === 'declined') ? (
              <View style={[s.welcomeBubble, { backgroundColor: '#94A3B812', borderColor: '#94A3B830' }]}>
                <Text style={[s.welcomeText, { color: '#94A3B8' }]}>This chat has ended. You can start a fresh playdate request from Nearby.</Text>
              </View>
            ) : (
              <View style={[s.welcomeBubble, { backgroundColor: isDark ? '#451A03' : '#FEF3C7', borderColor: isDark ? '#78350F' : '#FDE68A' }]}>
                <Text style={[s.welcomeText, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                  🐾 Say hi! Use the 📅 button to propose a playdate time for {otherPet?.name} and {myPet?.name}.
                </Text>
              </View>
            )}
          </View>

          {messages.length === 0 && (
            <View style={s.emptyState}>
              <Text style={{ fontSize: 40 }}>{otherPet?.emoji ?? '🐾'}</Text>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                Chat with {otherParentFirst ? `${otherParentFirst}'s ${otherPet?.name}` : `${otherPet?.name}'s parent`}
              </Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>Use the 📅 button above to propose a date and time.</Text>
            </View>
          )}

          <ChatMessageList
            messages={messages}
            userId={userId}
            myPet={myPet}
            otherPet={otherPet}
            ac={ac}
            colors={colors}
            s={s}
            sending={sending}
            formatTime={formatTime}
            onRespondToProposal={respondToProposal}
            onCancelProposal={cancelProposal}
            onProposeNew={proposeNew}
          />
        </ScrollView>

        {isClosed ? (
          <View style={[s.lockedBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
            <View style={[s.lockedInner, { backgroundColor: chat.status === 'agreed' ? `${ac}10` : '#94A3B810', borderColor: chat.status === 'agreed' ? `${ac}25` : '#94A3B830' }]}>
              <Ionicons name="lock-closed" size={13} color={chat.status === 'agreed' ? ac : '#94A3B8'} />
              <Text style={[s.lockedText, { color: chat.status === 'agreed' ? ac : '#94A3B8' }]}>
                {chat.status === 'agreed' ? 'Playdate confirmed — see you there! 🎉' : chat.status === 'negotiating' ? 'Planning now uses the new Playdates feature 🐾' : 'This chat is no longer active'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
            {profanityWarning && (
              <View style={[s.profanityBar, { backgroundColor: isDark ? '#3B2400' : '#FFF3CD' }]}>
                <Ionicons name="warning-outline" size={14} color={isDark ? '#FCD34D' : '#856404'} />
                <Text style={[s.profanityText, { color: isDark ? '#FCD34D' : '#856404' }]}>Offensive language removed. Please keep it respectful 🐾</Text>
                <TouchableOpacity onPress={() => setProfanityWarning(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={14} color={isDark ? '#FCD34D' : '#856404'} />
                </TouchableOpacity>
              </View>
            )}
            <View style={[s.inputRow, { backgroundColor: colors.background, paddingBottom: insets.bottom > 0 ? insets.bottom : 10 }]}>
              <TextInput style={[s.input, { backgroundColor: colors.inputBg, borderColor: profanityWarning ? '#F59E0B' : colors.border, color: colors.textPrimary }]}
                placeholder={`Message ${otherPet?.name ?? ''}…`} placeholderTextColor={colors.placeholder}
                value={draft} onChangeText={t => { setDraft(t); if (profanityWarning) setProfanityWarning(false); }}
                multiline maxLength={1000} returnKeyType="send" onSubmitEditing={sendMessage} />
              <TouchableOpacity style={[s.sendBtn, { backgroundColor: `${ac}18` }]} onPress={() => setShowSheet(true)} disabled={sending}>
                <CalendarIcon size={18} color={ac} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.sendBtn, { backgroundColor: draft.trim() ? ac : colors.inputBg }]} onPress={sendMessage} disabled={!draft.trim() || sending}>
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={17} color={draft.trim() ? '#fff' : colors.textTertiary} />}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <BottomSheet visible={showSheet} onClose={() => setShowSheet(false)} title="📅 Propose a Time" accent={ac}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingTop: 4, paddingBottom: 8 }}>

          {/* WHEN card */}
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: `${ac}30`, overflow: 'hidden', backgroundColor: `${ac}0A` }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 8 }}>
              <Ionicons name="calendar" size={13} color={ac} />
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac }}>WHEN</Text>
            </View>
            {/* From row */}
            <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 10, marginBottom: 8 }}>
              <TouchableOpacity onPress={() => { setPickerTarget('fromDate'); setShowPicker(true); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: pickerTarget === 'fromDate' && showPicker ? ac : colors.border,
                  paddingHorizontal: 12, paddingVertical: 12 }}>
                <CalendarIcon size={15} color={ac} />
                <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{format(propFrom, 'EEE, MMM d')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setPickerTarget('fromTime'); setShowPicker(true); }}
                style={{ width: 90, flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: pickerTarget === 'fromTime' && showPicker ? ac : colors.border,
                  paddingHorizontal: 12, paddingVertical: 12 }}>
                <Ionicons name="time-outline" size={15} color={ac} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{formatTime(propFrom)}</Text>
              </TouchableOpacity>
            </View>
            {/* Arrow divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 8 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: `${ac}20` }} />
              <Ionicons name="arrow-down" size={12} color={ac} style={{ marginHorizontal: 8 }} />
              <View style={{ flex: 1, height: 1, backgroundColor: `${ac}20` }} />
            </View>
            {/* To row */}
            <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 10, marginBottom: 12 }}>
              <TouchableOpacity onPress={() => { setPickerTarget('toDate'); setShowPicker(true); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: pickerTarget === 'toDate' && showPicker ? ac : colors.border,
                  paddingHorizontal: 12, paddingVertical: 12 }}>
                <CalendarIcon size={15} color={colors.textTertiary} />
                <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{format(propTo, 'EEE, MMM d')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setPickerTarget('toTime'); setShowPicker(true); }}
                style={{ width: 90, flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: pickerTarget === 'toTime' && showPicker ? ac : colors.border,
                  paddingHorizontal: 12, paddingVertical: 12 }}>
                <Ionicons name="time-outline" size={15} color={colors.textTertiary} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{formatTime(propTo)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Place */}
          <LocationAutocompleteInput
            value={propLocation} onChangeText={setPropLocation}
            placeholder="Place (optional)"
            colors={colors} />

          {/* Summary strip */}
          {(() => {
            const sameDay = format(propFrom, 'yyyy-MM-dd') === format(propTo, 'yyyy-MM-dd');
            const summary = sameDay
              ? `${format(propFrom, 'EEE, MMM d')} · ${formatTime(propFrom)} – ${formatTime(propTo)}`
              : `${format(propFrom, 'MMM d')} · ${formatTime(propFrom)} – ${format(propTo, 'MMM d')} · ${formatTime(propTo)}`;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: `${ac}12`, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: `${ac}25` }}>
                <Text style={{ fontSize: 20 }}>📅</Text>
                <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                  {summary}{propLocation.trim() ? `  ·  📍 ${propLocation.trim()}` : ''}
                </Text>
              </View>
            );
          })()}

          {/* Send button */}
          <TouchableOpacity onPress={sendProposal} disabled={sending}
            style={{ backgroundColor: ac, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Send Proposal</Text>}
          </TouchableOpacity>

          <AppDateTimePicker visible={showPicker}
            value={pickerTarget === 'fromDate' || pickerTarget === 'fromTime' ? propFrom : propTo}
            mode={pickerTarget === 'fromDate' || pickerTarget === 'toDate' ? 'date' : 'time'}
            minimumDate={pickerTarget === 'fromDate' ? new Date() : pickerTarget === 'toDate' ? propFrom : undefined}
            accent={ac} onCancel={() => setShowPicker(false)}
            onConfirm={(date) => {
              setShowPicker(false);
              if (pickerTarget === 'fromDate') { setPropFrom(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; }); }
              else if (pickerTarget === 'fromTime') { setPropFrom(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; }); }
              else if (pickerTarget === 'toDate') { setPropTo(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; }); }
              else { setPropTo(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; }); }
            }} />
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:      { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  metaBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, marginBottom: 2, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  metaLabel:  { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.7, marginBottom: 2 },
  metaText:   { fontSize: TYPO.body, fontWeight: '700' },
  metaSub:    { fontSize: TYPO.body, marginTop: 2 },
  addCalBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  addCalText: { fontSize: TYPO.body, fontWeight: '700' },
  welcomeRow:    { alignItems: 'center', marginBottom: 4 },
  welcomeBubble: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, maxWidth: '88%', borderWidth: 1 },
  welcomeText:   { fontSize: TYPO.body, fontWeight: '500', textAlign: 'center', lineHeight: 19 },
  messageList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, gap: 12 },
  emptyState:  { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:  { fontSize: TYPO.subheading, fontWeight: '700' },
  emptySub:    { fontSize: TYPO.body, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  msgRow:      { flexDirection: 'row', alignItems: 'flex-end', gap: 7, paddingHorizontal: 12 },
  msgRowRight: { flexDirection: 'row-reverse' },
  bubble:      { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  senderName:  { fontSize: TYPO.body, fontWeight: '700', marginHorizontal: 4, marginBottom: 3, opacity: 0.85 },
  bubbleText:  { fontSize: TYPO.body, lineHeight: 21 },
  msgTime:     { fontSize: TYPO.body, marginHorizontal: 4 },
  lockedBar:   { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  lockedInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  lockedText:  { fontSize: TYPO.body, fontWeight: '600' },
  profanityBar:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  profanityText: { flex: 1, fontSize: TYPO.body, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input:    { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: TYPO.body, maxHeight: 120 },
  sendBtn:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  proposalCard: { borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', overflow: 'hidden', paddingVertical: 14, paddingRight: 14 },
  accentBar:    { width: 4 },
  propRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  propBtn:      { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fieldLabel:     { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  fieldBtn:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  fieldBtnText:   { flex: 1, fontSize: TYPO.body },
  fieldInput:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  fieldTextInput: { flex: 1, fontSize: TYPO.body },
  sheetFooter:    { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  sheetCancelBtn: { flex: 1, height: 50, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetCancelText:{ fontSize: TYPO.body, fontWeight: '600' },
  sheetSaveBtn:   { flex: 2, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetSaveText:  { color: '#fff', fontSize: TYPO.body, fontWeight: '700' },
});
