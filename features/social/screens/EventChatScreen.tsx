/**
 * PawBond — Event Chat & Attendees
 *
 * Group chat per community event — organizer + all RSVPed attendees.
 * Header: professional event banner with type color, date/time, location, organizer, attendee count.
 * Post-event: star-rating feedback card replaces the locked bar.
 * Realtime: new messages via Supabase channel.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Modal,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, isPast, parseISO } from 'date-fns';
import { containsProfanity, censorText } from '@/lib/profanityFilter';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/lib/ThemeContext';
import { RADIUS, TYPO} from '@/constants/theme';
import PawBondLoader from '@/components/PawBondLoader';
import PetHeaderChip from '@/components/PetHeaderChip';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { FeatureUnavailable } from '@/components/FeatureGate';
import { formatTime } from '@/lib/units';
import { showAlert } from '@/components/AppAlert';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventDetail {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  event_time: string | null;
  location_name: string | null;
  organizer_id: string;
  organizer: { full_name: string; handle?: string | null } | null;
}

interface Attendee {
  user_id: string;
  created_at: string;
  profile: { full_name: string; handle?: string | null; avatar_url: string | null } | null;
}

interface Message {
  id: string;
  sender_id: string;
  message: string;
  sent_at: string;
  sender: { full_name: string; handle?: string | null } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_TYPE_META: Record<string, { color: string; icon: string; label: string }> = {
  meetup:      { color: '#FF8C55', icon: 'paw',             label: 'Meetup' },
  vaccination: { color: '#16A34A', icon: 'medkit',          label: 'Vaccination' },
  adoption:    { color: '#E24B4A', icon: 'heart',           label: 'Adoption' },
  walk:        { color: '#7C5CBF', icon: 'footsteps',       label: 'Group Walk' },
  training:    { color: '#3B82F6', icon: 'school',          label: 'Training' },
  other:       { color: '#E8A320', icon: 'calendar',        label: 'Event' },
};

function ha(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function msgTime(iso: string) {
  try {
    const d = parseISO(iso);
    return d.toDateString() === new Date().toDateString()
      ? formatTime(d)
      : `${format(d, 'MMM d')} · ${formatTime(d)}`;
  } catch { return ''; }
}

function initials(name: string) {
  return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

// ── Attendee modal ────────────────────────────────────────────────────────────

function AttendeeModal({ visible, attendees, organizer, organizerId, onClose, colors }: {
  visible: boolean;
  attendees: Attendee[];
  organizer: { full_name: string; handle?: string | null } | null;
  organizerId: string;
  onClose: () => void;
  colors: any;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[am.header, { borderBottomColor: colors.border }]}>
          <Text style={[am.title, { color: colors.textPrimary }]}>
            Attendees · {attendees.length}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <FlashList
          data={attendees}
          keyExtractor={a => a.user_id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => {
            const name = item.profile?.handle ? `@${item.profile.handle}` : 'PawBond user';
            const isOrganizer = item.user_id === organizerId;
            return (
              <View style={[am.row, { borderBottomColor: colors.border }]}>
                <View style={[am.avatar, { backgroundColor: `${colors.textTertiary}20` }]}>
                  <Text style={[am.avatarText, { color: colors.textSecondary }]}>{initials(name)}</Text>
                </View>
                <Text style={[am.name, { color: colors.textPrimary }]}>{name}</Text>
                {isOrganizer && (
                  <View style={[am.badge, { backgroundColor: '#FF8C5520' }]}>
                    <Text style={[am.badgeText, { color: '#FF8C55' }]}>Organizer</Text>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[am.empty, { color: colors.textSecondary }]}>No attendees yet</Text>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const am = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title:      { fontSize: TYPO.subheading, fontWeight: '700' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20,
                paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: TYPO.body, fontWeight: '700' },
  name:       { flex: 1, fontSize: TYPO.body },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText:  { fontSize: TYPO.body, fontWeight: '700' },
  empty:      { textAlign: 'center', marginTop: 40, fontSize: TYPO.body },
});

// ── Event banner ──────────────────────────────────────────────────────────────

function EventBanner({ event, attendeeCount, onAttendees, onBack, pet, colors }: {
  event: EventDetail;
  attendeeCount: number;
  onAttendees: () => void;
  onBack: () => void;
  pet: any;
  colors: any;
}) {
  const meta = EVENT_TYPE_META[event.event_type] ?? EVENT_TYPE_META.other;
  const ac = meta.color;

  const dateStr = event.event_date
    ? format(parseISO(event.event_date), 'EEE, MMM d')
    : null;
  const timeStr = event.event_time
    ? (() => { try { return formatTime(new Date(`1970-01-01T${event.event_time}`)); } catch { return event.event_time; } })()
    : null;
  const organizerName = event.organizer?.handle
    ? `@${event.organizer.handle}`
    : 'Pet parent';

  return (
    <View style={[eb.wrapper, { backgroundColor: ha(ac, 0.06), borderBottomColor: ha(ac, 0.18) }]}>
      {/* Top row: back + pet chip */}
      <View style={eb.topRow}>
        <TouchableOpacity
          onPress={onBack}
          style={[eb.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <PetHeaderChip pet={pet} />
      </View>

      {/* Type badge + title */}
      <View style={eb.titleRow}>
        <View style={[eb.typeBadge, { backgroundColor: ha(ac, 0.14) }]}>
          <Ionicons name={meta.icon as any} size={14} color={ac} />
          <Text style={[eb.typeLabel, { color: ac }]}>{meta.label}</Text>
        </View>
      </View>
      <Text style={[eb.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {event.title}
      </Text>

      {/* Meta pills */}
      <View style={eb.pills}>
        {dateStr && (
          <View style={[eb.pill, { backgroundColor: ha(ac, 0.10) }]}>
            <Ionicons name="calendar-outline" size={12} color={ac} />
            <Text style={[eb.pillText, { color: ac }]}>
              {dateStr}{timeStr ? ` · ${timeStr}` : ''}
            </Text>
          </View>
        )}
        {event.location_name && (
          <View style={[eb.pill, { backgroundColor: ha(ac, 0.10) }]}>
            <Ionicons name="location-outline" size={12} color={ac} />
            <Text style={[eb.pillText, { color: ac }]} numberOfLines={1}>{event.location_name}</Text>
          </View>
        )}
        {organizerName && (
          <View style={[eb.pill, { backgroundColor: ha(ac, 0.10) }]}>
            <Ionicons name="person-circle-outline" size={12} color={ac} />
            <Text style={[eb.pillText, { color: ac }]}>{organizerName}</Text>
          </View>
        )}
      </View>

      {/* Attendee count row */}
      <TouchableOpacity style={eb.attendeeRow} onPress={onAttendees} activeOpacity={0.7}>
        <View style={[eb.attendeeChip, { backgroundColor: ha(ac, 0.10) }]}>
          <Ionicons name="people" size={14} color={ac} />
          <Text style={[eb.attendeeText, { color: ac }]}>
            {attendeeCount} attending
          </Text>
        </View>
        <Text style={[eb.attendeeSub, { color: colors.textSecondary }]}>tap to see all →</Text>
      </TouchableOpacity>
    </View>
  );
}

const eb = StyleSheet.create({
  wrapper:      { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14,
                  borderBottomWidth: 1 },
  topRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backBtn:      { width: 34, height: 34, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
                  alignItems: 'center', justifyContent: 'center' },
  titleRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  typeBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9,
                  paddingVertical: 4, borderRadius: 20 },
  typeLabel:    { fontSize: TYPO.caption, fontWeight: '700', letterSpacing: 0.3 },
  title:        { fontSize: TYPO.heading, fontWeight: '800', lineHeight: 24, marginBottom: 10 },
  pills:        { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  pill:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9,
                  paddingVertical: 5, borderRadius: 16 },
  pillText:     { fontSize: TYPO.caption, fontWeight: '600', maxWidth: 180 },
  attendeeRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attendeeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10,
                  paddingVertical: 5, borderRadius: 16 },
  attendeeText: { fontSize: TYPO.caption, fontWeight: '700' },
  attendeeSub:  { fontSize: TYPO.caption },
});

