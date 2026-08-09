import { showAlert } from '@/components/AppAlert';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import BottomSheet from '@/components/BottomSheet';
import { bulkDeletePlaydateRequests } from '@/lib/db';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { formatTime } from '@/lib/units';
import { PlaydateEntry } from '@/features/playdates/types';
import { CalendarSheet } from '@/features/playdates/components/CalendarSheet';
import { PlaydateEntryCard } from '@/features/playdates/components/PlaydateEntryCard';
import { PlaydateRatingModal, RatingTarget } from '@/features/playdates/components/PlaydateRatingModal';
import { TYPO } from '@/constants/theme';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

// ── Deletability rules ─────────────────────────────────────────────────────────
function deletableReason(entry: PlaydateEntry): true | string {
  if (entry.displayStatus === 'accepted')   return 'Upcoming';
  if (entry.displayStatus === 'scheduling') return 'In progress';
  if (entry.displayStatus === 'pending')    return 'Still active';
  if (entry.displayStatus !== 'past' && entry.displayStatus !== 'declined' && entry.displayStatus !== 'history') return 'Not ended';
  return true;
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ icon, label, count, color, accent }: {
  icon: string; label: string; count: number; color: string; accent: string;
}) {
  return (
    <View style={sh.row}>
      <View style={[sh.iconWrap, { backgroundColor: color + '18' }]}>
        <Text style={{ fontSize: TYPO.body }}>{icon}</Text>
      </View>
      <Text style={[sh.label, { color }]}>{label}</Text>
      <View style={[sh.badge, { backgroundColor: color + '20' }]}>
        <Text style={[sh.badgeText, { color }]}>{count}</Text>
      </View>
    </View>
  );
}

const sh = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  iconWrap:  { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label:     { fontSize: TYPO.caption, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 },
  badge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: TYPO.caption, fontWeight: '800' },
});

