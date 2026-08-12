import React, { useState } from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Keyboard, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { parseDbTime } from '@/lib/dates';
import { formatDist, formatTime } from '@/lib/units';
import { toTitle } from '@/lib/format';
import { isLocationAvailable } from '@/lib/location';
import PawBondLoader from '@/components/PawBondLoader';
import BottomSheet from '@/components/BottomSheet';
import { NearbyPetCard } from '@/features/social/components/NearbyPetCard';
import { EventCard } from '@/features/social/components/EventCard';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { nb, fd } from '@/features/social/socialStyles';
import { GenderFilter, NearbyPet, IncomingRequest } from '@/features/social/types';

interface NearbyTabProps {
  ac: string;
  colors: any;
  isDark: boolean;
  pet: any;
  profile: any;
  userId: string | null;
  locationGranted: boolean | null;
  locationLabel: string | null;
  distanceFilter: number;
  setDistanceFilter: (km: number) => void;
  distanceOpts: readonly { km: number; label: string }[];
  genderFilter: GenderFilter;
  setGenderFilter: (g: GenderFilter) => void;
  breedSearch: string;
  setBreedSearch: (s: string) => void;
  filteredNearby: NearbyPet[];
  loadingNearby: boolean;
  events: any[];
  loadingEvents: boolean;
  eventsEnabled: boolean;
  toggleRsvp: (e: any) => void;
  playdateChats: any[];
  setPlaydateChats: React.Dispatch<React.SetStateAction<any[]>>;
  incomingRequests: any[];
  outgoingActiveReqs: any[];
  setOutgoingActiveReqs: React.Dispatch<React.SetStateAction<any[]>>;
  playdateMeta: Map<string, any>;
  playdateStatuses: Map<string, string>;
  setPlaydateStatuses: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  loadingRequests: boolean;
  loadingChats: boolean;
  requestedPets: Map<string, string>;
  respondingId: string | null;
  playdatesChatEnabled: boolean;
  chatReadAt: Map<string, number>;
  markChatRead: (chatId: string) => void;
  resolvedFeedPet: any;
  activePetId: string | null;
  setFeedPet: (p: any) => void;
  sortedPets: any[];
  showOutgoingSheet: any;
  setShowOutgoingSheet: (v: any) => void;
  proposalHistory: any[];
  setProposalHistory: (h: any[]) => void;
  setShowProfileModal: (v: boolean) => void;
  setSelectedRequest: (r: any) => void;
  setShowCreateEvent: (v: boolean) => void;
  requestPlaydate: (p: NearbyPet) => void;
  withdrawPlaydate: (p: NearbyPet) => void;
  resendPlaydate: (p: NearbyPet) => void;
  respondToRequest: (id: string, action: 'decline', petName?: string, silent?: boolean) => void;
  respondAndChat: (id: string) => void;
  loadIncomingRequests: () => void;
  loadPlaydateChats: () => void;
}

