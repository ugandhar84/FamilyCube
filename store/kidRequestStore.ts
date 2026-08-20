/**
 * kidRequestStore — real-time kid → parent requests.
 * Types: ride, tutor, cheer, emergency, question, permission, appointment
 * Status lifecycle: pending → approved | declined | cancelled | expired
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// ─── Realtime subscription (V-A4) ─────────────────────────────────────────────
// Mirrors choreStore.ts's ensureRealtime pattern: family-scoped channel name
// (never a fixed/shared literal — avoids the channel-name-collision
// "cannot add callbacks after subscribe()" crash a prior session fixed
// elsewhere), a dev-hot-reload stale-channel sweep, and INSERT/UPDATE/DELETE
// handlers that merge the incoming row into local `requests` state in place.
let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';

function rowToKidRequest(r: any): KidRequest {
  return {
    id:             r.id,
    type:           r.type,
    urgency:        r.urgency,
    detail:         r.detail,
    status:         r.status,
    fromMemberId:   r.from_member_id,
    toMemberId:     r.to_member_id    ?? undefined,
    items:          r.items           ?? undefined,
    requestedAt:    r.requested_at,
    expiresAt:      r.expires_at      ?? undefined,
    readAt:         r.read_at         ?? undefined,
    respondedAt:    r.responded_at    ?? undefined,
    respondedBy:    r.responded_by    ?? undefined,
    parentNote:     r.parent_note     ?? undefined,
    attachmentUrl:  r.attachment_url  ?? undefined,
    assignedHelper: r.assigned_helper ?? undefined,
    rewardCoins:    r.reward_coins    ?? undefined,
    scheduledDate:  r.scheduled_date  ?? undefined,
    scheduledTime:  r.scheduled_time  ?? undefined,
    openToGP:       r.open_to_gp      ?? false,
  };
}

function ensureRealtime(
  familyId: string,
  setState: (s: Partial<KidRequestState>) => void,
  getState: () => KidRequestState,
) {
  if (_rtFamilyId === familyId && _rtChannel) return; // already subscribed for this family
  if (_rtChannel) {
    supabase.removeChannel(_rtChannel);
    _rtChannel = null;
  }
  // Same hot-reload defensive sweep as choreStore.ts's ensureRealtime.
  const staleTopic = `realtime:kid_requests:${familyId}`;
  const stale = supabase.getChannels().filter(c => c.topic === staleTopic);
  if (stale.length > 0) {
    stale.forEach(c => supabase.removeChannel(c));
  }
  _rtFamilyId = familyId;

  try {
    _rtChannel = supabase
      .channel(`kid_requests:${familyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'kid_requests',
        filter: `family_id=eq.${familyId}`,
      }, ({ eventType, new: newRow, old: oldRow }) => {
        const state = getState();
        if (eventType === 'INSERT') {
          const req = rowToKidRequest(newRow);
          if (state.requests.some(r => r.id === req.id)) return;
          const all = [req, ...state.requests];
          setState({ requests: all });
          save(all);
        } else if (eventType === 'UPDATE') {
          const updatedReq = rowToKidRequest(newRow);
          // Same last-writer-wins-by-timestamp guard loadFromStorage already
          // applies — don't clobber a more-recent local response with a
          // realtime echo of an older write still settling.
          const existing = state.requests.find(r => r.id === updatedReq.id);
          if (existing?.respondedAt && updatedReq.respondedAt && existing.respondedAt > updatedReq.respondedAt) return;
          const all = state.requests.map(r => r.id === updatedReq.id ? updatedReq : r);
          setState({ requests: all });
          save(all);
        } else if (eventType === 'DELETE') {
          const all = state.requests.filter(r => r.id !== String((oldRow as any).id));
          setState({ requests: all });
          save(all);
        }
      })
      .subscribe((status) => {
        console.log(`[kidRequestStore] realtime kid_requests:${familyId} subscribe status=${status}`);
      });
  } catch (e: any) {
    console.warn('[kidRequestStore] ensureRealtime subscribe failed', e?.message ?? e);
  }
}

const generateId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// Lazy-read family_id from familyStore (same pattern as questStore — avoids circular dep)
const getFamilyId = (): string | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useFamilyStore } = require('@/store/familyStore');
    const state = useFamilyStore.getState();
    const active = state.members.find((m: any) => m.id === state.activeMemberId) ?? state.members[0];
    return (active as any)?.familyId ?? null;
  } catch { return null; }
};

// ─── Domain types ─────────────────────────────────────────────────────────────

export type RequestType   = 'ride' | 'tutor' | 'cheer' | 'emergency' | 'question' | 'permission' | 'appointment' | 'delegation' | 'checkin' | 'medication';
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired' | 'completed' | 'partial';
export type RequestUrgency = 'normal' | 'soon' | 'urgent' | 'emergency';
export type ItemStatus = 'pending' | 'approved' | 'rejected';

// Per-item tracking for grocery/supplies multi-item requests
export interface KidRequestItem {
  id:          string;
  name:        string;
  qty:         string;
  category:    string;
  emoji?:      string;
  status:      ItemStatus;
  requestedBy: string;   // kid memberId
  approvedBy?: string;   // parent memberId
  rejectedBy?: string;   // parent memberId
  parentNote?: string;
  approvedAt?: string;
  rejectedAt?: string;
}

export interface KidRequest {
  id:             string;
  type:           RequestType;
  urgency:        RequestUrgency;
  fromMemberId:   string;     // kid who sent
  toMemberId?:    string;     // specific parent; undefined = broadcast to all
  detail:         string;     // "Soccer practice at 3:30 PM"
  items?:         KidRequestItem[];  // multi-item grocery/supplies requests
  location?:      string;
  requestedAt:    string;     // ISO
  expiresAt?:     string;     // auto-expire if not responded to
  status:         RequestStatus;
  readAt?:        string;     // when any parent viewed it
  respondedAt?:   string;
  respondedBy?:   string;     // parent memberId
  parentNote?:    string;     // parent's reply message to the kid
  attachmentUrl?: string;     // optional photo or document
  assignedHelper?: string;   // memberId of who is helping
  rewardCoins?:   number;    // optional coin reward for helper
  openToGP?:      boolean;   // parent marked this as available for grandparent to handle
  scheduledDate?: string;    // "Today" / "Tomorrow" / "YYYY-MM-DD"
  scheduledTime?: string;    // "3:30 PM"
}

export const REQUEST_META: Record<RequestType, { emoji: string; label: string; color: string; bgColor: string }> = {
  ride:        { emoji: '🚗', label: 'Ride Request',      color: '#F59E0B', bgColor: '#FEF3C7' },
  tutor:       { emoji: '🎒', label: 'Tutor / Help',      color: '#6366F1', bgColor: '#EEF2FF' },
  cheer:       { emoji: '✋', label: 'Cheer / Support',    color: '#10B981', bgColor: '#D1FAE5' },
  emergency:   { emoji: '🚨', label: 'Emergency',          color: '#EF4444', bgColor: '#FEE2E2' },
  question:    { emoji: '❓', label: 'Question',           color: '#3B82F6', bgColor: '#DBEAFE' },
  permission:  { emoji: '🔓', label: 'Permission',         color: '#8B5CF6', bgColor: '#EDE9FE' },
  appointment: { emoji: '📅', label: 'Appointment',        color: '#EC4899', bgColor: '#FCE7F3' },
  delegation:  { emoji: '📋', label: 'Task Delegate',      color: '#0EA5E9', bgColor: '#E0F2FE' },
  checkin:     { emoji: '📞', label: 'Check-In Request',   color: '#14B8A6', bgColor: '#CCFBF1' },
  medication:  { emoji: '💊', label: 'Medication',         color: '#F97316', bgColor: '#FFF7ED' },
};

// ─── Store interface ──────────────────────────────────────────────────────────

interface KidRequestState {
  requests:  KidRequest[];
  loaded:    boolean;

  loadFromStorage: () => Promise<void>;

  sendRequest:     (req: Omit<KidRequest, 'id' | 'requestedAt' | 'status' | 'urgency'> & { urgency?: RequestUrgency }) => KidRequest;
  approveRequest:  (id: string, respondedBy: string, note?: string) => void;
  declineRequest:  (id: string, respondedBy: string, note?: string) => void;
  assignRequest:   (id: string, helperId: string, note?: string) => void;
  completeRequest: (id: string, respondedBy: string) => void;
  cancelRequest:   (id: string) => void;
  toggleGPWelcome: (id: string, value: boolean) => void;
  markRead:        (id: string) => void;
  deleteRequest:   (id: string) => void;
  clearResolved:   () => void;
  expireStale:     () => void;

  // Per-item approval for grocery/supplies requests
  approveItems:    (requestId: string, itemIds: string[], approvedBy: string, note?: string) => void;
  rejectItems:     (requestId: string, itemIds: string[], rejectedBy: string, note?: string) => void;
  approveAllItems: (requestId: string, approvedBy: string, note?: string) => void;
  rejectAllItems:  (requestId: string, rejectedBy: string, note?: string) => void;
  appendItems:     (requestId: string, newItems: KidRequestItem[]) => void;

  // Selectors
  getPending:           () => KidRequest[];
  getForMember:         (memberId: string) => KidRequest[];
  getUnread:            () => KidRequest[];
  getByType:            (type: RequestType) => KidRequest[];
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_REQUESTS: KidRequest[] = [
  {
    id: 'req-1', type: 'ride', urgency: 'soon',
    fromMemberId: 'kid-1', detail: 'Soccer practice at 3:30 PM',
    location: 'Riverside Park', requestedAt: new Date().toISOString(), status: 'pending',
  },
  {
    id: 'req-2', type: 'tutor', urgency: 'normal',
    fromMemberId: 'kid-2', detail: 'Need help with Math homework — fractions section',
    requestedAt: new Date(Date.now() - 600000).toISOString(), status: 'pending',
  },
  {
    id: 'req-3', type: 'permission', urgency: 'normal',
    fromMemberId: 'kid-1', detail: 'Can I join the after-school coding club on Thursdays?',
    requestedAt: new Date(Date.now() - 1800000).toISOString(), status: 'pending',
  },
];

// ─── Persistence ──────────────────────────────────────────────────────────────

const KEY  = '@familycube_kid_requests_v2';
const save = (reqs: KidRequest[]) => AsyncStorage.setItem(KEY, JSON.stringify(reqs));

// Upsert a single request row to Supabase (fire-and-forget)
async function upsertToDb(req: KidRequest) {
  try {
    const familyId = getFamilyId();
    if (!familyId) return;
    await supabase.from('kid_requests').upsert({
      id:             req.id,
      family_id:      familyId,
      from_member_id: req.fromMemberId,
      to_member_id:   req.toMemberId ?? null,
      type:           req.type,
      urgency:        req.urgency,
      detail:         req.detail,
      status:         req.status,
      items:          req.items ?? null,
      requested_at:   req.requestedAt,
      expires_at:     req.expiresAt ?? null,
      read_at:        req.readAt ?? null,
      responded_at:   req.respondedAt ?? null,
      responded_by:   req.respondedBy ?? null,
      parent_note:    req.parentNote ?? null,
      attachment_url: req.attachmentUrl ?? null,
      assigned_helper:req.assignedHelper ?? null,
      reward_coins:   req.rewardCoins ?? null,
      scheduled_date: req.scheduledDate ?? null,
      scheduled_time: req.scheduledTime ?? null,
      open_to_gp:     req.openToGP ?? false,
    }, { onConflict: 'id' });
  } catch (e: any) {
    console.warn('[kidRequestStore] upsertToDb failed:', e?.message);
  }
}

// Delete a request row from Supabase (fire-and-forget)
async function deleteFromDb(id: string) {
  supabase.from('kid_requests').delete().eq('id', id)
    .then(({ error }) => { if (error) console.warn('[kidRequestStore] deleteFromDb failed:', error.message); });
}

async function notifyKidRequest(fromMemberId: string, type: string, payload: Record<string, unknown>) {
  try {
    const familyId = getFamilyId();
    if (!familyId) return;
    supabase.functions
      .invoke('family-notifier', { body: { type, familyId, payload, persist: true } })
      .catch(e => console.warn('[kidRequestStore] notify failed:', e?.message));
  } catch (e: any) {
    console.warn('[kidRequestStore] notify error:', e?.message);
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useKidRequestStore = create<KidRequestState>((set, get) => ({
  requests: [],
  loaded:   false,

  loadFromStorage: async () => {
    // approveRequest/declineRequest/etc. write locally via set()+save() immediately,
    // then fire-and-forget upsertToDb() in the background. If a reload happens
    // before that upsert lands, trusting the DB unconditionally below would pull
    // back the still-"pending" row and make a just-dismissed card reappear.
    // Read the local cache first so we have a same-request timestamp to compare
    // against, and let whichever side responded more recently win per-request.
    let localById = new Map<string, KidRequest>();
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const local = raw ? (JSON.parse(raw) as KidRequest[]) : [];
      localById = new Map(local.map(r => [r.id, r]));
    } catch { /* no local cache yet — DB read below is the only source */ }

    try {
      // family_id comes from familyStore (invitation-based members, not auth users)
      const familyId = getFamilyId();
      if (familyId) {
        const { data: rows, error } = await supabase
          .from('kid_requests')
          .select('*')
          .eq('family_id', familyId)
          .order('requested_at', { ascending: false });
        if (!error) {
          // rows may be [] on a fresh family — that's valid, don't fall through to seed
          const requests: KidRequest[] = (rows ?? []).map((r: any) => {
            const fromDb: KidRequest = {
              id:             r.id,
              type:           r.type,
              urgency:        r.urgency,
              detail:         r.detail,
              status:         r.status,
              fromMemberId:   r.from_member_id,
              toMemberId:     r.to_member_id    ?? undefined,
              items:          r.items           ?? undefined,
              requestedAt:    r.requested_at,
              expiresAt:      r.expires_at      ?? undefined,
              readAt:         r.read_at         ?? undefined,
              respondedAt:    r.responded_at    ?? undefined,
              respondedBy:    r.responded_by    ?? undefined,
              parentNote:     r.parent_note     ?? undefined,
              attachmentUrl:  r.attachment_url  ?? undefined,
              assignedHelper: r.assigned_helper ?? undefined,
              rewardCoins:    r.reward_coins    ?? undefined,
              scheduledDate:  r.scheduled_date  ?? undefined,
              scheduledTime:  r.scheduled_time  ?? undefined,
              openToGP:       r.open_to_gp      ?? false,
            };
            const local = localById.get(r.id);
            // A local response newer than what the DB has means our upsert
            // for it likely hasn't landed yet — keep the local version.
            if (local?.respondedAt && (!fromDb.respondedAt || local.respondedAt > fromDb.respondedAt)) {
              return local;
            }
            return fromDb;
          });
          set({ requests, loaded: true });
          save(requests);
          ensureRealtime(familyId, set, get);
          return;
        }
      }
    } catch { /* network unavailable — fall through to local cache */ }

    // Offline fallback: local AsyncStorage cache (no seed data — empty is correct)
    set({ requests: [...localById.values()], loaded: true });
  },

  sendRequest: (req) => {
    const request: KidRequest = {
      ...req,
      id:          generateId(),
      urgency:     req.urgency ?? (req.type === 'emergency' ? 'emergency' : 'normal'),
      requestedAt: new Date().toISOString(),
      status:      'pending',
    };
    const all = [request, ...get().requests];
    set({ requests: all }); save(all);
    upsertToDb(request);
    // Notify parents/seniors of new request
    notifyKidRequest(request.fromMemberId, 'kid_request', {
      requestId: request.id, requestType: request.type, detail: request.detail,
      urgency: request.urgency, fromMemberId: request.fromMemberId,
      location: request.location, scheduledDate: request.scheduledDate,
      scheduledTime: request.scheduledTime,
    });
    return request;
  },

  approveRequest: (id, respondedBy, note) => {
    const req = get().requests.find(r => r.id === id);
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'approved' as RequestStatus, respondedAt: new Date().toISOString(), respondedBy, parentNote: note } : r
    );
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === id); if (updated) upsertToDb(updated);
    if (req) notifyKidRequest(req.fromMemberId, 'kid_request_decision', {
      requestId: id, requestType: req.type, detail: req.detail,
      decision: 'approved', note, fromMemberId: req.fromMemberId,
    });
  },

  declineRequest: (id, respondedBy, note) => {
    const req = get().requests.find(r => r.id === id);
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'declined' as RequestStatus, respondedAt: new Date().toISOString(), respondedBy, parentNote: note } : r
    );
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === id); if (updated) upsertToDb(updated);
    if (req) notifyKidRequest(req.fromMemberId, 'kid_request_decision', {
      requestId: id, requestType: req.type, detail: req.detail,
      decision: 'declined', note, fromMemberId: req.fromMemberId,
    });
  },

  assignRequest: (id, helperId, note) => {
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'approved' as RequestStatus, assignedHelper: helperId, respondedAt: new Date().toISOString(), respondedBy: helperId, parentNote: note } : r
    );
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === id); if (updated) upsertToDb(updated);
  },

  completeRequest: (id, respondedBy) => {
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'completed' as RequestStatus, respondedAt: new Date().toISOString(), respondedBy } : r
    );
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === id); if (updated) upsertToDb(updated);
  },

  cancelRequest: (id) => {
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'cancelled' as RequestStatus } : r
    );
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === id); if (updated) upsertToDb(updated);
  },

  toggleGPWelcome: (id, value) => {
    const all = get().requests.map(r => r.id === id ? { ...r, openToGP: value } : r);
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === id); if (updated) upsertToDb(updated);
  },

  markRead: (id) => {
    const already = get().requests.find(r => r.id === id);
    if (already?.readAt) return;
    const all = get().requests.map(r =>
      r.id === id ? { ...r, readAt: new Date().toISOString() } : r
    );
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === id); if (updated) upsertToDb(updated);
  },

  deleteRequest: (id) => {
    const all = get().requests.filter(r => r.id !== id);
    set({ requests: all }); save(all);
    deleteFromDb(id);
  },

  approveItems: (requestId, itemIds, approvedBy, note) => {
    const now = new Date().toISOString();
    const idSet = new Set(itemIds);
    const all = get().requests.map(r => {
      if (r.id !== requestId || !r.items) return r;
      const items = r.items.map(it =>
        idSet.has(it.id) ? { ...it, status: 'approved' as ItemStatus, approvedBy, parentNote: note, approvedAt: now } : it
      );
      const allDone = items.every(it => it.status !== 'pending');
      const allApproved = items.every(it => it.status === 'approved');
      const allRejected = items.every(it => it.status === 'rejected');
      const status: RequestStatus = allDone ? (allApproved ? 'approved' : allRejected ? 'declined' : 'partial') : 'pending';
      return { ...r, items, status, respondedAt: now, respondedBy: approvedBy };
    });
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === requestId); if (updated) upsertToDb(updated);
  },

  rejectItems: (requestId, itemIds, rejectedBy, note) => {
    const now = new Date().toISOString();
    const idSet = new Set(itemIds);
    const all = get().requests.map(r => {
      if (r.id !== requestId || !r.items) return r;
      const items = r.items.map(it =>
        idSet.has(it.id) ? { ...it, status: 'rejected' as ItemStatus, rejectedBy, parentNote: note, rejectedAt: now } : it
      );
      const allDone = items.every(it => it.status !== 'pending');
      const allApproved = items.every(it => it.status === 'approved');
      const allRejected = items.every(it => it.status === 'rejected');
      const status: RequestStatus = allDone ? (allApproved ? 'approved' : allRejected ? 'declined' : 'partial') : 'pending';
      return { ...r, items, status, respondedAt: now, respondedBy: rejectedBy };
    });
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === requestId); if (updated) upsertToDb(updated);
  },

  approveAllItems: (requestId, approvedBy, note) => {
    const req = get().requests.find(r => r.id === requestId);
    if (!req?.items) return;
    const pendingIds = req.items.filter(it => it.status === 'pending').map(it => it.id);
    get().approveItems(requestId, pendingIds, approvedBy, note);
  },

  rejectAllItems: (requestId, rejectedBy, note) => {
    const req = get().requests.find(r => r.id === requestId);
    if (!req?.items) return;
    const pendingIds = req.items.filter(it => it.status === 'pending').map(it => it.id);
    get().rejectItems(requestId, pendingIds, rejectedBy, note);
  },

  appendItems: (requestId, newItems) => {
    const all = get().requests.map(r =>
      r.id !== requestId ? r : { ...r, items: [...(r.items ?? []), ...newItems] }
    );
    set({ requests: all }); save(all);
    const updated = all.find(r => r.id === requestId); if (updated) upsertToDb(updated);
  },

  clearResolved: () => {
    const all = get().requests.filter(r => r.status === 'pending');
    set({ requests: all }); save(all);
  },

  expireStale: () => {
    const now = new Date().toISOString();
    const all = get().requests.map(r =>
      r.status === 'pending' && r.expiresAt && r.expiresAt < now
        ? { ...r, status: 'expired' as RequestStatus }
        : r
    );
    set({ requests: all }); save(all);
  },

  // ─── Selectors ───────────────────────────────────────────────────────────────

  getPending:     () => get().requests.filter(r => r.status === 'pending'),
  getForMember:   (memberId) => get().requests.filter(r => r.fromMemberId === memberId),
  getUnread:      () => get().requests.filter(r => r.status === 'pending' && !r.readAt),
  getByType:      (type) => get().requests.filter(r => r.type === type),
}));
