import { useState, useCallback, useRef, useEffect } from 'react';
import { showAlert } from '@/components/AppAlert';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { getPlaydateChats, markChatRead as dbMarkChatRead } from '@/lib/db';
import { todayLocal } from '@/lib/dates';
import { pickCancelReason } from '@/features/social/utils';
import type { IncomingRequest } from '@/features/social/types';

export function useSocialPlaydates(
  userId: string | null,
  activePetId: string | null,
  playdatesChatEnabled: boolean,
) {
  const [requestedPets, setRequestedPets] = useState<Map<string, string>>(new Map());
  const [playdateStatuses, setPlaydateStatuses] = useState<Map<string, string>>(new Map());
  const [playdateMeta, setPlaydateMeta] = useState<Map<string, {
    chatId: string; agreedDate?: string | null; agreedTime?: string | null;
    agreedLocation?: string | null; lastMessageAt?: string | null; lastSenderId?: string | null;
    myLastReadAt?: number | null;
  }>>(new Map());
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [outgoingActiveReqs, setOutgoingActiveReqs] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [playdateChats, setPlaydateChats] = useState<any[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatReadAt, setChatReadAt] = useState<Map<string, number>>(new Map());
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [showOutgoingSheet, setShowOutgoingSheet] = useState<any | null>(null);
  const [proposalHistory, setProposalHistory] = useState<any[]>([]);

  useEffect(() => {
    setIncomingRequests([]);
    setOutgoingActiveReqs([]);
    setPlaydateChats([]);
    setPlaydateMeta(new Map());
    _chatsInFlight.current = false;  // allow fresh fetch for new pet
  }, [activePetId]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<IncomingRequest | null>(null);

  const _chatsInFlight = useRef(false);
  const resendingRef = useRef<string | null>(null);

  const markChatRead = useCallback(async (cid: string) => {
    const ts = Date.now();
    setChatReadAt(prev => { const n = new Map(prev); n.set(cid, ts); return n; });
    if (!userId) return;
    try {
      const chatRow = playdateChats.find((c: any) => c.id === cid);
      const iAmFrom = chatRow?.from_owner_id === userId;
      await dbMarkChatRead(cid, userId, iAmFrom);
    } catch {}
  }, [userId, playdateChats]);

  const loadIncomingRequests = useCallback(async () => {
    if (!userId || !activePetId) return;
    setLoadingRequests(true);
    try {
      const { data: pendingData } = await supabase
        .from('playdate_requests')
        .select(`
          id, from_pet_id, to_pet_id, status, created_at, responder_user_id,
          proposed_date, proposed_time, proposed_end_time, proposed_location, message,
          from_pet:pets!playdate_requests_from_pet_id_fkey(id, name, emoji, accent_color, breed, birthday, avatar_url, owner_id),
          to_pet:pets!playdate_requests_to_pet_id_fkey(name, emoji, owner_id, avatar_url),
          latest_proposal:playdate_proposals(proposed_date, proposed_time, proposed_end_time, proposed_location, message, proposed_by_owner_id, round)
        `)
        .in('status', ['pending', 'scheduling'])
        .eq('to_pet_id', activePetId)
        .order('created_at', { ascending: false });

      const allPending = (pendingData ?? []).map((r: any) => {
        const proposals = (Array.isArray(r.latest_proposal) ? r.latest_proposal : [r.latest_proposal])
          .filter(Boolean).sort((a: any, b: any) => (b.round ?? 0) - (a.round ?? 0));
        const lp = proposals[0];
        const overrides = r.status === 'scheduling' && lp ? {
          message: lp.message ?? r.message,
          proposed_date: lp.proposed_date ?? r.proposed_date,
          proposed_time: lp.proposed_time ?? r.proposed_time,
          proposed_end_time: lp.proposed_end_time ?? r.proposed_end_time,
          proposed_location: lp.proposed_location ?? r.proposed_location,
        } : {};
        return {
          ...r,
          ...overrides,
          from_pet: Array.isArray(r.from_pet) ? r.from_pet[0] : r.from_pet,
          to_pet: Array.isArray(r.to_pet) ? r.to_pet[0] : r.to_pet,
        };
      });
      setIncomingRequests(allPending.filter((r: any) => r.to_pet_id === activePetId));

      const { data: myOut } = await supabase
        .from('playdate_requests')
        .select('id, to_pet_id, status, proposed_date, proposed_time, proposed_end_time, proposed_location, message, agreed_date, agreed_time, agreed_location, responder_user_id, created_at, to_pet:pets!playdate_requests_to_pet_id_fkey(id, name, emoji, accent_color, avatar_url, breed), latest_proposal:playdate_proposals(proposed_date, proposed_time, proposed_end_time, proposed_location, message, proposed_by_owner_id, round)')
        .eq('from_pet_id', activePetId)
        .in('status', ['pending', 'scheduling', 'accepted'])
        .order('created_at', { ascending: false });

      const pendingMap = new Map<string, string>();
      (myOut ?? []).forEach((r: any) => {
        if (['pending', 'scheduling', 'accepted'].includes(r.status)) pendingMap.set(r.to_pet_id, r.id);
      });
      setRequestedPets(pendingMap);
      setOutgoingActiveReqs(
        (myOut ?? []).map((r: any) => {
          const proposals = (Array.isArray(r.latest_proposal) ? r.latest_proposal : [r.latest_proposal])
            .filter(Boolean).sort((a: any, b: any) => (b.round ?? 0) - (a.round ?? 0));
          const lp = proposals[0];
          const overrides = r.status === 'scheduling' && lp ? {
            message: lp.message ?? r.message,
            proposed_date: lp.proposed_date ?? r.proposed_date,
            proposed_time: lp.proposed_time ?? r.proposed_time,
            proposed_end_time: lp.proposed_end_time ?? r.proposed_end_time,
            proposed_location: lp.proposed_location ?? r.proposed_location,
          } : {};
          return { ...r, ...overrides, to_pet: Array.isArray(r.to_pet) ? r.to_pet[0] : r.to_pet };
        }).filter((r: any) => r.to_pet?.id),
      );

      const CHAT_STATUSES = new Set(['negotiating', 'agreed']);
      setPlaydateStatuses(prev => {
        const next = new Map(prev);
        (myOut ?? []).forEach((r: any) => {
          const existing = next.get(r.to_pet_id);
          if (!existing || !CHAT_STATUSES.has(existing)) next.set(r.to_pet_id, r.status);
        });
        allPending.forEach((r: any) => {
          const existing = next.get(r.from_pet_id);
          if (!existing || !CHAT_STATUSES.has(existing)) next.set(r.from_pet_id, 'incoming');
        });
        return next;
      });
    } finally {
      setLoadingRequests(false);
    }
  }, [userId, activePetId]);

  const loadPlaydateChats = useCallback(async () => {
    if (!userId || !activePetId) return;
    if (_chatsInFlight.current) return;
    _chatsInFlight.current = true;
    setLoadingChats(true);
    try {
      let rawData: any[];
      try { rawData = await getPlaydateChats(userId, activePetId); }
      catch { rawData = []; }

      const chats = (rawData ?? []).map((c: any) => ({
        ...c,
        from_pet: Array.isArray(c.from_pet) ? c.from_pet[0] : c.from_pet,
        to_pet:   Array.isArray(c.to_pet)   ? c.to_pet[0]   : c.to_pet,
      }));
      setPlaydateChats(chats);

      const today = todayLocal();
      setPlaydateStatuses(prev => {
        const next = new Map(prev);
        chats.forEach((c: any) => {
          const theirPetId = c.from_pet_id === activePetId ? c.to_pet_id : c.from_pet_id;
          const theirPet   = c.from_pet_id === activePetId ? c.to_pet   : c.from_pet;
          if (c.status === 'cancelled' || c.status === 'declined') return;
          const isPast = c.status === 'agreed' && c.agreed_date && c.agreed_date < today;
          const mapped = isPast ? 'past' : c.status === 'agreed' ? 'agreed' : 'negotiating';
          if (theirPetId) next.set(theirPetId, mapped);
          if (theirPet?.id) next.set(theirPet.id, mapped);
        });
        return next;
      });

      const chatIds = chats.map((c: any) => c.id);
      let lastMsgMap: Record<string, { created_at: string; sender_id: string }> = {};
      if (chatIds.length > 0) {
        const { data: lastMsgs } = await supabase
          .from('playdate_chat_messages').select('chat_id, sender_id, created_at')
          .in('chat_id', chatIds).order('created_at', { ascending: false });
        (lastMsgs ?? []).forEach((m: any) => {
          if (!lastMsgMap[m.chat_id]) lastMsgMap[m.chat_id] = { created_at: m.created_at, sender_id: m.sender_id };
        });
      }

      setPlaydateMeta(prev => {
        const next = new Map(prev);
        chats.forEach((c: any) => {
          const theirPetId = c.from_pet_id === activePetId ? c.to_pet_id : c.from_pet_id;
          const theirPet   = c.from_pet_id === activePetId ? c.to_pet   : c.from_pet;
          if (c.status === 'cancelled' || c.status === 'declined') {
            if (theirPetId) next.delete(theirPetId);
            if (theirPet?.id) next.delete(theirPet.id);
            return;
          }
          const last = lastMsgMap[c.id];
          const iAmFrom = c.from_owner_id === userId;
          const myReadIso = iAmFrom ? c.from_last_read_at : c.to_last_read_at;
          const myLastReadAt = myReadIso ? new Date(myReadIso).getTime() : null;
          const toUTC = (ts: string) => new Date(ts.endsWith('Z') || ts.includes('+') ? ts : ts + 'Z').getTime();
          const lastMsgTs = last?.created_at ? toUTC(last.created_at) : 0;
          const iMine = last?.sender_id === userId;
          const meta = {
            chatId: c.id,
            agreedDate: c.agreed_date, agreedTime: c.agreed_time, agreedLocation: c.agreed_location,
            lastMessageAt: last?.created_at ?? null,
            lastSenderId:  last?.sender_id  ?? null,
            myLastReadAt,
          };
          if (theirPetId) next.set(theirPetId, meta);
          if (theirPet?.id) next.set(theirPet.id, meta);
        });
        return next;
      });
    } finally {
      setLoadingChats(false);
      _chatsInFlight.current = false;
    }
  }, [userId, activePetId]);

  const respondAndChat = useCallback(async (requestId: string) => {
    setRespondingId(requestId);
    try {
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: { action: 'respond', request_id: requestId, respond_action: 'accept' },
      });
      // Supabase JS sets error on non-2xx but data may still carry the parsed body
      const errMsg = data?.error ?? error?.message;
      if (errMsg) {
        // 409 = already handled / stale request — refresh silently and bail
        if (errMsg.includes('not active') || errMsg.includes('already handled') || errMsg.includes('non-2xx')) {
          setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
          loadIncomingRequests();
          showAlert('Already handled', 'This request was already accepted or declined. Refreshing your list.');
          return;
        }
        showAlert('Error', errMsg);
        return;
      }
      setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
      setShowProfileModal(false);
      loadPlaydateChats();
      loadIncomingRequests();
      if (playdatesChatEnabled && data?.chat_id) {
        router.push(`/playdate-chat/${data.chat_id}`);
      } else {
        router.push('/(tabs)/connect?tab=Nearby' as any);
      }
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setRespondingId(null);
    }
  }, [loadPlaydateChats, loadIncomingRequests, playdatesChatEnabled]);

  const respondToRequest = useCallback(async (requestId: string, action: 'accept' | 'decline', petName?: string, skipConfirm = false) => {
    if (action === 'decline' && !skipConfirm) {
      const confirmed = await new Promise<boolean>(resolve =>
        showAlert(
          `Decline ${petName ? `${petName}'s` : 'this'} request?`,
          'The other pet\'s parent will be notified.',
          [
            { text: 'Keep', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Decline', style: 'destructive', onPress: () => resolve(true) },
          ],
        ),
      );
      if (!confirmed) return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: { action: 'respond', request_id: requestId, respond_action: action },
      });
      const errMsg = data?.error ?? error?.message;
      if (errMsg) {
        if (errMsg.includes('not active') || errMsg.includes('already handled') || errMsg.includes('non-2xx')) {
          setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
          loadIncomingRequests();
          showAlert('Already handled', 'This request was already accepted or declined. Refreshing your list.');
          return;
        }
        showAlert('Error', errMsg); return;
      }
      if (action === 'decline') {
        const declined = incomingRequests.find(r => r.id === requestId);
        const petId = declined?.from_pet?.id ?? declined?.from_pet_id;
        setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
        if (petId) setPlaydateStatuses(m => { const n = new Map(m); n.delete(petId); return n; });
        setShowProfileModal(false);
        loadIncomingRequests();
        loadPlaydateChats();
      } else if (action === 'accept') {
        setShowProfileModal(false);
        loadPlaydateChats();
        if (playdatesChatEnabled && data?.chat_id) {
          router.push(`/playdate-chat/${data.chat_id}`);
        } else {
          router.push('/(tabs)/connect?tab=Nearby' as any);
        }
      }
    } catch (err: any) {
      showAlert('Error', err.message);
    }
  }, [incomingRequests, loadPlaydateChats, loadIncomingRequests, playdatesChatEnabled]);

  const withdrawPlaydate = useCallback(async (target: any) => {
    if (!userId || !activePetId) return;
    const requestId = requestedPets.get(target.id);
    if (!requestId) { showAlert('Error', 'Request not found — try refreshing.'); return; }
    const reqStatus = outgoingActiveReqs.find(r => r.id === requestId)?.status ?? 'pending';
    const action = reqStatus === 'accepted' ? 'cancel' : 'withdraw';
    let reason: string | null = null;
    if (action === 'cancel') {
      const picked = await pickCancelReason();
      if (picked === undefined) return;
      reason = picked ?? null;
    } else {
      const confirmed = await new Promise<boolean>(resolve =>
        showAlert('Withdraw request?', `Cancel your playdate request with ${target.name}?`, [
          { text: 'Keep it', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Withdraw', style: 'destructive', onPress: () => resolve(true) },
        ]),
      );
      if (!confirmed) return;
    }
    const removedReq = outgoingActiveReqs.find(r => r.id === requestId);
    setRequestedPets(s => { const n = new Map(s); n.delete(target.id); return n; });
    setPlaydateStatuses(m => { const n = new Map(m); n.delete(target.id); return n; });
    setOutgoingActiveReqs(prev => prev.filter(r => r.id !== requestId));
    try {
      const { data, error } = await supabase.functions.invoke('playdates', {
        body: { action, request_id: requestId, ...(reason ? { reason } : {}) },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
      loadIncomingRequests();
      loadPlaydateChats();
    } catch (e: any) {
      setRequestedPets(s => new Map(s).set(target.id, requestId));
      setPlaydateStatuses(m => new Map(m).set(target.id, reqStatus));
      if (removedReq) setOutgoingActiveReqs(prev => [...prev, removedReq]);
      showAlert('Error', e.message);
    }
  }, [userId, activePetId, requestedPets, outgoingActiveReqs, loadIncomingRequests, loadPlaydateChats]);

  const resendPlaydate = useCallback(async (target: any) => {
    const requestId = requestedPets.get(target.id);
    if (!requestId) { showAlert('Error', 'Request not found — try refreshing.'); return; }
    if (resendingRef.current === requestId) return;
    const confirmed = await new Promise<boolean>(resolve =>
      showAlert('Send a nudge?', `${target.name}'s parent will get a reminder about your request.`, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Send nudge 🐾', onPress: () => resolve(true) },
      ]),
    );
    if (!confirmed) return;
    resendingRef.current = requestId;
    try {
      const { data, error } = await supabase.functions.invoke('playdates', { body: { action: 'resend', request_id: requestId } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
      showAlert('Nudge sent 🐾', `${target.name}'s parent has been reminded about your request.`);
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      resendingRef.current = null;
    }
  }, [requestedPets]);

  return {
    requestedPets, setRequestedPets,
    playdateStatuses, setPlaydateStatuses,
    playdateMeta,
    incomingRequests, setIncomingRequests,
    outgoingActiveReqs, setOutgoingActiveReqs,
    loadingRequests, loadingChats,
    playdateChats, setPlaydateChats,
    chatReadAt, respondingId,
    showOutgoingSheet, setShowOutgoingSheet,
    proposalHistory, setProposalHistory,
    showProfileModal, setShowProfileModal,
    selectedRequest, setSelectedRequest,
    markChatRead,
    loadIncomingRequests,
    loadPlaydateChats,
    respondAndChat,
    respondToRequest,
    withdrawPlaydate,
    resendPlaydate,
  };
}