export const NearbyTab = React.memo(function NearbyTab({
  ac, colors, isDark, pet, profile, userId,
  locationGranted, locationLabel,
  distanceFilter, setDistanceFilter, distanceOpts,
  genderFilter, setGenderFilter,
  breedSearch, setBreedSearch,
  filteredNearby, loadingNearby,
  events, loadingEvents, eventsEnabled, toggleRsvp,
  playdateChats, setPlaydateChats,
  incomingRequests, outgoingActiveReqs, setOutgoingActiveReqs,
  playdateMeta, playdateStatuses, setPlaydateStatuses,
  loadingRequests, loadingChats, requestedPets, respondingId,
  playdatesChatEnabled, chatReadAt, markChatRead,
  resolvedFeedPet, activePetId, setFeedPet, sortedPets,
  showOutgoingSheet, setShowOutgoingSheet,
  proposalHistory, setProposalHistory,
  setShowProfileModal, setSelectedRequest, setShowCreateEvent,
  requestPlaydate, withdrawPlaydate, resendPlaydate,
  respondToRequest, respondAndChat,
  loadIncomingRequests, loadPlaydateChats,
}: NearbyTabProps) {
  const [selectedNearbyPet, setSelectedNearbyPet] = useState<NearbyPet | null>(null);
  const [reqDetailsExpanded, setReqDetailsExpanded] = useState(false);
  const [ageChip, setAgeChip]       = useState<'puppy' | 'young' | 'adult' | 'senior' | null>(null);
  const [showAgeDropdown, setShowAgeDropdown] = useState(false);
  const [filtersVisible, setFiltersVisible]   = useState(false);

  const petAgeCategory = (birthday?: string | null): 'puppy' | 'young' | 'adult' | 'senior' | null => {
    if (!birthday) return null;
    const months = (Date.now() - new Date(birthday).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (months < 12)  return 'puppy';
    if (months < 36)  return 'young';
    if (months < 84)  return 'adult';
    return 'senior';
  };

  const AGE_CHIP_LABELS: Record<string, string> = {
    puppy: 'Puppy 0-1yr', young: 'Young 1-3yr', adult: 'Adult 3-7yr', senior: 'Senior 7+yr',
  };

  const moduleAvailable = isLocationAvailable();

  const STATUS_ORDER: Record<string, number> = {
    incoming: 0, scheduling: 0, negotiating: 0, agreed: 1, accepted: 2, pending: 3,
  };
  const now = Date.now();

  const chatEntries = playdateChats
    .map(c => {
      const isFrom   = c.from_owner_id === userId;
      const theirPet = isFrom ? c.to_pet : c.from_pet;
      const meta     = playdateMeta.get(theirPet?.id);
      if (c.status !== 'agreed' && theirPet?.id) {
        const linkedReq = isFrom
          ? outgoingActiveReqs.find(r => r.to_pet?.id === theirPet.id && r.status === 'scheduling')
          : incomingRequests.find(r => r.from_pet?.id === theirPet.id && r.status === 'scheduling');
        if (linkedReq) {
          return {
            c, theirPet, meta, status: 'scheduling', reqId: linkedReq.id as string | null,
            proposedDate: linkedReq.proposed_date ?? null as string | null,
            proposedTime: linkedReq.proposed_time ?? null as string | null,
            proposedEndTime: linkedReq.proposed_end_time ?? null as string | null,
            proposedLocation: linkedReq.proposed_location ?? null as string | null,
            proposedMessage: linkedReq.message ?? null as string | null,
            agreedDate: null as string | null, agreedTime: null as string | null, agreedLocation: null as string | null,
            isMyTurn: linkedReq.responder_user_id !== userId,
            isSender: isFrom,
          };
        }
      }
      return {
        c, theirPet, meta, status: c.status === 'agreed' ? 'agreed' : 'negotiating',
        reqId: null as string | null, proposedDate: null as string | null,
        proposedTime: null as string | null, proposedEndTime: null as string | null,
        proposedLocation: null as string | null, proposedMessage: null as string | null,
        agreedDate: c.agreed_date ?? null as string | null,
        agreedTime: c.agreed_time ?? null as string | null,
        agreedLocation: c.agreed_location ?? null as string | null,
        isMyTurn: false, isSender: isFrom,
      };
    })
    .filter(e => e.theirPet?.id);

  const chatPetIds = new Set(chatEntries.map(e => e.theirPet?.id).filter(Boolean));

  const requestEntries = outgoingActiveReqs
    .filter(r => !chatPetIds.has(r.to_pet?.id))
    .map(r => ({
      c: null, theirPet: r.to_pet, meta: null, status: r.status, reqId: r.id as string | null,
      proposedDate:     r.proposed_date     ?? null as string | null,
      proposedTime:     r.proposed_time     ?? null as string | null,
      proposedEndTime:  r.proposed_end_time ?? null as string | null,
      proposedLocation: r.proposed_location ?? null as string | null,
      proposedMessage:  r.message           ?? null as string | null,
      agreedDate:       r.agreed_date       ?? null as string | null,
      agreedTime:       r.agreed_time       ?? null as string | null,
      agreedLocation:   r.agreed_location   ?? null as string | null,
      isMyTurn: r.status === 'scheduling' && r.responder_user_id !== userId,
      isSender: true,
    }));

  const coveredIds = new Set([...chatPetIds, ...requestEntries.map(e => e.theirPet?.id).filter(Boolean)]);

  const incomingSchedulingEntries = incomingRequests
    .filter(r => r.status === 'scheduling' && !coveredIds.has(r.from_pet?.id))
    .map(r => ({
      c: null, theirPet: r.from_pet, meta: null, status: 'scheduling', reqId: r.id as string | null,
      proposedDate:     r.proposed_date     ?? null as string | null,
      proposedTime:     r.proposed_time     ?? null as string | null,
      proposedEndTime:  r.proposed_end_time ?? null as string | null,
      proposedLocation: r.proposed_location ?? null as string | null,
      proposedMessage:  r.message           ?? null as string | null,
      agreedDate: null as string | null, agreedTime: null as string | null, agreedLocation: null as string | null,
      isMyTurn: r.responder_user_id !== userId,
      isSender: false,
    }));

  const coveredWithScheduling = new Set([
    ...coveredIds,
    ...incomingSchedulingEntries.map(e => e.theirPet?.id).filter(Boolean),
  ]);

  const incomingPendingEntries = incomingRequests
    .filter(r => r.status === 'pending' && !coveredWithScheduling.has(r.from_pet?.id))
    .map(r => ({
      c: null, theirPet: r.from_pet, meta: null,
      status: 'incoming' as string, reqId: r.id as string | null,
      proposedDate:     r.proposed_date     ?? null as string | null,
      proposedTime:     r.proposed_time     ?? null as string | null,
      proposedEndTime:  r.proposed_end_time ?? null as string | null,
      proposedLocation: r.proposed_location ?? null as string | null,
      proposedMessage:  r.message           ?? null as string | null,
      agreedDate: null as string | null, agreedTime: null as string | null, agreedLocation: null as string | null,
      isMyTurn: true, isSender: false,
    }));

  const allMyEntries = [
    ...chatEntries, ...requestEntries, ...incomingSchedulingEntries, ...incomingPendingEntries,
  ].sort((a, b) => {
    const _toUTC = (ts: string) => new Date(ts.endsWith('Z') || ts.includes('+') ? ts : ts + 'Z').getTime();
    const unreadA = a.meta?.lastSenderId && a.meta.lastSenderId !== userId
      && a.meta.lastMessageAt && _toUTC(a.meta.lastMessageAt) > (a.meta.myLastReadAt ?? 0) ? 0 : 1;
    const unreadB = b.meta?.lastSenderId && b.meta.lastSenderId !== userId
      && b.meta.lastMessageAt && _toUTC(b.meta.lastMessageAt) > (b.meta.myLastReadAt ?? 0) ? 0 : 1;
    if (unreadA !== unreadB) return unreadA - unreadB;
    const dateA = a.meta?.agreedDate ? new Date(`${a.meta.agreedDate}T${a.meta.agreedTime ?? '00:00'}`).getTime() : null;
    const dateB = b.meta?.agreedDate ? new Date(`${b.meta.agreedDate}T${b.meta.agreedTime ?? '00:00'}`).getTime() : null;
    const futA = dateA && dateA > now ? dateA : null;
    const futB = dateB && dateB > now ? dateB : null;
    if (futA && futB) return futA - futB;
    if (futA) return -1;
    if (futB) return 1;
    if (a.status === 'scheduling' && b.status === 'scheduling') {
      if (a.isMyTurn !== b.isMyTurn) return a.isMyTurn ? -1 : 1;
    }
    const oa = STATUS_ORDER[a.status] ?? 9;
    const ob = STATUS_ORDER[b.status] ?? 9;
    return oa - ob;
  });

  const allMyPetIds = new Set(allMyEntries.map(e => e.theirPet?.id).filter(Boolean));

  const petCarousel = sortedPets.length > 1 && (
    <ScrollView
      horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' }}
    >
      {sortedPets.map((p) => {
        const isActive = (resolvedFeedPet?.id ?? activePetId) === p.id;
        const accent: string = (p as any).accent_color ?? ac;
        const avatarUrl: string | null = (p as any).avatar_url ?? null;
        return (
          <TouchableOpacity
            key={p.id} onPress={() => setFeedPet(p)} activeOpacity={0.8}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingLeft: 4, paddingRight: 12, paddingVertical: 4,
              borderRadius: 28,
              backgroundColor: isActive ? accent + '22' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
              borderWidth: isActive ? 1.5 : 1,
              borderColor: isActive ? accent : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
            }}
          >
            <LinearGradient
              colors={[`${accent}88`, `${accent}33`]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{
                width: 36, height: 36, borderRadius: 18,
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                borderWidth: isActive ? 2 : 1.5,
                borderColor: isActive ? accent : accent + '60',
              }}
            >
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} cachePolicy="memory-disk" style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                : <Text style={{ fontSize: TYPO.heading }}>{(p as any).emoji ?? '🐾'}</Text>
              }
            </LinearGradient>
            <Text style={{
              fontSize: TYPO.body, fontWeight: isActive ? '700' : '500',
              color: isActive ? accent : colors.textSecondary,
              maxWidth: 80,
            }} numberOfLines={1}>
              {p.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const myPlaydatesSection = (
    <>
      <View style={nb.sectionHeader}>
        <View>
          <Text style={[nb.sectionTitle, { color: colors.textPrimary }]}>My Playdates</Text>
          {allMyEntries.length > 0 && (
            <Text style={[nb.sectionSub, { color: colors.textSecondary }]}>
              {allMyEntries.length} active connection{allMyEntries.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={() => router.push('/my-playdates' as any)}
          style={[nb.showAllBtn, { backgroundColor: `${ac}15` }]}>
          <Text style={[nb.showAllText, { color: ac }]}>History</Text>
          <Ionicons name="arrow-forward" size={12} color={ac} />
        </TouchableOpacity>
      </View>
      {allMyEntries.length === 0 ? (
        <TouchableOpacity onPress={() => router.push('/my-playdates' as any)}
          style={{ marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8,
            borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderColor: colors.border,
            borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 }}>
          <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, flex: 1 }}>No active playdates — tap to view history</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
          {allMyEntries.map(({ c, theirPet, meta, status, reqId, proposedDate, proposedTime, proposedEndTime, proposedLocation, proposedMessage, agreedDate, agreedTime, agreedLocation, isMyTurn, isSender }) => {
            const isLocked = status === 'agreed' || status === 'negotiating';
            const _toUTC = (ts: string) => new Date(ts.endsWith('Z') || ts.includes('+') ? ts : ts + 'Z').getTime();
            const lastMsgTs  = meta?.lastMessageAt ? _toUTC(meta.lastMessageAt) : 0;
            const lastReadTs = meta?.myLastReadAt ?? (meta?.chatId ? (chatReadAt.get(meta.chatId) ?? 0) : 0);
            const iMine = meta?.lastSenderId === userId;
            const hasUnread = !iMine && !!(meta?.lastSenderId && lastMsgTs > lastReadTs);
            const p = theirPet;
            return (
              <NearbyPetCard key={c?.id ?? reqId ?? p.id} pet={p}
                playdateStatus={status} isLocked={isLocked}
                agreedDate={meta?.agreedDate ?? agreedDate} agreedTime={meta?.agreedTime ?? agreedTime} agreedLocation={meta?.agreedLocation ?? agreedLocation}
                proposedDate={proposedDate} proposedTime={proposedTime} proposedEndTime={proposedEndTime} proposedLocation={proposedLocation} proposedMessage={proposedMessage} isMyTurn={isMyTurn}
                chatId={meta?.chatId}
                hasUnread={hasUnread} lastMessageAt={meta?.lastMessageAt}
                chatEnabled={playdatesChatEnabled}
                onOpenChat={(cid) => markChatRead(cid)}
                onRequest={() => requestPlaydate(p)}
                onWithdraw={() => withdrawPlaydate(p)}
                onResend={() => resendPlaydate(p)}
                onViewProfile={() => setSelectedNearbyPet(p)}
                isSender={isSender}
                onAccept={() => { const req = incomingRequests.find(r => r.from_pet_id === p.id); if (req) respondAndChat(req.id); }}
                onDecline={() => { if (reqId) respondToRequest(reqId, 'decline', undefined, true); }}
                onCancelPlaydate={async (reason) => {
                  const chatIdVal = c?.id ?? meta?.chatId ?? null;
                  try {
                    if (chatIdVal) {
                      const { data, error } = await supabase.functions.invoke('playdates', {
                        body: { action: 'chat_cancel', chat_id: chatIdVal, ...(reason ? { reason } : {}) },
                      });
                      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
                    } else if (reqId) {
                      const { data, error } = await supabase.functions.invoke('playdates', {
                        body: { action: 'cancel', request_id: reqId, ...(reason ? { reason } : {}) },
                      });
                      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
                    }
                    setPlaydateStatuses(m => { const n = new Map(m); n.delete(p.id); return n; });
                    setOutgoingActiveReqs(prev => prev.filter(r => r.to_pet?.id !== p.id));
                    if (chatIdVal) setPlaydateChats(prev => prev.filter(ch => ch.id !== chatIdVal));
                    loadIncomingRequests();
                    loadPlaydateChats();
                  } catch (e: any) { showAlert('Error', e.message); }
                }}
                onSchedulingTap={() => {
                  if (status === 'agreed') {
                    const rid = reqId ?? null;
                    setShowOutgoingSheet({
                      status: 'agreed',
                      to_pet: p,
                      agreed_date:     meta?.agreedDate     ?? agreedDate,
                      agreed_time:     meta?.agreedTime     ?? agreedTime,
                      agreed_location: meta?.agreedLocation ?? agreedLocation,
                      chat_id:         c?.id ?? meta?.chatId ?? null,
                      req_id:          rid,
                    });
                    setProposalHistory([]);
                    if (rid) {
                      Promise.resolve(supabase.from('playdate_proposals')
                        .select('id, round, status, proposed_date, proposed_time, proposed_end_time, proposed_location, message, proposed_by_pet_id, proposed_by_owner_id, proposed_by_pet:pets!playdate_proposals_proposed_by_pet_id_fkey(name, emoji, accent_color)')
                        .eq('request_id', rid)
                        .order('round', { ascending: true }))
                        .then(({ data }) => setProposalHistory(data ?? [])).catch(() => {});
                    }
                    return;
                  }
                  const incoming = reqId
                    ? incomingRequests.find(r => r.id === reqId)
                    : incomingRequests.find(r => r.from_pet?.id === p.id || r.from_pet_id === p.id);
                  if (incoming) {
                    setSelectedRequest(incoming);
                    setShowProfileModal(true);
                  } else {
                    const outgoing = reqId
                      ? outgoingActiveReqs.find(r => r.id === reqId)
                      : outgoingActiveReqs.find(r => r.to_pet?.id === p.id);
                    setShowOutgoingSheet(outgoing ? { ...outgoing, isMyTurn, req_id: outgoing.id } : null);
                  }
                }}
                colors={colors} />
            );
          })}
        </ScrollView>
      )}
    </>
  );

  const locationDeniedBlock = (
    <View style={nb.centerBlock}>
      <View style={[nb.bigIcon, { backgroundColor: `${ac}14` }]}>
        <Ionicons name={moduleAvailable ? 'location-outline' : 'construct-outline'} size={34} color={ac} />
      </View>
      <Text style={[nb.bigTitle, { color: colors.textPrimary }]}>
        {moduleAvailable ? 'Location needed' : 'Dev build required'}
      </Text>
      <Text style={[nb.bigSub, { color: colors.textSecondary }]}>
        {moduleAvailable
          ? 'Family Cube uses your location to show nearby pets.'
          : "GPS isn't available in Expo Go. Run npx expo run:ios for full support."}
      </Text>
    </View>
  );

  const filtersAndPets = (
    <>
      {/* Location banner */}
      {locationLabel && (
        <View style={[nb.locBanner, { backgroundColor: `${ac}10`, borderColor: `${ac}22` }]}>
          <Ionicons name="navigate-circle-outline" size={13} color={ac} />
          <Text style={[nb.locText, { color: colors.textSecondary }]}>
            <Text style={{ color: ac, fontWeight: '700' }}>Near </Text>{locationLabel}
          </Text>
        </View>
      )}

      {/* Nearby Playmates — right below location */}
      {loadingNearby || locationGranted === null ? (
        <View style={[nb.centerBlock, { paddingVertical: 28 }]}>
          <PawBondLoader size={52} />
          <Text style={[nb.bigSub, { color: colors.textSecondary, marginTop: 10 }]}>
            {locationGranted === null ? 'Getting your location…' : 'Finding nearby pets…'}
          </Text>
        </View>
      ) : (() => {
        const mySpecies = ((resolvedFeedPet?.species ?? pet?.species) as string | undefined) ?? null;
        const allDiscovery = filteredNearby.filter(p => {
          if (allMyPetIds.has(p.id)) return false;
          if (ageChip && petAgeCategory(p.birthday) !== ageChip) return false;
          return true;
        });
        const carouselPets = mySpecies
          ? allDiscovery.filter(p => p.species === mySpecies)
          : allDiscovery;

        return (
          <>
            <View style={nb.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[nb.sectionTitle, { color: colors.textPrimary }]}>Nearby Playmates</Text>
                <Text style={[nb.sectionSub, { color: colors.textSecondary }]}>
                  {carouselPets.length > 0 ? `${carouselPets.length} within ${formatDist(distanceFilter)}` : 'No matches nearby'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/nearby' as any)}
                style={[nb.showAllBtn, { backgroundColor: `${ac}15` }]}>
                <Text style={[nb.showAllText, { color: ac }]}>All pets</Text>
                <Ionicons name="arrow-forward" size={12} color={ac} />
              </TouchableOpacity>
            </View>

            {/* Compact filter bar */}
            {(() => {
              const distLabel = distanceOpts.find(d => d.km === distanceFilter)?.label ?? '';
              const genderLabel = genderFilter === 'any' ? '' : genderFilter === 'male' ? '♂ Male' : genderFilter === 'female' ? '♀ Female' : '? Unknown';
              const ageLabel = ageChip ? AGE_CHIP_LABELS[ageChip] : '';
              const activeCount = (genderFilter !== 'any' ? 1 : 0) + (ageChip ? 1 : 0);
              const parts = [distLabel, genderLabel, ageLabel].filter(Boolean).join(' · ');
              return (
                <TouchableOpacity onPress={() => setFiltersVisible(true)} activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8,
                    backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1,
                    borderColor: activeCount > 0 ? ac : colors.border,
                    paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                  <Ionicons name="options-outline" size={16} color={activeCount > 0 ? ac : colors.textSecondary} />
                  <Text style={{ flex: 1, fontSize: TYPO.body, color: activeCount > 0 ? colors.textPrimary : colors.textSecondary,
                    fontWeight: activeCount > 0 ? '600' : '400' }} numberOfLines={1}>{parts}</Text>
                  {activeCount > 0 && (
                    <View style={{ backgroundColor: ac, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{activeCount}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              );
            })()}

            {/* Breed search */}
            <View style={[nb.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={15} color={colors.textTertiary} />
              <TextInput style={[nb.searchInput, { color: colors.textPrimary }]}
                placeholder="Search by breed…" placeholderTextColor={colors.placeholder}
                value={breedSearch} onChangeText={setBreedSearch} autoCorrect={false}
                returnKeyType="search" onSubmitEditing={() => Keyboard.dismiss()} blurOnSubmit />
              {breedSearch.length > 0 && (
                <TouchableOpacity onPress={() => setBreedSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={15} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            {carouselPets.length === 0 ? (
              <View style={[nb.emptyNearby, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={{ fontSize: TYPO.body }}>🐾</Text>
                <Text style={[nb.emptyNearbyTitle, { color: colors.textPrimary }]}>
                  {mySpecies ? `No nearby ${mySpecies}s yet` : 'No nearby pets yet'}
                </Text>
                <Text style={[nb.emptyNearbySub, { color: colors.textSecondary }]}>
                  Try widening your distance filter to find more playmates.
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
                {carouselPets.map(p => (
                  <NearbyPetCard key={p.id} pet={p}
                    playdateStatus={playdateStatuses.get(p.id)}
                    onRequest={() => requestPlaydate(p)}
                    onWithdraw={() => withdrawPlaydate(p)}
                    onResend={() => resendPlaydate(p)}
                    onViewProfile={() => setSelectedNearbyPet(p)}
                    onAccept={() => { const req = incomingRequests.find(r => r.from_pet_id === p.id); if (req) respondAndChat(req.id); }}
                    colors={colors} />
                ))}
              </ScrollView>
            )}
          </>
        );
      })()}
    </>
  );

  const fmtTime = (t: string) => {
    try { const [hh, mm] = t.split(':').map(Number); const tmp = new Date(); tmp.setHours(hh, mm, 0, 0); return formatTime(tmp); }
    catch { return t.slice(0, 5); }
  };
  const fmtDate = (d: string) => { try { return format(parseISO(d), 'EEE, MMM d, yyyy'); } catch { return d; } };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={loadingRequests || loadingChats} onRefresh={() => { loadIncomingRequests(); loadPlaydateChats(); }} />
      }
    >
      {petCarousel}
      {myPlaydatesSection}
      {locationGranted === false ? locationDeniedBlock : filtersAndPets}

      {eventsEnabled && (
        <>
          <View style={[nb.sectionHeader, { marginTop: 20 }]}>
            <View>
              <Text style={[nb.sectionTitle, { color: colors.textPrimary }]}>Community Events</Text>
              <Text style={[nb.sectionSub, { color: colors.textSecondary }]}>Upcoming events near you</Text>
            </View>
            <TouchableOpacity
              style={[nb.createEventBtn, { backgroundColor: `${ac}18`, borderWidth: 1.5, borderColor: ac }]}
              onPress={() => router.push('/my-events' as any)}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: ac }}>See all →</Text>
            </TouchableOpacity>
          </View>
          {loadingEvents
            ? <View style={{ alignItems: 'center', marginTop: 16 }}><PawBondLoader size={44} /></View>
            : events.length === 0
            ? (
              <View style={[nb.centerBlock, { paddingVertical: 24 }]}>
                <View style={[nb.bigIcon, { backgroundColor: `${ac}14` }]}>
                  <Ionicons name="calendar-outline" size={30} color={ac} />
                </View>
                <Text style={[nb.bigTitle, { color: colors.textPrimary }]}>No events yet</Text>
                <Text style={[nb.bigSub, { color: colors.textSecondary }]}>Be first to organise a meetup or group walk.</Text>
                <TouchableOpacity style={[nb.primaryBtn, { backgroundColor: ac }]} onPress={() => setShowCreateEvent(true)}>
                  <Text style={nb.primaryBtnText}>Create first event</Text>
                </TouchableOpacity>
              </View>
            )
            : events.map(e => (
                <EventCard
                  key={e.id} event={e}
                  onPress={() => router.push(`/event/${e.id}`)}
                  onToggleRsvp={() => toggleRsvp(e)}
                  onChat={() => router.push(`/event/${e.id}`)}
                  colors={colors}
                />
              ))
          }
          <View style={{ height: 20 }} />
        </>
      )}

      {/* Nearby pet full profile modal */}
      <BottomSheet visible={!!selectedNearbyPet} onClose={() => setSelectedNearbyPet(null)}>
        <TouchableOpacity onPress={() => setSelectedNearbyPet(null)} style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>

        {selectedNearbyPet && (() => {
          const p = selectedNearbyPet;
          const pAc = p.accent_color ?? colors.primary;
          const ageLabel = p.age
            ? (p.age.years > 0 ? `${p.age.years}y ${p.age.months}m` : `${p.age.months} months`)
            : null;
          return (
            <View style={{ alignItems: 'center', paddingHorizontal: 24 }}>
              <LinearGradient colors={[`${pAc}28`, `${pAc}08`]} style={{ width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                {p.avatar_url
                  ? <Image source={{ uri: p.avatar_url }} cachePolicy="memory-disk" style={{ width: 82, height: 82, borderRadius: 41 }} />
                  : <Text style={{ fontSize: TYPO.title }}>{p.emoji}</Text>
                }
              </LinearGradient>

              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 }}>
                {p.emoji} {p.name}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
                {p.breed && (
                  <View style={{ backgroundColor: '#FF8C5520', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#FF8C55' }}>{toTitle(p.breed)}</Text>
                  </View>
                )}
                {ageLabel && (
                  <View style={{ backgroundColor: '#14B8A620', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#14B8A6' }}>{ageLabel}</Text>
                  </View>
                )}
                <View style={{ backgroundColor: `${pAc}18`, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="location-outline" size={11} color={pAc} />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: pAc }}>{formatDist(p.distanceKm)} away</Text>
                </View>
              </View>

              {p.owner?.handle && (
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 20 }}>
                  Parent: {p.owner.handle ? `@${p.owner.handle}` : 'Pet parent'}
                </Text>
              )}

              {!requestedPets.has(p.id) ? (
                <TouchableOpacity
                  style={{ backgroundColor: pAc, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  onPress={() => { requestPlaydate(p); setSelectedNearbyPet(null); }}
                >
                  <Ionicons name="paw-outline" size={16} color="#fff" />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Send Playdate Request</Text>
                </TouchableOpacity>
              ) : (() => {
                const req = outgoingActiveReqs.find(r => r.to_pet?.id === p.id || r.to_pet_id === p.id);
                const STATUS_LABELS: Record<string, { label: string; icon: string; color: string }> = {
                  pending:    { label: 'Awaiting response', icon: 'time-outline',             color: colors.accent },
                  scheduling: { label: 'Scheduling',        icon: 'calendar-outline',         color: colors.primaryText ?? colors.primary },
                  accepted:   { label: 'Confirmed ✅',      icon: 'checkmark-circle-outline', color: colors.success },
                };
                const statusCfg = STATUS_LABELS[req?.status ?? 'pending'] ?? STATUS_LABELS.pending;
                const hasDetails = req && (req.proposed_date || req.proposed_time || req.proposed_location || req.message || req.agreed_date);
                return (
                  <View style={{ width: '100%', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: `${statusCfg.color}12`, borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: `${statusCfg.color}30` }}>
                      <Ionicons name={statusCfg.icon as any} size={16} color={statusCfg.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: statusCfg.color }}>{statusCfg.label}</Text>
                        {req?.created_at && (
                          <Text style={{ fontSize: TYPO.body, color: statusCfg.color, opacity: 0.7, marginTop: 1 }}>
                            Sent {(() => { try { const d = parseDbTime(req.created_at); const diff = Date.now()-d.getTime(); const m=Math.floor(diff/60000); if(m<60) return `${m}m ago`; const h=Math.floor(m/60); if(h<24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; } catch { return ''; } })()}
                          </Text>
                        )}
                      </View>
                      <View style={{ backgroundColor: `${statusCfg.color}20`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: statusCfg.color }}>↗ Sent</Text>
                      </View>
                    </View>

                    {hasDetails && (() => {
                      const dateLabel = req.agreed_date ? fmtDate(req.agreed_date) : req.proposed_date ? fmtDate(req.proposed_date) : null;
                      const isAgreed  = !!req.agreed_date;
                      const detailColor = isAgreed ? colors.success : colors.accent;
                      const startTime = req.agreed_time ?? req.proposed_time;
                      const endTime   = req.proposed_end_time;
                      const location  = req.agreed_location ?? req.proposed_location;
                      return (
                        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: `${detailColor}30`, overflow: 'hidden' }}>
                          <TouchableOpacity
                            onPress={() => setReqDetailsExpanded(v => !v)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                              backgroundColor: `${detailColor}10`, paddingHorizontal: 14, paddingVertical: 10 }}>
                            <Ionicons name="calendar-outline" size={14} color={detailColor} />
                            <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: detailColor }}>
                              {isAgreed ? 'Confirmed date' : 'Proposed date'}{dateLabel ? ` · ${dateLabel}` : ''}
                            </Text>
                            <Ionicons name={reqDetailsExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={detailColor} />
                          </TouchableOpacity>
                          {reqDetailsExpanded && (
                            <View style={{ paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8, gap: 8, backgroundColor: `${detailColor}05` }}>
                              {startTime && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Ionicons name="time-outline" size={13} color={detailColor} />
                                  <Text style={{ fontSize: TYPO.body, color: detailColor, fontWeight: '600' }}>
                                    {fmtTime(startTime)}{endTime ? ` → ${fmtTime(endTime)}` : ''}
                                  </Text>
                                </View>
                              )}
                              {location && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Ionicons name="location-outline" size={13} color={detailColor} />
                                  <Text style={{ fontSize: TYPO.body, color: detailColor, fontWeight: '600' }}>{location}</Text>
                                </View>
                              )}
                              {req.message && (
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                  <Ionicons name="chatbubble-ellipses-outline" size={13} color={detailColor} style={{ marginTop: 1 }} />
                                  <Text style={{ fontSize: TYPO.body, color: detailColor, fontStyle: 'italic', flex: 1 }}>{req.message}</Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })()}

                    {(req?.status === 'pending' || req?.status === 'scheduling') && (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                          style={{ flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: pAc,
                            backgroundColor: `${pAc}12`, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                          onPress={() => resendPlaydate(p)}
                        >
                          <Ionicons name="refresh-outline" size={15} color={pAc} />
                          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: pAc }}>Resend</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.danger,
                            backgroundColor: colors.dangerLight, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                          onPress={() => { withdrawPlaydate(p); setSelectedNearbyPet(null); }}
                        >
                          <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.danger }}>Withdraw</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>
          );
        })()}
      </BottomSheet>

      {/* Nearby filter sheet — top-level to avoid remount on state change */}
      <BottomSheet visible={filtersVisible} onClose={() => setFiltersVisible(false)} title="Nearby Filters" accent={ac}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 20, paddingTop: 4, paddingBottom: 8 }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>DISTANCE</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {distanceOpts.map(opt => {
                const active = distanceFilter === opt.km;
                return (
                  <TouchableOpacity key={opt.km} onPress={() => setDistanceFilter(opt.km)} activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: active ? ac : colors.inputBg, borderRadius: 20, borderWidth: 1,
                      borderColor: active ? ac : colors.border, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Ionicons name="locate-outline" size={13} color={active ? '#fff' : colors.textSecondary} />
                    <Text style={{ fontSize: TYPO.body, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>GENDER</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {([
                { key: 'any' as GenderFilter,     label: 'Any',     emoji: '⚥' },
                { key: 'male' as GenderFilter,    label: 'Male',    emoji: '♂' },
                { key: 'female' as GenderFilter,  label: 'Female',  emoji: '♀' },
                { key: 'unknown' as GenderFilter, label: 'Unknown', emoji: '?' },
              ]).map(({ key, label, emoji }) => {
                const active = genderFilter === key;
                return (
                  <TouchableOpacity key={key} onPress={() => setGenderFilter(key)} activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: active ? ac : colors.inputBg, borderRadius: 20, borderWidth: 1,
                      borderColor: active ? ac : colors.border, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ fontSize: TYPO.body }}>{emoji}</Text>
                    <Text style={{ fontSize: TYPO.body, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>AGE</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {([null, 'puppy', 'young', 'adult', 'senior'] as const).map(age => {
                const active = ageChip === age;
                const label = age ? AGE_CHIP_LABELS[age] : 'Any age';
                return (
                  <TouchableOpacity key={age ?? 'any'} onPress={() => setAgeChip(age ?? null)} activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: active ? `${ac}18` : colors.inputBg, borderRadius: 20, borderWidth: 1,
                      borderColor: active ? ac : colors.border, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: active ? '700' : '500', color: active ? ac : colors.textSecondary }}>{label}</Text>
                    {active && <Ionicons name="checkmark" size={13} color={ac} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => { setDistanceFilter(distanceOpts[1].km); setGenderFilter('any'); setAgeChip(null); }}
              style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFiltersVisible(false)}
              style={{ flex: 2, borderRadius: 12, backgroundColor: ac, paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </BottomSheet>
    </ScrollView>
  );
});