// ── Post-event feedback card ──────────────────────────────────────────────────

function FeedbackCard({ eventId, userId, colors, onDone }: {
  eventId: string;
  userId: string;
  colors: any;
  onDone: () => void;
}) {
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const sentRef               = useRef(false);

  const submit = async () => {
    if (!rating || sentRef.current) return;
    sentRef.current = true;
    setSending(true);
    try {
      await supabase.functions.invoke('notify-event-feedback', {
        body: { event_id: eventId, rating, comment: comment.trim() || undefined },
      });
      setSent(true);
      setTimeout(onDone, 1800);
    } catch {
      showAlert('Error', 'Could not submit feedback. Please try again.');
      sentRef.current = false;
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={[fc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ fontSize: TYPO.hero, textAlign: 'center' }}>🐾</Text>
        <Text style={[fc.thankTitle, { color: colors.textPrimary }]}>Thanks for your feedback!</Text>
        <Text style={[fc.thankSub, { color: colors.textSecondary }]}>The organizer will love hearing from you.</Text>
      </View>
    );
  }

  return (
    <View style={[fc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[fc.heading, { color: colors.textPrimary }]}>How was it? 🐾</Text>
      <Text style={[fc.sub, { color: colors.textSecondary }]}>Rate this event so the organizer knows how it went.</Text>

      {/* Stars */}
      <View style={fc.stars}>
        {[1,2,3,4,5].map(n => (
          <TouchableOpacity key={n} onPress={() => setRating(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Ionicons
              name={n <= rating ? 'star' : 'star-outline'}
              size={34}
              color={n <= rating ? '#F59E0B' : colors.border}
            />
          </TouchableOpacity>
        ))}
      </View>

      {rating > 0 && (
        <>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Share a comment (optional)…"
            placeholderTextColor={colors.placeholder ?? colors.textSecondary}
            style={[fc.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            maxLength={300}
          />
          <TouchableOpacity
            onPress={submit}
            disabled={sending}
            activeOpacity={0.8}
            style={[fc.btn, { backgroundColor: '#F59E0B', opacity: sending ? 0.6 : 1 }]}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={fc.btnText}>Submit feedback</Text>
            }
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const fc = StyleSheet.create({
  card:       { margin: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
                padding: 18, gap: 10, alignItems: 'center' },
  heading:    { fontSize: TYPO.subheading, fontWeight: '800' },
  sub:        { fontSize: TYPO.body, textAlign: 'center', lineHeight: 19 },
  stars:      { flexDirection: 'row', gap: 8, marginVertical: 4 },
  input:      { width: '100%', borderWidth: 1, borderRadius: 12, padding: 10,
                fontSize: TYPO.body, lineHeight: 20, minHeight: 64 },
  btn:        { width: '100%', height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText:    { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
  thankTitle: { fontSize: TYPO.subheading, fontWeight: '700', textAlign: 'center' },
  thankSub:   { fontSize: TYPO.body, textAlign: 'center', color: '#6B7280' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EventChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthStore();
  const { colors, isDark } = useTheme();
  const eventsEnabled = useFeatureFlag('events_enabled', true);
  const { activePet } = usePetStore(useShallow(s => ({ activePet: s.activePet })));
  const pet = activePet();
  const userId = session?.user?.id;

  const [loading, setLoading]             = useState(true);
  const [event, setEvent]                 = useState<EventDetail | null>(null);
  const [attendees, setAttendees]         = useState<Attendee[]>([]);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [draft, setDraft]                 = useState('');
  const [sending, setSending]             = useState(false);
  const [showAttendees, setShowAttendees] = useState(false);
  const [isParticipant, setIsParticipant] = useState(false);
  const [profanityWarning, setProfanityWarning] = useState(false);
  const [feedbackDone, setFeedbackDone]   = useState(false);

  const scrollRef  = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      const eventRes = await supabase.from('community_events')
        .select('id, title, event_type, event_date, event_time, location_name, organizer_id')
        .eq('id', id).single();

      if (!mountedRef.current) return;
      if (!eventRes.data) { router.back(); return; }

      const [orgRes, attendeeRes, msgRes] = await Promise.allSettled([
        supabase.from('profiles').select('full_name, handle').eq('id', eventRes.data.organizer_id).single(),
        supabase.from('event_rsvps')
          .select('user_id, created_at')
          .eq('event_id', id)
          .order('created_at', { ascending: true })
          .limit(500),
        supabase.from('event_messages')
          .select('id, sender_id, message, sent_at')
          .eq('event_id', id)
          .order('sent_at', { ascending: false })
          .limit(100),
      ]);

      if (!mountedRef.current) return;

      const orgProfile = orgRes.status === 'fulfilled' ? orgRes.value.data : null;
      const ev: EventDetail = {
        ...eventRes.data,
        organizer: orgProfile,
      };
      setEvent(ev);

      const rsvpData = attendeeRes.status === 'fulfilled' ? (attendeeRes.value.data ?? []) : [];
      const rsvpUserIds = rsvpData.map((r: any) => r.user_id).filter(Boolean);
      let profileMap: Record<string, any> = {};
      if (rsvpUserIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles')
          .select('id, full_name, handle, avatar_url')
          .in('id', rsvpUserIds);
        for (const p of (profiles ?? [])) profileMap[p.id] = p;
      }
      const atts: Attendee[] = rsvpData.map((r: any) => ({
        ...r,
        profile: profileMap[r.user_id] ?? null,
      }));
      setAttendees(atts);

      const msgData = msgRes.status === 'fulfilled' ? (msgRes.value.data ?? []) : [];
      const senderIds = [...new Set(msgData.map((m: any) => m.sender_id).filter(Boolean))];
      let senderMap: Record<string, any> = {};
      if (senderIds.length > 0) {
        const { data: senderProfiles } = await supabase.from('profiles')
          .select('id, full_name, handle')
          .in('id', senderIds as string[]);
        for (const p of (senderProfiles ?? [])) senderMap[p.id] = p;
      }
      setMessages(msgData.map((m: any) => ({
        ...m,
        sender: senderMap[m.sender_id] ?? null,
      })));

      const hasRsvp = atts.some(a => a.user_id === userId);
      setIsParticipant(ev.organizer_id === userId || hasRsvp);

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (err) {
      console.error('[event] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useEffect(() => { load(); }, [load]);

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`event-chat-${id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'event_messages', filter: `event_id=eq.${id}`,
      }, async (payload) => {
        const row = payload.new as any;
        const { data: senderData } = await supabase
          .from('profiles').select('full_name').eq('id', row.sender_id).single();
        if (!mountedRef.current) return;
        setMessages(prev => [...prev.filter(m => m.id !== row.id), {
          id: row.id, sender_id: row.sender_id, message: row.message,
          sent_at: row.sent_at, sender: senderData ?? null,
        }]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !userId || !id || sending || !isParticipant) return;
    if (containsProfanity(text)) {
      setProfanityWarning(true);
      setDraft(censorText(text));
      return;
    }
    setProfanityWarning(false);
    setSending(true);
    setDraft('');
    const { error } = await supabase.from('event_messages')
      .insert({ event_id: id, sender_id: userId, message: text });
    if (error) { setDraft(text); }
    setSending(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const ac = event ? (EVENT_TYPE_META[event.event_type]?.color ?? '#1D9E75') : '#1D9E75';

  const isEventOver = event ? (() => {
    const dateStr = event.event_date + (event.event_time ? `T${event.event_time}` : 'T23:59');
    try { return isPast(new Date(dateStr)); } catch { return false; }
  })() : false;

  // Show feedback card when event is over, user was participant, and not yet submitted
  const showFeedback = isEventOver && isParticipant && !feedbackDone && !!userId;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PawBondLoader size={48} isDark={isDark} />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) return null;

  if (!eventsEnabled) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: colors.background }]} edges={['top']}>
        <FeatureUnavailable label="Community events" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: colors.background }]} edges={['top']}>

      {/* Professional event banner */}
      <EventBanner
        event={event}
        attendeeCount={attendees.length}
        onAttendees={() => setShowAttendees(true)}
        onBack={() => router.back()}
        pet={pet}
        colors={colors}
      />

      {/* Chat responsibly tip */}
      <View style={s.tipBanner}>
        <Ionicons name="information-circle-outline" size={14} color="#92400E" />
        <Text style={s.tipText}>💬 Be kind, respectful, and keep it about the pets!</Text>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={s.flex}
        contentContainerStyle={s.msgList}
        alwaysBounceVertical={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 && (
          <View style={s.empty}>
            <Text style={{ fontSize: 36 }}>🐾</Text>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {isParticipant ? 'Start the conversation' : 'RSVP to join the chat'}
            </Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>
              {isParticipant
                ? 'Ask the organizer questions, share details, coordinate with attendees.'
                : 'Only attendees and the organizer can chat here.'}
            </Text>
          </View>
        )}
        {messages.map(m => {
          const isMine = m.sender_id === userId;
          const isOrg  = m.sender_id === event.organizer_id;
          return (
            <View key={m.id} style={[s.msgRow, isMine && s.msgRowRight]}>
              {!isMine && (
                <View style={[s.senderAvatar, { backgroundColor: isOrg ? `${ac}20` : `${colors.textTertiary}18` }]}>
                  <Text style={[s.senderInitials, { color: isOrg ? ac : colors.textSecondary }]}>
                    {initials(m.sender?.handle ?? '?')}
                  </Text>
                </View>
              )}
              <View style={{ maxWidth: '72%' }}>
                {!isMine && (
                  <Text style={[s.senderName, { color: isOrg ? ac : colors.textSecondary }]}>
                    {m.sender?.handle ? `@${m.sender.handle}` : 'PawBond user'}{isOrg ? ' · Organizer' : ''}
                  </Text>
                )}
                <View style={[
                  s.bubble,
                  isMine
                    ? { backgroundColor: ac }
                    : { backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1 },
                ]}>
                  <Text style={[s.bubbleText, { color: isMine ? '#fff' : colors.textPrimary }]}>
                    {m.message}
                  </Text>
                </View>
                <Text style={[s.msgTime, { color: colors.textSecondary, alignSelf: isMine ? 'flex-end' : 'flex-start' }]}>
                  {msgTime(m.sent_at)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom area: feedback card OR input OR locked bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isEventOver ? (
          <>
            {showFeedback && (
              <FeedbackCard
                eventId={event.id}
                userId={userId!}
                colors={colors}
                onDone={() => setFeedbackDone(true)}
              />
            )}
            <View style={[s.lockedBar, { backgroundColor: colors.inputBg, borderTopColor: colors.border }]}>
              <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
              <Text style={[s.lockedText, { color: colors.textSecondary }]}>
                This event has ended · chat is read-only
              </Text>
            </View>
          </>
        ) : !isParticipant ? (
          <View style={[s.lockedBar, { backgroundColor: colors.inputBg, borderTopColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.textTertiary} />
            <Text style={[s.lockedText, { color: colors.textSecondary }]}>
              RSVP to join the conversation
            </Text>
          </View>
        ) : (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
            {profanityWarning && (
              <View style={[s.profanityBar, { backgroundColor: '#FFF3CD' }]}>
                <Ionicons name="warning-outline" size={14} color="#856404" />
                <Text style={[s.profanityText, { color: '#856404' }]}>
                  Offensive language removed. Please keep it respectful 🐾
                </Text>
                <TouchableOpacity onPress={() => setProfanityWarning(false)} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
                  <Ionicons name="close" size={14} color="#856404" />
                </TouchableOpacity>
              </View>
            )}
            <View style={[s.inputRow, { backgroundColor: colors.background }]}>
              <TextInput
                style={[s.input, { backgroundColor: colors.inputBg, borderColor: profanityWarning ? '#F59E0B' : colors.border, color: colors.textPrimary }]}
                placeholder="Message everyone…"
                placeholderTextColor={colors.placeholder}
                value={draft}
                onChangeText={t => { setDraft(t); if (profanityWarning) setProfanityWarning(false); }}
                multiline
                maxLength={1000}
                returnKeyType="send"
                onSubmitEditing={sendMessage}
              />
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: draft.trim() ? ac : colors.inputBg }]}
                onPress={sendMessage}
                disabled={!draft.trim() || sending}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="send" size={17} color={draft.trim() ? '#fff' : colors.textTertiary} />
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Attendees modal */}
      <AttendeeModal
        visible={showAttendees}
        attendees={attendees}
        organizer={event.organizer}
        organizerId={event.organizer_id}
        onClose={() => setShowAttendees(false)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex: { flex: 1 },

  msgList: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 20, gap: 10 },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: TYPO.subheading, fontWeight: '700' },
  emptySub:   { fontSize: TYPO.body, textAlign: 'center', lineHeight: 20, maxWidth: 260 },

  msgRow:      { flexDirection: 'row', gap: 8, alignSelf: 'flex-start' },
  msgRowRight: { alignSelf: 'flex-end' },

  senderAvatar:   { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  senderInitials: { fontSize: TYPO.body, fontWeight: '700' },
  senderName:     { fontSize: TYPO.body, fontWeight: '600', marginBottom: 3, marginLeft: 2 },

  bubble:     { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: TYPO.body, lineHeight: 21 },
  msgTime:    { fontSize: TYPO.body, marginTop: 3, marginHorizontal: 4 },

  lockedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lockedText: { fontSize: TYPO.body },

  tipBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#FFFBEB', borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FDE68A', paddingHorizontal: 14, paddingVertical: 7,
  },
  tipText: { flex: 1, fontSize: TYPO.caption, color: '#92400E', fontWeight: '500' },

  profanityBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  profanityText: { flex: 1, fontSize: TYPO.body, fontWeight: '600' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  input: {
    flex: 1, borderRadius: RADIUS.lg, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: TYPO.body, maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
});
