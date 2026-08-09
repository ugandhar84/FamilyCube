import { showAlert } from '@/components/AppAlert';
/**
 * PawBond — Playdate Request Detail (v2)
 * Proposal negotiation screen for a single playdate request.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Modal, Platform, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import BottomSheet from '@/components/BottomSheet';
import { format, parseISO } from 'date-fns';
import { todayLocal } from '@/lib/dates';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import BackButton from '@/components/BackButton';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { FeatureUnavailable } from '@/components/FeatureGate';
import { formatTime } from '@/lib/units';
import { TYPO } from '@/constants/theme';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

// ── Cancel reason picker ──────────────────────────────────────────────────────

const CANCEL_REASONS = [
  "Something came up 🙁",
  "Bad weather ⛈️",
  "My baby isn't feeling well 🐾",
  "Schedule conflict 📅",
  "Change of plans",
];

function pickCancelReason(): Promise<string | null | undefined> {
  return new Promise(resolve =>
    showAlert(
      'Reason for cancelling',
      'The other owner will be notified.',
      [
        ...CANCEL_REASONS.map(r => ({ text: r, onPress: () => resolve(r) })),
        { text: 'No reason', onPress: () => resolve(null) },
        { text: 'Keep it', style: 'cancel' as const, onPress: () => resolve(undefined) },
      ],
    ),
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pet {
  id: string; name: string; emoji: string;
  accent_color?: string | null; avatar_url?: string | null;
}

interface PlaydateRequest {
  id: string;
  from_pet_id: string; to_pet_id: string;
  from_owner_id: string; to_owner_id: string;
  responder_user_id?: string | null;
  cancel_reason?: string | null;
  status: string;
  proposed_date?: string | null; proposed_time?: string | null; proposed_location?: string | null;
  agreed_date?: string | null; agreed_time?: string | null; agreed_location?: string | null;
  expires_at?: string | null;
  from_confirmed?: boolean | null; to_confirmed?: boolean | null;
  from_pet: Pet; to_pet: Pet;
}

interface Proposal {
  id: string; request_id: string;
  proposed_by_pet_id: string; proposed_by_owner_id: string;
  proposed_date: string; proposed_time: string; proposed_end_time?: string | null;
  proposed_location: string; message?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'superseded';
  round: number; created_at: string;
}

interface OwnerContact { full_name: string | null; handle: string | null; phone: string | null; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(date?: string | null) {
  if (!date) return '';
  try { return format(parseISO(date), 'EEE, MMM d, yyyy'); } catch { return date; }
}
function fmtTime(time?: string | null) {
  if (!time) return '';
  try {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return formatTime(d);
  } catch { return time.substring(0, 5); }
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function PlaydateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore(s => s.user?.id);
  const playdatesEnabled = useFeatureFlag('connect_playdates_enabled', true);

  const [loading,   setLoading]   = useState(true);
  const [request,   setRequest]   = useState<PlaydateRequest | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contact,   setContact]   = useState<OwnerContact | null>(null);
  const [working,   setWorking]   = useState(false);

  // Date/time/place picker sheet
  const [sheetVisible,   setSheetVisible]   = useState(false);
  const [sheetAction,    setSheetAction]    = useState<'counter' | 'reschedule'>('counter');
  const [sheetDate,      setSheetDate]      = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; });
  const [sheetEndDate,   setSheetEndDate]   = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return d; });
  const [sheetLocation,  setSheetLocation]  = useState('');
  const [sheetMessage,   setSheetMessage]   = useState('');
  const [pickerMode,     setPickerMode]     = useState<'date' | 'time' | 'endtime'>('date');
  const [showPicker,     setShowPicker]     = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: rData }, { data: pData }] = await Promise.all([
      supabase.from('playdate_requests')
        .select(`id, from_pet_id, to_pet_id, from_owner_id, to_owner_id, status,
          responder_user_id, cancel_reason,
          proposed_date, proposed_time, proposed_location,
          agreed_date, agreed_time, agreed_location, expires_at,
          from_confirmed, to_confirmed,
          from_pet:pets!playdate_requests_from_pet_id_fkey(id, name, emoji, accent_color, avatar_url),
          to_pet:pets!playdate_requests_to_pet_id_fkey(id, name, emoji, accent_color, avatar_url)`)
        .eq('id', id)
        .single(),
      supabase.from('playdate_proposals')
        .select('id, request_id, proposed_by_pet_id, proposed_by_owner_id, proposed_date, proposed_time, proposed_end_time, proposed_location, message, status, round, created_at')
        .eq('request_id', id)
        .order('round', { ascending: true }),
    ]);

    if (!rData) { router.back(); return; }
    const req: PlaydateRequest = {
      ...rData,
      from_pet: Array.isArray(rData.from_pet) ? rData.from_pet[0] : rData.from_pet,
      to_pet:   Array.isArray(rData.to_pet)   ? rData.to_pet[0]   : rData.to_pet,
    };
    setRequest(req);
    setProposals((pData ?? []) as Proposal[]);

    if (req.status === 'accepted' && userId) {
      const otherOwnerId = req.from_owner_id === userId ? req.to_owner_id : req.from_owner_id;
      const { data: cData } = await supabase.from('profiles')
        .select('full_name, handle, phone').eq('id', otherOwnerId).single();
      if (cData) setContact(cData as OwnerContact);
    }
    setLoading(false);
  }, [id, userId]);

  const scrollRef = useRef<ScrollView>(null);
  const loadingRef = useRef(false);
  const guardedLoad = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try { await load(); } finally { loadingRef.current = false; }
  }, [load]);

  useFocusEffect(useCallback(() => {
    guardedLoad();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [guardedLoad]));

  // Realtime
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`playdate-detail:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playdate_requests',   filter: `id=eq.${id}` }, () => guardedLoad())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playdate_proposals',  filter: `request_id=eq.${id}` }, () => guardedLoad())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, guardedLoad]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const iAmFrom   = request?.from_owner_id === userId;
  const myPet     = request ? (iAmFrom ? request.from_pet : request.to_pet)   : null;
  const otherPet  = request ? (iAmFrom ? request.to_pet   : request.from_pet) : null;
  const ac        = otherPet?.accent_color ?? colors.primary;
  const currentProposal  = proposals.find(p => p.status === 'pending') ?? null;
  const iAmProposer      = currentProposal?.proposed_by_owner_id === userId;
  const isActive         = request && ['pending', 'scheduling'].includes(request.status);
  const isAccepted       = request?.status === 'accepted';
  const isTerminal       = request && ['declined', 'withdrawn', 'expired', 'cancelled', 'completed'].includes(request.status);

  // ── Actions ───────────────────────────────────────────────────────────────

  const callEdge = async (body: object) => {
    setWorking(true);
    const { data, error } = await supabase.functions.invoke('playdates', { body });
    setWorking(false);
    if (error || data?.error) {
      showAlert('Error', data?.error ?? error?.message ?? 'Something went wrong');
      return false;
    }
    await load();
    return true;
  };

  const acceptProposal = () => callEdge({ action: 'respond', request_id: id, respond_action: 'accept' });

  const declineRequest = () => {
    showAlert('Decline?', 'This will close the request and notify the other owner.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () =>
          callEdge({ action: 'respond', request_id: id, respond_action: 'decline' }) },
    ]);
  };

  const withdrawRequest = () => {
    showAlert('Withdraw?', 'Cancel your playdate request?', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () =>
          callEdge({ action: 'withdraw', request_id: id }).then(ok => { if (ok) router.back(); }) },
    ]);
  };

  const cancelPlaydate = async () => {
    const reason = await pickCancelReason();
    if (reason === undefined) return;
    const ok = await callEdge({ action: 'cancel', request_id: id, ...(reason ? { reason } : {}) });
    if (ok) router.back();
  };

  const openSheet = (action: 'counter' | 'reschedule') => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
    const e = new Date(d); e.setHours(11, 0, 0, 0);
    setSheetDate(d);
    setSheetEndDate(e);
    setSheetLocation('');
    setSheetMessage('');
    setSheetAction(action);
    setSheetVisible(true);
  };

  const submitSheet = async () => {
    const proposed_date     = format(sheetDate, 'yyyy-MM-dd');
    const proposed_time     = format(sheetDate, 'HH:mm');
    const proposed_end_time = format(sheetEndDate, 'HH:mm');
    const proposed_location = sheetLocation.trim() || null;
    const message           = sheetMessage.trim() || undefined;
    let body: object;
    if (sheetAction === 'counter') {
      body = { action: 'respond', request_id: id, respond_action: 'counter_propose', proposed_date, proposed_time, proposed_end_time, proposed_location, message };
    } else {
      body = { action: 'reschedule', request_id: id, proposed_date, proposed_time, proposed_end_time, proposed_location, message };
    }
    const ok = await callEdge(body);
    if (ok) setSheetVisible(false);
  };

  // ── Render guards ─────────────────────────────────────────────────────────

  if (!playdatesEnabled) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <FeatureUnavailable label="Playdates" />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <PawBondLoader size={52} />
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!request) return null;

  const statusCfg = {
    pending:    { label: 'Awaiting response', color: '#FF8C55', icon: 'time-outline' },
    scheduling: { label: 'Negotiating time',  color: colors.primaryText ?? colors.primary, icon: 'chatbubble-outline' },
    accepted:   { label: 'Confirmed ✅',       color: '#22C55E', icon: 'checkmark-circle-outline' },
    declined:   { label: 'Declined',           color: '#E24B4A', icon: 'close-circle-outline' },
    withdrawn:  { label: 'Withdrawn',          color: '#94A3B8', icon: 'arrow-undo-outline' },
    expired:    { label: 'Expired',            color: '#94A3B8', icon: 'hourglass-outline' },
    cancelled:  { label: 'Cancelled',          color: '#94A3B8', icon: 'ban-outline' },
    completed:  { label: 'Completed 🎉',       color: '#22C55E', icon: 'checkmark-done-outline' },
  } as const;
  const cfg = statusCfg[request.status as keyof typeof statusCfg] ?? statusCfg.pending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>

      {/* ── Header ── */}
      <View style={s.header}>
        <BackButton />
        <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <View style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: `${myPet?.accent_color ?? colors.primary}60` }}>
            {myPet?.avatar_url
              ? <Image source={{ uri: myPet.avatar_url }} cachePolicy="memory-disk" style={{ width: '100%', height: '100%' }} contentFit="cover" />
              : <LinearGradient colors={[`${myPet?.accent_color ?? colors.primary}30`, `${myPet?.accent_color ?? colors.primary}10`]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.title }}>{myPet?.emoji}</Text>
                </LinearGradient>
            }
          </View>
          <Text style={{ fontSize: TYPO.heading }}>🐾</Text>
          <View style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: `${otherPet?.accent_color ?? colors.primary}60` }}>
            {otherPet?.avatar_url
              ? <Image source={{ uri: otherPet.avatar_url }} cachePolicy="memory-disk" style={{ width: '100%', height: '100%' }} contentFit="cover" />
              : <LinearGradient colors={[`${otherPet?.accent_color ?? colors.primary}30`, `${otherPet?.accent_color ?? colors.primary}10`]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.title }}>{otherPet?.emoji}</Text>
                </LinearGradient>
            }
          </View>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never">

        {/* ── Status banner ── */}
        <View style={[s.statusBanner, { backgroundColor: `${cfg.color}14`, borderColor: `${cfg.color}30` }]}>
          <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
          <Text style={[s.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
          {request.expires_at && request.status === 'pending' && (
            <Text style={{ fontSize: TYPO.body, color: cfg.color, opacity: 0.7, marginLeft: 'auto' }}>
              Expires {fmtDate(request.expires_at.split('T')[0])}
            </Text>
          )}
        </View>

        {/* ── ACCEPTED STATE ── */}
        {isAccepted && (
          <>
            <View style={[s.card, { backgroundColor: `${ac}12`, borderColor: `${ac}30` }]}>
              <View style={[s.cardStrip, { backgroundColor: '#22C55E' }]} />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5, color: '#22C55E' }}>CONFIRMED PLAYDATE</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{fmtDate(request.agreed_date)}</Text>
                </View>
                {request.agreed_time && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
                    <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{fmtTime(request.agreed_time)}</Text>
                  </View>
                )}
                {request.agreed_location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
                    <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{request.agreed_location}</Text>
                  </View>
                )}
              </View>
            </View>

            {contact && (
              <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.cardStrip, { backgroundColor: ac }]} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5, color: colors.textSecondary }}>
                    {otherPet?.name?.toUpperCase() ?? 'OTHER PET'}'S OWNER
                  </Text>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                    {contact.handle ? `@${contact.handle}` : 'Pet parent'}
                  </Text>
                  {contact.phone ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <View style={[s.phonePill, { backgroundColor: `${ac}18`, borderColor: `${ac}30` }]}>
                        <Ionicons name="call-outline" size={13} color={ac} />
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>{contact.phone}</Text>
                      </View>
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Tap to call</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>No phone number on file</Text>
                  )}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[s.outlineBtn, { borderColor: ac }]}
              onPress={() => openSheet('reschedule')} disabled={working}>
              <Ionicons name="calendar-outline" size={15} color={ac} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>Propose Reschedule</Text>
            </TouchableOpacity>

            {(() => {
              const iHaveConfirmed = iAmFrom ? !!request.from_confirmed : !!request.to_confirmed;
              const isOnOrPast = request.agreed_date
                ? new Date(request.agreed_date + 'T23:59:59') <= new Date() || request.agreed_date <= todayLocal()
                : false;
              if (!isOnOrPast) return null;
              return iHaveConfirmed ? (
                <View style={[s.outlineBtn, { borderColor: '#22C55E50', backgroundColor: '#22C55E08' }]}>
                  <Ionicons name="checkmark-circle" size={15} color="#22C55E" />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#22C55E' }}>
                    Waiting for {otherPet?.name} to confirm…
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[s.outlineBtn, { borderColor: '#22C55E', backgroundColor: '#22C55E12' }]}
                  onPress={() => {
                    showAlert(
                      'Mark as Completed? 🎉',
                      `Did you have a great time with ${otherPet?.name}? Both owners need to confirm.`,
                      [
                        { text: 'Not yet', style: 'cancel' },
                        { text: "Yes, we met! 🐾", onPress: () => callEdge({ action: 'complete', request_id: id }) },
                      ],
                    );
                  }}
                  disabled={working}>
                  <Ionicons name="checkmark-done-outline" size={15} color="#22C55E" />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#22C55E' }}>Mark as Completed 🎉</Text>
                </TouchableOpacity>
              );
            })()}
          </>
        )}

        {/* ── ACTIVE STATE (pending / scheduling) ── */}
        {isActive && (
          <>
            {currentProposal ? (
              <View style={[s.card, { backgroundColor: colors.card, borderColor: `${ac}40` }]}>
                <View style={[s.cardStrip, { backgroundColor: iAmProposer ? '#FF8C55' : ac }]} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5, color: colors.textSecondary }}>
                    {iAmProposer ? `YOU PROPOSED · Round ${currentProposal.round}` : `${otherPet?.name?.toUpperCase() ?? ''} PROPOSED · Round ${currentProposal.round}`}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{fmtDate(currentProposal.proposed_date)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
                    <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{fmtTime(currentProposal.proposed_time)}</Text>
                  </View>
                  {currentProposal.proposed_location && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
                      <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{currentProposal.proposed_location}</Text>
                    </View>
                  )}

                  {iAmProposer ? (
                    <View style={[s.waitingRow, { backgroundColor: '#FF8C5512' }]}>
                      <Ionicons name="time-outline" size={13} color="#FF8C55" />
                      <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#FF8C55', flex: 1 }}>
                        Waiting for {otherPet?.name}…
                      </Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: colors.inputBg, borderColor: '#E24B4A', borderWidth: 1, flex: 1 }]}
                        onPress={declineRequest} disabled={working}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#E24B4A' }}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: `${ac}18`, borderColor: ac, borderWidth: 1, flex: 1 }]}
                        onPress={() => openSheet('counter')} disabled={working}>
                        <Ionicons name="calendar-outline" size={13} color={ac} />
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>New time</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: '#22C55E', flex: 1 }]}
                        onPress={acceptProposal} disabled={working}>
                        {working
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Accept ✓</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.cardStrip, { backgroundColor: '#FF8C55' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>
                    {iAmFrom
                      ? `Waiting for ${otherPet?.name}'s owner to respond…`
                      : `${otherPet?.name}'s owner sent a request — no time proposed yet.`}
                  </Text>
                  {!iAmFrom && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: colors.inputBg, borderColor: '#E24B4A', borderWidth: 1, flex: 1 }]}
                        onPress={declineRequest} disabled={working}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#E24B4A' }}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: `${ac}18`, borderColor: ac, borderWidth: 1, flex: 2 }]}
                        onPress={() => openSheet('counter')} disabled={working}>
                        <Ionicons name="calendar-outline" size={13} color={ac} />
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>Propose a time</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
          </>
        )}

        {/* ── TERMINAL STATE ── */}
        {isTerminal && (() => {
          const canceller = request.responder_user_id
            ? (request.responder_user_id === userId ? myPet : otherPet)
            : null;
          const cancellerName = canceller?.name ?? null;
          const cancellerEmoji = canceller?.emoji ?? '';

          let headline = '';
          if (request.status === 'declined')  headline = 'This request was declined. You can send a new one from Nearby.';
          else if (request.status === 'withdrawn') headline = 'This request was withdrawn.';
          else if (request.status === 'expired')   headline = 'This request expired before anyone responded.';
          else if (request.status === 'completed') headline = 'This playdate has been completed. Hope it was a great time! 🐾';
          else if (cancellerName) headline = `${cancellerEmoji} ${cancellerName} cancelled this playdate.`;
          else headline = 'This playdate was cancelled.';

          return (
            <View style={[s.card, { backgroundColor: '#94A3B812', borderColor: '#94A3B830' }]}>
              <View style={[s.cardStrip, { backgroundColor: '#94A3B8' }]} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: TYPO.body, color: '#94A3B8', fontWeight: '600' }}>{headline}</Text>
                {request.cancel_reason ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6,
                    backgroundColor: '#94A3B810', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
                    <Text style={{ fontSize: TYPO.body }}>💬</Text>
                    <Text style={{ fontSize: TYPO.body, color: '#94A3B8', fontStyle: 'italic', flex: 1 }}>
                      "{request.cancel_reason}"
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })()}

        {/* ── Proposal history ── */}
        {proposals.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5, color: colors.textSecondary, marginTop: 4 }}>
              PROPOSAL HISTORY
            </Text>
            {[...proposals].reverse().map(p => {
              const isMe = p.proposed_by_owner_id === userId;
              const pet  = isMe ? myPet : otherPet;
              const propAc = pet?.accent_color ?? ac;
              const acceptedButTerminal = p.status === 'accepted' && !!isTerminal;
              const statusColor = acceptedButTerminal ? '#94A3B8'
                : p.status === 'accepted' ? '#22C55E'
                : p.status === 'declined' ? '#E24B4A'
                : p.status === 'superseded' ? '#94A3B8'
                : '#FF8C55';
              return (
                <View key={p.id} style={[s.histRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[s.roundBadge, { backgroundColor: `${propAc}18` }]}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: propAc }}>R{p.round}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: propAc }}>
                        {isMe ? (myPet?.emoji ?? '🐾') : (otherPet?.emoji ?? '🐾')}{' '}
                        {isMe ? 'You' : (otherPet?.name ?? 'Them')}
                      </Text>
                      <View style={[s.histStatusPill, { backgroundColor: `${statusColor}18` }]}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: statusColor }}>
                          {p.status === 'pending' ? 'Pending'
                            : p.status === 'accepted' ? (acceptedButTerminal ? `Accepted · ${request.status}` : 'Accepted')
                            : p.status === 'declined' && request.status === 'withdrawn' ? 'Sent'
                            : p.status === 'declined' ? 'Declined'
                            : 'Superseded'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginLeft: 'auto' }}>{relTime(p.created_at)}</Text>
                    </View>
                    <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>
                      {fmtDate(p.proposed_date)} · {fmtTime(p.proposed_time)}
                    </Text>
                    {p.proposed_location && (
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>📍 {p.proposed_location}</Text>
                    )}
                    {p.message && (
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic' }}>💬 "{p.message}"</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Date/time/place sheet ── */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={sheetAction === 'counter' ? '📅 Propose New Time' : '📅 Reschedule'}
        accent={ac}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingTop: 4, paddingBottom: 8 }}>

          {/* WHEN card */}
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: `${ac}30`, overflow: 'hidden', backgroundColor: `${ac}0A` }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 8 }}>
              <Ionicons name="calendar" size={13} color={ac} />
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac }}>WHEN</Text>
            </View>
            <TouchableOpacity onPress={() => { setPickerMode('date'); setShowPicker(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                marginHorizontal: 10, marginBottom: 8, backgroundColor: colors.inputBg,
                borderRadius: 12, borderWidth: 1.5,
                borderColor: pickerMode === 'date' && showPicker ? ac : colors.border,
                paddingHorizontal: 14, paddingVertical: 12 }}>
              <Ionicons name="calendar-outline" size={16} color={ac} />
              <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{format(sheetDate, 'EEEE, MMMM d, yyyy')}</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginBottom: 12 }}>
              <TouchableOpacity onPress={() => { setPickerMode('time'); setShowPicker(true); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: pickerMode === 'time' && showPicker ? ac : colors.border,
                  paddingHorizontal: 12, paddingVertical: 12 }}>
                <Ionicons name="time-outline" size={15} color={ac} />
                <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{formatTime(sheetDate)}</Text>
              </TouchableOpacity>
              <Ionicons name="arrow-forward" size={13} color={colors.textTertiary} />
              <TouchableOpacity onPress={() => { setPickerMode('endtime'); setShowPicker(true); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                  borderColor: pickerMode === 'endtime' && showPicker ? ac : colors.border,
                  paddingHorizontal: 12, paddingVertical: 12 }}>
                <Ionicons name="time-outline" size={15} color={colors.textTertiary} />
                <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{formatTime(sheetEndDate)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Place */}
          <LocationAutocompleteInput
            value={sheetLocation} onChangeText={setSheetLocation}
            placeholder="Place (optional)"
            colors={colors} />

          {/* Note */}
          <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
            <TextInput style={{ fontSize: TYPO.body, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
              placeholder="Add a note (optional)" placeholderTextColor={colors.placeholder}
              value={sheetMessage} onChangeText={t => setSheetMessage(t.slice(0, 500))} multiline blurOnSubmit maxLength={500} />
            <Text style={{ fontSize: 11, color: sheetMessage.length >= 480 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: 2 }}>
              {sheetMessage.length}/500
            </Text>
          </View>

          {/* Summary strip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: `${ac}12`, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: `${ac}25` }}>
            <Text style={{ fontSize: 20 }}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                {format(sheetDate, 'EEE, MMM d')} · {formatTime(sheetDate)} – {formatTime(sheetEndDate)}
              </Text>
              {sheetLocation.trim() ? (
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>📍 {sheetLocation.trim()}</Text>
              ) : null}
            </View>
          </View>

          {/* Send button */}
          <TouchableOpacity onPress={submitSheet} disabled={working}
            style={{ backgroundColor: ac, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            {working
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Send Proposal</Text>}
          </TouchableOpacity>

          <AppDateTimePicker
            visible={showPicker}
            value={pickerMode === 'endtime' ? sheetEndDate : sheetDate}
            mode={pickerMode === 'endtime' ? 'time' : pickerMode}
            minimumDate={pickerMode === 'date' ? new Date() : undefined}
            accent={ac}
            onCancel={() => setShowPicker(false)}
            onConfirm={(date) => {
              setShowPicker(false);
              if (pickerMode === 'date') {
                setSheetDate(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
                setSheetEndDate(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
              } else if (pickerMode === 'time') {
                setSheetDate(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; });
                setSheetEndDate(prev => { const minEnd = new Date(date); minEnd.setHours(date.getHours() + 1, date.getMinutes(), 0, 0); return prev < minEnd ? minEnd : prev; });
              } else {
                setSheetEndDate(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; });
              }
            }}
          />
        </ScrollView>
      </BottomSheet>

      {/* ── Decline / Withdraw / Cancel FAB ── */}
      {(() => {
        const showCancel   = isAccepted;
        const showWithdraw = isActive && iAmFrom && !iAmProposer;
        const showDecline  = isActive && !iAmFrom;
        if (!showCancel && !showWithdraw && !showDecline) return null;
        const label  = showCancel ? 'Cancel Playdate' : showDecline ? 'Decline' : 'Withdraw';
        const icon   = showCancel ? 'close-circle-outline' : showDecline ? 'thumbs-down-outline' : 'arrow-undo-outline';
        const action = showCancel ? cancelPlaydate : showDecline ? declineRequest : withdrawRequest;
        return (
          <TouchableOpacity
            onPress={action}
            disabled={working}
            style={{
              position: 'absolute', bottom: insets.bottom + 20, right: 20,
              backgroundColor: '#E24B4A', borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14,
              flexDirection: 'row', alignItems: 'center', gap: 8,
              shadowColor: '#E24B4A', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 8,
            }}>
            {working
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name={icon as any} size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>{label}</Text>
                </>
            }
          </TouchableOpacity>
        );
      })()}

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  statusBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  statusLabel:    { fontSize: TYPO.body, fontWeight: '700' },
  card:           { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden', paddingVertical: 14, paddingRight: 14 },
  cardStrip:      { width: 4, marginRight: 12 },
  waitingRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 8 },
  actionBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10 },
  outlineBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, borderWidth: 1.5 },
  phonePill:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  histRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  roundBadge:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  histStatusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  fieldLabel:     { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  fieldRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
});