// ── Main screen ────────────────────────────────────────────────────────────────
export default function MyPlaydatesScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { activePet, pets, fetchPets } = usePetStore(useShallow(s => ({
    activePet: s.activePet, pets: s.pets, fetchPets: s.fetchPets,
  })));

  const pet = activePet();
  const ac = (pet as any)?.accent_color ?? '#7C5CBF';

  const userId = user?.id ?? null;
  const [entries, setEntries]             = useState<PlaydateEntry[]>([]);
  const [loading, setLoading]             = useState(true);
  const [liveIndicator, setLiveIndicator] = useState(false);
  const [calendarEntry, setCalendarEntry] = useState<PlaydateEntry | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const scrollRef    = useRef<ScrollView>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cpRequestId,  setCpRequestId]  = useState<string | null>(null);
  const [cpVisible,    setCpVisible]    = useState(false);
  const [cpDate,       setCpDate]       = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; });
  const [cpEndDate,    setCpEndDate]    = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return d; });
  const [cpLocation,   setCpLocation]   = useState('');
  const [cpMessage,    setCpMessage]    = useState('');
  const [cpPickerMode, setCpPickerMode] = useState<'date' | 'time' | 'endtime'>('date');
  const [cpShowPicker, setCpShowPicker] = useState(false);
  const [cpSending,    setCpSending]    = useState(false);

  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting]       = useState(false);

  const [ratingTarget, setRatingTarget] = useState<RatingTarget | null>(null);
  const [filterPetId, setFilterPetId]     = useState<string | null>(null);
  const [filterStatus, setFilterStatus]   = useState<'all' | 'upcoming' | 'pending' | 'inprogress' | 'past'>('all');
  const [filterDir, setFilterDir]         = useState<'all' | 'sent' | 'received'>('all');
  const [dateFrom, setDateFrom]           = useState<Date | null>(null);
  const [dateTo, setDateTo]               = useState<Date | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<'from' | 'to' | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);

  useEffect(() => { if (userId) fetchPets(userId); }, [userId]);

  const petIds = pets.map(p => p.id);

  useEffect(() => {
    if (userId && petIds.length) {
      setEntries([]);
      loadAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, petIds.join(',')]);

  const loadAll = useCallback(async (silent = false) => {
    if (!userId || !petIds.length) return;
    if (!silent) setLoading(true);

    const PROPOSAL_FIELDS = `id, status, created_at, updated_at, from_owner_id, from_pet_id, to_pet_id, responder_user_id,
      proposed_date, proposed_time, proposed_end_time, proposed_location, message,
      agreed_date, agreed_time, agreed_location,
      latest_proposal:playdate_proposals(proposed_date, proposed_time, proposed_end_time, proposed_location, message, round)`;

    try {
      const [{ data: outData }, { data: inData }] = await Promise.all([
        supabase.from('playdate_requests')
          .select(`${PROPOSAL_FIELDS},
            to_pet:pets!playdate_requests_to_pet_id_fkey(id, name, emoji, accent_color, avatar_url, breed, birthday)`)
          .in('from_pet_id', petIds)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('playdate_requests')
          .select(`${PROPOSAL_FIELDS},
            from_pet:pets!playdate_requests_from_pet_id_fkey(id, name, emoji, accent_color, avatar_url, breed, birthday)`)
          .in('to_pet_id', petIds)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const now = Date.now();
      const isPastPlaydate = (d?: string | null, t?: string | null) =>
        !!d && new Date(`${d}T${t ?? '23:59'}`).getTime() < now;

      const resolveLatest = (r: any) => {
        const lpArr = (Array.isArray(r.latest_proposal) ? r.latest_proposal : [r.latest_proposal]).filter(Boolean);
        const lp = lpArr.sort((a: any, b: any) => (b.round ?? 0) - (a.round ?? 0))[0];
        return r.status === 'scheduling' && lp ? {
          proposed_date: lp.proposed_date ?? r.proposed_date,
          proposed_time: lp.proposed_time ?? r.proposed_time,
          proposed_end_time: lp.proposed_end_time ?? r.proposed_end_time,
          proposed_location: lp.proposed_location ?? r.proposed_location,
          message: lp.message ?? r.message,
        } : {};
      };

      const HISTORY_STATUSES = new Set(['declined', 'withdrawn', 'cancelled', 'expired']);

      const all: PlaydateEntry[] = [];

      (outData ?? []).forEach((r: any) => {
        const theirPet = Array.isArray(r.to_pet) ? r.to_pet[0] : r.to_pet;
        if (!theirPet?.id) return;

        let displayStatus: PlaydateEntry['displayStatus'];
        if (r.status === 'accepted') {
          displayStatus = isPastPlaydate(r.agreed_date, r.agreed_time) ? 'past' : 'accepted';
        } else if (r.status === 'scheduling') {
          displayStatus = 'scheduling';
        } else if (r.status === 'pending') {
          displayStatus = 'pending';
        } else if (HISTORY_STATUSES.has(r.status)) {
          displayStatus = 'history';
        } else {
          displayStatus = 'declined';
        }

        all.push({
          id: r.id, type: 'request', direction: 'outgoing', status: r.status, displayStatus,
          created_at: r.created_at, updated_at: r.updated_at,
          from_owner_id: r.from_owner_id, responder_user_id: r.responder_user_id,
          myPetId: r.from_pet_id,
          pet: theirPet,
          parentName: null,
          parentAvatarUrl: null,
          agreed_date: r.agreed_date, agreed_time: r.agreed_time, agreed_location: r.agreed_location,
          proposed_date: r.proposed_date, proposed_time: r.proposed_time,
          proposed_end_time: r.proposed_end_time, proposed_location: r.proposed_location,
          message: r.message,
          ...resolveLatest(r),
        });
      });

      const outgoingIds = new Set(all.map(e => e.id));
      (inData ?? []).forEach((r: any) => {
        if (outgoingIds.has(r.id)) return;
        const fromPet = Array.isArray(r.from_pet) ? r.from_pet[0] : r.from_pet;
        if (!fromPet?.id) return;

        let displayStatus: PlaydateEntry['displayStatus'];
        if (r.status === 'accepted') {
          displayStatus = isPastPlaydate(r.agreed_date, r.agreed_time) ? 'past' : 'accepted';
        } else if (r.status === 'scheduling') {
          displayStatus = 'scheduling';
        } else if (r.status === 'pending') {
          displayStatus = 'pending';
        } else if (HISTORY_STATUSES.has(r.status)) {
          displayStatus = 'history';
        } else {
          displayStatus = 'declined';
        }

        all.push({
          id: r.id, type: 'request', direction: 'incoming',
          status: r.status, displayStatus,
          created_at: r.created_at, updated_at: r.updated_at,
          from_owner_id: r.from_owner_id, responder_user_id: r.responder_user_id,
          myPetId: r.to_pet_id,
          pet: fromPet,
          parentName: null,
          parentAvatarUrl: null,
          agreed_date: r.agreed_date, agreed_time: r.agreed_time, agreed_location: r.agreed_location,
          proposed_date: r.proposed_date, proposed_time: r.proposed_time,
          proposed_end_time: r.proposed_end_time, proposed_location: r.proposed_location,
          message: r.message,
          ...resolveLatest(r),
        });
      });

      // Fetch existing ratings any of the user's pets have given for past playdates
      const pastIds = all.filter(e => e.displayStatus === 'past').map(e => e.id);
      if (pastIds.length) {
        const { data: myRatings } = await supabase
          .from('playdate_ratings')
          .select('playdate_request_id, overall_rating')
          .in('rater_pet_id', petIds)
          .in('playdate_request_id', pastIds);
        const ratingMap: Record<string, number> = Object.fromEntries(
          (myRatings ?? []).map((r: any) => [r.playdate_request_id, parseFloat(r.overall_rating) || 0])
        );
        for (const e of all) {
          if (ratingMap[e.id] != null) e.myRating = ratingMap[e.id];
        }
      }

      const eventTs = (e: PlaydateEntry): number => {
        if (e.agreed_date) return new Date(`${e.agreed_date}T${e.agreed_time ?? '00:00'}`).getTime();
        if (e.proposed_date) return new Date(`${e.proposed_date}T${e.proposed_time ?? '00:00'}`).getTime();
        return new Date(e.created_at).getTime();
      };
      all.sort((a, b) => eventTs(b) - eventTs(a));
      setEntries(all);
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Could not load playdates. Pull to refresh.');
    } finally {
      setLoading(false);
    }
  }, [userId, petIds.join(',')]);

  useEffect(() => {
    if (!userId || !petIds.length) return;
    const pulse = () => {
      setLiveIndicator(true);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      liveTimerRef.current = setTimeout(() => setLiveIndicator(false), 2000);
    };
    const channel = supabase
      .channel(`my-playdates-rt-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_logs', filter: `user_id=eq.${userId}` },
        (p) => {
          const type = (p.new as any)?.type as string | undefined;
          if (type?.startsWith('playdate') || type === 'chat_message') { pulse(); loadAll(); }
        })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, petIds.join(',')]);

  useFocusEffect(useCallback(() => {
    if (userId && petIds.length) loadAll(true);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, petIds.join(','), loadAll]));

  // ── Actions ────────────────────────────────────────────────────────────────

  const acceptIncoming = useCallback(async (requestId: string) => {
    const { data, error } = await supabase.functions.invoke('playdates', {
      body: { action: 'respond', request_id: requestId, respond_action: 'accept' },
    });
    if (error || data?.error) { showAlert('Error', data?.error ?? error?.message ?? 'Could not accept'); return; }
    await loadAll();
    if (data?.chat_id) router.push(`/playdate-chat/${data.chat_id}`);
  }, [loadAll]);

  const declineIncoming = useCallback(async (requestId: string) => {
    showAlert('Decline Request?', "The other pet's parent will be notified.", [
      { text: 'Keep', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: async () => {
        const { data, error } = await supabase.functions.invoke('playdates', {
          body: { action: 'respond', request_id: requestId, respond_action: 'decline' },
        });
        if (error || data?.error) { showAlert('Error', data?.error ?? error?.message ?? 'Could not decline'); return; }
        setEntries(prev => prev.filter(e => e.id !== requestId));
      }},
    ]);
  }, []);

  const withdraw = useCallback(async (requestId: string) => {
    showAlert('Withdraw Request?', 'Cancel this playdate request?', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: async () => {
        const { data, error } = await supabase.functions.invoke('playdates', {
          body: { action: 'withdraw', request_id: requestId },
        });
        if (error || data?.error) { showAlert('Error', data?.error ?? error?.message ?? 'Could not withdraw'); return; }
        setEntries(prev => prev.filter(e => e.id !== requestId));
      }},
    ]);
  }, []);

  const resend = useCallback(async (requestId: string) => {
    const { data, error } = await supabase.functions.invoke('playdates', {
      body: { action: 'resend', request_id: requestId },
    });
    if (error || data?.error) { showAlert('Error', data?.error ?? error?.message ?? 'Could not resend'); return; }
    showAlert('Nudge sent! 🐾', "The other pet's parent got a reminder.");
  }, []);

  const playAgain = useCallback((entry: PlaydateEntry) => {
    showAlert(
      `Play again with ${entry.pet.name}? 🐾`,
      'Send a new playdate request to this pet.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send request', onPress: () => router.push(`/(tabs)/connect` as any) },
      ],
    );
  }, []);

  const openCounterPropose = useCallback((requestId: string) => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
    const e = new Date(d); e.setHours(11, 0, 0, 0);
    setCpDate(d); setCpEndDate(e); setCpLocation(''); setCpMessage('');
    setCpRequestId(requestId);
    setCpVisible(true);
  }, []);

  const sendCounterPropose = useCallback(async () => {
    if (!cpRequestId) return;
    if (cpEndDate <= cpDate) { showAlert('Invalid time', 'End time must be after start time.'); return; }
    setCpSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: {
          action: 'respond', request_id: cpRequestId, respond_action: 'counter_propose',
          proposed_date: format(cpDate, 'yyyy-MM-dd'),
          proposed_time: format(cpDate, 'HH:mm'),
          proposed_end_time: format(cpEndDate, 'HH:mm'),
          proposed_location: cpLocation.trim() || null,
          message: cpMessage.trim() || undefined,
        },
      });
      if (error || data?.error) { showAlert('Error', data?.error ?? error?.message ?? 'Could not send proposal'); return; }
      setCpVisible(false);
      await loadAll();
    } finally {
      setCpSending(false);
    }
  }, [cpRequestId, cpDate, cpEndDate, cpLocation, cpMessage, cpSending, loadAll]);

  // ── Select mode ────────────────────────────────────────────────────────────

  const enterSelectMode = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const clearSelection = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);

  const deleteSelected = useCallback(() => {
    const toDelete = entries.filter(e => selectedIds.has(e.id));
    const n = toDelete.length;
    if (n === 0) return;
    showAlert(`Delete ${n} ${n === 1 ? 'entry' : 'entries'}?`, 'Permanently removes them from your history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try {
          const activeOut = toDelete.filter(e => e.direction === 'outgoing' && (e.displayStatus === 'pending' || e.displayStatus === 'scheduling'));
          await Promise.all(activeOut.map(e => supabase.functions.invoke('playdates', { body: { action: 'withdraw', request_id: e.id } }).catch(() => {})));
          await bulkDeletePlaydateRequests(toDelete.map(e => e.id));
          setEntries(prev => prev.filter(e => !selectedIds.has(e.id)));
          setSelectedIds(new Set()); setSelectMode(false);
        } catch (e: any) { showAlert('Error', e.message ?? 'Could not delete'); }
        finally { setDeleting(false); }
      }},
    ]);
  }, [entries, selectedIds]);

  // ── Section grouping ───────────────────────────────────────────────────────
  const visibleEntries = entries.filter(e => {
    if (filterPetId && e.myPetId !== filterPetId) return false;
    if (filterDir === 'sent'     && e.direction !== 'outgoing') return false;
    if (filterDir === 'received' && e.direction !== 'incoming') return false;
    // Default view: only show active/ongoing playdates (accepted + scheduling + pending)
    if (filterStatus === 'all' && (e.displayStatus === 'past' || e.displayStatus === 'history' || e.displayStatus === 'declined')) return false;
    if (filterStatus === 'upcoming'   && e.displayStatus !== 'accepted')   return false;
    if (filterStatus === 'pending'    && !(e.displayStatus === 'pending' || e.displayStatus === 'scheduling')) return false;
    if (filterStatus === 'inprogress' && e.displayStatus !== 'scheduling') return false;
    if (filterStatus === 'past'       && !(e.displayStatus === 'past' || e.displayStatus === 'history' || e.displayStatus === 'declined')) return false;
    if (dateFrom || dateTo) {
      const eventDateStr = e.agreed_date ?? e.proposed_date ?? e.created_at?.slice(0, 10);
      if (eventDateStr) {
        const ts = new Date(eventDateStr).getTime();
        if (dateFrom) { const f = new Date(dateFrom); f.setHours(0,0,0,0); if (ts < f.getTime()) return false; }
        if (dateTo)   { const t = new Date(dateTo);   t.setHours(23,59,59,999); if (ts > t.getTime()) return false; }
      }
    }
    return true;
  });

  const needsReply   = visibleEntries.filter(e =>
    (e.displayStatus === 'pending' && e.direction === 'incoming') ||
    (e.displayStatus === 'scheduling' && e.direction === 'incoming' && e.responder_user_id !== userId)
  );
  const inProgress   = visibleEntries.filter(e =>
    e.displayStatus === 'scheduling' &&
    !(e.direction === 'incoming' && e.responder_user_id !== userId)
  );
  const upcoming     = visibleEntries.filter(e => e.displayStatus === 'accepted');
  const waiting      = visibleEntries.filter(e =>
    e.displayStatus === 'pending' && e.direction === 'outgoing'
  );
  const memories     = visibleEntries.filter(e => e.displayStatus === 'past');
  const history      = visibleEntries.filter(e => e.displayStatus === 'history' || e.displayStatus === 'declined');

  const selectableAll = visibleEntries.filter(e => deletableReason(e) === true);

  const renderCard = (entry: PlaydateEntry) => {
    const dr = deletableReason(entry);
    return (
      <PlaydateEntryCard
        key={`${entry.direction}-${entry.id}`}
        entry={entry} myPet={pet} ac={ac} colors={colors} currentUserId={userId}
        onWithdraw={withdraw} onResend={resend} onAccept={acceptIncoming}
        onDecline={declineIncoming} onCounterPropose={openCounterPropose}
        onCalendarPress={setCalendarEntry} onPlayAgain={playAgain}
        onRatePlaydate={(e) => setRatingTarget({
          playdateRequestId: e.id,
          raterPetId: e.myPetId ?? petIds[0],
          ratedPet: e.pet,
          agreedDate: e.agreed_date,
        })}
        selectMode={selectMode} selected={selectedIds.has(entry.id)} deletable={dr}
        onLongPress={() => { if (dr === true) enterSelectMode(entry.id); }}
        onToggleSelect={() => toggleSelect(entry.id)}
      />
    );
  };

  const isEmpty = visibleEntries.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={mp.header}>
          {selectMode ? (
            <>
              <TouchableOpacity onPress={clearSelection} style={mp.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[mp.title, { color: colors.textPrimary, flex: 1 }]}>{selectedIds.size} selected</Text>
              <TouchableOpacity onPress={() => setSelectedIds(new Set(selectableAll.map(e => e.id)))} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={deleteSelected} disabled={selectedIds.size === 0 || deleting}
                style={[mp.iconBtn, { backgroundColor: selectedIds.size > 0 ? '#E24B4A' : colors.inputBg, opacity: selectedIds.size === 0 ? 0.4 : 1 }]}>
                {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash-outline" size={17} color={selectedIds.size > 0 ? '#fff' : colors.textTertiary} />}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => router.back()}
                style={[mp.iconBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={[mp.title, { color: colors.textPrimary }]}>My Playdates</Text>
                <View style={[mp.liveDot, { backgroundColor: liveIndicator ? '#22C55E' : '#94A3B840' }]} />
              </View>
              <TouchableOpacity style={[mp.iconBtn, { backgroundColor: colors.inputBg }]} onPress={() => loadAll()}>
                <Ionicons name="refresh-outline" size={18} color={ac} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Pet switcher ─────────────────────────────────────────── */}
        {pets.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: 'row' }}>
            {pets.map((p) => {
              const isActive = filterPetId === p.id;
              const accent: string = (p as any).accent_color ?? ac;
              const avatarUrl: string | null = (p as any).avatar_url ?? null;
              return (
                <TouchableOpacity key={p.id} onPress={() => setFilterPetId(isActive ? null : p.id)} activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 12, paddingVertical: 4, borderRadius: 28,
                    backgroundColor: isActive ? accent + '22' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                    borderWidth: isActive ? 1.5 : 1, borderColor: isActive ? accent : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)') }}>
                  <LinearGradient colors={[`${accent}88`, `${accent}33`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: isActive ? 2 : 1.5, borderColor: isActive ? accent : accent + '60' }}>
                    {avatarUrl
                      ? <Image source={{ uri: avatarUrl }} cachePolicy="memory-disk" style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                      : <Text style={{ fontSize: TYPO.heading }}>{(p as any).emoji ?? '🐾'}</Text>}
                  </LinearGradient>
                  <Text style={{ fontSize: TYPO.body, fontWeight: isActive ? '700' : '500', color: isActive ? accent : colors.textSecondary, maxWidth: 80 }} numberOfLines={1}>{p.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Compact filter bar ───────────────────────────────────── */}
        {!selectMode && (() => {
          const base = filterPetId ? entries.filter(e => e.myPetId === filterPetId) : entries;
          const statusLabel: Record<string, string> = { all: 'All', upcoming: '🎉 Upcoming', pending: '📬 Pending', inprogress: '💬 In Progress', past: '✅ Past' };
          const dirLabel: Record<string, string> = { all: 'All directions', sent: '↑ Sent', received: '↓ Received' };
          const activeCount =
            (filterStatus !== 'all' ? 1 : 0) +
            (filterDir !== 'all' ? 1 : 0) +
            (dateFrom || dateTo ? 1 : 0);
          const summaryParts = [
            statusLabel[filterStatus],
            filterDir !== 'all' ? dirLabel[filterDir] : null,
            dateFrom && dateTo ? `${format(dateFrom, 'MMM d')} – ${format(dateTo, 'MMM d')}` :
            dateFrom ? `From ${format(dateFrom, 'MMM d')}` :
            dateTo   ? `To ${format(dateTo, 'MMM d')}` : null,
          ].filter(Boolean).join(' · ');

          return (
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <TouchableOpacity onPress={() => setFiltersVisible(true)} activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10,
                  backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1,
                  borderColor: activeCount > 0 ? ac : colors.border,
                  paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                <Ionicons name="options-outline" size={16} color={activeCount > 0 ? ac : colors.textSecondary} />
                <Text style={{ flex: 1, fontSize: TYPO.body, color: activeCount > 0 ? colors.textPrimary : colors.textSecondary,
                  fontWeight: activeCount > 0 ? '600' : '400' }} numberOfLines={1}>
                  {summaryParts || 'All playdates'}
                </Text>
                {activeCount > 0 && (
                  <View style={{ backgroundColor: ac, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{activeCount}</Text>
                  </View>
                )}
                <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
              </TouchableOpacity>

            </View>
          );
        })()}

      </SafeAreaView>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <PawBondLoader size={52} />
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Loading playdates…</Text>
        </View>
      ) : isEmpty ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 }}>
          <Text style={{ fontSize: 52 }}>🐾</Text>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5, textAlign: 'center' }}>
            No playdates yet
          </Text>
          <Text style={{ fontSize: TYPO.body, textAlign: 'center', color: colors.textSecondary, lineHeight: 22, opacity: 0.75 }}>
            Find a playmate for {pet?.name ?? 'your pet'} in the Connect tab and send your first request!
          </Text>
          <TouchableOpacity
            style={{ paddingHorizontal: 28, paddingVertical: 13, borderRadius: 22, backgroundColor: ac, marginTop: 4 }}
            onPress={() => router.replace({ pathname: '/(tabs)/connect' as any, params: { tab: 'Nearby' } })}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Find a playmate 🐾</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false} alwaysBounceVertical={false} overScrollMode="never">

          {/* ── Needs your reply ─────────────────────── */}
          {needsReply.length > 0 && (
            <>
              <SectionHeader icon="🔔" label="Needs your reply" count={needsReply.length} color="#E24B4A" accent={ac} />
              <View style={{ paddingHorizontal: 16 }}>
                {needsReply.map(renderCard)}
              </View>
            </>
          )}

          {/* ── In progress ──────────────────────────── */}
          {inProgress.length > 0 && (
            <>
              <SectionHeader icon="💬" label="In progress" count={inProgress.length} color="#4896D8" accent={ac} />
              <View style={{ paddingHorizontal: 16 }}>
                {inProgress.map(renderCard)}
              </View>
            </>
          )}

          {/* ── Upcoming ─────────────────────────────── */}
          {upcoming.length > 0 && (
            <>
              <SectionHeader icon="🎉" label="Upcoming" count={upcoming.length} color="#22C55E" accent={ac} />
              <View style={{ paddingHorizontal: 16 }}>
                {upcoming.map(renderCard)}
              </View>
            </>
          )}

          {/* ── Waiting for reply ────────────────────── */}
          {waiting.length > 0 && (
            <>
              <SectionHeader icon="📬" label="Waiting for reply" count={waiting.length} color="#FF8C55" accent={ac} />
              <View style={{ paddingHorizontal: 16 }}>
                {waiting.map(renderCard)}
              </View>
            </>
          )}

          {/* ── Memories ─────────────────────────────── */}
          {memories.length > 0 && (
            <>
              <SectionHeader icon="✅" label="Memories" count={memories.length} color="#94A3B8" accent={ac} />
              <View style={{ paddingHorizontal: 16 }}>
                {memories.map(renderCard)}
              </View>
            </>
          )}

          {/* ── Didn't work out (collapsed by default, auto-expanded in Past tab) ─ */}
          {history.length > 0 && (
            <>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setHistoryExpanded(v => !v)}
                style={[sh.row, { paddingTop: 20, paddingBottom: 10, paddingHorizontal: 16 }]}>
                <View style={[sh.iconWrap, { backgroundColor: '#94A3B815' }]}>
                  <Text style={{ fontSize: TYPO.body }}>📭</Text>
                </View>
                <Text style={[sh.label, { color: '#94A3B8' }]}>Didn't work out</Text>
                <View style={[sh.badge, { backgroundColor: '#94A3B820' }]}>
                  <Text style={[sh.badgeText, { color: '#94A3B8' }]}>{history.length}</Text>
                </View>
                <Ionicons
                  name={historyExpanded ? 'chevron-up' : 'chevron-down'}
                  size={15} color="#94A3B8" style={{ marginLeft: 4 }} />
              </TouchableOpacity>

              {(historyExpanded || filterStatus === 'past') && (
                <View style={{ paddingHorizontal: 16 }}>
                  <Text style={{ fontSize: TYPO.caption, color: '#94A3B8', marginBottom: 10, paddingHorizontal: 2, lineHeight: 18 }}>
                    Declined, cancelled, withdrawn, or expired requests. Long-press any card to delete.
                  </Text>
                  {history.map(renderCard)}
                </View>
              )}
            </>
          )}

        </ScrollView>
      )}

      {/* ── Date range picker ─────────────────────────────────────── */}
      <AppDateTimePicker
        visible={!!datePickerTarget}
        mode="date"
        value={datePickerTarget === 'to' ? (dateTo ?? new Date()) : (dateFrom ?? new Date())}
        accent={ac}
        onCancel={() => setDatePickerTarget(null)}
        onConfirm={(date) => {
          if (datePickerTarget === 'from') {
            setDateFrom(date);
            if (dateTo && date > dateTo) setDateTo(null);
          } else {
            setDateTo(date);
            if (dateFrom && date < dateFrom) setDateFrom(null);
          }
          setDatePickerTarget(null);
        }}
      />

      {/* ── Calendar sheet ─────────────────────────────────────────── */}
      <CalendarSheet entry={calendarEntry} myPetName={pet?.name ?? 'My baby'} colors={colors} ac={ac} bottomInset={insets.bottom} onClose={() => setCalendarEntry(null)} />
      <PlaydateRatingModal
        visible={!!ratingTarget}
        target={ratingTarget}
        ac={ac}
        colors={colors}
        onClose={() => setRatingTarget(null)}
        onSubmitted={(requestId) => {
          setRatingTarget(null);
          // Optimistically mark as rated (we don't know the exact score yet — reload to get it)
          setEntries(prev => prev.map(e => e.id === requestId ? { ...e, myRating: -1 } : e));
          loadAll(true);
        }}
      />

      {/* ── Filter sheet — top-level to prevent remount on chip tap ── */}
      <BottomSheet visible={filtersVisible} onClose={() => setFiltersVisible(false)} title="Filter Playdates" accent={ac}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 20, paddingTop: 4, paddingBottom: 8 }}>
          {(() => {
            const base = filterPetId ? entries.filter(e => e.myPetId === filterPetId) : entries;
            return (<>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>STATUS</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {([
                    { key: 'all',        label: 'All',             count: base.filter(e => e.displayStatus !== 'past' && e.displayStatus !== 'history' && e.displayStatus !== 'declined').length },
                    { key: 'upcoming',   label: '🎉 Upcoming',     count: base.filter(e => e.displayStatus === 'accepted').length },
                    { key: 'pending',    label: '📬 Pending',      count: base.filter(e => e.displayStatus === 'pending' || e.displayStatus === 'scheduling').length },
                    { key: 'inprogress', label: '💬 In Progress',  count: base.filter(e => e.displayStatus === 'scheduling').length },
                    { key: 'past',       label: '✅ Past',         count: base.filter(e => e.displayStatus === 'past' || e.displayStatus === 'history' || e.displayStatus === 'declined').length },
                  ] as const).map(({ key, label, count }) => {
                    const on = filterStatus === key;
                    return (
                      <TouchableOpacity key={key} onPress={() => setFilterStatus(key)} activeOpacity={0.8}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: on ? ac : colors.inputBg, borderRadius: 20, borderWidth: 1,
                          borderColor: on ? ac : colors.border, paddingHorizontal: 14, paddingVertical: 8 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: on ? '700' : '500', color: on ? '#fff' : colors.textSecondary }}>{label}</Text>
                        {count > 0 && (
                          <View style={{ backgroundColor: on ? 'rgba(255,255,255,0.3)' : ac + '22', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: on ? '#fff' : ac }}>{count}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>DIRECTION</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([
                    { key: 'all',      label: 'All' },
                    { key: 'sent',     label: '↑ Sent' },
                    { key: 'received', label: '↓ Received' },
                  ] as const).map(({ key, label }) => {
                    const on = filterDir === key;
                    return (
                      <TouchableOpacity key={key} onPress={() => setFilterDir(key)} activeOpacity={0.8}
                        style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1,
                          backgroundColor: on ? `${ac}18` : colors.inputBg, borderColor: on ? ac : colors.border }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: on ? '700' : '500', color: on ? ac : colors.textSecondary }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>DATE RANGE</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity onPress={() => setDatePickerTarget('from')} activeOpacity={0.8}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: dateFrom ? `${ac}12` : colors.inputBg, borderRadius: 12, borderWidth: 1,
                      borderColor: dateFrom ? ac : colors.border, paddingHorizontal: 12, paddingVertical: 11 }}>
                    <Ionicons name="calendar-outline" size={15} color={dateFrom ? ac : colors.textTertiary} />
                    <Text style={{ fontSize: TYPO.body, fontWeight: dateFrom ? '600' : '400', color: dateFrom ? ac : colors.placeholder }}>
                      {dateFrom ? format(dateFrom, 'MMM d, yyyy') : 'From'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: TYPO.body, color: colors.textTertiary }}>–</Text>
                  <TouchableOpacity onPress={() => setDatePickerTarget('to')} activeOpacity={0.8}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: dateTo ? `${ac}12` : colors.inputBg, borderRadius: 12, borderWidth: 1,
                      borderColor: dateTo ? ac : colors.border, paddingHorizontal: 12, paddingVertical: 11 }}>
                    <Ionicons name="calendar-outline" size={15} color={dateTo ? ac : colors.textTertiary} />
                    <Text style={{ fontSize: TYPO.body, fontWeight: dateTo ? '600' : '400', color: dateTo ? ac : colors.placeholder }}>
                      {dateTo ? format(dateTo, 'MMM d, yyyy') : 'To'}
                    </Text>
                  </TouchableOpacity>
                  {(dateFrom || dateTo) && (
                    <TouchableOpacity onPress={() => { setDateFrom(null); setDateTo(null); }}
                      style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="close" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => { setFilterStatus('all'); setFilterDir('all'); setDateFrom(null); setDateTo(null); }}
                  style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFiltersVisible(false)}
                  style={{ flex: 2, borderRadius: 12, backgroundColor: ac, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Apply Filters</Text>
                </TouchableOpacity>
              </View>
            </>);
          })()}
        </ScrollView>
      </BottomSheet>

      {/* ── Counter-propose sheet ──────────────────────────────────── */}
      <BottomSheet
        visible={cpVisible}
        onClose={() => setCpVisible(false)}
        title="📅 Propose New Time"
        accent={ac}>
        <ScrollView showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 16, paddingTop: 4, paddingBottom: 8 }}>

          {/* WHEN card — date + time unified */}
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: `${ac}30`, overflow: 'hidden', backgroundColor: `${ac}0A` }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 8 }}>
              <Ionicons name="calendar" size={13} color={ac} />
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac }}>WHEN</Text>
            </View>

            {/* Date */}
            <TouchableOpacity onPress={() => { setCpPickerMode('date'); setCpShowPicker(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                marginHorizontal: 10, marginBottom: 8, backgroundColor: colors.inputBg,
                borderRadius: 12, borderWidth: 1.5,
                borderColor: cpPickerMode === 'date' && cpShowPicker ? ac : colors.border,
                paddingHorizontal: 14, paddingVertical: 12 }}>
              <Ionicons name="calendar-outline" size={16} color={ac} />
              <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>
                {format(cpDate, 'EEEE, MMMM d, yyyy')}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Start → End time pill row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginBottom: 12 }}>
              <TouchableOpacity onPress={() => { setCpPickerMode('time'); setCpShowPicker(true); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: cpPickerMode === 'time' && cpShowPicker ? ac : colors.border,
                  paddingHorizontal: 12, paddingVertical: 12 }}>
                <Ionicons name="time-outline" size={15} color={ac} />
                <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{formatTime(cpDate)}</Text>
              </TouchableOpacity>
              <Ionicons name="arrow-forward" size={13} color={colors.textTertiary} />
              <TouchableOpacity onPress={() => { setCpPickerMode('endtime'); setCpShowPicker(true); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: cpPickerMode === 'endtime' && cpShowPicker ? ac : colors.border,
                  paddingHorizontal: 12, paddingVertical: 12 }}>
                <Ionicons name="time-outline" size={15} color={colors.textTertiary} />
                <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{formatTime(cpEndDate)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Place */}
          <LocationAutocompleteInput
            value={cpLocation} onChangeText={setCpLocation}
            placeholder="Place (optional)"
            colors={colors} />

          {/* Note */}
          <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
            <TextInput style={{ fontSize: TYPO.body, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
              placeholder="Add a note (optional)" placeholderTextColor={colors.placeholder}
              value={cpMessage} onChangeText={t => setCpMessage(t.slice(0, 500))} multiline blurOnSubmit maxLength={500} />
            <Text style={{ fontSize: 11, color: cpMessage.length >= 480 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: 2 }}>
              {cpMessage.length}/500
            </Text>
          </View>

          {/* Summary strip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: `${ac}12`, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: `${ac}25` }}>
            <Text style={{ fontSize: 20 }}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                {format(cpDate, 'EEE, MMM d')} · {formatTime(cpDate)} – {formatTime(cpEndDate)}
              </Text>
              {(cpLocation.trim() || cpMessage.trim()) ? (
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                  {cpLocation.trim() ? `📍 ${cpLocation.trim()}` : ''}
                  {cpLocation.trim() && cpMessage.trim() ? '  ·  ' : ''}
                  {cpMessage.trim() ? `💬 ${cpMessage.trim()}` : ''}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Send button */}
          <TouchableOpacity onPress={sendCounterPropose} disabled={cpSending}
            style={{ backgroundColor: ac, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            {cpSending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Send Proposal</Text>}
          </TouchableOpacity>
        </ScrollView>

        <AppDateTimePicker visible={cpShowPicker} value={cpPickerMode === 'endtime' ? cpEndDate : cpDate}
          mode={cpPickerMode === 'endtime' ? 'time' : cpPickerMode} minimumDate={cpPickerMode === 'date' ? new Date() : undefined}
          accent={ac} onCancel={() => setCpShowPicker(false)}
          onConfirm={(date) => {
            setCpShowPicker(false);
            if (cpPickerMode === 'date') {
              setCpDate(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
              setCpEndDate(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
            } else if (cpPickerMode === 'time') {
              setCpDate(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; });
              setCpEndDate(prev => { const min = new Date(date); min.setHours(date.getHours() + 1, date.getMinutes(), 0, 0); return prev < min ? min : prev; });
            } else {
              setCpEndDate(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; });
            }
          }} />
      </BottomSheet>
    </View>
  );
}

const mp = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.4 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
});
