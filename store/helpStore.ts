/**
 * helpStore — family help-request lifecycle store.
 *
 * Status flow:
 *   pending → assigned → completed
 *          ↘ declined  → (kid can resubmit → new pending)
 *
 * Any member can create a request.
 * Parents/seniors can approve, assign, reassign, decline.
 * Kids can withdraw their own pending request.
 * Decline always records a reason (shown to requester).
 * Reassign records an optional note (shown in queue).
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type HelpCategory = 'Ride' | 'Homework' | 'Chore' | 'Childcare' | 'Errand' | 'Advice' | 'General';
export type HelpUrgency  = 'Low' | 'Medium' | 'High';
export type HelpStatus   = 'pending' | 'assigned' | 'completed' | 'declined' | 'withdrawn';
export type RideMode     = 'pickup' | 'dropoff' | 'roundtrip';

export interface HelpRequest {
  id:              string;
  requesterName:   string;
  requesterId:     string;
  /** If adult logged this on behalf of a kid, original requester is here */
  onBehalfOf?:     string;
  title:           string;
  description:     string;
  category:        HelpCategory;
  urgency:         HelpUrgency;
  status:          HelpStatus;
  /** Who is assigned to help (name) */
  assignedHelper?: string;
  /** Note added when approving or reassigning */
  helperNote?:     string;
  /** Reason recorded when declined */
  declineReason?:  string;
  /** Coins bounty — auto-set for Homework */
  rewardCoins?:    number;
  /** Preferred helper (optional, set by requester) */
  preferredHelper?: string;
  /** Scheduling fields */
  date?:           string;
  time?:           string;
  endTime?:        string;
  returnTime?:     string;
  rideMode?:       RideMode;
  fromLoc?:        string;
  toLoc?:          string;
  createdAt:       string;
  updatedAt:       string;
}

interface HelpState {
  requests: HelpRequest[];
  addRequest:     (r: Omit<HelpRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => string;
  assignRequest:  (id: string, helperName: string, note?: string) => void;
  declineRequest: (id: string, reason: string, declinedBy: string) => void;
  reassignRequest:(id: string, helperName: string, note?: string) => void;
  completeRequest:(id: string) => void;
  withdrawRequest:(id: string, requesterId: string) => void;
}

function uid() {
  return `hr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function now() { return new Date().toISOString(); }

export const useHelpStore = create<HelpState>()(
  persist(
    (set) => ({
      requests: [],

      addRequest: (r) => {
        const id = uid();
        const newReq: HelpRequest = {
          ...r,
          id,
          status:    'pending',
          rewardCoins: r.category === 'Homework' ? (r.rewardCoins ?? 20) : r.rewardCoins,
          createdAt: now(),
          updatedAt: now(),
        };
        set(s => ({ requests: [newReq, ...s.requests] }));
        return id;
      },

      assignRequest: (id, helperName, note) =>
        set(s => ({
          requests: s.requests.map(r =>
            r.id === id
              ? { ...r, status: 'assigned', assignedHelper: helperName, helperNote: note ?? r.helperNote, updatedAt: now() }
              : r
          ),
        })),

      declineRequest: (id, reason) =>
        set(s => ({
          requests: s.requests.map(r =>
            r.id === id
              ? { ...r, status: 'declined', declineReason: reason, updatedAt: now() }
              : r
          ),
        })),

      reassignRequest: (id, helperName, note) =>
        set(s => ({
          requests: s.requests.map(r =>
            r.id === id
              ? { ...r, assignedHelper: helperName, helperNote: note ?? '', updatedAt: now() }
              : r
          ),
        })),

      completeRequest: (id) =>
        set(s => ({
          requests: s.requests.map(r =>
            r.id === id ? { ...r, status: 'completed', updatedAt: now() } : r
          ),
        })),

      withdrawRequest: (id, requesterId) =>
        set(s => ({
          requests: s.requests.map(r =>
            r.id === id && r.requesterId === requesterId
              ? { ...r, status: 'withdrawn', updatedAt: now() }
              : r
          ),
        })),
    }),
    {
      name: '@familycube_help_v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
