/**
 * helpStore — family help-request lifecycle store backed by Supabase.
 *
 * Pattern (matches familyStore):
 *   - loadFromStorage: AsyncStorage cache-first, then background syncFromDB
 *   - All mutations: optimistic local update → Supabase upsert/update in background
 *   - syncFromDB: pulls fresh rows from help_requests, updates local state + cache
 *
 * Status flow:
 *
 *   pending
 *     ├─ selfAssign()     → assigned
 *     ├─ offerToMembers() → awaiting_acceptance
 *     └─ rejectRequest()  → rejected  (parent only; kid's request invalid)
 *
 *   awaiting_acceptance
 *     ├─ acceptOffer()    → assigned
 *     └─ declineOffer()   → pending (back to pool) or awaiting_acceptance (others remain)
 *
 *   assigned
 *     └─ completeRequest() → completed
 *
 *   rejected / withdrawn / completed — terminal
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export type HelpCategory = 'Ride' | 'Homework' | 'Chore' | 'Childcare' | 'Errand' | 'Advice' | 'General';
export type HelpUrgency  = 'Low' | 'Medium' | 'High';
export type HelpStatus   = 'pending' | 'awaiting_acceptance' | 'assigned' | 'completed' | 'rejected' | 'withdrawn';
export type RideMode     = 'pickup' | 'dropoff' | 'roundtrip';

export interface HelpRequest {
  id:              string;
  requesterName:   string;
  requesterId:     string;
  requesterRole:   'kid' | 'adult';
  title:           string;
  description:     string;
  category:        HelpCategory;
  urgency:         HelpUrgency;
  status:          HelpStatus;

  assignedHelper?:   string;
  assignedHelperId?: string;

  offeredToIds?:   string[];
  offeredByName?:  string;
  offeredById?:    string;
  offerNote?:      string;

  lastDeclinedByName?:   string;
  lastDeclineComment?:   string;

  rejectedByName?:  string;
  rejectionReason?: string;

  rewardCoins?:     number;
  preferredHelper?: string;
  date?:            string;
  time?:            string;
  endTime?:         string;
  returnTime?:      string;
  rideMode?:        RideMode;
  fromLoc?:         string;
  toLoc?:           string;
  createdAt:        string;
  updatedAt:        string;
}

// ─── DB row ↔ HelpRequest ────────────────────────────────────────────────────

function fromRow(r: any): HelpRequest {
  return {
    id:                  r.id,
    requesterName:       r.requester_name,
    requesterId:         r.requester_id,
    requesterRole:       r.requester_role,
    title:               r.title,
    description:         r.description,
    category:            r.category,
    urgency:             r.urgency,
    status:              r.status,
    assignedHelper:      r.assigned_helper   ?? undefined,
    assignedHelperId:    r.assigned_helper_id ?? undefined,
    offeredToIds:        r.offered_to_ids    ?? undefined,
    offeredByName:       r.offered_by_name   ?? undefined,
    offeredById:         r.offered_by_id     ?? undefined,
    offerNote:           r.offer_note        ?? undefined,
    lastDeclinedByName:  r.last_declined_by_name  ?? undefined,
    lastDeclineComment:  r.last_decline_comment   ?? undefined,
    rejectedByName:      r.rejected_by_name  ?? undefined,
    rejectionReason:     r.rejection_reason  ?? undefined,
    rewardCoins:         r.reward_coins      ?? undefined,
    preferredHelper:     r.preferred_helper  ?? undefined,
    date:                r.date              ?? undefined,
    time:                r.time              ?? undefined,
    endTime:             r.end_time          ?? undefined,
    returnTime:          r.return_time       ?? undefined,
    rideMode:            r.ride_mode         ?? undefined,
    fromLoc:             r.from_loc          ?? undefined,
    toLoc:               r.to_loc            ?? undefined,
    createdAt:           r.created_at,
    updatedAt:           r.updated_at,
  };
}

function toRow(req: HelpRequest) {
  return {
    id:                    req.id,
    requester_name:        req.requesterName,
    requester_id:          req.requesterId,
    requester_role:        req.requesterRole,
    title:                 req.title,
    description:           req.description,
    category:              req.category,
    urgency:               req.urgency,
    status:                req.status,
    assigned_helper:       req.assignedHelper      ?? null,
    assigned_helper_id:    req.assignedHelperId    ?? null,
    offered_to_ids:        req.offeredToIds        ?? null,
    offered_by_name:       req.offeredByName       ?? null,
    offered_by_id:         req.offeredById         ?? null,
    offer_note:            req.offerNote           ?? null,
    last_declined_by_name: req.lastDeclinedByName  ?? null,
    last_decline_comment:  req.lastDeclineComment  ?? null,
    rejected_by_name:      req.rejectedByName      ?? null,
    rejection_reason:      req.rejectionReason     ?? null,
    reward_coins:          req.rewardCoins         ?? null,
    preferred_helper:      req.preferredHelper     ?? null,
    date:                  req.date                ?? null,
    time:                  req.time                ?? null,
    end_time:              req.endTime             ?? null,
    return_time:           req.returnTime          ?? null,
    ride_mode:             req.rideMode            ?? null,
    from_loc:              req.fromLoc             ?? null,
    to_loc:                req.toLoc               ?? null,
    updated_at:            req.updatedAt,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

const CACHE_KEY = '@familycube_help_v4';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function uid() { return `hr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function now() { return new Date().toISOString(); }

// Fire-and-forget push via family-notifier. Resolves familyId from requesterId.
async function notifyHelp(requesterId: string, type: string, payload: Record<string, unknown>) {
  try {
    const { data } = await supabase.from('members').select('family_id').eq('id', requesterId).single();
    const familyId = data?.family_id;
    if (!familyId) return;
    supabase.functions
      .invoke('family-notifier', { body: { type, familyId, payload, persist: true } })
      .catch(e => console.warn('[helpStore] notify failed:', e?.message));
  } catch (e: any) {
    console.warn('[helpStore] notify error:', e?.message);
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(res => setTimeout(res, RETRY_DELAY_MS * 2 ** attempt));
    }
  }
  throw new Error('unreachable');
}

interface HelpState {
  requests:    HelpRequest[];
  loaded:      boolean;
  _realtimeSub: (() => void) | null;

  loadFromStorage:     (memberIds?: string[]) => Promise<void>;
  syncFromDB:          (memberIds?: string[]) => Promise<void>;
  subscribeRealtime:   () => void;
  unsubscribeRealtime: () => void;

  addRequest:      (r: Omit<HelpRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  selfAssign:      (id: string, memberId: string, memberName: string) => void;
  offerToMembers:  (id: string, toIds: string[], toNames: string[], byName: string, note?: string, byId?: string) => void;
  acceptOffer:     (id: string, byId: string, byName: string) => void;
  declineOffer:    (id: string, byId: string, byName: string, comment: string) => void;
  rejectRequest:   (id: string, byName: string, reason: string) => void;
  completeRequest: (id: string) => void;
  withdrawRequest: (id: string, requesterId: string) => void;
}

function saveCache(requests: HelpRequest[]) {
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(requests)).catch(() => {});
}

async function upsertRow(req: HelpRequest) {
  try {
    await withRetry(async () => {
      const { error } = await supabase.from('help_requests').upsert(toRow(req));
      if (error) throw error;
    });
  } catch (e: any) {
    console.error('[helpStore] upsert failed after retries:', e?.message);
  }
}

async function patchRow(id: string, patch: Partial<ReturnType<typeof toRow>>) {
  try {
    await withRetry(async () => {
      const { error } = await supabase.from('help_requests')
        .update({ ...patch, updated_at: now() })
        .eq('id', id);
      if (error) throw error;
    });
  } catch (e: any) {
    console.error('[helpStore] patch failed after retries:', e?.message);
  }
}

export const useHelpStore = create<HelpState>((set, get) => ({
  requests:       [],
  loaded:         false,
  _realtimeSub:   null,

  // ── Load: cache-first → DB sync → subscribe realtime ─────────────────────
  loadFromStorage: async (memberIds) => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as HelpRequest[];
        if (cached.length > 0) {
          set({ requests: cached, loaded: true });
          get().syncFromDB(memberIds);   // refresh in background
          get().subscribeRealtime();
          return;
        }
      }
    } catch {}
    await get().syncFromDB(memberIds);
    set({ loaded: true });
    get().subscribeRealtime();
  },

  syncFromDB: async (memberIds?: string[]) => {
    try {
      // Unbounded before — every help request ever made, across a family's
      // whole lifetime. Capped same as the other history-shaped store
      // queries in this app.
      let query = supabase
        .from('help_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      // Scope to this family's members when IDs are provided — avoids blind full-table fetch
      if (memberIds && memberIds.length > 0) {
        query = query.in('requester_id', memberIds);
      }

      const { data, error } = await query;
      if (error) { console.warn('[helpStore] syncFromDB:', error.message); return; }
      if (!data) return;
      const requests = data.map(fromRow);
      set({ requests });
      saveCache(requests);
    } catch (e) {
      console.warn('[helpStore] syncFromDB exception:', e);
    }
  },

  // ── Realtime subscription — pushes remote changes to local state ──────────
  subscribeRealtime: () => {
    if (get()._realtimeSub) return; // already subscribed
    const channel = supabase
      .channel('help_requests_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'help_requests' },
        (payload) => {
          const current = get().requests;
          let next: HelpRequest[];
          if (payload.eventType === 'DELETE') {
            next = current.filter(r => r.id !== (payload.old as any).id);
          } else {
            const updated = fromRow(payload.new);
            const idx = current.findIndex(r => r.id === updated.id);
            next = idx >= 0
              ? current.map(r => r.id === updated.id ? updated : r)
              : [updated, ...current];
          }
          set({ requests: next });
          saveCache(next);
        }
      )
      .subscribe();

    const unsub = () => { supabase.removeChannel(channel); };
    set({ _realtimeSub: unsub });
  },

  unsubscribeRealtime: () => {
    get()._realtimeSub?.();
    set({ _realtimeSub: null });
  },

  // ── Add ───────────────────────────────────────────────────────────────────
  addRequest: async (r) => {
    const id = uid();
    const req: HelpRequest = {
      ...r, id, status: 'pending',
      rewardCoins: r.category === 'Homework' ? (r.rewardCoins ?? 20) : r.rewardCoins,
      createdAt: now(), updatedAt: now(),
    };
    const next = [req, ...get().requests];
    set({ requests: next });
    saveCache(next);
    await upsertRow(req);
    // Notify parents/seniors that a help request was submitted
    notifyHelp(req.requesterId, 'help_requested', {
      requestId: id, title: req.title, category: req.category,
      requesterName: req.requesterName, requesterId: req.requesterId,
      urgency: req.urgency,
    });
    return id;
  },

  // ── Self-assign ───────────────────────────────────────────────────────────
  selfAssign: (id, memberId, memberName) => {
    const next = get().requests.map(r =>
      r.id === id ? {
        ...r, status: 'assigned' as HelpStatus,
        assignedHelper: memberName, assignedHelperId: memberId,
        offeredToIds: undefined, offeredByName: undefined, offeredById: undefined, offerNote: undefined,
        updatedAt: now(),
      } : r
    );
    set({ requests: next });
    saveCache(next);
    patchRow(id, {
      status: 'assigned', assigned_helper: memberName, assigned_helper_id: memberId,
      offered_to_ids: null, offered_by_name: null, offered_by_id: null, offer_note: null,
    });
  },

  // ── Offer to members ──────────────────────────────────────────────────────
  offerToMembers: (id, toIds, _toNames, byName, note, byId) => {
    const next = get().requests.map(r =>
      r.id === id ? {
        ...r, status: 'awaiting_acceptance' as HelpStatus,
        offeredToIds: toIds, offeredByName: byName, offeredById: byId,
        offerNote: note || undefined, updatedAt: now(),
      } : r
    );
    set({ requests: next });
    saveCache(next);
    patchRow(id, {
      status: 'awaiting_acceptance',
      offered_to_ids: toIds, offered_by_name: byName, offered_by_id: byId ?? null,
      offer_note: note ?? null,
    });
  },

  // ── Accept offer ──────────────────────────────────────────────────────────
  acceptOffer: (id, byId, byName) => {
    const next = get().requests.map(r =>
      r.id === id ? {
        ...r, status: 'assigned' as HelpStatus,
        assignedHelper: byName, assignedHelperId: byId,
        offeredToIds: undefined, offeredByName: undefined, offeredById: undefined, offerNote: undefined,
        updatedAt: now(),
      } : r
    );
    set({ requests: next });
    saveCache(next);
    patchRow(id, {
      status: 'assigned', assigned_helper: byName, assigned_helper_id: byId,
      offered_to_ids: null, offered_by_name: null, offered_by_id: null, offer_note: null,
    });
  },

  // ── Decline offer ─────────────────────────────────────────────────────────
  declineOffer: (id, byId, byName, comment) => {
    const next = get().requests.map(r => {
      if (r.id !== id) return r;
      const remainIds = (r.offeredToIds ?? []).filter(i => i !== byId);
      const backToPending = remainIds.length === 0;
      return {
        ...r,
        status: (backToPending ? 'pending' : 'awaiting_acceptance') as HelpStatus,
        offeredToIds:  backToPending ? undefined : remainIds,
        offeredByName: backToPending ? undefined : r.offeredByName,
        offeredById:   backToPending ? undefined : r.offeredById,
        offerNote:     backToPending ? undefined : r.offerNote,
        lastDeclinedByName: byName,
        lastDeclineComment: comment,
        updatedAt: now(),
      };
    });
    set({ requests: next });
    saveCache(next);
    const updated = next.find(r => r.id === id);
    if (updated) {
      patchRow(id, {
        status: updated.status,
        offered_to_ids: updated.offeredToIds ?? null,
        offered_by_name: updated.offeredByName ?? null,
        offered_by_id: updated.offeredById ?? null,
        offer_note: updated.offerNote ?? null,
        last_declined_by_name: byName,
        last_decline_comment: comment,
      });
    }
  },

  // ── Reject ────────────────────────────────────────────────────────────────
  rejectRequest: (id, byName, reason) => {
    const next = get().requests.map(r =>
      r.id === id ? { ...r, status: 'rejected' as HelpStatus, rejectedByName: byName, rejectionReason: reason, updatedAt: now() } : r
    );
    set({ requests: next });
    saveCache(next);
    patchRow(id, { status: 'rejected', rejected_by_name: byName, rejection_reason: reason });
    const rejected = get().requests.find(r => r.id === id);
    if (rejected) notifyHelp(rejected.requesterId, 'help_resolved', {
      requestId: id, title: rejected.title, outcome: 'rejected',
      byName, reason, requesterId: rejected.requesterId,
    });
  },

  // ── Complete ──────────────────────────────────────────────────────────────
  completeRequest: (id) => {
    const next = get().requests.map(r =>
      r.id === id ? { ...r, status: 'completed' as HelpStatus, updatedAt: now() } : r
    );
    set({ requests: next });
    saveCache(next);
    patchRow(id, { status: 'completed' });
    const completed = get().requests.find(r => r.id === id);
    if (completed) notifyHelp(completed.requesterId, 'help_resolved', {
      requestId: id, title: completed.title, outcome: 'completed',
      byName: completed.assignedHelper ?? 'Someone', requesterId: completed.requesterId,
    });
  },

  // ── Withdraw ──────────────────────────────────────────────────────────────
  withdrawRequest: (id, requesterId) => {
    const next = get().requests.map(r =>
      r.id === id && r.requesterId === requesterId
        ? { ...r, status: 'withdrawn' as HelpStatus, updatedAt: now() }
        : r
    );
    set({ requests: next });
    saveCache(next);
    patchRow(id, { status: 'withdrawn' });
  },
}));
