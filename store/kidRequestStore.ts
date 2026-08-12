/**
 * kidRequestStore — real-time kid → parent requests.
 * Types: ride, tutor, cheer, emergency, question, permission, appointment
 * Status lifecycle: pending → approved | declined | cancelled | expired
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type RequestType   = 'ride' | 'tutor' | 'cheer' | 'emergency' | 'question' | 'permission' | 'appointment' | 'delegation' | 'checkin' | 'medication';
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired' | 'completed';
export type RequestUrgency = 'normal' | 'soon' | 'urgent' | 'emergency';

export interface KidRequest {
  id:             string;
  type:           RequestType;
  urgency:        RequestUrgency;
  fromMemberId:   string;     // kid who sent
  toMemberId?:    string;     // specific parent; undefined = broadcast to all
  detail:         string;     // "Soccer practice at 3:30 PM"
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
  markRead:        (id: string) => void;
  deleteRequest:   (id: string) => void;
  clearResolved:   () => void;
  expireStale:     () => void;

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

// ─── Store ────────────────────────────────────────────────────────────────────

export const useKidRequestStore = create<KidRequestState>((set, get) => ({
  requests: [],
  loaded:   false,

  loadFromStorage: async () => {
    try {
      const raw      = await AsyncStorage.getItem(KEY);
      const requests = raw ? (JSON.parse(raw) as KidRequest[]) : SEED_REQUESTS;
      if (!raw) save(SEED_REQUESTS);
      set({ requests, loaded: true });
    } catch {
      set({ requests: SEED_REQUESTS, loaded: true });
    }
  },

  sendRequest: (req) => {
    const request: KidRequest = {
      ...req,
      id:          'req-' + Date.now(),
      urgency:     req.urgency ?? (req.type === 'emergency' ? 'emergency' : 'normal'),
      requestedAt: new Date().toISOString(),
      status:      'pending',
    };
    const all = [request, ...get().requests];
    set({ requests: all }); save(all);
    return request;
  },

  approveRequest: (id, respondedBy, note) => {
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'approved' as RequestStatus, respondedAt: new Date().toISOString(), respondedBy, parentNote: note } : r
    );
    set({ requests: all }); save(all);
  },

  declineRequest: (id, respondedBy, note) => {
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'declined' as RequestStatus, respondedAt: new Date().toISOString(), respondedBy, parentNote: note } : r
    );
    set({ requests: all }); save(all);
  },

  assignRequest: (id, helperId, note) => {
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'approved' as RequestStatus, assignedHelper: helperId, respondedAt: new Date().toISOString(), respondedBy: helperId, parentNote: note } : r
    );
    set({ requests: all }); save(all);
  },

  completeRequest: (id, respondedBy) => {
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'completed' as RequestStatus, respondedAt: new Date().toISOString(), respondedBy } : r
    );
    set({ requests: all }); save(all);
  },

  cancelRequest: (id) => {
    const all = get().requests.map(r =>
      r.id === id ? { ...r, status: 'cancelled' as RequestStatus } : r
    );
    set({ requests: all }); save(all);
  },

  markRead: (id) => {
    const already = get().requests.find(r => r.id === id);
    if (already?.readAt) return;
    const all = get().requests.map(r =>
      r.id === id ? { ...r, readAt: new Date().toISOString() } : r
    );
    set({ requests: all }); save(all);
  },

  deleteRequest: (id) => {
    const all = get().requests.filter(r => r.id !== id);
    set({ requests: all }); save(all);
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
