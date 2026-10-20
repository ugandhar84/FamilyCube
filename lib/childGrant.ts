/**
 * childGrant — when a parent switches into a kid/teen profile that has its own login, the server needs a per-device grant for that child
 * (normally issued by the child's PIN check). A parent gets one from parent_grant_child_session instead, so no PIN is asked.
 */
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/chatCrypto';
import { useFamilyStore } from '@/store/familyStore';

/** Call right BEFORE setActiveMember(childId). Returns false if the server refused (the caller may then fall back to the PIN). */
export async function grantChildSessionForParent(childId: string): Promise<boolean> {
  try {
    const deviceId = await getDeviceId();
    const { data, error } = await supabase.rpc('parent_grant_child_session', { p_child_id: childId, ...(deviceId ? { p_device_id: deviceId } : {}) });
    if (error) { console.warn('[childGrant] refused', error.message); return false; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.grant_token) return false;
    useFamilyStore.getState().setActiveMemberGrant(childId, row.grant_token, row.grant_expires_at);
    return true;
  } catch (e: any) {
    console.warn('[childGrant] failed', e?.message);
    return false;
  }
}
