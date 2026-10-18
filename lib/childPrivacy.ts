/**
 * Children's privacy. A child cannot consent for themselves to location sharing or to their messages going to an AI provider:
 * a parent grants it (child_consents table). Adults and teens (13+) consent for themselves, as before.
 */
import { supabase } from './supabase';
import { hasLocationConsent } from './locationConsent';
import { useFamilyStore } from '@/store/familyStore';

export type ChildConsentKind = 'ai' | 'location';

/** A "kid" or "child" role, or anyone whose date of birth makes them under 13. */
export function isChildMember(m: { role?: string; dateOfBirth?: string | null } | undefined | null): boolean {
  if (!m) return false;
  if (m.role === 'kid' || m.role === 'child') return true;
  if (m.role === 'parent' || m.role === 'grandparent' || m.role === 'senior') return false;
  if (m.dateOfBirth) {
    const dob = new Date(m.dateOfBirth + 'T12:00:00');
    if (!Number.isNaN(dob.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
      return age < 13;
    }
  }
  return false;
}

export function memberById(memberId: string) {
  return useFamilyStore.getState().members.find(m => m.id === memberId);
}

export async function hasChildConsent(memberId: string, kind: ChildConsentKind): Promise<boolean> {
  try {
    const { data } = await supabase.from('child_consents').select('id').eq('member_id', memberId).eq('kind', kind).maybeSingle();
    return !!data;
  } catch { return false; }
}

export async function setChildConsent(parentId: string, familyId: string, memberId: string, kind: ChildConsentKind, on: boolean): Promise<boolean> {
  try {
    if (on) {
      const { error } = await supabase.from('child_consents').upsert(
        { member_id: memberId, family_id: familyId, kind, granted_by: parentId, granted_at: new Date().toISOString() },
        { onConflict: 'member_id,kind' });
      return !error;
    }
    const { error } = await supabase.from('child_consents').delete().eq('member_id', memberId).eq('kind', kind);
    return !error;
  } catch { return false; }
}

/** May this person's location be shared from this device right now? Children need a parent's consent; everyone else their own. */
export async function canShareLocation(memberId: string): Promise<boolean> {
  const m = memberById(memberId);
  if (isChildMember(m)) return hasChildConsent(memberId, 'location');
  return hasLocationConsent(memberId);
}
