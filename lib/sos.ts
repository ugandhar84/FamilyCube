/**
 * SOS actions shared by the grandparent's SOS card on the Hub and the SOS card in chat:
 *  - acceptSos: a parent accepts (takes) the SOS. Notifies the sender through the normal request decision.
 *  - resolveSos: the sender says "I'm OK now": closes the request, pushes to the whole family and posts a green card to the squad channel.
 */
import { supabase } from '@/lib/supabase';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useChatStore } from '@/store/chatStore';
import { useFamilyStore } from '@/store/familyStore';

export async function acceptSos(requestId: string, parentId: string): Promise<void> {
  await useKidRequestStore.getState().approveRequest(requestId, parentId);
}

export async function resolveSos(requestId: string, member: { id: string; name: string; familyId?: string }): Promise<void> {
  await useKidRequestStore.getState().cancelRequest(requestId);
  const first = member.name.split(' ')[0];
  const everyone = useFamilyStore.getState().members.filter(m => m.id !== member.id).map(m => m.id);
  supabase.functions.invoke('family-notifier', {
    body: { type: 'sos_safe', familyId: member.familyId, memberIds: everyone, persist: true, excludeMemberId: member.id, payload: { name: first, requestId } },
  }).catch(e => console.warn('[sos] sos_safe notify failed:', e?.message));
  useChatStore.getState().sendMessage('seniors_all', member.id, `✅ ${first} is OK now. The SOS is resolved.`, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    { type: 'sos_resolved', payload: { name: first, at: new Date().toISOString() } }, true);
}
