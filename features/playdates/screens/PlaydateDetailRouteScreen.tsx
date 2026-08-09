import { showAlert } from '@/components/AppAlert';
/**
 * PawBond — Playdate Request Detail (v2)
 * Thin orchestrator: data-fetching + state live here; JSX lives in sub-components.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { FeatureUnavailable } from '@/components/FeatureGate';

import type { PlaydateRequest, Proposal, OwnerContact } from '@/features/playdates/components/playdateDetailTypes';
import PlaydateDetailHeader from '@/features/playdates/components/PlaydateDetailHeader';
import PlaydateStatusBanner from '@/features/playdates/components/PlaydateStatusBanner';
import PlaydateAcceptedSection from '@/features/playdates/components/PlaydateAcceptedSection';
import PlaydateActiveSection from '@/features/playdates/components/PlaydateActiveSection';
import PlaydateTerminalSection from '@/features/playdates/components/PlaydateTerminalSection';
import ProposalHistory from '@/features/playdates/components/ProposalHistory';
import ProposalSheet from '@/features/playdates/components/ProposalSheet';
import PlaydateFAB from '@/features/playdates/components/PlaydateFAB';
import { TYPO } from '@/constants/theme';

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
      "The other pet's parent will be notified.",
      [
        ...CANCEL_REASONS.map(r => ({ text: r, onPress: () => resolve(r) })),
        { text: 'No reason', onPress: () => resolve(null) },
        { text: 'Keep it', style: 'cancel' as const, onPress: () => resolve(undefined) },
      ],
    ),
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PlaydateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore(s => s.user?.id);
  const playdatesEnabled = useFeatureFlag('connect_playdates_enabled', true);

  const [loading,   setLoading]   = useState(true);
  const [request,   setRequest]   = useState<PlaydateRequest | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contact,   setContact]   = useState<OwnerContact | null>(null);
  const [working,   setWorking]   = useState(false);

  // Sheet state
  const [sheetVisible,  setSheetVisible]  = useState(false);
  const [sheetAction,   setSheetAction]   = useState<'counter' | 'reschedule'>('counter');
  const [sheetDate,     setSheetDate]     = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; });
  const [sheetEndDate,  setSheetEndDate]  = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return d; });
  const [sheetLocation, setSheetLocation] = useState('');
  const [sheetMessage,  setSheetMessage]  = useState('');
  const [pickerMode,    setPickerMode]    = useState<'date' | 'time' | 'endtime'>('date');
  const [showPicker,    setShowPicker]    = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [{ data: rData }, { data: pData }] = await Promise.all([
        supabase.from('playdate_requests')
          .select(`id, from_pet_id, to_pet_id, from_owner_id, to_owner_id, status,
            responder_user_id, cancel_reason,
            proposed_date, proposed_time, proposed_end_time, proposed_location, message,
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
          .select('full_name, phone').eq('id', otherOwnerId).single();
        if (cData) setContact(cData as OwnerContact);
      }
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Could not load playdate details.');
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`playdate-detail:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playdate_requests',  filter: `id=eq.${id}` }, () => guardedLoad())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playdate_proposals', filter: `request_id=eq.${id}` }, () => guardedLoad())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, guardedLoad]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const iAmFrom          = request?.from_owner_id === userId;
  const myPet            = request ? (iAmFrom ? request.from_pet : request.to_pet)   : null;
  const otherPet         = request ? (iAmFrom ? request.to_pet   : request.from_pet) : null;
  const ac               = otherPet?.accent_color ?? colors.primary;
  const currentProposal  = proposals.find(p => p.status === 'pending') ?? null;
  const iAmProposer      = currentProposal?.proposed_by_owner_id === userId;
  const isActive         = !!request && ['pending', 'scheduling'].includes(request.status);
  const isAccepted       = request?.status === 'accepted';
  const isTerminal       = !!request && ['declined', 'withdrawn', 'expired', 'cancelled', 'completed'].includes(request.status);

  // ── Actions ───────────────────────────────────────────────────────────────

  const callEdge = async (body: object) => {
    setWorking(true);
    const { data, error } = await supabase.functions.invoke('playdates', { body });
    setWorking(false);
    if (error || data?.error) {
      showAlert('Error', data?.error ?? error?.message ?? 'Something went wrong');
      return false;
    }
    await guardedLoad();
    return true;
  };

  const acceptProposal = () => callEdge({ action: 'respond', request_id: id, respond_action: 'accept' });

  const declineRequest = () => {
    showAlert('Decline?', "This will close the request and notify the other pet's parent.", [
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
    // Pre-populate from the current pending proposal so the user edits, not re-enters
    if (currentProposal) {
      const [year, month, day] = currentProposal.proposed_date.split('-').map(Number);
      const [sh, sm] = currentProposal.proposed_time.split(':').map(Number);
      const d = new Date(year, month - 1, day, sh, sm, 0, 0);
      setSheetDate(d);
      if (currentProposal.proposed_end_time) {
        const [eh, em] = currentProposal.proposed_end_time.split(':').map(Number);
        const e = new Date(year, month - 1, day, eh, em, 0, 0);
        setSheetEndDate(e);
      } else {
        const e = new Date(d); e.setHours(d.getHours() + 1);
        setSheetEndDate(e);
      }
      setSheetLocation(currentProposal.proposed_location ?? '');
      setSheetMessage(currentProposal.message ?? '');
    } else {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
      const e = new Date(d); e.setHours(11, 0, 0, 0);
      setSheetDate(d);
      setSheetEndDate(e);
      setSheetLocation('');
      setSheetMessage('');
    }
    setSheetAction(action);
    setSheetVisible(true);
  };

  const submitSheet = async () => {
    if (sheetEndDate <= sheetDate) {
      showAlert('Invalid time', 'End time must be after start time.');
      return;
    }
    const proposed_date     = format(sheetDate, 'yyyy-MM-dd');
    const proposed_time     = format(sheetDate, 'HH:mm');
    const proposed_end_time = format(sheetEndDate, 'HH:mm');
    const proposed_location = sheetLocation.trim() || null;
    const message           = sheetMessage.trim() || undefined;
    const body = sheetAction === 'counter'
      ? { action: 'respond', request_id: id, respond_action: 'counter_propose', proposed_date, proposed_time, proposed_end_time, proposed_location, message }
      : { action: 'reschedule', request_id: id, proposed_date, proposed_time, proposed_end_time, proposed_location, message };
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

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>

      <PlaydateDetailHeader myPet={myPet} otherPet={otherPet} />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never">

        <PlaydateStatusBanner request={request} primaryColor={colors.primary} iAmFrom={!!iAmFrom} otherPet={otherPet} myPet={myPet} />

        {isAccepted && (
          <PlaydateAcceptedSection
            request={request}
            otherPet={otherPet}
            contact={contact}
            iAmFrom={!!iAmFrom}
            ac={ac}
            working={working}
            requestId={id}
            onReschedule={() => openSheet('reschedule')}
            onComplete={() => callEdge({ action: 'complete', request_id: id })}
          />
        )}

        {isActive && (
          <PlaydateActiveSection
            currentProposal={currentProposal}
            iAmProposer={!!iAmProposer}
            iAmFrom={!!iAmFrom}
            otherPet={otherPet}
            ac={ac}
            working={working}
            onAccept={acceptProposal}
            onDecline={declineRequest}
            onCounter={() => openSheet('counter')}
            requestProposedDate={request.proposed_date}
            requestProposedTime={request.proposed_time}
            requestProposedEndTime={request.proposed_end_time}
            requestProposedLocation={request.proposed_location}
            requestMessage={request.message}
          />
        )}

        {isTerminal && (
          <PlaydateTerminalSection
            request={request}
            userId={userId}
            myPet={myPet}
            otherPet={otherPet}
          />
        )}

        <ProposalHistory
          proposals={proposals}
          userId={userId}
          myPet={myPet}
          otherPet={otherPet}
          ac={ac}
          isTerminal={isTerminal}
          requestStatus={request.status}
        />

      </ScrollView>

      <ProposalSheet
        visible={sheetVisible}
        action={sheetAction}
        sheetDate={sheetDate}
        sheetEndDate={sheetEndDate}
        sheetLocation={sheetLocation}
        sheetMessage={sheetMessage}
        pickerMode={pickerMode}
        showPicker={showPicker}
        ac={ac}
        working={working}
        onClose={() => setSheetVisible(false)}
        onSend={submitSheet}
        onSetPickerMode={setPickerMode}
        onSetShowPicker={setShowPicker}
        onSetSheetDate={setSheetDate}
        onSetSheetEndDate={setSheetEndDate}
        onSetLocation={setSheetLocation}
        onSetMessage={setSheetMessage}
      />

      <PlaydateFAB
        isAccepted={!!isAccepted}
        isActive={isActive}
        iAmFrom={!!iAmFrom}
        iAmProposer={!!iAmProposer}
        working={working}
        bottomInset={insets.bottom}
        onCancel={cancelPlaydate}
        onDecline={declineRequest}
        onWithdraw={withdrawRequest}
      />

    </SafeAreaView>
  );
}
