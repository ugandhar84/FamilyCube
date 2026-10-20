/**
 * kidRequestStore — real-time kid → parent requests.
 * Types: ride, tutor, cheer, emergency, question, permission, appointment, grocery, supplies
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
        // Same fix as choreStore.ts's/eventStore.ts's ensureRealtime — the
        // guard above only checks "does _rtChannel exist," never "is it
        // actually connected," so a socket killed by backgrounding left
        // _rtChannel non-null but dead forever, blocking every later
        // ensureRealtime() call from resubscribing. Clearing on a terminal
        // bad status makes the next call actually reconnect.
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[kidRequestStore] realtime kid_requests:${familyId} unhealthy (${status}) — clearing so the next sync resubscribes`);
          if (_rtFamilyId === familyId) { _rtChannel = null; _rtFamilyId = ''; }
        }
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

// Same lazy-require pattern as getFamilyId — choreStore.ts's memberName()
// equivalent, so assignRequest/completeRequest notifications can put a real
// name in "X assigned you" / "X marked your request done" copy instead of a
// raw id.
const memberRole = (memberId: string | undefined | null): string | undefined => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useFamilyStore } = require('@/store/familyStore');
    return useFamilyStore.getState().members.find((mm: any) => mm.id === memberId)?.role;
  } catch { return undefined; }
};

const memberName = (memberId: string | undefined | null): string => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useFamilyStore } = require('@/store/familyStore');
    const m = useFamilyStore.getState().members.find((mm: any) => mm.id === memberId);
    return m?.name ?? 'Someone';
  } catch { return 'Someone'; }
};

// ─── Domain types ─────────────────────────────────────────────────────────────

export type RequestType   = 'ride' | 'tutor' | 'cheer' | 'emergency' | 'question' | 'permission' | 'appointment' | 'delegation' | 'checkin' | 'medication' | 'quest_proposal' | 'grocery' | 'supplies';

// Auto-expire window for request types with no inherent urgency gate — a
// pending checkin/question a parent never acts on shouldn't sit forever.
// checkin: a time-sensitive status ping ("I'm ready for pickup") — stale
// after a few hours. question: open-ended, no urgency — longer grace
// period so a real question isn't dropped just because a parent was busy
// for a day. Other types keep their existing approve/decline-only
// lifecycle (no default here = never auto-expires).
const DEFAULT_EXPIRY_MS: Partial<Record<RequestType, number>> = {
  checkin:  3 * 60 * 60_000,       // 3 hours
  question: 36 * 60 * 60_000,      // 36 hours
};
export type RequestEventType = 'created' | 'approved' | 'declined' | 'assigned' | 'reassigned' | 'completed' | 'cancelled' | 'gp_toggled' | 'read' | 'items_approved' | 'items_rejected' | 'items_appended';

export interface KidRequestEvent {
  id:         string;
  requestId:  string;
  eventType:  RequestEventType;
  actorId:    string;
  note?:      string;
  meta?:      Record<string, unknown>;
  createdAt:  string;
}
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired' | 'completed' | 'partial';
export type RequestUrgency = 'normal' | 'soon' | 'urgent' | 'emergency';
export type ItemStatus = 'pending' | 'approved' | 'rejected';

// Per-item tracking for grocery/supplies multi-item requests
export interface KidRequestItem {
  id:          string;
  name:        string;
  qty:         string;
  category:    string;
  store?:      string;   // optional store preference, carried through to groceryStore.addItem on approval
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
  // Scenario 1.4 — a Kid proposing a new quest ("Can I wash the car for
  // 15 coins?"). detail holds the proposed title, rewardCoins the
  // proposed reward — both already existed on KidRequest for other
  // purposes (assignedHelper reward-tagging, appointment scheduling), so
  // this reuses them rather than adding new columns/fields.
  quest_proposal: { emoji: '🧩', label: 'Quest Idea',      color: '#9261C7', bgColor: '#F0E8FA' },
  grocery:     { emoji: '🛒', label: 'Grocery Run',        color: '#16A34A', bgColor: '#DCFCE7' },
  supplies:    { emoji: '📚', label: 'School Supplies',    color: '#0891B2', bgColor: '#E0F7FA' },
};

// ─── Store interface ──────────────────────────────────────────────────────────

interface KidRequestState {
  requests:  KidRequest[];
  loaded:    boolean;

  loadFromStorage: () => Promise<void>;

  sendRequest:     (req: Omit<KidRequest, 'id' | 'requestedAt' | 'status' | 'urgency'> & { urgency?: RequestUrgency }) => Promise<KidRequest>;
  approveRequest:  (id: string, respondedBy: string, note?: string) => Promise<void>;
  declineRequest:  (id: string, respondedBy: string, note?: string) => Promise<void>;
  assignRequest:   (id: string, helperId: string, note?: string, assignedBy?: string) => Promise<void>;
  completeRequest: (id: string, respondedBy: string, note?: string) => Promise<void>;
  // Check-in ("I'm home!" / "Running Late") ack — distinct from
  // completeRequest: keeps status 'pending' (so it still reads as a live,
  // recent fact — not silently erased into history the instant a parent
  // taps "Got it") but stamps respondedAt/respondedBy so the request
  // leaves the Needs-You/Action-Needed queue right away. finalizeAckedCheckins
  // sweeps it into 'completed' once respondedAt is over an hour old.
  acknowledgeCheckin: (id: string, respondedBy: string, note?: string) => Promise<void>;
  // Sweeps two cases into 'completed' (History/All) once their respondedAt
  // is over an hour old: acknowledged-but-still-pending checkins
  // (acknowledgeCheckin keeps status 'pending' on purpose) and any
  // 'approved' request (approveRequest/assignRequest) — both get the same
  // one-hour grace window before leaving the active queue for good. Call on
  // an interval (app/_layout.tsx) and on app foreground; cheap no-op when
  // nothing qualifies.
  finalizeAckedCheckins: () => Promise<void>;
  cancelRequest:   (id: string) => Promise<void>;
  toggleGPWelcome: (id: string, value: boolean) => Promise<void>;
  markRead:        (id: string) => Promise<void>;
  deleteRequest:   (id: string) => Promise<void>;
  clearResolved:   () => void;
  expireStale:     () => Promise<void>;

  // Per-item approval for grocery/supplies requests
  approveItems:    (requestId: string, itemIds: string[], approvedBy: string, note?: string) => Promise<void>;
  rejectItems:     (requestId: string, itemIds: string[], rejectedBy: string, note?: string) => Promise<void>;
  approveAllItems: (requestId: string, approvedBy: string, note?: string) => Promise<void>;
  rejectAllItems:  (requestId: string, rejectedBy: string, note?: string) => Promise<void>;
  appendItems:     (requestId: string, newItems: KidRequestItem[]) => Promise<void>;

  // Selectors
  getPending:           () => KidRequest[];
  getForMember:         (memberId: string) => KidRequest[];
  getUnread:            () => KidRequest[];
  getByType:            (type: RequestType) => KidRequest[];

  getEventsForRequest: (requestId: string) => Promise<KidRequestEvent[]>;
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
async function upsertToDb(req: KidRequest): Promise<boolean> {
  try {
    const familyId = getFamilyId();
    if (!familyId) return false;
    const { error } = await supabase.from('kid_requests').upsert({
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
    if (error) { console.warn('[kidRequestStore] upsertToDb failed:', error.message); return false; }
    return true;
  } catch (e: any) {
    console.warn('[kidRequestStore] upsertToDb failed:', e?.message);
    return false;
  }
}

async function deleteFromDb(id: string): Promise<boolean> {
  const { error } = await supabase.from('kid_requests').delete().eq('id', id);
  if (error) { console.warn('[kidRequestStore] deleteFromDb failed:', error.message); return false; }
  return true;
}

const FLUSH_AFTER_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

// Kid requests accumulate as clutter — acknowledged (approved/declined/
// cancelled/expired/completed) or still-unacknowledged (pending), it
// doesn't matter which; after 15 days from requestedAt it's just noise in
// the inbox/history tabs. Fire-and-forget DB delete scoped to this family,
// run once per loadFromStorage — no separate cron/sweeper exists for this
// store, so "on load" is the natural cleanup point (mirrors this file's
// own 200-row cap comment above, same clutter concern, different fix).
async function flushOld(familyId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - FLUSH_AFTER_MS).toISOString();
    const { error } = await supabase
      .from('kid_requests')
      .delete()
      .eq('family_id', familyId)
      .lt('requested_at', cutoff);
    if (error) console.warn('[kidRequestStore] flushOld failed:', error.message);
  } catch (e: any) {
    console.warn('[kidRequestStore] flushOld failed:', e?.message);
  }
}

async function notifyKidRequest(
  fromMemberId: string,
  type: string,
  payload: Record<string, unknown>,
  excludeMemberId?: string,
) {
  try {
    const familyId = getFamilyId();
    if (!familyId) return;
    supabase.functions
      .invoke('family-notifier', { body: { type, familyId, payload, persist: true, excludeMemberId } })
      .catch(e => console.warn('[kidRequestStore] notify failed:', e?.message));
  } catch (e: any) {
    console.warn('[kidRequestStore] notify error:', e?.message);
  }
}

// Notify one specific member directly (bypasses the type-based auto-route —
// used for assignRequest's helper leg, where the recipient is neither "all
// parents" nor derivable from payload.memberId/fromMemberId the way
// kid_request_decision's kid-facing leg is).
async function notifyMember(memberId: string, type: string, payload: Record<string, unknown>) {
  try {
    const familyId = getFamilyId();
    if (!familyId || !memberId) return;
    supabase.functions
      .invoke('family-notifier', { body: { type, familyId, memberIds: [memberId], payload, persist: true } })
      .catch(e => console.warn('[kidRequestStore] notifyMember failed:', e?.message));
  } catch (e: any) {
    console.warn('[kidRequestStore] notifyMember error:', e?.message);
  }
}

// Append-only audit log — fire-and-forget like notifyKidRequest/notifyMember,
// since a slow/failed log insert must never block the real lifecycle action.
async function logEvent(
  requestId: string,
  eventType: RequestEventType,
  actorId: string,
  note?: string,
  meta?: Record<string, unknown>,
) {
  try {
    const familyId = getFamilyId();
    if (!familyId) return;
    supabase.from('kid_request_events').insert({
      request_id: requestId,
      family_id:  familyId,
      event_type: eventType,
      actor_id:   actorId,
      note:       note ?? null,
      meta:       meta ?? null,
    }).then(({ error }) => {
      if (error) console.warn('[kidRequestStore] logEvent failed:', error.message);
    });
  } catch (e: any) {
    console.warn('[kidRequestStore] logEvent error:', e?.message);
  }
}

async function getEventsForRequest(requestId: string): Promise<KidRequestEvent[]> {
  const { data, error } = await supabase
    .from('kid_request_events')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[kidRequestStore] getEventsForRequest failed:', error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id:        r.id,
    requestId: r.request_id,
    eventType: r.event_type,
    actorId:   r.actor_id,
    note:      r.note ?? undefined,
    meta:      r.meta ?? undefined,
    createdAt: r.created_at,
  }));
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
        // Unbounded before — every kid request ever made (ride, permission,
        // grocery, quest proposal, etc.), across a family's whole lifetime,
        // with no cleanup sweep to bound it. Capped same as the other
        // history-shaped store queries.
        const { data: rows, error } = await supabase
          .from('kid_requests')
          .select('*')
          .eq('family_id', familyId)
          .order('requested_at', { ascending: false })
          .limit(200);
        if (!error) {
          flushOld(familyId); // fire-and-forget — don't block this load on it
          const cutoff = Date.now() - FLUSH_AFTER_MS;
          // rows may be [] on a fresh family — that's valid, don't fall through to seed
          const requests: KidRequest[] = (rows ?? [])
            .filter((r: any) => new Date(r.requested_at).getTime() >= cutoff)
            .map((r: any) => {
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

  sendRequest: async (req) => {
    const defaultExpiryMs = DEFAULT_EXPIRY_MS[req.type];
    const request: KidRequest = {
      ...req,
      id:          generateId(),
      urgency:     req.urgency ?? (req.type === 'emergency' ? 'emergency' : 'normal'),
      requestedAt: new Date().toISOString(),
      status:      'pending',
      expiresAt:   req.expiresAt ?? (defaultExpiryMs ? new Date(Date.now() + defaultExpiryMs).toISOString() : undefined),
    };
    // DB-is-truth: await the write before adding it to local state — was
    // optimistic (added immediately, no rollback if the write failed).
    const ok = await upsertToDb(request);
    if (!ok) return request;
    const all = [request, ...get().requests];
    set({ requests: all }); save(all);
    // Notify parents/seniors of new request
    notifyKidRequest(request.fromMemberId, 'kid_request', {
      requestId: request.id, requestType: request.type, detail: request.detail,
      urgency: request.urgency, fromMemberId: request.fromMemberId, fromRole: memberRole(request.fromMemberId),
      location: request.location, scheduledDate: request.scheduledDate,
      scheduledTime: request.scheduledTime,
    });
    logEvent(request.id, 'created', request.fromMemberId);
    return request;
  },

  approveRequest: async (id, respondedBy, note) => {
    const req = get().requests.find(r => r.id === id);
    // Was: unconditionally rewrote status on every call, so a double-tap
    // (e.g. ServiceRequestCard's awardCoins/QuestProposalCard's addChore —
    // both un-guarded, plain-additive side effects the caller runs
    // alongside this) would re-approve an already-approved request instead
    // of being a no-op — the caller-side effects duplicated (double coin
    // award, duplicate chore) while nothing here caught it. Mirrors
    // deductCoins' own guard against double-spend for the same class of
    // race: only the FIRST approve/decline on a still-pending request
    // takes effect.
    if (!req || req.status !== 'pending') return;
    const updated: KidRequest = { ...req, status: 'approved', respondedAt: new Date().toISOString(), respondedBy, parentNote: note };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === id ? updated : r);
    set({ requests: all }); save(all);
    notifyKidRequest(req.fromMemberId, 'kid_request_decision', {
      requestId: id, requestType: req.type, detail: req.detail,
      decision: 'approved', note, fromMemberId: req.fromMemberId,
    });
    logEvent(id, 'approved', respondedBy, note);
  },

  declineRequest: async (id, respondedBy, note) => {
    const req = get().requests.find(r => r.id === id);
    if (!req || req.status !== 'pending') return;
    const updated: KidRequest = { ...req, status: 'declined', respondedAt: new Date().toISOString(), respondedBy, parentNote: note };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === id ? updated : r);
    set({ requests: all }); save(all);
    notifyKidRequest(req.fromMemberId, 'kid_request_decision', {
      requestId: id, requestType: req.type, detail: req.detail,
      decision: 'declined', note, fromMemberId: req.fromMemberId,
    });
    logEvent(id, 'declined', respondedBy, note);
  },

  assignRequest: async (id, helperId, note, assignedBy) => {
    const req = get().requests.find(r => r.id === id);
    if (!req) return;
    const updated: KidRequest = { ...req, status: 'approved', assignedHelper: helperId, respondedAt: new Date().toISOString(), respondedBy: helperId, parentNote: note };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === id ? updated : r);
    set({ requests: all }); save(all);
    // Kid learns their request is being handled — same "approved" copy
    // approveRequest already uses, since assignRequest IS the approval
    // path for requests that need a specific helper lined up.
    notifyKidRequest(req.fromMemberId, 'kid_request_decision', {
      requestId: id, requestType: req.type, detail: req.detail,
      decision: 'approved', note, fromMemberId: req.fromMemberId,
    });
    // The helper themselves only needs a separate ping when someone ELSE
    // volunteered them (doAssignHelper in HelpDispatchQueue.tsx) — a
    // self-assign (doSelfAssign / FamilyNeedsHandSection's "You're on it")
    // has assignedBy === helperId or omitted, and telling someone about
    // their own tap is noise.
    if (assignedBy && assignedBy !== helperId) {
      notifyMember(helperId, 'kid_request_helper_assigned', {
        requestId: id, requestType: req.type, detail: req.detail,
        byName: memberName(assignedBy), byMemberId: assignedBy, memberId: helperId, note,
      });
    }
    const wasAssigned = !!req.assignedHelper;
    logEvent(id, wasAssigned && req.assignedHelper !== helperId ? 'reassigned' : 'assigned', assignedBy ?? helperId, note, { helperId });
  },

  completeRequest: async (id, respondedBy, note) => {
    const req = get().requests.find(r => r.id === id);
    if (!req) return;
    const updated: KidRequest = { ...req, status: 'completed', respondedAt: new Date().toISOString(), respondedBy, parentNote: note ?? req.parentNote };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === id ? updated : r);
    set({ requests: all }); save(all);
    // Kid learns their request was fulfilled — distinct from
    // kid_request_decision (approved/declined) since "completed" means the
    // helper actually finished the task, not just agreed to take it on.
    if (req.fromMemberId !== respondedBy) {
      notifyKidRequest(req.fromMemberId, 'kid_request_completed', {
        requestId: id, requestType: req.type, detail: req.detail,
        fromMemberId: req.fromMemberId, byMemberId: respondedBy, byName: memberName(respondedBy),
      });
    }
    logEvent(id, 'completed', respondedBy, note);
  },

  acknowledgeCheckin: async (id, respondedBy, note) => {
    const req = get().requests.find(r => r.id === id);
    if (!req || req.status !== 'pending') return;
    const updated: KidRequest = { ...req, respondedAt: new Date().toISOString(), respondedBy, parentNote: note ?? req.parentNote };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === id ? updated : r);
    set({ requests: all }); save(all);
    logEvent(id, 'approved', respondedBy, note);
  },

  finalizeAckedCheckins: async () => {
    const oneHourAgo = Date.now() - 3_600_000;
    // Checkins: acknowledgeCheckin stamps respondedAt but leaves status
    // 'pending' for an hour. Everything else: approveRequest/assignRequest
    // already set status 'approved' with its own respondedAt — "Approved"
    // also moves to History/All an hour after that same timestamp, same
    // one-hour grace window, just starting from a different status.
    const due = get().requests.filter(r =>
      r.respondedAt && new Date(r.respondedAt).getTime() < oneHourAgo &&
      ((r.type === 'checkin' && r.status === 'pending') || r.status === 'approved')
    );
    for (const req of due) {
      const updated: KidRequest = { ...req, status: 'completed' };
      const ok = await upsertToDb(updated);
      if (!ok) continue;
      const all = get().requests.map(r => r.id === req.id ? updated : r);
      set({ requests: all }); save(all);
      logEvent(req.id, 'completed', req.respondedBy ?? req.fromMemberId);
    }
  },

  cancelRequest: async (id) => {
    const req = get().requests.find(r => r.id === id);
    if (!req) return;
    const updated: KidRequest = { ...req, status: 'cancelled' };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === id ? updated : r);
    set({ requests: all }); save(all);
    logEvent(id, 'cancelled', req.fromMemberId);
  },

  toggleGPWelcome: async (id, value) => {
    const req = get().requests.find(r => r.id === id);
    if (!req) return;
    const updated: KidRequest = { ...req, openToGP: value };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === id ? updated : r);
    set({ requests: all }); save(all);
    logEvent(id, 'gp_toggled', req.respondedBy ?? req.fromMemberId, undefined, { value });
  },

  markRead: async (id) => {
    const req = get().requests.find(r => r.id === id);
    if (!req || req.readAt) return;
    const updated: KidRequest = { ...req, readAt: new Date().toISOString() };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === id ? updated : r);
    set({ requests: all }); save(all);
    logEvent(id, 'read', req.fromMemberId);
  },

  deleteRequest: async (id) => {
    const ok = await deleteFromDb(id);
    if (!ok) return;
    const all = get().requests.filter(r => r.id !== id);
    set({ requests: all }); save(all);
  },

  approveItems: async (requestId, itemIds, approvedBy, note) => {
    const now = new Date().toISOString();
    const idSet = new Set(itemIds);
    const before = get().requests.find(r => r.id === requestId);
    if (!before?.items) return;
    const items = before.items.map(it =>
      idSet.has(it.id) ? { ...it, status: 'approved' as ItemStatus, approvedBy, parentNote: note, approvedAt: now } : it
    );
    const allDone = items.every(it => it.status !== 'pending');
    const allApproved = items.every(it => it.status === 'approved');
    const allRejected = items.every(it => it.status === 'rejected');
    const status: RequestStatus = allDone ? (allApproved ? 'approved' : allRejected ? 'declined' : 'partial') : 'pending';
    const updated: KidRequest = { ...before, items, status, respondedAt: now, respondedBy: approvedBy };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === requestId ? updated : r);
    set({ requests: all }); save(all);
    // Kid learns which items got the green light — grocery/supplies items
    // approved individually rather than the whole request at once, so the
    // generic kid_request_decision copy ("Your request was approved!")
    // wouldn't tell them which items actually made it in.
    if (before.fromMemberId !== approvedBy) {
      const names = before.items.filter(it => idSet.has(it.id)).map(it => it.name);
      notifyKidRequest(before.fromMemberId, 'kid_request_items_decision', {
        requestId, requestType: before.type, detail: before.detail,
        decision: 'approved', itemNames: names, note, fromMemberId: before.fromMemberId,
      });
    }
    logEvent(requestId, 'items_approved', approvedBy, note, { itemIds });
  },

  rejectItems: async (requestId, itemIds, rejectedBy, note) => {
    const now = new Date().toISOString();
    const idSet = new Set(itemIds);
    const before = get().requests.find(r => r.id === requestId);
    if (!before?.items) return;
    const items = before.items.map(it =>
      idSet.has(it.id) ? { ...it, status: 'rejected' as ItemStatus, rejectedBy, parentNote: note, rejectedAt: now } : it
    );
    const allDone = items.every(it => it.status !== 'pending');
    const allApproved = items.every(it => it.status === 'approved');
    const allRejected = items.every(it => it.status === 'rejected');
    const status: RequestStatus = allDone ? (allApproved ? 'approved' : allRejected ? 'declined' : 'partial') : 'pending';
    const updated: KidRequest = { ...before, items, status, respondedAt: now, respondedBy: rejectedBy };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === requestId ? updated : r);
    set({ requests: all }); save(all);
    if (before.fromMemberId !== rejectedBy) {
      const names = before.items.filter(it => idSet.has(it.id)).map(it => it.name);
      notifyKidRequest(before.fromMemberId, 'kid_request_items_decision', {
        requestId, requestType: before.type, detail: before.detail,
        decision: 'rejected', itemNames: names, note, fromMemberId: before.fromMemberId,
      });
    }
    logEvent(requestId, 'items_rejected', rejectedBy, note, { itemIds });
  },

  approveAllItems: async (requestId, approvedBy, note) => {
    const req = get().requests.find(r => r.id === requestId);
    if (!req?.items) return;
    const pendingIds = req.items.filter(it => it.status === 'pending').map(it => it.id);
    await get().approveItems(requestId, pendingIds, approvedBy, note);
  },

  rejectAllItems: async (requestId, rejectedBy, note) => {
    const req = get().requests.find(r => r.id === requestId);
    if (!req?.items) return;
    const pendingIds = req.items.filter(it => it.status === 'pending').map(it => it.id);
    await get().rejectItems(requestId, pendingIds, rejectedBy, note);
  },

  appendItems: async (requestId, newItems) => {
    const req = get().requests.find(r => r.id === requestId);
    if (!req) return;
    const updated: KidRequest = { ...req, items: [...(req.items ?? []), ...newItems] };
    const ok = await upsertToDb(updated);
    if (!ok) return;
    const all = get().requests.map(r => r.id === requestId ? updated : r);
    set({ requests: all }); save(all);
    logEvent(requestId, 'items_appended', req.fromMemberId, undefined, { count: newItems.length });
  },

  clearResolved: () => {
    const all = get().requests.filter(r => r.status === 'pending');
    set({ requests: all }); save(all);
  },

  // Client-side lazy sweep — catches requests that went stale between
  // sweeper cron ticks (kid-request-expire-sweep runs hourly server-side;
  // this closes the gap on app open so the UI doesn't show a dead
  // checkin/question as "pending" for up to an hour after it expired).
  // Persists to DB like every other status transition in this store, not
  // just local state — was previously local-only, so a stale row would
  // un-expire itself on the next realtime/refetch from the DB.
  expireStale: async () => {
    const now = new Date().toISOString();
    const stale = get().requests.filter(r => r.status === 'pending' && r.expiresAt && r.expiresAt < now);
    if (stale.length === 0) return;
    const updates = stale.map(r => ({ ...r, status: 'expired' as RequestStatus }));
    await Promise.all(updates.map(u => upsertToDb(u)));
    const byId = new Map(updates.map(u => [u.id, u]));
    const all = get().requests.map(r => byId.get(r.id) ?? r);
    set({ requests: all }); save(all);
  },

  // ─── Selectors ───────────────────────────────────────────────────────────────

  getPending:     () => get().requests.filter(r => r.status === 'pending'),
  getForMember:   (memberId) => get().requests.filter(r => r.fromMemberId === memberId),
  getUnread:      () => get().requests.filter(r => r.status === 'pending' && !r.readAt),
  getByType:      (type) => get().requests.filter(r => r.type === type),

  getEventsForRequest: (requestId) => getEventsForRequest(requestId),
}));
