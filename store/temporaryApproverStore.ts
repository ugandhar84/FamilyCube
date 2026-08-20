/**
 * temporaryApproverStore — Scenarios 9.2/9.3: a bounded, explicit,
 * auto-expiring delegation of chore/quest APPROVAL authority to a
 * non-parent (typically Senior/GP, or a Teen) when the sole parent is
 * unreachable, or when GP is the only adult present while both parents
 * travel ("caregiver mode").
 *
 * Deliberately narrow: a grant gives approve/decline/review capability
 * ONLY (via choreStore's canApprove()/isTemporaryApprover-aware gates) —
 * never full parent role, never member-management/settings access, never
 * financial-threshold overrides (1.13's teen reward co-sign, 4.7's
 * reversal co-sign, redemption approval thresholds are all untouched by
 * this grant). A grant with no expires_at in the future is simply not
 * active — nothing needs to "notice" expiry and revoke it, isActiveGrant()
 * is a pure point-in-time check evaluated on every read.
 *
 * Pattern mirrors kidRequestStore.ts: AsyncStorage cache + Supabase sync +
 * family-scoped realtime channel, so a grant/revoke made on one device is
 * live on every other device in the household immediately.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export interface TemporaryApproverGrant {
  id: string;
  familyId: string;
  grantedToMemberId: string;
  grantedByMemberId: string;
  expiresAt: string;      // ISO — grant is active iff now < expiresAt AND revokedAt is unset
  createdAt: string;
  revokedAt?: string;     // explicit early revoke (spec 9.3's "Revoke Early")
}

const genId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const KEY = '@familycube_temporary_approvers_v1';
const save = (grants: TemporaryApproverGrant[]) => AsyncStorage.setItem(KEY, JSON.stringify(grants));

const getFamilyId = (): string | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useFamilyStore } = require('@/store/familyStore');
    const state = useFamilyStore.getState();
    const active = state.members.find((m: any) => m.id === state.activeMemberId) ?? state.members[0];
    return (active as any)?.familyId ?? null;
  } catch { return null; }
};

function rowToGrant(r: any): TemporaryApproverGrant {
  return {
    id:                 String(r.id),
    familyId:           r.family_id,
    grantedToMemberId:  r.granted_to_member_id,
    grantedByMemberId:  r.granted_by_member_id,
    expiresAt:          r.expires_at,
    createdAt:          r.created_at,
    revokedAt:          r.revoked_at ?? undefined,
  };
}

let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';

function ensureRealtime(familyId: string, setState: (s: Partial<TemporaryApproverState>) => void, getState: () => TemporaryApproverState) {
  if (_rtFamilyId === familyId && _rtChannel) return;
  if (_rtChannel) { supabase.removeChannel(_rtChannel); _rtChannel = null; }
  const staleTopic = `realtime:temporary_approvers:${familyId}`;
  supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));
  _rtFamilyId = familyId;

  try {
    _rtChannel = supabase
      .channel(`temporary_approvers:${familyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'temporary_approvers', filter: `family_id=eq.${familyId}`,
      }, ({ eventType, new: newRow, old: oldRow }) => {
        const state = getState();
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          const grant = rowToGrant(newRow);
          const exists = state.grants.some(g => g.id === grant.id);
          const all = exists ? state.grants.map(g => g.id === grant.id ? grant : g) : [grant, ...state.grants];
          setState({ grants: all }); save(all);
        } else if (eventType === 'DELETE') {
          const all = state.grants.filter(g => g.id !== String((oldRow as any).id));
          setState({ grants: all }); save(all);
        }
      })
      .subscribe();
  } catch (e: any) {
    console.warn('[temporaryApproverStore] ensureRealtime subscribe failed', e?.message ?? e);
  }
}

interface TemporaryApproverState {
  grants: TemporaryApproverGrant[];
  loaded: boolean;

  loadFromStorage: () => Promise<void>;

  // Grants approve/decline/review capability to grantedToMemberId until
  // expiresAt. Any prior still-active grant to the SAME member is
  // superseded (revoked) rather than stacking multiple overlapping grants.
  grantTemporaryApprover: (grantedToMemberId: string, grantedByMemberId: string, expiresAt: string) => void;
  revokeTemporaryApprover: (grantId: string) => void;

  // Point-in-time check — true iff memberId holds a currently-active
  // (not expired, not revoked) grant. This is the ONLY function outside
  // this file that should be treated as the source of truth for "does this
  // non-parent currently have approval authority" — choreStore.canApprove()
  // calls this directly rather than re-deriving grant logic itself.
  isActiveApprover: (memberId: string) => boolean;
  getActiveGrantFor: (memberId: string) => TemporaryApproverGrant | undefined;
  getActiveGrantsForFamily: () => TemporaryApproverGrant[];
}

export const useTemporaryApproverStore = create<TemporaryApproverState>((set, get) => ({
  grants: [],
  loaded: false,

  loadFromStorage: async () => {
    let local: TemporaryApproverGrant[] = [];
    try {
      const raw = await AsyncStorage.getItem(KEY);
      local = raw ? JSON.parse(raw) : [];
    } catch { /* no local cache yet */ }

    try {
      const familyId = getFamilyId();
      if (familyId) {
        const { data: rows, error } = await supabase
          .from('temporary_approvers')
          .select('*')
          .eq('family_id', familyId)
          .order('created_at', { ascending: false });
        if (!error) {
          const grants = (rows ?? []).map(rowToGrant);
          set({ grants, loaded: true });
          save(grants);
          ensureRealtime(familyId, set, get);
          return;
        }
      }
    } catch { /* offline — fall through to local cache */ }

    set({ grants: local, loaded: true });
  },

  grantTemporaryApprover: (grantedToMemberId, grantedByMemberId, expiresAt) => {
    const familyId = getFamilyId();
    if (!familyId) return;
    const now = new Date().toISOString();

    // Supersede any prior still-active grant to the same member instead of
    // letting grants silently stack — one active grant per member at a time.
    const supersededIds = get().grants
      .filter(g => g.grantedToMemberId === grantedToMemberId && !g.revokedAt && g.expiresAt > now)
      .map(g => g.id);

    const grant: TemporaryApproverGrant = {
      id: genId(), familyId, grantedToMemberId, grantedByMemberId, expiresAt, createdAt: now,
    };

    const all = [grant, ...get().grants.map(g => supersededIds.includes(g.id) ? { ...g, revokedAt: now } : g)];
    set({ grants: all }); save(all);

    supabase.from('temporary_approvers').insert({
      id: grant.id, family_id: familyId,
      granted_to_member_id: grantedToMemberId, granted_by_member_id: grantedByMemberId,
      expires_at: expiresAt, created_at: now,
    }).then(({ error }) => { if (error) console.warn('[temporaryApproverStore] insert failed', error.message); });

    for (const id of supersededIds) {
      supabase.from('temporary_approvers').update({ revoked_at: now }).eq('id', id)
        .then(({ error }) => { if (error) console.warn('[temporaryApproverStore] supersede failed', error.message); });
    }

    try {
      const { useChatStore } = require('./chatStore');
      const untilLabel = new Date(expiresAt).toLocaleString();
      useChatStore.getState().sendMessage(grantedToMemberId, grantedByMemberId,
        `🔑 You've been granted temporary approval access until ${untilLabel} — you can approve/decline routine chore submissions until then.`);
    } catch (e) {
      console.warn('[temporaryApproverStore] grant notification failed', e);
    }
  },

  revokeTemporaryApprover: (grantId) => {
    const now = new Date().toISOString();
    const grant = get().grants.find(g => g.id === grantId);
    const all = get().grants.map(g => g.id === grantId ? { ...g, revokedAt: now } : g);
    set({ grants: all }); save(all);
    supabase.from('temporary_approvers').update({ revoked_at: now }).eq('id', grantId)
      .then(({ error }) => { if (error) console.warn('[temporaryApproverStore] revoke failed', error.message); });

    try {
      const { useChatStore } = require('./chatStore');
      if (grant) {
        useChatStore.getState().sendMessage(grant.grantedToMemberId, grant.grantedByMemberId,
          `🔒 Your temporary approval access was ended early.`);
      }
    } catch (e) {
      console.warn('[temporaryApproverStore] revoke notification failed', e);
    }
  },

  isActiveApprover: (memberId) => !!get().getActiveGrantFor(memberId),

  getActiveGrantFor: (memberId) => {
    const now = new Date().toISOString();
    return get().grants.find(g => g.grantedToMemberId === memberId && !g.revokedAt && g.expiresAt > now);
  },

  getActiveGrantsForFamily: () => {
    const now = new Date().toISOString();
    return get().grants.filter(g => !g.revokedAt && g.expiresAt > now);
  },
}));
